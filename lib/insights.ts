import type { HistoryItem } from "./store.js";

// Статистика постов из Threads Insights API (нужно право threads_manage_insights у токена).
// Метрики поста не учитывают вложенные ответы.
const API = "https://graph.threads.net/v1.0";
export const METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"] as const;
export type Metrics = Record<(typeof METRICS)[number], number>;
export type PostStats = HistoryItem & { metrics?: Metrics; error?: string };

function value(m: any): number {
  return m?.total_value?.value ?? m?.values?.[0]?.value ?? 0;
}

export async function fetchPostMetrics(token: string, postId: string): Promise<Metrics> {
  const url = `${API}/${postId}/insights?metric=${METRICS.join(",")}&access_token=${encodeURIComponent(token)}`;
  const j: any = await (await fetch(url)).json().catch(() => ({}));
  if (!Array.isArray(j.data)) throw new Error(j.error?.message ?? "нет данных");
  const out = Object.fromEntries(METRICS.map((k) => [k, 0])) as Metrics;
  for (const m of j.data) if (m.name in out) out[m.name as keyof Metrics] = value(m);
  return out;
}

export async function fetchFollowers(token: string): Promise<number | null> {
  const url = `${API}/me/threads_insights?metric=followers_count&access_token=${encodeURIComponent(token)}`;
  const j: any = await (await fetch(url)).json().catch(() => ({}));
  return Array.isArray(j.data) ? value(j.data[0]) : null;
}

export type Clicks = { total: number; byContent: Record<string, number> };

/** Клики по ссылкам аккаунта за период; по utm_content видно аккаунт и рубрику поста. */
export async function fetchClicks(token: string, days: number, now = Date.now()): Promise<Clicks | null> {
  const since = Math.floor((now - days * 86400_000) / 1000), until = Math.floor(now / 1000);
  const url = `${API}/me/threads_insights?metric=clicks&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`;
  const j: any = await (await fetch(url)).json().catch(() => ({}));
  const m = Array.isArray(j.data) ? j.data.find((x: any) => x.name === "clicks") : null;
  if (!m) return null;
  const links: { value: number; link_url?: string }[] = m.link_total_values ?? [];
  const byContent: Record<string, number> = {};
  for (const l of links) {
    const content = l.link_url ? new URL(l.link_url).searchParams.get("utm_content") ?? "без метки" : "без метки";
    byContent[content] = (byContent[content] ?? 0) + (l.value ?? 0);
  }
  const total = links.length ? links.reduce((a, l) => a + (l.value ?? 0), 0) : value(m);
  return { total, byContent };
}

/** Вовлечённость: все реакции к просмотрам. */
export const engagement = (m: Metrics) =>
  m.views ? (m.likes + m.replies + m.reposts + m.quotes + m.shares) / m.views : 0;

export type Group = { key: string; posts: number; views: number; likes: number; replies: number; engagement: number };

/** Средние по группам (канал · проект · рубрика и т. п.), по убыванию средних просмотров. */
export function groupBy(posts: PostStats[], keyOf: (p: PostStats) => string): Group[] {
  const acc = new Map<string, PostStats[]>();
  for (const p of posts) if (p.metrics) acc.set(keyOf(p), [...(acc.get(keyOf(p)) ?? []), p]);
  return [...acc].map(([key, ps]) => {
    const avg = (f: (m: Metrics) => number) => ps.reduce((s, p) => s + f(p.metrics!), 0) / ps.length;
    return { key, posts: ps.length, views: avg((m) => m.views), likes: avg((m) => m.likes), replies: avg((m) => m.replies), engagement: avg(engagement) };
  }).sort((a, b) => b.views - a.views);
}

/** Короткая сводка для Telegram за последние `days` дней. */
export function digest(
  posts: PostStats[],
  followers: Record<string, number | null>,
  days: number,
  now = new Date(),
  clicks: Record<string, Clicks | null> = {},
): string {
  const since = now.getTime() - days * 86400_000;
  const recent = posts.filter((p) => p.metrics && Date.parse(p.at) >= since);
  if (!recent.length) return `📊 Threads за ${days} дн.: постов со статистикой нет.`;
  const fmt = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString();
  const line = (p: PostStats) =>
    `${p.metrics!.views} просм., ${p.metrics!.likes} ♥, ${p.metrics!.replies} отв. — ${p.channel ?? "pomazkof"} · ${p.rubric}${p.topic ? ` · ${p.topic}` : ""}: «${p.text.slice(0, 60)}…»`;
  const byViews = [...recent].sort((a, b) => b.metrics!.views - a.metrics!.views);
  const weakest = byViews.slice(3).slice(-2).reverse(); // только вне тройки лучших
  const groups = groupBy(recent, (p) => `${p.channel ?? "pomazkof"} · ${p.project} · ${p.rubric}`);
  return [
    `📊 Threads за ${days} дн.: ${recent.length} постов.`,
    `Подписчики: ${Object.entries(followers).map(([c, n]) => `${c} — ${n ?? "?"}`).join(", ")}`,
    ...(Object.keys(clicks).length
      ? [`Клики по ссылкам: ${Object.entries(clicks).map(([c, k]) => `${c} — ${k?.total ?? "?"}`).join(", ")}`,
         ...Object.values(clicks).flatMap((k) => Object.entries(k?.byContent ?? {}))
           .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([content, n]) => `  ${content}: ${n}`)]
      : []),
    "",
    "Лучшие:",
    ...byViews.slice(0, 3).map(line),
    ...(weakest.length ? ["", "Слабее всех:", ...weakest.map(line)] : []),
    "",
    "Рубрики (в среднем: просмотры / ♥ / ответы / вовлечённость):",
    ...groups.map((g) => `${g.key} (${g.posts}): ${fmt(g.views)} / ${fmt(g.likes)} / ${fmt(g.replies)} / ${(g.engagement * 100).toFixed(1)}%`),
    "",
    "Выводы по нескольким постам случайны: смотрите на тренд за 2–3 недели.",
  ].join("\n");
}
