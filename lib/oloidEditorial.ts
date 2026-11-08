// Редакционные форматы обычных постов «Олоида»: дневник разработки, один кадр — одна деталь, отзыв.
// В автослот попадают только записи отсюда. Пустой список или кулдаун — рубрика не выбирается,
// слот берёт другую обычную рубрику. Превью с &rubric= может показать остывший источник, но не выдумать новый.
//
// Как добавить одобренное:
// - дневник: объект в OLOID_DIARY_ENTRIES (id, дословная цитата, что именно можно сказать). Без устного «ну вроде»;
// - кадр: объект в OLOID_FRAME_SOURCES и файл в public/media/oloid. Нет файла — источник пропускается;
// - отзыв: объект в OLOID_REVIEWS с площадкой, датой, ником и дословным текстом. Звёзды не храним.
// После правки: npx tsc --noEmit && npx tsx lib/selfcheck.ts. Происхождение — docs/oloid-editorial.md.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { OLOID_APP_STORE_URL, type Media } from "./projects.js";

export const OLOID_DIARY_RUBRIC = "diary";
export const OLOID_FRAME_RUBRIC = "frame";
export const OLOID_REVIEW_RUBRIC = "review";

export const OLOID_EDITORIAL_RUBRICS = [OLOID_DIARY_RUBRIC, OLOID_FRAME_RUBRIC, OLOID_REVIEW_RUBRIC] as const;

/** Один и тот же эпизод, кадр или отзыв не повторяем раньше этого срока. */
export const OLOID_EDITORIAL_COOLDOWN_DAYS = 7;
const COOLDOWN_MS = OLOID_EDITORIAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export const OLOID_MEDIA_HOST = "https://threads-autopost-six.vercel.app/media/oloid";

export const EDITORIAL_SKIP_REASON = {
  diary: "дневник разработки пропущен: нет одобренного эпизода",
  frame: "кадр с деталью пропущен: нет проверенного скриншота",
  review: "отзыв пропущен: нет одобренного отзыва",
} as const;

export function isOloidEditorialRubric(id: string): boolean {
  return (OLOID_EDITORIAL_RUBRICS as readonly string[]).includes(id);
}

export function oloidMediaUrl(file: string): string {
  return `${OLOID_MEDIA_HOST}/${file.split("/").map(encodeURIComponent).join("/")}`;
}

function defaultFileExists(file: string): boolean {
  return existsSync(join(process.cwd(), "public/media/oloid", file));
}

export type EditorialGate = {
  history?: readonly { project?: string; editorialId?: string; at?: string }[];
  now?: Date;
  /** id источника → ISO. Вместе с historical editorialId, берётся более позднее. */
  lastUsed?: Readonly<Record<string, string | undefined>>;
  diary?: readonly DiaryEntry[];
  frames?: readonly FrameSource[];
  reviews?: readonly ReviewSource[];
  fileExists?: (file: string) => boolean;
  /** Явное превью: остывший источник ещё можно показать. Пустой список и битый файл — нельзя. */
  ignoreCooldown?: boolean;
};

export type DiaryEntry = {
  id: string;
  topic: string;
  /** Единственный эпизод, который пост имеет право рассказать. */
  fact: string;
  /** Дословный отзыв. Других реплик в посте нет. */
  quote: string;
  image?: { file: string; about: string };
};

export type FrameDetail = { id: string; label: string; pattern: RegExp };

export type FrameSource = {
  id: string;
  topic: string;
  /** Путь от public/media/oloid/. Нет файла — источник не выбирается. */
  file: string;
  about: string;
  /** Что на кадре можно назвать. Пост берёт одну, не список. */
  details: readonly FrameDetail[];
  /** id из OLOID_DETAILS, которые этот кадр имеет право повторить, даже если они были недавно. */
  detailIds: readonly string[];
  /** Факт для фактчека: только видимое, без истории создания. */
  fact: string;
  banned: readonly { reason: string; pattern: RegExp }[];
};

