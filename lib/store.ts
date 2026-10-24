import { createHash } from "node:crypto";
import { createClient } from "redis";
import type { Channel } from "./channels.js";

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

export async function getHistory(n = 40): Promise<HistoryItem[]> {
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

// Очередь обычных постов «Олоида». Пишется только после успешной публикации.
const rubricUsedKey = (projectId: string) => `threads:rubric_used:${projectId}`;
const devFactUsedKey = (projectId: string) => `threads:dev_fact_used:${projectId}`;
const lineUsedKey = (projectId: string) => `threads:line_used:${projectId}`;
const regularCountKey = (projectId: string) => `threads:regular_count:${projectId}`;
const dateHookKey = (projectId: string) => `threads:date_hook:${projectId}`;
const askPollKey = (projectId: string) => `threads:ask_poll:${projectId}`;

export type OloidRotationState = {
  rubricUsed: Record<string, string>;
  devFactUsed: Record<string, string>;
  lineUsed: Record<string, string>;
  regularCount: number | null;
  /** id повода → дата МСК, когда он уже вышел. */
  dateHooks: Record<string, string>;
  /** null — опроса «вопрос к вам» ещё не было. */
  lastAskWasPoll: boolean | null;
};

export async function getOloidRotationState(projectId: string): Promise<OloidRotationState> {
  const c = await db();
  const [rubricUsed, devFactUsed, lineUsed, regularRaw, dateHooks, askPoll] = await Promise.all([
    c.hGetAll(rubricUsedKey(projectId)),
    c.hGetAll(devFactUsedKey(projectId)),
    c.hGetAll(lineUsedKey(projectId)),
    c.get(regularCountKey(projectId)),
    c.hGetAll(dateHookKey(projectId)),
    c.get(askPollKey(projectId)),
  ]);
  const regularCount = regularRaw == null || regularRaw === "" ? null : Number(regularRaw);
  return {
    rubricUsed,
    devFactUsed,
    lineUsed,
    regularCount: regularCount != null && Number.isFinite(regularCount) ? regularCount : null,
    dateHooks,
    lastAskWasPoll: askPoll == null ? null : askPoll === "1",
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
  if (patch.askPoll != null) ops.push(c.set(askPollKey(projectId), patch.askPoll ? "1" : "0"));
  await Promise.all(ops);
}
