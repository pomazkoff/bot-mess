// Антиповтор «Олоида»: редкие факты по LRU и конкретные детали последних постов.
// Паспорт в lib/projects.ts остаётся полным списком. В промпт обычного слота
// попадают общие факты и несколько давно не выходивших эпизодов.
// Фактчек по-прежнему видит весь паспорт: здесь только отбор и механический повтор.

import { OLOID_DEV_NUMBERS_RUBRIC } from "./devFacts.js";
import { isOloidEditorialRubric } from "./oloidEditorial.js";
import { OLOID_PROVOCATION_RUBRIC } from "./projects.js";
import type { HistoryItem } from "./store.js";

/** Реже, чем раз в несколько дней: один и тот же эпизод не предлагаем и не пропускаем. */
export const OLOID_FACT_COOLDOWN_DAYS = 3;
const COOLDOWN_MS = OLOID_FACT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/** Сколько редких эпизодов класть в один пост. Остальные ждут очереди. */
export const OLOID_COLOR_FACTS_PER_POST = 4;

/** Окно антиповтора предметов и сцен: последние посты «Олоида», новые сверху. */
export const OLOID_DETAIL_LOOKBACK = 10;

export type OloidDetail = {
  id: string;
  /** Как сказать модели и в причине отклонения. */
  label: string;
  pattern: RegExp;
};

/**
 * Конкретные предметы и сцены, не каркас поста.
 * «Олоид», Егор, Петербург, коммуналка, наушники и «звук» сюда не входят:
 * на них держатся рубрики и вечерний тон.
 */
export const OLOID_DETAILS: readonly OloidDetail[] = [
  { id: "spatula", label: "шпатель", pattern: /шпател/iu },
  { id: "nails", label: "гвозди", pattern: /гвозд/iu },
  { id: "plywood", label: "фанера", pattern: /фанер/iu },
  { id: "table-yank", label: "стол рывками", pattern: /рывк/iu },
  { id: "table-pull", label: "стол на себя", pattern: /стол[^\n]{0,40}на себя|тянуть его на себя/iu },
  { id: "flashlight", label: "фонарь", pattern: /фонар/iu },
  { id: "oilcloth", label: "клеёнка", pattern: /клеён|клеен/iu },
  { id: "washer", label: "стиральная машина", pattern: /стиральн/iu },
  { id: "cloth", label: "скатерть", pattern: /скатерт/iu },
  { id: "thonet", label: "стул Тонета", pattern: /тонет|венск/iu },
  { id: "meter", label: "электросчётчик", pattern: /сч[её]тчик/iu },
  { id: "vacuum", label: "пылесос", pattern: /пылесос/iu },
  { id: "bulb", label: "лампочка", pattern: /лампочк/iu },
  { id: "parquet", label: "паркет", pattern: /паркет/iu },
  { id: "yard", label: "двор-колодец", pattern: /колодц|(?<![\p{L}])двор(?![\p{L}])/iu },
  { id: "front-stair", label: "парадная", pattern: /парадн/iu },
  { id: "back-stair", label: "чёрный ход", pattern: /ч[её]рн\p{L}*\s+ход/iu },
  { id: "konyushennaya", label: "Конюшенная", pattern: /конюшен/iu },
  { id: "fan-zone", label: "фан-зона", pattern: /фан[-\s]?зон/iu },
  { id: "slag", label: "шлаковая засыпка", pattern: /шлаков/iu },
  { id: "glossary", label: "глоссарий", pattern: /глоссар/iu },
  { id: "slippers", label: "тапки и кроссовки", pattern: /тапк|кроссов/iu },
  { id: "tanks", label: "танчики", pattern: /танчик/iu },
  { id: "kerosene", label: "керосинка", pattern: /керосин/iu },
  { id: "jam", label: "варенье", pattern: /варень/iu },
  { id: "tapes", label: "кассеты", pattern: /кассет/iu },
  { id: "sprites", label: "спрайты", pattern: /спрайт/iu },
  { id: "brush", label: "мазок", pattern: /мазок/iu },
  { id: "excursion", label: "экскурсии", pattern: /экскурс/iu },
  { id: "dubs", label: "дубли озвучки", pattern: /дубл/iu },
  { id: "wallpaper", label: "обои", pattern: /обо(?:и|ев|ям|ями|ях)/iu },
  { id: "tenement", label: "доходный дом", pattern: /доходн/iu },
  { id: "oil-paint", label: "масляная живопись", pattern: /маслян/iu },
  { id: "disco", label: "Disco Elysium", pattern: /disco|elysium/iu },
  { id: "bunny", label: "«Зайчик»", pattern: /зайчик/iu },
  { id: "sealed", label: "замурованная комната", pattern: /замуров/iu },
  { id: "skeleton", label: "скелет", pattern: /скелет/iu },
  { id: "kitchen", label: "кухня", pattern: /кухн/iu },
  { id: "corridor", label: "коридор", pattern: /коридор/iu },
  { id: "bar", label: "бар", pattern: /(?<![\p{L}])бар(?![\p{L}])|рюмочн/iu },
  { id: "lines-1600", label: "1600 реплик", pattern: /1600/ },
  { id: "playtime", label: "2–3 часа", pattern: /2\s*[–—-]\s*3\s*час/iu },
  { id: "articles-45", label: "45 статей", pattern: /45\s+стат/iu },
  { id: "morning-minutes", label: "4–6 минут", pattern: /4\s*[–—-]\s*6\s*мин/iu },
  { id: "dubs-1500", label: "1500 дублей", pattern: /1500/ },
];

