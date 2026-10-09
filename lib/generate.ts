import Anthropic from "@anthropic-ai/sdk";
import { BURO_DETECTIVE_LOOKBACK, BURO_DETECTIVE_REFS, factsFor, promoActive, type DetectiveRef, type Project, type Rubric } from "./projects.js";
import type { HistoryItem } from "./store.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY из env
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_LEN = 450; // лимит Threads — 500 символов, держим запас (эмодзи считаются по байтам)
// У Sonnet 5.5 thinking включён по умолчанию и расходует тот же max_tokens:
// с маленьким лимитом ответ обрезается или приходит пустым.
const MAX_TOKENS = 16000;

// Ответ строго по JSON-схеме (structured outputs). Обрыв или отказ модели — ошибка, а не «пустой» пост.
async function askJson<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
  const r = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } },
  });
  if (r.stop_reason !== "end_turn") throw new Error(`Claude остановился: ${r.stop_reason}`);
  return JSON.parse(r.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
}

// ---------- Генерация ----------

export async function draftPost(
  p: Project,
  rubric: Rubric,
  history: HistoryItem[],
  now: Date,
  feedback?: string,
  topic?: string,
  voiceNote?: string, // поправка голоса для аккаунта (см. lib/channels.ts)
  linkContent?: string, // utm_content: аккаунт-рубрика
  pictureNote?: string, // что на приложенной картинке
  detectiveHint?: string, // заданная мемная отсылка «Бюро» (стиль, не факт)
) {
  const link = (rubric.link ?? p.link)(now, linkContent);
  const recent = history.filter((h) => h.project === p.id).slice(0, 12).map((h) => `— ${h.text}`).join("\n");
  const season = p.seasonalHint?.(now);

  const system = `Ты пишешь посты для Threads от лица автора проекта «${p.name}». Пишешь по-русски.

ГОЛОС:
${p.voice}
${voiceNote ? `\nАККАУНТ:\n${voiceNote}\n` : ""}
ФАКТЫ (единственный допустимый источник утверждений о проекте):
${factsFor(p, now).map((f) => `• ${f}`).join("\n")}

ЗАПРЕЩЕНО:
${p.forbidden.map((f) => `• ${f}`).join("\n")}
• Любые утверждения о проекте, которых нет в фактах. Если не уверен — не пиши.
${p.id === "buro" ? "\nМемная отсылка к детективному фильму, сериалу или персонажу — шутка в голосе, не утверждение о проекте. Цитату не выдавай за факт о «Бюро», не приписывай чужому герою и не намекай, что сервис сделан по этому фильму.\n" : ""}

ФОРМАТ: до ${MAX_LEN} символов вместе со ссылкой${p.id === "oloid" ? " (пустые строки между абзацами тоже считаются — пиши короткими абзацами по одной-две связанные фразы, не разбивай каждую фразу отдельной строкой)" : ""}. Живой текст, не пресс-релиз. Ответь ТОЛЬКО JSON без markdown:
{"text": "текст поста"}`;

  const user = `Рубрика: ${rubric.brief}
${topic ? `Тема поста: ${topic}` : ""}
${pictureNote ? `К посту будет приложена картинка из игры: ${pictureNote}. Можно опереться на одну её деталь; не описывай картинку целиком, не пиши «на картинке» и не добавляй того, чего на ней нет.` : ""}
${p.requireLink ? `Обязательно поставь в конце ссылку: ${link}` : rubric.id === "question" ? "Ссылку не ставь." : `Если уместно, поставь в конце ссылку: ${link}`}
${season ? `Сезонный повод (по желанию): ${season}` : ""}
${detectiveHint ? `Обязательная отсылка в этом посте (мем, не факт о проекте и не связь с фильмом): ${detectiveHint}` : ""}

Недавние посты — НЕ повторяй их заходы, формулировки, структуру${p.id === "buro" ? " и мемную детективную отсылку" : ""}:
${recent || "(пока нет)"}
${feedback ? `\nПредыдущий вариант отклонён: ${feedback}. Исправь.` : ""}`;

  const { text } = await askJson<{ text: string }>(system, user, {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  });
  const trimmed = text.trim();
  // Формат — до ruleCheck: пустые строки входят в лимит 450.
  // Сначала вёрстка (края строк), потом строчные: заглавная должна стоять в начале строки, а не после пробелов.
  return p.id === "oloid" ? lowercaseSentenceStarts(normalizeOloidParagraphs(trimmed)) : trimmed;
}

