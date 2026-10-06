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
  media?: string; // ссылка на прикреплённое видео
  postId?: string;
  at: string;
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
