// Выбор поста для ручного репоста /api/repost.
// Список GET /{threads-user-id}/threads (документация Meta, ноябрь 2026) отдаёт посты пользователя.
// Репост в этом списке — media_type REPOST_FACADE.
// Ответы туда не входят: они на GET /{threads-user-id}/replies. Поля is_reply у GET /threads нет,
// запрашивать его нельзя — API отклонит весь список. Если признак всё же пришёл, строку пропускаем.

export const THREAD_LIST_FIELDS = "id,text,permalink,timestamp,media_type";
export const TEXT_START_LIMIT = 140;

const REPOST_KEY_RE = /^threads:repost:[a-z0-9_-]+:\d{1,32}$/;

export type ThreadListItem = {
  id: string;
  text?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  is_reply?: boolean;
};

export function repostRedisKey(toChannelId: string, mediaId: string): string {
  const key = `threads:repost:${toChannelId}:${mediaId}`;
  if (!REPOST_KEY_RE.test(key)) throw new Error("плохой ключ репоста");
  return key;
}

export function isRepostKey(key: string): boolean {
  return REPOST_KEY_RE.test(key);
}

/** Репост отличается media_type. Ответ — только если API само прислало is_reply. */
export function isRepostOrReply(row: { media_type?: string; is_reply?: boolean }): boolean {
  if (row.media_type === "REPOST_FACADE") return true;
  if (row.is_reply === true) return true;
  return false;
}

function asId(value: unknown): string | undefined {
  if (typeof value === "string" && /^\d{1,32}$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return undefined;
}

export function normalizeThread(raw: unknown): ThreadListItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = asId(row.id);
  if (!id) return null;
  return {
    id,
    text: typeof row.text === "string" ? row.text : undefined,
    permalink: typeof row.permalink === "string" ? row.permalink : undefined,
    timestamp: typeof row.timestamp === "string" ? row.timestamp : undefined,
    media_type: typeof row.media_type === "string" ? row.media_type : undefined,
    is_reply: row.is_reply === true ? true : undefined,
  };
}

export function threadsFromList(json: unknown): ThreadListItem[] {
  const data = json && typeof json === "object" && "data" in json ? (json as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const item = normalizeThread(row);
    return item ? [item] : [];
  });
}

function timestampOf(row: ThreadListItem): number {
  const at = Date.parse(row.timestamp ?? "");
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

/** Самый свежий свой пост. Без времени остаётся порядок списка: у Threads первая страница — новые сверху. */
export function pickLatestPost(rows: readonly ThreadListItem[]): ThreadListItem | null {
  const usable = rows.filter((row) => row.id && !isRepostOrReply(row));
  if (!usable.length) return null;
  return usable.reduce((best, row) => (timestampOf(row) > timestampOf(best) ? row : best));
}

/** Начало текста для ответа эндпоинта: одна строка, не длиннее TEXT_START_LIMIT. */
export function textStart(text: string | undefined, limit = TEXT_START_LIMIT): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

/** dry=1&full=1 отдаёт текст поста целиком. Иначе — textStart. */
export function shownPostText(text: string | undefined, full = false): string {
  if (full) return text ?? "";
  return textStart(text);
}
