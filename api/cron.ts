import type { VercelRequest, VercelResponse } from "@vercel/node";
import { makeDraft } from "../lib/run.js";
import { publishPost } from "../lib/threads.js";
import { getHistory, pushHistory, getLastProject, setLastProject } from "../lib/store.js";
import { notify } from "../lib/notify.js";
import { channelById } from "../lib/channels.js";

// Публикующий эндпоинт. Вызывается только Vercel Cron (заголовок Authorization: Bearer <CRON_SECRET>).
// ?channel=<id> — аккаунт Threads из lib/channels.ts (по умолчанию pomazkof).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (process.env.PAUSED?.trim() === "1") return res.json({ skipped: "PAUSED=1" });

  const channel = channelById(typeof req.query.channel === "string" ? req.query.channel : undefined);
  if (!channel) return res.status(400).json({ error: "неизвестный channel" });
  // Пауза отдельного аккаунта: PAUSED_<ID>=1 (например, PAUSED_OLOID), общая пауза — PAUSED
  const channelPause = `PAUSED_${channel.id.toUpperCase()}`;
  if (process.env[channelPause]?.trim() === "1") return res.json({ skipped: `${channelPause}=1` });
  // Аккаунт ещё не подключён — молча пропускаем, чтобы не слать ошибки в Telegram дважды в день
  if (!process.env[channel.tokenEnv]?.trim()) return res.json({ skipped: `нет ${channel.tokenEnv}` });

  const dry = req.query.dry === "1" || process.env.DRY_RUN?.trim() === "1";
  const now = new Date();

  try {
    const history = await getHistory();
    const draft = await makeDraft({
      channel,
      history,
      lastProject: await getLastProject(channel),
      forcedProject: typeof req.query.project === "string" ? req.query.project : undefined,
      now,
    });
    const { project, rubricId, topic, topicTag, media, text, rejected } = draft;
    const where = `${channel.name} · ${project.name}`;

    if (!text) {
      if (!dry) await notify(`⚠️ Threads-бот (${where}): ни один вариант не прошёл проверки, пост пропущен.\n\n${rejected.join("\n\n")}`);
      return res.json({ posted: false, channel: channel.id, project: project.id, rejected });
    }
    if (dry) return res.json({ dry: true, channel: channel.id, project: project.id, rubric: rubricId, topic, topicTag, media: media?.url, text, rejected });

    // Картинка — украшение: если Threads её не принял, публикуем текст без неё. Видео (трейлер) без файла не публикуем.
    let used = media;
    const postId = await publishPost(channel, text, topicTag, media).catch(async (e) => {
      if (media?.type !== "IMAGE") throw e;
      await notify(`⚠️ ${where}: картинка не прошла (${e?.message ?? e}), публикую пост без неё.`);
      used = undefined;
      return publishPost(channel, text, topicTag);
    });
    await pushHistory({ channel: channel.id, project: project.id, rubric: rubricId, topic, topicTag, text, media: used?.url, postId, at: now.toISOString() });
    await setLastProject(channel, project.id);
    await notify(`✅ Опубликовано (${where}, ${rubricId}${used ? (used.type === "VIDEO" ? ", с видео" : ", с картинкой") : ""}):${topic ? `\nТема: ${topic}` : ""}${topicTag ? `\nТема Threads: ${topicTag}` : ""}\n\n${text}`);
    return res.json({ posted: true, channel: channel.id, project: project.id, rubric: rubricId, topic, media: used?.url, postId, text });
  } catch (e: any) {
    console.error(e);
    await notify(`❌ Threads-бот упал (${channel.name}): ${e?.message ?? e}`);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
