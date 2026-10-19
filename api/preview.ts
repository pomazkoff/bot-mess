import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appStorePromoOpen, makeDraft } from "../lib/run.js";
import { OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_UNTIL, spentAppStoreCodes } from "../lib/projects.js";
import { getAppStoreCodesUsed, getAppStoreDay, getHistory, getLastProject } from "../lib/store.js";
import { notify } from "../lib/notify.js";
import { channelById } from "../lib/channels.js";

// Холостой прогон: генерирует пост с полными проверками и возвращает текст.
// Этот эндпоинт НЕ импортирует модуль публикации и ничего не пишет в историю —
// утечка PREVIEW_KEY позволяет тратить токены Anthropic и читать список кодов App Store, но не постить.
// Вызов: /api/preview?key=<PREVIEW_KEY>[&channel=pomazkof|oloid]&project=buro|oloid[&rubric=<id рубрики>][&topic=<фрагмент темы>][&notify=1 — прислать превью в Telegram]
// &rubric=appstore — обычный пост App Store, ссылка на страницу приложения.
// &rubric=appstore-promo — вариант с кодом: ссылка https://apps.apple.com/redeem?code=<КОД>, тот же код отдельной строкой в тексте. Код не списывается. Дату раздачи не смотрит.
// Без rubric бот сам берёт слот дня: appstore-promo, пока день МСК не позже OLOID_APP_STORE_PROMO_UNTIL и коды есть, иначе обычный App Store.
// &codes=1 — без генерации: использованные и свободные коды (Redis + история). Ничего не списывает.
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
      return res.json({ codes: true, promoUntil: OLOID_APP_STORE_PROMO_UNTIL, promoOpen: appStorePromoOpen(now), redis, used: null, unused: null });
    }
    const used = spentAppStoreCodes(redisUsed, history);
    const usedSet = new Set(used);
    const unused = OLOID_APP_STORE_CODES.filter((c) => !usedSet.has(c));
    return res.json({ codes: true, promoUntil: OLOID_APP_STORE_PROMO_UNTIL, promoOpen: appStorePromoOpen(now), redis, used, unused });
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
    const usedAppStoreCodes = channel.projects.includes("oloid")
      ? await getAppStoreCodesUsed("oloid", OLOID_APP_STORE_CODES).catch((e) => ((redis = String(e?.message ?? e)), null))
      : [];
    const { project, rubricId, topic, topicTag, media, text, rejected, promoCode, promoLeft } = await makeDraft({
      channel,
      history,
      lastProject,
      forcedProject: typeof req.query.project === "string" ? req.query.project : undefined,
      forcedRubric: typeof req.query.rubric === "string" ? req.query.rubric : undefined,
      forcedTopic: typeof req.query.topic === "string" ? req.query.topic : undefined,
      now: new Date(),
      dailyDoneDate,
      usedAppStoreCodes,
    });
    const promoLine = promoCode != null ? `\nПромокод: ${promoCode}. Осталось бы: ${promoLeft}. Код не списан.` : "";
    const telegram =
      req.query.notify === "1"
        ? await notify(`🧪 Превью, НЕ опубликовано (${channel.name} · ${project.name}, ${rubricId}${media ? (media.type === "VIDEO" ? ", с видео" : ", с картинкой") : ""}):${promoLine}\n\n${text ?? "ни один вариант не прошёл проверки"}`)
        : undefined;
    return res.json({ preview: true, redis, telegram, history: history.length, channel: channel.id, project: project.id, rubric: rubricId, topic, topicTag, media: media?.url, promoCode, promoLeft, text, length: text?.length, rejected });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
