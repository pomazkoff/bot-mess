// Обычные посты «Олоида»: очередь рубрик, тихий пост, календарь, тон слота, опрос.
// App Store, VK Play и трейлер сюда не входят.

import { OLOID_DEV_NUMBER_FACTS, OLOID_DEV_NUMBERS_RUBRIC } from "./devFacts.js";
import { OLOID_PROVOCATION_RUBRIC, type Project, type Rubric } from "./projects.js";

/** Порядок — тай-брейк, когда рубрику ещё не постили. Первая в списке выходит первой. */
export const OLOID_ROTATION_ORDER = ["backstage", "detail", "line", "ask", "petersburg", OLOID_DEV_NUMBERS_RUBRIC] as const;

export const OLOID_LINE_RUBRIC = "line";
export const OLOID_ASK_RUBRIC = "ask";

export const OLOID_QUIET_EVERY = 3;

/**
 * Дословные реплики персонажей без спойлера. Пусто — рубрика «реплика дня» не выбирается.
 * В фактах есть обрывок «всё будет» у Вити из мини-игры: это пометка соседа, не реплика для поста.
 * Новую строку добавлять только если она уже написана в фактах целиком.
 */
export type CharacterLine = { id: string; speaker: string; line: string; note: string };
export const OLOID_CHARACTER_LINES: readonly CharacterLine[] = [];

export type PollAttachment = {
  option_a: string;
  option_b: string;
  option_c?: string;
  option_d?: string;
};

export type SlotTone = "morning" | "day" | "evening";

export type DateHook = {
  id: string;
  label: string;
  matches: (mskDay: string) => boolean;
  steer: string;
};

const md = (mskDay: string) => mskDay.slice(5);

/** Один повод за календарный год МСК. Отмечается в Redis только после успешной публикации. */
export const OLOID_DATE_HOOKS: readonly DateHook[] = [
  {
    id: "halloween",
    label: "31.10 Хэллоуин",
    matches: (day) => md(day) === "10-31",
    steer:
      "Сегодня 31 октября, Хэллоуин. Повод — мистика старого дома, не хоррор: тишина, чужая дверь, ощущение, что квартира помнит. Нельзя «хоррор», horror, «ужастик», кровь, монстры, пожар, финал, скелет. Не пиши, что игра про Хэллоуин и что команда его праздновала.",
  },
  {
    id: "unity-day",
    label: "04.11 День народного единства",
    matches: (day) => md(day) === "11-04",
    steer:
      "Сегодня 4 ноября, День народного единства. Можно одной фразой про городской выходной и Петербург, без политики, лозунгов и выдуманных мероприятий. Не связывай праздник с сюжетом игры и не добавляй чисел, которых нет в факте этого поста.",
  },
  {
    id: "first-snow",
    label: "первый снег",
    matches: (day) => md(day) >= "11-18" && md(day) <= "11-24",
    steer:
      "Повод — первый снег как ноябрьское настроение. Этот повод за год берётся один раз. Не пиши, что снег выпал сегодня в конкретном месте: этого нет в фактах. Можно про тихий двор. Без выдуманной погоды и без новых чисел, если пост про одну цифру.",
  },
  {
    id: "new-year-eve",
    label: "канун Нового года",
    matches: (day) => md(day) === "12-31",
    steer:
      "Сегодня канун Нового года. Можно про старый дом и тихий вечер. Без скидок, без обещаний и без выдуманного праздника команды. Цену не называй. Чисел сверх факта этого поста не добавляй.",
  },
];

export function isOloidRotationRubric(id: string): boolean {
  return (OLOID_ROTATION_ORDER as readonly string[]).includes(id);
}

/** Форматы провокации. Порядок — тай-брейк LRU: кого ещё не постили, тот первый. */
export type ProvocationFormat = { id: string; label: string; steer: string };