export type RotatingFact = {
  id: string;
  label: string;
  /** Уникальный фрагмент строки в facts. Один факт — одна игла. */
  needle: string;
  /** След в уже вышедшем посте: по нему факт считается использованным (и для старых записей без factIds).
   *  Нет поля — факт отслеживается только по id в HistoryItem.factIds. */
  mark?: RegExp;
  /** Тема рубрики, которой этот факт нужен: при такой теме факт кладётся в промпт вне очереди. */
  topicMark?: RegExp;
};

/**
 * Редкие эпизоды. Общие факты (кто герой, город, магазины, сайт, «движение руки» без примера)
 * в этот список не входят и остаются в каждом посте.
 * needle должен встречаться ровно в одной строке паспорта.
 */
export const OLOID_ROTATING_FACTS: readonly RotatingFact[] = [
  { id: "table-yank", label: "стол рывками", needle: "стол рывками", mark: /рывк/iu },
  { id: "flashlight", label: "фонарь", needle: "светить фонарём", mark: /фонар/iu },
  { id: "lines-1600", label: "1600 реплик", needle: "1600 реплик", mark: /1600/ },
  { id: "glossary", label: "глоссарий", needle: "45 статей", mark: /глоссар|45\s+стат/iu },
  { id: "oil-paint", label: "масляная живопись", needle: "интерфейс теплеет", mark: /маслян|интерфейс теплеет/iu },
  { id: "musician", label: "музыкант", needle: "профессиональный музыкант", mark: /музыкант/iu },
  { id: "playtime", label: "2–3 часа", needle: "2–3 часов", mark: /2\s*[–—-]\s*3\s*час/iu },
  { id: "disco", label: "Disco Elysium", needle: "Визуальный ориентир", mark: /disco|elysium|визуальн\p{L}*\s+ориентир/iu },
  { id: "audience", label: "кому зайдёт", needle: "кому понравится", mark: /кому понравится|старые дома и петербург/iu },
  { id: "aftertaste", label: "после прохождения", needle: "что хочется оставить", mark: /что хочется оставить|кто жил там до него/iu },
  { id: "difference", label: "чем отличается", needle: "чем «Олоид» отличается", mark: /чем «олоид» отличается|глоссарий реалий/iu },
  { id: "plot-or-mood", label: "сюжет или атмосфера", needle: "сюжет или атмосфера", mark: /сюжет или атмосфера|держит игру детективная/iu },
  { id: "bunny", label: "«Зайчик»", needle: "если вам нравятся", mark: /зайчик/iu },
  { id: "mini-promo", label: "утро понедельника", needle: "утро понедельника", mark: /утро понедельника|kommunalka-game/iu },
  { id: "mini-time", label: "4–6 минут", needle: "4–6 минут", mark: /4\s*[–—-]\s*6\s*мин/iu },
  { id: "neighbors", label: "соседи мини-игры", needle: "Соседи в мини-игре", mark: /серафим|керосин/iu },
  { id: "remembers", label: "квартира помнит", needle: "квартира помнит", mark: /квартира помнит/iu },
  { id: "design-system", label: "дизайн-система мини-игры", needle: "дизайн-системе", mark: /дизайн-систем/iu },
  { id: "research", label: "что изучали", needle: "Ради игры изучали", mark: /ради игры изучали|шлаков/iu },
  { id: "excursions", label: "экскурсии", needle: "экскурсии по петербургским", mark: /экскурс/iu },
  { id: "sprites", label: "спрайты под мазок", needle: "спрайты и постановку", mark: /спрайт|под мазок/iu },
  { id: "plywood", label: "фанера протяжкой", needle: "Мини-игру с фанерой", mark: /фанер/iu },
  { id: "unnoticed", label: "мелочи кадра", needle: "Мелочи, которые игрок", mark: /точки осмотра пульсируют|танчик/iu },
  { id: "harder", label: "сложнее, чем думали", needle: "Сложнее, чем думали", mark: /тестер провёл|1500 дубл/iu },
  // Хвост отфильтрованного списка: та же очередь, отдельные иглы. Следов в тексте нет: очередь по id (HistoryItem.factIds).
  // Достижения убраны из паспорта (Илья, 2026-11-02): запрет «достижения не упоминать» остаётся.
  { id: "extra-01", label: 'Пять раз', needle: 'Пять раз', topicMark: /пять разделов/iu },
  { id: "extra-02", label: 'Статья г', needle: 'Статья г' },
  { id: "extra-03", label: 'Непрочит', needle: 'Непрочит' },
  { id: "extra-04", label: 'Открытые', needle: 'Открытые' },
  { id: "extra-05", label: 'ссарии р', needle: 'ссарии р', topicMark: /пять разделов/iu },
  { id: "extra-06", label: 'сария «Г', needle: 'сария «Г' },
  { id: "extra-07", label: 'ь статьи', needle: 'ь статьи' },
  { id: "extra-08", label: 'статья «', needle: 'статья «' },
  { id: "extra-09", label: 'статья п', needle: 'статья п' },
  { id: "extra-10", label: 'сария «К', needle: 'сария «К' },
  { id: "extra-11", label: 'У «Танчи', needle: 'У «Танчи' },
  { id: "extra-12", label: 'сария «Р', needle: 'сария «Р', topicMark: /пять разделов/iu },
  { id: "extra-13", label: 'татья «Л', needle: 'татья «Л' },
  { id: "extra-14", label: 'Есть пол', needle: 'Есть пол' },
  { id: "extra-15", label: 'Двор-кол', needle: 'Двор-кол', topicMark: /двор-колодец в четырёх/iu },
  { id: "extra-16", label: 'Дом в иг', needle: 'Дом в иг' },
  { id: "extra-17", label: 'Адрес в ', needle: 'Адрес в ' },
  { id: "extra-18", label: 'Рюмочная', needle: 'Рюмочная' },
  { id: "extra-19", label: 'е есть н', needle: 'е есть н' },
  { id: "extra-20", label: 'артира А', needle: 'артира А' },
  { id: "extra-21", label: 'Кабинет ', needle: 'Кабинет ' },
  { id: "extra-22", label: 'Коридор ', needle: 'Коридор ' },
  { id: "extra-23", label: 'Пыль в в', needle: 'Пыль в в' },
  { id: "extra-24", label: 'Салон ма', needle: 'Салон ма', topicMark: /салон машины/iu },
  { id: "extra-25", label: 'Ёлочка-а', needle: 'Ёлочка-а', topicMark: /салон машины/iu },
  { id: "extra-26", label: 'Оживший ', needle: 'Оживший ' },
  { id: "extra-27", label: 'Радио в ', needle: 'Радио в ', topicMark: /радио с нарисованной/iu },
  { id: "extra-28", label: 'Шагов в ', needle: 'Шагов в ', topicMark: /видов шагов|звук старого дома/iu },
  { id: "extra-29", label: 'За окном', needle: 'За окном' },
  { id: "extra-30", label: 'Пение пт', needle: 'Пение пт', topicMark: /птицы во дворе/iu },
  { id: "extra-31", label: 'Для танч', needle: 'Для танч' },
  { id: "extra-32", label: 'Пенальти', needle: 'Пенальти' },
  { id: "extra-33", label: 'Три вида', needle: 'Три вида', topicMark: /сердцебиен/iu },
  { id: "extra-34", label: 'Пять зву', needle: 'Пять зву', topicMark: /звуков дверей|звук старого дома/iu },
  { id: "extra-35", label: 'Пробный ', needle: 'Пробный ' },
  { id: "extra-36", label: 'У семьи ', needle: 'У семьи ', topicMark: /саундтрек/iu },
  { id: "extra-37", label: 'В саундт', needle: 'В саундт', topicMark: /саундтрек/iu },
  { id: "extra-38", label: 'Под заст', needle: 'Под заст' },
  { id: "extra-39", label: 'Под титр', needle: 'Под титр' },
  { id: "extra-40", label: 'Английск', needle: 'Английск' },
  { id: "extra-41", label: 'Семейное', needle: 'Семейное', topicMark: /семейное древо/iu },
  { id: "extra-42", label: 'Древо ви', needle: 'Древо ви', topicMark: /семейное древо/iu },
  { id: "extra-43", label: 'Когда др', needle: 'Когда др' },
  { id: "extra-44", label: 'Инвентар', needle: 'Инвентар', topicMark: /инвентар/iu },
  { id: "extra-45", label: 'У каждог', needle: 'У каждог', topicMark: /инвентар/iu },
  { id: "extra-46", label: 'Предметы', needle: 'Предметы', topicMark: /инвентар/iu },
  { id: "extra-47", label: 'Записи р', needle: 'Записи р' },
  { id: "extra-48", label: 'На iPhon', needle: 'На iPhon' },
  { id: "extra-49", label: 'Ускорени', needle: 'Ускорени' },
  { id: "extra-50", label: 'Заставка', needle: 'Заставка' },
  { id: "extra-51", label: 'Заставку', needle: 'Заставку' },
  { id: "extra-52", label: 'В титрах', needle: 'В титрах' },
  { id: "extra-53", label: 'Танчики ', needle: 'Танчики ' },
  { id: "extra-54", label: 'Семья ге', needle: 'Семья ге' },
  { id: "extra-55", label: 'У Феди е', needle: 'У Феди е' },
  { id: "extra-56", label: 'Следоват', needle: 'Следоват' },
  { id: "extra-57", label: 'Среди эм', needle: 'Среди эм' },
  { id: "extra-73", label: 'татья «О', needle: 'татья «О' },
  { id: "extra-74", label: 'Олоид во', needle: 'Олоид во' },
  { id: "extra-75", label: 'Ремонтны', needle: 'Ремонтны' },
  { id: "extra-76", label: 'Сейф соб', needle: 'Сейф соб' },
  { id: "extra-77", label: 'У олоида', needle: 'У олоида' },
  { id: "extra-78", label: 'У сейфа ', needle: 'У сейфа ' },
  { id: "extra-79", label: 'Зажигалк', needle: 'Зажигалк' },
  { id: "extra-80", label: 'Выборы э', needle: 'Выборы э' },
  { id: "extra-81", label: 'Если зап', needle: 'Если зап' },
  { id: "extra-82", label: 'Голосов ', needle: 'Голосов ' },
  { id: "extra-83", label: 'Геймпадо', needle: 'Геймпадо' },
];

