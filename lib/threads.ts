import { getToken, saveToken } from "./store.js";
import type { Media } from "./projects.js";
import type { Channel } from "./channels.js";

const API = "https://graph.threads.net/v1.0";
const USER = process.env.THREADS_USER_ID || "me";
const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000; // долгоживущий токен живёт ~60 дней, продлеваем раз в неделю

// Ожидание укладки в maxDuration крона (vercel.json: 300 с — потолок Hobby).
// Текст: до 60 с + паузы повторов 5+10+20 с. Медиа: до 3 мин + те же паузы.
// Повтор не запускает ожидание заново, иначе вместе с генерацией не уложимся.
const TEXT_READY_MS = 60_000;
const MEDIA_READY_MS = 180_000;
const TEXT_POLL_MS = 2_500;
const MEDIA_POLL_MS = 5_000;
const PUBLISH_BACKOFF_MS = [5_000, 10_000, 20_000];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type ThreadsFailure = Error & { status?: number; noId?: boolean; alreadyPublished?: boolean };

/** Пост уже создан — повтор (в том числе запасной текст без картинки) давать нельзя. */
export function postAlreadyPublished(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as ThreadsFailure).alreadyPublished);
}

function threadsFailure(path: string, status: number, message: string, noId = false): ThreadsFailure {
  const err = new Error(`Threads ${path}: ${message}`) as ThreadsFailure;
  err.status = status;
  if (noId) err.noId = true;
  return err;
}

function isAuthError(e: unknown): boolean {
  const status = (e as ThreadsFailure)?.status;
  if (status === 401 || status === 403) return true;
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  return /access token|\boauth\b|unauthorized|not authorized|\bpermission\b|session has expired|\(#190\)|\(#102\)|\(#10\)/.test(msg);
}

/** «Контейнер ещё не доехал» и короткие 5xx. Авторизация, прочие 4xx и ответ без id — не повторяем. */
function isRetryablePublishError(e: unknown): boolean {
  const err = e as ThreadsFailure;
  if (err?.noId || err?.alreadyPublished) return false;
  if (isAuthError(e)) return false;
  const status = err?.status;
  if (typeof status === "number" && status >= 500 && status <= 599) return true;
  const msg = String(err?.message ?? e).toLowerCase();
  return msg.includes("does not exist") || msg.includes("not available");
}

async function call(method: "GET" | "POST", path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const res = await fetch(method === "GET" ? `${API}${path}?${body}` : `${API}${path}`, {
    method,
    body: method === "POST" ? body : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`Threads ${path}: ${json.error?.message || res.status}`);
  }
  return json;
}

async function containerStatus(containerId: string, token: string): Promise<{ status?: string; error_message?: string } | null> {
  // Сбой GET — контейнер ещё не виден, это не ERROR. Публикацию из-за этого не отменяем.
  return await call("GET", `/${containerId}`, { fields: "status,error_message", access_token: token }).catch(() => null);
}

async function recoverPublishedId(token: string, text: string): Promise<string | null> {
  return findRecentPostByTextWithToken(token, text, 10 * 60 * 1000, "5");
}

/** Ищет пост с тем же текстом. maxAgeMs = null — без ограничения по времени (последние 25). */
export async function findRecentPostByText(ch: Channel, text: string, maxAgeMs: number | null): Promise<string | null> {
  const token = await ensureFreshToken(ch);
  return findRecentPostByTextWithToken(token, text, maxAgeMs, "25");
}

async function findRecentPostByTextWithToken(
  token: string,
  text: string,
  maxAgeMs: number | null,
  limit: string,
): Promise<string | null> {
  try {
    const j = await call("GET", `/${USER}/threads`, { fields: "id,text,timestamp", limit, access_token: token });
    const rows: { id?: string; text?: string; timestamp?: string }[] = Array.isArray(j?.data) ? j.data : [];
    const want = text.trim();
    const now = Date.now();
    const hit = rows.find((p) => {
      if (!p.id || p.text?.trim() !== want) return false;
      if (maxAgeMs == null) return true;
      const at = Date.parse(p.timestamp ?? "");
      return Number.isNaN(at) || now - at < maxAgeMs;
    });
    return hit?.id ? String(hit.id) : null;
  } catch (e) {
    if (maxAgeMs == null) throw e;
    return null;
  }
}

function alreadyPublishedError(): ThreadsFailure {
  const err = new Error("Контейнер уже опубликован, повторная публикация отменена") as ThreadsFailure;
  err.alreadyPublished = true;
  return err;
}

/** ERROR/EXPIRED — контейнер мёртв. PUBLISHED — id поста, если он уже виден в ленте, иначе ошибка без повтора. */
async function afterStatus(
  s: { status?: string; error_message?: string } | null,
  token: string,
  text: string,
): Promise<string | null> {
  if (s?.status === "ERROR" || s?.status === "EXPIRED") throw new Error(`Контейнер: ${s.status} ${s.error_message ?? ""}`);
  if (s?.status !== "PUBLISHED") return null;
  const id = await recoverPublishedId(token, text);
  if (id) return id;
  throw alreadyPublishedError();
}

async function waitForContainer(containerId: string, token: string, text: string, media: boolean): Promise<string | null> {
  const deadline = Date.now() + (media ? MEDIA_READY_MS : TEXT_READY_MS);
  const poll = media ? MEDIA_POLL_MS : TEXT_POLL_MS;
  for (;;) {
    const s = await containerStatus(containerId, token);
    const recovered = await afterStatus(s, token, text);
    if (recovered) return recovered;
    if (s?.status === "FINISHED") return null;
    if (Date.now() >= deadline) {
      if (media) throw new Error(`Медиа не обработалось за 3 минуты (статус: ${s?.status ?? "неизвестен"})`);
      console.warn(`Текст: контейнер не FINISHED за 60 с (статус: ${s?.status ?? "неизвестен"}), публикую`);
      return null;
    }
    await sleep(Math.min(poll, Math.max(0, deadline - Date.now())));
  }
}

async function publishContainer(containerId: string, token: string): Promise<string> {
  const path = `/${USER}/threads_publish`;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: containerId, access_token: token }),
  });
  const json: any = await res.json().catch(() => ({}));
  // id значит, что пост уже создан: повторять нельзя, даже если рядом есть error.
  if (json?.id) return String(json.id);
  if (!res.ok || json?.error) throw threadsFailure(path, res.status, json?.error?.message || String(res.status));
  throw threadsFailure(path, res.status, "ответ без id", true);
}