export const OLOID_PROVOCATION_FORMATS: readonly ProvocationFormat[] = [
  {
    id: "opinion",
    label: "спорное мнение",
    steer:
      "Спорное мнение про визуальные новеллы или инди-игры. Смысл образца, не цитата: «визуальные новеллы — это не игры? мы так не думаем». Своими словами. Позиция команды, без оскорбления тех, кто думает иначе.",
  },
  {
    id: "side",
    label: "выбор стороны",
    steer:
      "Острый вопрос, где читатель выбирает сторону. Две ясные позиции про игры, жанр или разработку. Не про сюжет «Олоида» и не про политику. Слово «выборы» не пиши: это не про голосование.",
  },
  {
    id: "unpopular",
    label: "непопулярное мнение",
    steer:
      "Непопулярное мнение команды про игры, жанр, разработку, Петербург или мистику. От «мы», не от «я». Это мнение, не новый факт и не цифра.",
  },
  {
    id: "would-you",
    label: "а вы бы",
    steer:
      "Поляризующее «а вы бы…?»: читатель примеряет выбор на себя. Про игры, старый дом, Петербург, мистику или то, как играют. Без спойлера.",
  },
];

/** Сколько провокаций уже вышло. Счёт с нуля: чётные — опрос, нечётные — ссылка. */
export function countProvocationPosts(history: readonly { rubric?: string }[]): number {
  return history.filter((item) => item.rubric === OLOID_PROVOCATION_RUBRIC).length;
}

/** 1-й, 3-й, 5-й… успешный пост этой рубрики — опрос. Соседний пост — нет. */
export function provocationWantsPoll(publishedCount: number): boolean {
  if (!Number.isFinite(publishedCount) || publishedCount < 0) return true;
  return Math.floor(publishedCount) % 2 === 0;
}

/** Ссылка не чаще чем через один: 2-й, 4-й, 6-й…. На опросе ссылки нет. */
export function provocationHasLink(publishedCount: number): boolean {
  if (!Number.isFinite(publishedCount) || publishedCount < 0) return false;
  return Math.floor(publishedCount) % 2 === 1;
}

/** Рубрики, которые сейчас можно поставить в автослот. «Реплика» и «цифры» выпадают, пока их списки пусты. */
export function eligibleRotationRubrics(project: Project): Rubric[] {
  return OLOID_ROTATION_ORDER.flatMap((id) => {
    if (id === OLOID_LINE_RUBRIC && OLOID_CHARACTER_LINES.length === 0) return [];
    if (id === OLOID_DEV_NUMBERS_RUBRIC && OLOID_DEV_NUMBER_FACTS.length === 0) return [];
    const rubric = project.rubrics.find((item) => item.id === id);
    return rubric ? [rubric] : [];
  });
}

export function pickLeastRecent<T extends { id: string }>(
  items: readonly T[],
  lastUsed: Readonly<Record<string, string | undefined>>,
): T {
  if (!items.length) throw new Error("пустой список для очереди");
  const stamp = (id: string) => {
    const raw = lastUsed[id];
    if (!raw) return 0;
    const at = Date.parse(raw);
    return Number.isNaN(at) ? 0 : at;
  };
  let best = items[0];
  let bestAt = stamp(best.id);
  for (const item of items.slice(1)) {
    const at = stamp(item.id);
    if (at < bestAt) {
      best = item;
      bestAt = at;
    }
  }
  return best;
}

