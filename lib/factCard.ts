// Квадратная карточка факта «Олоида»: текст, проверки и публичный адрес.
// Рендер — в lib/factCardRender.ts, чтобы крон «Бюро» не тянул sharp, пока карточка не нужна.
// Логотип — кисть из lib/brand/oloid-logo.png. Заголовок — тонкий Jost, плоский жёлтый #F2C230.

import { createHash } from "node:crypto";
import { devNumberProblem } from "./devFacts.js";
import { spatulaProblem } from "./oloidFacts.js";
import { isOloidRotationRubric, oloidContentSafetyProblem, quietProblem } from "./oloidRotation.js";
import { OLOID_APP_STORE_CODES, PROJECTS, mentionsPrice, type Picture } from "./projects.js";

export const FACT_CARD_SIZE = 1080;
export const FACT_CARD_CAPTION_MAX = 110;
/** Сколько символов влезает в одну строку подписи при тонком Jost на 1080. */
export const FACT_CARD_CAPTION_LINE = 56;

export type FactCardCopy = { title: string; caption: string };

const EMOJI = /\p{Extended_Pictographic}/u;
// Те же спойлеры, что в forbidden паспорта, но механически: фактчек их тоже видит.
const CARD_SPOILER =
  /путешеств\p{L}*\s+во\s+времени|(?<![\p{L}])ритуал\p{L}*(?![\p{L}])|разгад\p{L}*\s+убийств|природ\p{L}*\s+артефакт/iu;

