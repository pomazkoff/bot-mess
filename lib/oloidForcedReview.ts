// Одноразовый отзыв @oloid.vn без генерации. Ближайший крон канала oloid публикует его один раз.
//
// Снять после выхода или если публиковать не нужно:
//   поставить OLOID_FORCED_REVIEW_ENABLED = false и задеплоить.
// Повтор закрывает Redis threads:oloid_forced_review:review-asc-mufasa093-2026-10-23
// (замок threads:oloid_forced_review:review-asc-mufasa093-2026-10-23:lock на время публикации).
// При выключенном флаге ключ можно не стирать: пост больше не берётся.
// Пока флаг включён и ключа нет, пост забирает первый запуск крона oloid.
// Второй крон в те же сутки его не публикует: ключ уже стоит, слот идёт обычным постом.
// Стереть ключ и снова включить флаг — только если этот текст нужно выпустить ещё раз.

import type { Channel } from "./channels.js";
import { REVIEW_REPLY_FALLBACK, OLOID_REVIEWS, OLOID_REVIEW_RUBRIC, assembleReviewPost } from "./oloidEditorial.js";
import { countRegularPosts } from "./oloidRotation.js";
import { PROJECTS } from "./projects.js";
import { pickTopicTag } from "./run.js";
import {
  claimForcedReview,
  getHistory,
  getOloidRotationState,
  isForcedReviewPublished,
  markForcedReviewPublished,
  pushHistory,
  releaseForcedReviewClaim,
  saveOloidRotation,
  setLastProject,
} from "./store.js";
import { findRecentPostByText, postAlreadyPublished, publishPost } from "./threads.js";

export const OLOID_FORCED_REVIEW_ENABLED = true;
export const OLOID_FORCED_REVIEW_ID = "review-asc-mufasa093-2026-10-23";
export const OLOID_FORCED_REVIEW_REDIS_KEY = `threads:oloid_forced_review:${OLOID_FORCED_REVIEW_ID}`;
const FORCED_TOPIC = "Отзыв mufasa093";

export function forcedReviewAction(input: {
  enabled: boolean;
  channelId: string;
  theme: boolean;
  published: boolean;
  dry: boolean;
  claimed: boolean;
}): "none" | "dry" | "locked" | "publish" {
  if (!input.enabled || input.channelId !== "oloid" || input.theme || input.published) return "none";
  if (input.dry) return "dry";
  if (!input.claimed) return "locked";
  return "publish";
}

/** Текст одноразового поста. Собирается как обычный отзыв: цитата, ник, дата, ответ, ссылка. Без картинки. */
export function oloidForcedReviewText(): string {
  const review = OLOID_REVIEWS.find((item) => item.id === OLOID_FORCED_REVIEW_ID);
  if (!review) throw new Error(`нет отзыва ${OLOID_FORCED_REVIEW_ID}`);
  const text = assembleReviewPost(REVIEW_REPLY_FALLBACK, review, { link: review.sourceUrl });
  if (!text) throw new Error("не собрался одноразовый отзыв");
  return text;
}

export type ForcedReviewOutcome =
  | { kind: "none" }
  | { kind: "dry"; text: string; editorialId: string; topic: string }
  | { kind: "locked" }
  | { kind: "too-long"; length: number }
  | {
      kind: "published";
      text: string;
      postId: string;
      editorialId: string;
      topic: string;
      topicTag?: string;
      historyError?: string;
    }
  | { kind: "failed"; error: string };

async function reviewSlotMeta(): Promise<{ topicTag?: string; regularCount: number }> {
  const oloid = PROJECTS.find((project) => project.id === "oloid");
  const rubric = oloid?.rubrics.find((item) => item.id === OLOID_REVIEW_RUBRIC);
  const history = await getHistory();
  const rotation = await getOloidRotationState("oloid");
  const projectHistory = history.filter((item) => item.project === "oloid");
  return {
    topicTag: oloid && rubric ? pickTopicTag(oloid, rubric, history) : undefined,
    regularCount: (rotation.regularCount ?? countRegularPosts(projectHistory)) + 1,
  };
}

async function rememberForcedReview(
  ch: Channel,
  text: string,
  postId: string,
  at: string,
  meta: { topicTag?: string; regularCount: number },
): Promise<string | undefined> {
  try {
    await saveOloidRotation("oloid", {
      rubricId: OLOID_REVIEW_RUBRIC,
      at,
      regularCount: meta.regularCount,
      editorialId: OLOID_FORCED_REVIEW_ID,
    });
    await pushHistory({
      channel: ch.id,
      project: "oloid",
      rubric: OLOID_REVIEW_RUBRIC,
      topic: FORCED_TOPIC,
      topicTag: meta.topicTag,
      text,
      postId,
      at,
      editorialId: OLOID_FORCED_REVIEW_ID,
    });
    await setLastProject(ch, "oloid");
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Один отзыв за всё время, без модели. Картинки нет: у рубрики review медиа не подбирается.
 * dry не ставит замок и не пишет Redis. Уже опубликованный пост сюда не возвращается:
 * крон идёт дальше обычным слотом.
 */
export async function takeOloidForcedReview(ch: Channel, now: Date, dry: boolean, theme = false): Promise<ForcedReviewOutcome> {
  const enabled = OLOID_FORCED_REVIEW_ENABLED;
  if (forcedReviewAction({ enabled, channelId: ch.id, theme, published: false, dry: false, claimed: true }) === "none") {
    return { kind: "none" };
  }
  if (await isForcedReviewPublished(OLOID_FORCED_REVIEW_ID)) return { kind: "none" };

  const text = oloidForcedReviewText();
  if (text.length > 500) return { kind: "too-long", length: text.length };
  if (dry) return { kind: "dry", text, editorialId: OLOID_FORCED_REVIEW_ID, topic: FORCED_TOPIC };

  if (!(await claimForcedReview(OLOID_FORCED_REVIEW_ID))) return { kind: "locked" };
  let publishedId: string | undefined;
  try {
    if (await isForcedReviewPublished(OLOID_FORCED_REVIEW_ID)) {
      await releaseForcedReviewClaim(OLOID_FORCED_REVIEW_ID);
      return { kind: "none" };
    }
    const meta = await reviewSlotMeta();
    const already = await findRecentPostByText(ch, text, null).catch((e) => {
      console.warn("Поиск уже опубликованного отзыва не удался:", e instanceof Error ? e.message : e);
      return null;
    });
    if (already) {
      publishedId = already;
    } else {
      try {
        // Отзыв текстовый: у рубрики review нет кадра, карусели и ролика.
        publishedId = (await publishPost(ch, text, meta.topicTag)).id;
      } catch (e) {
        if (!postAlreadyPublished(e)) throw e;
        publishedId = (await findRecentPostByText(ch, text, null).catch(() => null)) ?? "already-published";
      }
    }
    await markForcedReviewPublished(OLOID_FORCED_REVIEW_ID, publishedId);
    const historyError = await rememberForcedReview(ch, text, publishedId, now.toISOString(), meta);
    await releaseForcedReviewClaim(OLOID_FORCED_REVIEW_ID);
    return {
      kind: "published",
      text,
      postId: publishedId,
      editorialId: OLOID_FORCED_REVIEW_ID,
      topic: FORCED_TOPIC,
      topicTag: meta.topicTag,
      historyError,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (publishedId) {
      return { kind: "failed", error: `пост опубликован (${publishedId}), но флаг не записался: ${message}` };
    }
    await releaseForcedReviewClaim(OLOID_FORCED_REVIEW_ID).catch(() => {});
    return { kind: "failed", error: message };
  }
}
