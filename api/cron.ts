import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appStorePromoOpen, makeDraft, mskDay } from "../lib/run.js";
import { OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_RUBRIC, OLOID_APP_STORE_RUBRIC } from "../lib/projects.js";
import { postAlreadyPublished, publishPost } from "../lib/threads.js";
import { getAppStoreCodesUsed, getAppStoreDay, getHistory, getLastProject, markAppStoreCodeUsed, pushHistory, setAppStoreDay, setLastProject } from "../lib/store.js";
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
  // Пауза отдельного аккаунта: PAUSED_<ID>=1 (например, PAUSED_OLOID), общая пауза — PAUSED.
  // Кодовый выключатель channel.paused (сейчас @pomazkof): слот пропускается так же, без Telegram.
  // Снять — убрать paused у канала в lib/channels.ts и задеплоить.
  const channelPause = `PAUSED_${channel.id.toUpperCase()}`;
  if (process.env[channelPause]?.trim() === "1") return res.json({ skipped: `${channelPause}=1` });
  if (channel.paused) return res.json({ skipped: `${channel.id} paused` });
  // Аккаунт ещё не подключён — молча пропускаем, чтобы не слать ошибки в Telegram на каждом слоте
  if (!process.env[channel.tokenEnv]?.trim()) return res.json({ skipped: `нет ${channel.tokenEnv}` });

  const dry = req.query.dry === "1" || process.env.DRY_RUN?.trim() === "1";
  const now = new Date();

  try {
    const history = await getHistory();
    // null — App Store-поста ещё не было. Дата пишется ниже, только после успешной публикации.
    const dailyDoneDate = channel.projects.includes("oloid") ? await getAppStoreDay("oloid") : null;
    const usedAppStoreCodes = channel.projects.includes("oloid") ? await getAppStoreCodesUsed("oloid", OLOID_APP_STORE_CODES) : [];
    const draft = await makeDraft({
      channel,
      history,
      lastProject: await getLastProject(channel),
      forcedProject: typeof req.query.project === "string" ? req.query.project : undefined,
      now,
      dailyDoneDate,
      usedAppStoreCodes,
    });
    const { project, rubricId, topic, topicTag, media, text, rejected, promoCode, promoLeft } = draft;
    const where = `${channel.name} · ${project.name}`;

    if (!text) {
      if (!dry) await notify(`⚠️ Threads-бот (${where}): ни один вариант не прошёл проверки, пост пропущен.\n\n${rejected.join("\n\n")}`);
      return res.json({ posted: false, channel: channel.id, project: project.id, rejected });
    }
    if (dry) return res.json({ dry: true, channel: channel.id, project: project.id, rubric: rubricId, topic, topicTag, media: media?.url, promoCode, promoLeft, text, rejected });

    // После promoUntil код в Threads не публикуем, даже если генерация его собрала. В отчёт код не кладём.
    if (promoCode && !appStorePromoOpen(now)) {
      await notify(`⚠️ Threads-бот (${where}): раздача кодов App Store закрыта, пост с кодом не опубликован.`);
      return res.json({ posted: false, channel: channel.id, project: project.id, rubric: rubricId, rejected: ["раздача кодов App Store закрыта"] });
    }

    // Картинка — украшение: если Threads её не принял, публикуем текст без неё. Видео (трейлер) без файла не публикуем.
    let used = media;
    const postId = await publishPost(channel, text, topicTag, media).catch(async (e) => {
      // Картинка не прошла — постим текст. Если контейнер уже опубликован, второй пост не создаём.
      if (media?.type !== "IMAGE" || postAlreadyPublished(e)) throw e;
      await notify(`⚠️ ${where}: картинка не прошла (${e?.message ?? e}), публикую пост без неё.`);
      used = undefined;
      return publishPost(channel, text, topicTag);
    });
    // День и код закрываем сразу после публикации, до истории: сбой записи в ленту не должен выдать код ещё раз.
    const appStoreSlot = rubricId === OLOID_APP_STORE_RUBRIC || rubricId === OLOID_APP_STORE_PROMO_RUBRIC;
    if (project.dailyRubric && appStoreSlot) await setAppStoreDay(project.id, mskDay(now));
    if (promoCode) await markAppStoreCodeUsed(project.id, promoCode);
    await pushHistory({ channel: channel.id, project: project.id, rubric: rubricId, topic, topicTag, text, media: used?.url, postId, at: now.toISOString() });
    await setLastProject(channel, project.id);
    const promoLine = promoCode != null ? `\nПромокод: ${promoCode}. Осталось: ${promoLeft ?? 0}` : "";
    await notify(`✅ Опубликовано (${where}, ${rubricId}${used ? (used.type === "VIDEO" ? ", с видео" : ", с картинкой") : ""}):${topic ? `\nТема: ${topic}` : ""}${topicTag ? `\nТема Threads: ${topicTag}` : ""}${promoLine}\n\n${text}`);
    return res.json({ posted: true, channel: channel.id, project: project.id, rubric: rubricId, topic, media: used?.url, promoCode, promoLeft, postId, text });
  } catch (e: any) {
    console.error(e);
    await notify(`❌ Threads-бот упал (${channel.name}): ${e?.message ?? e}`);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
