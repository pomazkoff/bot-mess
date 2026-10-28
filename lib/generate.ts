import Anthropic from "@anthropic-ai/sdk";
import { OLOID_DEV_NUMBERS_RUBRIC, devNumberProblem, numberTokens } from "./devFacts.js";
import { isOloidRotationRubric, provocationProblem, quietProblem, rotationSafetyProblem } from "./oloidRotation.js";
import { BURO_DETECTIVE_LOOKBACK, BURO_DETECTIVE_REFS, factsFor, forbiddenFor, mentionsPrice, mskCalendarDay, OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_RUBRIC, OLOID_APP_STORE_RUBRIC, OLOID_PROVOCATION_RUBRIC, OLOID_VKPLAY_FROM, OLOID_VKPLAY_RUBRIC, oloidRedeemUrl, promoActive, redactAppStoreCodes, type DetectiveRef, type Project, type Rubric } from "./projects.js";
import type { HistoryItem } from "./store.js";

const client = new Anthropic(); // ANTHROPIC_API_KEY из env
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
// Лимит Threads — 500 символов поля text. Адрес считается целиком: Threads его не сокращает.
// Эмодзи считаются по байтам UTF-8, поэтому держим запас и режем обычную длину на 450.
const MAX_LEN = 450;
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

export type DraftHints = {
  quiet?: boolean; // без ссылки и без призыва
  toneNote?: string;
  dateSteer?: string;
  devFact?: string; // единственный числовой факт рубрики dev-numbers
  wantPoll?: boolean;
  characterLine?: string;
  shownNote?: string; // карусель или ролик: описать видимое
  provocation?: boolean;
  formatNote?: string; // формат провокации: спор, сторона, непопулярное мнение, «а вы бы»
};

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
  promoCode?: string, // один код только этого поста; в систему и в другие рубрики не попадает
  hints?: DraftHints,
): Promise<{ text: string; options?: string[] }> {
  // Код и redeem-ссылка — только у appstore-promo. В остальные рубрики код не попадает, даже если его передали.
  const code = rubric.id === OLOID_APP_STORE_PROMO_RUBRIC ? promoCode : undefined;
  const link = code ? oloidRedeemUrl(code) : (rubric.link ?? p.link)(now, linkContent);
  const recent = history
    .filter((h) => h.project === p.id)
    .slice(0, 12)
    .map((h) => `— ${redactAppStoreCodes(h.text)}${h.pollOptions?.length ? ` [опрос: ${h.pollOptions.join(" | ")}]` : ""}`)
    .join("\n");
  const season = p.seasonalHint?.(now);
  const quiet = hints?.quiet === true;
  const wantPoll = hints?.wantPoll === true;
  const provocation = hints?.provocation === true;
  const jsonShape = wantPoll ? '{"text": "текст поста", "options": ["вариант", "вариант"]}' : '{"text": "текст поста"}';

  const system = `Ты пишешь посты для Threads от лица автора проекта «${p.name}». Пишешь по-русски.

ГОЛОС:
${p.voice}
${voiceNote ? `\nАККАУНТ:\n${voiceNote}\n` : ""}
ФАКТЫ (единственный допустимый источник утверждений о проекте):
${factsFor(p, now, rubric.id).map((f) => `• ${f}`).join("\n")}

ЗАПРЕЩЕНО:
${forbiddenFor(p, rubric.id, now).map((f) => `• ${f}`).join("\n")}
• Любые утверждения о проекте, которых нет в фактах. Если не уверен — не пиши.
${p.id === "buro" ? "\nМемная отсылка к детективному фильму, сериалу или персонажу — шутка в голосе, не утверждение о проекте. Цитату не выдавай за факт о «Бюро», не приписывай чужому герою и не намекай, что сервис сделан по этому фильму.\n" : ""}

ФОРМАТ: до ${MAX_LEN} символов вместе со ссылкой${p.id === "oloid" ? " (пустые строки между абзацами тоже считаются — пиши короткими абзацами по одной-две связанные фразы, не разбивай каждую фразу отдельной строкой)" : ""}. Живой текст, не пресс-релиз. Ответь ТОЛЬКО JSON без markdown:
${jsonShape}`;

  const linkLine = provocation && quiet
    ? "Ссылку не ставь и не показывай адрес. Не зови скачать, зайти на сайт, перейти или поиграть по ссылке. Это спор, не реклама. Последняя строка — вопрос или тезис, с которым хочется поспорить, даже если голос выше просит приглашение на сайт."
    : provocation
      ? `В самом конце, после пустой строки, поставь ссылку ровно так, без изменений: ${link} Это не реклама: не зови скачать, не пиши «переходи» и «по ссылке», цену не называй. Последняя строка перед ссылкой — вопрос для спора, новыми словами.`
    : quiet
    ? "Ссылку не ставь и не показывай адрес. Не зови скачать, зайти на сайт, перейти или поиграть по ссылке. Это разговор: наблюдение или вопрос читателю. Последняя строка — не приглашение на сайт, даже если голос выше просит приглашение."
    : p.requireLink
      ? `Обязательно поставь в конце ссылку ровно так, без изменений: ${link}`
      : rubric.id === "question"
        ? "Ссылку не ставь."
        : `Если уместно, поставь в конце ссылку ровно так, без изменений: ${link}`;

  const user = `Рубрика: ${rubric.brief}
${topic ? `Тема поста: ${topic}` : ""}
${hints?.formatNote ? `Формат этого поста: ${hints.formatNote}` : ""}
${hints?.toneNote ? `Тон слота: ${hints.toneNote}` : ""}
${hints?.dateSteer ? `Повод дня (одна обычная публикация, без новых фактов): ${hints.dateSteer}` : ""}
${hints?.devFact ? `ЕДИНСТВЕННЫЙ числовой факт этого поста. Другие числа из фактов проекта не копируй:\n• ${hints.devFact}` : ""}
${hints?.characterLine ? `Единственная допустимая реплика, дословно и в кавычках: ${hints.characterLine}` : ""}
${hints?.shownNote ? hints.shownNote : pictureNote ? `К посту будет приложена картинка из игры: ${pictureNote}. Можно опереться на одну её деталь; не описывай картинку целиком, не пиши «на картинке» и не добавляй того, чего на ней нет.` : ""}
${wantPoll ? (provocation
  ? "К посту будет опрос Threads: 2–4 варианта, каждый от 1 до 25 символов, без цифр, ссылок, цены, политики, религии и оскорблений. Варианты — короткие стороны спора, не факты об игре. В тексте задай вопрос и не перечисляй варианты списком."
  : "К посту будет опрос Threads: 2–4 варианта, каждый от 1 до 25 символов, без цифр, ссылок, цены и спойлеров. Варианты — короткие ответы читателя, не факты об игре. В тексте задай вопрос и не перечисляй варианты списком.") : ""}
${linkLine}
${code ? `Единственный код этого поста — вставь отдельной строкой ровно так, без изменений: ${code}\nЭто одноразовая бесплатная загрузка в App Store: код вводят там же, забирает первый. Других кодов нет и выдумывать их нельзя. Код оставь и в тексте отдельной строкой, без ссылки вокруг: его копируют вручную. Коротко скажи, что нажатие на ссылку само подставит код в App Store. Призыв в конце своими словами: скачать, поиграть и оставить отзыв. Фразу «скачай — поиграй — оставь отзыв» не копируй. Цену не упоминать.` : ""}
${season ? `Сезонный повод (по желанию): ${season}` : ""}
${detectiveHint ? `Обязательная отсылка в этом посте (мем, не факт о проекте и не связь с фильмом): ${detectiveHint}` : ""}

Недавние посты — НЕ повторяй их заходы, формулировки, структуру${p.id === "buro" ? " и мемную детективную отсылку" : ""}${p.id === "oloid" ? (quiet ? " и последнюю строку" : " и последнюю строку перед ссылкой") : ""}:
${recent || "(пока нет)"}
${oloidEndingHint(p.id, history)}
${feedback ? `\nПредыдущий вариант отклонён: ${feedback}. Исправь.` : ""}`;

  const parsed = await askJson<{ text: string; options?: string[] }>(
    system,
    user,
    wantPoll
      ? {
          type: "object",
          properties: { text: { type: "string" }, options: { type: "array", items: { type: "string" } } },
          required: ["text", "options"],
          additionalProperties: false,
        }
      : {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false,
        },
  );
  const trimmed = parsed.text.trim();
  // Формат — до ruleCheck: пустые строки входят в лимит 450.
  // Сначала вёрстка (края строк), потом строчные: заглавная должна стоять в начале строки, а не после пробелов.
  const text = p.id === "oloid" ? lowercaseSentenceStarts(normalizeOloidParagraphs(trimmed)) : trimmed;
  const options = wantPoll ? parsed.options?.map((option) => option.trim()).filter(Boolean) : undefined;
  return { text, options };
}

