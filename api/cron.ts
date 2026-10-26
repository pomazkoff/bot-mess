import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appStorePromoOpen, makeDraft, mskDay } from "../lib/run.js";
import { OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_RUBRIC, OLOID_APP_STORE_RUBRIC, OLOID_PROVOCATION_RUBRIC, OLOID_VKPLAY_RUBRIC } from "../lib/projects.js";
import { postAlreadyPublished, publishPost } from "../lib/threads.js";
import { OLOID_ASK_RUBRIC, isOloidRotationRubric } from "../lib/oloidRotation.js";
import { getAppStoreCodesUsed, getAppStoreDay, getHistory, getLastProject, getOloidRotationState, getProvocationDay, getProvocationState, getVkPlayDay, markAppStoreCodeUsed, pushHistory, saveOloidRotation, saveProvocation, setAppStoreDay, setLastProject, setProvocationDay, setVkPlayDay } from "../lib/store.js";
import { notify } from "../lib/notify.js";
import { channelById } from "../lib/channels.js";
import { publishDueScheduled } from "../lib/scheduled.js";

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
  // Кодовый выключатель channel.paused (сейчас @pomazkof) глушит только сгенерированные посты.
  // Заготовленный пост проверяется раньше и выходит даже при channel.paused.
  // Снять паузу генерации — убрать paused у канала в lib/channels.ts и задеплоить.
  const channelPause = `PAUSED_${channel.id.toUpperCase()}`;
  if (process.env[channelPause]?.trim() === "1") return res.json({ skipped: `${channelPause}=1` });

  const dry = req.query.dry === "1" || process.env.DRY_RUN?.trim() === "1";
  const now = new Date();
  try {
    const scheduled = await publishDueScheduled(channel, now, dry);
    if (scheduled.kind !== "none") {
      const id = scheduled.post.id;
      if (scheduled.kind === "dry") {
        return res.json({
          dry: true,
          scheduled: id,
          channel: channel.id,
          topicTag: scheduled.post.topicTag,
          media: scheduled.post.media.url,
          length: scheduled.post.text.length,
          text: scheduled.post.text,
        });
      }
      if (scheduled.kind === "locked") return res.json({ skipped: "scheduled lock", scheduled: id, channel: channel.id });
      if (scheduled.kind === "too-long") {
        await notify(`⚠️ Threads-бот (${channel.name}): запланированный пост ${id} не опубликован, длина ${scheduled.length} > 500.`);
        return res.json({ posted: false, scheduled: id, channel: channel.id, rejected: [`длина ${scheduled.length} > 500`] });
      }
      if (scheduled.kind === "failed") {
        await notify(`❌ Threads-бот упал (${channel.name}, запланированный пост ${id}): ${scheduled.error}`);
        return res.status(500).json({ error: scheduled.error, scheduled: id });
      }
      const mediaNote = scheduled.post.media.type === "VIDEO" ? ", с видео" : ", с картинкой";
      const tag = scheduled.post.topicTag ? `\nТема Threads: ${scheduled.post.topicTag}` : "";
      // В историю — чтобы пост попал в статистику. Рубрика scheduled не совпадает с рубриками генератора.
      await pushHistory({
        channel: channel.id,
        project: channel.projects[0] ?? "scheduled",
        rubric: "scheduled",
        topic: id,
        topicTag: scheduled.post.topicTag,
        text: scheduled.post.text,
        media: scheduled.post.media.url,
        postId: scheduled.postId,
        at: now.toISOString(),
      }).catch((e) => console.error("history", e));
      await notify(`✅ Опубликовано (запланированный пост, ${channel.name}, ${id}${mediaNote}):${tag}\n\n${scheduled.post.text}`);
      return res.json({
        posted: true,
        scheduled: id,
        channel: channel.id,
        topicTag: scheduled.post.topicTag,
        media: scheduled.post.media.url,
        postId: scheduled.postId,
        text: scheduled.post.text,
      });
    }
  } catch (e: any) {
    console.error(e);
    await notify(`❌ Threads-бот упал (${channel.name}, запланированный пост): ${e?.message ?? e}`);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }

  if (channel.paused) return res.json({ skipped: `${channel.id} paused` });
  // Аккаунт ещё не подключён — молча пропускаем, чтобы не слать ошибки в Telegram на каждом слоте
  if (!process.env[channel.tokenEnv]?.trim()) return res.json({ skipped: `нет ${channel.tokenEnv}` });

  try {
    const history = await getHistory();
    // null — App Store-поста ещё не было. Дата пишется ниже, только после успешной публикации.
    const dailyDoneDate = channel.projects.includes("oloid") ? await getAppStoreDay("oloid") : null;
    const secondDailyDoneDate = channel.projects.includes("oloid") ? await getVkPlayDay("oloid") : null;
    const provocationDoneDate = channel.projects.includes("oloid") ? await getProvocationDay("oloid") : null;
    const provocation = channel.projects.includes("oloid") ? await getProvocationState("oloid") : null;
    const usedAppStoreCodes = channel.projects.includes("oloid") ? await getAppStoreCodesUsed("oloid", OLOID_APP_STORE_CODES) : [];
    const rotation = channel.projects.includes("oloid") ? await getOloidRotationState("oloid") : null;
    const draft = await makeDraft({
      channel,
      history,
      lastProject: await getLastProject(channel),
      forcedProject: typeof req.query.project === "string" ? req.query.project : undefined,
      now,
      dailyDoneDate,
      secondDailyDoneDate,
      provocationDoneDate,
      provocationCount: provocation?.count,
      provocationFormats: provocation?.formats,
      usedAppStoreCodes,
      rubricUsed: rotation?.rubricUsed,
      devFactUsed: rotation?.devFactUsed,
      lineUsed: rotation?.lineUsed,
      regularCount: rotation?.regularCount,
      dateHooks: rotation?.dateHooks,
      lastAskWasPoll: rotation?.lastAskWasPoll,
      mediaUsed: rotation?.mediaUsed,
    });
    const { project, rubricId, topic, topicTag, media, text, rejected, promoCode, promoLeft, skipReason, quiet, poll, dateHook, devFactId, lineId, tone, regularCount, mediaId, provocationFormat, provocationCount } = draft;
    const where = `${channel.name} · ${project.name}`;

    // Ссылка VK Play ещё заглушка: пост не генерируем и не публикуем. День закрываем, чтобы следующий слот суток не пропускался тоже.
    if (skipReason) {
      console.error(`Threads-бот (${where}): ${skipReason}`);
      if (!dry) await notify(`⚠️ Threads-бот (${where}): ${skipReason}`);
      // День закрываем после отчёта: следующий слот суток не пропускается тоже. Неудачная генерация сюда не пишет.
      if (!dry && rubricId === OLOID_VKPLAY_RUBRIC) await setVkPlayDay(project.id, mskDay(now));
      return res.json({ posted: false, skipped: skipReason, channel: channel.id, project: project.id, rubric: rubricId });
    }

    if (!text) {
      if (!dry) await notify(`⚠️ Threads-бот (${where}): ни один вариант не прошёл проверки, пост пропущен.\n\n${rejected.join("\n\n")}`);
      return res.json({ posted: false, channel: channel.id, project: project.id, rejected });
    }
    if (dry) {
      return res.json({
        dry: true,
        channel: channel.id,
        project: project.id,
        rubric: rubricId,
        topic,
        topicTag,
        media: media?.type === "CAROUSEL" ? media.urls : media?.url,
        mediaId,
        promoCode,
        promoLeft,
        quiet,
        poll,
        dateHook,
        devFactId,
        tone,
        text,
        rejected,
      });
    }

    // Вне окна раздачи код в Threads не публикуем, даже если генерация его собрала. В отчёт код не кладём.
    if (promoCode && !appStorePromoOpen(now)) {
      await notify(`⚠️ Threads-бот (${where}): раздача кодов App Store закрыта, пост с кодом не опубликован.`);
      return res.json({ posted: false, channel: channel.id, project: project.id, rubric: rubricId, rejected: ["раздача кодов App Store закрыта"] });
    }

    // Картинка — украшение: если Threads её не принял, публикуем текст без неё. Видео (трейлер) без файла не публикуем.
    // Опрос, если API его не принял, снимается внутри publishPost: пост выходит текстом.
    let used = media;
    let pollDropped = false;
    const postId = await publishPost(channel, text, topicTag, media, poll)
      .then((published) => {
        pollDropped = Boolean(published.pollDropped);
        return published.id;
      })
      .catch(async (e) => {
        // Картинка не прошла — постим текст. Если контейнер уже опубликован, второй пост не создаём.
        if ((!media?.droppable && media?.type !== "IMAGE") || postAlreadyPublished(e)) throw e;
        await notify(`⚠️ ${where}: медиа не прошло (${e?.message ?? e}), публикую пост без него.`);
        used = undefined;
        const again = await publishPost(channel, text, topicTag, undefined, poll);
        pollDropped = Boolean(again.pollDropped);
        return again.id;
      });
    // День и код закрываем сразу после публикации, до истории: сбой записи в ленту не должен выдать код ещё раз.
    const appStoreSlot = rubricId === OLOID_APP_STORE_RUBRIC || rubricId === OLOID_APP_STORE_PROMO_RUBRIC;
    if (project.dailyRubric && appStoreSlot) await setAppStoreDay(project.id, mskDay(now));
    if (rubricId === OLOID_VKPLAY_RUBRIC) await setVkPlayDay(project.id, mskDay(now));
    if (rubricId === OLOID_PROVOCATION_RUBRIC && provocationFormat) {
      await setProvocationDay(project.id, mskDay(now));
      await saveProvocation(project.id, { formatId: provocationFormat, at: now.toISOString(), count: (provocationCount ?? 0) + 1 });
    }
    // Код списывается только здесь: после успешного publishPost. Превью, dry и сбой публикации сюда не доходят.
    if (promoCode) await markAppStoreCodeUsed(project.id, promoCode);
    const pollOptions = poll && !pollDropped ? [poll.option_a, poll.option_b, poll.option_c, poll.option_d].filter((option): option is string => Boolean(option)) : undefined;
    if (isOloidRotationRubric(rubricId)) {
      await saveOloidRotation(project.id, {
        rubricId,
        at: now.toISOString(),
        regularCount: (regularCount ?? 0) + 1,
        dateHook,
        dateMsk: dateHook ? mskDay(now) : undefined,
        devFactId,
        lineId,
        askPoll: rubricId === OLOID_ASK_RUBRIC ? Boolean(pollOptions?.length) : undefined,
        mediaId: used ? mediaId : undefined,
      });
    }
    await pushHistory({
      channel: channel.id,
      project: project.id,
      rubric: rubricId,
      topic,
      topicTag,
      text,
      media: used?.url,
      postId,
      at: now.toISOString(),
      quiet,
      poll: Boolean(pollOptions?.length),
      pollOptions,
      dateHook,
      devFactId,
      lineId,
      mediaId: used ? mediaId : undefined,
      provocationFormat,
    });
    await setLastProject(channel, project.id);
    const promoLine = promoCode != null ? `\nПромокод: ${promoCode}. Осталось: ${promoLeft ?? 0}` : "";
    const marks = [
      quiet ? "без ссылки" : "",
      pollOptions?.length ? "с опросом" : "",
      pollDropped ? "опрос не принят, вышел текст" : "",
      dateHook ? `повод ${dateHook}` : "",
      devFactId ? `факт ${devFactId}` : "",
      provocationFormat ? `формат ${provocationFormat}` : "",
      tone === "morning" ? "утро" : tone === "evening" ? "вечер" : tone === "day" ? "день" : "",
    ].filter(Boolean);
    const mediaNote = !used ? "" : used.type === "CAROUSEL" ? ", с каруселью" : used.type === "VIDEO" ? ", с видео" : ", с картинкой";
    await notify(`✅ Опубликовано (${where}, ${rubricId}${mediaNote}${marks.length ? `, ${marks.join(", ")}` : ""}):${topic ? `\nТема: ${topic}` : ""}${topicTag ? `\nТема Threads: ${topicTag}` : ""}${promoLine}\n\n${text}`);
    return res.json({ posted: true, channel: channel.id, project: project.id, rubric: rubricId, topic, media: used?.type === "CAROUSEL" ? used.urls : used?.url, mediaId: used ? mediaId : undefined, promoCode, promoLeft, quiet, poll: pollOptions, pollDropped, dateHook, devFactId, provocationFormat, tone, postId, text });
  } catch (e: any) {
    console.error(e);
    await notify(`❌ Threads-бот упал (${channel.name}): ${e?.message ?? e}`);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
