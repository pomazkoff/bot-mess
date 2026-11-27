import { createHash } from "node:crypto";
import { createClient } from "redis";
import type { Channel } from "./channels.js";
import { claimDecision, DRAFT_ID_RE, DRAFT_LOCK_SEC, DRAFT_TTL_SEC, EDIT_PENDING_TTL_SEC, type ClaimResult, type DraftGate, type PendingDraftEdit, type PublishDraft } from "./drafts.js";
import { isManualKey, MANUAL_LOCK_SEC, MANUAL_TTL_SEC } from "./manual.js";
import { isRepostKey } from "./repost.js";

// Redis из Vercel Marketplace (Redis или Upstash) — оба отдают REDIS_URL.
// Подключение ленивое: без Redis функция не падает при загрузке, а внятно сообщает об ошибке.
// Соединение переиспользуется между вызовами одного инстанса (Fluid compute).
const makeClient = (url: string) =>
  createClient({
    url,
    // Не висим до таймаута функции, если база недоступна: 3 попытки и ошибка
    socket: { connectTimeout: 5000, reconnectStrategy: (n) => (n > 3 ? new Error("Redis недоступен") : 500) },
  });
type Client = ReturnType<typeof makeClient>;
let pending: Promise<Client> | null = null;

async function db(): Promise<Client> {
  if (pending) {
    const c = await pending.catch(() => null);
    if (c?.isOpen) return c;
  }
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Нет REDIS_URL: подключи Redis к проекту (Vercel → Storage)");
  const c = makeClient(url);
  c.on("error", (e) => console.error("Redis:", e?.message ?? e));
  pending = c.connect().then(() => c);
  return pending;
}

export type HistoryItem = {
  channel?: string; // нет у старых записей — значит, pomazkof
  project: string;
  rubric: string;
  text: string;
  topic?: string; // тема из списка рубрики (чтобы не повторять)
  topicTag?: string; // тема Threads, с которой вышел пост
  media?: string; // ссылка на прикреплённое видео или картинку
  postId?: string;
  at: string;
  quiet?: boolean; // обычный пост без ссылки и без призыва
  poll?: boolean; // к посту ушёл опрос
  pollOptions?: string[];
  dateHook?: string; // id повода из календаря обычных постов
  devFactId?: string; // id факта рубрики «цифры разработки»
  lineId?: string; // id реплики рубрики «реплика дня»
  mediaId?: string; // id карусели или ролика обычного поста
  provocationFormat?: string; // id формата рубрики provocation
  factIds?: string[]; // id редких фактов «Олоида», выданных в промпт этого поста (очередь фактов)
  vkAngle?: string; // id угла рубрики vkplay
  editorialId?: string; // id дневника, кадра или отзыва. По нему источник отдыхает, а не рубрика целиком
  copyHook?: string; // id захода «Олоида» (lib/oloidCopy.ts)
  copyClosing?: string; // id варианта последней строки «Олоида»
  studioSubject?: string; // проект студии в личном блоге @pomazkof
  studioFactId?: string; // факт этого поста, чтобы не повторять его ~10 постов
};

const K = {
  token: "threads:token",
  history: "threads:history",
  lastProject: "threads:last_project",
};

type SavedToken = { value: string; refreshedAt: number; envHash?: string };

// Ключи по аккаунтам; у @pomazkof — прежние имена, чтобы не потерять сохранённое
const tokenKey = (ch: Channel) => (ch.id === "pomazkof" ? K.token : `${K.token}:${ch.id}`);
const lastProjectKey = (ch: Channel) => (ch.id === "pomazkof" ? K.lastProject : `${K.lastProject}:${ch.id}`);
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Токен аккаунта: продлённый из Redis, а если в Vercel положили новый токен — новый. */
export async function getToken(ch: Channel): Promise<SavedToken> {
  const env = process.env[ch.tokenEnv]?.trim();
  const raw = await (await db()).get(tokenKey(ch));
  const saved: SavedToken | null = raw ? JSON.parse(raw) : null;
  if (saved?.value && (!env || saved.envHash === hash(env))) return saved;
  if (!env) throw new Error(`Нет ${ch.tokenEnv}`);
  const fresh = { value: env, refreshedAt: Date.now(), envHash: hash(env) };
  await (await db()).set(tokenKey(ch), JSON.stringify(fresh));
  return fresh;
}