export type OloidPromptFacts = {
  /** Общие факты и выбранные редкие эпизоды — то, что видит генерация. */
  facts: string[];
  /** Редкие эпизоды этого поста, от самых давно не выходивших. */
  color: string[];
  /** id редких эпизодов этого поста. Пишутся в HistoryItem.factIds после публикации — по ним идёт очередь. */
  ids: string[];
};

function oloidPosts(history: readonly HistoryItem[]): HistoryItem[] {
  return history.filter((item) => item.project === "oloid" && typeof item.text === "string");
}

/** Последний пост, где след факта есть в тексте. Только для фактов со следом: настоящее упоминание, не выдача в промпт. */
function lastMarkAt(mark: RegExp | undefined, history: readonly HistoryItem[]): number | null {
  if (!mark) return null;
  for (const item of oloidPosts(history)) {
    if (!mark.test(item.text)) continue;
    const at = Date.parse(item.at);
    if (!Number.isNaN(at)) return at;
  }
  return null;
}

/** Когда факт последний раз выдавали в промпт (factIds) или упоминали в тексте (след, для старой истории). null — не было. */
export function factLastUsedAt(spec: RotatingFact, history: readonly HistoryItem[]): number | null {
  for (const item of oloidPosts(history)) {
    const byId = Array.isArray(item.factIds) && item.factIds.includes(spec.id);
    if (!byId && !(spec.mark && spec.mark.test(item.text))) continue;
    const at = Date.parse(item.at);
    if (!Number.isNaN(at)) return at;
  }
  return null;
}

