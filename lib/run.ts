import { OLOID_DEV_NUMBER_FACTS, OLOID_DEV_NUMBERS_RUBRIC } from "./devFacts.js";
import { appStoreCodeProblem, appStoreMomentProblem, appStorePriceProblem, detectiveRefProblem, draftPost, repeatedEnding, ruleCheck, tooSimilar, vkPlayProblem, factCheck } from "./generate.js";
import {
  OLOID_ASK_RUBRIC,
  OLOID_LINE_RUBRIC,
  countRegularPosts,
  eligibleRotationRubrics,
  isOloidRotationRubric,
  matchingDateHook,
  mergeLastUsed,
  oloidSlotTone,
  pickCharacterLine,
  pickLeastRecent,
  pollOptionsProblem,
  regularPostIsQuiet,
  toneNoteForRubric,
  toPollAttachment,
  usedDateHookIds,
  type PollAttachment,
  type SlotTone,
} from "./oloidRotation.js";
import { BURO_DETECTIVE_LOOKBACK, BURO_DETECTIVE_REFS, BURO_FORCE_NEXT_REF_SINCE, mskCalendarDay, nextAppStoreCode, OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_RUBRIC, OLOID_APP_STORE_PROMO_UNTIL, OLOID_APP_STORE_RUBRIC, OLOID_VKPLAY_RUBRIC, OLOID_VKPLAY_SKIP_REASON, OLOID_VKPLAY_SLOT_HOUR_MSK, PROJECTS, pickWeighted, spentAppStoreCodes, vkPlayUrlBlocked, type DetectiveRef, type Media, type Picture, type Project, type Rubric } from "./projects.js";
import type { HistoryItem } from "./store.js";
import type { Channel } from "./channels.js";

const MAX_ATTEMPTS = 3;

