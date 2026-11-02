// Локальная проверка разнообразия: слоты (App Store раз в 3 дня, VK Play ≤2 в неделю), очередь фактов по id,
// начало постов VK Play, LRU тем. Без сети и без модели: npx tsx lib/sanity-variety.ts
import assert from "node:assert/strict";
import { OLOID_ROTATION_ORDER } from "./oloidRotation.js";
import { OLOID_ROTATING_FACTS, oloidPromptFacts } from "./oloidFacts.js";
import { pickVkPlayAngle, vkPlayOpeningProblem, vkPlayProblem, VK_PLAY_ANGLES } from "./generate.js";
import { factsFor, PROJECTS, type Rubric } from "./projects.js";
import { mskDay, pickRubric, pickTopic } from "./run.js";
import type { HistoryItem } from "./store.js";

const oloid = PROJECTS.find((p) => p.id === "oloid")!;
const DAY = 24 * 60 * 60 * 1000;

// ---------- 1. Слоты: 21 день, четыре крона в сутки (UTC 04:00, 12:00, 14:30, 17:00 = МСК 07:00, 15:00, 17:30, 20:00) ----------
{
  const history: HistoryItem[] = [];
  let dailyDone: string | null = null;
  let secondDone: string | null = null;
  let provDone: string | null = null;
  const lastUsed: Record<string, string> = {};
  const start = Date.parse("2026-11-03T00:00:00Z");
  const rows: string[] = [];
  for (let d = 0; d < 21; d++) {
    const picks: string[] = [];
    for (const [h, m] of [[4, 0], [12, 0], [14, 30], [17, 0]]) {
      const now = new Date(start + d * DAY + (h * 60 + m) * 60 * 1000);
      const r = pickRubric(oloid, history, now, undefined, history, dailyDone, true, secondDone, { lastUsed }, provDone);
      picks.push(r.id);
      history.unshift({ project: "oloid", rubric: r.id, text: `${r.id} ${d}`, at: now.toISOString(), channel: "oloid" });
      lastUsed[r.id] = now.toISOString();
      if (r.id === "appstore" || r.id === "appstore-promo") dailyDone = mskDay(now);
      if (r.id === "vkplay") secondDone = mskDay(now);
      if (r.id === "provocation") provDone = mskDay(now);
    }
    rows.push(`${mskDay(new Date(start + d * DAY + 12 * 3600e3))}  ${picks.map((p) => p.padEnd(14)).join(" ")}`);
  }
  console.log("--- расписание 21 день (07:00 / 15:00 / 17:30 / 20:00 МСК) ---\n" + rows.join("\n"));

  const days = (ids: string[]) =>
    [...history].reverse().filter((h) => ids.includes(h.rubric)).map((h) => Math.round((Date.parse(mskDay(new Date(h.at))) - start) / DAY));
  const store = days(["appstore", "appstore-promo"]);
  const vk = days(["vkplay"]);
  const trailer = days(["trailer"]);
  const prov = days(["provocation"]);
  // App Store: ровно каждые 3 дня, по одному.
  assert.deepEqual(store, [0, 3, 6, 9, 12, 15, 18], `appstore ${store}`);
  // VK Play: между постами ≥3 суток, не в день App Store, не больше 2 за любые 7 суток.
  for (let i = 1; i < vk.length; i++) assert.ok(vk[i] - vk[i - 1] >= 3, `vk gap ${vk}`);
  for (const v of vk) assert.ok(!store.includes(v), `vk в день App Store ${v}`);
  for (let s = 0; s < 21; s++) assert.ok(vk.filter((v) => v >= s && v < s + 7).length <= 2, `vk >2 за неделю с дня ${s}: ${vk}`);
  assert.ok(vk.length >= 5, `vk слишком редко: ${vk}`);
  // Провокация — каждый день в 17:30, как раньше.
  assert.deepEqual(prov, Array.from({ length: 21 }, (_, i) => i));
  // Трейлер — не чаще раза в 3 суток.
  for (let i = 1; i < trailer.length; i++) assert.ok(trailer[i] - trailer[i - 1] >= 3, `trailer gap ${trailer}`);
  assert.ok(trailer.length >= 6, `trailer ${trailer}`);
  // Пропущенные утро и 15:00 — обычная ротация.
  const regular = new Set<string>(OLOID_ROTATION_ORDER);
  for (const h of history) {
    const hour = (new Date(h.at).getUTCHours() + 3) % 24;
    if (hour === 7 && !["appstore", "appstore-promo"].includes(h.rubric)) assert.ok(regular.has(h.rubric), `утро: ${h.rubric}`);
    if (hour === 15 && h.rubric !== "vkplay") assert.ok(regular.has(h.rubric), `15:00: ${h.rubric}`);
  }
  // Сбой утром в день App Store: слот держится до вечера, VK Play в этот день не выходит.
  const failNow = new Date(start + 21 * DAY + 12 * 3600e3);
  const r = pickRubric(oloid, history, failNow, undefined, history, dailyDone, true, secondDone, { lastUsed }, provDone);
  assert.ok(["appstore", "appstore-promo"].includes(r.id), `после сбоя утром: ${r.id}`);
  console.log(`ok слоты: App Store ${store.join(",")}; VK Play ${vk.join(",")}; трейлер ${trailer.join(",")}`);
}

