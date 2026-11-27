import { createHash } from "node:crypto";

// Ручная публикация готового текста: /api/post.
// Ключ threads:manual:<канал>:<sha256> живёт 7 суток и снимается, если Threads пост не принял.
// В историю пост кладётся с рубрикой manual: текст виден антиповтору, очереди рубрик не двигаются.

export const MANUAL_RUBRIC = "manual";
export const MANUAL_TTL_SEC = 7 * 24 * 60 * 60;
/** Замок на время запроса. Короткий: если функцию оборвёт таймаут, повтор не блокируется на неделю. */
export const MANUAL_LOCK_SEC = 120;

const MANUAL_KEY_RE = /^threads:manual:[a-z0-9_-]+:[a-f0-9]{64}$/;

export function manualTextHash(channelId: string, text: string): string {
  return createHash("sha256").update(`${channelId}\n${text}`).digest("hex");
}

export function manualRedisKey(channelId: string, text: string): string {
  const key = `threads:manual:${channelId}:${manualTextHash(channelId, text)}`;
  if (!MANUAL_KEY_RE.test(key)) throw new Error("плохой ключ ручного поста");
  return key;
}

export function isManualKey(key: string): boolean {
  return MANUAL_KEY_RE.test(key);
}

/** Запись истории для антиповтора. Без factIds, editorialId и темы: очереди крона не сдвигаются. */
export function manualHistoryItem(input: {
  channelId: string;
  projectId: string;
  text: string;
  postId: string;
  at: string;
  imageUrl?: string;
}): { channel: string; project: string; rubric: string; text: string; postId: string; at: string; media?: string } {
  const item: { channel: string; project: string; rubric: string; text: string; postId: string; at: string; media?: string } = {
    channel: input.channelId,
    project: input.projectId,
    rubric: MANUAL_RUBRIC,
    text: input.text,
    postId: input.postId,
    at: input.at,
  };
  if (input.imageUrl) item.media = input.imageUrl;
  return item;
}