// Строчный стиль «Олоида»: первая буква поста, строки и фразы — строчная.
// Имена собственные из короткого списка не трогаем. Середину фразы не переписываем.
const OLOID_PROPER =
  /^(?:олоид\p{L}*|егор\p{L}*|яковлев\p{L}*|disco|elysium|steam|android|ios|серафим\p{L}*|павловн\p{L}*|конюшенн\p{L}*|исаакиевск\p{L}*|зайчик\p{L}*|петербург(?:а|у|е|ом)?|санкт-петербург(?:а|у|е|ом)?|питер(?:а|у|е|ом)?|лиза|лизы|лизе|лизу|лизой|витя|вити|вите|витю|витей|тонет(?:а|у|е|ом)|vk)$/iu;

export function lowercaseSentenceStarts(text: string): string {
  const urls: string[] = [];
  const masked = text.replace(/https?:\/\/\S+/g, (u) => {
    urls.push(u);
    return `\uE000${urls.length - 1}\uE000`;
  });
  const fixed = masked.replace(
    /(^|[\n\r]|[.!?…]+[^\S\n]*)([«"„“']*)(\p{Lu})(\p{Lu}*)/gu,
    (full, lead: string, quotes: string, first: string, restCaps: string, offset: number, whole: string) => {
      const rest = whole.slice(offset + lead.length + quotes.length);
      if (/^Что было, то и будет/iu.test(rest)) return full;
      const word = rest.match(/^\p{L}+(?:-\p{L}+)?/u)?.[0] ?? first;
      const head = first + restCaps;
      if (OLOID_PROPER.test(word)) {
        // «ПЕТЕРБУРГ» → «Петербург»; латиницу вроде VK не трогаем
        if (head === word && /^[А-ЯЁ]{2,}$/.test(word)) return lead + quotes + word[0] + word.slice(1).toLowerCase();
        return full;
      }
      // целиком, иначе первая буква даёт «чМ»
      if (head === word && /^\p{Lu}{2,}$/u.test(word)) return lead + quotes + word.toLowerCase();
      return lead + quotes + first.toLowerCase() + restCaps;
    },
  );
  return fixed.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => urls[Number(i)]);
}

// «Олоид»: абзацы не режем. Подравниваем только вёрстку:
// обрезаем края строк, одиночный перенос между абзацами делаем пустой строкой,
// три и больше переносов схлопываем в одну пустую, ссылку ставим после ровно одной пустой строки.
export function normalizeOloidParagraphs(text: string): string {
  let s = text.replace(/\r\n?/g, "\n").trim();
  const urls: string[] = [];
  s = s.replace(/https?:\/\/\S+/g, (u) => {
    urls.push(u);
    return "";
  });
  const paragraphs = s
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean);
  let out = paragraphs.join("\n\n");
  for (const u of urls) out = out ? `${out}\n\n${u}` : u;
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- Механические правила ----------

const EMOJI = /\p{Extended_Pictographic}/gu;
// Названия детективных фильмов и персонажей сюда не входят: для «Бюро» это стиль (BURO_DETECTIVE_REFS).
const BANNED = [
  /уникальн\w* предложени/i, /успей/i, /только сегодня/i, /#\S/, /[А-ЯЁ]{6,}/, /прикрепл/i, /тарковск/i, /звягинцев/i,
  // «Бруклин 9-9»: гэги про sex tape в пост не пускаем
  /sex\s*tape/i, /секс[-\s]?тейп/iu, /(?<![\p{L}])порн/iu,
];

export function ruleCheck(text: string, p: Project, now: Date, rubric?: Rubric, linkContent?: string): string | null {
  if (!text) return "пустой текст";
  if (text.length > MAX_LEN) return `длина ${text.length} > ${MAX_LEN}`;
  if ((text.match(EMOJI) || []).length > 1) return "больше одного эмодзи";
  for (const re of BANNED) if (re.test(text)) return `запрещённый паттерн ${re}`;
  if (p.promo && text.toUpperCase().includes(p.promo.code)) {
    if (!promoActive(p, now)) return `промокод ${p.promo.code} больше не действует — убери его`;
    if (!rubric || !p.promo.rubrics.includes(rubric.id)) return `промокод ${p.promo.code} — только в постах-предложениях, здесь убери`;
  }
  for (const re of p.stopList ?? []) if (re.test(text)) return `штамп ${re} — перепиши фразу целиком, не синонимом`;
  const urls = text.match(/https?:\/\/\S+/g) || [];
  const allowed = (rubric?.link ?? p.link)(now, linkContent);
  if (urls.some((u) => u.replace(/[.,)]+$/, "") !== allowed)) return "посторонняя или искажённая ссылка";
  if (p.requireLink && urls.length === 0) return "нет обязательной ссылки на сайт";
  return null;
}

