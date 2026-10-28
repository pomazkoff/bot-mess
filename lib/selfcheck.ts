// Локальные проверки очереди, цифр, тихого поста и образцов.
// Запуск: npx tsx lib/selfcheck.ts
// Образцы ниже — не вывод модели.

import assert from "node:assert/strict";
import { OLOID_DEV_NUMBER_FACTS, OLOID_DEV_NUMBERS_RUBRIC, devNumberProblem, numberTokens } from "./devFacts.js";
import { factCardCaptionLines, factCardEligible, factCardProblem, factCardPublicUrl, factCardTitleLines, mediaUsesPicture, pictureByBg } from "./factCard.js";
import { assertFactCardPng, renderFactCard } from "./factCardRender.js";
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
import { OLOID_APP_STORE_CODES, OLOID_APP_STORE_PROMO_FROM, OLOID_APP_STORE_PROMO_UNTIL, OLOID_APP_STORE_RETIRED_CODES, PROJECTS, factsFor, nextAppStoreCode, oloidRedeemUrl, redactAppStoreCodes, spentAppStoreCodes } from "./projects.js";
import { appStorePromoOpen, pickPicture, pickRubric } from "./run.js";
import type { HistoryItem } from "./store.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pickRegularShown, shownAssetFiles } from "./variety.js";

const oloid = PROJECTS.find((project) => project.id === "oloid");
assert.ok(oloid);

const evening = new Date("2026-10-24T17:00:00.000Z"); // 20:00 МСК
const day = "2026-10-24";

const banned = ["94", "TLENUM", "достижен", "secret", "нише", "ломом", "2–3", "2-3", "кирпич", "Android", "меню выбора"];
const blob = OLOID_DEV_NUMBER_FACTS.map((fact) => fact.text).join("\n");
for (const word of banned) assert.equal(blob.includes(word), false, word);
assert.equal(new Set(OLOID_DEV_NUMBER_FACTS.map((fact) => fact.id)).size, OLOID_DEV_NUMBER_FACTS.length);
assert.ok(OLOID_DEV_NUMBER_FACTS.length > 0);

const pool = eligibleRotationRubrics(oloid);
assert.deepEqual(
  pool.map((rubric) => rubric.id),
  ["backstage", "detail", "ask", "petersburg", OLOID_DEV_NUMBERS_RUBRIC],
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
assert.ok(pollOptionsProblem(["только один"]));
assert.ok(pollOptionsProblem(["двор", "а".repeat(26)]));
assert.ok(pollOptionsProblem(["двор", "2018"]));
assert.ok(pollOptionsProblem(["хоррор", "мистика"]));

const voice = OLOID_DEV_NUMBER_FACTS.find((fact) => fact.id === "voice-839");
assert.ok(voice);
assert.equal(devNumberProblem("сейчас 839 файлов", voice.text), null);
assert.ok(devNumberProblem("в игре 94 точки перехода", voice.text));
assert.ok(devNumberProblem("прохождение 2–3 часа", voice.text));
assert.ok(devNumberProblem("цена 500", voice.text));
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
assert.equal(pickRegularShown("backstage", "Почему гвозди вытаскиваются протяжкой, а не кликом", {})?.id, "04_vybory_minigry");
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
assert.equal(provocationFacts.includes("500 ₽"), false);
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
assert.ok(provocationNumberProblem("цена 500 рублей", provocationFacts));
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
assert.ok(appStorePriceProblem(`${promoText}\n\nцена 500`, "oloid", "appstore-promo"));
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

const cardSrc = readFileSync(new URL("../api/card.ts", import.meta.url), "utf8");
assert.equal(cardSrc.includes("CRON_SECRET"), false);
assert.equal(cardSrc.includes("pictureByBg"), true);
assert.match(cronSrc, /карточка не собралась \(/);
assert.match(cronSrc, /в посте обычный кадр/);
const resolveIdx = cronSrc.indexOf("await resolveCardMedia");
assert.ok(resolveIdx > 0 && resolveIdx < publishIdx);
assert.equal(previewSrc.includes("../lib/threads.js"), false);

assert.equal(factCardEligible({ projectId: "oloid", rubricId: "backstage", picture: true, poll: false, shown: false, rubricMedia: false }), true);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "dev-numbers", picture: true, poll: false, shown: false, rubricMedia: false }), true);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "appstore", picture: true, poll: false, shown: false, rubricMedia: false }), false);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "appstore-promo", picture: true, poll: false, shown: false, rubricMedia: false }), false);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "vkplay", picture: true, poll: false, shown: false, rubricMedia: false }), false);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "trailer", picture: false, poll: false, shown: false, rubricMedia: true }), false);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "provocation", picture: true, poll: true, shown: false, rubricMedia: false }), false);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "ask", picture: true, poll: true, shown: false, rubricMedia: false }), false);
assert.equal(factCardEligible({ projectId: "oloid", rubricId: "backstage", picture: false, poll: false, shown: true, rubricMedia: false }), false);
assert.equal(factCardEligible({ projectId: "buro", rubricId: "backstage", picture: true, poll: false, shown: false, rubricMedia: false }), false);

