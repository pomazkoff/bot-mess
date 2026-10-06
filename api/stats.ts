import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getHistory, getToken } from "../lib/store.js";
import { CHANNELS } from "../lib/channels.js";
import { fetchPostMetrics, fetchFollowers, fetchClicks, groupBy, digest, type PostStats, type Clicks } from "../lib/insights.js";
import { notify } from "../lib/notify.js";

// Статистика постов бота. Только чтение из Threads, модуль публикации не подключается.
// Вручную: /api/stats?key=<PREVIEW_KEY>[&days=7][&notify=1 — сводка в Telegram]
// Еженедельная сводка: Vercel Cron с заголовком Authorization: Bearer <CRON_SECRET> и notify=1.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const byKey = !!process.env.PREVIEW_KEY && req.query.key === process.env.PREVIEW_KEY;
  const byCron = !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!byKey && !byCron) return res.status(401).json({ error: "unauthorized" });

  const days = Math.max(1, Math.min(60, Number(req.query.days) || 7));
  try {
    const history = await getHistory(200);
    const posts: PostStats[] = [];
    const followers: Record<string, number | null> = {};
    const clicks: Record<string, Clicks | null> = {};
    for (const ch of CHANNELS) {
      if (!process.env[ch.tokenEnv]?.trim()) continue; // аккаунт ещё не подключён
      const { value: token } = await getToken(ch);
      followers[ch.name] = await fetchFollowers(token).catch(() => null);
      clicks[ch.name] = await fetchClicks(token, days).catch(() => null);
      const own = history.filter((h) => (h.channel ?? "pomazkof") === ch.id && h.postId);
      for (const h of own) {
        posts.push(await fetchPostMetrics(token, h.postId!).then(
          (metrics) => ({ ...h, metrics }),
          (e) => ({ ...h, error: String(e?.message ?? e) }),
        ));
      }
    }
    const summary = digest(posts, followers, days, new Date(), clicks);
    const telegram = req.query.notify === "1" ? await notify(summary) : undefined;
    return res.json({
      days,
      followers,
      clicks,
      telegram,
      byRubric: groupBy(posts, (p) => `${p.channel ?? "pomazkof"} · ${p.project} · ${p.rubric}`),
      byTopic: groupBy(posts.filter((p) => p.topic), (p) => `${p.rubric} · ${p.topic}`),
      byMedia: groupBy(posts.filter((p) => p.project === "oloid"), (p) => (!p.media ? "без медиа" : p.media.endsWith(".mp4") ? "с видео" : "с картинкой")),
      posts: posts.map(({ text, ...p }) => ({ ...p, text: text.slice(0, 80) })),
      summary,
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