async function publishReady(containerId: string, token: string, text: string, media: boolean): Promise<string> {
  const early = await waitForContainer(containerId, token, text, media);
  if (early) return early;
  const attempts = PUBLISH_BACKOFF_MS.length + 1;
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(PUBLISH_BACKOFF_MS[attempt - 1]);
      const recovered = await afterStatus(await containerStatus(containerId, token), token, text);
      if (recovered) return recovered;
    }
    try {
      const id = await publishContainer(containerId, token);
      if (id) return id;
    } catch (e) {
      last = e;
      if (!isRetryablePublishError(e) || attempt === attempts - 1) throw e;
      console.warn(`threads_publish попытка ${attempt + 1} не удалась, повтор:`, e instanceof Error ? e.message : e);
    }
  }
  throw last instanceof Error ? last : new Error("Threads threads_publish: попытки исчерпаны");
}

/** Продлевает долгоживущий токен, если он старше недели. Ошибку не пробрасываем — постинг важнее. */
export async function ensureFreshToken(ch: Channel): Promise<string> {
  const t = await getToken(ch);
  if (Date.now() - t.refreshedAt < REFRESH_AFTER_MS) return t.value;
  try {
    const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(t.value)}`;
    const json: any = await (await fetch(url)).json();
    if (json.access_token) {
      await saveToken(ch, json.access_token, t.envHash);
      return json.access_token;
    }
    console.warn("Не удалось продлить токен:", json.error?.message);
  } catch (e) {
    console.warn("Не удалось продлить токен:", e);
  }
  return t.value;
}

export async function publishPost(ch: Channel, text: string, topicTag?: string, media?: Media): Promise<string> {
  const token = await ensureFreshToken(ch);
  const base: Record<string, string> = media
    ? { media_type: media.type, [media.type === "VIDEO" ? "video_url" : "image_url"]: media.url, text, access_token: token }
    : { media_type: "TEXT", text, access_token: token };

  let container: any;
  try {
    container = await call("POST", `/${USER}/threads`, topicTag ? { ...base, topic_tag: topicTag } : base);
  } catch (e) {
    if (!topicTag) throw e;
    console.warn("Повтор без topic_tag:", e); // если тема не прошла валидацию — постим без неё
    container = await call("POST", `/${USER}/threads`, base);
  }

  // Текст ждём до ~60 с (опрос каждые 2–3 с): сбой GET и IN_PROGRESS — ещё не готово.
  // Срок вышел — публикуем всё равно. Медиа — до 3 минут, без FINISHED не публикуем.
  // threads_publish при «ещё не доехало» и 5xx повторяем до 4 раз; если id уже есть — стоп.
  return publishReady(container.id, token, text, Boolean(media));
}
