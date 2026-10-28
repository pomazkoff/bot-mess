import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appStorePromoOpen, makeDraft } from "../lib/run.js";
import { OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_FROM, OLOID_APP_STORE_PROMO_UNTIL, spentAppStoreCodes } from "../lib/projects.js";
import { getAppStoreCodesUsed, getAppStoreDay, getHistory, getLastProject, getOloidRotationState, getProvocationDay, getProvocationState, getVkPlayDay } from "../lib/store.js";
import { notify } from "../lib/notify.js";
import { channelById } from "../lib/channels.js";
import type { Media } from "../lib/projects.js";
import type { FactCardCopy } from "../lib/factCard.js";

// Холостой прогон: генерирует пост с полными проверками и возвращает текст.
// Этот эндпоинт НЕ импортирует модуль публикации и ничего не пишет в историю —
// утечка PREVIEW_KEY позволяет тратить токены Anthropic и читать список кодов App Store, но не постить.
// Вызов: /api/preview?key=<PREVIEW_KEY>[&channel=pomazkof|oloid]&project=buro|oloid[&rubric=<id рубрики>][&topic=<фрагмент темы>][&notify=1 — прислать превью в Telegram]
// &rubric=appstore — обычный пост App Store, ссылка на страницу приложения.
// &rubric=appstore-promo — вариант с кодом: ссылка https://apps.apple.com/redeem?code=<КОД>, тот же код отдельной строкой в тексте. Код не списывается. Дату раздачи не смотрит.
// &rubric=vkplay — пост VK Play. Код и дату слота не списывает. Если в OLOID_VKPLAY_URL есть TODO, текст всё равно собирается, но крон такой пост не опубликует.
// Без rubric бот сам берёт слот: утром App Store, с 15:00 МСК и с 2026-10-23 — VK Play, если App Store за сутки уже вышел, в 17:30–19:59 МСК — провокация, если магазины за сутки уже закрыты. Пока URL с TODO, автослот VK Play возвращает skipReason и ничего не генерирует.
// &rubric=provocation — провокационный пост. Дату слота не списывает. Формат берётся по LRU, опрос и ссылка — по счётчику уже вышедших.
// &codes=1 — без генерации: использованные и свободные коды (Redis, история и OLOID_APP_STORE_RETIRED_CODES). Ничего не списывает.
// Ключи Redis: threads:appstore_day:oloid и threads:appstore_code:oloid:<КОД>.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.PREVIEW_KEY;
  if (!key || req.query.key !== key) return res.status(401).json({ error: "unauthorized" });

  // Список кодов не генерирует пост и не пишет в Redis. Канал не нужен: коды одни на проект oloid.
  if (req.query.codes === "1") {
    let redis = "ok";
    const history = await getHistory(200).catch((e) => ((redis = String(e?.message ?? e)), null));
    const redisUsed = await getAppStoreCodesUsed("oloid", OLOID_APP_STORE_CODES).catch((e) => ((redis = String(e?.message ?? e)), null));
    const now = new Date();
    if (history === null || redisUsed === null) {
      return res.json({ codes: true, promoFrom: OLOID_APP_STORE_PROMO_FROM, promoUntil: OLOID_APP_STORE_PROMO_UNTIL, promoOpen: appStorePromoOpen(now), redis, used: null, unused: null });
    }
    const used = spentAppStoreCodes(redisUsed, history);
    const usedSet = new Set(used);
    const unused = OLOID_APP_STORE_CODES.filter((c) => !usedSet.has(c));
    return res.json({ codes: true, promoFrom: OLOID_APP_STORE_PROMO_FROM, promoUntil: OLOID_APP_STORE_PROMO_UNTIL, promoOpen: appStorePromoOpen(now), redis, used, unused });
  }

  const channel = channelById(typeof req.query.channel === "string" ? req.query.channel : undefined);
  if (!channel) return res.status(400).json({ error: "неизвестный channel" });

  // &whoami=1 — от чьего имени будет постить бот в этом аккаунте. Только чтение профиля, модуль публикации не нужен.
  if (req.query.whoami === "1") {
    const token = process.env[channel.tokenEnv]?.trim() ?? "";
    const r = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
    const j: any = await r.json().catch(() => ({}));
    return res.json({ threads: j.username ? { username: j.username, id: j.id } : { error: j.error?.message ?? r.status } });
  }

  try {
    // Превью работает и без Redis, но сообщает, видна ли база (поле redis)
    let redis = "ok";
    const history = await getHistory().catch((e) => ((redis = String(e?.message ?? e)), []));
    const lastProject = await getLastProject(channel).catch(() => null);
    const dailyDoneDate = channel.projects.includes("oloid")
      ? await getAppStoreDay("oloid").catch((e) => ((redis = String(e?.message ?? e)), null))
      : null;
    const secondDailyDoneDate = channel.projects.includes("oloid")
      ? await getVkPlayDay("oloid").catch((e) => ((redis = String(e?.message ?? e)), null))
      : null;
    const provocationDoneDate = channel.projects.includes("oloid")
      ? await getProvocationDay("oloid").catch((e) => ((redis = String(e?.message ?? e)), null))
      : null;
    const provocationState = channel.projects.includes("oloid")
      ? await getProvocationState("oloid").catch((e) => ((redis = String(e?.message ?? e)), null))
      : null;
    const usedAppStoreCodes = channel.projects.includes("oloid")
      ? await getAppStoreCodesUsed("oloid", OLOID_APP_STORE_CODES).catch((e) => ((redis = String(e?.message ?? e)), null))
      : [];
    const rotation = channel.projects.includes("oloid")
      ? await getOloidRotationState("oloid").catch((e) => ((redis = String(e?.message ?? e)), null))
      : null;
    const draft = await makeDraft({
      channel,
      history,
      lastProject,
      forcedProject: typeof req.query.project === "string" ? req.query.project : undefined,
      forcedRubric: typeof req.query.rubric === "string" ? req.query.rubric : undefined,
      forcedTopic: typeof req.query.topic === "string" ? req.query.topic : undefined,
      now: new Date(),
      dailyDoneDate,
      secondDailyDoneDate,
      provocationDoneDate,
      provocationCount: provocationState?.count,
      provocationFormats: provocationState?.formats,
      usedAppStoreCodes,
      rubricUsed: rotation?.rubricUsed,
      devFactUsed: rotation?.devFactUsed,
      lineUsed: rotation?.lineUsed,
      regularCount: rotation?.regularCount,
      dateHooks: rotation?.dateHooks,
      lastAskWasPoll: rotation?.lastAskWasPoll,
      mediaUsed: rotation?.mediaUsed,
    });
    const { project, rubricId, topic, topicTag, media, text, rejected, promoCode, promoLeft, skipReason, quiet, poll, dateHook, devFactId, tone, mediaId, provocationFormat, card, pictureUrl } = draft;
    const resolved = text ? await resolvePreviewCard(card, pictureUrl, media) : { media };
    const shownMedia = resolved.media ?? media;
    const promoLine = promoCode != null ? `\nПромокод: ${promoCode}. Осталось бы: ${promoLeft}. Код не списан.` : "";
    const cardReport = resolved.cardFallback
      ? `\n⚠️ карточка не собралась (${resolved.cardFallback}), в посте обычный кадр`
      : resolved.cardUrl && card
        ? `\nКарточка: ${card.title}\n${card.caption}`
        : "";
    const mediaLabel = resolved.cardUrl ? ", с карточкой" : shownMedia ? (shownMedia.type === "CAROUSEL" ? ", с каруселью" : shownMedia.type === "VIDEO" ? ", с видео" : ", с картинкой") : "";
    const telegram =
      req.query.notify === "1"
        ? await notify(`🧪 Превью, НЕ опубликовано (${channel.name} · ${project.name}, ${rubricId}${mediaLabel}):${promoLine}${cardReport}\n\n${skipReason ?? text ?? "ни один вариант не прошёл проверки"}`)
        : undefined;
    return res.json({
      preview: true,
      redis,
      telegram,
      history: history.length,
      channel: channel.id,
      project: project.id,
      rubric: rubricId,
      topic,
      topicTag,
      media: shownMedia?.type === "CAROUSEL" ? shownMedia.urls : shownMedia?.url,
      card,
      cardUrl: resolved.cardUrl,
      cardFallback: resolved.cardFallback,
      mediaId,
      promoCode,
      promoLeft,
      quiet,
      poll,
      dateHook,
      devFactId,
      provocationFormat,
      tone,
      skipped: skipReason,
      text,
      length: text?.length,
      rejected,
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}

/** Превью карточку не кэширует и не публикует. Сбой рендера не прячет текст. */
async function resolvePreviewCard(
  card: FactCardCopy | undefined,
  pictureUrl: string | undefined,
  media: Media | undefined,
): Promise<{ media?: Media; cardUrl?: string; cardFallback?: string }> {
  if (!card || !pictureUrl) return { media };
  try {
    const { resolveFactCardMedia } = await import("../lib/factCardRender.js");
    return await resolveFactCardMedia({ media, card, pictureUrl, cache: false });
  } catch (e) {
    const reason = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 180);
    return { media, cardFallback: reason };
  }
}
