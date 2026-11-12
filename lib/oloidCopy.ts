// Заходы и варианты последней строки «Олоида».
// Очередь как у форматов провокации: кто дольше не выходил, тот следующий.
// Id пишется в историю после публикации (copyHook / copyClosing).
// Старый пост без id узнаётся по следу в тексте.

import { pickLeastRecent } from "./oloidRotation.js";
import type { HistoryItem } from "./store.js";

export type OloidCopyLine = {
  id: string;
  /** Короткая тема для отчёта и промпта. */
  theme: string;
  /** Пример строчными. Модель держится смысла и может сказать близко, не в кавычках. */
  line: string;
  /** След в уже вышедшем посте. */
  mark: RegExp;
  steer: string;
};

export const OLOID_COPY_HOOKS: readonly OloidCopyLine[] = [
  {
    id: "deep-plot",
    theme: "многослойный сюжет",
    line: "у этой истории не одно дно. под каждым ответом прячется новый вопрос",
    mark: /не одно дно|под каждым ответом прячется/iu,
    steer: "Смысл: сюжет многослойный, под ответом новый вопрос. Повороты, убийц и разгадки не называй.",
  },
  {
    id: "guitar",
    theme: "сольная акустическая гитара",
    line: "одна акустическая гитара. ни одного другого инструмента. и этого хватило, чтобы стало не по себе",
    mark: /ни одного другого инструмента|только сольная акустическая/iu,
    steer: "Смысл: саундтрек — одна акустическая гитара, других инструментов нет. Имя автора музыки не называй.",
  },
  {
    id: "past-return",
    theme: "в прошлое можно вернуться",
    line: "прошлое здесь не остаётся в прошлом. иногда в него можно вернуться. вопрос только — стоит ли",
    mark: /не остаётся в прошлом|в него можно вернуться/iu,
    steer:
      "Смысл: одна интрига, что в прошлое иногда можно вернуться. Как это устроено, ритуал, природу артефакта, второй эпизод и разгадки не называй. Слова «путешествие во времени» не пиши.",
  },
  {
    id: "family-secrets",
    theme: "секреты семейного древа",
    line: "чтобы понять, что происходит с егором, придётся разобраться в его семье. а семейное древо у него с секретами",
    mark: /семейное древо у него с секретами|в семейном древе егора есть секреты/iu,
    steer: "Смысл: чтобы понять Егора, нужна его семья, в древе есть секреты. Какие именно — не называй. Второй эпизод не упоминай.",
  },
  {
    id: "gripping",
    theme: "садишься на полчаса",
    line: "садишься на полчаса, а встаёшь через три. мы предупредили",
    mark: /садишься на полчаса|встаёшь через три/iu,
    steer: "Смысл: шутка про «сел на полчаса, встал через три». Это факт прохождения около 2–3 часов, не новая цифра. Других длительностей не добавляй.",
  },
  {
    id: "characters",
    theme: "объёмные герои",
    line: "у каждого героя здесь своя правда, свои страхи и своя причина молчать",
    mark: /своя причина молчать|свои страхи и своя причина/iu,
    steer: "Смысл: герои объёмные, у каждого правда, страх и причина молчать. Биографии и секреты не выдумывай.",
  },
  {
    id: "family-time",
    theme: "семья, время и квартира",
    line: "семья, время и одна старая квартира, которая помнит больше, чем все её жильцы",
    mark: /семья, время и одна старая квартира/iu,
    steer: "Смысл: семья, время и старая квартира. Что квартира помнит — не раскрывай. Механизм времени не объясняй.",
  },
];

export const OLOID_COPY_CLOSINGS: readonly OloidCopyLine[] = [
  {
    id: "outro-deep",
    theme: "глубокий сюжет и гитара",
    line: "глубокий сюжет, живые герои и гитара, которая звучит у вас в голове ещё долго",
    mark: /глубокий сюжет, живые герои/iu,
    steer: "Можно закончить близко к этой строке. Имя автора музыки не называй. Цену не ставь.",
  },
  {
    id: "outro-hours",
    theme: "думать будете дольше",
    line: "первый эпизод — 2–3 часа, а думать о нём будете дольше",
    mark: /думать о нём будете дольше/iu,
    steer: "Можно закончить близко к этой строке. 2–3 часа — прохождение первого эпизода, других чисел не добавляй. Второй эпизод не описывай. Цену не ставь.",
  },
];