/** Redis побеждает, если метка новее. События из истории дописывают дыры. */
export function mergeLastUsed(
  redis: Readonly<Record<string, string | undefined>>,
  events: readonly { id?: string; at?: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (id: string | undefined, at: string | undefined) => {
    if (!id || !at || Number.isNaN(Date.parse(at))) return;
    const prev = out[id];
    if (!prev || Date.parse(at) > Date.parse(prev)) out[id] = at;
  };
  for (const [id, at] of Object.entries(redis)) put(id, at);
  for (const event of events) put(event.id, event.at);
  return out;
}

/** Индекс уже вышедших обычных постов. 2, 5, 8… — этот пост без ссылки и без призыва. */
export function regularPostIsQuiet(publishedRegularCount: number): boolean {
  if (!Number.isFinite(publishedRegularCount) || publishedRegularCount < 0) return false;
  return publishedRegularCount % OLOID_QUIET_EVERY === OLOID_QUIET_EVERY - 1;
}

export function countRegularPosts(history: readonly { rubric?: string }[]): number {
  return history.filter((item) => item.rubric && isOloidRotationRubric(item.rubric)).length;
}

export function usedDateHookIds(
  mskDay: string,
  redis: Readonly<Record<string, string>>,
  history: readonly { dateHook?: string; at?: string }[],
): string[] {
  const year = mskDay.slice(0, 4);
  const ids = new Set<string>();
  for (const [id, day] of Object.entries(redis)) if (day.startsWith(year)) ids.add(id);
  for (const item of history) {
    if (!item.dateHook || !item.at) continue;
    const at = Date.parse(item.at);
    if (Number.isNaN(at)) continue;
    const hookYear = new Date(at + 3 * 60 * 60 * 1000).getUTCFullYear().toString();
    if (hookYear === year) ids.add(item.dateHook);
  }
  return [...ids];
}

export function matchingDateHook(mskDay: string, usedIds: readonly string[]): DateHook | null {
  for (const hook of OLOID_DATE_HOOKS) {
    if (!hook.matches(mskDay)) continue;
    if (usedIds.includes(hook.id)) continue;
    return hook;
  }
  return null;
}

export function oloidSlotTone(hourMsk: number): SlotTone {
  if (hourMsk < 12) return "morning";
  if (hourMsk >= 18) return "evening";
  return "day";
}

export function slotToneNote(tone: SlotTone, opts?: { store?: boolean; numbersOnly?: boolean }): string {
  if (opts?.numbersOnly) {
    if (tone === "morning") return "Утренний слот: короче и легче. Новых чисел это не разрешает.";
    if (tone === "evening") return "Вечерний слот: тон чуть атмосфернее. Слово «наушники» можно, только если не появляется чисел сверх выбранного факта.";
    return "Дневной слот: обычный голос. Новых чисел это не разрешает.";
  }
  if (tone === "morning") {
    return opts?.store
      ? "Утренний слот: тон короче и легче, без тяжёлой атмосферы. Правила этой рубрики важнее этой пометки."
      : "Утренний слот: пост короче обычного и легче. Без тяжёлой атмосферы. Две-три короткие фразы.";
  }
  if (tone === "evening") {
    return "Вечерний слот, «для наушников»: можно гуще по атмосфере и опереться на факт, что играть лучше в наушниках и что половина работы — звук. Без хоррора, пожара и финала.";
  }
  return "Дневной слот: обычный голос, без утренней укороченности и без вечерней густоты.";
}

const QUIET_CTA =
  /oloid-game\.ru|kommunalka-game\.ru|apps\.apple\.com|vkplay\.ru|(?<![\p{L}])скачай(?:те)?(?![\p{L}])|(?<![\p{L}])скачать(?![\p{L}])|(?<![\p{L}])скачива\p{L}*(?![\p{L}])|(?<![\p{L}])загляни(?:те)?(?![\p{L}])|(?<![\p{L}])заходи(?:те)?(?![\p{L}])|(?<![\p{L}])переходи(?:те)?(?![\p{L}])|по\s+ссылке|(?<![\p{L}])приглаша\p{L}*(?![\p{L}])|в\s+app\s*store|(?<![\p{L}])успей(?:те)?(?![\p{L}])|не\s+пропусти/iu;

/** Тихий пост: ни URL, ни призыва скачать или перейти. Вопрос читателю — не призыв. */
export function quietProblem(text: string): string | null {
  if (/https?:\/\//i.test(text)) return "тихий пост: без ссылки";
  if (QUIET_CTA.test(text)) return "тихий пост: без призыва";
  return null;
}

const HORROR = /хоррор|horror|ужастик|игра\s+ужасов/iu;
const FIRE = /пожар|(?<![\p{L}])огон(?:ь|я|ю|ем|и)(?![\p{L}])/iu;
const FINALE = /финал|концовк|развязк/iu;
const AI = /нейросет|искусственн\p{L}*\s+интеллект|(?<![\p{L}])ии(?![\p{L}])|(?<![\p{L}])ai(?![\p{L}])/iu;
const AI_ALLOWED = /ии использовался как инструмент/giu;

/** Мистика, не хоррор; без пожара, финала, скелета и вольного ИИ. */
export function oloidContentSafetyProblem(text: string): string | null {
  if (HORROR.test(text)) return "не хоррор: мистика, без слова «хоррор»";
  if (FIRE.test(text)) return "пожар и огонь не упоминать";
  if (FINALE.test(text)) return "финал и концовку не упоминать";
  if (/скелет/iu.test(text)) return "скелет не упоминать";
  if (/достижен/iu.test(text)) return "достижения не упоминать";
  if (/тайной\s+комнат|тайную\s+комнат|тайная\s+комнат|в\s+нише/iu.test(text)) return "тайную комнату и природу артефакта не раскрывать";
  const rest = text.replace(AI_ALLOWED, "");
  if (AI.test(rest)) return "про ИИ можно только фразу «ИИ использовался как инструмент»";
  return null;
}

/** Обычные рубрики: те же запреты содержания. Магазины и трейлер сюда не входят. */
export function rotationSafetyProblem(text: string, rubricId: string): string | null {
  if (!isOloidRotationRubric(rubricId)) return null;
  return oloidContentSafetyProblem(text);
}

// Политика, религия, оскорбления групп и мат. «Выбор» и «Вера» не входят: это не «выборы» и не религия.
const POLITICS =
  /(?<![\p{L}])(?:политик\p{L}*|политическ\p{L}*|политтехнолог\p{L}*|выбор(?:ы|ов|ам|ами|ах)|избирател\p{L}*|голосован\p{L}*|депутат\p{L}*|госдум\p{L}*|кремл\p{L}*|оппозиц\p{L}*|пропаганд\p{L}*|идеолог\p{L}*|революц\p{L}*|санкци\p{L}*|путин\p{L}*|навальн\p{L}*|зеленск\p{L}*|трамп\p{L}*|байден\p{L}*|нацист\p{L}*|фашист\p{L}*|расист\p{L}*|войн(?:а|ы|е|у|ой|ами|ах))(?![\p{L}])/iu;
const RELIGION =
  /(?<![\p{L}])(?:религи\p{L}*|церков\p{L}*|храм\p{L}*|мечет\p{L}*|синагог\p{L}*|молитв\p{L}*|аллах\p{L}*|иисус\p{L}*|христ\p{L}*|православ\p{L}*|мусульман\p{L}*|иудаизм\p{L}*|иуде\p{L}*|будд\p{L}*|атеист\p{L}*|священн\p{L}*|бог(?:а|у|ом|и|ов|ам|ами|ах)?|боже)(?![\p{L}])/iu;
const INSULT =
  /(?<![\p{L}])(?:идиот\p{L}*|дебил\p{L}*|мраз\p{L}*|урод(?:а|у|ом|ы|ов|ец|ка|ки|ку|кой)?|быдл\p{L}*|нищеброд\p{L}*|тупиц\p{L}*|пидор\p{L}*|пидар\p{L}*|гомик\p{L}*|хач(?:и|ей|ам|ами|ах)?|чурк(?:а|и|е|у|ой|ам|ами)?|жид(?:а|у|ом|ы|ов|ам|ами|ах|е)?|ниггер\p{L}*|негр(?:а|у|ом|ы|ов|е|и)?|хохл(?:а|у|ом|ы|ов|ам|ами|ах|е)?|москал\p{L}*|сук(?:а|и|е|у|ой)|мудак\p{L}*|хуй\p{L}*|пизд\p{L}*|бля(?:дь|ть)|[её]ба\p{L}*)(?![\p{L}])/iu;
const PROVOCATION_CTA =
  /(?<![\p{L}])скачай(?:те)?(?![\p{L}])|(?<![\p{L}])скачать(?![\p{L}])|(?<![\p{L}])скачива\p{L}*(?![\p{L}])|(?<![\p{L}])загляни(?:те)?(?![\p{L}])|(?<![\p{L}])заходи(?:те)?(?![\p{L}])|(?<![\p{L}])переходи(?:те)?(?![\p{L}])|по\s+ссылке|(?<![\p{L}])успей(?:те)?(?![\p{L}])|не\s+пропусти/iu;

/** Политика, религия, оскорбления и мат — пост с ними не публикуем. */
export function provocationLexiconProblem(text: string): string | null {
  if (POLITICS.test(text)) return "политика: такой пост не публикуем";
  if (RELIGION.test(text)) return "религия: такой пост не публикуем";
  if (INSULT.test(text)) return "оскорбление или мат: такой пост не публикуем";
  return null;
}

/** Провокация: лексикон, спойлеры обычных рубрик и призыв скачать. Ссылку проверяет ruleCheck отдельно. */
export function provocationProblem(text: string): string | null {
  return (
    provocationLexiconProblem(text) ??
    oloidContentSafetyProblem(text) ??
    (PROVOCATION_CTA.test(text) ? "провокация: без призыва скачать или перейти" : null)
  );
}

const POLL_OPTION_MAX = 25;

/**
 * Документация Threads (Polls, 13.10.2026): 1–25 символов.
 * Лимит текста поста Meta считает в байтах UTF-8. Кириллица — два байта,
 * поэтому вариант из 13–25 русских букв (26–50 байт) контейнер с опросом отвергает.
 * Режем и по символам, и по байтам: так вариант проходит при любом из двух подсчётов.
 */
function pollOptionTooLong(option: string): boolean {
  return [...option].length > POLL_OPTION_MAX || new TextEncoder().encode(option).length > POLL_OPTION_MAX;
}

/** 2–4 варианта, каждый 1–25 символов и не длиннее 25 байт UTF-8. Без чисел: опрос не источник фактов. */
export function pollOptionsProblem(options: readonly string[] | undefined): string | null {
  if (!options || options.length < 2 || options.length > 4) return "опрос: нужно 2–4 варианта";
  const cleaned = options.map((option) => option.trim());
  if (cleaned.some((option) => option.length < 1 || pollOptionTooLong(option))) {
    return "опрос: каждый вариант от 1 до 25 символов и не длиннее 25 байт UTF-8";
  }
  if (cleaned.some((option) => /[\r\n]/.test(option))) return "опрос: вариант в одну строку";
  if (new Set(cleaned.map((option) => option.toLowerCase())).size !== cleaned.length) return "опрос: варианты повторяются";
  const blob = cleaned.join("\n");
  if (/https?:|\d|₽|хоррор|horror|пожар|финал|скелет|шпател|нейросет|(?<![\p{L}])ии(?![\p{L}])/iu.test(blob)) {
    return "опрос: варианты без чисел, ссылок, цены, спойлеров и шпателя";
  }
  return null;
}

export function toPollAttachment(options: readonly string[]): PollAttachment {
  const [a, b, c, d] = options.map((option) => option.trim());
  const poll: PollAttachment = { option_a: a, option_b: b };
  if (c) poll.option_c = c;
  if (d) poll.option_d = d;
  return poll;
}

export function pickCharacterLine(lastUsed: Readonly<Record<string, string | undefined>>): CharacterLine | null {
  if (!OLOID_CHARACTER_LINES.length) return null;
  return pickLeastRecent(OLOID_CHARACTER_LINES, lastUsed);
}

const STORE_TONE_RUBRICS = new Set(["appstore", "appstore-promo", "vkplay", "trailer"]);

export function toneNoteForRubric(tone: SlotTone, rubricId: string): string {
  if (rubricId === OLOID_PROVOCATION_RUBRIC) {
    return "Слот провокации: спорный тезис или вопрос, коротко. Атмосфера не вместо спора. Новых чисел тон не разрешает.";
  }
  return slotToneNote(tone, {
    store: STORE_TONE_RUBRICS.has(rubricId),
    numbersOnly: rubricId === OLOID_DEV_NUMBERS_RUBRIC,
  });
}
