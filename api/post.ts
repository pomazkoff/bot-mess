import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CHANNELS, type Channel } from "../lib/channels.js";
import { THREADS_TEXT_MAX } from "../lib/drafts.js";
import { manualHistoryItem, manualRedisKey } from "../lib/manual.js";
import type { Media } from "../lib/projects.js";
import { claimManualKey, deleteManualKey, getManualKey, pushHistory, setManualKey } from "../lib/store.js";
import { briefThreadsError, findRecentPostByText, postAlreadyPublished, publishPost } from "../lib/threads.js";

// Ручная публикация готового текста. Крон это не вызывает, модель текст не видит.
// Authorization: Bearer $CRON_SECRET, как у /api/cron и /api/repost.
// POST /api/post  { channel, text, imageUrl?, dry? }
// Черновики крона этот вызов не касаются: публикация явная. Пауза канала (paused) её останавливает.
// Общий стоп-кран и DRY_RUN сюда не входят.

function jsonBody(req: VercelRequest): Record<string, unknown> | null {
  const raw = req.body;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function imageUrlOf(value: unknown): { ok: true; url?: string } | { ok: false } {
  if (value == null || value === "") return { ok: true };
  if (typeof value !== "string" || !/^https:\/\/\S+$/.test(value)) return { ok: false };
  return { ok: true, url: value };
}

async function rememberHistory(channelId: string, projectId: string, text: string, postId: string, imageUrl?: string): Promise<boolean> {
  const item = manualHistoryItem({ channelId, projectId, text, postId, at: new Date().toISOString(), imageUrl });
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await pushHistory(item);
      return true;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  console.error("history", last);
  return false;
}

async function rememberExisting(channel: Channel, text: string, key: string, stored: string): Promise<string | null> {
  if (stored) return stored;
  const id = await findRecentPostByText(channel, text, null).catch((error) => {
    console.warn("поиск уже опубликованного текста не удался:", briefThreadsError(error));
    return null;
  });
  if (id) await setManualKey(key, id).catch((error) => console.error("manual key", briefThreadsError(error)));
  return id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "только POST" });

  const body = jsonBody(req);
  if (!body) return res.status(400).json({ error: "нужен JSON" });
  if (typeof body.channel !== "string" || !body.channel) return res.status(400).json({ error: "нужен channel" });
  if (typeof body.text !== "string") return res.status(400).json({ error: "нужен text" });
  const text = body.text;
  if (!text.trim()) return res.status(400).json({ error: "пустой текст", length: text.length });
  if (text.length > THREADS_TEXT_MAX) return res.status(400).json({ error: "длина больше 500", length: text.length });
  const image = imageUrlOf(body.imageUrl);
  if (!image.ok) return res.status(400).json({ error: "imageUrl — https-адрес" });

  const channel = CHANNELS.find((item) => item.id === body.channel);
  if (!channel) return res.status(400).json({ error: "неизвестный channel" });
  if (channel.paused) return res.json({ skipped: `${channel.id} paused` });
  if (body.dry === true) {
    return res.json({ dry: true, channel: channel.id, text, length: text.length, imageUrl: image.url });
  }

  const media: Media | undefined = image.url ? { type: "IMAGE", url: image.url } : undefined;
  const key = manualRedisKey(channel.id, text);
  let claimed = false;
  try {
    const stored = await getManualKey(key);
    if (stored !== null) {
      const id = await rememberExisting(channel, text, key, stored);
      return res.json({ skipped: "already posted", id });
    }

    const already = await findRecentPostByText(channel, text, null).catch((error) => {
      console.warn("поиск уже опубликованного текста не удался:", briefThreadsError(error));
      return null;
    });
    if (already) {
      await setManualKey(key, already).catch((error) => console.error("manual key", briefThreadsError(error)));
      return res.json({ skipped: "already posted", id: already });
    }

    claimed = await claimManualKey(key);
    if (!claimed) {
      const raced = (await getManualKey(key)) ?? "";
      const id = await rememberExisting(channel, text, key, raced);
      return res.json({ skipped: "already posted", id });
    }

    let postId: string;
    try {
      postId = (await publishPost(channel, text, undefined, media)).id;
    } catch (error) {
      if (!postAlreadyPublished(error)) throw error;
      const recovered = await findRecentPostByText(channel, text, null).catch(() => null);
      if (!recovered) throw error;
      postId = recovered;
    }

    await setManualKey(key, postId).catch((error) => console.error("manual key", briefThreadsError(error)));
    const projectId = channel.projects[0];
    const history = projectId
      ? await rememberHistory(channel.id, projectId, text, postId, media?.url)
      : false;
    return res.json({ posted: true, channel: channel.id, id: postId, text, length: text.length, history });
  } catch (error) {
    if (claimed && !postAlreadyPublished(error)) {
      await deleteManualKey(key).catch((releaseError) => console.error("manual release", briefThreadsError(releaseError)));
    }
    const message = briefThreadsError(error);
    console.error(message);
    return res.status(500).json({ error: message });
  }
}
