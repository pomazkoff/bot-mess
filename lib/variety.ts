// Карусели и короткие ролики обычных постов «Олоида».
// Описания — из README архива (что видно и к какой теме пост).
// Спойлеры в очередь не входят: ролик про артефакт, ролик про лом и «папу в стене»,
// ролик со слоями тайной комнаты, кадры выбора и лом, набор 06_tayna_oloida,
// кадр 03_personazhi/04_03_psych. Тизер 01 лежит в videos/, но не выбирается:
// трейлер по-прежнему отдельная рубрика и не чаще раза в 3 суток.
// Threads: карусель — контейнеры is_carousel_item, потом media_type=CAROUSEL, 2–4 кадра.
// Опрос только у текста, поэтому к опросу медиа не клеится.

import type { Media } from "./projects.js";
import { pickLeastRecent } from "./oloidRotation.js";

const HOST = "https://threads-autopost-six.vercel.app/media/oloid";

type Fit = { rubric: string; needles?: readonly string[] };

type Asset = {
  id: string;
  kind: "video" | "carousel";
  /** Пути от public/media/oloid/. */
  files: readonly string[];
  fits: readonly Fit[];
  about: string;
};

const ASSETS: readonly Asset[] = [
  {
    id: "video-02-lokacii",
    kind: "video",
    files: ["videos/02_lokacii_peterburg.mp4"],
    fits: [
      { rubric: "petersburg" },
      { rubric: "backstage", needles: ["экскурс"] },
      { rubric: "ask", needles: ["двор", "кухн"] },
    ],
    about:
      "Короткое видео, панорамы локаций: двор-колодец, коридор и кухня коммуналки, кабинет, комната соседей, бар, ночная улица, квартира, осенний двор. Всё нарисовано как масло. Это места, где живёт история, без сюжета.",
  },
  {
    id: "video-06-den",
    kind: "video",
    files: ["videos/06_zakulise_den_razrabotki.mp4"],
    fits: [{ rubric: "backstage" }],
    about:
      "Короткое видео: человек за работой с дневного света до вечера, на мониторе рисунок и код, открыт сайт игры. Чисел, версий, цен и названий магазинов из кадра не переписывать.",
  },
  {
    id: "01_piter_mesta",
    kind: "carousel",
    files: [
      "carousels/01_piter_mesta/01_Loc_2018_courtyard_before.jpg",
      "carousels/01_piter_mesta/02_olloid_cg01_okno_dvor.jpg",
      "carousels/01_piter_mesta/03_Loc_2018_street_night.jpg",
      "carousels/01_piter_mesta/04_Loc_2018_courtyard_autumn.jpg",
    ],
    fits: [{ rubric: "petersburg" }, { rubric: "ask", needles: ["двор"] }],
    about:
      "Четыре кадра: двор-колодец доходного дома, вид из окна во двор, ночная улица с фонарями, осенний двор. Реальный Петербург в игре, без новых адресов.",
  },
  {
    id: "02_kommunalka",
    kind: "carousel",
    files: [
      "carousels/02_kommunalka/01_Loc_2018_corridor_day.jpg",
      "carousels/02_kommunalka/02_Loc_2018_kitchen_day.jpg",
      "carousels/02_kommunalka/03_olloid_cg15_kitchen.jpg",
      "carousels/02_kommunalka/04_Loc_2018_alkashi_a.jpg",
    ],
    fits: [
      { rubric: "ask", needles: ["коммунал", "кухн", "коридор"] },
      { rubric: "backstage", needles: ["экскурс"] },
      { rubric: "detail", needles: ["клеён", "кухн"] },
    ],
    about:
      "Четыре кадра коммуналки: коридор, общая кухня, соседка на кухне, комната соседей с диваном и телевизором. Коммуналка как место, где все пересекаются. Без сюжета.",
  },
  {
    id: "03_personazhi",
    kind: "carousel",
    files: [
      "carousels/03_personazhi/01_00_dvor.jpg",
      "carousels/03_personazhi/02_01_kommunalka.jpg",
      "carousels/03_personazhi/03_02_bar.jpg",
    ],
    fits: [{ rubric: "ask", needles: ["коммунал", "жить"] }],
    about:
      "Три кадра: Егор и Вера во дворе-колодце; бабушка и Федя в комнате; Егор и Алик в подвальном баре. Знакомство с людьми, без сюжета и без больницы.",
  },
  {
    id: "04_vybory_minigry",
    kind: "carousel",
    files: [
      "carousels/04_vybory_minigry/03_05_plywood_minigame_ch4.jpg",
      "carousels/04_vybory_minigry/04_07_table_minigame_ch5.jpg",
    ],
    fits: [
      { rubric: "backstage", needles: ["гвозд", "протяж", "клик"] },
      { rubric: "detail", needles: ["фанер", "стол", "гвозд"] },
    ],
    about:
      "Два кадра мини-игр: руки тянут лист фанеры; руки тащат стол по полу. Движение руки, не клик. Не писать про стену, обои, что за ними, лом и выборы.",
  },
  {
    id: "05_atmosfera_2018",
    kind: "carousel",
    files: [
      "carousels/05_atmosfera_2018/01_Loc_2018_bar_v2.jpg",
      "carousels/05_atmosfera_2018/02_olloid_cg12a_egor_beer.jpg",
      "carousels/05_atmosfera_2018/03_Loc_2018_Car.jpg",
      "carousels/05_atmosfera_2018/04_olloid_cg07b_meters.jpg",
    ],
    fits: [
      { rubric: "petersburg", needles: ["2018", "фан", "конюшен"] },
      { rubric: "backstage", needles: ["счётчик"] },
    ],
    about:
      "Четыре кадра 2018 года: бар, по телевизору футбол; Егор с кружкой; салон машины и телефон на держателе; электросчётчики на стене. Без брендов и без счёта матча.",
  },
  {
    id: "07_semya",
    kind: "carousel",
    files: [
      "carousels/07_semya/01_olloid_cg02_family_hug.jpg",
      "carousels/07_semya/02_olloid_cg02a_vera_fedya_hold.jpg",
      "carousels/07_semya/03_olloid_cg03c_vera_hug.jpg",
    ],
    fits: [{ rubric: "ask", needles: ["жить", "семь"] }],
    about: "Три кадра: Егор, Вера и ребёнок обнимаются; Вера держит Федю; Егор и Вера рядом. Семья в квартире, без сюжета.",
  },
];