/** След факта в тексте моложе срока: факт реально упоминался недавно. */
function cooled(mark: RegExp | undefined, history: readonly HistoryItem[], now: Date): boolean {
  const at = lastMarkAt(mark, history);
  if (at == null) return false;
  return now.getTime() - at < COOLDOWN_MS;
}

/** Факт выдавали или упоминали моложе срока — в очередь не ставим. */
function factCooled(spec: RotatingFact, history: readonly HistoryItem[], now: Date): boolean {
  const at = factLastUsedAt(spec, history);
  if (at == null) return false;
  return now.getTime() - at < COOLDOWN_MS;
}

/** Общие факты и до четырёх редких эпизодов: дольше всех не выдававшиеся, при равенстве — случайно.
 *  topic — тема поста: факты с подходящим topicMark кладутся вне очереди (тема без них не пишется).
 *  random — источник случайности для ничьих (в проверках — детерминированный). */
export function oloidPromptFacts(
  facts: readonly string[],
  history: readonly HistoryItem[],
  now: Date,
  opts?: { rubricId?: string; topic?: string; random?: () => number },
): OloidPromptFacts {
  const anchors = facts.filter((fact) => !OLOID_ROTATING_FACTS.some((spec) => fact.includes(spec.needle)));
  // Пост цифр говорит ровно одну цифру. Чужой эпизод приносит лишние числа.
  // Дневник, кадр и отзыв берут свой одобренный источник, а не редкий факт: очередь фактов их не тратит.
  if (opts?.rubricId === OLOID_DEV_NUMBERS_RUBRIC || (opts?.rubricId && isOloidEditorialRubric(opts.rubricId))) {
    return { facts: [...anchors], color: [], ids: [] };
  }
  const random = opts?.random ?? Math.random;

  const rotating = facts.flatMap((text, index) => {
    const spec = OLOID_ROTATING_FACTS.find((item) => text.includes(item.needle));
    return spec ? [{ text, spec, index }] : [];
  });
  const topic = opts?.topic ?? "";
  const pinned = topic ? rotating.filter((item) => item.spec.topicMark?.test(topic)) : [];
  const queue = rotating
    .filter((item) => {
      if (pinned.includes(item)) return false;
      if (factCooled(item.spec, history, now)) return false;
      // Провокация отклоняет часы прохождения отдельным фильтром. Не предлагать факт, который слот всё равно снимет.
      if (opts?.rubricId === OLOID_PROVOCATION_RUBRIC && /2\s*[–—-]\s*3\s*час/iu.test(item.text)) return false;
      return true;
    })
    .map((item) => ({ ...item, last: factLastUsedAt(item.spec, history) ?? 0, tie: random() }))
    .sort((a, b) => a.last - b.last || a.tie - b.tie || a.index - b.index)
    .slice(0, Math.max(0, OLOID_COLOR_FACTS_PER_POST - pinned.length));
  const chosen = [...pinned, ...queue];
  const color = chosen.map((item) => item.text);
  return { facts: [...anchors, ...color], color, ids: chosen.map((item) => item.spec.id) };
}