// ---------- 2. Факты: очередь по id, ничьи случайно, старая история по следам ----------
{
  const now = new Date("2026-11-10T14:00:00Z");
  const passport = factsFor(oloid, now, "backstage");
  assert.equal(passport.some((f) => /достижени/iu.test(f)), false, "достижения убраны из фактов");
  assert.equal(OLOID_ROTATING_FACTS.some((s) => /^extra-(5[89]|6\d|7[0-2])$/.test(s.id)), false);

  const fresh = oloidPromptFacts(passport, [], now, { rubricId: "backstage" });
  assert.equal(fresh.ids.length, 4);
  // Ничьи — случайно: разные запуски дают разные пачки.
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) seen.add(oloidPromptFacts(passport, [], now, { rubricId: "backstage" }).ids.join(","));
  assert.ok(seen.size > 10, `пачки почти не меняются: ${seen.size}`);

  // Выданные id на паузе 3 дня, даже если текст их не упомянул.
  const used: HistoryItem = { project: "oloid", rubric: "detail", text: "просто текст", at: new Date(now.getTime() - DAY).toISOString(), factIds: fresh.ids };
  const next = oloidPromptFacts(passport, [used], now, { rubricId: "backstage" });
  assert.equal(next.ids.some((id) => fresh.ids.includes(id)), false);

  // LRU: все факты выдавались 4–5 дней назад, один — 10 дней назад → он первый.
  const all = OLOID_ROTATING_FACTS.map((s) => s.id);
  const target = all[all.length - 1];
  const lru: HistoryItem[] = [
    { project: "oloid", rubric: "detail", text: "a", at: new Date(now.getTime() - 4 * DAY).toISOString(), factIds: all.filter((id) => id !== target).slice(0, 30) },
    { project: "oloid", rubric: "detail", text: "b", at: new Date(now.getTime() - 5 * DAY).toISOString(), factIds: all.filter((id) => id !== target).slice(30) },
    { project: "oloid", rubric: "detail", text: "c", at: new Date(now.getTime() - 10 * DAY).toISOString(), factIds: [target] },
  ];
  const lruPack = oloidPromptFacts(passport, lru, now, { rubricId: "backstage" });
  assert.equal(lruPack.ids[0], target, `LRU: ${lruPack.ids}`);
  // Остальные три — из самой старой пачки (5 дней назад).
  for (const id of lruPack.ids.slice(1)) assert.ok(all.filter((x) => x !== target).slice(30).includes(id), `LRU tail ${id}`);

  // Старая история без factIds: факт со следом считается выходившим по тексту.
  const legacy: HistoryItem = { project: "oloid", rubric: "detail", text: "мини-игра: стол рывками", at: new Date(now.getTime() - DAY).toISOString() };
  const legacyPack = oloidPromptFacts(passport, [legacy], now, { rubricId: "backstage", random: () => 0 });
  assert.equal(legacyPack.color.some((f) => f.includes("стол рывками")), false);

  // Тема с опорой на факты: нужные факты в пачке вне очереди.
  const tree = oloidPromptFacts(passport, [], now, { rubricId: "detail", topic: "Семейное древо на нарисованной стене" });
  assert.ok(tree.ids.includes("extra-41") && tree.ids.includes("extra-42"), `pins ${tree.ids}`);
  // Каждая новая тема находит свои факты в паспорте.
  for (const r of oloid.rubrics) {
    for (const topic of r.topics ?? []) {
      const pinned = OLOID_ROTATING_FACTS.filter((s) => s.topicMark?.test(topic));
      for (const s of pinned) assert.ok(factsFor(oloid, now, r.id).some((f) => f.includes(s.needle)), `${topic}: ${s.id}`);
    }
  }
  console.log(`ok факты: ${seen.size}/30 разных пачек без истории, LRU, пауза по id, обратная совместимость, темы с опорой`);
}