// Строчный стиль «Олоида»: первая буква поста, строки и фразы — строчная.
// Имена собственные из короткого списка не трогаем. Середину фразы не переписываем.
const OLOID_PROPER =
  /^(?:олоид\p{L}*|егор\p{L}*|яковлев\p{L}*|вер(?:а|ы|е|у|ой)|алик(?:а|у|ом|е)?|фед(?:я|и|е|ю|ей)|следовател\p{L}*|старушк\p{L}*|бабушк\p{L}*|сон(?:я|и|е|ю|ей)|disco|elysium|steam|android|ios|app|серафим\p{L}*|павловн\p{L}*|конюшенн\p{L}*|исаакиевск\p{L}*|зайчик\p{L}*|петербург(?:а|у|е|ом)?|санкт-петербург(?:а|у|е|ом)?|питер(?:а|у|е|ом)?|лиза|лизы|лизе|лизу|лизой|витя|вити|вите|витю|витей|тонет(?:а|у|е|ом)|ren|vk)$/iu;

export function lowercaseSentenceStarts(text: string): string {
  const urls: string[] = [];
  const codes: string[] = [];
  let masked = text.replace(/https?:\/\/\S+/g, (u) => {
    urls.push(u);
    return `\uE000${urls.length - 1}\uE000`;
  });
  if (OLOID_APP_STORE_CODES.length) {
    masked = masked.replace(new RegExp(OLOID_APP_STORE_CODES.join("|"), "g"), (c) => {
      codes.push(c);
      return `\uE001${codes.length - 1}\uE001`;
    });
  }
  const fixed = masked.replace(
    /(^|[\n\r]|[.!?…]+[^\S\n]*)([«"„“']*)(\p{Lu})(\p{Lu}*)/gu,
    (full, lead: string, quotes: string, first: string, restCaps: string, offset: number, whole: string) => {
      const rest = whole.slice(offset + lead.length + quotes.length);
      if (/^Что было, то и будет/iu.test(rest)) return full;
      const word = rest.match(/^\p{L}+(?:-\p{L}+)?/u)?.[0] ?? first;
      // Фраза «ИИ использовался как инструмент» должна остаться с заглавными ИИ, не «Ии».
      if (/^ии$/iu.test(word)) return lead + quotes + "ИИ";
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
  ).replace(
    // Строчное «ии» в начале фразы тоже поднимаем до «ИИ»: regex выше ловит только заглавную.
    /(^|[\n\r]|[.!?…]+[^\S\n]*)([«"„“']*)ии(?![\p{L}])/giu,
    (_full, lead: string, quotes: string) => `${lead}${quotes}ИИ`,
  );
  return fixed
    .replace(/\uE000(\d+)\uE000/g, (_m, i: string) => urls[Number(i)])
    .replace(/\uE001(\d+)\uE001/g, (_m, i: string) => codes[Number(i)]);
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

export function ruleCheck(
  text: string,
  p: Project,
  now: Date,
  rubric?: Rubric,
  linkContent?: string,
  promoCode?: string,
  quiet = false,
  devFact?: string,
): string | null {
  if (!text) return "пустой текст";
  if (text.length > MAX_LEN) return `длина ${text.length} > ${MAX_LEN}`;
  if ((text.match(EMOJI) || []).length > 1) return "больше одного эмодзи";
  for (const re of BANNED) if (re.test(text)) return `запрещённый паттерн ${re}`;
  if (p.promo && text.toUpperCase().includes(p.promo.code)) {
    if (!promoActive(p, now)) return `промокод ${p.promo.code} больше не действует — убери его`;
    if (!rubric || !p.promo.rubrics.includes(rubric.id)) return `промокод ${p.promo.code} — только в постах-предложениях, здесь убери`;
  }
  for (const re of p.stopList ?? []) if (re.test(text)) return `штамп ${re} — перепиши фразу целиком, не синонимом`;
  if (rubric?.id === OLOID_PROVOCATION_RUBRIC) {
    const provocationIssue = provocationProblem(text) ?? provocationNumberProblem(text, factsFor(p, now, rubric.id).join("\n"));
    if (provocationIssue) return provocationIssue;
  }
  if (rubric) {
    const safety = rotationSafetyProblem(text, rubric.id);
    if (safety) return safety;
  }
  if (devFact) {
    const numbers = devNumberProblem(text, devFact);
    if (numbers) return numbers;
  }
  // Тихий обычный пост и провокация без ссылки: URL и призыв запрещены. Остальные посты — как раньше.
  if (quiet) {
    const quietIssue = quietProblem(text);
    if (quietIssue && rubric?.id === OLOID_PROVOCATION_RUBRIC && quietIssue.includes("без ссылки")) return "провокация без ссылки: URL нельзя";
    return quietIssue;
  }
  const urls = text.match(/https?:\/\/\S+/g) || [];
  // Белый список — ровно одна ссылка. Обычный App Store: страница приложения.
  // Redeem-ссылка разрешена только рубрике appstore-promo и только с заданным кодом. В остальные посты не пускаем.
  const allowed =
    rubric?.id === OLOID_APP_STORE_PROMO_RUBRIC && promoCode
      ? oloidRedeemUrl(promoCode)
      : (rubric?.link ?? p.link)(now, linkContent);
  if (urls.some((u) => u.replace(/[.,)]+$/, "") !== allowed)) return `посторонняя или искажённая ссылка — вставь ровно эту: ${allowed}`;
  if (p.requireLink && urls.length === 0) return "нет обязательной ссылки";
  return null;
}

const APP_STORE_RUBRICS = new Set<string>([OLOID_APP_STORE_RUBRIC, OLOID_APP_STORE_PROMO_RUBRIC]);
const NO_PRICE_RUBRICS = new Set<string>([OLOID_APP_STORE_RUBRIC, OLOID_APP_STORE_PROMO_RUBRIC, OLOID_VKPLAY_RUBRIC, OLOID_PROVOCATION_RUBRIC]);
// Эксклюзив App Store: такие формулировки пост отклоняют. «Уже в App Store» и «на iPhone и iPad» без «только» — можно.
const APP_STORE_EXCLUSIVITY =
  /эксклюзив|ios[-\s]?only|только[^.\n]{0,50}(?:app\s*store|ios|iphone|ipad|айфон)|(?:app\s*store|ios)[^.\n]{0,60}только|других\s+платформ|других\s+площадк|больше\s+нигде|нигде\s+больше|единственн\p{L}*\s+(?:площадк|платформ)/iu;

/** Коды «Олоида»: в промо-посте ровно один заданный, в остальных постах — ни одного. «Бюро» не касается. */
export function appStoreCodeProblem(text: string, projectId: string, rubricId: string, promoCode?: string): string | null {
  if (projectId !== "oloid") return null;
  const found = OLOID_APP_STORE_CODES.filter((c) => text.includes(c));
  if (rubricId !== OLOID_APP_STORE_PROMO_RUBRIC) {
    return found.length ? `промокод ${found[0]} в этом посте не нужен — убери его` : null;
  }
  if (!promoCode) return "промокод не задан";
  const lines = text.split("\n").map((l) => l.trim());
  if (!lines.includes(promoCode)) return `нет промокода ${promoCode} — вставь его ровно так, отдельной строкой`;
  if (found.some((c) => c !== promoCode)) return "лишний промокод — оставь только заданный";
  if (!/бесплатн/iu.test(text)) return "напиши, что код даёт бесплатную загрузку в App Store";
  if (!/одноразов|первый/iu.test(text)) return "напиши, что код одноразовый и его забирает первый";
  if (!/скач|загруз|поигра/iu.test(text) || !/отзыв|напиш|пару слов|как вам/iu.test(text))
    return "призыв своими словами: скачать, поиграть и оставить отзыв";
  if (!/(?:наж|тап)/iu.test(text) || !/(?:подстав|примен)/iu.test(text))
    return "коротко скажи, что нажатие на ссылку подставит код в App Store";
  return null;
}

/**
 * Провокация: чисел может не быть. Если они есть — каждое должно быть в фактах этого поста.
 * Цена, часы прохождения и лишние числа режет devNumberProblem.
 */
export function provocationNumberProblem(text: string, allowedFacts: string): string | null {
  const problem = numberTokens(text).length ? devNumberProblem(text, allowedFacts) : devNumberProblem(text, "");
  if (!problem) return null;
  if (problem.startsWith("цену")) return "Цену не упоминать";
  if (problem.startsWith("число ")) return problem.replace("не из выбранного факта", "не из фактов");
  if (problem.startsWith("в посте нет числа")) return "число не из фактов";
  if (problem.startsWith("часы в этом посте")) return "числа и часы в провокации только если они есть в фактах";
  return problem;
}

/** Посты App Store, VK Play и провокации: цена в тексте отклоняется и пост пишется заново. Одно и то же правило mentionsPrice.
 *  Код (цифры и латиница, без ₽) не цена. */
export function appStorePriceProblem(text: string, projectId: string, rubricId: string): string | null {
  if (projectId !== "oloid" || !NO_PRICE_RUBRICS.has(rubricId)) return null;
  // Код вырезаем до проверки: в нём цифры и буквы, знака ₽ нет, но так цифра кода не склеится с «р» из текста.
  if (mentionsPrice(redactAppStoreCodes(text))) return "Цену не упоминать";
  return null;
}

/** Посты App Store: без скелета / кадра на ладони и без эксклюзива. */
export function appStoreMomentProblem(text: string, projectId: string, rubricId: string): string | null {
  if (projectId !== "oloid" || !APP_STORE_RUBRICS.has(rubricId)) return null;
  if (/скелет/iu.test(text)) return "скелет не упоминать";
  if (/на\s+ладон/iu.test(text)) return "кадр с олоидом на ладони не описывать";
  if (APP_STORE_EXCLUSIVITY.test(text)) return "не пиши, что «Олоид» только в App Store, эксклюзив или что на других платформах релиза не было";
  return null;
}

const VK_PLAY_MENTION = /vk\s*play|вк\s*плей|vkplay/iu;
const VK_PLAY_HORROR = /хоррор|horror|ужастик|игра\s+ужасов/iu;
const VK_PLAY_FIRE = /пожар|(?<![\p{L}])огон(?:ь|я|ю|ем|и)(?![\p{L}])/iu;
const VK_PLAY_FINALE = /финал|концовк|развязк/iu;
const VK_PLAY_AI = /нейросет|искусственн\p{L}*\s+интеллект|(?<![\p{L}])ии(?![\p{L}])|(?<![\p{L}])ai(?![\p{L}])/iu;
const VK_PLAY_AI_ALLOWED = /ии использовался как инструмент/iu;

/** Пост VK Play: новость о выходе, мистическая новелла, без хоррора, пожара, финала и цены. */
export function vkPlayProblem(text: string, projectId: string, rubricId: string): string | null {
  if (projectId !== "oloid" || rubricId !== OLOID_VKPLAY_RUBRIC) return null;
  if (!VK_PLAY_MENTION.test(text)) return "прямо скажи, что «Олоид» вышел на VK Play";
  if (!/мистич/iu.test(text) || !/новелл/iu.test(text)) return "назови «Олоид» мистической новеллой";
  if (VK_PLAY_HORROR.test(text)) return "не называй «Олоид» хоррором: это мистическая новелла";
  if (VK_PLAY_FIRE.test(text)) return "пожар и огонь не упоминать";
  if (VK_PLAY_FINALE.test(text)) return "финал и концовку не упоминать";
  if (/скелет/iu.test(text)) return "скелет не упоминать";
  if (/на\s+ладон/iu.test(text)) return "кадр с олоидом на ладони не описывать";
  const withoutAllowed = text.replace(new RegExp(VK_PLAY_AI_ALLOWED.source, "giu"), "");
  if (VK_PLAY_AI.test(withoutAllowed)) return "про ИИ можно только фразу «ИИ использовался как инструмент»";
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

// «Олоид»: последняя строка перед ссылкой не повторяет концовки недавних постов.
const OLOID_ENDING_LOOKBACK = 10;
const ENDING_SIMILARITY = 0.8;
const ENDING_REPEAT = "концовка повторяет недавний пост, придумай другую";

/** Последняя непустая строка без ссылки — концовка поста. */
function lastNonLinkLine(text: string): string {
  const codes = OLOID_APP_STORE_CODES as readonly string[];
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/https?:\/\/\S+/g, "").trim())
    .filter((line) => line && !codes.includes(line));
  return lines.at(-1) ?? "";
}

/** Строчные, без эмодзи и знаков, «ё» как «е» — чтобы сравнивать формулировку, а не вёрстку. */
function normEnding(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstWords(s: string, n: number): string {
  return s.split(" ").slice(0, n).join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 — одинаковые строки, 0 — ничего общего. */
function endingSimilarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

function oloidEndingHint(projectId: string, history: HistoryItem[]): string {
  if (projectId !== "oloid") return "";
  const lines = history
    .filter((h) => h.project === "oloid")
    .slice(0, OLOID_ENDING_LOOKBACK)
    .map((h) => lastNonLinkLine(redactAppStoreCodes(h.text)))
    .filter(Boolean);
  if (!lines.length) return "";
  return `Концовки недавних постов — последнюю строку так не заканчивай и близко не повторяй:\n${lines.map((e) => `— ${e}`).join("\n")}\n`;
}

/** «Олоид»: концовка совпала или почти совпала с последней строкой одного из последних постов. */
export function repeatedEnding(text: string, history: HistoryItem[], projectId: string): string | null {
  if (projectId !== "oloid") return null;
  const ending = normEnding(lastNonLinkLine(text));
  if (!ending) return null;
  const head = firstWords(ending, 4);
  const headCounts = head.split(" ").length >= 4;
  const recent = history.filter((h) => h.project === "oloid").slice(0, OLOID_ENDING_LOOKBACK);
  for (const h of recent) {
    const prev = normEnding(lastNonLinkLine(typeof h.text === "string" ? h.text : ""));
    if (!prev) continue;
    const prevWords = prev.split(" ");
    if (endingSimilarity(ending, prev) >= ENDING_SIMILARITY) return ENDING_REPEAT;
    if (headCounts && prevWords.length >= 4 && firstWords(prev, 4) === head) return ENDING_REPEAT;
  }
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

function appStoreFactNote(rubricId?: string, promoCode?: string): string {
  if (rubricId !== OLOID_APP_STORE_RUBRIC && rubricId !== OLOID_APP_STORE_PROMO_RUBRIC) return "";
  const common =
    "Это пост рубрики App Store. Яркий момент из фактов и кадра (атмосфера, коммуналка, Петербург, живопись, озвучка, звук, механика) — можно. Отклоняй скелет, повороты сюжета, убийц, концовки, кадр «олоид на ладони» и имена, которых нет в фактах. Скелет в фактах есть, но в этом посте его быть не должно. Цену не упоминать. Если в посте есть цена — отклоняй. Отклоняй эксклюзив: «эксклюзив», «только в App Store», «только на iOS», «только на iPhone», «iOS-only», «на других платформах релиза не было».\n";
  if (rubricId === OLOID_APP_STORE_PROMO_RUBRIC && promoCode) {
    return `${common}В этом посте один настоящий код бесплатной загрузки, ровно ${promoCode}: отдельной строкой в тексте и внутри ссылки. Ссылка ровно https://apps.apple.com/redeem?code=${promoCode} — официальная, она открывает App Store и подставляет этот код. Не отклоняй из-за этой ссылки и не требуй страницу apps.apple.com/ru/app/id6817809325. Фраза, что нажатие на ссылку подставит код, — верная. Загрузка по коду бесплатная, код одноразовый, забирает первый. Не отклоняй из-за этого кода, слова «бесплатно» про эту загрузку и призыва скачать, поиграть и оставить отзыв. Других кодов быть не должно.\n`;
  }
  return `${common}Промокоды и бесплатную раздачу в этом посте отклоняй: это другой тип поста.\n`;
}

function provocationFactNote(rubricId?: string, quiet?: boolean): string {
  if (rubricId !== OLOID_PROVOCATION_RUBRIC) return "";
  const link = quiet
    ? "Ссылки нет специально. Не отклоняй из-за отсутствия ссылки. Призыв скачать, зайти на сайт или перейти по ссылке — отклоняй."
    : "Ссылка на oloid-game.ru с UTM в конце допустима. Не требуй призыв скачать.";
  return `Это провокационный пост: спорное мнение или вопрос про игры, жанр, разработку, Петербург или мистику. Мнение о визуальных новеллах и инди вообще — не факт о проекте. Не отклоняй его, если «Олоиду» не приписано того, чего нет в фактах. Отклоняй политику, религию, оскорбления групп людей, мат, токсичность, спойлеры, хоррор, пожар, финал, скелет, тайную комнату, цену и любые числа, которых нет в фактах. Пост не должен быть рекламой. ${link}\n`;
}

function vkPlayFactNote(rubricId?: string): string {
  if (rubricId !== OLOID_VKPLAY_RUBRIC) return "";
  return "Это пост рубрики VK Play. Факт, не отклоняй: «Олоид» вышел на VK Play. Ссылку в конце не отклоняй: это страница игры на VK Play, UTM нет специально. «Олоид» — мистическая визуальная новелла, не хоррор: «хоррор», horror и «ужастик» отклоняй. Пожар, огонь, финал, концовки, скелет, убийц и кадр «олоид на ладони» отклоняй. Яркий момент из фактов и кадра можно. Цену не упоминать. Если в посте есть цена — отклоняй. Про ИИ допустима только фраза «ИИ использовался как инструмент»; другие формулировки про нейросети отклоняй. Промокоды отклоняй.\n";
}

function rotationFactNote(rubricId?: string, devFact?: string, quiet?: boolean): string {
  if (!rubricId || !isOloidRotationRubric(rubricId)) return "";
  let note =
    "Это обычный пост, не магазин. Хоррор, horror, ужастик, пожар, огонь, финал, концовку, скелет, достижения, выборы игрока, тайную комнату и природу артефакта — отклоняй. Про ИИ допустима только фраза «ИИ использовался как инструмент».\n";
  if (quiet) note += "Ссылки нет специально. Не отклоняй из-за отсутствия ссылки. Призыв скачать, зайти на сайт или перейти по ссылке — отклоняй.\n";
  if (devFact) {
    note += `Единственные допустимые числа — из этой строки, и никакие другие:\n• ${devFact}\nЧисло, которого нет в этой строке, — отклоняй. Часы прохождения 2–3 в этот пост не входят.\n`;
  }
  return note;
}

function oloidCheckNote(rubricId?: string, now = new Date()): string {
  const style =
    "Строчные буквы (кроме имён собственных), один восклицательный знак в первой строке и короткие абзацы (одна-две связанные фразы на строке, не больше трёх; между абзацами пустая строка; ссылка отдельной строкой после пустой) — заданный стиль, не отклоняй из-за этого.\nСсылка на apps.apple.com/ru/app/id6817809325 — официальная страница «Олоида» в App Store. Если она стоит в посте, не отклоняй из-за неё: UTM нет специально. ";
  if (rubricId === OLOID_DEV_NUMBERS_RUBRIC) {
    return `${style}Это пост «цифры разработки». Цену не упоминать. Числа, которых нет в отдельном выбранном факте, отклоняй — в том числе 199 ₽, 2–3 часа, около 1600 реплик и 45 статей, даже если они есть в общих фактах.\n`;
  }
  if (rubricId === OLOID_VKPLAY_RUBRIC) {
    return `${style}«Вышло на VK Play» — факт этого поста, не отклоняй. Выход на Android или Steam — нет. Цену не упоминать. Если в посте есть цена — отклоняй.\n`;
  }
  if (rubricId === OLOID_PROVOCATION_RUBRIC) {
    return `${style}Цену не упоминать. Если в посте есть цена — отклоняй. Это не пост магазина: не требуй новость об App Store или VK Play и не требуй ссылку, если её нет.\n`;
  }
  if (rubricId === OLOID_APP_STORE_RUBRIC || rubricId === OLOID_APP_STORE_PROMO_RUBRIC) {
    return `${style}«Вышло на iOS / iPhone / iPad» и «App Store» допустимы, когда они есть в фактах. «Эксклюзив», «только в App Store», «только на iOS», «iOS-only» и «на других платформах релиза не было» — отклоняй. Про VK Play в этом посте не пиши. Выход на Android или Steam — нет. Цену не упоминать. Если в посте есть цена — отклоняй.\n`;
  }
  const vkLine =
    mskCalendarDay(now) >= OLOID_VKPLAY_FROM
      ? "«Вышло на VK Play» допустимо: это факт. "
      : "Выход на VK Play — нет. ";
  return `${style}«Вышло на iOS / iPhone / iPad», «App Store» и цена 199 ₽ допустимы, когда они есть в фактах. ${vkLine}Выход на Android или Steam — нет.\n`;
}

export async function factCheck(
  text: string,
  p: Project,
  pictureNote?: string,
  now = new Date(),
  opts?: { rubricId?: string; promoCode?: string; devFact?: string; quiet?: boolean },
): Promise<string | null> {
  const r = await askJson<{ ok: boolean; reason: string }>(
    `Ты строгий редактор-фактчекер. Проверь пост о проекте «${p.name}».
${p.id === "oloid" ? oloidCheckNote(opts?.rubricId, now) : ""}${rotationFactNote(opts?.rubricId, opts?.devFact, opts?.quiet)}${provocationFactNote(opts?.rubricId, opts?.quiet)}${appStoreFactNote(opts?.rubricId, opts?.promoCode)}${vkPlayFactNote(opts?.rubricId)}${p.id === "buro" ? `Отсылки к детективам — стиль и шутка, не факты о проекте. Допустимы только эти якоря, каждый своим героем:\n${BURO_DETECTIVE_REFS.map((ref) => `• ${ref.hint}`).join("\n")}\nНе отклоняй такую шутку, если она узнаваемая и не приписана чужому персонажу. Отклоняй, если пост утверждает, что сервис основан на фильме, снят по нему или связан с правообладателем, если цитата приписана не тому герою, если раскрыта развязка или описана жестокость, или если шутка непристойная.\n` : ""}Допустимые факты:
${factsFor(p, now, opts?.rubricId).map((f) => `• ${f}`).join("\n")}
Запрещено:
${forbiddenFor(p, opts?.rubricId, now).map((f) => `• ${f}`).join("\n")}
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
