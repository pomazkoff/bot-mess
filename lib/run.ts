import { BURO_DETECTIVE_REFS, PROJECTS, pickWeighted, type DetectiveRef, type Media, type Picture, type Project, type Rubric } from "./projects.js";
import { detectiveRefProblem, draftPost, ruleCheck, tooSimilar, factCheck } from "./generate.js";
import type { HistoryItem } from "./store.js";
import type { Channel } from "./channels.js";

const MAX_ATTEMPTS = 3;

export type Draft = {
  project: Project;
  rubricId: string;
  topic?: string;
  topicTag?: string;
  media?: Media;
  text: string | null; // null — ни один вариант не прошёл проверки
  rejected: string[];
};

/** Рубрика по весам без повтора предыдущей; рубрика-посев (alternateRubric) идёт через пост.
 *  При трёх постах в день посев (трейлер «Олоида») выходит примерно через раз, то есть 1–2 раза в сутки. */
export function pickRubric(project: Project, history: HistoryItem[], forcedRubric?: string): Rubric {
  const forced = project.rubrics.find((r) => r.id === forcedRubric);
  if (forced) return forced;
  const lastRubric = history.find((h) => h.project === project.id)?.rubric;
  const alt = project.rubrics.find((r) => r.id === project.alternateRubric);
  if (alt && lastRubric !== alt.id) return alt;
  return pickWeighted(project.rubrics.filter((r) => r !== alt && r.weight > 0), lastRubric, (r) => r.id);
}

/** Тема Threads: своя у рубрики или та, что дольше всех не использовалась в постах проекта. */
export function pickTopicTag(project: Project, rubric: Rubric, history: HistoryItem[]): string | undefined {
  if (rubric.topicTag) return rubric.topicTag;
  const tags = project.topicTags ?? [];
  const age = (t: string) => {
    const i = history.filter((h) => h.project === project.id).findIndex((h) => h.topicTag === t);
    return i === -1 ? Infinity : i; // история — от новых к старым
  };
  return [...tags].sort((a, b) => age(b) - age(a))[0];
}

/** Картинка к посту: не из недавних постов, лучше совпадающая тегами с рубрикой и темой. */
export function pickPicture(project: Project, rubric: Rubric, topic: string | undefined, history: HistoryItem[]): Picture | undefined {
  if (!rubric.withPicture || !project.pictures?.length) return undefined;
  const recent = new Set(history.slice(0, 20).map((h) => h.media));
  const fresh = project.pictures.filter((p) => !recent.has(p.url));
  const pool = fresh.length ? fresh : project.pictures;
  const text = `${rubric.id} ${topic ?? ""}`.toLowerCase();
  const score = (p: Picture) => p.tags.filter((t) => text.includes(t)).length;
  const best = Math.max(...pool.map(score));
  const top = pool.filter((p) => score(p) === best);
  return top[Math.floor(Math.random() * top.length)];
}

/** Отсылка «Бюро», которой не было в последних постах проекта; когда все уже звучали — круг заново. */
export function pickDetectiveRef(history: HistoryItem[]): DetectiveRef {
  const recent = history.filter((h) => h.project === "buro").slice(0, BURO_DETECTIVE_REFS.length - 1);
  const used = new Set(BURO_DETECTIVE_REFS.filter((r) => recent.some((h) => r.mark.test(h.text))).map((r) => r.id));
  const fresh = BURO_DETECTIVE_REFS.filter((r) => !used.has(r.id));
  const pool = fresh.length ? fresh : BURO_DETECTIVE_REFS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Тема рубрики, которой не было в недавних постах этой рубрики; когда темы кончились — круг заново. */
export function pickTopic(rubric: Rubric, history: HistoryItem[]): string | undefined {
  if (!rubric.topics?.length) return undefined;
  const used = new Set(history.filter((h) => h.rubric === rubric.id).map((h) => h.topic));
  const fresh = rubric.topics.filter((t) => !used.has(t));
  const pool = fresh.length ? fresh : rubric.topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Выбирает проект/рубрику и генерирует пост с проверками. Ничего не публикует и ничего не пишет в историю. */
/** Проект аккаунта по очереди: следующий после последнего опубликованного. */
export function pickProject(channel: Channel, lastProject: string | null, forcedProject?: string): Project {
  const own = PROJECTS.filter((p) => channel.projects.includes(p.id));
  return own.find((p) => p.id === forcedProject) ?? own.find((p) => p.id !== lastProject) ?? own[0];
}

export async function makeDraft(opts: {
  channel: Channel;
  history: HistoryItem[];
  lastProject: string | null;
  forcedProject?: string;
  forcedRubric?: string; // только для превью
  forcedTopic?: string; // только для превью: фрагмент названия темы
  now: Date;
}): Promise<Draft> {
  const { channel, history, lastProject, forcedProject, forcedRubric, forcedTopic, now } = opts;
  const project = pickProject(channel, lastProject, forcedProject);

  // Рубрика и чередование трейлера — по постам этого аккаунта; темы и антиповтор — по всем аккаунтам,
  // чтобы два аккаунта не выдавали одно и то же
  const own = history.filter((h) => (h.channel ?? "pomazkof") === channel.id);
  const rubric = pickRubric(project, own, forcedRubric);
  const wanted = forcedTopic?.toLowerCase();
  const topic = (wanted && rubric.topics?.find((t) => t.toLowerCase().includes(wanted))) || pickTopic(rubric, history);
  const linkContent = `${channel.id}-${rubric.id}`;
  const topicTag = pickTopicTag(project, rubric, history);
  const picture = rubric.media ? undefined : pickPicture(project, rubric, topic, history);
  const media: Media | undefined = rubric.media ?? (picture && { type: "IMAGE", url: picture.url });
  const detective = project.id === "buro" ? pickDetectiveRef(history) : undefined;
  const base = { project, rubricId: rubric.id, topic, topicTag, media };

  let feedback: string | undefined;
  const rejected: string[] = [];

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = await draftPost(project, rubric, history, now, feedback, topic, channel.voiceNote, linkContent, picture?.about, detective?.hint);
    const problem =
      ruleCheck(candidate, project, now, rubric, linkContent) ??
      (detective ? detectiveRefProblem(candidate, history, detective) : null) ??
      tooSimilar(candidate, history) ??
      (await factCheck(candidate, project, picture?.about, now));
    if (!problem) return { ...base, text: candidate, rejected };
    feedback = problem;
    rejected.push(`${problem}: ${candidate}`);
  }
  return { ...base, text: null, rejected };
}
