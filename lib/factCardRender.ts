// Сборка карточки 1080×1080: кадр на весь квадрат, затемнение сверху и снизу, логотип-кисть, жёлтый заголовок, белая подпись.
// satori рисует текст шрифтом Jost (кириллица в комплекте), sharp обрезает кадр и складывает слои.
// Ошибка рендера не должна ронять слот: вызывающий публикует обычный кадр и пишет об этом в Telegram.

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import {
  FACT_CARD_SIZE,
  factCardCacheId,
  factCardCaptionLines,
  factCardPublicUrl,
  factCardTitleLines,
  normalizeCaption,
  normalizeTitle,
  pictureByBg,
  type FactCardCopy,
} from "./factCard.js";
import type { Media } from "./projects.js";
import { getFactCardPng, saveFactCardPng } from "./store.js";

const SIZE = FACT_CARD_SIZE;
const YELLOW = "#F2C230";
const TITLE_PX = 150;
const LOGO_W = 230;

type FontBin = Buffer;

let fontsPromise: Promise<{ light: FontBin }> | null = null;
let logoPromise: Promise<{ src: string; width: number; height: number }> | null = null;

// Пути литералом: так шрифт и логотип попадают в бандл функции на Vercel.
const JOST_LIGHT_URL = new URL("./fonts/Jost-300-Light.ttf", import.meta.url);
const LOGO_URL = new URL("./brand/oloid-logo.png", import.meta.url);

function fonts() {
  fontsPromise ??= Promise.resolve({
    light: readFileSync(fileURLToPath(JOST_LIGHT_URL)),
  });
  return fontsPromise;
}