export type ReviewSource = {
  id: string;
  platform: "app-store";
  appId: string;
  sourceUrl: string;
  /** День выгрузки, YYYY-MM-DD. В пост не попадает. */
  exportedOn: string;
  /** День отзыва, YYYY-MM-DD. */
  date: string;
  handle: string;
  /** Дословный текст, включая опечатки и регистр. */
  text: string;
  /**
   * Непрерывный кусок text, если в пост целиком не входит.
   * Рядом с ником код пишет «фрагмент отзыва». Нет поля — цитата равна text.
   */
  excerpt?: string;
};

const DIARY_QUOTE = "выглядит как дочь Егора";

/**
 * Единственный одобренный эпизод на 2026-11-08.
 * Источник: CHANGELOG, передал ассистент разработки «Олоида». Илья разрешил публиковать без имени автора отзыва.
 * Автор отзыва не назван и не считается игроком или тестером.
 * Не добавлять сюда арт II эпизода, новых персонажей, реквизит, роли, годы, сравнительные листы и байки про генерацию.
 */
export const OLOID_DIARY_ENTRIES: readonly DiaryEntry[] = [
  {
    id: "vera-face-older",
    topic: "Лицо Веры сделали старше",
    quote: DIARY_QUOTE,
    fact: `Лицо Веры перерисовали после отзыва «${DIARY_QUOTE}». Кто это сказал, команда не называет и не угадывает. Лицо сделали старше, мимику оставили. Других подробностей процесса нет.`,
    image: {
      // Поцелуй с репликой на кадре не берём: на экране спойлерная реплика. Это обычный кадр, где лицо Веры видно.
      // Не «до» и не «после»: сравнительного листа нет.
      file: "carousels/07_semya/03_olloid_cg03c_vera_hug.jpg",
      about:
        "Егор и Вера в комнате, лицо Веры видно. Обычный кадр игры, не сравнение до и после. Не писать, что по лицу на кадре видно перерисовку.",
    },
  },
];

const FRAME_BANS = {
  prototype: { reason: "не выдавать нарисованный двор за реальный прототип", pattern: /прототип|с натуры|реальн\p{L}*\s+(?:двор|адрес|дом)|снимал\p{L}*\s+во\s+дворе/iu },
  address: { reason: "Раздольная, 21 — вымышленный адрес, не подпись кадра", pattern: /раздольн/iu },
  invoice: { reason: "предысторию «Инвойс» не писать: она не подтверждена", pattern: /инвойс|invoice/iu },
  worldCup: { reason: "футбол на экране — не претензия на чемпионат", pattern: /чемпионат|чм[-\s]?2018|world\s*cup|мундиал/iu },
  process: { reason: "не писать, кто и зачем поставил вещь и как кадр переделывали", pattern: /до и после|перерисовал|сначала\s+(?:был|была|было)|мы\s+(?:поставили|добавили|оставили|положили|нарисовали|решили)|специально\s+(?:постав|остав|добав|нарис)/iu },
  mechanic: { reason: "видимая вещь — не механика и не призыв с ней взаимодействовать", pattern: /мини-игр|можно\s+(?:взять|открыть|нажать|кликнуть)|нажми(?:те)?|кликни(?:те)?/iu },
} as const;

/**
 * Кадры сверены с файлами в репозитории 2026-11-08.
 * 01_courtyard_spb_2018_ch1.jpg в репозитории нет: тот же двор с подписью «Санкт-Петербург, 2018 год» — 02_dvor_spb_2018.jpg.
 * yard.jpg — тот же рисунок без подписи, к этому источнику не клеится.
 * Loc_2018_corridor_day_door.jpg нет. corridor-1.jpg совпадает по вещам на кадре
 * (и с carousels/02_kommunalka/01_Loc_2018_corridor_day.jpg, это тот же рисунок).
 * Бар — сам файл Loc_2018_bar_v2.jpg.
 */