export type OloidShown = {
  id: string;
  about: string;
  /** Абзац в промпт: описать видимое, без спойлеров. */
  note: string;
  media: Media;
};

function urls(asset: Asset): string[] {
  return asset.files.map((file) => `${HOST}/${file}`);
}

function toShown(asset: Asset): OloidShown {
  const list = urls(asset);
  const media: Media =
    asset.kind === "video"
      ? { type: "VIDEO", url: list[0], droppable: true }
      : { type: "CAROUSEL", url: list[0], urls: list, droppable: true };
  const kind = asset.kind === "video" ? "видео" : `карусель из ${list.length} кадров`;
  return {
    id: asset.id,
    about: asset.about,
    note: `К посту приложено ${kind}. Опиши, что видно, коротко и своими словами, только по этому описанию: ${asset.about} Это важнее совета взять одну деталь. Не пиши «на картинке» и «в видео». Не добавляй тайную комнату, олоид в руке или в стене, пожар, финал, скелет, лом, выборы и «папа был в стене».`,
    media,
  };
}

function matches(asset: Asset, rubricId: string, topic: string): boolean {
  return asset.fits.some((fit) => fit.rubric === rubricId && (!fit.needles?.length || fit.needles.some((needle) => topic.includes(needle))));
}

/** Подходящие к рубрике и теме. Сначала те, что попали в тему; иначе запасные на всю рубрику. Дальше — кто дольше не выходил. */
export function pickRegularShown(
  rubricId: string,
  topic: string | undefined,
  lastUsed: Readonly<Record<string, string | undefined>>,
): OloidShown | null {
  const text = (topic ?? "").toLowerCase();
  const topicHits = ASSETS.filter((asset) =>
    asset.fits.some((fit) => fit.rubric === rubricId && fit.needles?.some((needle) => text.includes(needle))),
  );
  const fallbacks = ASSETS.filter((asset) => asset.fits.some((fit) => fit.rubric === rubricId && !fit.needles?.length));
  const pool = topicHits.length ? topicHits : fallbacks;
  if (!pool.length) return null;
  const picked = pickLeastRecent(pool, lastUsed);
  if (!matches(picked, rubricId, text)) return null;
  const shown = toShown(picked);
  if (shown.media.type === "CAROUSEL" && (shown.media.urls?.length ?? 0) < 2) return null;
  if (shown.media.type === "CAROUSEL" && (shown.media.urls?.length ?? 0) > 4) return null;
  return shown;
}

export function shownAssetFiles(): readonly { id: string; files: readonly string[] }[] {
  return ASSETS.map((asset) => ({ id: asset.id, files: asset.files }));
}