export function oloidColorSteer(color: readonly string[], rubricId?: string): string {
  if (rubricId === OLOID_DEV_NUMBERS_RUBRIC || (rubricId && isOloidEditorialRubric(rubricId))) return "";
  if (!color.length) {
    return "Редкие эпизоды сейчас не добавляй: они недавно уже были. Хватит общих фактов, без новой предметной детали.\n";
  }
  return `Редкий эпизод этого поста — один из этих, они дольше всех не выходили. Другие редкие эпизоды не добавляй и не выдумывай:\n${color.map((fact) => `• ${fact}`).join("\n")}\n`;
}

export function detailsIn(text: string): OloidDetail[] {
  return OLOID_DETAILS.filter((detail) => detail.pattern.test(text));
}

export function recentDetails(history: readonly HistoryItem[]): OloidDetail[] {
  const seen = new Map<string, OloidDetail>();
  for (const post of oloidPosts(history).slice(0, OLOID_DETAIL_LOOKBACK)) {
    for (const detail of detailsIn(post.text)) seen.set(detail.id, detail);
  }
  return [...seen.values()];
}

export function recentDetailNote(history: readonly HistoryItem[]): string {
  const labels = recentDetails(history).map((detail) => detail.label).slice(0, 24);
  if (!labels.length) return "";
  return `Недавние детали — не используй эти предметы и сцены, они уже были в последних постах:\n${labels.map((label) => `• ${label}`).join("\n")}\n`;
}