export const OLOID_FRAME_SOURCES: readonly FrameSource[] = [
  {
    id: "frame-courtyard-2018",
    topic: "Двор: одна видимая деталь",
    file: "02_dvor_spb_2018.jpg",
    about:
      "Двор-колодец: охристые стены с облезшей штукатуркой, бельё на верёвке, велосипед у арки, лужи. На кадре подпись «Санкт-Петербург, 2018 год». Это нарисованная сцена, не прототип реального двора. Раздольная, 21 — вымышленный адрес, его к кадру не приписывать.",
    fact: "На кадре двора видны охристые стены, облезшая штукатурка, бельё, велосипед у арки и лужи. Подпись кадра — «Санкт-Петербург, 2018 год». Двор нарисован, это не реальный адрес.",
    detailIds: ["yard"],
    details: [
      { id: "ochre", label: "охристые стены", pattern: /охр|жёлт\p{L}*\s+стен|желт\p{L}*\s+стен/iu },
      { id: "plaster", label: "облезлая штукатурка", pattern: /облез|штукатур/iu },
      { id: "laundry", label: "бельё", pattern: /бель[её]/iu },
      { id: "bicycle", label: "велосипед у арки", pattern: /велосипед/iu },
      { id: "puddles", label: "лужи", pattern: /луж/iu },
      { id: "label", label: "подпись «Санкт-Петербург, 2018 год»", pattern: /санкт-петербург,\s*2018/iu },
    ],
    banned: [FRAME_BANS.prototype, FRAME_BANS.address, FRAME_BANS.invoice, FRAME_BANS.worldCup, FRAME_BANS.process, FRAME_BANS.mechanic],
  },
  {
    id: "frame-corridor-day",
    topic: "Коридор: одна видимая деталь",
    file: "corridor-1.jpg",
    about:
      "Коммунальный коридор: обои, паркет ёлочкой, лампочка, электросчётчики, велосипед, стремянка, стиральная машина под клетчатой скатертью, красный пылесос. Описать одну видимую вещь. Не объяснять, кто её поставил и зачем, и не делать из неё механику.",
    fact: "На кадре коридора видны обои, паркет ёлочкой, лампочка, электросчётчики, велосипед, стремянка, стиральная машина под клетчатой тканью и красный пылесос.",
    detailIds: ["wallpaper", "parquet", "bulb", "meter", "vacuum", "washer", "corridor", "cloth"],
    details: [
      { id: "wallpaper", label: "обои", pattern: /обо[ийяе]/iu },
      { id: "parquet", label: "паркет ёлочкой", pattern: /паркет|ёлочк|елочк/iu },
      { id: "bulb", label: "лампочка", pattern: /лампочк/iu },
      { id: "meters", label: "электросчётчики", pattern: /сч[её]тчик/iu },
      { id: "bicycle", label: "велосипед", pattern: /велосипед/iu },
      { id: "ladder", label: "стремянка", pattern: /стремянк/iu },
      { id: "washer", label: "стиральная машина", pattern: /стиральн/iu },
      { id: "cloth", label: "клетчатая скатерть", pattern: /клетчат|скатерт/iu },
      { id: "vacuum", label: "красный пылесос", pattern: /пылесос/iu },
    ],
    banned: [FRAME_BANS.invoice, FRAME_BANS.worldCup, FRAME_BANS.process, FRAME_BANS.mechanic, FRAME_BANS.address],
  },
  {
    id: "frame-bar-v2",
    topic: "Бар: одна видимая деталь",
    file: "carousels/05_atmosfera_2018/01_Loc_2018_bar_v2.jpg",
    about:
      "Бар: кирпичный свод, лампы, по телевизору футбол, деревянные столы. Футбол не называть чемпионатом и не писать, как кадр меняли.",
    fact: "На кадре бара видны кирпичный свод, лампы, футбол по телевизору и деревянные столы.",
    detailIds: ["bar"],
    details: [
      { id: "vault", label: "кирпичный свод", pattern: /свод|кирпич/iu },
      { id: "lamps", label: "лампы", pattern: /ламп|светильник/iu },
      { id: "football", label: "футбол по телевизору", pattern: /футбол|телевизор/iu },
      { id: "tables", label: "деревянные столы", pattern: /(?<![\p{L}])стол(?:а|ы|ов|ами|ах)?(?![\p{L}])|дерев\p{L}{2,}\s+стол/iu },
    ],
    banned: [FRAME_BANS.worldCup, FRAME_BANS.process, FRAME_BANS.invoice, FRAME_BANS.mechanic],
  },
];

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «26 октября 2026». Кривой день не форматируем. */
export function formatReviewDay(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/**
 * Выгрузка App Store Connect 29.10.2026, приложение 6817809325.
 * В посты входят только три отзыва, которые Илья оставил. Mornkalabra не входит:
 * там сравнение «человеческий труд / нейрослоп», его легко прочитать как утверждение команды.
 * Звёзды и число отзывов не храним и не пишем.
 */
export const OLOID_REVIEWS: readonly ReviewSource[] = [
  {
    id: "review-asc-odosinskiy-2026-10-26",
    platform: "app-store",
    appId: "6817809325",
    sourceUrl: OLOID_APP_STORE_URL,
    exportedOn: "2026-10-29",
    date: "2026-10-26",
    handle: "Одосинский",
    text: "Картинка, звук, музыка, сюжет – все очень хорошо сделано. Ждем второй эпизод",
  },
  {
    id: "review-asc-mufasa093-2026-10-24",
    platform: "app-store",
    appId: "6817809325",
    sourceUrl: OLOID_APP_STORE_URL,
    exportedOn: "2026-10-29",
    date: "2026-10-24",
    handle: "mufasa093",
    text: "Олоид - первая игра в жанре визуальной новеллы, с которой я столкнулся. Очень рад, что познакомился с жанром именно через эту игру. Нереальная рисовка, отличный сценарий и голоса, музыка очень понравилась. Читал, что запланировано ещё три эпизода. Жду с нетерпением 🔥",
  },
  {
    id: "review-asc-solnechny-god-2026-10-20",
    platform: "app-store",
    appId: "6817809325",
    sourceUrl: OLOID_APP_STORE_URL,
    exportedOn: "2026-10-29",
    date: "2026-10-20",
    handle: "solnechny god",
    text: "понравился стиль игры, держит в напряжении, как и должно быть в визуальной новелле. уже появилось несколько теорий о дальнейших развилках \n\nбуду ждать второй эпизод\n\nотельный респект за музыку и мини-игру танчики)",
  },
];

export type PublishedQuote = { text: string; excerpt: boolean };

/** Цитата к публикации: весь текст или непрерывный фрагмент. Иначе источник нельзя брать. */
export function quoteToPublish(review: ReviewSource): PublishedQuote | null {
  if (review.platform !== "app-store" || review.sourceUrl !== OLOID_APP_STORE_URL) return null;
  if (!review.text.trim() || !review.handle.trim() || !formatReviewDay(review.date)) return null;
  const text = review.excerpt ?? review.text;
  if (!text.trim() || !review.text.includes(text)) return null;
  return { text, excerpt: text !== review.text };
}

function stamp(id: string, gate: EditorialGate | undefined): number {
  if (!gate) return 0;
  const raw = gate.lastUsed?.[id];
  const fromMap = raw ? Date.parse(raw) : Number.NaN;
  let fromHistory = Number.NaN;
  for (const item of gate.history ?? []) {
    if (item.project && item.project !== "oloid") continue;
    if (item.editorialId !== id || !item.at) continue;
    const at = Date.parse(item.at);
    if (!Number.isNaN(at)) {
      fromHistory = at;
      break;
    }
  }
  const found = [fromMap, fromHistory].filter((at) => !Number.isNaN(at));
  return found.length ? Math.max(...found) : 0;
}

function cooled(id: string, gate: EditorialGate | undefined): boolean {
  if (!gate?.now || gate.ignoreCooldown) return false;
  const at = stamp(id, gate);
  if (!at) return false;
  return gate.now.getTime() - at < COOLDOWN_MS;
}

function leastRecent<T extends { id: string }>(items: readonly T[], gate: EditorialGate | undefined): T | null {
  if (!items.length) return null;
  let best = items[0];
  let bestAt = stamp(best.id, gate);
  for (const item of items.slice(1)) {
    const at = stamp(item.id, gate);
    if (at < bestAt) {
      best = item;
      bestAt = at;
    }
  }
  return best;
}

function exists(gate: EditorialGate | undefined): (file: string) => boolean {
  return gate?.fileExists ?? defaultFileExists;
}

function openDiary(gate?: EditorialGate): DiaryEntry[] {
  return (gate?.diary ?? OLOID_DIARY_ENTRIES).filter((entry) => entry.quote.trim() && !cooled(entry.id, gate));
}

function openFrames(gate?: EditorialGate): FrameSource[] {
  const there = exists(gate);
  return (gate?.frames ?? OLOID_FRAME_SOURCES).filter((source) => there(source.file) && !cooled(source.id, gate));
}

function openReviews(gate?: EditorialGate): ReviewSource[] {
  return (gate?.reviews ?? OLOID_REVIEWS).filter((review) => quoteToPublish(review) && !cooled(review.id, gate));
}

/** Рубрика жива, только если есть хотя бы один источник не на кулдауне и с файлом, где он нужен. */
export function editorialRubricOpen(rubricId: string, gate?: EditorialGate): boolean {
  if (rubricId === OLOID_DIARY_RUBRIC) return openDiary(gate).length > 0;
  if (rubricId === OLOID_FRAME_RUBRIC) return openFrames(gate).length > 0;
  if (rubricId === OLOID_REVIEW_RUBRIC) return openReviews(gate).length > 0;
  return true;
}

export function editorialSkipReason(rubricId: string): string | null {
  if (rubricId === OLOID_DIARY_RUBRIC) return EDITORIAL_SKIP_REASON.diary;
  if (rubricId === OLOID_FRAME_RUBRIC) return EDITORIAL_SKIP_REASON.frame;
  if (rubricId === OLOID_REVIEW_RUBRIC) return EDITORIAL_SKIP_REASON.review;
  return null;
}

export type EditorialPick =
  | { kind: "diary"; id: string; topic: string; entry: DiaryEntry }
  | { kind: "frame"; id: string; topic: string; frame: FrameSource }
  | { kind: "review"; id: string; topic: string; review: ReviewSource };

export function pickEditorial(rubricId: string, gate?: EditorialGate): EditorialPick | null {
  if (rubricId === OLOID_DIARY_RUBRIC) {
    const entry = leastRecent(openDiary(gate), gate);
    return entry ? { kind: "diary", id: entry.id, topic: entry.topic, entry } : null;
  }
  if (rubricId === OLOID_FRAME_RUBRIC) {
    const frame = leastRecent(openFrames(gate), gate);
    return frame ? { kind: "frame", id: frame.id, topic: frame.topic, frame } : null;
  }
  if (rubricId === OLOID_REVIEW_RUBRIC) {
    const review = leastRecent(openReviews(gate), gate);
    return review ? { kind: "review", id: review.id, topic: `Отзыв ${review.handle}`, review } : null;
  }
  return null;
}

export function diaryMedia(entry: DiaryEntry, fileExists: (file: string) => boolean = defaultFileExists): Media | undefined {
  if (!entry.image || !fileExists(entry.image.file)) return undefined;
  return { type: "IMAGE", url: oloidMediaUrl(entry.image.file), droppable: true };
}

export function frameMedia(source: FrameSource): Media {
  return { type: "IMAGE", url: oloidMediaUrl(source.file), droppable: false };
}

/** Кадр детали нельзя снять и опубликовать текст один: пост и картинка — одна пара. */
export function mayRepublishWithoutMedia(rubricId: string, media: { type: string; droppable?: boolean } | undefined): boolean {
  if (!media) return false;
  if (rubricId === OLOID_FRAME_RUBRIC && media.type === "IMAGE") return false;
  return media.droppable === true || media.type === "IMAGE";
}

export function framePairProblem(media: Media | undefined, source: FrameSource): string | null {
  if (!media || media.type !== "IMAGE") return "у детали нет её кадра";
  if (media.urls?.length) return "у детали один кадр, не карусель";
  if (media.url !== oloidMediaUrl(source.file)) return "кадр не совпадает с источником детали";
  return null;
}

const DIARY_BANS: readonly { reason: string; pattern: RegExp }[] = [
  { reason: "автора отзыва не называть и не угадывать", pattern: /тестер|плейтест|игрок|пользовател|комментатор|подписчик|нам написал|написал[аи]\s+нам|автор отзыв|знакомый сказал|друг сказал/iu },
  { reason: "других эпизодов разработки нет", pattern: /эпизод\s*(?:ii|2)|второй эпизод|новых персонаж|сравнительн(?:ый|ая|ое|ые)\s+лист|нейросет|(?<![\p{L}])ии(?![\p{L}])|(?<![\p{L}])ai(?![\p{L}])/iu },
  { reason: "мотивы и чужие реплики не выдумывать", pattern: /обидн|захотел|слишком молод|как ребён|как ребен|план[её]рк|спорили|сначала она была/iu },
  { reason: "кадр не «до» и не «после»", pattern: /до и после|старое лицо|новое лицо|на кадре было|стало старше на/iu },
  { reason: "годы процесса не добавлять", pattern: /(?<!\d)(?:19|20)\d{2}(?!\d)/u },
];

export function diaryProblem(text: string, entry: DiaryEntry): string | null {
  const quotes = [...text.matchAll(/«([^»]*)»/gu)].map((match) => match[1]);
  if (quotes.length !== 1 || quotes[0] !== entry.quote) return `в дневнике только дословный отзыв «${entry.quote}» и больше никаких реплик`;
  if (!/вер[аыуеой](?![\p{L}])/iu.test(text)) return "дневник про лицо Веры: назови Веру";
  if (!/старше/iu.test(text)) return "напиши, что лицо сделали старше";
  if (!/мимик/iu.test(text)) return "напиши, что мимику оставили";
  const prose = text.replace(/https?:\/\/\S+/g, " ");
  for (const ban of DIARY_BANS) if (ban.pattern.test(prose)) return ban.reason;
  return null;
}

const FRAME_DETAIL_CAP = 2;

export function frameProblem(text: string, source: FrameSource, pool: readonly FrameSource[] = OLOID_FRAME_SOURCES): string | null {
  const own = source.details.filter((detail) => detail.pattern.test(text));
  if (!own.length) return "нет видимой детали этого кадра";
  if (own.length > FRAME_DETAIL_CAP) return "одна деталь кадра, не перечень";
  for (const other of pool) {
    if (other.id === source.id) continue;
    for (const detail of other.details) {
      if (source.details.some((ownDetail) => ownDetail.id === detail.id)) continue;
      if (detail.pattern.test(text)) return `деталь «${detail.label}» не с этого кадра`;
    }
  }
  for (const ban of source.banned) if (ban.pattern.test(text)) return ban.reason;
  return null;
}

function countOccurs(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let at = 0;
  while (at <= text.length) {
    const found = text.indexOf(needle, at);
    if (found === -1) return count;
    count += 1;
    at = found + needle.length;
  }
  return count;
}

/** Ответ команды без цитаты, ссылки и никнейма — на нём проверяем выдумки. */
export function reviewReplyOnly(text: string, review: ReviewSource): string {
  const published = quoteToPublish(review);
  let reply = text.replace(/https?:\/\/\S+/g, " ");
  if (published) reply = reply.replace(`«${published.text}»`, " ");
  reply = reply.replace(review.handle, " ");
  reply = reply.replace(/фрагмент отзыва/giu, " ");
  return reply;
}

function replyCopiesQuote(reply: string, source: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ");
  const haystack = norm(reply);
  const needle = norm(source);
  const window = 24;
  for (let i = 0; i + window <= needle.length; i++) {
    if (haystack.includes(needle.slice(i, i + window))) return true;
  }
  return false;
}

const REVIEW_REPLY_BANS: readonly { reason: string; pattern: RegExp }[] = [
  { reason: "без звёзд и оценки", pattern: /★|☆|⭐|зв[её]зд|рейтинг|средн\p{L}*\s+балл|из\s+5/iu },
  { reason: "без сводки, что игра всем нравится", pattern: /все отзыв|игроки пишут|большинство/iu },
  { reason: "ответ не обещает дату и не подтверждает следующие эпизоды", pattern: /выйдет|выпустим|обеща|дата релиза|к релизу|ещё три|еще три|три эпизода|второй эпизод|эпизод\s*(?:ii|2)/iu },
];

export function reviewProblem(text: string, review: ReviewSource): string | null {
  const published = quoteToPublish(review);
  if (!published) return "отзыв не из одобренного списка";
  const day = formatReviewDay(review.date);
  if (!day) return "у отзыва нет даты";
  const quotes = [...text.matchAll(/«([^»]*)»/gu)].map((match) => match[1]);
  if (quotes.length !== 1 || quotes[0] !== published.text) return "цитата переписана: нужна дословная, одной парой ёлочек";
  if (countOccurs(text, published.text) !== 1) return "цитата должна стоять один раз и дословно";
  if (!review.text.includes(published.text)) return "цитата не из текста отзыва";
  if (published.excerpt && !/фрагмент отзыва/u.test(text)) return "сокращённый отзыв пометь как фрагмент";
  if (!published.excerpt && /фрагмент отзыва/u.test(text)) return "полный отзыв не называй фрагментом";
  if (!text.includes(review.handle)) return "никнейм изменён";
  if (!text.includes(day)) return "дата отзыва изменена";
  if (!/App Store/u.test(text)) return "площадка отзыва — App Store";
  if (/★|☆|⭐/.test(text)) return "без звёзд";
  const reply = reviewReplyOnly(text, review);
  if (!reply.replace(/[^\p{L}\p{N}]+/gu, "").trim()) return "нет ответа команды";
  if (replyCopiesQuote(reply, review.text)) return "ответ пересказывает цитату, оставь её дословной и отдельно";
  for (const ban of REVIEW_REPLY_BANS) if (ban.pattern.test(reply)) return ban.reason;
  return null;
}

export function editorialProblem(text: string, pick: EditorialPick, media?: Media): string | null {
  if (pick.kind === "diary") return diaryProblem(text, pick.entry);
  if (pick.kind === "frame") return framePairProblem(media, pick.frame) ?? frameProblem(text, pick.frame);
  return reviewProblem(text, pick.review);
}

export function editorialFacts(pick: EditorialPick): string[] {
  if (pick.kind === "diary") return [pick.entry.fact];
  if (pick.kind === "frame") return [pick.frame.fact];
  const published = quoteToPublish(pick.review);
  if (!published) return [];
  const day = formatReviewDay(pick.review.date);
  return [
    `Дословный отзыв из App Store (${pick.review.handle}, ${day ?? pick.review.date}): «${published.text}». Это слова игрока, не утверждение команды и не сводка оценок.${published.excerpt ? " В посте это фрагмент, он непрерывный и дословный." : ""}`,
  ];
}

export function editorialFactNote(pick: EditorialPick): string {
  if (pick.kind === "diary") {
    return "Это дневник разработки. Единственный новый эпизод — про лицо Веры, он передан отдельно. Не отклоняй его. Отклоняй любой другой эпизод, имя автора отзыва, диалоги, мотивы, годы процесса, второй эпизод, новых персонажей, сравнительные листы и генерацию лица нейросетью. Кадр, если он есть, не является «до» или «после».\n";
  }
  if (pick.kind === "frame") {
    return "Это пост одной видимой детали одного кадра. Детали из описания кадра можно. Отклоняй реальный прототип двора, адрес Раздольная, чемпионат, предысторию «Инвойс», кто и зачем поставил вещь, игровую механику этих вещей и детали, которых нет на этом кадре.\n";
  }
  return "Цитата в ёлочках — дословный отзыв из App Store. Не отклоняй её регистр, опечатки, эмодзи и слова про следующие эпизоды внутри ёлочек. Отклоняй звёзды, число отзывов, сводку «всем нравится» и ответ команды, который обещает дату, подтверждает число эпизодов или добавляет факт, которого нет в паспорте. Никнейм дословный.\n";
}

export function editorialSteer(pick: EditorialPick, opts?: { quiet?: boolean; replyBudget?: number; withImage?: boolean }): string {
  if (pick.kind === "diary") {
    return [
      "Единственный одобренный эпизод разработки. Других историй нет.",
      `Дословно, в ёлочках и один раз: «${pick.entry.quote}». Других реплик и кавычек нет.`,
      "Кто это сказал — не пиши и не угадывай. Это не обязательно игрок или тестер.",
      "Лицо Веры после этого отзыва перерисовали: сделали старше, мимику оставили. На этом процесс кончается.",
      "Не добавляй диалоги команды, мотивы, сроки, годы, второй эпизод, новых персонажей, сравнительные листы и нейросети.",
      pick.entry.image && opts?.withImage !== false ? "Кадр обычный, с Верой. Не пиши, что это «до», «после» или что по лицу видно перерисовку." : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (pick.kind === "frame") {
    const labels = pick.frame.details.map((detail) => detail.label).join(", ");
    return `Одна видимая деталь этого кадра, не список и не слово «на картинке». Можно только из списка: ${labels}. Не объясняй, кто это поставил и зачем. ${pick.frame.about}`;
  }
  const budget = opts?.replyBudget ?? 120;
  return `Напиши только ответ команды на отзыв, ${budget} символов или короче, одна-две короткие фразы. Цитату, ник, дату и ссылку не пиши и не ставь ёлочки: их добавит код. Не пересказывай отзыв. Не обещай дату, не подтверждай число эпизодов, не ставь звёзды и не пиши, что игра всем нравится.${opts?.quiet ? " Ссылку не проси." : ""}`;
}

/** Сколько символов остаётся ответу, когда цитата, ник и ссылка уже стоят. */
export function reviewReplyBudget(review: ReviewSource, withLink: boolean): number {
  const published = quoteToPublish(review);
  const day = formatReviewDay(review.date);
  if (!published || !day) return 0;
  const quote = `«${published.text}»`.length;
  const attr = `${review.handle}, App Store, ${day}${published.excerpt ? ". фрагмент отзыва" : ""}`.length;
  const link = withLink ? OLOID_APP_STORE_URL.length + 2 : 0;
  const gaps = 4;
  return Math.max(0, 450 - quote - attr - link - gaps);
}

export function reviewReply(raw: string, review: ReviewSource): string {
  const published = quoteToPublish(review);
  let text = raw.replace(/\r\n?/g, "\n").replace(/https?:\/\/\S+/g, "");
  text = text.replace(/«[^»]*»/gu, "");
  if (published) text = text.split(published.text).join("");
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter((line) => line && line !== review.handle && !/^фрагмент отзыва\.?$/iu.test(line))
    .join("\n\n");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** Код ставит цитату сам. Ответ модели без ёлочек и без адреса. null — собирать не из чего. */
export function assembleReviewPost(rawReply: string, review: ReviewSource, opts?: { link?: string }): string | null {
  const published = quoteToPublish(review);
  const day = formatReviewDay(review.date);
  const reply = reviewReply(rawReply, review);
  if (!published || !day || !reply) return null;
  const attr = `${review.handle}, App Store, ${day}${published.excerpt ? ". фрагмент отзыва" : ""}`;
  const parts = [`«${published.text}»`, attr, reply];
  let text = parts.join("\n\n");
  if (opts?.link) text += `\n\n${opts.link}`;
  return text;
}

export function reviewSimilarityText(text: string, review: ReviewSource): string {
  const published = quoteToPublish(review);
  let plain = text;
  if (published) plain = plain.split(`«${published.text}»`).join(" ");
  plain = plain.split(review.handle).join(" ");
  return plain
    .replace(/фрагмент отзыва/giu, " ")
    .replace(/app store/giu, " ")
    .replace(/\d{1,2}\s+[а-яё]+\s+\d{4}/giu, " ")
    .replace(/https?:\/\/\S+/g, " ");
}

export function diarySimilarityText(text: string, entry: DiaryEntry): string {
  return text.split(entry.quote).join(" ");
}

export function editorialPictureNote(pick: EditorialPick): string | undefined {
  if (pick.kind === "diary") return pick.entry.image?.about;
  if (pick.kind === "frame") return pick.frame.about;
  return undefined;
}
