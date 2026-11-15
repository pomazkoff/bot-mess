// Одноразовый пост @oloid.vn: отзыв mufasa093 с нейтральным ответом.
// Следующий крон канала oloid (расписание или ручной GET /api/cron?channel=oloid с Bearer CRON_SECRET)
// публикует текст ниже один раз, без модели и без валидаторов, и больше не повторяет.
// dry=1 и DRY_RUN флаг не ставят: пост выйдет на ближайшем боевом запуске.
// Пост текстовый: у рубрики review нет картинки, withPicture не задан.
//
// Как снять одноразовый пост:
// 1. Удалить вызов publishOloidOneshot из api/cron.ts.
// 2. Удалить этот файл и ключи в lib/store.ts (oneshotKey / claimOneshot), если они больше никому не нужны.
// 3. Redis можно не чистить. Пока стоит threads:oneshot:oloid-review-mufasa093-2026-10-23,
//    повторной публикации не будет, даже если код вернуть. Замок :lock живёт 16 минут и сам сгорает.
// Историю и threads:editorial_used:oloid для review-asc-mufasa093-2026-10-23 не стирать:
// по ним этот отзыв не берётся снова раньше кулдауна.

import { OLOID_APP_STORE_URL } from "./projects.js";
import { OLOID_REVIEWS, OLOID_REVIEW_RUBRIC, assembleReviewPost, REVIEW_REPLY_FALLBACK } from "./oloidEditorial.js";
import { countRegularPosts } from "./oloidRotation.js";
import { findRecentPostByText, publishPost } from "./threads.js";
import {
  claimOneshot,
  getHistory,
  getOloidRotationState,
  isOneshotPublished,
  markOneshotPublished,
  pushHistory,
  releaseOneshotClaim,
  saveOloidRotation,
  setLastProject,
  type HistoryItem,
} from "./store.js";
import type { Channel } from "./channels.js";

export const OLOID_ONESHOT_ID = "oloid-review-mufasa093-2026-10-23";
export const OLOID_ONESHOT_EDITORIAL_ID = "review-asc-mufasa093-2026-10-23";
export const OLOID_ONESHOT_TOPIC = "Отзыв mufasa093";

const QUOTE =
  "Олоид - первая игра в жанре визуальной новеллы, с которой я столкнулся. Очень рад, что познакомился с жанром именно через эту игру. Нереальная рисовка, отличный сценарий и голоса, музыка очень понравилась. Читал, что запланировано ещё три эпизода. Жду с нетерпением 🔥";

/** Текст поста. Совпадает со сборкой отзыва: цитата, ник, дата, нейтральный ответ, страница App Store. */
export const OLOID_ONESHOT_TEXT = `«${QUOTE}»

mufasa093, App Store, 23 октября 2026

${REVIEW_REPLY_FALLBACK}

${OLOID_APP_STORE_URL}`;

export type OneshotOutcome =
  | { kind: "none" }
  | { kind: "dry"; text: string; editorialId: string }
  | { kind: "locked" }
  | { kind: "published"; postId: string; text: string; editorialId: string }
  | { kind: "failed"; error: string };

function assembledMatches(): boolean {
  const review = OLOID_REVIEWS.find((item) => item.id === OLOID_ONESHOT_EDITORIAL_ID);
  if (!review || review.text !== QUOTE) return false;
  return assembleReviewPost(REVIEW_REPLY_FALLBACK, review, { link: OLOID_APP_STORE_URL }) === OLOID_ONESHOT_TEXT;
}

async function remember(id: string, postId: string) {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      await markOneshotPublished(id, postId);
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw last instanceof Error ? last : new Error("не записался флаг threads:oneshot");
}

async function rememberReview(channel: Channel, now: Date, postId: string) {
  const at = now.toISOString();
  const item: HistoryItem = {
    channel: channel.id,
    project: "oloid",
    rubric: OLOID_REVIEW_RUBRIC,
    topic: OLOID_ONESHOT_TOPIC,
    text: OLOID_ONESHOT_TEXT,
    postId,
    at,
    editorialId: OLOID_ONESHOT_EDITORIAL_ID,
  };
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const rotation = await getOloidRotationState("oloid");
      const history = await getHistory();
      const regularCount = rotation.regularCount ?? countRegularPosts(history.filter((row) => row.project === "oloid"));
      await saveOloidRotation("oloid", {
        rubricId: OLOID_REVIEW_RUBRIC,
        at,
        regularCount: regularCount + 1,
        editorialId: OLOID_ONESHOT_EDITORIAL_ID,
      });
      await pushHistory(item);
      await setLastProject(channel, "oloid");
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw last instanceof Error ? last : new Error("отзыв не записался в историю");
}

/**
 * Один успешный запуск. Повтор и параллельный крон пост не создают.
 * Каналы кроме oloid и уже опубликованный id возвращают none.
 */
export async function publishOloidOneshot(channel: Channel, now: Date, dry: boolean): Promise<OneshotOutcome> {
  if (channel.id !== "oloid") return { kind: "none" };
  if (!assembledMatches()) return { kind: "failed", error: "текст одноразового отзыва разошёлся со сборкой" };
  if (await isOneshotPublished(OLOID_ONESHOT_ID)) return { kind: "none" };
  if (dry) return { kind: "dry", text: OLOID_ONESHOT_TEXT, editorialId: OLOID_ONESHOT_EDITORIAL_ID };

  if (!(await claimOneshot(OLOID_ONESHOT_ID))) return { kind: "locked" };
  let publishedId: string | undefined;
  try {
    if (await isOneshotPublished(OLOID_ONESHOT_ID)) {
      await releaseOneshotClaim(OLOID_ONESHOT_ID);
      return { kind: "none" };
    }
    let already: string | null;
    try {
      already = await findRecentPostByText(channel, OLOID_ONESHOT_TEXT, null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await releaseOneshotClaim(OLOID_ONESHOT_ID).catch(() => {});
      return { kind: "failed", error: `не проверил ленту перед публикацией: ${message}` };
    }
    publishedId = already ?? (await publishPost(channel, OLOID_ONESHOT_TEXT)).id;
    await remember(OLOID_ONESHOT_ID, publishedId);
    try {
      await rememberReview(channel, now, publishedId);
    } catch (e) {
      console.error("одноразовый пост вышел, история отзыва не записалась:", e instanceof Error ? e.message : e);
    }
    await releaseOneshotClaim(OLOID_ONESHOT_ID);
    return { kind: "published", postId: publishedId, text: OLOID_ONESHOT_TEXT, editorialId: OLOID_ONESHOT_EDITORIAL_ID };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!publishedId) await releaseOneshotClaim(OLOID_ONESHOT_ID).catch(() => {});
    return { kind: "failed", error: publishedId ? `пост опубликован (${publishedId}), но флаг не записался: ${message}` : message };
  }
}