export async function saveToken(ch: Channel, value: string, envHash?: string) {
  await (await db()).set(tokenKey(ch), JSON.stringify({ value, refreshedAt: Date.now(), envHash }));
}

// 200 — вся хранимая история (pushHistory режет до 200): очереди тем и фактов видят полный круг.
export async function getHistory(n = 200): Promise<HistoryItem[]> {
  const rows = await (await db()).lRange(K.history, 0, n - 1);
  return rows.map((r) => JSON.parse(r) as HistoryItem);
}

export async function pushHistory(item: HistoryItem) {
  const c = await db();
  await c.lPush(K.history, JSON.stringify(item));
  await c.lTrim(K.history, 0, 199);
}

export async function getLastProject(ch: Channel): Promise<string | null> {
  return (await db()).get(lastProjectKey(ch));
}

export async function setLastProject(ch: Channel, id: string) {
  await (await db()).set(lastProjectKey(ch), id);
}

// МСК-дата последнего успешно опубликованного App Store-поста. Неудачный слот сюда не пишется.
const appStoreDayKey = (projectId: string) => `threads:appstore_day:${projectId}`;

export async function getAppStoreDay(projectId: string): Promise<string | null> {
  return (await db()).get(appStoreDayKey(projectId));
}

export async function setAppStoreDay(projectId: string, mskDate: string) {
  await (await db()).set(appStoreDayKey(projectId), mskDate);
}

// МСК-дата, на которую слот VK Play уже закрыт: успешный пост или пропуск из-за TODO в ссылке.
const vkPlayDayKey = (projectId: string) => `threads:vkplay_day:${projectId}`;

export async function getVkPlayDay(projectId: string): Promise<string | null> {
  return (await db()).get(vkPlayDayKey(projectId));
}

export async function setVkPlayDay(projectId: string, mskDate: string) {
  await (await db()).set(vkPlayDayKey(projectId), mskDate);
}

// МСК-дата последней успешной провокации. Неудачная генерация сюда не пишет: 20:00 слот не догоняет.
const provocationDayKey = (projectId: string) => `threads:provocation_day:${projectId}`;
const provocationCountKey = (projectId: string) => `threads:provocation_count:${projectId}`;
const provocationFormatKey = (projectId: string) => `threads:provocation_format:${projectId}`;

export async function getProvocationDay(projectId: string): Promise<string | null> {
  return (await db()).get(provocationDayKey(projectId));
}

export async function setProvocationDay(projectId: string, mskDate: string) {
  await (await db()).set(provocationDayKey(projectId), mskDate);
}

export type ProvocationState = {
  /** null — счётчика ещё нет, вызывающий считает по истории. */
  count: number | null;
  /** id формата → ISO-время последней публикации. */
  formats: Record<string, string>;
};

export async function getProvocationState(projectId: string): Promise<ProvocationState> {
  const c = await db();
  const [countRaw, formats] = await Promise.all([c.get(provocationCountKey(projectId)), c.hGetAll(provocationFormatKey(projectId))]);
  const count = countRaw == null || countRaw === "" ? null : Number(countRaw);
  return { count: count != null && Number.isFinite(count) ? count : null, formats };
}

/** Пишется только после успешной публикации. Счётчик задаёт следующий опрос и следующую ссылку. */
export async function saveProvocation(
  projectId: string,
  patch: { formatId: string; at: string; count: number },
): Promise<void> {
  const c = await db();
  await Promise.all([
    c.hSet(provocationFormatKey(projectId), patch.formatId, patch.at),
    c.set(provocationCountKey(projectId), String(patch.count)),
  ]);
}