/** Обычные рубрики, где заход не ломает чужой формат. Магазины берут темы своими углами. */
const HOOK_RUBRICS = new Set(["backstage", "detail", "ask", "petersburg", "atmosphere", "threads", "about", "dev", "eras", "references", "site"]);
/** Те же плюс App Store и VK Play: там последняя строка свободная. Промокод крутит свои финалы. */
const CLOSING_RUBRICS = new Set([...HOOK_RUBRICS, "appstore", "vkplay"]);
/** Пост без лишних чисел: шутка про 2–3 часа сюда не идёт. */
const NO_HOURS = new Set(["dev"]);

export function copyHooksFor(rubricId: string): readonly OloidCopyLine[] {
  return HOOK_RUBRICS.has(rubricId) ? OLOID_COPY_HOOKS : [];
}

export function copyClosingsFor(rubricId: string): readonly OloidCopyLine[] {
  if (!CLOSING_RUBRICS.has(rubricId)) return [];
  if (NO_HOURS.has(rubricId)) return OLOID_COPY_CLOSINGS.filter((line) => line.id !== "outro-hours");
  return OLOID_COPY_CLOSINGS;
}

/** Тема рубрики уже одна из строк захода — второй заход не подмешиваем. */
export function copyHookForTopic(topic: string | undefined, lines: readonly OloidCopyLine[]): OloidCopyLine | undefined {
  if (!topic) return undefined;
  const text = topic.toLowerCase();
  return lines.find((line) => text.includes(line.line.slice(0, 32)));
}

/** Кто дольше не выходил. Ничья — порядок списка. Пустой список — undefined. */
export function pickOloidCopyLine(
  lines: readonly OloidCopyLine[],
  history: readonly HistoryItem[],
  field: "copyHook" | "copyClosing",
): OloidCopyLine | undefined {
  if (!lines.length) return undefined;
  const lastUsed: Record<string, string> = {};
  for (const item of history) {
    if (item.project !== "oloid" || !item.at) continue;
    for (const line of lines) {
      if (item[field] !== line.id && !line.mark.test(item.text ?? "")) continue;
      const prev = lastUsed[line.id];
      if (!prev || Date.parse(item.at) > Date.parse(prev)) lastUsed[line.id] = item.at;
    }
  }
  return pickLeastRecent(lines, lastUsed);
}

export function oloidCopySteer(hook?: OloidCopyLine, closing?: OloidCopyLine): string {
  const parts: string[] = [];
  if (hook) {
    parts.push(
      `Заход этого поста, тема «${hook.theme}». Пример строчными. Можно близко, без кавычек и не как цитата. Если тема рубрики про другое — вплети этот смысл одной фразой, не ломая тему.\n${hook.line}\n${hook.steer}`,
    );
  }
  if (closing) {
    parts.push(
      `Вариант последней строки. Можно близко, своими словами рядом. Если рубрика просит вопрос — вопрос в ту же тему. Не повторяй концовки недавних постов.\n${closing.line}\n${closing.steer}`,
    );
  }
  return parts.join("\n");
}

/** Пометка фактчеку: интрига из захода допустима, подробности нет. */
export function oloidCopyFactNote(hook?: OloidCopyLine, closing?: OloidCopyLine): string {
  const ids = new Set([hook?.id, closing?.id].filter((id): id is string => Boolean(id)));
  const notes: string[] = [];
  if (ids.has("deep-plot")) notes.push("Допустима одна фраза, что сюжет многослойный и под ответом прячется новый вопрос. Повороты, убийц и разгадки отклоняй.");
  if (ids.has("guitar") || ids.has("outro-deep")) notes.push("Допустимо, что саундтрек — только сольная акустическая гитара. Имя автора музыки отклоняй. Формулировку, что звук — половина игры или работы, отклоняй.");
  if (ids.has("past-return") || ids.has("family-time")) notes.push("Допустима одна фраза интриги: прошлое не остаётся в прошлом и иногда в него можно вернуться. Механизм, ритуал, природу артефакта, второй эпизод и разгадки отклоняй.");
  if (ids.has("family-secrets")) notes.push("Допустимо, что в семейном древе Егора есть секреты. Какие именно, второй эпизод и разгадки отклоняй.");
  if (ids.has("gripping") || ids.has("outro-hours")) notes.push("«Полчаса» и «через три» — шутка про факт прохождения около 2–3 часов, не новая длительность. Другие числа отклоняй. Цену отклоняй, если этот пост её не разрешает.");
  if (ids.has("characters") || ids.has("outro-deep")) notes.push("Допустимо, что герои объёмные: своя правда, страхи и причина молчать. Биографии и секреты, которых нет в фактах, отклоняй.");
  if (ids.has("family-time")) notes.push("Допустима фраза про семью, время и старую квартиру, которая помнит больше, чем жильцы. Что именно она помнит — отклоняй.");
  return notes.length ? `${notes.join(" ")}\n` : "";
}
