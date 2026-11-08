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
import { OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_FROM, OLOID_APP_STORE_PROMO_UNTIL, OLOID_APP_STORE_RETIRED_CODES, OLOID_APP_STORE_URL, PROJECTS, factsFor, nextAppStoreCode, oloidRedeemUrl, redactAppStoreCodes, spentAppStoreCodes } from "./projects.js";
import { appStorePromoOpen, makeDraft, pickPicture, pickRubric } from "./run.js";
import type { HistoryItem } from "./store.js";
import {
  OLOID_COLOR_FACTS_PER_POST,
  OLOID_ROTATING_FACTS,
  oloidPromptFacts,
  oloidRepeatProblem,
  repeatedDetailProblem,
  spatulaProblem,
  topicRepeatsRecent,
} from "./oloidFacts.js";
import { briefThreadsError, containerSteps, pollAttachmentField } from "./threads.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHANNELS } from "./channels.js";
import {
  EDITORIAL_SKIP_REASON,
  OLOID_DIARY_ENTRIES,
  OLOID_FRAME_SOURCES,
  OLOID_REVIEWS,
  assembleReviewPost,
  diaryMedia,
  diaryProblem,
  editorialRubricOpen,
  frameMedia,
  framePairProblem,
  frameProblem,
  mayRepublishWithoutMedia,
  pickEditorial,
  quoteToPublish,
  reviewProblem,
  reviewReplyBudget,
} from "./oloidEditorial.js";
import { pickRegularShown, shownAssetFiles } from "./variety.js";

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
assert.equal(pickRegularShown("backstage", "Звук: половина работы и музыкант", {})?.id, "video-06-den");
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

звук тут половина работы: музыку написал профессиональный музыкант, и вечером это слушается в наушниках.

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

const passport = factsFor(oloid, slot1730, "backstage");
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
assert.equal(topicRepeatsRecent("Звук: половина работы и музыкант", fillers, slot1730), false);

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

assert.equal(OLOID_REVIEWS.length, 3);
assert.equal(JSON.stringify(OLOID_REVIEWS).includes("Mornkalabra"), false);
assert.equal(JSON.stringify(OLOID_REVIEWS).includes("★"), false);
const reviewRubric = oloid.rubrics.find((rubric) => rubric.id === "review");
assert.ok(reviewRubric);
for (const review of OLOID_REVIEWS) {
  assert.equal(review.platform, "app-store");
  assert.equal(review.appId, "6817809325");
  assert.equal(review.sourceUrl, OLOID_APP_STORE_URL);
  assert.equal(review.exportedOn, "2026-10-29");
  assert.equal(quoteToPublish(review)?.excerpt, false);
  const reply = "спасибо, что написали.";
  assert.ok(reply.length <= reviewReplyBudget(review, true), review.id);
  const post = assembleReviewPost(reply, review, { link: OLOID_APP_STORE_URL });
  assert.ok(post, review.id);
  assert.equal(reviewProblem(post, review), null, review.id);
  assert.ok(post.includes(review.text), review.id);
  assert.ok(post.includes(review.handle), review.id);
  assert.ok(post.length <= 450, `${review.id} ${post.length}`);
  assert.equal(ruleCheck(post, oloid, evening, reviewRubric, "oloid-review"), null, review.id);
  assert.ok(post.endsWith(OLOID_APP_STORE_URL));
  assert.equal(post.includes("utm_"), false);
}
const mufasa = OLOID_REVIEWS.find((review) => review.handle === "mufasa093");
const odosinskiy = OLOID_REVIEWS.find((review) => review.handle === "Одосинский");
const solnechny = OLOID_REVIEWS.find((review) => review.handle === "solnechny god");
assert.ok(mufasa && odosinskiy && solnechny);
const mufasaPost = assembleReviewPost("спасибо, что написали.", mufasa, { link: OLOID_APP_STORE_URL });
assert.ok(mufasaPost);
assert.ok(mufasaPost.includes("Олоид - первая"));
assert.equal(mufasaPost.includes("олоид - первая"), false);
assert.ok(mufasaPost.includes("🔥"));
assert.ok(reviewProblem(mufasaPost.replace("Жду", "Ждём"), mufasa));
assert.ok(reviewProblem(assembleReviewPost("второй эпизод выйдет скоро.", mufasa, { link: OLOID_APP_STORE_URL }) ?? "", mufasa));
assert.ok(reviewProblem(mufasaPost.replace("спасибо", "спасибо ★"), mufasa));
const pasted = assembleReviewPost("нам написали: Картинка, звук, музыка, сюжет – все. спасибо.", odosinskiy, { link: OLOID_APP_STORE_URL });
assert.ok(pasted && reviewProblem(pasted, odosinskiy));
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
assert.equal(mayRepublishWithoutMedia("diary", { type: "IMAGE", droppable: true }), true);
assert.equal(mayRepublishWithoutMedia("backstage", { type: "IMAGE" }), true);
assert.equal(mayRepublishWithoutMedia("trailer", { type: "VIDEO" }), false);
assert.equal(mayRepublishWithoutMedia("ask", { type: "CAROUSEL", droppable: true }), true);

console.log("selfcheck ok");
console.log("--- sample backstage (not model) ---\n" + backstageText);
console.log("--- sample quiet (not model) ---\n" + quietText);
console.log("--- sample dev-numbers (not model) ---\n" + numbersText);