// ---------- 3. VK Play: без новостной рамки, начало не повторяет последние 10 ----------
{
  const now = new Date("2026-11-10T12:00:00Z");
  const vk = (text: string, daysAgo: number, angle?: string): HistoryItem => ({
    project: "oloid", rubric: "vkplay", text, vkAngle: angle, at: new Date(now.getTime() - daysAgo * DAY).toISOString(),
  });
  const hist = [vk("вечер, старый двор и окна напротив.\n\nна VK Play", 3, "spb"), vk("кому зайдёт медленная история?\n\nVK Play", 6, "who")];
  assert.ok(vkPlayOpeningProblem("«Олоид» вышел на VK Play!\n\nтекст", []));
  assert.ok(vkPlayOpeningProblem("теперь и на VK Play — мистическая новелла", []));
  assert.ok(vkPlayOpeningProblem("вечер, старый двор и лестница.\n\nVK Play", hist), "те же первые три слова");
  assert.equal(vkPlayOpeningProblem("на кухне коммуналки две плиты и одна клеёнка.\n\nVK Play", hist), null);
  assert.equal(vkPlayProblem("на кухне две плиты. VK Play https://x", "oloid", "vkplay"), null, "жанр не обязателен");
  assert.ok(vkPlayProblem("на кухне две плиты.", "oloid", "vkplay"), "VK Play назвать обязательно");
  const angle = pickVkPlayAngle(hist, now);
  assert.ok(!["spb", "who"].includes(angle.id), `угол повторился: ${angle.id}`);
  const tried: string[] = [];
  for (let i = 0; i < 3; i++) tried.push(pickVkPlayAngle(hist, now, tried).id);
  assert.equal(new Set(tried).size, 3, "на каждой попытке свой угол");
  assert.equal(VK_PLAY_ANGLES.length >= 6, true);
  const brief = oloid.rubrics.find((r) => r.id === "vkplay")!;
  assert.equal(/Пост-новость|Прямо назови игру мистической/u.test(brief.brief), false);
  assert.equal(brief.topics, undefined);
  console.log(`ok VK Play: новостная рамка и повтор начала отклоняются, углы ${tried.join(" → ")}`);
}

// ---------- 4. Темы: LRU, ничьи случайно ----------
{
  const rubric: Rubric = { id: "t", weight: 1, brief: "", topics: ["A", "B", "C"] };
  const h = (topic: string, i: number): HistoryItem => ({ project: "oloid", rubric: "t", topic, text: topic, at: new Date(Date.now() - i * DAY).toISOString() });
  assert.equal(pickTopic(rubric, [h("B", 0), h("A", 1)]), "C");
  assert.equal(pickTopic(rubric, [h("C", 0), h("B", 1), h("A", 2)]), "A", "все были — самая давняя");
  assert.equal(pickTopic(rubric, [h("C", 0), h("B", 1), h("A", 2)], (t) => t === "A"), "B", "закрытая тема пропускается");
  const picks = new Set(Array.from({ length: 40 }, () => pickTopic(rubric, [])));
  assert.equal(picks.size, 3, "без истории — случайно среди всех");
  console.log("ok темы: LRU и случайные ничьи");
}

console.log("sanity-variety ok");