// ---------- Антиповтор ----------

function trigrams(s: string) {
  const t = s.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^\p{L}\p{N} ]/gu, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

/** «Бюро»: в посте есть заданная мемная отсылка, и она не повторяет недавние посты. */
export function detectiveRefProblem(text: string, history: HistoryItem[], chosen: DetectiveRef): string | null {
  const recent = history.filter((h) => h.project === "buro").slice(0, BURO_DETECTIVE_LOOKBACK);
  const repeated = BURO_DETECTIVE_REFS.find((r) => r.mark.test(text) && recent.some((h) => r.mark.test(h.text)));
  if (repeated) return `отсылка уже была в недавнем посте (${repeated.hint}). Возьми другую: ${chosen.hint}`;
  if (!chosen.mark.test(text)) return `нет заданной мемной отсылки. Вставь именно эту, узнаваемой шуткой, без связи сервиса с фильмом: ${chosen.hint}`;
  return null;
}

export function tooSimilar(text: string, history: HistoryItem[]): string | null {
  const a = trigrams(text);
  const opening = text.slice(0, 30).toLowerCase();
  for (const h of history.slice(0, 40)) {
    if (h.text.slice(0, 30).toLowerCase() === opening) return "такое же начало, как у недавнего поста";
    const b = trigrams(h.text);
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const jaccard = inter / (a.size + b.size - inter || 1);
    if (jaccard > 0.45) return `слишком похоже на пост от ${h.at.slice(0, 10)}`;
  }
  return null;
}

// ---------- Фактчек вторым проходом ----------

export async function factCheck(text: string, p: Project, pictureNote?: string, now = new Date()): Promise<string | null> {
  const r = await askJson<{ ok: boolean; reason: string }>(
    `Ты строгий редактор-фактчекер. Проверь пост о проекте «${p.name}».
${p.id === "oloid" ? "Строчные буквы (кроме имён собственных), один восклицательный знак в первой строке и короткие абзацы (одна-две связанные фразы на строке, не больше трёх; между абзацами пустая строка; ссылка отдельной строкой после пустой) — заданный стиль, не отклоняй из-за этого.\n" : ""}${p.id === "buro" ? `Отсылки к детективам — стиль и шутка, не факты о проекте. Допустимы только эти якоря, каждый своим героем:\n${BURO_DETECTIVE_REFS.map((ref) => `• ${ref.hint}`).join("\n")}\nНе отклоняй такую шутку, если она узнаваемая и не приписана чужому персонажу. Отклоняй, если пост утверждает, что сервис основан на фильме, снят по нему или связан с правообладателем, если цитата приписана не тому герою, если раскрыта развязка или описана жестокость, или если шутка непристойная.\n` : ""}Допустимые факты:
${factsFor(p, now).map((f) => `• ${f}`).join("\n")}
Запрещено:
${p.forbidden.map((f) => `• ${f}`).join("\n")}
${pictureNote ? `\nК посту приложена картинка из игры: ${pictureNote}. Детали, которые на ней видны, допустимы.\n` : ""}
Отклоняй, если в посте есть утверждение о проекте, которого нет в фактах (цифры, даты, цены, отзывы, истории клиентов, прогресс разработки), спойлер, или пост звучит как спам. Художественные образы и ирония без фактических утверждений допустимы.
Ответь JSON: {"ok": true, "reason": ""} или {"ok": false, "reason": "кратко что не так"}`,
    text,
    {
      type: "object",
      properties: { ok: { type: "boolean" }, reason: { type: "string" } },
      required: ["ok", "reason"],
      additionalProperties: false,
    },
  );
  return r.ok ? null : r.reason || "не прошёл фактчек";
}
