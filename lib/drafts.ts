import { randomBytes, timingSafeEqual } from "node:crypto";

/** Сколько живёт черновик в Redis. Потом кнопки отвечают «Черновик устарел». */
export const DRAFT_TTL_SEC = 7 * 24 * 60 * 60;
/** Замок на время публикации. Дольше maxDuration вебхука, чтобы повтор не стартовал, пока первый вызов ещё жив. */
export const DRAFT_LOCK_SEC = 8 * 60;
/** Сколько ждём исправленный текст. Потом ответ в чат уже не подставляется в черновик. */
export const EDIT_PENDING_TTL_SEC = 60 * 60;
/**
 * Лимит поля text в Threads. publishPost отправляет draft.text как есть.
 * Тот же порог, что у заготовленных постов: обычная длина строки, не байты.
 */
export const THREADS_TEXT_MAX = 500;
export const DRAFT_ID_RE = /^[a-f0-9]{16}$/;

export const EDIT_PROMPT = "Пришли исправленный текст поста ответом на это сообщение. Ссылка останется прежней.";
export const REPLACED_NOTE = "✏️ заменён новой версией";
export const EDIT_ALREADY_PUBLISHED = "Уже опубликован";
export const EDIT_ALREADY_SKIPPED = "Уже пропущен";

export type DraftMedia = {
  type: "VIDEO" | "IMAGE" | "CAROUSEL";
  url: string;
  urls?: string[];
  droppable?: boolean;
};

export type DraftPoll = {
  option_a: string;
  option_b: string;
  option_c?: string;
  option_d?: string;
};

export type DraftStatus = "pending" | "published" | "skipped";

/** Всё, что нужно, чтобы позже вызвать publishPost и дописать историю. Токенов здесь нет. */
export type PublishDraft = {
  id: string;
  channelId: string;
  projectId: string;
  rubricId: string;
  topic?: string;
  topicTag?: string;
  text: string;
  media?: DraftMedia;
  quiet?: boolean;
  poll?: DraftPoll;
  dateHook?: string;
  devFactId?: string;
  lineId?: string;
  mediaId?: string;
  provocationFormat?: string;
  factIds?: string[];
  vkAngle?: string;
  editorialId?: string;
  copyHook?: string;
  copyClosing?: string;
  studioSubject?: string;
  studioFactId?: string;
  studioLink?: string;
  at: string;
  status: DraftStatus;
  postId?: string;
  permalink?: string;
};

export type ClaimResult =
  | { kind: "go"; draft: PublishDraft }
  | { kind: "missing" }
  | { kind: "published"; draft: PublishDraft }
  | { kind: "skipped"; draft: PublishDraft }
  | { kind: "busy" };

export type DraftGate = "pending" | "missing" | "published" | "skipped" | "busy";

/** Какой черновик ждёт текст. promptMessageId — сообщение с force_reply. */
export type PendingDraftEdit = {
  draftId: string;
  promptMessageId: number;
  draftMessageId: number;
  originText: string;
};

export function newDraftId(): string {
  return randomBytes(8).toString("hex");
}

/** Решение после чтения черновика и попытки SET NX. lockAcquired=false, если замок уже занят или статус не pending. */
export function claimDecision(draft: PublishDraft | null, lockAcquired: boolean): ClaimResult {
  if (!draft) return { kind: "missing" };
  if (draft.status === "published") return { kind: "published", draft };
  if (draft.status === "skipped") return { kind: "skipped", draft };
  if (!lockAcquired) return { kind: "busy" };
  return { kind: "go", draft };
}

