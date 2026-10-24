// Карусели и короткие ролики геймплея. Оба выключены: файлы появятся позже.
// Включить — поставить флаг и положить файлы. Папка сама по себе пост не меняет.
// Threads: опрос только у текстового поста. Карусель — отдельные контейнеры
// с is_carousel_item=true, потом media_type=CAROUSEL и children через запятую, 2–20 штук.
// Здесь, когда включат, берём 2–4 картинки. Ролик — один mp4/mov, не трейлер.

import { readdirSync } from "node:fs";
import { join } from "node:path";

export const OLOID_CAROUSEL_ENABLED = false;
export const OLOID_GAMEPLAY_VIDEO_ENABLED = false;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov"]);

function ext(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function listOloidMedia(subdir: "carousel" | "gameplay"): string[] {
  if (subdir === "carousel" && !OLOID_CAROUSEL_ENABLED) return [];
  if (subdir === "gameplay" && !OLOID_GAMEPLAY_VIDEO_ENABLED) return [];
  const allowed = subdir === "carousel" ? IMAGE_EXT : VIDEO_EXT;
  try {
    return readdirSync(join(process.cwd(), "public/media/oloid", subdir))
      .filter((name) => !name.startsWith(".") && allowed.has(ext(name)))
      .sort();
  } catch {
    return [];
  }
}

/** 2–4 имени файлов. Пусто, пока флаг выключен или файлов меньше двух. */
export function pickCarouselNames(): string[] {
  const files = listOloidMedia("carousel");
  if (files.length < 2) return [];
  return files.slice(0, 4);
}

export function pickGameplayName(): string | undefined {
  return listOloidMedia("gameplay")[0];
}
