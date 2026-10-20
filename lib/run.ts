import { BURO_DETECTIVE_LOOKBACK, BURO_DETECTIVE_REFS, BURO_FORCE_NEXT_REF_SINCE, nextAppStoreCode, OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_RUBRIC, OLOID_APP_STORE_PROMO_UNTIL, OLOID_APP_STORE_RUBRIC, PROJECTS, pickWeighted, spentAppStoreCodes, type DetectiveRef, type Media, type Picture, type Project, type Rubric } from "./projects.js";
import { appStoreCodeProblem, appStoreMomentProblem, appStorePriceProblem, detectiveRefProblem, draftPost, repeatedEnding, ruleCheck, tooSimilar, factCheck } from "./generate.js";
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
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Календарный день по Москве (UTC+3, без летнего времени), YYYY-MM-DD. */
export function mskDay(now: Date): string {
  return new Date(now.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
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

/** Рубрика по весам без повтора предыдущей на этом аккаунте.
 *  alternateRubric без alternateEveryDays — через пост.
 *  alternateEveryDays — не чаще раза в N суток: срок считается по всей истории проекта
 *  (allHistory, включая старые посты с другого аккаунта). Если срок вышел, следующий пост — эта рубрика.
 *  dailyRubric — первый пост за календарные сутки МСК, если dailyDoneDate не равен сегодняшнему дню.
 *  appStorePromo — этот слот appstore-promo. Вызывающий передаёт true, только пока день МСК не позже
 *  OLOID_APP_STORE_PROMO_UNTIL и есть неиспользованный код. Иначе слот — обычный appstore.
 *  Трейлер при этом не сбрасывается: его срок смотрит только на посты своей рубрики и сработает на следующем запуске. */
export function pickRubric(
  project: Project,
  history: HistoryItem[],
  now: Date,
  forcedRubric?: string,
  allHistory: HistoryItem[] = history,
  dailyDoneDate: string | null = null,
  appStorePromo = false,
): Rubric {
  const forced = project.rubrics.find((r) => r.id === forcedRubric);
  if (forced) return forced;
  const lastRubric = history.find((h) => h.project === project.id)?.rubric;
  const alt = project.rubrics.find((r) => r.id === project.alternateRubric);
  const daily = project.rubrics.find((r) => r.id === project.dailyRubric);
  const promo = project.rubrics.find((r) => r.id === OLOID_APP_STORE_PROMO_RUBRIC);
  const normal = () => pickWeighted(project.rubrics.filter((r) => r !== alt && r !== daily && r !== promo && r.weight > 0), lastRubric, (r) => r.id);
  if (daily && dailyRubricPending(project, dailyDoneDate, now)) {
    if (appStorePromo && promo) return promo;
    return daily;
  }
  if (!alt) return normal();
  const days = project.alternateEveryDays;
  if (days == null) return lastRubric !== alt.id ? alt : normal();
  return alternateDue(project.id, alt.id, allHistory, now, days) ? alt : normal();
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
 *  appstore и appstore-promo берут только appStorePictures. Остальные рубрики — pictures, без этих баннеров. */
export function pickPicture(project: Project, rubric: Rubric, topic: string | undefined, history: HistoryItem[]): Picture | undefined {
  const appStore = rubric.id === OLOID_APP_STORE_RUBRIC || rubric.id === OLOID_APP_STORE_PROMO_RUBRIC;
  const pics = appStore ? project.appStorePictures : project.pictures;
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
  /** Уже выданные коды App Store. null — Redis недоступен, код не показываем. */
  usedAppStoreCodes?: string[] | null;
}): Promise<Draft> {
  const { channel, history, lastProject, forcedProject, forcedRubric, forcedTopic, now, dailyDoneDate = null, usedAppStoreCodes = null } = opts;
  const project = pickProject(channel, lastProject, forcedProject);

  // «Не повторять прошлую рубрику» — по постам этого аккаунта. Интервал трейлера — по всей истории проекта.
  // Темы и антиповтор — тоже по всем аккаунтам, чтобы два аккаунта не выдавали одно и то же
  const own = history.filter((h) => (h.channel ?? "pomazkof") === channel.id);
  const promoScheduled = appStorePromoOpen(now);
  // Код читаем для автоматического слота, пока дата открыта, и для явного превью appstore-promo после неё.
  const previewPromo = forcedRubric === OLOID_APP_STORE_PROMO_RUBRIC;
  const canReadCodes = project.id === "oloid" && usedAppStoreCodes !== null;
  const spent = canReadCodes ? spentAppStoreCodes(usedAppStoreCodes, history) : [];
  const nextCode = canReadCodes && (promoScheduled || previewPromo) ? nextAppStoreCode(spent) : null;
  const rubric = pickRubric(project, own, now, forcedRubric, history, dailyDoneDate, promoScheduled && nextCode != null);
  const wanted = forcedTopic?.toLowerCase();
  const topic = (wanted && rubric.topics?.find((t) => t.toLowerCase().includes(wanted))) || pickTopic(rubric, history);
  const linkContent = `${channel.id}-${rubric.id}`;
  const topicTag = pickTopicTag(project, rubric, history);
  const picture = rubric.media ? undefined : pickPicture(project, rubric, topic, history);
  const media: Media | undefined = rubric.media ?? (picture && { type: "IMAGE", url: picture.url });
  const detective = project.id === "buro" ? pickDetectiveRef(history, project.forceNextRef) : undefined;
  const promoCode = promoCodeForRubric(rubric.id, nextCode, promoScheduled, forcedRubric);
  const promoLeft = promoCode ? OLOID_APP_STORE_CODES.length - spent.length - 1 : undefined;
  const base = { project, rubricId: rubric.id, topic, topicTag, media, promoCode, promoLeft };

  if (rubric.id === OLOID_APP_STORE_PROMO_RUBRIC && !promoCode) {
    const why = usedAppStoreCodes === null ? "список кодов в Redis недоступен, код не показываю" : "коды App Store закончились";
    return { ...base, text: null, rejected: [why] };
  }

  let feedback: string | undefined;
  const rejected: string[] = [];

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = await draftPost(project, rubric, history, now, feedback, topic, channel.voiceNote, linkContent, picture?.about, detective?.hint, promoCode);
    const problem =
      ruleCheck(candidate, project, now, rubric, linkContent, promoCode) ??
      appStoreCodeProblem(candidate, project.id, rubric.id, promoCode) ??
      appStorePriceProblem(candidate, project.id, rubric.id) ??
      appStoreMomentProblem(candidate, project.id, rubric.id) ??
      (detective ? detectiveRefProblem(candidate, history, detective) : null) ??
      repeatedEnding(candidate, history, project.id) ??
      tooSimilar(candidate, history) ??
      (await factCheck(candidate, project, picture?.about, now, { rubricId: rubric.id, promoCode }));
    if (!problem) return { ...base, text: candidate, rejected };
    feedback = problem;
    rejected.push(`${problem}: ${candidate}`);
  }
  return { ...base, text: null, rejected };
}
