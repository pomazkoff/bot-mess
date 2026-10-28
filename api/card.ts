import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FACT_CARD_CAPTION_MAX, factCardCacheId, factCardProblem, normalizeCaption, normalizeTitle, pictureByBg } from "../lib/factCard.js";
import { renderFactCardByBg } from "../lib/factCardRender.js";
import { PROJECTS } from "../lib/projects.js";
import { getFactCardPng } from "../lib/store.js";

// Публичная картинка для Threads: Meta скачивает её без секрета.
// Кадр только из пула pictures. Заголовок и подпись проходят те же фильтры, что перед публикацией.
function one(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const bg = one(req.query.bg);
  const title = normalizeTitle(one(req.query.title));
  const caption = normalizeCaption(one(req.query.caption));
  const picture = pictureByBg(bg);
  const oloid = PROJECTS.find((project) => project.id === "oloid");
  const issue = factCardProblem({ title, caption }, { required: true, stopList: oloid?.stopList });
  if (!picture || issue) return res.status(400).json({ error: issue ?? "неизвестный кадр" });
  if ([...caption].length > FACT_CARD_CAPTION_MAX) return res.status(400).json({ error: "подпись длиннее лимита" });
  try {
    const id = factCardCacheId(picture.url, title, caption);
    const cached = await getFactCardPng(id).catch(() => null);
    const png = cached ?? (await renderFactCardByBg(bg, title, caption));
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(png);
  } catch (e) {
    console.error("card", e);
    return res.status(500).json({ error: "card render failed" });
  }
}
