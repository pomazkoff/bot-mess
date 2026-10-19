import { PROJECTS, type Media } from "./projects.js";
import type { Channel } from "./channels.js";
import { postAlreadyPublished, publishPost, findRecentPostByText } from "./threads.js";
import { claimScheduled, isScheduledPublished, markScheduledPublished, releaseScheduledClaim } from "./store.js";

// Заготовленный пост публикуется как есть: без генерации и без фильтров, кроме длины.
// Пауза канала (channel.paused) его не глушит — её проверяют после этого шага.
export type ScheduledPost = {
  id: string;
  channel: string;
  notBefore: string; // ISO-8601 с поясом, например 2026-10-19T21:00:00+03:00
  text: string;
  media: Media;
  topicTag?: string;
};

// Та же схема, что Project.link у «Бюро»: utm() в lib/projects.ts, месяц кампании — UTC.
// notBefore 21:00 МСК = 18:00 UTC, кампания threads-2026-10. utm_content задан явно.
const buro = PROJECTS.find((p) => p.id === "buro");
if (!buro) throw new Error("нет проекта buro");
const SERIES_DELO1_LINK = buro.link(new Date("2026-10-19T21:00:00+03:00"), "series-delo1-part1");

export const SCHEDULED_TEXT_MAX = 500;

export const SCHEDULED_POSTS: ScheduledPost[] = [
  {
    id: "series-delo1-part1",
    channel: "pomazkof",
    notBefore: "2026-10-19T21:00:00+03:00",
    topicTag: "детектив",
    media: {
      type: "VIDEO",
      url: "https://threads-autopost-six.vercel.app/media/buro/series-delo1-part1.mp4",
    },
    text: `Дело №1. «Смерть на даче, 1987» 🕵️

Председатель кооператива «Рассвет» найден мёртвым. Подозреваемые — пятеро друзей с вечеринки.

Кто убийца? Пиши номер подозреваемого в комментариях 👇 Разгадка — завтра.

Хочешь такое же дело, где подозреваемые — твои друзья? ${SERIES_DELO1_LINK}`,
  },
];

/** Посты канала, чей срок уже наступил, в порядке массива. */
export function dueScheduledPosts(channelId: string, now: Date): ScheduledPost[] {
  return SCHEDULED_POSTS.filter((p) => p.channel === channelId && Date.parse(p.notBefore) <= now.getTime());
}

export type ScheduledOutcome =
  | { kind: "none" }
  | { kind: "dry"; post: ScheduledPost }
  | { kind: "locked"; post: ScheduledPost }
  | { kind: "too-long"; post: ScheduledPost; length: number }
  | { kind: "published"; post: ScheduledPost; postId: string }
  | { kind: "failed"; post: ScheduledPost; error: string };

async function rememberPublished(id: string, postId: string) {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      await markScheduledPublished(id, postId);
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw last instanceof Error ? last : new Error("не записался флаг threads:scheduled");
}

/**
 * Один заготовленный пост за запуск. Флаг threads:scheduled:<id> ставится только после успеха.
 * Повторный запуск сначала ищет тот же текст в Threads, чтобы не создать второй пост,
 * если публикация прошла, а флаг не успел записаться.
 */
export async function publishDueScheduled(ch: Channel, now: Date, dry: boolean): Promise<ScheduledOutcome> {
  for (const post of dueScheduledPosts(ch.id, now)) {
    if (await isScheduledPublished(post.id)) continue;
    if (dry) return { kind: "dry", post };

    const length = post.text.length;
    if (length > SCHEDULED_TEXT_MAX) return { kind: "too-long", post, length };
    if (!process.env[ch.tokenEnv]?.trim()) return { kind: "failed", post, error: `нет ${ch.tokenEnv}` };

    if (!(await claimScheduled(post.id))) return { kind: "locked", post };
    let publishedId: string | undefined;
    try {
      if (await isScheduledPublished(post.id)) {
        await releaseScheduledClaim(post.id);
        continue;
      }

      const already = await findRecentPostByText(ch, post.text, null).catch((e) => {
        console.warn("Поиск уже опубликованного заготовленного поста не удался:", e instanceof Error ? e.message : e);
        return null;
      });
      if (already) {
        publishedId = already;
      } else {
        try {
          publishedId = await publishPost(ch, post.text, post.topicTag, post.media);
        } catch (e) {
          if (!postAlreadyPublished(e)) throw e;
          publishedId = (await findRecentPostByText(ch, post.text, null).catch(() => null)) ?? "already-published";
        }
      }

      await rememberPublished(post.id, publishedId);
      await releaseScheduledClaim(post.id);
      return { kind: "published", post, postId: publishedId };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Пост уже в Threads — замок не снимаем, чтобы повторный крон не создал второй.
      if (publishedId) return { kind: "failed", post, error: `пост опубликован (${publishedId}), но флаг не записался: ${message}` };
      await releaseScheduledClaim(post.id).catch(() => {});
      return { kind: "failed", post, error: message };
    }
  }
  return { kind: "none" };
}