// Отдельный ключ на код: SET NX, поэтому повторно отметить опубликованный код нельзя.
// Неудачная публикация сюда не пишет.
const appStoreCodeKey = (projectId: string, code: string) => `threads:appstore_code:${projectId}:${code}`;

export async function getAppStoreCodesUsed(projectId: string, codes: readonly string[]): Promise<string[]> {
  if (!codes.length) return [];
  const values = await (await db()).mGet(codes.map((code) => appStoreCodeKey(projectId, code)));
  return codes.filter((_, i) => values[i] != null);
}

/** true — код отмечен сейчас. false — уже был отмечен раньше, повторно не пишем. */
export async function markAppStoreCodeUsed(projectId: string, code: string): Promise<boolean> {
  const res = await (await db()).set(appStoreCodeKey(projectId, code), new Date().toISOString(), { NX: true });
  return res === "OK";
}

// Заготовленный пост. Флаг ставится только после успешной публикации и не снимается.
const scheduledKey = (id: string) => `threads:scheduled:${id}`;
// Короткий замок на время публикации, чтобы два крона не создали два поста. Это не флаг успеха.
const scheduledLockKey = (id: string) => `threads:scheduled:${id}:lock`;
const SCHEDULED_LOCK_SEC = 16 * 60;

export async function isScheduledPublished(id: string): Promise<boolean> {
  return (await (await db()).exists(scheduledKey(id))) === 1;
}

export async function markScheduledPublished(id: string, postId: string): Promise<void> {
  await (await db()).set(scheduledKey(id), JSON.stringify({ postId, at: new Date().toISOString() }));
}

/** true — замок наш. false — публикация этого id уже идёт в другом запуске. */
export async function claimScheduled(id: string): Promise<boolean> {
  const res = await (await db()).set(scheduledLockKey(id), new Date().toISOString(), { NX: true, EX: SCHEDULED_LOCK_SEC });
  return res === "OK";
}

export async function releaseScheduledClaim(id: string): Promise<void> {
  await (await db()).del(scheduledLockKey(id));
}

// Одноразовый пост. Флаг успеха не снимается. Замок — только на время публикации.
const oneshotKey = (id: string) => `threads:oneshot:${id}`;
const oneshotLockKey = (id: string) => `threads:oneshot:${id}:lock`;
const ONESHOT_LOCK_SEC = 16 * 60;

export async function isOneshotPublished(id: string): Promise<boolean> {
  return (await (await db()).exists(oneshotKey(id))) === 1;
}

export async function markOneshotPublished(id: string, postId: string): Promise<void> {
  await (await db()).set(oneshotKey(id), JSON.stringify({ postId, at: new Date().toISOString() }));
}

/** true — замок наш. false — этот одноразовый пост уже публикует другой запуск. */
export async function claimOneshot(id: string): Promise<boolean> {
  const res = await (await db()).set(oneshotLockKey(id), new Date().toISOString(), { NX: true, EX: ONESHOT_LOCK_SEC });
  return res === "OK";
}

export async function releaseOneshotClaim(id: string): Promise<void> {
  await (await db()).del(oneshotLockKey(id));
}

// Очередь обычных постов «Олоида». Пишется только после успешной публикации.
const rubricUsedKey = (projectId: string) => `threads:rubric_used:${projectId}`;
const devFactUsedKey = (projectId: string) => `threads:dev_fact_used:${projectId}`;
const lineUsedKey = (projectId: string) => `threads:line_used:${projectId}`;
const regularCountKey = (projectId: string) => `threads:regular_count:${projectId}`;
const dateHookKey = (projectId: string) => `threads:date_hook:${projectId}`;
const askPollKey = (projectId: string) => `threads:ask_poll:${projectId}`;
const mediaUsedKey = (projectId: string) => `threads:media_used:${projectId}`;
const editorialUsedKey = (projectId: string) => `threads:editorial_used:${projectId}`;