export function normalizeCaption(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeTitle(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[«»"'„“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…:;,]+$/u, "")
    .trim();
}

function wordsOf(title: string): string[] {
  return normalizeTitle(title).split(" ").filter(Boolean);
}

/** 2–3 слова. Длинную пару ставим в две строки, короткую оставляем в одну. */
export function factCardTitleLines(title: string): string[] {
  const upper = wordsOf(title).map((word) => word.toLocaleUpperCase("ru"));
  if (upper.length <= 1) return upper;
  if (upper.length === 2) {
    const [a, b] = upper;
    if ([...a].length <= 5 && [...b].length <= 7 && [...(a + b)].length <= 12) return [`${a} ${b}`];
    return upper;
  }
  const [a, b, c] = upper;
  const opt1 = [a, `${b} ${c}`];
  const opt2 = [`${a} ${b}`, c];
  const widest = (lines: string[]) => Math.max(...lines.map((line) => [...line].length));
  const imbalance = (lines: string[]) => Math.abs([...lines[0]].length - [...lines[1]].length);
  const fits = (lines: string[]) => lines.every((line) => [...line].length <= 16);
  const pool = [opt1, opt2].filter(fits);
  const ranked = (pool.length ? pool : [opt1, opt2]).sort((x, y) => widest(x) - widest(y) || imbalance(x) - imbalance(y));
  return ranked[0];
}

function lineLength(words: string[]): number {
  return [...words.join(" ")].length;
}

/** Одна строка, если влезает. Иначе разрыв ближе к середине. Если в две строки не влезает — три и больше, это отклонит проверка. */
export function factCardCaptionLines(caption: string, max = FACT_CARD_CAPTION_LINE): string[] {
  const words = normalizeCaption(caption).split(" ").filter(Boolean);
  if (!words.length) return [];
  if (lineLength(words) <= max) return [words.join(" ")];
  let bestAt = -1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = lineLength(words.slice(0, i));
    const right = lineLength(words.slice(i));
    if (left > max || right > max) continue;
    const score = Math.abs(left - right);
    if (score < bestScore) {
      bestScore = score;
      bestAt = i;
    }
  }
  if (bestAt !== -1) return [words.slice(0, bestAt).join(" "), words.slice(bestAt).join(" ")];
  const lines: string[] = [];
  let cur: string[] = [];
  for (const word of words) {
    const next = cur.concat(word);
    if (cur.length && lineLength(next) > max) {
      lines.push(cur.join(" "));
      cur = [word];
    } else cur = next;
  }
  if (cur.length) lines.push(cur.join(" "));
  return lines;
}

const TITLE_WORD = /^[\p{L}\p{N}.,+-]+(?:-[\p{L}\p{N}.,+-]+)*$/u;

/**
 * Карточка обычного поста и поста с цифрой. Опрос, карусель, ролик, магазины, трейлер и провокация — без неё.
 * Нужен один кадр из pictures: тот, что бот и так выбрал бы.
 */
export function factCardEligible(input: {
  projectId: string;
  rubricId: string;
  picture: boolean;
  poll: boolean;
  shown: boolean;
  rubricMedia: boolean;
}): boolean {
  if (input.projectId !== "oloid") return false;
  if (!isOloidRotationRubric(input.rubricId)) return false;
  if (input.poll || input.shown || input.rubricMedia || !input.picture) return false;
  return true;
}

export function factCardProblem(
  card: { title?: string; caption?: string } | undefined,
  ctx: { required: boolean; devFact?: string; stopList?: readonly RegExp[]; quiet?: boolean },
): string | null {
  if (!ctx.required) return null;
  const title = normalizeTitle(card?.title ?? "");
  const caption = normalizeCaption(card?.caption ?? "");
  if (!title) return "карточка: нет заголовка";
  if (!caption) return "карточка: нет подписи";
  const words = title.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 3) return "заголовок карточки: нужно 2 или 3 слова";
  if (words.some((word) => !TITLE_WORD.test(word) || [...word].length > 18)) return "заголовок карточки не помещается в строку";
  if ([...title].length > 42) return "заголовок карточки слишком длинный";
  const titleLines = factCardTitleLines(title);
  if (titleLines.length < 1 || titleLines.length > 2) return "заголовок карточки: одна или две строки";
  if (titleLines.some((line) => [...line].length > 18)) return "заголовок карточки не помещается в строку";
  if ([...caption].length > FACT_CARD_CAPTION_MAX) return `подпись карточки длиннее ${FACT_CARD_CAPTION_MAX} символов`;
  const captionLines = factCardCaptionLines(caption);
  if (captionLines.length < 1 || captionLines.length > 2) return "подпись карточки не помещается в две строки";
  if (captionLines.some((line) => [...line].length > FACT_CARD_CAPTION_LINE)) return "подпись карточки не помещается в две строки";
  const blob = `${title}\n${caption}`;
  if (EMOJI.test(blob)) return "карточка: эмодзи нельзя";
  if (/https?:\/\//i.test(blob) || /#\S/.test(blob)) return "карточка: без ссылки";
  if (OLOID_APP_STORE_CODES.some((code) => blob.includes(code))) return "карточка: промокод не нужен";
  const safety = oloidContentSafetyProblem(blob);
  if (safety) return `карточка: ${safety}`;
  if (CARD_SPOILER.test(blob)) return "карточка: спойлер";
  const spatula = spatulaProblem(blob);
  if (spatula) return `карточка: ${spatula}`;
  if (mentionsPrice(blob)) return "карточка: цену не упоминать";
  for (const re of ctx.stopList ?? []) if (re.test(blob)) return `карточка: штамп ${re}`;
  if (ctx.quiet) {
    const quiet = quietProblem(blob);
    if (quiet) return `карточка: ${quiet.replace(/^тихий пост: /, "")}`;
  }
  if (ctx.devFact) {
    const numbers = devNumberProblem(blob, ctx.devFact);
    if (numbers) return `карточка: ${numbers}`;
  }
  return null;
}

export function bgKeyFromPictureUrl(pictureUrl: string): string | null {
  try {
    const path = new URL(pictureUrl).pathname;
    const match = path.match(/^\/media\/(oloid\/[a-z0-9._/-]+\.jpe?g)$/i);
    if (!match || match[1].includes("..")) return null;
    return match[1];
  } catch {
    return null;
  }
}

/** Кадр из пула pictures. Баннеры App Store и VK Play сюда не входят. */
export function pictureByBg(bg: string): Picture | undefined {
  if (!/^oloid\/[a-z0-9._/-]+\.jpe?g$/i.test(bg) || bg.includes("..")) return undefined;
  const oloid = PROJECTS.find((project) => project.id === "oloid");
  return oloid?.pictures?.find((picture) => picture.url.endsWith(`/${bg}`));
}

export function bgKeyFromCardUrl(stored: string | undefined): string | null {
  if (!stored) return null;
  try {
    const url = new URL(stored);
    if (!url.pathname.endsWith("/api/card")) return null;
    const bg = url.searchParams.get("bg");
    if (!bg || !pictureByBg(bg)) return null;
    return bg;
  } catch {
    return null;
  }
}

/** История хранит адрес карточки. Для очереди кадров это тот же скриншот. */
export function mediaUsesPicture(stored: string | undefined, pictureUrl: string): boolean {
  if (!stored || !pictureUrl) return false;
  if (stored === pictureUrl) return true;
  const bg = bgKeyFromCardUrl(stored);
  return bg != null && pictureUrl.endsWith(`/${bg}`);
}

export function factCardPublicUrl(pictureUrl: string, title: string, caption: string): string {
  const bg = bgKeyFromPictureUrl(pictureUrl);
  if (!bg || !pictureByBg(bg)) throw new Error("кадр не из пула картинок поста");
  const q = new URLSearchParams({
    bg,
    title: normalizeTitle(title),
    caption: normalizeCaption(caption),
  });
  return `${new URL(pictureUrl).origin}/api/card?${q.toString()}`;
}

export function factCardCacheId(pictureUrl: string, title: string, caption: string): string {
  const bg = bgKeyFromPictureUrl(pictureUrl) ?? pictureUrl;
  return createHash("sha256").update(`${bg}\n${normalizeTitle(title)}\n${normalizeCaption(caption)}`).digest("hex").slice(0, 32);
}
