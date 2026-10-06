import { getToken, saveToken } from "./store.js";
import type { Media } from "./projects.js";
import type { Channel } from "./channels.js";

const API = "https://graph.threads.net/v1.0";
const USER = process.env.THREADS_USER_ID || "me";
const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000; // долгоживущий токен живёт ~60 дней, продлеваем раз в неделю

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

  // Ждём, пока контейнер обработается. Текст — обычно мгновенно (не дождались — публикуем как раньше).
  // Видео и картинку Meta скачивает и обрабатывает (видео в среднем ~30 с): ждём до 3 минут и без FINISHED не публикуем.
  const deadline = Date.now() + (media ? 180_000 : 10_000);
  for (;;) {
    const s = await call("GET", `/${container.id}`, { fields: "status,error_message", access_token: token }).catch(() => null);
    if (s?.status === "FINISHED" || (!s && !media)) break;
    if (s?.status === "ERROR" || s?.status === "EXPIRED") throw new Error(`Контейнер: ${s.status} ${s.error_message ?? ""}`);
    if (Date.now() > deadline) {
      if (media) throw new Error(`Медиа не обработалось за 3 минуты (статус: ${s?.status ?? "неизвестен"})`);
      break;
    }
    await new Promise((r) => setTimeout(r, media ? 5000 : 2000));
  }

  const published = await call("POST", `/${USER}/threads_publish`, { creation_id: container.id, access_token: token });
  return published.id as string;
}
