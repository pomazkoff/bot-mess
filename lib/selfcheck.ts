// Локальные проверки очереди, цифр, тихого поста и образцов.
// Запуск: npx tsx lib/selfcheck.ts
// Образцы ниже — не вывод модели.

import assert from "node:assert/strict";
import { OLOID_DEV_NUMBER_FACTS, OLOID_DEV_NUMBERS_RUBRIC, devNumberProblem, numberTokens } from "./devFacts.js";
import { appStoreCodeProblem, appStoreMomentProblem, appStorePriceProblem, lowercaseSentenceStarts, provocationNumberProblem, repeatedEnding, ruleCheck } from "./generate.js";
import {
  OLOID_DATE_HOOKS,
  OLOID_PROVOCATION_FORMATS,
  eligibleRotationRubrics,
  matchingDateHook,
  oloidSlotTone,
  pickLeastRecent,
  pollOptionsProblem,
  provocationHasLink,
  provocationLexiconProblem,
  provocationWantsPoll,
  regularPostIsQuiet,
  rotationSafetyProblem,
  usedDateHookIds,
} from "./oloidRotation.js";
import { OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_FROM, OLOID_APP_STORE_PROMO_UNTIL, OLOID_APP_STORE_RETIRED_CODES, OLOID_APP_STORE_URL, OLOID_VKPLAY_URL, PROJECTS, factsFor, nextAppStoreCode, oloidRedeemUrl, redactAppStoreCodes, spentAppStoreCodes } from "./projects.js";
import { appStorePromoOpen, makeDraft, pickPicture, pickRubric } from "./run.js";
import type { HistoryItem } from "./store.js";
import {
  OLOID_COLOR_FACTS_PER_POST,
  OLOID_ROTATING_FACTS,
  oloidPromptFacts,
  oloidRepeatProblem,
  repeatedDetailProblem,
  spatulaProblem,
  tiredOloidCopyProblem,
  topicRepeatsRecent,
} from "./oloidFacts.js";
import { OLOID_COPY_HOOKS, copyClosingsFor, copyHooksFor, pickOloidCopyLine } from "./oloidCopy.js";
import { briefThreadsError, containerSteps, pollAttachmentField } from "./threads.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHANNELS } from "./channels.js";
import {
  DRAFT_TTL_SEC,
  EDIT_ALREADY_PUBLISHED,
  EDIT_ALREADY_SKIPPED,
  EDIT_PENDING_TTL_SEC,
  EDIT_PROMPT,
  REPLACED_NOTE,
  THREADS_TEXT_MAX,
  chatAllowed,
  claimDecision,
  composeEditedText,
  draftKeyboard,
  draftTelegramText,
  editLengthReply,
  editPromptHtml,
  historyFromDraft,
  newDraftId,
  parseDraftCallback,
  publishErrorText,
  secretMatches,
  withOutcome,
  withReplaced,
  type PublishDraft,
  type TgButton,
} from "./drafts.js";
import { createMemoryDraftStore, handleDraftCallback, handleDraftMessage, publishStoredDraft, type DraftStore } from "./draftReview.js";
import { pickStudioSlot, studioFactIds, studioProblem } from "./studio.js";
import {
  EDITORIAL_SKIP_REASON,
  OLOID_DIARY_ENTRIES,
  OLOID_FRAME_SOURCES,
  OLOID_REVIEWS,
  REVIEW_REPLY_FALLBACK,
  assembleReviewPost,
  chooseReviewPost,
  diaryMedia,
  diaryProblem,
  editorialRubricOpen,
  extractReviewReply,
  frameMedia,
  framePairProblem,
  frameProblem,
  mayRepublishWithoutMedia,
  editorialFactNote,
  editorialSteer,
  pickEditorial,
  publishedReviewReply,
  quoteToPublish,
  reviewFactCheckIsReplyProblem,
  reviewProblem,
  reviewReplyBudget,
  reviewReplySoftProblem,
  reviewRetryNote,
  reviewUsesFallback,
} from "./oloidEditorial.js";
import { pickRegularShown, shownAssetFiles } from "./variety.js";
import { OLOID_FORCED_REVIEW_ENABLED, OLOID_FORCED_REVIEW_ID, OLOID_FORCED_REVIEW_REDIS_KEY, forcedReviewAction, oloidForcedReviewText } from "./oloidForcedReview.js";

const oloid = PROJECTS.find((project) => project.id === "oloid");
assert.ok(oloid);

const evening = new Date("2026-10-24T17:00:00.000Z"); // 20:00 МСК
const day = "2026-10-24";

const banned = ["94", "TLENUM", "достижен", "secret", "нише", "ломом", "2–3", "2-3", "кирпич", "Android", "меню выбора"];
const blob = OLOID_DEV_NUMBER_FACTS.map((fact) => fact.text).join("\n");
for (const word of banned) assert.equal(blob.includes(word), false, word);
assert.equal(new Set(OLOID_DEV_NUMBER_FACTS.map((fact) => fact.id)).size, OLOID_DEV_NUMBER_FACTS.length);
assert.ok(OLOID_DEV_NUMBER_FACTS.length > 70);
assert.ok(oloid.facts.some((fact) => fact.includes("прислонённый ломик")));
assert.ok(oloid.facts.some((fact) => fact.includes("Сейф собран")));
assert.ok(oloid.facts.some((fact) => fact.includes("Выборы эпизода I")));
assert.ok(oloid.facts.some((fact) => fact.includes("199 ₽")));
assert.equal(oloid.facts.some((fact) => fact.includes("500 ₽")), false);
const sunday = OLOID_DEV_NUMBER_FACTS.find((fact) => fact.id === "commits-sunday");
assert.ok(sunday);
assert.equal(devNumberProblem("в воскресенье 209 коммитов из 666", sunday.text), null);
assert.ok(devNumberProblem("209 коммитов и ещё 12", sunday.text));

const pool = eligibleRotationRubrics(oloid);
assert.deepEqual(
  pool.map((rubric) => rubric.id),
  ["backstage", "detail", "ask", "petersburg", OLOID_DEV_NUMBERS_RUBRIC, "diary", "frame", "review"],
);
assert.equal(pool.some((rubric) => rubric.id === "line"), false);
assert.equal(oloid.rubrics.find((rubric) => rubric.id === "atmosphere")?.weight, 0);
assert.equal(oloid.rubrics.find((rubric) => rubric.id === "line")?.id, "line");

assert.equal(pickLeastRecent(pool, {}).id, "backstage");
assert.equal(pickLeastRecent(pool, { backstage: "2026-10-24T17:00:00.000Z" }).id, "detail");
assert.equal(
  pickLeastRecent(pool, {
    backstage: "2026-10-24T17:00:00.000Z",
    detail: "2026-10-25T17:00:00.000Z",
    ask: "2026-10-20T17:00:00.000Z",
  }).id,
  "petersburg",
);

for (const [count, quiet] of [
  [0, false],
  [1, false],
  [2, true],
  [3, false],
  [5, true],
] as const) {
  assert.equal(regularPostIsQuiet(count), quiet, String(count));
}

assert.equal(oloidSlotTone(10), "morning");
assert.equal(oloidSlotTone(15), "day");
assert.equal(oloidSlotTone(20), "evening");

assert.equal(matchingDateHook("2026-10-31", [])?.id, "halloween");
assert.equal(matchingDateHook("2026-11-04", [])?.id, "unity-day");
assert.equal(matchingDateHook("2026-11-17", []), null);
assert.equal(matchingDateHook("2026-11-18", [])?.id, "first-snow");
assert.equal(matchingDateHook("2026-11-24", [])?.id, "first-snow");
assert.equal(matchingDateHook("2026-11-25", []), null);
assert.equal(matchingDateHook("2026-12-31", [])?.id, "new-year-eve");
assert.equal(matchingDateHook("2026-10-31", ["halloween"]), null);
assert.deepEqual(
  usedDateHookIds("2026-10-31", { halloween: "2026-10-31" }, [{ dateHook: "unity-day", at: "2025-11-04T17:00:00.000Z" }]),
  ["halloween"],
);
assert.equal(OLOID_DATE_HOOKS.length, 4);

assert.equal(pollOptionsProblem(["двор", "кухня"]), null);
assert.equal(pollOptionsProblem(["а", "б"]), null);
assert.equal(pollOptionsProblem(["игра", "б".repeat(12)]), null);
assert.ok(pollOptionsProblem(["только один"]));
assert.ok(pollOptionsProblem(["двор", "а".repeat(26)]));
assert.ok(pollOptionsProblem(["двор", "б".repeat(13)]));
assert.ok(pollOptionsProblem(["двор", "2018"]));
assert.ok(pollOptionsProblem(["хоррор", "мистика"]));
assert.ok(pollOptionsProblem(["шпатель", "рука"]));

const voice = OLOID_DEV_NUMBER_FACTS.find((fact) => fact.id === "voice-839");
assert.ok(voice);
assert.equal(devNumberProblem("сейчас 839 файлов", voice.text), null);
assert.ok(devNumberProblem("в игре 94 точки перехода", voice.text));
assert.ok(devNumberProblem("прохождение 2–3 часа", voice.text));
assert.ok(devNumberProblem("цена 199", voice.text));
assert.ok(devNumberProblem("около 1600 реплик и 839 файлов", voice.text));
assert.ok(devNumberProblem("просто про звук", voice.text));
assert.deepEqual(numberTokens("версия 0.9.28 и 27,5"), ["0.9.28", "27.5"]);