const cardOk = { title: "Две плиты", caption: "На коммунальной кухне две газовые плиты, клеёнка и разговор, который заводится сам." };
assert.equal(factCardProblem(cardOk, { required: true }), null);
assert.equal(factCardProblem(cardOk, { required: false }), null);
assert.ok(factCardProblem({ title: "Плиты", caption: cardOk.caption }, { required: true }));
assert.ok(factCardProblem({ title: "Две плиты и ещё стол", caption: cardOk.caption }, { required: true }));
assert.ok(factCardProblem({ title: cardOk.title, caption: "а".repeat(111) }, { required: true }));
assert.ok(factCardProblem({ title: cardOk.title, caption: "это хоррор про кухню коммуналки и две плиты у окна" }, { required: true }));
assert.ok(factCardProblem({ title: cardOk.title, caption: "скелет на кухне, две плиты и клеёнка, и разговор сам заводится" }, { required: true }));
assert.ok(factCardProblem({ title: "Цена игры", caption: "В App Store игра стоит 500 рублей, и это вся цена." }, { required: true }));
assert.ok(factCardProblem({ title: cardOk.title, caption: "калейдоскоп плит на коммунальной кухне, клеёнка и разговор" }, { required: true, stopList: oloid.stopList }));
assert.ok(factCardProblem({ title: cardOk.title, caption: "скачай и поиграй на кухне с двумя плитами" }, { required: true, quiet: true }));
assert.equal(factCardProblem({ title: "839 файлов", caption: "Озвучки набралось 839 файлов: Егор, Вера, Алик и остальные роли." }, { required: true, devFact: voice.text }), null);
assert.ok(factCardProblem({ title: "1600 реплик", caption: "В игре около 1600 реплик и 839 файлов озвучки." }, { required: true, devFact: voice.text }));
assert.deepEqual(factCardTitleLines("Семейное древо"), ["СЕМЕЙНОЕ", "ДРЕВО"]);
assert.deepEqual(factCardTitleLines("Две плиты"), ["ДВЕ ПЛИТЫ"]);
assert.equal(factCardCaptionLines(cardOk.caption).length <= 2, true);

const kitchen = oloid.pictures?.find((picture) => picture.url.endsWith("/oloid/kitchen.jpg"));
assert.ok(kitchen);
const cardUrl = factCardPublicUrl(kitchen.url, cardOk.title, cardOk.caption);
assert.equal(mediaUsesPicture(cardUrl, kitchen.url), true);
assert.equal(mediaUsesPicture(kitchen.url, kitchen.url), true);
assert.equal(pictureByBg("oloid/appstore/01_kommunalka_v2.jpg"), undefined);
assert.equal(pictureByBg("oloid/../secrets.jpg"), undefined);
const detail = oloid.rubrics.find((rubric) => rubric.id === "detail");
assert.ok(detail);
const again = pickPicture(oloid, detail, "кухня клеёнка", [{ project: "oloid", rubric: "detail", text: "x", at: evening.toISOString(), media: cardUrl }]);
assert.notEqual(again?.url, kitchen.url);

assert.equal(existsSync("lib/fonts/Jost-300-Light.ttf"), true);
assert.equal(existsSync("lib/brand/oloid-logo.png"), true);
const rendered = await renderFactCard({ pictureUrl: kitchen.url, title: cardOk.title, caption: cardOk.caption });
assertFactCardPng(rendered);
const { data, info } = await (await import("sharp")).default(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let gold = 0;
for (let i = 0; i < data.length; i += info.channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r > 230 && g > 170 && g < 215 && b > 30 && b < 75 && g - b > 110) gold++;
}
assert.ok(gold > 500, `жёлтый заголовок не нарисован (${gold})`);
for (const file of ["docs/cards/yard.png", "docs/cards/kitchen.png", "docs/cards/voice.png"]) {
  assert.equal(existsSync(file), true, file);
  const sample = readFileSync(file);
  assertFactCardPng(sample);
}

console.log("selfcheck ok");
console.log("--- sample backstage (not model) ---\n" + backstageText);
console.log("--- sample quiet (not model) ---\n" + quietText);
console.log("--- sample dev-numbers (not model) ---\n" + numbersText);