export type OloidRotationState = {
  rubricUsed: Record<string, string>;
  devFactUsed: Record<string, string>;
  lineUsed: Record<string, string>;
  regularCount: number | null;
  /** id повода → дата МСК, когда он уже вышел. */
  dateHooks: Record<string, string>;
  /** null — опроса «вопрос к вам» ещё не было. */
  lastAskWasPoll: boolean | null;
  /** id карусели или ролика → ISO-время последней публикации. */
  mediaUsed: Record<string, string>;
  /** id дневника, кадра или отзыва → ISO-время. */
  editorialUsed: Record<string, string>;
};

export async function getOloidRotationState(projectId: string): Promise<OloidRotationState> {
  const c = await db();
  const [rubricUsed, devFactUsed, lineUsed, regularRaw, dateHooks, askPoll, mediaUsed, editorialUsed] = await Promise.all([
    c.hGetAll(rubricUsedKey(projectId)),
    c.hGetAll(devFactUsedKey(projectId)),
    c.hGetAll(lineUsedKey(projectId)),
    c.get(regularCountKey(projectId)),
    c.hGetAll(dateHookKey(projectId)),
    c.get(askPollKey(projectId)),
    c.hGetAll(mediaUsedKey(projectId)),
    c.hGetAll(editorialUsedKey(projectId)),
  ]);
  const regularCount = regularRaw == null || regularRaw === "" ? null : Number(regularRaw);
  return {
    rubricUsed,
    devFactUsed,
    lineUsed,
    regularCount: regularCount != null && Number.isFinite(regularCount) ? regularCount : null,
    dateHooks,
    lastAskWasPoll: askPoll == null ? null : askPoll === "1",
    mediaUsed,
    editorialUsed,
  };
}

export async function saveOloidRotation(
  projectId: string,
  patch: {
    rubricId: string;
    at: string;
    regularCount: number;
    dateHook?: string;
    dateMsk?: string;
    devFactId?: string;
    lineId?: string;
    askPoll?: boolean;
    mediaId?: string;
    editorialId?: string;
  },
): Promise<void> {
  const c = await db();
  const ops: Promise<unknown>[] = [
    c.hSet(rubricUsedKey(projectId), patch.rubricId, patch.at),
    c.set(regularCountKey(projectId), String(patch.regularCount)),
  ];
  if (patch.dateHook && patch.dateMsk) ops.push(c.hSet(dateHookKey(projectId), patch.dateHook, patch.dateMsk));
  if (patch.devFactId) ops.push(c.hSet(devFactUsedKey(projectId), patch.devFactId, patch.at));
  if (patch.lineId) ops.push(c.hSet(lineUsedKey(projectId), patch.lineId, patch.at));
  if (patch.mediaId) ops.push(c.hSet(mediaUsedKey(projectId), patch.mediaId, patch.at));
  if (patch.editorialId) ops.push(c.hSet(editorialUsedKey(projectId), patch.editorialId, patch.at));
  if (patch.askPoll != null) ops.push(c.set(askPollKey(projectId), patch.askPoll ? "1" : "0"));
  await Promise.all(ops);
}

// Черновик @pomazkof для кнопки в Telegram. Ключ живёт 7 суток. Замок — отдельный SET NX на время публикации.
const draftKey = (id: string) => `threads:draft:${id}`;
const draftLockKey = (id: string) => `threads:draft:${id}:lock`;