export function secretMatches(header: string | undefined, expected: string | undefined): boolean {
  if (!header || !expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function chatAllowed(chatId: string | number | undefined, expected: string | undefined): boolean {
  const want = expected?.trim();
  if (!want || chatId == null) return false;
  return String(chatId).trim() === want;
}

export function parseDraftCallback(data: string | undefined): { action: "pub" | "skip" | "edit"; id: string } | null {
  if (!data) return null;
  const match = /^(pub|skip|edit):([a-f0-9]{16})$/.exec(data);
  if (!match) return null;
  return { action: match[1] as "pub" | "skip" | "edit", id: match[2] };
}

export type TgButton = { text: string; callback_data: string };

export function draftKeyboard(id: string): TgButton[][] {
  if (!DRAFT_ID_RE.test(id)) throw new Error("плохой id черновика");
  const row: TgButton[] = [
    { text: "Опубликовать", callback_data: `pub:${id}` },
    { text: "Пропустить", callback_data: `skip:${id}` },
    { text: "Редактировать", callback_data: `edit:${id}` },
  ];
  for (const button of row) {
    if (Buffer.byteLength(button.callback_data) > 64) throw new Error("callback_data длиннее 64 байт");
  }
  return [row];
}

export function draftTelegramText(draft: { text: string; media?: { url?: string; urls?: string[] }; studioLink?: string }): string {
  const image = draft.media?.urls?.[0] || draft.media?.url;
  return ["черновик @pomazkof", "", draft.text, "", `картинка: ${image ?? "нет"}`, `ссылка: ${draft.studioLink ?? "нет"}`].join("\n");
}

export function publishedNote(permalink?: string): string {
  if (permalink && /^https:\/\//.test(permalink)) return `✅ Опубликовано\n${permalink}`;
  return "✅ Опубликовано";
}

export const SKIPPED_NOTE = "⏭ Пропущено";

const OUTCOME_TAIL = new RegExp(`\\n\\n(?:✅ Опубликовано(?:\\nhttps?:\\/\\/\\S+)?|⏭ Пропущено|${REPLACED_NOTE})$`);

export function withReplaced(original: string): string {
  return withOutcome(original, REPLACED_NOTE);
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Подсказка с текущим текстом в <pre>: в Telegram блок копируется целиком, переводы строк сохраняются. */
export function editPromptHtml(postText: string): string {
  return `${EDIT_PROMPT}\n\n<pre>${escapeHtml(postText)}</pre>`;
}

export type EditedText = { text: string; appendedLink: boolean };

/**
 * Текст, который уйдёт в Threads. publishPost шлёт draft.text как есть и ссылку отдельно не добавляет:
 * генератор уже кладёт studioLink в конец текста. Если в старом тексте эта ссылка была, а в новом её нет,
 * дописываем её тем же хвостом (`\n\n` + url). Иначе пост вышел бы без ссылки, хотя строка «ссылка:» в карточке остаётся.
 * Поле studioLink при этом не меняется. Если в старом тексте ссылки не было или в новом она уже есть — берём присланный текст как есть.
 */
export function composeEditedText(previous: string, incoming: string, studioLink?: string): EditedText {
  const link = studioLink?.trim();
  if (!link || !previous.includes(link) || incoming.includes(link)) return { text: incoming, appendedLink: false };
  const body = incoming.replace(/\s+$/u, "");
  if (!body.trim()) return { text: incoming, appendedLink: false };
  return { text: `${body}\n\n${link}`, appendedLink: true };
}

function ruSymbols(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "символ";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "символа";
  return "символов";
}

/** Ответ, если правка длиннее лимита Threads. pending не снимается. */
export function editLengthReply(length: number, appendedLink: boolean): string {
  const withLink = appendedLink ? " вместе со ссылкой" : "";
  return `Слишком длинно: ${length} ${ruSymbols(length)}${withLink}, лимит ${THREADS_TEXT_MAX}. Пришли короче — правка ещё ждёт.`;
}

export function withOutcome(original: string, outcome: string): string {
  const base = original.replace(OUTCOME_TAIL, "");
  return `${base}\n\n${outcome}`.slice(0, 4096);
}

/** Текст для answerCallbackQuery: лимит Telegram — 200 символов. */
export function publishErrorText(message: string): string {
  const prefix = "Ошибка публикации: ";
  const clean = message.replace(/access_token=[^&\s]+/gi, "access_token=…").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot…").replace(/\s+/g, " ").trim() || "неизвестная ошибка";
  const room = 200 - prefix.length;
  const body = clean.length > room ? `${clean.slice(0, Math.max(0, room - 1))}…` : clean;
  return prefix + body;
}

export function draftChannelProblem(channel: { draftOnly?: boolean } | undefined): string | null {
  if (!channel?.draftOnly) return "канал не принимает публикацию с кнопки";
  return null;
}

export type DraftHistoryRecord = {
  channel?: string;
  project: string;
  rubric: string;
  text: string;
  topic?: string;
  topicTag?: string;
  media?: string;
  postId?: string;
  at: string;
  quiet?: boolean;
  poll?: boolean;
  pollOptions?: string[];
  dateHook?: string;
  devFactId?: string;
  lineId?: string;
  mediaId?: string;
  provocationFormat?: string;
  factIds?: string[];
  vkAngle?: string;
  editorialId?: string;
  copyHook?: string;
  copyClosing?: string;
  studioSubject?: string;
  studioFactId?: string;
};

export function historyFromDraft(draft: PublishDraft, postId: string, mediaUrl: string | undefined, clearMedia: boolean): DraftHistoryRecord {
  const pollOptions = draft.poll
    ? [draft.poll.option_a, draft.poll.option_b, draft.poll.option_c, draft.poll.option_d].filter((option): option is string => Boolean(option))
    : undefined;
  return {
    channel: draft.channelId,
    project: draft.projectId,
    rubric: draft.rubricId,
    topic: draft.topic,
    topicTag: draft.topicTag,
    text: draft.text,
    media: clearMedia ? undefined : mediaUrl,
    postId,
    at: draft.at,
    quiet: draft.quiet,
    poll: pollOptions?.length ? true : undefined,
    pollOptions: pollOptions?.length ? pollOptions : undefined,
    dateHook: draft.dateHook,
    devFactId: draft.devFactId,
    lineId: draft.lineId,
    mediaId: clearMedia ? undefined : draft.mediaId,
    provocationFormat: draft.provocationFormat,
    factIds: draft.factIds,
    vkAngle: draft.vkAngle,
    editorialId: draft.editorialId,
    copyHook: draft.copyHook,
    copyClosing: draft.copyClosing,
    studioSubject: draft.studioSubject,
    studioFactId: draft.studioFactId,
  };
}