export function topicHitsRecentDetail(topic: string, history: readonly HistoryItem[]): boolean {
  return recentDetails(history).some((detail) => detail.pattern.test(topic));
}

/** Тема сама называет деталь из последних постов или редкий факт, который ещё на паузе. */
export function topicRepeatsRecent(topic: string, history: readonly HistoryItem[], now: Date): boolean {
  if (topicHitsRecentDetail(topic, history)) return true;
  return OLOID_ROTATING_FACTS.some((spec) => !!spec.mark && spec.mark.test(topic) && cooled(spec.mark, history, now));
}

/** Черновик повторяет предмет или сцену из последних постов «Олоида».
 *  exceptIds — детали выбранного кадра: их пост имеет право назвать, даже если слово уже было. */
export function repeatedDetailProblem(text: string, history: readonly HistoryItem[], exceptIds: readonly string[] = []): string | null {
  const skip = new Set(exceptIds);
  const recent = new Set(recentDetails(history).map((detail) => detail.id));
  const hits = detailsIn(text).filter((detail) => recent.has(detail.id) && !skip.has(detail.id));
  if (!hits.length) return null;
  const labels = hits.slice(0, 6).map((detail) => detail.label).join(", ");
  return hits.length > 1
    ? `детали уже были в последних постах: ${labels}. Возьми другие`
    : `деталь «${hits[0].label}» уже была в последних постах. Возьми другую`;
}

/** Редкий факт уже выходил в последние несколько дней. */
export function cooledFactProblem(text: string, history: readonly HistoryItem[], now: Date): string | null {
  const hits = OLOID_ROTATING_FACTS.filter((spec) => !!spec.mark && spec.mark.test(text) && cooled(spec.mark, history, now));
  if (!hits.length) return null;
  const labels = hits.slice(0, 4).map((spec) => spec.label).join(", ");
  return `факт уже был в последние ${OLOID_FACT_COOLDOWN_DAYS} дня: ${labels}. Возьми другой`;
}

export function oloidRepeatProblem(text: string, history: readonly HistoryItem[], now: Date, exceptDetailIds: readonly string[] = []): string | null {
  return repeatedDetailProblem(text, history, exceptDetailIds) ?? cooledFactProblem(text, history, now);
}

/** Шпатель вычищен из фактов. Пост с этим словом не публикуем. */
export function spatulaProblem(text: string): string | null {
  if (/шпател/iu.test(text)) return "шпатель не упоминать";
  return null;
}
