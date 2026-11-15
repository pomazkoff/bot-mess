// Вишлист «Олоида» в Steam. Это не релиз и не магазин: даты выхода нет, купить там нельзя.
// Ссылка одна, без UTM. Её ставит только рубрика steam. App Store, VK Play и провокация её не берут.

export const OLOID_STEAM_URL = "https://s.team/a/5575840";
export const OLOID_STEAM_RUBRIC = "steam";

const STEAM_LINK = /s\.team|steampowered\.com|steamcommunity\.com/i;

// «Вышла в Steam», «уже в Steam», «купить в Steam», «выйдет в Steam».
// «Вышел в App Store» рядом со словом Steam сюда не попадает: рядом с Steam нет утверждения о релизе.
const STEAM_SHIPPED =
  /(?:уже\s+)?вышл\p{L}*\s+(?:в|на)\s+steam|(?:в|на)\s+steam\s+(?:уже\s+)?вышл|уже\s+(?:в|на)\s+steam|релиз(?:овал\p{L}*|нулась|а)?\s+(?:в|на)\s+steam|купить\p{L}*\s+(?:её\s+|ее\s+|игру\s+)?(?:в|на)\s+steam|steam[^.\n]{0,24}(?:купить|в\s+продаже)|выйдет\s+(?:в|на)\s+steam|(?:в|на)\s+steam\s+выйдет/iu;

const STEAM_DATE =
  /(?:\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{4}\s*год\p{L}*)[^.\n]{0,40}steam|steam[^.\n]{0,40}(?:\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{4}\s*год)/iu;

/** Утверждение, что игра в Steam уже вышла, продаётся или имеет дату. Вишлист — не то. */
export function steamReleaseProblem(text: string): string | null {
  if (!/steam/iu.test(text)) return null;
  if (STEAM_SHIPPED.test(text)) return "не пиши, что игра вышла, продаётся или скоро выйдет в Steam: есть только вишлист, даты нет";
  const bare = text.replace(/https?:\/\/\S+/g, " ");
  if (STEAM_DATE.test(bare)) return "дату выхода в Steam не называй";
  return null;
}

/** Чужая рубрика не ставит адрес Steam. Рубрика steam проверяет адрес отдельно. */
export function foreignSteamLinkProblem(text: string, rubricId: string): string | null {
  if (rubricId === OLOID_STEAM_RUBRIC) return null;
  if (STEAM_LINK.test(text)) return "ссылку Steam в этот пост не ставь";
  return null;
}