export type Draft = {
  project: Project;
  rubricId: string;
  topic?: string;
  topicTag?: string;
  media?: Media;
  text: string | null; // null — ни один вариант не прошёл проверки
  rejected: string[];
  promoCode?: string; // задан только у поста с кодом; превью его не списывает
  promoLeft?: number; // сколько кодов останется после успешной публикации этого
  skipReason?: string; // слот не генерируем и не публикуем; причина для лога и Telegram
  quiet?: boolean;
  poll?: PollAttachment;
  dateHook?: string;
  devFactId?: string;
  lineId?: string;
  tone?: SlotTone;
  /** Сколько обычных постов уже вышло до этого. Тихий — каждый третий. */
  regularCount?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Календарный день по Москве (UTC+3, без летнего времени), YYYY-MM-DD. */
export function mskDay(now: Date): string {
  return mskCalendarDay(now);
}

/** Час по Москве, 0–23. */
export function mskHour(now: Date): number {
  return new Date(now.getTime() + MSK_OFFSET_MS).getUTCHours();
}

/** Автоматическая раздача кодов ещё включена: календарный день МСК не позже promoUntil, включительно. */
export function appStorePromoOpen(now: Date, until = OLOID_APP_STORE_PROMO_UNTIL): boolean {
  return mskDay(now) <= until;
}

/** Код попадает только в appstore-promo. После promoUntil — только в явное превью этой рубрики, не в другие посты. */
export function promoCodeForRubric(rubricId: string, nextCode: string | null, promoScheduled: boolean, forcedRubric?: string): string | undefined {
  if (rubricId !== OLOID_APP_STORE_PROMO_RUBRIC) return undefined;
  if (!promoScheduled && forcedRubric !== OLOID_APP_STORE_PROMO_RUBRIC) return undefined;
  return nextCode ?? undefined;
}

/** Дневная рубрика ещё не выходила сегодня по МСК. Нет поля dailyRubric — всегда false. */
export function dailyRubricPending(project: Project, dailyDoneDate: string | null, now: Date): boolean {
  if (!project.dailyRubric) return false;
  if (!project.rubrics.some((r) => r.id === project.dailyRubric)) return false;
  return dailyDoneDate !== mskDay(now);
}

/** Второй дневной пост берёт этот час. Заглушка в ссылке занимает только окно слота (5 часов), вечерний пост не съедает. */
export function secondDailyClaimsHour(now: Date, hourMsk: number, urlBlocked: boolean): boolean {
  const hour = mskHour(now);
  if (hour < hourMsk) return false;
  if (urlBlocked && hour >= hourMsk + 5) return false;
  return true;
}

/** Второй дневной пост ещё не выходил сегодня и календарный день уже не раньше secondDailyFrom. */
export function secondDailyPending(project: Project, doneDate: string | null, now: Date): boolean {
  const id = project.secondDailyRubric;
  if (!id || !project.rubrics.some((r) => r.id === id)) return false;
  if (project.secondDailyFrom && mskDay(now) < project.secondDailyFrom) return false;
  return doneDate !== mskDay(now);
}

/** Рубрика по весам без повтора предыдущей на этом аккаунте.
 *  alternateRubric без alternateEveryDays — через пост.
 *  alternateEveryDays — не чаще раза в N суток: срок считается по всей истории проекта
 *  (allHistory, включая старые посты с другого аккаунта). Если срок вышел, следующий пост — эта рубрика.
 *  dailyRubric — первый пост за календарные сутки МСК, если dailyDoneDate не равен сегодняшнему дню.
 *  appStorePromo — этот слот appstore-promo. Вызывающий передаёт true, только пока день МСК не позже
 *  OLOID_APP_STORE_PROMO_UNTIL и есть неиспользованный код. Иначе слот — обычный appstore.
 *  secondDailyRubric — другой слот суток, не раньше secondDailyHourMsk, и только если dailyRubric за сегодня уже вышел.
 *  До этого часа и пока дневной пост не опубликован поведение прежнее: утро остаётся за App Store.
 *  Трейлер при этом не сбрасывается: его срок смотрит только на посты своей рубрики и сработает на следующем запуске.
 *  У «Олоида» обычный пост — не веса, а очередь LRU (rotation.lastUsed). preferRegular: календарный повод
 *  забирает слот у трейлера, магазины не трогает. */
export function pickRubric(
  project: Project,
  history: HistoryItem[],
  now: Date,
  forcedRubric?: string,
  allHistory: HistoryItem[] = history,
  dailyDoneDate: string | null = null,
  appStorePromo = false,
  secondDailyDoneDate: string | null = null,
  rotation?: { lastUsed?: Record<string, string>; preferRegular?: boolean },
): Rubric {
  const forced = project.rubrics.find((r) => r.id === forcedRubric);
  if (forced) return forced;
  const lastRubric = history.find((h) => h.project === project.id)?.rubric;
  const alt = project.rubrics.find((r) => r.id === project.alternateRubric);
  const daily = project.rubrics.find((r) => r.id === project.dailyRubric);
  const promo = project.rubrics.find((r) => r.id === OLOID_APP_STORE_PROMO_RUBRIC);
  const second = project.rubrics.find((r) => r.id === project.secondDailyRubric);
  const weighted = () => pickWeighted(project.rubrics.filter((r) => r !== alt && r !== daily && r !== promo && r !== second && r.weight > 0), lastRubric, (r) => r.id);
  const regular = () => {
    if (project.id !== "oloid") return weighted();
    const pool = eligibleRotationRubrics(project);
    return pool.length ? pickLeastRecent(pool, rotation?.lastUsed ?? {}) : weighted();
  };
  const dailyPending = !!(daily && dailyRubricPending(project, dailyDoneDate, now));
  const secondPending = !!(second && secondDailyPending(project, secondDailyDoneDate, now));
  const afternoon = mskHour(now) >= (project.secondDailyHourMsk ?? OLOID_VKPLAY_SLOT_HOUR_MSK);
  // Утро (до secondDailyHourMsk) второй дневной пост не занимает.
  if (!afternoon) {
    if (daily && dailyPending) {
      if (appStorePromo && promo) return promo;
      return daily;
    }
  } else if (second && secondPending && !dailyPending) {
    // App Store за сегодня уже вышел — этот запуск берёт VK Play (обычно 15:00 МСК, иначе 20:00).
    const blocked = second.id === OLOID_VKPLAY_RUBRIC && vkPlayUrlBlocked();
    if (secondDailyClaimsHour(now, project.secondDailyHourMsk ?? OLOID_VKPLAY_SLOT_HOUR_MSK, blocked)) return second;
  } else if (daily && dailyPending) {
    // Утренний пост не вышел: слот по-прежнему его, VK Play ждёт следующего запуска.
    if (appStorePromo && promo) return promo;
    return daily;
  }
  // Календарный повод занимает один обычный пост и не сбрасывает срок трейлера.
  if (rotation?.preferRegular) return regular();
  if (!alt) return regular();
  const days = project.alternateEveryDays;
  if (days == null) return lastRubric !== alt.id ? alt : regular();
  return alternateDue(project.id, alt.id, allHistory, now, days) ? alt : regular();
}

/** Прошло не меньше N суток с последнего поста рубрики-посева, либо такого поста ещё не было. */
function alternateDue(projectId: string, rubricId: string, history: HistoryItem[], now: Date, days: number): boolean {
  const last = history.find((h) => h.project === projectId && h.rubric === rubricId);
  if (!last?.at) return true;
  const at = Date.parse(last.at);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= days * DAY_MS;
}

/** Тема Threads: своя у рубрики или та, что дольше всех не использовалась в постах проекта. */
export function pickTopicTag(project: Project, rubric: Rubric, history: HistoryItem[]): string | undefined {
  if (rubric.topicTag) return rubric.topicTag;
  const tags = project.topicTags ?? [];
  const age = (t: string) => {
    const i = history.filter((h) => h.project === project.id).findIndex((h) => h.topicTag === t);
    return i === -1 ? Infinity : i; // история — от новых к старым
  };
  return [...tags].sort((a, b) => age(b) - age(a))[0];
}

/** Картинка к посту: лучшее совпадение тегов с рубрикой и темой.
 *  Теги не совпали — всё равно кадр, тот, что дольше всех не встречался в истории.
 *  Кадры из последних 20 постов проекта не повторяем, пока остаётся другой.
 *  appstore и appstore-promo берут только appStorePictures.
 *  vkplay берёт только vkPlayPictures. Остальные рубрики — pictures, без этих баннеров. */
export function pickPicture(project: Project, rubric: Rubric, topic: string | undefined, history: HistoryItem[]): Picture | undefined {
  const appStore = rubric.id === OLOID_APP_STORE_RUBRIC || rubric.id === OLOID_APP_STORE_PROMO_RUBRIC;
  const vkPlay = rubric.id === OLOID_VKPLAY_RUBRIC;
  const pics = appStore ? project.appStorePictures : vkPlay ? project.vkPlayPictures : project.pictures;
  if (!rubric.withPicture || !pics?.length) return undefined;
  const own = history.filter((h) => h.project === project.id);
  const recent = new Set(own.slice(0, 20).map((h) => h.media));
  const fresh = pics.filter((p) => !recent.has(p.url));
  const pool = fresh.length ? fresh : pics;
  const text = `${rubric.id} ${topic ?? ""}`.toLowerCase();
  const score = (p: Picture) => p.tags.filter((t) => text.includes(t)).length;
  const best = Math.max(...pool.map(score));
  const matched = best > 0 ? pool.filter((p) => score(p) === best) : pool;
  const age = (url: string) => {
    const i = own.findIndex((h) => h.media === url);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  const oldest = Math.max(...matched.map((p) => age(p.url)));
  const top = matched.filter((p) => age(p.url) === oldest);
  return top[Math.floor(Math.random() * top.length)];
}

/** Отсылка «Бюро», которой не было в последних 20 постах проекта; когда свежих не осталось — круг заново.
 *  forceNextRef — один раз, пока этого якоря нет в постах «Бюро» новее BURO_FORCE_NEXT_REF_SINCE.
 *  Если историю не удалось проверить, обычный выбор. */
export function pickDetectiveRef(history: HistoryItem[], forceNextRef?: string): DetectiveRef {
  const forced = forcedRefIfPending(history, forceNextRef);
  if (forced) return forced;
  const recent = history.filter((h) => h.project === "buro").slice(0, BURO_DETECTIVE_LOOKBACK);
  const used = new Set(BURO_DETECTIVE_REFS.filter((r) => recent.some((h) => r.mark.test(h.text))).map((r) => r.id));
  const fresh = BURO_DETECTIVE_REFS.filter((r) => !used.has(r.id));
  const pool = fresh.length ? fresh : BURO_DETECTIVE_REFS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Отсылка forceNextRef, если в видимой истории её ещё не было после метки коммита. Иначе null. */
function forcedRefIfPending(history: HistoryItem[], forceNextRef?: string): DetectiveRef | null {
  if (!forceNextRef) return null;
  try {
    const ref = BURO_DETECTIVE_REFS.find((r) => r.id === forceNextRef);
    const since = Date.parse(BURO_FORCE_NEXT_REF_SINCE);
    if (!ref || Number.isNaN(since) || !Array.isArray(history)) return null;

    let oldest = Number.POSITIVE_INFINITY;
    let sawDatedBuro = false;
    for (const h of history) {
      if (!h || h.project !== "buro" || typeof h.text !== "string") continue;
      const at = typeof h.at === "string" ? Date.parse(h.at) : Number.NaN;
      const hit = ref.mark.test(h.text);
      if (Number.isNaN(at)) {
        if (hit) return null;
        continue;
      }
      sawDatedBuro = true;
      if (at < oldest) oldest = at;
      if (hit && at >= since) return null;
    }
    // Вся видимая лента «Бюро» новее метки, а якоря в ней нет: пост уже мог уйти из окна. Не повторяем.
    if (sawDatedBuro && oldest >= since) return null;
    return ref;
  } catch {
    return null;
  }
}

/** Тема рубрики, которой не было в недавних постах этой рубрики; когда темы кончились — круг заново. */
export function pickTopic(rubric: Rubric, history: HistoryItem[]): string | undefined {
  if (!rubric.topics?.length) return undefined;
  const used = new Set(history.filter((h) => h.rubric === rubric.id).map((h) => h.topic));
  const fresh = rubric.topics.filter((t) => !used.has(t));
  const pool = fresh.length ? fresh : rubric.topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Выбирает проект/рубрику и генерирует пост с проверками. Ничего не публикует и ничего не пишет в историю. */
/** Проект аккаунта по очереди: следующий после последнего опубликованного. */
export function pickProject(channel: Channel, lastProject: string | null, forcedProject?: string): Project {
  const own = PROJECTS.filter((p) => channel.projects.includes(p.id));
  return own.find((p) => p.id === forcedProject) ?? own.find((p) => p.id !== lastProject) ?? own[0];
}

const LINE_SKIP = "рубрика «реплика дня» пропущена: в фактах нет дословной реплики без спойлера";
const DEV_NUMBERS_SKIP = "рубрика «цифры разработки» пропущена: список проверенных цифр пуст";

export async function makeDraft(opts: {
  channel: Channel;
  history: HistoryItem[];
  lastProject: string | null;
  forcedProject?: string;
  forcedRubric?: string; // только для превью
  forcedTopic?: string; // только для превью: фрагмент названия темы
  now: Date;
  /** МСК-дата последнего успешного поста dailyRubric. null — такого поста ещё не было. */
  dailyDoneDate?: string | null;
  /** МСК-дата последнего закрытого поста secondDailyRubric. null — такого поста ещё не было. */
  secondDailyDoneDate?: string | null;
  /** Уже выданные коды App Store. null — Redis недоступен, код не показываем. */
  usedAppStoreCodes?: string[] | null;
  /** Очередь обычных рубрик «Олоида». null у счётчика — считаем по истории. */
  rubricUsed?: Record<string, string>;
  devFactUsed?: Record<string, string>;
  lineUsed?: Record<string, string>;
  regularCount?: number | null;
  dateHooks?: Record<string, string>;
  lastAskWasPoll?: boolean | null;
}): Promise<Draft> {
  const {
    channel,
    history,
    lastProject,
    forcedProject,
    forcedRubric,
    forcedTopic,
    now,
    dailyDoneDate = null,
    secondDailyDoneDate = null,
    usedAppStoreCodes = null,
    rubricUsed = {},
    devFactUsed = {},
    lineUsed = {},
    regularCount: storedRegularCount = null,
    dateHooks = {},
    lastAskWasPoll = null,
  } = opts;
  const project = pickProject(channel, lastProject, forcedProject);

  // «Не повторять прошлую рубрику» — по постам этого аккаунта. Интервал трейлера — по всей истории проекта.
  // Темы и антиповтор — тоже по всем аккаунтам, чтобы два аккаунта не выдавали одно и то же
  const own = history.filter((h) => (h.channel ?? "pomazkof") === channel.id);
  const projectHistory = history.filter((h) => h.project === project.id);
  const promoScheduled = appStorePromoOpen(now);
  // Код читаем для автоматического слота, пока дата открыта, и для явного превью appstore-promo после неё.
  const previewPromo = forcedRubric === OLOID_APP_STORE_PROMO_RUBRIC;
  const canReadCodes = project.id === "oloid" && usedAppStoreCodes !== null;
  const spent = canReadCodes ? spentAppStoreCodes(usedAppStoreCodes, history) : [];
  const nextCode = canReadCodes && (promoScheduled || previewPromo) ? nextAppStoreCode(spent) : null;
  const day = mskDay(now);
  const dateHookDue = project.id === "oloid" ? matchingDateHook(day, usedDateHookIds(day, dateHooks, projectHistory)) : null;
  const rubricLastUsed = mergeLastUsed(
    rubricUsed,
    projectHistory.map((item) => ({ id: item.rubric, at: item.at })),
  );
  const rubric = pickRubric(project, own, now, forcedRubric, history, dailyDoneDate, promoScheduled && nextCode != null, secondDailyDoneDate, {
    lastUsed: rubricLastUsed,
    preferRegular: dateHookDue != null,
  });
  const wanted = forcedTopic?.toLowerCase();
  let topic = (wanted && rubric.topics?.find((t) => t.toLowerCase().includes(wanted))) || pickTopic(rubric, history);
  const linkContent = `${channel.id}-${rubric.id}`;
  const topicTag = pickTopicTag(project, rubric, history);
  const regularCount = storedRegularCount ?? countRegularPosts(projectHistory);
  const rotation = project.id === "oloid" && isOloidRotationRubric(rubric.id);
  const quiet = rotation && regularPostIsQuiet(regularCount);
  const tone = project.id === "oloid" ? oloidSlotTone(mskHour(now)) : undefined;
  const dateHook = rotation ? dateHookDue : null;

  if (rubric.id === OLOID_LINE_RUBRIC) {
    const line = pickCharacterLine(mergeLastUsed(lineUsed, projectHistory.map((item) => ({ id: item.lineId, at: item.at }))));
    if (!line) return { project, rubricId: rubric.id, topic, topicTag, text: null, rejected: [LINE_SKIP], skipReason: LINE_SKIP, tone, regularCount };
    topic = `${line.speaker}: ${line.line}`;
  }
  const devFact =
    rubric.id === OLOID_DEV_NUMBERS_RUBRIC && OLOID_DEV_NUMBER_FACTS.length
      ? pickLeastRecent(OLOID_DEV_NUMBER_FACTS, mergeLastUsed(devFactUsed, projectHistory.map((item) => ({ id: item.devFactId, at: item.at }))))
      : undefined;
  if (rubric.id === OLOID_DEV_NUMBERS_RUBRIC && !devFact) {
    return { project, rubricId: rubric.id, topic, topicTag, text: null, rejected: [DEV_NUMBERS_SKIP], skipReason: DEV_NUMBERS_SKIP, tone, regularCount };
  }
  if (devFact) topic = devFact.label;
  const line = rubric.id === OLOID_LINE_RUBRIC
    ? pickCharacterLine(mergeLastUsed(lineUsed, projectHistory.map((item) => ({ id: item.lineId, at: item.at }))))
    : null;

  // Заглушка в адресе: автоматический слот не генерируем и не публикуем. Явное превью рубрики текст всё же собирает.
  if (rubric.id === OLOID_VKPLAY_RUBRIC && vkPlayUrlBlocked() && forcedRubric !== OLOID_VKPLAY_RUBRIC) {
    return { project, rubricId: rubric.id, topic, topicTag, text: null, rejected: [OLOID_VKPLAY_SKIP_REASON], skipReason: OLOID_VKPLAY_SKIP_REASON, tone };
  }
  // Опрос — только текст. Картинка к poll_attachment не клеится. Карусели и ролики геймплея выключены (lib/variety.ts).
  // Redis помнит, был ли прошлый «вопрос к вам» опросом. Если ключа нет — смотрим историю.
  const askFromHistory = projectHistory.find((item) => item.rubric === OLOID_ASK_RUBRIC);
  const askWasPoll = lastAskWasPoll ?? (askFromHistory ? askFromHistory.poll === true : null);
  const wantPoll = rubric.id === OLOID_ASK_RUBRIC && askWasPoll !== true;
  const picture = rubric.media || wantPoll ? undefined : pickPicture(project, rubric, topic, history);
  const media: Media | undefined = rubric.media ?? (picture && { type: "IMAGE", url: picture.url });
  const detective = project.id === "buro" ? pickDetectiveRef(history, project.forceNextRef) : undefined;
  const promoCode = promoCodeForRubric(rubric.id, nextCode, promoScheduled, forcedRubric);
  const promoLeft = promoCode ? OLOID_APP_STORE_CODES.length - spent.length - 1 : undefined;
  const base = {
    project,
    rubricId: rubric.id,
    topic,
    topicTag,
    media,
    promoCode,
    promoLeft,
    quiet,
    dateHook: dateHook?.id,
    devFactId: devFact?.id,
    lineId: line?.id,
    tone,
    regularCount,
  };

  if (rubric.id === OLOID_APP_STORE_PROMO_RUBRIC && !promoCode) {
    const why = usedAppStoreCodes === null ? "список кодов в Redis недоступен, код не показываю" : "коды App Store закончились";
    return { ...base, text: null, rejected: [why] };
  }

  let feedback: string | undefined;
  const rejected: string[] = [];
  const hints = {
    quiet,
    toneNote: tone ? toneNoteForRubric(tone, rubric.id) : undefined,
    dateSteer: dateHook?.steer,
    devFact: devFact?.text,
    wantPoll,
    characterLine: line ? `${line.speaker}: «${line.line}». ${line.note}` : undefined,
  };

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const drafted = await draftPost(project, rubric, history, now, feedback, topic, channel.voiceNote, linkContent, picture?.about, detective?.hint, promoCode, hints);
    const candidate = drafted.text;
    const problem =
      ruleCheck(candidate, project, now, rubric, linkContent, promoCode, quiet, devFact?.text) ??
      appStoreCodeProblem(candidate, project.id, rubric.id, promoCode) ??
      appStorePriceProblem(candidate, project.id, rubric.id) ??
      appStoreMomentProblem(candidate, project.id, rubric.id) ??
      vkPlayProblem(candidate, project.id, rubric.id) ??
      (detective ? detectiveRefProblem(candidate, history, detective) : null) ??
      repeatedEnding(candidate, history, project.id) ??
      tooSimilar(candidate, history) ??
      (await factCheck(candidate, project, picture?.about, now, { rubricId: rubric.id, promoCode, devFact: devFact?.text, quiet }));
    if (problem) {
      feedback = problem;
      rejected.push(`${problem}: ${candidate}`);
      continue;
    }
    const pollErr = wantPoll ? pollOptionsProblem(drafted.options) : null;
    if (pollErr && i < MAX_ATTEMPTS - 1) {
      feedback = pollErr;
      rejected.push(`${pollErr}: ${candidate}`);
      continue;
    }
    const poll = wantPoll && !pollErr && drafted.options ? toPollAttachment(drafted.options) : undefined;
    if (pollErr) rejected.push(`опрос снят, пост без опроса: ${pollErr}: ${candidate}`);
    return { ...base, text: candidate, poll, rejected };
  }
  return { ...base, text: null, rejected };
}
