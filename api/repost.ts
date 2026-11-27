import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CHANNELS } from "../lib/channels.js";
import {
  THREAD_LIST_FIELDS,
  normalizeThread,
  pickLatestPost,
  repostRedisKey,
  textStart,
  threadsFromList,
  type ThreadListItem,
} from "../lib/repost.js";
import { claimRepostKey, deleteRepostKey, setRepostKey } from "../lib/store.js";
import { briefThreadsError, ensureFreshToken } from "../lib/threads.js";

// Ручной репост поста одного канала в другой. Крон это не вызывает.
// Authorization: Bearer $CRON_SECRET, как у /api/cron.
// GET /api/repost?from=pomazkof&to=oloid[&id=<media id>][&dry=1]
// Репост: POST https://graph.threads.net/v1.0/{media_id}/repost
// Права токена канала to: threads_basic и threads_content_publish (документация Meta, Reposts, ноябрь 2026).
// Флаг паузы канала здесь не смотрим: посты источника читаются и когда публикация канала выключена.

const API = "https://graph.threads.net/v1.0";
const LIST_PAGES = 4;

type ThreadsJson = {
  id?: unknown;
  text?: unknown;
  permalink?: unknown;
  timestamp?: unknown;
  media_type?: unknown;
  is_reply?: unknown;
  error?: { message?: unknown; error_user_msg?: unknown; code?: unknown; error_subcode?: unknown };
  data?: unknown;
  paging?: { cursors?: { after?: unknown } };
};

function threadsErrorDetail(json: ThreadsJson, status: number): string {
  const err = json.error;
  if (!err || typeof err !== "object") return String(status);
  const message = String(err.message || status).trim();
  const user = typeof err.error_user_msg === "string" ? err.error_user_msg.trim() : "";
  const code = err.code != null ? `#${err.code}` : "";
  const sub = err.error_subcode != null ? `/${err.error_subcode}` : "";
  const bits = [message];
  if (user && user !== message) bits.push(user);
  if (code) bits.push(`(${code}${sub})`);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

async function call(method: "GET" | "POST", path: string, token: string, params: Record<string, string> = {}): Promise<ThreadsJson> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(method === "GET" ? `${API}${path}?${body}` : `${API}${path}`, {
    method,
    body: method === "POST" ? body : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as ThreadsJson;
  if (!res.ok || json.error) throw new Error(`Threads ${path}: ${threadsErrorDetail(json, res.status)}`);
  return json;
}

function nextCursor(json: ThreadsJson): string | undefined {
  const after = json.paging?.cursors?.after;
  return typeof after === "string" && after ? after : undefined;
}

async function latestOwnPost(token: string): Promise<ThreadListItem | null> {
  let after = "";
  for (let page = 0; page < LIST_PAGES; page++) {
    const params: Record<string, string> = { fields: THREAD_LIST_FIELDS, limit: "25" };
    if (after) params.after = after;
    const json = await call("GET", "/me/threads", token, params);
    const hit = pickLatestPost(threadsFromList(json));
    if (hit) return hit;
    const cursor = nextCursor(json);
    if (!cursor || cursor === after) return null;
    after = cursor;
  }
  return null;
}

async function postById(token: string, id: string): Promise<ThreadListItem> {
  const json = await call("GET", `/${id}`, token, { fields: THREAD_LIST_FIELDS });
  const post = normalizeThread(json);
  if (!post) throw new Error(`Threads /${id}: ответ без id`);
  return post;
}

async function repostMedia(token: string, mediaId: string): Promise<string> {
  const json = await call("POST", `/${mediaId}/repost`, token);
  if (typeof json.id !== "string" && typeof json.id !== "number") throw new Error(`Threads /${mediaId}/repost: ответ без id`);
  const id = String(json.id);
  if (!/^\d{1,32}$/.test(id)) throw new Error(`Threads /${mediaId}/repost: ответ без id`);
  return id;
}

function postView(post: ThreadListItem) {
  return {
    id: post.id,
    permalink: post.permalink ?? null,
    timestamp: post.timestamp ?? null,
    text: textStart(post.text),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const fromId = typeof req.query.from === "string" ? req.query.from : "";
  const toId = typeof req.query.to === "string" ? req.query.to : "";
  if (!fromId || !toId) return res.status(400).json({ error: "нужны from и to" });
  const from = CHANNELS.find((channel) => channel.id === fromId);
  const to = CHANNELS.find((channel) => channel.id === toId);
  if (!from) return res.status(400).json({ error: "неизвестный from" });
  if (!to) return res.status(400).json({ error: "неизвестный to" });

  const rawId = req.query.id;
  if (rawId !== undefined && (typeof rawId !== "string" || !/^\d{1,32}$/.test(rawId))) {
    return res.status(400).json({ error: "плохой id" });
  }

  try {
    const sourceToken = await ensureFreshToken(from);
    const post = rawId ? await postById(sourceToken, rawId) : await latestOwnPost(sourceToken);
    if (!post) return res.status(404).json({ error: "у канала нет поста", from: from.id });
    const view = postView(post);
    if (req.query.dry === "1") return res.json({ dry: true, from: from.id, to: to.id, ...view });

    const key = repostRedisKey(to.id, post.id);
    if (!(await claimRepostKey(key))) return res.json({ skipped: "already reposted", from: from.id, to: to.id, id: post.id });
    try {
      const repostId = await repostMedia(await ensureFreshToken(to), post.id);
      await setRepostKey(key, repostId).catch((error) => console.error("repost key", briefThreadsError(error)));
      return res.json({ from: from.id, to: to.id, mediaId: post.id, id: repostId, permalink: view.permalink, timestamp: view.timestamp, text: view.text });
    } catch (error) {
      await deleteRepostKey(key).catch((releaseError) => console.error("repost release", briefThreadsError(releaseError)));
      throw error;
    }
  } catch (error) {
    const message = briefThreadsError(error);
    console.error(message);
    return res.status(500).json({ error: message });
  }
}