async function readDraft(id: string): Promise<PublishDraft | null> {
  if (!DRAFT_ID_RE.test(id)) return null;
  const raw = await (await db()).get(draftKey(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PublishDraft;
    if (!parsed || parsed.id !== id || typeof parsed.text !== "string") return null;
    if (parsed.status !== "pending" && parsed.status !== "published" && parsed.status !== "skipped") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePublishDraft(draft: PublishDraft): Promise<void> {
  if (!DRAFT_ID_RE.test(draft.id)) throw new Error("плохой id черновика");
  const stored: PublishDraft = { ...draft, status: "pending" };
  delete stored.postId;
  delete stored.permalink;
  await (await db()).set(draftKey(draft.id), JSON.stringify(stored), { EX: DRAFT_TTL_SEC });
}

export async function getPublishDraft(id: string): Promise<PublishDraft | null> {
  return readDraft(id);
}

/** Замок берёт один вызов. Повтор, пока он держится, получает busy и пост не создаёт. */
export async function claimPublishDraft(id: string): Promise<ClaimResult> {
  if (!DRAFT_ID_RE.test(id)) return { kind: "missing" };
  const c = await db();
  const first = await readDraft(id);
  if (!first || first.status !== "pending") return claimDecision(first, false);
  const locked = await c.set(draftLockKey(id), new Date().toISOString(), { NX: true, EX: DRAFT_LOCK_SEC });
  const acquired = locked === "OK";
  try {
    const fresh = await readDraft(id);
    const decision = claimDecision(fresh, acquired && fresh?.status === "pending");
    if (decision.kind !== "go" && acquired) await c.del(draftLockKey(id));
    return decision;
  } catch (error) {
    if (acquired) await c.del(draftLockKey(id));
    throw error;
  }
}

export async function releaseDraftClaim(id: string): Promise<void> {
  if (!DRAFT_ID_RE.test(id)) return;
  await (await db()).del(draftLockKey(id));
}

/** Сохраняет статус, не продлевая 7 суток и не воскрешая уже истёкший ключ. */
async function replaceDraft(id: string, next: PublishDraft): Promise<void> {
  const c = await db();
  const ttl = await c.ttl(draftKey(id));
  if (ttl < 1) return;
  await c.set(draftKey(id), JSON.stringify(next), { EX: ttl });
}

export async function markDraftPublished(id: string, postId: string, permalink?: string): Promise<void> {
  if (!DRAFT_ID_RE.test(id)) return;
  const c = await db();
  const draft = await readDraft(id);
  if (draft) {
    const next: PublishDraft = { ...draft, status: "published", postId };
    if (permalink) next.permalink = permalink;
    else delete next.permalink;
    await replaceDraft(id, next);
  }
  await c.del(draftLockKey(id));
}

export async function gatePublishDraft(id: string): Promise<DraftGate> {
  if (!DRAFT_ID_RE.test(id)) return "missing";
  const draft = await readDraft(id);
  if (!draft) return "missing";
  if (draft.status === "published" || draft.status === "skipped") return draft.status;
  const lock = await (await db()).get(draftLockKey(id));
  if (lock) return "busy";
  return "pending";
}

/** Меняет только текст. Картинка, ссылка и остальные поля остаются. Замок публикации не даёт переписать текст посреди поста. */
export async function updatePublishDraftText(id: string, text: string): Promise<"ok" | "missing" | "published" | "skipped" | "busy"> {
  if (!DRAFT_ID_RE.test(id)) return "missing";
  const c = await db();
  const first = await readDraft(id);
  if (!first) return "missing";
  if (first.status === "published") return "published";
  if (first.status === "skipped") return "skipped";
  const locked = await c.set(draftLockKey(id), "edit", { NX: true, EX: DRAFT_LOCK_SEC });
  if (locked !== "OK") {
    const again = await readDraft(id);
    if (!again) return "missing";
    if (again.status === "published") return "published";
    if (again.status === "skipped") return "skipped";
    return "busy";
  }
  try {
    const fresh = await readDraft(id);
    if (!fresh) return "missing";
    if (fresh.status === "published" || fresh.status === "skipped") return fresh.status;
    const previous = fresh.text;
    await replaceDraft(id, { ...fresh, text });
    await rewriteDraftHistoryText(fresh.channelId, fresh.at, previous, text).catch((error) => console.error("history", error));
    return "ok";
  } finally {
    await c.del(draftLockKey(id));
  }
}

const editPromptKey = (chatId: string, messageId: number) => `threads:draft_edit:${chatId}:${messageId}`;
const editLastKey = (chatId: string) => `threads:draft_edit_last:${chatId}`;

function parsePending(raw: string | null): PendingDraftEdit | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingDraftEdit;
    if (!value || !DRAFT_ID_RE.test(value.draftId)) return null;
    if (!Number.isInteger(value.promptMessageId) || !Number.isInteger(value.draftMessageId)) return null;
    if (typeof value.originText !== "string") return null;
    return {
      draftId: value.draftId,
      promptMessageId: value.promptMessageId,
      draftMessageId: value.draftMessageId,
      originText: value.originText,
    };
  } catch {
    return null;
  }
}

export async function rememberDraftEdit(chatId: string, pending: PendingDraftEdit): Promise<void> {
  if (!DRAFT_ID_RE.test(pending.draftId)) throw new Error("плохой id черновика");
  const c = await db();
  const payload = JSON.stringify(pending);
  await Promise.all([
    c.set(editPromptKey(chatId, pending.promptMessageId), payload, { EX: EDIT_PENDING_TTL_SEC }),
    c.set(editLastKey(chatId), payload, { EX: EDIT_PENDING_TTL_SEC }),
  ]);
}

export async function findDraftEdit(chatId: string, replyToMessageId?: number): Promise<PendingDraftEdit | null> {
  const c = await db();
  if (typeof replyToMessageId === "number") {
    const hit = parsePending(await c.get(editPromptKey(chatId, replyToMessageId)));
    if (hit) return hit;
  }
  return parsePending(await c.get(editLastKey(chatId)));
}

export async function clearDraftEdit(chatId: string, pending: PendingDraftEdit): Promise<void> {
  const c = await db();
  await c.del(editPromptKey(chatId, pending.promptMessageId));
  const last = parsePending(await c.get(editLastKey(chatId)));
  if (last?.promptMessageId === pending.promptMessageId && last.draftId === pending.draftId) await c.del(editLastKey(chatId));
}

export async function skipPublishDraft(id: string): Promise<"ok" | "missing" | "published" | "skipped" | "busy"> {
  if (!DRAFT_ID_RE.test(id)) return "missing";
  const c = await db();
  const first = await readDraft(id);
  if (!first) return "missing";
  if (first.status === "published") return "published";
  if (first.status === "skipped") return "skipped";
  const locked = await c.set(draftLockKey(id), new Date().toISOString(), { NX: true, EX: DRAFT_LOCK_SEC });
  if (locked !== "OK") {
    const again = await readDraft(id);
    if (!again) return "missing";
    if (again.status === "published") return "published";
    if (again.status === "skipped") return "skipped";
    return "busy";
  }
  try {
    const fresh = await readDraft(id);
    if (!fresh) return "missing";
    if (fresh.status === "published" || fresh.status === "skipped") return fresh.status;
    await replaceDraft(id, { ...fresh, status: "skipped" });
    return "ok";
  } finally {
    await c.del(draftLockKey(id));
  }
}

/** Та же запись истории, что крон положил при черновике: текст меняется, слот остаётся один. */
async function rewriteDraftHistoryText(channel: string, at: string, from: string, to: string, attempt = 0): Promise<void> {
  if (from === to) return;
  const c = await db();
  const rows = await c.lRange(K.history, 0, 199);
  for (let i = 0; i < rows.length; i++) {
    let parsed: HistoryItem;
    try {
      parsed = JSON.parse(rows[i]) as HistoryItem;
    } catch {
      continue;
    }
    if ((parsed.channel ?? "pomazkof") !== (channel || "pomazkof")) continue;
    if (parsed.at !== at || parsed.text !== from || parsed.postId) continue;
    const current = await c.lIndex(K.history, i);
    if (current !== rows[i]) {
      if (attempt === 0) return rewriteDraftHistoryText(channel, at, from, to, 1);
      continue;
    }
    await c.lSet(K.history, i, JSON.stringify({ ...parsed, text: to }));
    return;
  }
}

/**
 * Дописывает postId в уже лежащий черновик (тот же текст и время).
 * Если крон не успел записать историю — кладёт полную запись, как обычная публикация.
 */
export async function recordDraftPublication(
  item: HistoryItem,
  opts: { matchAt: string; clearMedia: boolean },
  attempt = 0,
): Promise<void> {
  const c = await db();
  const rows = await c.lRange(K.history, 0, 199);
  for (let i = 0; i < rows.length; i++) {
    let parsed: HistoryItem;
    try {
      parsed = JSON.parse(rows[i]) as HistoryItem;
    } catch {
      continue;
    }
    if ((parsed.channel ?? "pomazkof") !== (item.channel ?? "pomazkof")) continue;
    if (parsed.at !== opts.matchAt || parsed.text !== item.text) continue;
    if (parsed.postId) return;
    const next: HistoryItem = { ...parsed, postId: item.postId };
    if (opts.clearMedia) {
      delete next.media;
      delete next.mediaId;
    } else if (item.media) next.media = item.media;
    const current = await c.lIndex(K.history, i);
    if (current !== rows[i]) {
      if (attempt === 0) return recordDraftPublication(item, opts, 1);
      continue;
    }
    await c.lSet(K.history, i, JSON.stringify(next));
    return;
  }
  const fresh: HistoryItem = { ...item };
  if (opts.clearMedia) {
    delete fresh.media;
    delete fresh.mediaId;
  }
  await pushHistory(fresh);
}

// Ручной репост /api/repost. Ключ threads:repost:<канал>:<media id> ставится до запроса в Threads
// и снимается, если репост не удался. Успешный id перезаписывает значение. Повторный вызов ключ не берёт.
function assertRepostKey(key: string) {
  if (!isRepostKey(key)) throw new Error("плохой ключ репоста");
}

/** true — этот вызов первый. false — пост этим каналом уже репостили или репост ещё идёт. */
export async function claimRepostKey(key: string): Promise<boolean> {
  assertRepostKey(key);
  const res = await (await db()).set(key, new Date().toISOString(), { NX: true });
  return res === "OK";
}

export async function setRepostKey(key: string, repostId: string): Promise<void> {
  assertRepostKey(key);
  await (await db()).set(key, repostId);
}

export async function deleteRepostKey(key: string): Promise<void> {
  assertRepostKey(key);
  await (await db()).del(key);
}

// Ручной пост /api/post. Ключ threads:manual:<канал>:<хеш> ставится до запроса в Threads
// на время запроса и снимается, если публикация не удалась. Успешный id живёт 7 суток.
function assertManualKey(key: string) {
  if (!isManualKey(key)) throw new Error("плохой ключ ручного поста");
}

export async function getManualKey(key: string): Promise<string | null> {
  assertManualKey(key);
  return (await db()).get(key);
}

/** true — этот вызов первый. false — тот же текст этим каналом уже публиковали или публикация ещё идёт. */
export async function claimManualKey(key: string): Promise<boolean> {
  assertManualKey(key);
  const res = await (await db()).set(key, "", { NX: true, EX: MANUAL_LOCK_SEC });
  return res === "OK";
}

export async function setManualKey(key: string, postId: string): Promise<void> {
  assertManualKey(key);
  await (await db()).set(key, postId, { EX: MANUAL_TTL_SEC });
}

export async function deleteManualKey(key: string): Promise<void> {
  assertManualKey(key);
  await (await db()).del(key);
}