const recentTrailer: HistoryItem = {
  project: "oloid",
  channel: "oloid",
  rubric: "trailer",
  text: "тизер вышел",
  at: new Date(evening.getTime() - 24 * 60 * 60 * 1000).toISOString(),
};
const oldTrailer: HistoryItem = { ...recentTrailer, at: new Date(evening.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() };
assert.equal(pickRubric(oloid, [], new Date("2026-10-31T07:00:00.000Z"), undefined, [], null, false, null).id, "appstore");
assert.equal(pickRubric(oloid, [], new Date("2026-10-24T12:00:00.000Z"), undefined, [], day, false, null).id, "vkplay");
assert.equal(pickRubric(oloid, [], evening, undefined, [], day, false, null).id, "vkplay");
assert.equal(pickRubric(oloid, [recentTrailer], evening, undefined, [recentTrailer], day, false, day).id, "backstage");
assert.equal(pickRubric(oloid, [oldTrailer], evening, undefined, [oldTrailer], day, false, day).id, "trailer");
assert.equal(
  pickRubric(oloid, [oldTrailer], new Date("2026-10-31T17:00:00.000Z"), undefined, [oldTrailer], "2026-10-31", false, "2026-10-31", {
    preferRegular: true,
  }).id,
  "backstage",
);

const slot1730 = new Date("2026-10-26T14:30:00.000Z"); // 17:30 МСК
const day1730 = "2026-10-26";
assert.equal(pickRubric(oloid, [], slot1730, undefined, [], day1730, false, day1730, undefined, null).id, "provocation");
assert.equal(pickRubric(oloid, [], slot1730, undefined, [], day1730, false, null).id, "vkplay");
assert.equal(pickRubric(oloid, [], slot1730, undefined, [], null, false, day1730).id, "appstore");
assert.equal(pickRubric(oloid, [], new Date("2026-10-26T16:59:00.000Z"), undefined, [], day1730, false, day1730, undefined, null).id, "provocation");
const freshTrailer: HistoryItem = { ...recentTrailer, at: "2026-10-26T12:00:00.000Z" };
assert.equal(pickRubric(oloid, [], new Date("2026-10-26T17:00:00.000Z"), undefined, [], day1730, false, day1730, undefined, null).id, "trailer");
assert.equal(pickRubric(oloid, [freshTrailer], new Date("2026-10-26T17:00:00.000Z"), undefined, [freshTrailer], day1730, false, day1730, undefined, null).id, "backstage");
assert.equal(pickRubric(oloid, [freshTrailer], slot1730, undefined, [freshTrailer], day1730, false, day1730, undefined, day1730).id, "backstage");
assert.equal(
  pickRubric(oloid, [oldTrailer], slot1730, undefined, [oldTrailer], day1730, false, day1730, { preferRegular: true }, null).id,
  "provocation",
);
assert.equal(pickLeastRecent(OLOID_PROVOCATION_FORMATS, {}).id, "opinion");
assert.equal(pickLeastRecent(OLOID_PROVOCATION_FORMATS, { opinion: "2026-10-26T14:30:00.000Z" }).id, "side");
assert.equal(provocationWantsPoll(0), true);
assert.equal(provocationWantsPoll(1), false);
assert.equal(provocationWantsPoll(2), true);
assert.equal(provocationHasLink(0), false);
assert.equal(provocationHasLink(1), true);
assert.equal(provocationHasLink(2), false);
assert.equal(provocationLexiconProblem("выбор стороны и Вера на кухне"), null);
assert.equal(provocationLexiconProblem("богатый двор и неграмотный ход"), null);
assert.equal(provocationLexiconProblem("хачапури и хохлома"), null);
assert.ok(provocationLexiconProblem("это уже политика"));
assert.ok(provocationLexiconProblem("это религия"));
assert.ok(provocationLexiconProblem("вы идиоты"));
assert.equal(pollOptionsProblem(["игра", "книга"]), null);
assert.ok(provocationLexiconProblem("церковь\nдвор"));

assert.equal(lowercaseSentenceStarts("Следак в титрах"), "Следак в титрах");
assert.equal(lowercaseSentenceStarts("ИИ использовался как инструмент"), "ИИ использовался как инструмент");
assert.equal(lowercaseSentenceStarts("ии использовался как инструмент"), "ИИ использовался как инструмент");
assert.equal(rotationSafetyProblem("ИИ использовался как инструмент, и всё", "backstage"), null);
assert.ok(rotationSafetyProblem("это хоррор", "backstage"));
assert.equal(rotationSafetyProblem("это хоррор", "vkplay"), null);

const shownFiles = shownAssetFiles();
const shownBlob = shownFiles.flatMap((asset) => [asset.id, ...asset.files]).join("\n");
for (const word of ["06_tayna", "04_03_psych", "03_oloid", "04_gameplay", "05_zakulise", "01_03_choice", "02_04_tool", "tayna_oloida"]) {
  assert.equal(shownBlob.includes(word), false, word);
}
for (const asset of shownFiles) {
  const carousel = asset.files.filter((file) => file.endsWith(".jpg"));
  if (asset.files[0].endsWith(".mp4")) assert.equal(asset.files.length, 1);
  else assert.ok(carousel.length >= 2 && carousel.length <= 4, asset.id);
  for (const file of asset.files) assert.equal(existsSync(join("public/media/oloid", file)), true, file);
}
assert.equal(existsSync("public/media/oloid/videos/01_teaser_atmosfera.mp4"), true);
assert.equal(shownBlob.includes("01_teaser"), false);
assert.equal(existsSync("public/media/oloid/carousels/06_tayna_oloida"), false);
assert.equal(existsSync("public/media/oloid/carousels/03_personazhi/04_03_psych.jpg"), false);
assert.equal(existsSync("public/media/oloid/videos/03_oloid_animaciya.mp4"), false);
assert.equal(pickRegularShown("dev-numbers", "839 файлов", {}), null);
assert.equal(pickRegularShown("trailer", "тизер", {}), null);
assert.equal(pickRegularShown("appstore", "App Store", {}), null);
assert.equal(pickRegularShown("ask", "Как вам ближе такая история: в наушниках", {}), null);
const yard = pickRegularShown("petersburg", "Двор-колодец доходного дома", {});
assert.ok(yard && (yard.id === "01_piter_mesta" || yard.id === "video-02-lokacii"));
assert.equal(pickRegularShown("petersburg", "Конюшенная и фан-зона 2018 года", {})?.id, "05_atmosfera_2018");
assert.equal(pickRegularShown("backstage", "Почему мини-игра протяжкой, а не кликом", {})?.id, "04_vybory_minigry");
assert.equal(pickRegularShown("backstage", "одна акустическая гитара. ни одного другого инструмента. и этого хватило, чтобы стало не по себе", {})?.id, "video-06-den");
assert.equal(
  pickRegularShown("petersburg", "Двор-колодец доходного дома", { "01_piter_mesta": "2026-10-02T00:00:00.000Z", "video-02-lokacii": "2026-10-01T00:00:00.000Z" })?.id,
  "video-02-lokacii",
);
const fan = pickRegularShown("petersburg", "Конюшенная и фан-зона 2018 года", {});
assert.equal(fan?.media.type, "CAROUSEL");
assert.equal(fan?.media.urls?.length, 4);

const backstage = oloid.rubrics.find((rubric) => rubric.id === "backstage");
const ask = oloid.rubrics.find((rubric) => rubric.id === "ask");
const numbers = oloid.rubrics.find((rubric) => rubric.id === "dev-numbers");
assert.ok(backstage && ask && numbers);

const link = (rubricId: string) => oloid.link(evening, `oloid-${rubricId}`);
const backstageText = `ходили на экскурсии по петербургским коммуналкам — иначе двор в «Олоиде» был бы из головы.

саундтрек — сольная акустическая гитара, и вечером это слушается в наушниках.

а ваш старый дом чем гудит, когда все уже дома?

${link("backstage")}`;
const quietText = `кухня в коммуналке собирает всех сильнее гостиной: две плиты, клеёнка, и разговор сам заводится.

а у вас где дом говорит громче — на кухне или в коридоре?`;
const numbersText = `озвучки в «Олоиде» набралось 839 файлов.

Егор — 431, Вера — 153, Алик — 132. Следователь — 77, Федя — 39, Старушка — 6, и ещё один файл толпы.

вечером это лучше слушать в наушниках.

${link("dev-numbers")}`;

assert.equal(ruleCheck(backstageText, oloid, evening, backstage, "oloid-backstage"), null);
assert.ok(ruleCheck(backstageText, oloid, evening, backstage, "oloid-backstage", undefined, true));
assert.equal(ruleCheck(quietText, oloid, evening, ask, "oloid-ask", undefined, true), null);
assert.ok(ruleCheck(quietText, oloid, evening, ask, "oloid-ask"));
assert.equal(ruleCheck(numbersText, oloid, evening, numbers, "oloid-dev-numbers", undefined, false, voice.text), null);
assert.ok(ruleCheck(`${numbersText}\n\nещё 1600 реплик`, oloid, evening, numbers, "oloid-dev-numbers", undefined, false, voice.text));
assert.ok(backstageText.length <= 450 && quietText.length <= 450 && numbersText.length <= 450);

const provocation = oloid.rubrics.find((rubric) => rubric.id === "provocation");
assert.ok(provocation);
assert.equal(provocation.weight, 0);
assert.equal(oloid.thirdDailyRubric, "provocation");
const provocationFacts = factsFor(oloid, slot1730, "provocation").join("\n");
assert.equal(provocationFacts.includes("199 ₽"), false);
const hotText = `визуальные новеллы — это не игры? мы так не думаем.

когда текста больше, чем кликов, спор в комментариях обычно интереснее вердикта.

а вы где ставите границу жанра?`;
const hotLink = oloid.link(slot1730, "provocation-opinion");
const hotLinked = `${hotText}\n\n${hotLink}`;
assert.equal(ruleCheck(hotText, oloid, slot1730, provocation, "provocation-opinion", undefined, true), null);
assert.ok(ruleCheck(hotText, oloid, slot1730, provocation, "provocation-opinion"));
assert.equal(ruleCheck(hotLinked, oloid, slot1730, provocation, "provocation-opinion"), null);
assert.ok(hotLink.includes("utm_content=provocation-opinion"));
assert.ok(ruleCheck(`${hotText}\n\nэто уже политика`, oloid, slot1730, provocation, "provocation-opinion", undefined, true));
assert.ok(ruleCheck(`${hotText}\n\nтут замешан бог`, oloid, slot1730, provocation, "provocation-opinion", undefined, true));
assert.ok(ruleCheck(`${hotText}\n\nвы идиоты`, oloid, slot1730, provocation, "provocation-opinion", undefined, true));
assert.ok(ruleCheck(`${hotText}\n\nэто хоррор`, oloid, slot1730, provocation, "provocation-opinion", undefined, true));
assert.ok(ruleCheck(`${hotText}\n\nскачай и поиграй`, oloid, slot1730, provocation, "provocation-opinion", undefined, true));
assert.ok(ruleCheck(`${hotLinked}\n\nhttps://example.com`, oloid, slot1730, provocation, "provocation-opinion"));
assert.equal(provocationNumberProblem("сейчас просто спор про жанр", provocationFacts), null);
assert.equal(provocationNumberProblem("спор про Петербург 2018 года", provocationFacts), null);
assert.ok(provocationNumberProblem("у нас 839 файлов озвучки", provocationFacts));
assert.ok(provocationNumberProblem("цена 199 рублей", provocationFacts));
assert.ok(provocationNumberProblem("прохождение 2–3 часа", provocationFacts));
assert.ok(repeatedEnding(hotText, [{ project: "oloid", rubric: "provocation", text: hotText, at: slot1730.toISOString() }], "oloid"));
assert.equal(
  repeatedEnding(
    hotText.replace("а вы где ставите границу жанра?", "вам ближе книга или всё-таки игра?"),
    [{ project: "oloid", rubric: "ask", text: hotText, at: slot1730.toISOString() }],
    "oloid",
  ),
  null,
);
assert.ok(hotText.length <= 450 && hotLinked.length <= 450);

const retired = OLOID_APP_STORE_RETIRED_CODES as readonly string[];
const codes = OLOID_APP_STORE_CODES as readonly string[];
const handed = ["LLLF94NXL73X", "FE7PNKXL4ET3", "WANF433KARPF", "3LY4TJJP34EM", "FRLW7XWWLN7N", "PLMF7ETTPWML", "APYAN4E4FRNH"];
assert.equal(OLOID_APP_STORE_PROMO_FROM, "2026-10-27");
assert.equal(OLOID_APP_STORE_PROMO_UNTIL, "2027-03-31");
assert.equal(codes.length, 110);
assert.equal(retired.length, 17);
assert.equal(new Set(codes).size, codes.length);
assert.deepEqual(codes.slice(0, 10), retired.slice(0, 10));
assert.deepEqual(codes.slice(10, 17), handed);
assert.equal(codes[17], "4N76T3WPKRYN");
assert.equal(codes.at(-1), "NFEL377WMJE6");
for (const code of codes) assert.match(code, /^[A-Z0-9]{12}$/, code);
for (const code of retired) assert.equal(codes.includes(code), true, code);
for (const code of handed) assert.equal(retired.includes(code), true, code);

const spentEmpty = spentAppStoreCodes([], []);
assert.deepEqual(spentEmpty, [...retired]);
assert.equal(nextAppStoreCode([]), "4N76T3WPKRYN");
assert.equal(nextAppStoreCode(spentEmpty), "4N76T3WPKRYN");
assert.equal(codes.length - spentEmpty.length - 1, 92);
assert.equal(nextAppStoreCode(spentAppStoreCodes(["4n76t3wpkryn"], [])), "9EWN4JPRHXHW");
assert.equal(nextAppStoreCode(spentAppStoreCodes([], [{ project: "oloid", text: "код 4N76T3WPKRYN" }])), "9EWN4JPRHXHW");
assert.equal(nextAppStoreCode(spentAppStoreCodes([], [{ project: "buro", text: "4N76T3WPKRYN" }])), "4N76T3WPKRYN");
assert.equal(nextAppStoreCode(codes), null);
for (const code of retired) assert.notEqual(nextAppStoreCode([]), code);
assert.equal(redactAppStoreCodes("старый LW7EJRNPWFKF и ручной LLLF94NXL73X"), "старый [код] и ручной [код]");
assert.equal(oloidRedeemUrl("4N76T3WPKRYN"), "https://apps.apple.com/redeem?code=4N76T3WPKRYN");

const morning26 = new Date("2026-10-26T07:00:00.000Z"); // 10:00 МСК, раздачи ещё нет
const morning27 = new Date("2026-10-27T07:00:00.000Z"); // 10:00 МСК, первый день
const lastPromoDay = new Date("2027-03-31T20:59:00.000Z"); // 23:59 МСК
const afterPromo = new Date("2027-03-31T21:00:00.000Z"); // 00:00 МСК 1 апреля
assert.equal(appStorePromoOpen(morning26), false);
assert.equal(appStorePromoOpen(morning27), true);
assert.equal(appStorePromoOpen(lastPromoDay), true);
assert.equal(appStorePromoOpen(afterPromo), false);
assert.equal(pickRubric(oloid, [], morning26, undefined, [], null, appStorePromoOpen(morning26) && nextAppStoreCode(spentEmpty) != null, null).id, "appstore");
assert.equal(pickRubric(oloid, [], morning27, undefined, [], null, true, null).id, "appstore-promo");
assert.equal(pickRubric(oloid, [], morning27, undefined, [], null, false, null).id, "appstore");

const slot15 = new Date("2026-10-27T12:00:00.000Z"); // 15:00 МСК
const slot1730next = new Date("2026-10-27T14:30:00.000Z"); // 17:30 МСК
const evening27 = new Date("2026-10-27T17:00:00.000Z"); // 20:00 МСК
assert.equal(pickRubric(oloid, [], slot15, undefined, [], "2026-10-27", true, null).id, "vkplay");
assert.equal(pickRubric(oloid, [], slot15, undefined, [], null, true, null).id, "appstore-promo");
assert.equal(pickRubric(oloid, [], slot1730next, undefined, [], null, true, null).id, "appstore-promo");
assert.equal(pickRubric(oloid, [], slot1730next, undefined, [], "2026-10-27", true, null).id, "vkplay");
assert.equal(pickRubric(oloid, [], slot1730next, undefined, [], "2026-10-27", true, "2026-10-27", undefined, null).id, "provocation");
assert.equal(pickRubric(oloid, [], evening27, undefined, [], "2026-10-27", true, "2026-10-27", undefined, "2026-10-27").id, "trailer");

const promoRubric = oloid.rubrics.find((rubric) => rubric.id === "appstore-promo");
assert.ok(promoRubric);
const promoPicture = pickPicture(oloid, promoRubric, "код на бесплатную загрузку", []);
assert.ok(promoPicture);
assert.equal(oloid.appStorePictures?.some((picture) => picture.url === promoPicture.url), true);
assert.equal(oloid.pictures?.some((picture) => picture.url === promoPicture.url), false);
assert.equal(oloid.vkPlayPictures?.some((picture) => picture.url === promoPicture.url), false);
const promoCode = "4N76T3WPKRYN";
const promoText = `в наушниках коммуналка звучит ближе.\n\n${promoCode}\n\nбесплатная одноразовая загрузка: код забирает первый. нажатие на ссылку подставит его в App Store. скачайте, поиграйте и напишите пару слов.\n\n${oloidRedeemUrl(promoCode)}`;
assert.equal(appStoreCodeProblem(promoText, "oloid", "appstore-promo", promoCode), null);
assert.equal(appStorePriceProblem(promoText, "oloid", "appstore-promo"), null);
assert.equal(appStoreMomentProblem(promoText, "oloid", "appstore-promo"), null);
assert.ok(appStorePriceProblem(`${promoText}\n\nцена 199`, "oloid", "appstore-promo"));
assert.ok(appStoreMomentProblem(`${promoText}\n\nэто эксклюзив App Store`, "oloid", "appstore-promo"));
assert.equal(appStoreCodeProblem(`просто утро\n\n${promoCode}`, "oloid", "appstore"), `промокод ${promoCode} в этом посте не нужен — убери его`);

const cronSrc = readFileSync(new URL("../api/cron.ts", import.meta.url), "utf8");
const previewSrc = readFileSync(new URL("../api/preview.ts", import.meta.url), "utf8");
assert.equal(previewSrc.includes("markAppStoreCodeUsed"), false);
const dryIdx = cronSrc.indexOf("if (dry)");
const publishIdx = cronSrc.indexOf("const postId = await publishPost");
const markIdx = cronSrc.indexOf("if (promoCode) await markAppStoreCodeUsed");
const dayIdx = cronSrc.indexOf("if (project.dailyRubric && appStoreSlot) await setAppStoreDay");
assert.ok(dryIdx > 0 && publishIdx > dryIdx && dayIdx > publishIdx && markIdx > dayIdx);
assert.equal(cronSrc.slice(0, publishIdx).includes("await markAppStoreCodeUsed"), false);
assert.match(cronSrc, /const appStoreSlot = rubricId === OLOID_APP_STORE_RUBRIC \|\| rubricId === OLOID_APP_STORE_PROMO_RUBRIC/);
assert.ok(cronSrc.includes("pollError"));

const factBlob = oloid.facts.join("\n");
assert.equal(/шпател/iu.test(factBlob), false);
assert.equal(/гвозд/iu.test(factBlob), false);
assert.equal(/шпател|гвозд/iu.test(OLOID_DEV_NUMBER_FACTS.map((fact) => `${fact.label}\n${fact.text}`).join("\n")), false);
assert.equal(
  /шпател|гвозд/iu.test(oloid.rubrics.map((rubric) => `${rubric.brief}\n${(rubric.topics ?? []).join("\n")}`).join("\n")),
  false,
);
assert.equal(spatulaProblem("вытаскиваешь гвозди шпателем"), "шпатель не упоминать");
assert.equal(spatulaProblem("движение руки, не клик"), null);
assert.equal(ruleCheck("тут шпатель.", oloid, evening, backstage, "oloid-backstage"), "шпатель не упоминать");
for (const bad of [
  "шаги за стеной",
  "звук шагов",
  "шесть видов шагов",
  "шаги по паркету",
  "как шаг",
  "звук — половина игры",
  "звук - половина работы",
  "звук делает половину игры",
  "половина работы в игре сделана звуком",
  "атмосфера и звук — половина работы",
  "звуки за стеной",
  "музыку написал TLENUM",
]) {
  assert.ok(tiredOloidCopyProblem(bad), bad);
  assert.ok(ruleCheck(`${bad}\n\n${link("backstage")}`, oloid, evening, backstage, "oloid-backstage"), bad);
}
for (const ok of [
  "человек шагнул к нам",
  "сольная акустическая гитара",
  "гитара, которая звучит у вас в голове ещё долго",
  "92 звуковых эффекта",
  "пять звуков дверей",
  "играть лучше в наушниках",
]) {
  assert.equal(tiredOloidCopyProblem(ok), null, ok);
}
assert.equal(pollOptionsProblem(["шаги", "дверь"]), "опрос: шаги не упоминать");
const memory = `семья, время и одна старая квартира, которая помнит больше, чем все её жильцы.\n\n${link("backstage")}`;
assert.equal(ruleCheck(memory, oloid, evening, backstage, "oloid-backstage"), null);
assert.ok(ruleCheck(`эта комната хранит больше, чем кажется.\n\n${link("backstage")}`, oloid, evening, backstage, "oloid-backstage"));
assert.equal(/половин/iu.test(factBlob), false);
assert.equal(tiredOloidCopyProblem(factBlob), null);
assert.equal(tiredOloidCopyProblem(oloid.rubrics.map((rubric) => `${rubric.brief}\n${(rubric.topics ?? []).join("\n")}`).join("\n")), null);
assert.equal(tiredOloidCopyProblem(OLOID_DEV_NUMBER_FACTS.map((fact) => fact.text).join("\n")), null);
const aboutTopics = oloid.rubrics.find((rubric) => rubric.id === "about")?.topics ?? [];
for (const hook of OLOID_COPY_HOOKS) assert.ok(aboutTopics.includes(hook.line), hook.id);
assert.equal(copyHooksFor("backstage").length, OLOID_COPY_HOOKS.length);
assert.equal(copyHooksFor("provocation").length, 0);
assert.equal(copyHooksFor("appstore").length, 0);
assert.equal(copyClosingsFor("appstore").length, 2);
assert.equal(copyClosingsFor("appstore-promo").length, 0);
assert.equal(copyClosingsFor("dev").some((line) => line.id === "outro-hours"), false);
assert.equal(pickOloidCopyLine(OLOID_COPY_HOOKS, [], "copyHook")?.id, "deep-plot");
assert.equal(
  pickOloidCopyLine(OLOID_COPY_HOOKS, [{ project: "oloid", rubric: "ask", text: "x", at: "2026-11-01T00:00:00.000Z", copyHook: "deep-plot" }], "copyHook")?.id,
  "guitar",
);
const passport = factsFor(oloid, slot1730, "backstage");
const guitarLine = OLOID_COPY_HOOKS.find((hook) => hook.id === "guitar")!.line;
assert.ok(oloidPromptFacts(passport, [], slot1730, { rubricId: "backstage", topic: guitarLine }).ids.includes("solo-guitar"));
assert.ok(oloidPromptFacts(passport, [], slot1730, { rubricId: "ask", topic: "садишься на полчаса, а встаёшь через три. мы предупредили" }).ids.includes("playtime"));
for (const spec of OLOID_ROTATING_FACTS) {
  assert.equal(passport.filter((fact) => fact.includes(spec.needle)).length, 1, spec.id);
}
for (const fact of passport) {
  assert.ok(OLOID_ROTATING_FACTS.filter((spec) => fact.includes(spec.needle)).length <= 1, fact.slice(0, 48));
}
const rotatingInOrder = passport.filter((fact) => OLOID_ROTATING_FACTS.some((spec) => fact.includes(spec.needle)));
const freshPack = oloidPromptFacts(passport, [], slot1730, { rubricId: "backstage", random: () => 0 });
assert.deepEqual(freshPack.color, rotatingInOrder.slice(0, OLOID_COLOR_FACTS_PER_POST));
assert.ok(freshPack.facts.some((fact) => fact.includes("Санкт-Петербурге")));
for (const fact of freshPack.color) assert.ok(freshPack.facts.includes(fact));

const cooledTable: HistoryItem = {
  project: "oloid",
  rubric: "detail",
  text: "мини-игра: стол рывками",
  at: new Date(slot1730.getTime() - 24 * 60 * 60 * 1000).toISOString(),
};
const cooledPack = oloidPromptFacts(passport, [cooledTable], slot1730, { rubricId: "appstore", random: () => 0 });
assert.equal(cooledPack.color.some((fact) => fact.includes("стол рывками")), false);
assert.deepEqual(cooledPack.color, [...rotatingInOrder.slice(1, OLOID_COLOR_FACTS_PER_POST), rotatingInOrder[OLOID_COLOR_FACTS_PER_POST]]);

const musicianFact = passport.find((fact) => fact.includes("профессиональный музыкант"));
const cityFact = passport.find((fact) => fact.includes("Санкт-Петербурге"));
assert.ok(musicianFact && cityFact);
const exactly = new Date(slot1730.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
const inside = new Date(slot1730.getTime() - 3 * 24 * 60 * 60 * 1000 + 60 * 1000).toISOString();
const dueMusician = oloidPromptFacts([cityFact, musicianFact], [{ project: "oloid", rubric: "backstage", text: "музыкант", at: exactly }], slot1730, {
  rubricId: "backstage",
});
const earlyMusician = oloidPromptFacts([cityFact, musicianFact], [{ project: "oloid", rubric: "backstage", text: "музыкант", at: inside }], slot1730, {
  rubricId: "vkplay",
});
assert.ok(dueMusician.color.some((fact) => fact.includes("музыкант")));
assert.equal(earlyMusician.color.some((fact) => fact.includes("музыкант")), false);
const playtimeFact = passport.find((fact) => fact.includes("2–3 часов"));
assert.ok(playtimeFact);
assert.deepEqual(oloidPromptFacts([cityFact, playtimeFact], [], slot1730, { rubricId: "provocation" }).color, []);
assert.ok(oloidPromptFacts([cityFact, playtimeFact], [], slot1730, { rubricId: "vkplay" }).color.some((fact) => fact.includes("2–3 часов")));
assert.ok(oloidRepeatProblem("снова музыкант", [{ project: "oloid", rubric: "backstage", text: "музыкант играл", at: inside }], slot1730));
assert.equal(oloidRepeatProblem("снова музыкант", [{ project: "oloid", rubric: "backstage", text: "музыкант играл", at: exactly }], slot1730), null);

for (const rubricId of ["appstore", "vkplay", "provocation"] as const) {
  const pack = oloidPromptFacts(factsFor(oloid, slot1730, rubricId), [], slot1730, { rubricId });
  assert.equal(pack.color.length, OLOID_COLOR_FACTS_PER_POST, rubricId);
  assert.equal(pack.facts.some((fact) => /(?<!\d)500(?!\d)/.test(fact)), false, rubricId);
}
const numberPack = oloidPromptFacts(factsFor(oloid, slot1730, "dev-numbers"), [], slot1730, { rubricId: "dev-numbers" });
assert.deepEqual(numberPack.color, []);
assert.equal(numberPack.facts.some((fact) => fact.includes("1600 реплик")), false);
assert.ok(numberPack.facts.some((fact) => fact.includes("Санкт-Петербурге")));

const fillers: HistoryItem[] = Array.from({ length: 10 }, (_, i) => ({
  project: "oloid",
  rubric: "ask",
  text: "тишина на лестнице",
  at: new Date(slot1730.getTime() - i * 60 * 60 * 1000).toISOString(),
}));
const oldCloth: HistoryItem = { project: "oloid", rubric: "detail", text: "на кухне клеёнка", at: "2026-09-01T12:00:00.000Z" };
assert.equal(repeatedDetailProblem("опять клеёнка", [...fillers, oldCloth]), null);
assert.ok(repeatedDetailProblem("клеёнка никуда не делась", [oldCloth, ...fillers.slice(0, 9)]));
assert.equal(oloidRepeatProblem("просто мистическая новелла", fillers, slot1730), null);
assert.ok(topicRepeatsRecent("Фанера, которую тянут рукой", [{ project: "oloid", rubric: "detail", text: "лист фанеры", at: cooledTable.at }], slot1730));
assert.equal(topicRepeatsRecent("одна акустическая гитара. ни одного другого инструмента. и этого хватило, чтобы стало не по себе", fillers, slot1730), false);

const steps = containerSteps("Геймдев", pollAttachmentField({ option_a: "игра", option_b: "книга" }));
assert.equal(steps.length, 4);
assert.equal(typeof steps[0].extra.poll_attachment, "string");
assert.equal(steps[0].extra.topic_tag, "Геймдев");
assert.equal(steps[0].dropsPoll, false);
assert.equal("topic_tag" in steps[1].extra, false);
assert.equal("poll_attachment" in steps[1].extra, true);
assert.equal(steps[1].dropsPoll, false);
assert.equal(steps[2].dropsPoll, true);
assert.equal(steps[2].extra.topic_tag, "Геймдев");
assert.equal("poll_attachment" in steps[2].extra, false);
assert.deepEqual(steps[3].extra, {});
assert.equal(steps[3].dropsPoll, true);
assert.deepEqual(JSON.parse(pollAttachmentField({ option_a: "игра", option_b: "книга" })), { option_a: "игра", option_b: "книга" });
const fourOptions = JSON.parse(pollAttachmentField({ option_a: "а", option_b: "б", option_c: "в", option_d: "г" })) as Record<string, string>;
assert.deepEqual(Object.keys(fourOptions), ["option_a", "option_b", "option_c", "option_d"]);
assert.equal(briefThreadsError(new Error("Threads /me/threads: Param poll_attachment must be a valid JSON (#100/33)")).includes("poll_attachment"), true);
assert.equal(briefThreadsError(new Error("x".repeat(400))).length, 220);

const editorialPack = oloidPromptFacts(factsFor(oloid, evening, "diary"), [], evening, { rubricId: "diary" });
assert.deepEqual(editorialPack.color, []);
assert.deepEqual(editorialPack.ids, []);
assert.equal(editorialPack.facts.some((fact) => fact.includes("199 ₽")), true);

const recentStamp = "2026-10-24T17:00:00.000Z";
const olderRubrics = {
  backstage: recentStamp,
  detail: recentStamp,
  ask: recentStamp,
  petersburg: recentStamp,
  "dev-numbers": recentStamp,
  frame: recentStamp,
  review: recentStamp,
};
assert.equal(pickRubric(oloid, [recentTrailer], evening, undefined, [recentTrailer], day, false, day, { lastUsed: olderRubrics }).id, "diary");
const cooledDiary: HistoryItem = {
  project: "oloid",
  rubric: "diary",
  editorialId: "vera-face-older",
  text: "лицо веры",
  at: new Date(evening.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};
assert.equal(
  pickRubric(oloid, [recentTrailer, cooledDiary], evening, undefined, [recentTrailer, cooledDiary], day, false, day, {
    lastUsed: { ...olderRubrics, diary: "2020-01-01T00:00:00.000Z" },
  }).id,
  "backstage",
);
const restedDiary: HistoryItem = { ...cooledDiary, at: new Date(evening.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() };
assert.equal(
  pickRubric(oloid, [recentTrailer, restedDiary], evening, undefined, [recentTrailer, restedDiary], day, false, day, {
    lastUsed: { ...olderRubrics, diary: restedDiary.at },
  }).id,
  "diary",
);
assert.equal(
  pickRubric(oloid, [recentTrailer], evening, undefined, [recentTrailer], day, false, day, {
    lastUsed: { ...olderRubrics, diary: "2020-01-01T00:00:00.000Z" },
    editorial: { diary: [] },
  }).id,
  "backstage",
);
const frameOldest = { ...olderRubrics, frame: "2020-01-01T00:00:00.000Z", diary: recentStamp, review: recentStamp };
assert.equal(pickRubric(oloid, [recentTrailer], evening, undefined, [recentTrailer], day, false, day, { lastUsed: frameOldest }).id, "frame");
assert.equal(
  pickRubric(oloid, [recentTrailer], evening, undefined, [recentTrailer], day, false, day, {
    lastUsed: frameOldest,
    editorial: { fileExists: () => false },
  }).id,
  "backstage",
);
assert.equal(editorialRubricOpen("diary", { now: evening, history: [cooledDiary] }), false);
assert.equal(editorialRubricOpen("review", { now: evening, lastUsed: Object.fromEntries(OLOID_REVIEWS.map((review) => [review.id, recentStamp])) }), false);
assert.equal(pickEditorial("review", { now: evening })?.id, OLOID_REVIEWS[0].id);
assert.equal(pickEditorial("review", { now: evening, lastUsed: { [OLOID_REVIEWS[0].id]: recentStamp } })?.id, OLOID_REVIEWS[1].id);

const oloidChannel = CHANNELS.find((item) => item.id === "oloid");
assert.ok(oloidChannel);
const skippedDiary = await makeDraft({
  channel: oloidChannel,
  history: [],
  lastProject: null,
  forcedProject: "oloid",
  forcedRubric: "diary",
  now: evening,
  editorial: { diary: [] },
});
assert.equal(skippedDiary.text, null);
assert.equal(skippedDiary.skipReason, EDITORIAL_SKIP_REASON.diary);
const skippedFrame = await makeDraft({
  channel: oloidChannel,
  history: [],
  lastProject: null,
  forcedProject: "oloid",
  forcedRubric: "frame",
  now: evening,
  editorial: { fileExists: () => false },
});
assert.equal(skippedFrame.text, null);
assert.equal(skippedFrame.skipReason, EDITORIAL_SKIP_REASON.frame);

const diary = OLOID_DIARY_ENTRIES[0];
assert.equal(OLOID_DIARY_ENTRIES.length, 1);
const diaryText = `лицо Веры перерисовали после отзыва «${diary.quote}».

сделали старше, мимику оставили.

а вам ближе строгое лицо или живое?

${oloid.link(evening, "oloid-diary")}`;
assert.equal(diaryProblem(diaryText, diary), null);
assert.ok(diaryProblem(diaryText.replace("мимику оставили", "характер оставили"), diary));
assert.ok(diaryProblem(diaryText.replace(`«${diary.quote}»`, "«выглядит молодо»"), diary));
assert.ok(diaryProblem(`${diaryText}\n\nтак написал тестер`, diary));
assert.ok(diaryProblem(`${diaryText}\n\nэто уже второй эпизод`, diary));
assert.ok(diaryProblem(`${diaryText}\n\n«а давай переделаем»`, diary));
assert.ok(diaryProblem(`${diaryText}\n\nэто было в 2024`, diary));
assert.ok(diaryProblem(`${diaryText}\n\nлицо собрал ИИ`, diary));
assert.equal(ruleCheck(diaryText, oloid, evening, oloid.rubrics.find((rubric) => rubric.id === "diary"), "oloid-diary"), null);
assert.ok(diary.image);
assert.equal(existsSync(join("public/media/oloid", diary.image.file)), true);
assert.equal(diaryMedia(diary, () => false), undefined);
assert.ok(diaryMedia(diary)?.url.endsWith(diary.image.file));

for (const source of OLOID_FRAME_SOURCES) {
  assert.equal(existsSync(join("public/media/oloid", source.file)), true, source.file);
  const media = frameMedia(source);
  assert.equal(media.type, "IMAGE");
  assert.equal(framePairProblem(media, source), null, source.id);
  assert.ok(framePairProblem({ type: "IMAGE", url: `${media.url}-other` }, source));
  assert.equal(mayRepublishWithoutMedia("frame", media), false);
}
const courtyard = OLOID_FRAME_SOURCES.find((source) => source.id === "frame-courtyard-2018");
const corridor = OLOID_FRAME_SOURCES.find((source) => source.id === "frame-corridor-day");
const bar = OLOID_FRAME_SOURCES.find((source) => source.id === "frame-bar-v2");
assert.ok(courtyard && corridor && bar);
assert.equal(courtyard.file, "02_dvor_spb_2018.jpg");
assert.notEqual(frameMedia(courtyard).url, frameMedia({ ...courtyard, file: "yard.jpg" }).url);
assert.equal(corridor.file, "corridor-1.jpg");
assert.ok(bar.file.endsWith("01_Loc_2018_bar_v2.jpg"));
assert.equal(frameProblem("у арки стоит велосипед.", courtyard), null);
assert.ok(frameProblem("велосипед, бельё, лужи и облезлая штукатурка.", courtyard));
assert.ok(frameProblem("велосипед стоит у арки: этот двор снят с натуры, это прототип.", courtyard));
assert.ok(frameProblem("велосипед у арки, а адрес — Раздольная, 21.", courtyard));
assert.equal(frameProblem("в коридоре стоит красный пылесос.", corridor), null);
assert.ok(frameProblem("пылесос можно взять в мини-игре.", corridor));
assert.ok(frameProblem("рядом с пылесосом след проекта инвойс.", corridor));
assert.equal(frameProblem("под кирпичным сводом горят лампы.", bar), null);
assert.ok(frameProblem("по телевизору идёт чемпионат.", bar));
assert.ok(frameProblem("под сводом в коридоре стоит пылесос.", bar));
const frameRubric = oloid.rubrics.find((rubric) => rubric.id === "frame");
assert.ok(frameRubric);
const frameText = `у арки стоит велосипед, и двор от этого сразу живой.

а у вашего двора есть такая примета?

${oloid.link(evening, "oloid-frame")}`;
assert.equal(frameProblem(frameText, courtyard), null);
assert.equal(ruleCheck(frameText, oloid, evening, frameRubric, "oloid-frame"), null);
assert.ok(ruleCheck(`${frameText}\n\nи ещё шпатель`, oloid, evening, frameRubric, "oloid-frame"));
assert.ok(rotationSafetyProblem("в игре открыли достижения", "frame"));
assert.ok(appStorePriceProblem("цена 199 ₽", "oloid", "appstore"));
assert.equal(appStorePriceProblem("цена 199 ₽", "oloid", "review"), null);

assert.equal(OLOID_REVIEWS.length, 12);
assert.equal(OLOID_REVIEWS.filter((review) => review.platform === "app-store").length, 8);
assert.equal(OLOID_REVIEWS.filter((review) => review.platform === "vk-play").length, 4);
assert.equal(new Set(OLOID_REVIEWS.map((review) => review.id)).size, OLOID_REVIEWS.length);
assert.equal(new Set(OLOID_REVIEWS.map((review) => review.handle)).size, OLOID_REVIEWS.length);
assert.equal(JSON.stringify(OLOID_REVIEWS).includes("★"), false);
assert.equal(JSON.stringify(OLOID_REVIEWS).includes("Ответ разработчика"), false);
assert.equal(JSON.stringify(OLOID_REVIEWS).includes("выпустим уже в скором времени"), false);
assert.equal(JSON.stringify(OLOID_REVIEWS).includes("Спасибо за вашу оценку"), false);
const reviewRubric = oloid.rubrics.find((rubric) => rubric.id === "review");
assert.ok(reviewRubric);
for (const review of OLOID_REVIEWS) {
  const published = quoteToPublish(review);
  assert.ok(published, review.id);
  assert.equal(review.text.includes(published.text), true, review.id);
  assert.equal(published.excerpt, published.text !== review.text, review.id);
  const reply = "спасибо, что написали.";
  assert.ok(reply.length <= reviewReplyBudget(review, true), `${review.id} budget ${reviewReplyBudget(review, true)}`);
  const post = assembleReviewPost(reply, review, { link: review.sourceUrl });
  assert.ok(post, review.id);
  assert.equal(reviewProblem(post, review), null, `${review.id}: ${reviewProblem(post, review)}`);
  assert.ok(post.includes(published.text), review.id);
  assert.ok(post.includes(review.handle), review.id);
  assert.ok(post.length <= 450, `${review.id} ${post.length}`);
  assert.equal(ruleCheck(post, oloid, evening, reviewRubric, "oloid-review", undefined, false, undefined, review.sourceUrl), null, review.id);
  assert.ok(post.endsWith(review.sourceUrl), review.id);
  assert.equal(post.includes("utm_"), false, review.id);
  if (review.platform === "vk-play") {
    assert.equal(review.sourceUrl, OLOID_VKPLAY_URL, review.id);
    assert.equal(post.includes("apps.apple.com"), false, review.id);
    assert.equal(post.includes("App Store"), false, review.id);
  } else {
    assert.equal(review.appId, "6817809325", review.id);
    assert.equal(review.sourceUrl, OLOID_APP_STORE_URL, review.id);
    assert.equal(review.exportedOn, "2026-10-29", review.id);
    assert.equal(post.includes("vkplay.ru"), false, review.id);
  }
}
const mufasa = OLOID_REVIEWS.find((review) => review.handle === "mufasa093");
const odosinskiy = OLOID_REVIEWS.find((review) => review.handle === "Одосинский");
const solnechny = OLOID_REVIEWS.find((review) => review.handle === "solnechny god");
assert.ok(mufasa && odosinskiy && solnechny);
assert.equal(mufasa.date, "2026-10-23");
assert.equal(solnechny.date, "2026-10-19");
assert.equal(odosinskiy.date, "2026-10-26");
assert.equal(mufasa.id, "review-asc-mufasa093-2026-10-23");
assert.equal(solnechny.id, "review-asc-solnechny-god-2026-10-19");
const mufasaPost = assembleReviewPost("спасибо, что написали.", mufasa, { link: OLOID_APP_STORE_URL });
assert.ok(mufasaPost);
assert.ok(mufasaPost.includes("Олоид - первая"));
assert.equal(mufasaPost.includes("олоид - первая"), false);
assert.ok(mufasaPost.includes("🔥"));
assert.ok(reviewProblem(mufasaPost.replace("Жду", "Ждём"), mufasa));
assert.ok(reviewProblem(mufasaPost.replace("спасибо, что написали.", "второй эпизод выйдет скоро."), mufasa));
const episodeFixed = assembleReviewPost("второй эпизод выйдет скоро.", mufasa, { link: OLOID_APP_STORE_URL });
assert.equal(episodeFixed ? publishedReviewReply(episodeFixed, mufasa) : "", REVIEW_REPLY_FALLBACK);
assert.equal(episodeFixed ? reviewProblem(episodeFixed, mufasa) : "нет поста", null);
assert.ok(reviewProblem(mufasaPost.replace("спасибо", "спасибо ★"), mufasa));
assert.equal(/финал|концовк|развязк|до\s+конца/iu.test(mufasa.text), false);
assert.ok(mufasa.text.includes("ещё три эпизода"));
assert.ok(mufasa.text.includes("Жду с нетерпением"));
assert.equal(reviewProblem(mufasaPost, mufasa), null, "цитата mufasa093: «ещё три эпизода» внутри ёлочек не ответ команды");
assert.equal(rotationSafetyProblem(mufasaPost, "review"), null, "в цитате mufasa093 нет финала и концовки");
const reviewPick = { kind: "review" as const, id: mufasa.id, topic: "Отзыв mufasa093", review: mufasa };
const reviewSteer = editorialSteer(reviewPick);
assert.ok(reviewSteer.includes("дошли до конца"));
assert.ok(reviewSteer.includes("спасибо за такие слова, ради них и делаем игру"));
assert.ok(reviewSteer.includes("спасибо, что поделились впечатлениями"));
assert.ok(/финал/iu.test(reviewSteer) && /концовк/iu.test(reviewSteer));
assert.ok(reviewRubric.brief.includes("дочитал до конца"));
assert.ok(reviewRubric.brief.includes("спасибо, что поделились впечатлениями"));
const reviewFact = editorialFactNote(reviewPick);
assert.ok(reviewFact.includes("дочитал до конца"));
assert.ok(reviewFact.includes("следующие эпизоды"));
assert.ok(reviewFact.includes("Короткую благодарность"));
assert.ok(reviewFact.includes(REVIEW_REPLY_FALLBACK));
assert.ok(reviewFact.includes("додумывает"));
for (const review of OLOID_REVIEWS) {
  const fixed = assembleReviewPost("Спасибо, что дошли до конца и написали об этом…", review, { link: review.sourceUrl });
  assert.ok(fixed, review.id);
  const published = quoteToPublish(review);
  assert.ok(published, review.id);
  assert.ok(fixed.includes(published.text), review.id);
  assert.equal(fixed.includes("дошли до конца"), false, review.id);
  assert.equal(publishedReviewReply(fixed, review), REVIEW_REPLY_FALLBACK, review.id);
  assert.equal(reviewProblem(fixed, review), null, review.id);
  assert.equal(rotationSafetyProblem(fixed, "review"), null, review.id);
  assert.equal(ruleCheck(fixed, oloid, evening, reviewRubric, "oloid-review", undefined, false, undefined, review.sourceUrl), null, review.id);
  assert.ok(fixed.length <= 450, `${review.id} ${fixed.length}`);
}
for (const bad of [
  "спасибо, что дошли до конца и написали об этом.",
  "рад, что доиграли до финала.",
  "спасибо за концовку.",
  "здорово, что дочитали до конца.",
  "вы прошли игру, спасибо.",
  "спасибо, что закончили игру.",
]) {
  const post = assembleReviewPost(bad, mufasa, { link: OLOID_APP_STORE_URL });
  assert.ok(post, bad);
  assert.equal(post.includes(bad), false, bad);
  assert.ok(post.includes(mufasa.text), bad);
  assert.equal(reviewProblem(post, mufasa), null, bad);
  assert.equal(rotationSafetyProblem(post, "review"), null, bad);
}
const keptTail = assembleReviewPost("спасибо, что дошли до конца и написали об этом.\n\nнам важно это читать.", mufasa, { link: OLOID_APP_STORE_URL });
assert.ok(keptTail);
assert.equal(keptTail.includes("нам важно это читать"), false);
assert.equal(publishedReviewReply(keptTail, mufasa), REVIEW_REPLY_FALLBACK);
assert.equal(keptTail.includes("дошли до конца"), false);
const sameLine = assembleReviewPost("спасибо, что дошли до конца. нам важно это читать.", mufasa, { link: OLOID_APP_STORE_URL });
assert.equal(sameLine?.includes("нам важно это читать."), false);
assert.equal(sameLine ? publishedReviewReply(sameLine, mufasa) : "", REVIEW_REPLY_FALLBACK);
assert.equal(sameLine?.includes("дошли до конца"), false);
assert.ok(keptTail.includes(mufasa.text));
assert.equal(reviewProblem(keptTail, mufasa), null);
assert.equal(rotationSafetyProblem(keptTail, "review"), null);
const idiom = assembleReviewPost("в конце концов, спасибо.", mufasa, { link: OLOID_APP_STORE_URL });
assert.ok(idiom?.includes("в конце концов, спасибо."));
const quoteHasEnd = { ...mufasa, id: "review-end-in-quote", text: "дошли до конца, и это было здорово" };
const preserved = assembleReviewPost("спасибо, что написали.", quoteHasEnd, { link: OLOID_APP_STORE_URL });
assert.ok(preserved?.includes("«дошли до конца, и это было здорово»"));
assert.ok(preserved?.includes("спасибо, что написали."));
const strippedQuote = assembleReviewPost("дошли до конца, и это было здорово\n\nспасибо, что дошли до конца.", quoteHasEnd, { link: OLOID_APP_STORE_URL });
assert.ok(strippedQuote?.includes("«дошли до конца, и это было здорово»"));
assert.equal((strippedQuote?.match(/дошли до конца/gu) ?? []).length, 1, "фраза остаётся только в цитате");
const finaleNote = reviewRetryNote("финал и концовку не упоминать");
assert.ok(finaleNote.startsWith("финал и концовку не упоминать"));
assert.ok(finaleNote.includes("спасибо, что поделились впечатлениями"));
assert.ok(finaleNote.includes("дошёл"));
assert.equal(reviewRetryNote("слишком похоже на пост от 2026-11-01"), "слишком похоже на пост от 2026-11-01");
assert.equal(reviewRetryNote("концовка повторяет недавний пост, придумай другую"), "концовка повторяет недавний пост, придумай другую");
assert.ok(reviewRetryNote("намёк на финал: дошли до конца").includes("Цитату и ник не меняй"));
const pastedGood = assembleReviewPost("спасибо, что написали.", odosinskiy, { link: OLOID_APP_STORE_URL });
const pasted = pastedGood?.replace("спасибо, что написали.", "нам написали: Картинка, звук, музыка, сюжет – все. спасибо.");
assert.ok(pasted && reviewProblem(pasted, odosinskiy));
const pastedFixed = assembleReviewPost("нам написали: Картинка, звук, музыка, сюжет – все. спасибо.", odosinskiy, { link: OLOID_APP_STORE_URL });
assert.equal(pastedFixed ? publishedReviewReply(pastedFixed, odosinskiy) : "", REVIEW_REPLY_FALLBACK);
assert.equal(pastedFixed ? reviewProblem(pastedFixed, odosinskiy) : "нет поста", null);
assert.ok(assembleReviewPost("спасибо, что написали.", solnechny, { link: OLOID_APP_STORE_URL })?.includes("развилках \n\nбуду ждать второй эпизод"));
assert.ok(assembleReviewPost("спасибо, что написали.", odosinskiy, { link: OLOID_APP_STORE_URL })?.includes("Одосинский"));
assert.ok(assembleReviewPost("спасибо, что написали.", odosinskiy, { link: OLOID_APP_STORE_URL })?.includes("Ждем второй эпизод"));
const quietReview = assembleReviewPost("спасибо, что написали.", odosinskiy);
assert.ok(quietReview);
assert.equal(quietReview.includes("http"), false);
assert.equal(ruleCheck(quietReview, oloid, evening, reviewRubric, "oloid-review", undefined, true), null);
const excerpt = { ...odosinskiy, id: "review-excerpt", excerpt: "все очень хорошо сделано" };
assert.equal(quoteToPublish(excerpt)?.excerpt, true);
const excerptPost = assembleReviewPost("спасибо, что написали.", excerpt, { link: OLOID_APP_STORE_URL });
assert.ok(excerptPost?.includes("фрагмент отзыва"));
assert.equal(excerptPost ? reviewProblem(excerptPost, excerpt) : "нет поста", null);
assert.ok(excerptPost && reviewProblem(excerptPost.replace("все очень хорошо сделано", "всё очень хорошо"), excerpt));
assert.equal(quoteToPublish({ ...odosinskiy, id: "broken", excerpt: "этой фразы нет в отзыве" }), null);
const morn = OLOID_REVIEWS.find((review) => review.handle === "Mornkalabra");
assert.ok(morn);
const mornQuote = quoteToPublish(morn);
assert.equal(mornQuote?.excerpt, true);
assert.equal(mornQuote?.text, "Проходится на одном дыхании, теперь интересно что будет дальше!");
assert.equal(morn.text.includes(mornQuote?.text ?? ""), true);
assert.equal(mornQuote?.text.includes("нейрослоп"), false);
assert.equal(mornQuote?.text.includes("сейфа"), false);
assert.equal(morn.text.includes("нейрослопа"), true);
const mornPost = assembleReviewPost("спасибо, что написали.", morn, { link: OLOID_APP_STORE_URL });
assert.ok(mornPost);
assert.equal(mornPost.includes("нейрослоп"), false);
assert.equal(mornPost.includes("сейфа"), false);
assert.ok(reviewProblem(`${mornPost}\n\nприятно видеть человеческий труд`, morn));
const mornFixed = assembleReviewPost("приятно видеть человеческий труд", morn, { link: OLOID_APP_STORE_URL });
assert.equal(mornFixed ? publishedReviewReply(mornFixed, morn) : "", REVIEW_REPLY_FALLBACK);
assert.equal(mornFixed ? reviewProblem(mornFixed, morn) : "нет поста", null);
const galina = OLOID_REVIEWS.find((review) => review.handle === "Галина Марина");
assert.ok(galina?.excerpt && galina.text.includes(galina.excerpt));
assert.equal(galina.text.includes("😅"), true);
assert.equal(galina.excerpt.includes("😅"), false);
const mixed = OLOID_REVIEWS.find((review) => review.handle === "Вячеслав Безумных");
assert.ok(mixed?.mixed);
assert.equal(mixed.platform, "vk-play");
assert.ok(mixed.text.includes("по началу"));
assert.ok(mixed.text.includes("год , то"));
assert.ok(mixed.text.includes("так что"));
const mixedPost = assembleReviewPost("спасибо, что написали и про шероховатости тоже.", mixed, { link: OLOID_VKPLAY_URL });
assert.ok(mixedPost);
assert.equal(reviewProblem(mixedPost, mixed), null);
assert.ok(mixedPost.includes("VK Play"));
assert.equal(mixedPost.includes("App Store"), false);
assert.ok(reviewProblem(mixedPost.replace("спасибо, что написали и про шероховатости тоже.", "если раз в неделю, нам тоже так лучше."), mixed));
assert.ok(reviewProblem(mixedPost.replace("спасибо, что написали и про шероховатости тоже.", "второй эпизод выпустим уже в скором времени."), mixed));
assert.ok(reviewProblem(mixedPost.replace("спасибо, что написали и про шероховатости тоже.", "спасибо. цена 199 ₽."), mixed));
for (const badReply of ["если раз в неделю, нам тоже так лучше.", "второй эпизод выпустим уже в скором времени.", "спасибо. цена 199 ₽."]) {
  const fixed = assembleReviewPost(badReply, mixed, { link: OLOID_VKPLAY_URL });
  assert.equal(fixed ? publishedReviewReply(fixed, mixed) : "", REVIEW_REPLY_FALLBACK, badReply);
  assert.equal(fixed?.includes("199"), false, badReply);
  assert.equal(fixed ? reviewProblem(fixed, mixed) : "нет поста", null, badReply);
  assert.equal(fixed ? ruleCheck(fixed, oloid, evening, reviewRubric, "oloid-review", undefined, false, undefined, OLOID_VKPLAY_URL) : "нет поста", null, badReply);
}
const headphones = "надеемся, наушники и тихий вечер вам в этом помогли";
assert.equal(reviewReplySoftProblem(headphones, mufasa), null);
const headphonesPost = assembleReviewPost(headphones, mufasa, { link: OLOID_APP_STORE_URL });
assert.ok(headphonesPost?.includes(headphones));
assert.equal(headphonesPost ? reviewProblem(headphonesPost, mufasa) : "нет поста", null);
const ownerFactReason = "Ответ команды — не короткая благодарность. Фраза «надеемся, наушники и тихий вечер вам в этом помогли» додумывает, как именно играл автор отзыва";
assert.equal(reviewFactCheckIsReplyProblem(ownerFactReason), true);
assert.equal(reviewFactCheckIsReplyProblem("цитата переписана: нужна дословная, одной парой ёлочек"), false);
assert.equal(reviewFactCheckIsReplyProblem("никнейм изменён"), false);
assert.equal(reviewFactCheckIsReplyProblem("дата отзыва изменена"), false);
assert.equal(reviewFactCheckIsReplyProblem("посторонняя или искажённая ссылка — вставь ровно эту"), false);
const fallbackPost = assembleReviewPost(REVIEW_REPLY_FALLBACK, mufasa, { link: OLOID_APP_STORE_URL });
assert.ok(fallbackPost);
assert.equal(reviewUsesFallback(fallbackPost, mufasa), true);
const rescued = chooseReviewPost({
  candidate: headphonesPost ?? "",
  fallback: fallbackPost,
  candidateProblem: ownerFactReason,
  fallbackProblem: reviewProblem(fallbackPost, mufasa) ?? ruleCheck(fallbackPost, oloid, evening, reviewRubric, "oloid-review", undefined, false, undefined, OLOID_APP_STORE_URL),
});
assert.equal(rescued.problem, null);
assert.equal(rescued.replaced, true);
assert.equal(rescued.text, fallbackPost);
assert.equal(rescued.text.includes(headphones), false);
const structural = chooseReviewPost({
  candidate: mufasaPost.replace("Жду", "Ждём"),
  fallback: fallbackPost,
  candidateProblem: "цитата переписана",
  fallbackProblem: "цитата переписана",
});
assert.equal(structural.problem, "цитата переписана");
assert.equal(structural.replaced, false);
const backstageRubric = oloid.rubrics.find((rubric) => rubric.id === "backstage");
assert.equal(ruleCheck("два эмодзи 💛🔥", oloid, evening, backstageRubric, "oloid-backstage"), "больше одного эмодзи");
assert.equal(ruleCheck(fallbackPost, oloid, evening, reviewRubric, "oloid-review", undefined, false, undefined, OLOID_APP_STORE_URL), null);
assert.equal(extractReviewReply("спасибо, что дошли до конца.", mufasa).includes("дошли до конца"), true);

const forcedText = oloidForcedReviewText();
assert.equal(OLOID_FORCED_REVIEW_ENABLED, true);
assert.equal(OLOID_FORCED_REVIEW_ID, mufasa.id);
assert.equal(forcedText, `«${mufasa.text}»

mufasa093, App Store, 23 октября 2026

${REVIEW_REPLY_FALLBACK}

https://apps.apple.com/ru/app/id6817809325`);
assert.ok(forcedText.length <= 450, String(forcedText.length));
assert.equal(forcedText.includes("http"), true);
assert.equal(reviewProblem(forcedText, mufasa), null);
assert.equal(ruleCheck(forcedText, oloid, evening, reviewRubric, "oloid-review", undefined, false, undefined, OLOID_APP_STORE_URL), null);
assert.equal(forcedReviewAction({ enabled: true, channelId: "oloid", theme: false, published: false, dry: false, claimed: true }), "publish");
assert.equal(forcedReviewAction({ enabled: true, channelId: "oloid", theme: false, published: false, dry: true, claimed: false }), "dry");
assert.equal(forcedReviewAction({ enabled: true, channelId: "oloid", theme: false, published: true, dry: false, claimed: true }), "none");
assert.equal(forcedReviewAction({ enabled: true, channelId: "oloid", theme: false, published: false, dry: false, claimed: false }), "locked");
assert.equal(forcedReviewAction({ enabled: false, channelId: "oloid", theme: false, published: false, dry: false, claimed: true }), "none");
assert.equal(forcedReviewAction({ enabled: true, channelId: "pomazkof", theme: false, published: false, dry: false, claimed: true }), "none");
assert.equal(forcedReviewAction({ enabled: true, channelId: "oloid", theme: true, published: false, dry: false, claimed: true }), "none");
assert.equal(OLOID_FORCED_REVIEW_REDIS_KEY, `threads:oloid_forced_review:${OLOID_FORCED_REVIEW_ID}`);

const egi = OLOID_REVIEWS.find((review) => review.handle === "egipetskayasila01");
assert.ok(egi);
assert.equal(egi.date, "2026-10-22");
assert.ok(egi.text.startsWith("Классная визуальная новелла!"));
assert.ok(egi.text.includes("проходить – самое то))"));
assert.equal(OLOID_REVIEWS.filter((review) => review.handle === "Одосинский").length, 1);
assert.equal(mayRepublishWithoutMedia("diary", { type: "IMAGE", droppable: true }), true);
assert.equal(mayRepublishWithoutMedia("backstage", { type: "IMAGE" }), true);
assert.equal(mayRepublishWithoutMedia("trailer", { type: "VIDEO" }), false);
assert.equal(mayRepublishWithoutMedia("ask", { type: "CAROUSEL", droppable: true }), true);

const pomazkof = CHANNELS.find((item) => item.id === "pomazkof");
const oloidAccount = CHANNELS.find((item) => item.id === "oloid");
assert.equal(pomazkof?.draftOnly, true);
assert.equal(pomazkof?.paused, undefined);
assert.deepEqual(pomazkof?.projects, ["studio"]);
assert.equal(pomazkof?.tokenEnv, "THREADS_ACCESS_TOKEN");
assert.deepEqual(oloidAccount?.projects, ["oloid"]);
assert.equal(oloidAccount?.draftOnly, undefined);
assert.equal(oloidAccount?.tokenEnv, "THREADS_ACCESS_TOKEN_OLOID");
assert.ok(oloidAccount?.voiceNote?.includes("официальный аккаунт"));
const buroProject = PROJECTS.find((project) => project.id === "buro");
assert.ok(buroProject);
assert.equal(buroProject.facts.some((fact) => fact.includes("100 ₽")), true);
assert.equal(buroProject.facts.some((fact) => fact.includes("300")), false);
assert.equal("forceNextRef" in buroProject, false);
assert.equal(oloid.facts.some((fact) => fact.includes("Рейтинг 18+")), true);

const studioNow = new Date("2026-11-14T13:00:00.000Z");
const studioSlot = pickStudioSlot({ history: [], now: studioNow });
assert.equal(studioSlot.rubricId, "how");
assert.equal(studioSlot.subjectId, "oloid");
assert.equal(studioSlot.factId, "oloid-hand");
assert.equal(studioSlot.link, "https://mazkof.games/#oloid");
assert.ok(studioSlot.media?.url.endsWith("/media/oloid/03_egor_tashchit_stol.jpg"));
const studioHistory: HistoryItem[] = [
  {
    project: "studio",
    rubric: studioSlot.rubricId,
    text: "первый",
    at: "2026-11-14T08:00:00.000Z",
    studioSubject: studioSlot.subjectId,
    studioFactId: studioSlot.factId,
    channel: "pomazkof",
  },
];
const studioSecond = pickStudioSlot({ history: studioHistory, now: studioNow });
assert.equal(studioSecond.rubricId, "diary");
assert.equal(studioSecond.subjectId, "tishina");
assert.equal(studioSecond.factId, "tishina-launch");
assert.equal(studioSecond.link, undefined);
assert.notEqual(studioSecond.subjectId, studioSlot.subjectId);
const studioThird = pickStudioSlot({
  history: [
    {
      project: "studio",
      rubric: studioSecond.rubricId,
      text: "второй",
      at: "2026-11-14T11:00:00.000Z",
      studioSubject: studioSecond.subjectId,
      studioFactId: studioSecond.factId,
      channel: "pomazkof",
    },
    ...studioHistory,
  ],
  now: studioNow,
});
assert.equal(studioThird.rubricId, "news");
assert.equal(studioThird.subjectId, "tvoyak");
assert.equal(studioThird.factId, "tvoyak-play");
assert.equal(studioThird.link, "https://mazkof.games/#tvoyak");
assert.equal(studioThird.media, undefined);
const studioSic = pickStudioSlot({ history: [], now: studioNow, forcedRubric: "diary", forcedTopic: "sic-mundus" });
assert.equal(studioSic.subjectId, "sic-mundus");
assert.equal(studioSic.link, undefined);
assert.equal(studioSic.media, undefined);
assert.equal(studioFactIds("tishina", "news", new Date("2026-11-14T10:00:00+03:00")).includes("tishina-event"), true);
assert.equal(studioFactIds("tishina", "news", new Date("2026-11-21T13:55:00+03:00")).includes("tishina-event"), false);
const studioKept = pickStudioSlot({
  history: [{ project: "studio", rubric: "how", text: "x", at: "2026-11-14T01:00:00.000Z", studioSubject: "tishina", studioFactId: "oloid-hand", channel: "pomazkof" }],
  now: studioNow,
  forcedRubric: "how",
  forcedTopic: "oloid",
});
assert.equal(studioKept.factId, "oloid-tours");
const studioStats = pickStudioSlot({
  history: ["komm-morning", "komm-out", "komm-mornings", "komm-avg", "komm-peak", "komm-return", "komm-ontime"].map((id, index) => ({
    project: "studio" as const,
    rubric: "news",
    text: id,
    at: new Date(Date.parse("2026-11-14T12:00:00.000Z") - index * 1000).toISOString(),
    studioSubject: "oloid",
    studioFactId: id,
    channel: "pomazkof",
  })),
  now: studioNow,
  forcedRubric: "news",
  forcedTopic: "komm-players",
});
assert.equal(studioStats.factId, "komm-players");
assert.ok(studioStats.media?.url.endsWith("/media/kommunalka/stats.jpg"));
for (const file of ["tishina/01_pochta.jpg", "tishina/08_kozlyonok.jpg", "kommunalka/map.jpg", "kommunalka/stats.jpg", "kommunalka/liza.jpg"]) {
  assert.equal(existsSync(join("public/media", file)), true, file);
}

const studioProject = PROJECTS.find((project) => project.id === "studio");
assert.ok(studioProject);
const studioHow = studioProject.rubrics.find((rubric) => rubric.id === "how");
assert.ok(studioHow);
const studioSampleHow = `мини-игры в «Олоиде» я делал не кнопкой.

стол едет рывками, если тянуть его рукой. клик убрали.

https://mazkof.games/#oloid`;
const studioSampleDiary = `«Тишину» я хотел выпустить 11.11.2026.

одобрение пришло — и 13.11.2026 она уже была в магазине.`;
const studioSampleNews = `«Твояк» я включаю на большом экране.

игроки отвечают с телефонов по коду. близкий ответ засчитает ии. сами они играют бесплатно.

https://mazkof.games/#tvoyak`;
assert.equal(studioProblem(studioSampleHow, studioSlot, studioNow), null);
assert.equal(studioProblem(studioSampleDiary, studioSecond, studioNow), null);
assert.equal(studioProblem(studioSampleNews, studioThird, studioNow), null);
assert.equal(ruleCheck(studioSampleHow, studioProject, studioNow, studioHow, "pomazkof-how", undefined, false, undefined, studioSlot.link), null);
assert.equal(ruleCheck(studioSampleDiary, studioProject, studioNow, studioProject.rubrics.find((rubric) => rubric.id === "diary"), "pomazkof-diary"), null);
assert.equal(studioProblem("тексты пишет нейросеть под компанию.", { subjectId: "etozhety", factText: "Тексты дела пишет нейросеть под компанию.", link: undefined }, studioNow), null);
assert.equal(studioProblem("ИИ использовался как инструмент.", { subjectId: "oloid", factText: "Нейросети использовались как инструмент, всё дорабатывалось вручную.", link: undefined }, studioNow), null);
assert.equal(studioProblem("хаус-плейлист затихает.", { subjectId: "tvoyak", factText: "без цифр", link: undefined }, studioNow), null);
for (const bad of [
  "это вайбкодинг",
  "навайбкожено вчера",
  "нейросеть пишет код",
  "ИИ-агент собрал уровень",
  "открыл Cursor",
  "спросил Claude",
  "скинул pull request",
  "лей в прод",
  "https://threads.vercel.app/x",
  "промокод OMSK",
  "код GUEST",
  "PLAYTEST внутри",
  "ShopID в кабинете",
  "наш ИНН",
  "как Жеглов",
  "дальняя дверь открылась",
  "на карте 18937 шагов",
]) {
  assert.ok(studioProblem(bad, { subjectId: "oloid", factText: "без цифр", link: undefined }, studioNow), bad);
}
assert.equal(studioProblem("событие первые письма ещё идёт", { subjectId: "tishina", factText: "без цифр", link: undefined }, new Date("2026-11-14T10:00:00+03:00")), null);
assert.ok(studioProblem("событие первые письма ещё идёт", { subjectId: "tishina", factText: "без цифр", link: undefined }, new Date("2026-11-22T00:00:00+03:00")));
const draftIdx = cronSrc.indexOf("if (channel.draftOnly)");
const draftEnd = cronSrc.indexOf("if (promoCode && !appStorePromoOpen", draftIdx);
assert.ok(draftIdx > dryIdx && draftIdx < publishIdx && draftEnd > draftIdx);
assert.equal(cronSrc.slice(draftIdx, draftEnd).includes("publishPost"), false);
assert.ok(cronSrc.slice(draftIdx, draftEnd).includes("savePublishDraft"));
assert.ok(cronSrc.slice(draftIdx, draftEnd).includes("draftKeyboard"));
const draftCopy = readFileSync(new URL("./drafts.ts", import.meta.url), "utf8");
assert.ok(draftCopy.includes("черновик @pomazkof"));
assert.equal(DRAFT_TTL_SEC, 7 * 24 * 60 * 60);
const freshId = newDraftId();
assert.equal(parseDraftCallback(`pub:${freshId}`)?.action, "pub");
assert.equal(parseDraftCallback(`skip:${freshId}`)?.id, freshId);
assert.equal(parseDraftCallback(`edit:${freshId}`)?.action, "edit");
assert.equal(parseDraftCallback(`edit:${freshId}`)?.id, freshId);
assert.equal(parseDraftCallback("pub:ZZZZZZZZZZZZZZZZ"), null);
assert.equal(parseDraftCallback("pub:../../etc/passwd"), null);
assert.equal(parseDraftCallback("edit:short"), null);
assert.equal(parseDraftCallback("drop:aaaaaaaaaaaaaaaa"), null);
const keys = draftKeyboard(freshId);
assert.deepEqual(keys.map((row) => row.map((button) => button.text)), [["Опубликовать", "Пропустить", "Редактировать"]]);
assert.equal(keys[0][0].callback_data, `pub:${freshId}`);
assert.equal(keys[0][1].callback_data, `skip:${freshId}`);
assert.equal(keys[0][2].callback_data, `edit:${freshId}`);
assert.ok(keys[0].every((button) => Buffer.byteLength(button.callback_data) <= 64));
assert.equal(EDIT_PENDING_TTL_SEC, 60 * 60);
assert.equal(THREADS_TEXT_MAX, 500);
const studioLink = "https://mazkof.games/#oloid";
assert.deepEqual(composeEditedText(`было\n\n${studioLink}`, "новый текст", studioLink), {
  text: `новый текст\n\n${studioLink}`,
  appendedLink: true,
});
assert.deepEqual(composeEditedText(`было\n\n${studioLink}`, "новый  ", studioLink), {
  text: `новый\n\n${studioLink}`,
  appendedLink: true,
});
assert.deepEqual(composeEditedText(`было\n\n${studioLink}`, `смотри ${studioLink} ещё`, studioLink), {
  text: `смотри ${studioLink} ещё`,
  appendedLink: false,
});
assert.deepEqual(composeEditedText("без ссылки", "  как есть  ", undefined), { text: "  как есть  ", appendedLink: false });
assert.deepEqual(composeEditedText("без ссылки", "новый", studioLink), { text: "новый", appendedLink: false });
assert.ok(editLengthReply(501, false).includes("501 символ,"));
assert.ok(editLengthReply(502, false).includes("502 символа"));
assert.equal(editLengthReply(512, false).includes("вместе со ссылкой"), false);
assert.ok(editLengthReply(511, true).includes("511 символов"));
assert.ok(editLengthReply(511, true).includes("вместе со ссылкой"));
const promptHtml = editPromptHtml("a < b & c\nвторая");
assert.ok(promptHtml.startsWith(EDIT_PROMPT));
assert.ok(promptHtml.includes("<pre>a &lt; b &amp; c\nвторая</pre>"));
const replacedTwice = withReplaced("черновик");
assert.equal(withReplaced(replacedTwice), replacedTwice);
assert.ok(replacedTwice.endsWith(REPLACED_NOTE));
assert.equal(secretMatches("sekret", "sekret"), true);
assert.equal(secretMatches("sekret", "secret"), false);
assert.equal(secretMatches("a", "ab"), false);
assert.equal(secretMatches(undefined, "sekret"), false);
assert.equal(secretMatches("", ""), false);
assert.equal(chatAllowed(42, "42"), true);
assert.equal(chatAllowed(42, " 42 "), true);
assert.equal(chatAllowed(undefined, "42"), false);
assert.equal(chatAllowed("-100", "-100"), true);
const sampleDraft: PublishDraft = {
  id: "aabbccddeeff0011",
  channelId: "pomazkof",
  projectId: "studio",
  rubricId: "how",
  text: "стол едет рывками.",
  at: "2026-11-14T13:00:00.000Z",
  status: "pending",
  studioSubject: "oloid",
  studioFactId: "oloid-hand",
  studioLink: "https://mazkof.games/#oloid",
  media: { type: "IMAGE", url: "https://threads-autopost-six.vercel.app/media/oloid/03_egor_tashchit_stol.jpg", droppable: true },
};
const draftText = draftTelegramText(sampleDraft);
assert.ok(draftText.startsWith("черновик @pomazkof\n\nстол едет рывками."));
assert.ok(draftText.includes("\nкартинка: https://threads-autopost-six.vercel.app/media/oloid/03_egor_tashchit_stol.jpg\n"));
assert.ok(draftText.endsWith("ссылка: https://mazkof.games/#oloid"));
const noted = withOutcome(draftText, "✅ Опубликовано\nhttps://www.threads.net/t/abc");
assert.equal(withOutcome(noted, "✅ Опубликовано\nhttps://www.threads.net/t/abc"), noted);
assert.ok(noted.endsWith("✅ Опубликовано\nhttps://www.threads.net/t/abc"));
assert.equal(noted.includes("черновик @pomazkof"), true);
const longError = publishErrorText(`access_token=secret ${"x".repeat(400)}`);
assert.ok(longError.startsWith("Ошибка публикации: "));
assert.equal(longError.includes("access_token=secret"), false);
assert.ok(longError.length <= 200);
assert.equal(claimDecision(null, true).kind, "missing");
assert.equal(claimDecision({ ...sampleDraft, status: "published" }, true).kind, "published");
assert.equal(claimDecision({ ...sampleDraft, status: "skipped" }, false).kind, "skipped");
assert.equal(claimDecision(sampleDraft, false).kind, "busy");
assert.equal(claimDecision(sampleDraft, true).kind, "go");

type PressLog = { answers: { text?: string; alert?: boolean }[]; edits: string[]; replies: string[]; publishes: number };
async function press(
  data: string,
  opts?: {
    draft?: PublishDraft | null;
    secret?: string;
    webhookSecret?: string;
    chat?: number | string;
    allowedChat?: string;
    publish?: (draft: PublishDraft) => Promise<{ postId: string; permalink?: string; mediaUrl?: string; clearMedia: boolean }>;
    answerOk?: boolean;
    store?: ReturnType<typeof createMemoryDraftStore>;
    allowChannel?: (channelId: string) => boolean;
    beginEdit?: (chatId: string, replyTo: number, html: string) => Promise<number>;
  },
): Promise<PressLog & { status: number; store: ReturnType<typeof createMemoryDraftStore> }> {
  const draft = opts?.draft === undefined ? sampleDraft : opts.draft;
  const store = opts?.store ?? createMemoryDraftStore(draft ?? undefined);
  const answers: PressLog["answers"] = [];
  const edits: string[] = [];
  const replies: string[] = [];
  let publishes = 0;
  const status = (
    await handleDraftCallback({
      secretHeader: opts && "secret" in opts ? opts.secret : "sekret",
      webhookSecret: opts && "webhookSecret" in opts ? opts.webhookSecret : "sekret",
      allowedChatId: opts?.allowedChat === undefined ? "42" : opts.allowedChat,
      update: {
        callback_query: {
          id: "cb-1",
          data,
          message: { message_id: 7, text: draft ? draftTelegramText(draft) : "черновик @pomazkof", chat: { id: opts?.chat ?? 42 } },
        },
      },
      store,
      publish: opts?.publish ?? (async () => {
        publishes += 1;
        return { postId: "post-1", permalink: "https://www.threads.net/@pomazkof/post/1", mediaUrl: draft?.media?.url, clearMedia: false };
      }),
      answer: async (_id, text, alert) => {
        answers.push({ text, alert });
        return opts?.answerOk !== false;
      },
      edit: async (_chat, _message, text) => {
        edits.push(text);
      },
      reply: async (_chat, _message, text) => {
        replies.push(text);
      },
      allowChannel: opts?.allowChannel ?? (() => true),
      beginEdit: opts?.beginEdit ?? (async () => 100),
    })
  ).status;
  return { status, store, answers, edits, replies, publishes };
}

const denied = await press(`pub:${sampleDraft.id}`, { secret: "no" });
assert.equal(denied.status, 401);
assert.equal(denied.answers.length, 0);
assert.equal(denied.publishes, 0);
const closed = await press(`pub:${sampleDraft.id}`, { webhookSecret: undefined });
assert.equal(closed.status, 401);
assert.equal(closed.publishes, 0);
const foreign = await press(`pub:${sampleDraft.id}`, { chat: 99 });
assert.equal(foreign.status, 200);
assert.equal(foreign.publishes, 0);
assert.equal(foreign.answers[0]?.text, "Недоступно");
const garbage = await press("pub:nope");
assert.equal(garbage.publishes, 0);
assert.equal(garbage.answers.length, 1);
assert.equal(garbage.answers[0]?.text, undefined);
const stale = await press(`pub:${sampleDraft.id}`, { draft: null });
assert.equal(stale.answers[0]?.text, "Черновик устарел");
assert.equal(stale.answers[0]?.alert, true);
assert.equal(stale.publishes, 0);

const postStore = createMemoryDraftStore(sampleDraft);
postStore.history.push({
  channel: "pomazkof",
  project: "studio",
  rubric: "how",
  text: sampleDraft.text,
  at: sampleDraft.at,
  media: sampleDraft.media?.url,
});
const posted = await press(`pub:${sampleDraft.id}`, { store: postStore });
const postedAgain = await press(`pub:${sampleDraft.id}`, { store: postStore });
assert.equal(posted.publishes, 1);
assert.equal(postedAgain.publishes, 0);
assert.equal(posted.answers.at(-1)?.text, "Опубликовано");
assert.ok(posted.edits[0]?.includes("✅ Опубликовано"));
assert.ok(posted.edits[0]?.includes("https://www.threads.net/@pomazkof/post/1"));
assert.equal(posted.edits[0]?.includes("⏭"), false);
assert.equal(postStore.drafts.get(sampleDraft.id)?.status, "published");
assert.equal(postStore.drafts.get(sampleDraft.id)?.postId, "post-1");
assert.equal(postedAgain.answers.at(-1)?.text, "Уже опубликовано");
assert.equal(postStore.history.length, 1);
assert.equal(postStore.history[0]?.postId, "post-1");
assert.equal(postStore.history[0]?.media, sampleDraft.media?.url);

const skipStore = createMemoryDraftStore(sampleDraft);
const skipped = await press(`skip:${sampleDraft.id}`, { store: skipStore });
const skippedLate = await press(`pub:${sampleDraft.id}`, { store: skipStore });
assert.equal(skipped.publishes, 0);
assert.equal(skippedLate.publishes, 0);
assert.ok(skipped.edits[0]?.includes("⏭ Пропущено"));
assert.equal(skipped.answers.at(-1)?.text, "Пропущено");
assert.equal(skipStore.drafts.get(sampleDraft.id)?.status, "skipped");
assert.equal(skippedLate.answers.at(-1)?.text, "Уже пропущено");

let failed = true;
const retryStore = createMemoryDraftStore(structuredClone(sampleDraft));
const broken = await press(`pub:${sampleDraft.id}`, {
  store: retryStore,
  answerOk: false,
  publish: async () => {
    if (failed) throw new Error("Threads threads: rate limit");
    return { postId: "post-2", clearMedia: false };
  },
});
assert.equal(broken.publishes, 0);
assert.ok(broken.answers[0]?.text?.startsWith("Ошибка публикации: "));
assert.equal(broken.answers[0]?.alert, true);
assert.equal(broken.edits.length, 0);
assert.equal(broken.replies[0]?.startsWith("Ошибка публикации: "), true);
assert.equal(retryStore.drafts.get(sampleDraft.id)?.status, "pending");
failed = false;
const retried = await press(`pub:${sampleDraft.id}`, {
  store: retryStore,
  publish: async () => ({ postId: "post-2", permalink: "https://www.threads.net/t/two", clearMedia: false }),
});
assert.equal(retried.publishes, 0);
assert.equal(retryStore.drafts.get(sampleDraft.id)?.postId, "post-2");

let started!: () => void;
const gate = new Promise<void>((resolve) => {
  started = resolve;
});
let entered = 0;
const busyStore = createMemoryDraftStore(structuredClone(sampleDraft));
const firstClick = press(`pub:${sampleDraft.id}`, {
  store: busyStore,
  publish: async () => {
    entered += 1;
    await gate;
    return { postId: "post-3", clearMedia: false };
  },
});
const secondClick = await press(`pub:${sampleDraft.id}`, { store: busyStore });
assert.equal(entered, 1);
assert.equal(secondClick.publishes, 0);
assert.equal(secondClick.answers.at(-1)?.text, "Публикация уже идёт");
started();
await firstClick;
assert.equal(busyStore.drafts.get(sampleDraft.id)?.postId, "post-3");
assert.equal(busyStore.drafts.get(sampleDraft.id)?.status, "published");

const historyOnly = createMemoryDraftStore();
historyOnly.history.push({ channel: "pomazkof", project: "studio", rubric: "how", text: sampleDraft.text, at: sampleDraft.at, media: "https://img" });
await historyOnly.recordPublication(historyFromDraft(sampleDraft, "post-9", undefined, true), { matchAt: sampleDraft.at, clearMedia: true });
assert.equal(historyOnly.history[0]?.postId, "post-9");
assert.equal(historyOnly.history[0]?.media, undefined);
const freshHistory = createMemoryDraftStore();
await freshHistory.recordPublication(historyFromDraft(sampleDraft, "post-8", sampleDraft.media?.url, false), { matchAt: sampleDraft.at, clearMedia: false });
assert.equal(freshHistory.history[0]?.postId, "post-8");
assert.equal(freshHistory.history[0]?.studioFactId, "oloid-hand");
assert.equal(freshHistory.history[0]?.media, sampleDraft.media?.url);

let mediaCalls: Array<string | undefined> = [];
const dropped = await publishStoredDraft(sampleDraft, {
  channel: pomazkof,
  publishPost: async (media) => {
    mediaCalls.push(media?.url);
    if (media) throw new Error("картинка не принята");
    return { id: "post-img" };
  },
  findExisting: async () => null,
  permalink: async () => "not a url",
});
assert.deepEqual(mediaCalls, [sampleDraft.media?.url, undefined]);
assert.equal(dropped.postId, "post-img");
assert.equal(dropped.clearMedia, true);
assert.equal(dropped.permalink, undefined);
mediaCalls = [];
const recovered = await publishStoredDraft(sampleDraft, {
  channel: pomazkof,
  publishPost: async () => {
    throw new Error("не должны публиковать ещё раз");
  },
  findExisting: async () => "already",
  permalink: async () => "https://www.threads.net/t/already",
});
assert.equal(recovered.postId, "already");
assert.equal(mediaCalls.length, 0);
const dup = Object.assign(new Error("уже есть"), { alreadyPublished: true });
mediaCalls = [];
await assert.rejects(
  () =>
    publishStoredDraft(
      { ...sampleDraft, rubricId: "frame", media: { type: "IMAGE", url: "https://img/frame.jpg" } },
      {
        channel: pomazkof,
        publishPost: async (media) => {
          mediaCalls.push(media?.url);
          throw dup;
        },
        findExisting: async () => null,
        permalink: async () => undefined,
      },
    ),
  (error: unknown) => error === dup,
);
assert.deepEqual(mediaCalls, ["https://img/frame.jpg"]);
await assert.rejects(
  () =>
    publishStoredDraft(sampleDraft, {
      channel: oloidAccount,
      publishPost: async () => ({ id: "no" }),
      findExisting: async () => "no",
      permalink: async () => undefined,
    }),
  /кнопки/,
);

const linkInPost = "https://mazkof.games/#oloid";
type CardLog = { text: string; keys: string[] };
async function correct(
  store: DraftStore,
  text: string,
  opts?: { chat?: number; secret?: string; webhookSecret?: string; replyTo?: number; allow?: (channelId: string) => boolean; failSend?: boolean },
): Promise<{ status: number; replies: string[]; cards: CardLog[]; edits: string[] }> {
  const replies: string[] = [];
  const cards: CardLog[] = [];
  const edits: string[] = [];
  const status = (
    await handleDraftMessage({
      secretHeader: opts && "secret" in opts ? opts.secret : "sekret",
      webhookSecret: opts && "webhookSecret" in opts ? opts.webhookSecret : "sekret",
      allowedChatId: "42",
      update: {
        message: {
          message_id: 80,
          text,
          chat: { id: opts?.chat ?? 42 },
          reply_to_message: typeof opts?.replyTo === "number" ? { message_id: opts.replyTo } : undefined,
        },
      },
      store,
      allowChannel: opts?.allow ?? ((channelId) => channelId === "pomazkof"),
      sendDraft: async (_chat, card, keyboard: TgButton[][]) => {
        if (opts?.failSend) throw new Error("telegram down");
        cards.push({ text: card, keys: keyboard.flat().map((button) => button.callback_data) });
      },
      edit: async (_chat, _message, next) => {
        edits.push(next);
      },
      reply: async (_chat, _message, next) => {
        replies.push(next);
      },
    })
  ).status;
  return { status, replies, cards, edits };
}

const editStore = createMemoryDraftStore(structuredClone(sampleDraft));
editStore.history.push({
  channel: "pomazkof",
  project: "studio",
  rubric: "how",
  text: sampleDraft.text,
  at: sampleDraft.at,
  media: sampleDraft.media?.url,
  studioSubject: "oloid",
  studioFactId: "oloid-hand",
});
let beganEdit = false;
const asked = await press(`edit:${sampleDraft.id}`, {
  store: editStore,
  beginEdit: async (_chat, replyTo, html) => {
    beganEdit = true;
    assert.equal(replyTo, 7);
    assert.ok(html.startsWith(EDIT_PROMPT));
    assert.ok(html.includes(`<pre>${sampleDraft.text}</pre>`));
    return 55;
  },
});
assert.equal(beganEdit, true);
assert.equal(asked.publishes, 0);
assert.equal(asked.answers.at(-1)?.text, "Жду текст");
assert.equal((await editStore.findEdit("42", 55))?.draftId, sampleDraft.id);
const ignored = await correct(editStore, "не про это", { replyTo: 3 });
assert.equal(ignored.cards.length, 1);
assert.equal(editStore.drafts.get(sampleDraft.id)?.text, "не про это");
editStore.drafts.set(sampleDraft.id, structuredClone(sampleDraft));
editStore.history[0].text = sampleDraft.text;
await editStore.rememberEdit("42", {
  draftId: sampleDraft.id,
  promptMessageId: 55,
  draftMessageId: 7,
  originText: "карточка один",
});
await editStore.rememberEdit("42", {
  draftId: sampleDraft.id,
  promptMessageId: 77,
  draftMessageId: 7,
  originText: "карточка два",
});
const exact = "это вайбкодинг, и Cursor тоже.\n\nбез фильтра";
const fixed = await correct(editStore, exact, { replyTo: 55 });
assert.equal(fixed.status, 200);
assert.equal(editStore.drafts.get(sampleDraft.id)?.text, exact);
assert.equal(editStore.drafts.get(sampleDraft.id)?.studioLink, sampleDraft.studioLink);
assert.equal(editStore.drafts.get(sampleDraft.id)?.media?.url, sampleDraft.media?.url);
assert.equal(editStore.drafts.get(sampleDraft.id)?.projectId, "studio");
assert.equal(editStore.history[0]?.text, exact);
assert.equal(editStore.history.length, 1);
assert.ok(fixed.cards[0]?.text.startsWith("черновик @pomazkof"));
assert.ok(fixed.cards[0]?.text.includes(exact));
assert.ok(fixed.cards[0]?.text.includes(`картинка: ${sampleDraft.media?.url}`));
assert.ok(fixed.cards[0]?.text.endsWith(`ссылка: ${sampleDraft.studioLink}`));
assert.deepEqual(fixed.cards[0]?.keys, [`pub:${sampleDraft.id}`, `skip:${sampleDraft.id}`, `edit:${sampleDraft.id}`]);
assert.ok(fixed.edits[0]?.includes("карточка один"));
assert.ok(fixed.edits[0]?.endsWith(REPLACED_NOTE));
assert.equal((await editStore.findEdit("42", 55))?.originText, "карточка два");
assert.equal((await editStore.findEdit("42"))?.promptMessageId, 77);
const againText = "вторая версия";
const again = await correct(editStore, againText);
assert.equal(editStore.drafts.get(sampleDraft.id)?.text, againText);
assert.ok(again.edits[0]?.includes("карточка два"));
assert.equal(await editStore.findEdit("42"), null);
let publishedText = "";
let publishCalls = 0;
const postedEdit = await press(`pub:${sampleDraft.id}`, {
  store: editStore,
  publish: async (draft) => {
    publishCalls += 1;
    publishedText = draft.text;
    return { postId: "post-e", permalink: "https://www.threads.net/t/e", mediaUrl: draft.media?.url, clearMedia: false };
  },
});
const postedEditAgain = await press(`pub:${sampleDraft.id}`, {
  store: editStore,
  publish: async () => {
    publishCalls += 1;
    return { postId: "post-e2", clearMedia: false };
  },
});
assert.equal(publishCalls, 1);
assert.equal(publishedText, againText);
assert.equal(postedEdit.answers.at(-1)?.text, "Опубликовано");
assert.equal(postedEditAgain.publishes, 0);
assert.equal(postedEditAgain.answers.at(-1)?.text, "Уже опубликовано");
assert.equal(editStore.history.length, 1);
assert.equal(editStore.history[0]?.postId, "post-e");
assert.equal(editStore.history[0]?.text, againText);
let editAfterPublish = false;
const publishedButton = await press(`edit:${sampleDraft.id}`, {
  store: editStore,
  beginEdit: async () => {
    editAfterPublish = true;
    return 8;
  },
});
assert.equal(editAfterPublish, false);
assert.equal(publishedButton.publishes, 0);
assert.equal(publishedButton.answers.at(-1)?.text, EDIT_ALREADY_PUBLISHED);
await editStore.rememberEdit("42", { draftId: sampleDraft.id, promptMessageId: 90, draftMessageId: 7, originText: "уже вышло" });
const lateText = await correct(editStore, "после публикации", { replyTo: 90 });
assert.equal(lateText.replies[0], EDIT_ALREADY_PUBLISHED);
assert.equal(lateText.cards.length, 0);
assert.equal(editStore.drafts.get(sampleDraft.id)?.text, againText);
assert.equal(await editStore.findEdit("42"), null);

const skipEditStore = createMemoryDraftStore(structuredClone(sampleDraft));
await skipEditStore.rememberEdit("42", { draftId: sampleDraft.id, promptMessageId: 55, draftMessageId: 7, originText: draftTelegramText(sampleDraft) });
await skipEditStore.skip(sampleDraft.id);
const afterSkip = await correct(skipEditStore, "уже не надо", { replyTo: 55 });
assert.equal(afterSkip.replies[0], EDIT_ALREADY_SKIPPED);
assert.equal(skipEditStore.drafts.get(sampleDraft.id)?.text, sampleDraft.text);
assert.equal(await skipEditStore.findEdit("42"), null);
let editAfterSkip = false;
const skippedButton = await press(`edit:${sampleDraft.id}`, {
  store: skipEditStore,
  beginEdit: async () => {
    editAfterSkip = true;
    return 9;
  },
});
assert.equal(editAfterSkip, false);
assert.equal(skippedButton.answers.at(-1)?.text, EDIT_ALREADY_SKIPPED);
assert.equal(skippedButton.publishes, 0);

const longStore = createMemoryDraftStore(structuredClone(sampleDraft));
await longStore.rememberEdit("42", { draftId: sampleDraft.id, promptMessageId: 55, draftMessageId: 7, originText: "карточка" });
const tooLong = "я".repeat(501);
const rejected = await correct(longStore, tooLong, { replyTo: 55 });
assert.ok(rejected.replies[0]?.includes("501"));
assert.ok(rejected.replies[0]?.includes(String(THREADS_TEXT_MAX)));
assert.equal(rejected.replies[0]?.includes("вместе со ссылкой"), false);
assert.equal(rejected.cards.length, 0);
assert.equal(longStore.drafts.get(sampleDraft.id)?.text, sampleDraft.text);
assert.equal((await longStore.findEdit("42", 55))?.draftId, sampleDraft.id);
const blank = await correct(longStore, "   \n", { replyTo: 55 });
assert.ok(blank.replies[0]?.includes("пустой"));
assert.equal(longStore.drafts.get(sampleDraft.id)?.text, sampleDraft.text);
const accepted = await correct(longStore, "короче", { replyTo: 55 });
assert.equal(longStore.drafts.get(sampleDraft.id)?.text, "короче");
assert.equal(accepted.cards.length, 1);

const linked: PublishDraft = { ...sampleDraft, text: `стол едет рывками.\n\n${linkInPost}` };
const linkedStore = createMemoryDraftStore(linked);
await linkedStore.rememberEdit("42", { draftId: linked.id, promptMessageId: 55, draftMessageId: 7, originText: "со ссылкой" });
const overflowBody = "я".repeat(THREADS_TEXT_MAX - linkInPost.length - 2 + 1);
const overflow = await correct(linkedStore, overflowBody, { replyTo: 55 });
const overflowCount = overflowBody.length + 2 + linkInPost.length;
assert.ok(overflow.replies[0]?.includes(String(overflowCount)));
assert.ok(overflow.replies[0]?.includes("вместе со ссылкой"));
assert.equal(linkedStore.drafts.get(linked.id)?.text, linked.text);
const relinked = await correct(linkedStore, "новый абзац", { replyTo: 55 });
assert.equal(linkedStore.drafts.get(linked.id)?.text, `новый абзац\n\n${linkInPost}`);
assert.equal(linkedStore.drafts.get(linked.id)?.studioLink, linkInPost);
assert.ok(relinked.cards[0]?.text.includes(`новый абзац\n\n${linkInPost}`));
assert.ok(relinked.cards[0]?.text.endsWith(`ссылка: ${linkInPost}`));

const quietStore = createMemoryDraftStore({ ...sampleDraft, text: "без ссылки", studioLink: undefined });
await quietStore.rememberEdit("42", { draftId: sampleDraft.id, promptMessageId: 55, draftMessageId: 7, originText: "тихо" });
await correct(quietStore, "  как есть  ", { replyTo: 55 });
assert.equal(quietStore.drafts.get(sampleDraft.id)?.text, "  как есть  ");
assert.equal(quietStore.drafts.get(sampleDraft.id)?.studioLink, undefined);

const failStore = createMemoryDraftStore(structuredClone(sampleDraft));
failStore.history.push({ channel: "pomazkof", project: "studio", rubric: "how", text: sampleDraft.text, at: sampleDraft.at });
await failStore.rememberEdit("42", { draftId: sampleDraft.id, promptMessageId: 55, draftMessageId: 7, originText: "карточка" });
const failedSend = await correct(failStore, "не дошло", { replyTo: 55, failSend: true });
assert.equal(failStore.drafts.get(sampleDraft.id)?.text, sampleDraft.text);
assert.equal(failStore.history[0]?.text, sampleDraft.text);
assert.ok(failedSend.replies[0]?.includes("не изменён"));
assert.equal((await failStore.findEdit("42", 55))?.draftId, sampleDraft.id);

const foreignEdit = await correct(longStore, "чужой", { chat: 99, replyTo: 55 });
assert.equal(foreignEdit.status, 200);
assert.equal(foreignEdit.replies.length, 0);
assert.equal(foreignEdit.cards.length, 0);
const lockedOut = await correct(longStore, "без секрета", { secret: "no", replyTo: 55 });
assert.equal(lockedOut.status, 401);
assert.equal(lockedOut.replies.length, 0);
const noPending = createMemoryDraftStore(structuredClone(sampleDraft));
const stray = await correct(noPending, "просто сообщение");
assert.equal(stray.replies.length, 0);
assert.equal(stray.cards.length, 0);
assert.equal(noPending.drafts.get(sampleDraft.id)?.text, sampleDraft.text);
const photo = await handleDraftMessage({
  secretHeader: "sekret",
  webhookSecret: "sekret",
  allowedChatId: "42",
  update: { message: { message_id: 81, chat: { id: 42 } } },
  store: longStore,
  allowChannel: () => true,
  sendDraft: async () => {
    throw new Error("не должны слать карточку");
  },
  edit: async () => {
    throw new Error("не должны править сообщение");
  },
  reply: async () => {
    throw new Error("не должны отвечать");
  },
});
assert.equal(photo.status, 200);

const heldStore = createMemoryDraftStore(structuredClone(sampleDraft));
await heldStore.rememberEdit("42", { draftId: sampleDraft.id, promptMessageId: 55, draftMessageId: 7, originText: "карточка" });
const held = await heldStore.claim(sampleDraft.id);
assert.equal(held.kind, "go");
const whileBusy = await correct(heldStore, "во время публикации", { replyTo: 55 });
assert.equal(whileBusy.replies[0], "Публикация уже идёт");
assert.equal(heldStore.drafts.get(sampleDraft.id)?.text, sampleDraft.text);
assert.equal((await heldStore.findEdit("42", 55))?.draftId, sampleDraft.id);
await heldStore.release(sampleDraft.id);

let editWhileHeld = false;
let holdEntered = 0;
let releaseHold!: () => void;
const holdGate = new Promise<void>((resolve) => {
  releaseHold = resolve;
});
const holdStore = createMemoryDraftStore(structuredClone(sampleDraft));
const holding = press(`pub:${sampleDraft.id}`, {
  store: holdStore,
  publish: async () => {
    holdEntered += 1;
    await holdGate;
    return { postId: "post-hold", clearMedia: false };
  },
});
const editHeld = await press(`edit:${sampleDraft.id}`, {
  store: holdStore,
  beginEdit: async () => {
    editWhileHeld = true;
    return 4;
  },
});
assert.equal(holdEntered, 1);
assert.equal(editWhileHeld, false);
assert.equal(editHeld.answers.at(-1)?.text, "Публикация уже идёт");
assert.equal(editHeld.publishes, 0);
releaseHold();
await holding;

const oloidDraft: PublishDraft = { ...sampleDraft, channelId: "oloid" };
const oloidStore = createMemoryDraftStore(oloidDraft);
let oloidBegan = false;
const oloidEdit = await press(`edit:${oloidDraft.id}`, {
  draft: oloidDraft,
  store: oloidStore,
  allowChannel: (channelId) => channelId === "pomazkof",
  beginEdit: async () => {
    oloidBegan = true;
    return 6;
  },
});
assert.equal(oloidBegan, false);
assert.equal(oloidEdit.publishes, 0);
assert.equal(oloidEdit.answers.at(-1)?.text, "Недоступно");
await oloidStore.rememberEdit("42", { draftId: oloidDraft.id, promptMessageId: 55, draftMessageId: 7, originText: "олоид" });
const oloidMessage = await correct(oloidStore, "правка олоида", { replyTo: 55, allow: (channelId) => channelId === "pomazkof" });
assert.equal(oloidMessage.replies[0], "Недоступно");
assert.equal(oloidStore.drafts.get(oloidDraft.id)?.text, oloidDraft.text);
assert.equal(oloidMessage.cards.length, 0);

let promptFailed = false;
const promptStore = createMemoryDraftStore(structuredClone(sampleDraft));
const promptBoom = await press(`edit:${sampleDraft.id}`, {
  store: promptStore,
  beginEdit: async () => {
    promptFailed = true;
    throw new Error("telegram down");
  },
});
assert.equal(promptFailed, true);
assert.equal(promptBoom.answers.at(-1)?.text, "Жду текст");
assert.ok(promptBoom.replies[0]?.includes("Не удалось запросить правку"));
assert.equal(await promptStore.findEdit("42"), null);
assert.equal(promptStore.drafts.get(sampleDraft.id)?.text, sampleDraft.text);

const reviewSrc = readFileSync(new URL("./draftReview.ts", import.meta.url), "utf8");
assert.equal(reviewSrc.includes("studioProblem"), false);
assert.equal(reviewSrc.includes("ruleCheck"), false);
assert.equal(reviewSrc.includes("factCheck"), false);

const telegramSrc = readFileSync(new URL("../api/telegram.ts", import.meta.url), "utf8");
assert.ok(telegramSrc.includes("x-telegram-bot-api-secret-token"));
assert.ok(telegramSrc.includes("TELEGRAM_WEBHOOK_SECRET"));
assert.ok(telegramSrc.includes("TG_CHAT_ID"));
assert.ok(telegramSrc.includes("publishPost"));
assert.equal(telegramSrc.includes("THREADS_ACCESS_TOKEN_OLOID"), false);
assert.ok(telegramSrc.includes("editMessageClearButtons"));
assert.ok(telegramSrc.includes("handleDraftMessage"));
assert.ok(telegramSrc.includes("sendEditPrompt"));
assert.ok(telegramSrc.includes("draftOnly"));
assert.equal(previewSrc.includes("savePublishDraft"), false);
assert.equal(previewSrc.includes("draftKeyboard"), false);
const storeSrc = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
assert.ok(storeSrc.includes("claimDecision"));
assert.ok(storeSrc.includes("threads:draft:"));
assert.ok(storeSrc.includes("threads:draft_edit:"));
assert.ok(storeSrc.includes("threads:draft_edit_last:"));
assert.ok(storeSrc.includes("NX: true"));
assert.ok(storeSrc.includes("threads:oloid_forced_review:"));
const forcedSrc = readFileSync(new URL("./oloidForcedReview.ts", import.meta.url), "utf8");
assert.ok(forcedSrc.includes("OLOID_FORCED_REVIEW_ENABLED = false"));
assert.ok(forcedSrc.includes("threads:oloid_forced_review:review-asc-mufasa093-2026-10-23"));
assert.ok(cronSrc.includes("takeOloidForcedReview"));
assert.ok(cronSrc.includes("OLOID_FORCED_REVIEW_ENABLED"));
const webhookSrc = readFileSync(new URL("../scripts/set-telegram-webhook.mjs", import.meta.url), "utf8");
assert.ok(webhookSrc.includes("setWebhook"));
assert.ok(webhookSrc.includes("secret_token"));
assert.ok(webhookSrc.includes('allowed_updates: ["callback_query", "message"]'));
assert.equal(/getUpdates\s*\(/.test(webhookSrc), false);
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  crons: { path: string; schedule: string }[];
  functions: Record<string, { maxDuration: number }>;
};
assert.equal(vercel.functions["api/telegram.ts"]?.maxDuration, 300);
assert.deepEqual(
  vercel.crons.filter((item) => item.path.includes("channel=pomazkof")).map((item) => item.schedule),
  ["0 8 * * *", "0 13 * * *", "0 18 * * *"],
);
assert.equal(vercel.crons.filter((item) => item.path.includes("channel=oloid")).length, 4);

console.log("selfcheck ok");
console.log("--- sample backstage (not model) ---\n" + backstageText);
console.log("--- sample quiet (not model) ---\n" + quietText);
console.log("--- sample dev-numbers (not model) ---\n" + numbersText);