/** Белая кисть «ОЛОИД». Прозрачные поля срезаем, ширина на карточке ~230 px. */
function logoMark() {
  logoPromise ??= (async () => {
    const trimmed = await sharp(readFileSync(fileURLToPath(LOGO_URL))).trim({ threshold: 2 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    const width = meta.width ?? LOGO_W;
    const height = meta.height ?? LOGO_W;
    const drawH = Math.max(1, Math.round((LOGO_W * height) / width));
    const sized = await sharp(trimmed).resize({ width: LOGO_W, height: drawH, fit: "fill" }).png().toBuffer();
    return { src: `data:image/png;base64,${sized.toString("base64")}`, width: LOGO_W, height: drawH };
  })();
  return logoPromise;
}

function localPicturePath(pictureUrl: string): string | null {
  try {
    const path = new URL(pictureUrl).pathname;
    const match = path.match(/^\/media\/(oloid\/[a-z0-9._/-]+\.jpe?g)$/i);
    if (!match || match[1].includes("..")) return null;
    return join(process.cwd(), "public", "media", match[1]);
  } catch {
    return null;
  }
}

export async function loadPictureBytes(pictureUrl: string): Promise<Buffer> {
  const local = localPicturePath(pictureUrl);
  if (local && existsSync(local)) return readFile(local);
  const res = await fetch(pictureUrl);
  if (!res.ok) throw new Error(`кадр недоступен (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

type Node = { type: string; props: { style?: Record<string, string | number>; children?: unknown; src?: string } };

function box(style: Record<string, string | number>, children?: unknown): Node {
  return { type: "div", props: { style: { display: "flex", ...style }, children: children ?? "" } };
}

function titleSize(lines: string[]): number {
  const longest = Math.max(...lines.map((line) => [...line].length));
  // Короткая строка — 150 px: «ДВЕ ПЛИТЫ» на этом кегле помещается. Длинную уменьшаем, чтобы осталась одна строка.
  if (longest <= 12) return TITLE_PX;
  const maxW = 940;
  const unit = 0.74;
  return Math.max(72, Math.floor(maxW / (longest * unit)));
}

function captionSize(lines: string[]): number {
  const longest = Math.max(...lines.map((line) => [...line].length), 1);
  const maxW = 920;
  let size = 36;
  while (size > 26 && longest * size * 0.5 > maxW) size -= 1;
  return size;
}

function titleLine(text: string, fontSize: number): Node {
  return box(
    {
      color: YELLOW,
      fontFamily: "Jost",
      fontWeight: 300,
      fontSize,
      letterSpacing: "0.02em",
      lineHeight: 0.92,
      whiteSpace: "nowrap",
      textShadow: "0px 6px 18px rgba(0,0,0,0.55)",
    },
    text,
  );
}

// Затемнение отдельно от текста: у satori абсолютные слои оказываются поверх букв и гасят белый.
function gradientSvg(): Buffer {
  return Buffer.from(`<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.62"/>
      <stop offset="48%" stop-color="#000" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bot" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#000" stop-opacity="0.92"/>
      <stop offset="14%" stop-color="#000" stop-opacity="0.8"/>
      <stop offset="34%" stop-color="#000" stop-opacity="0.46"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${SIZE}" height="280" fill="url(#top)"/>
  <rect x="0" y="${SIZE - 700}" width="${SIZE}" height="700" fill="url(#bot)"/>
</svg>`);
}

function overlayTree(title: string, caption: string, logo: { src: string; width: number; height: number }): Node {
  const lines = factCardTitleLines(title);
  const capLines = factCardCaptionLines(caption);
  const tSize = titleSize(lines);
  const cSize = captionSize(capLines);
  return box(
    {
      width: SIZE,
      height: SIZE,
      flexDirection: "column",
      alignItems: "center",
      backgroundColor: "transparent",
    },
    [
      box(
        {
          width: SIZE,
          height: SIZE,
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 48,
          paddingBottom: 50,
          paddingLeft: 64,
          paddingRight: 64,
        },
        [
          {
            type: "img",
            props: {
              src: logo.src,
              width: logo.width,
              height: logo.height,
              style: { width: logo.width, height: logo.height },
            },
          },
          box(
            {
              color: "rgba(255,255,255,0.94)",
              fontFamily: "Jost",
              fontWeight: 300,
              fontSize: 22,
              letterSpacing: "0.16em",
              lineHeight: 1,
              marginTop: 14,
              marginRight: -4,
            },
            "мистическая визуальная новелла",
          ),
          box({ flex: 1 }),
          box(
            { flexDirection: "column", alignItems: "center", width: "100%" },
            lines.map((line, i) => box({ marginTop: i === 0 ? 0 : 4, justifyContent: "center", width: "100%" }, titleLine(line, tSize))),
          ),
          box(
            { flexDirection: "column", alignItems: "center", marginTop: 36, width: "100%" },
            capLines.map((line, i) =>
              box(
                {
                  justifyContent: "center",
                  width: "100%",
                  color: "#ffffff",
                  fontFamily: "Jost",
                  fontWeight: 300,
                  fontSize: cSize,
                  lineHeight: 1.25,
                  marginTop: i === 0 ? 0 : 6,
                  textAlign: "center",
                },
                line,
              ),
            ),
          ),
        ],
      ),
    ],
  );
}

async function renderOverlay(title: string, caption: string): Promise<Buffer> {
  const [face, logo] = await Promise.all([fonts(), logoMark()]);
  const svg = await satori(overlayTree(normalizeTitle(title), normalizeCaption(caption), logo) as never, {
    width: SIZE,
    height: SIZE,
    fonts: [{ name: "Jost", data: face.light, weight: 300, style: "normal" }],
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: SIZE },
    background: "rgba(0,0,0,0)",
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

export function assertFactCardPng(png: Buffer): void {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) throw new Error("карточка не PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== SIZE || height !== SIZE) throw new Error(`карточка ${width}×${height}, нужна ${SIZE}×${SIZE}`);
}

/** Кадр на весь квадрат и текст поверх. Бросает, если шрифт, кадр или вёрстка сломались. */
export async function renderFactCard(input: { pictureUrl: string; title: string; caption: string }): Promise<Buffer> {
  const [photo, overlay] = await Promise.all([
    loadPictureBytes(input.pictureUrl),
    renderOverlay(input.title, input.caption),
  ]);
  const png = await sharp(photo)
    .rotate()
    .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
    .composite([
      { input: gradientSvg(), top: 0, left: 0 },
      { input: overlay, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  assertFactCardPng(png);
  return png;
}

export async function renderFactCardByBg(bg: string, title: string, caption: string): Promise<Buffer> {
  const picture = pictureByBg(bg);
  if (!picture) throw new Error("неизвестный кадр");
  return renderFactCard({ pictureUrl: picture.url, title, caption });
}

export type ResolvedCardMedia = { media?: Media; cardUrl?: string; cardFallback?: string };

/**
 * Если карточка собралась — в пост уходит её публичный адрес.
 * Если нет — остаётся обычный кадр, cardFallback попадает в отчёт Telegram.
 * cache пишем только перед настоящей публикацией: превью кадр не прячет в Redis.
 */
export async function resolveFactCardMedia(input: {
  media?: Media;
  card?: FactCardCopy;
  pictureUrl?: string;
  cache?: boolean;
}): Promise<ResolvedCardMedia> {
  const { media, card, pictureUrl, cache } = input;
  if (!card || !pictureUrl || media?.type !== "IMAGE" || media.url !== pictureUrl) return { media };
  try {
    const png = await renderFactCard({ pictureUrl, title: card.title, caption: card.caption });
    const cardUrl = factCardPublicUrl(pictureUrl, card.title, card.caption);
    if (cache) {
      await saveFactCardPng(factCardCacheId(pictureUrl, card.title, card.caption), png).catch((e) => {
        console.error("карточка: кэш Redis не записался, ссылка отрендерится заново:", e instanceof Error ? e.message : e);
      });
    }
    return { media: { type: "IMAGE", url: cardUrl, droppable: true }, cardUrl };
  } catch (e) {
    const reason = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 180);
    console.error("карточка не собралась:", reason);
    return { media, cardFallback: reason };
  }
}
