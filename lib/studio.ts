// Личный блог @pomazkof: все проекты Mazkof Games, не лента одного «Бюро».
// Факты — только из паспорта 14.11.2026 и безопасных фактов «Олоида», которые уже были в репозитории.
// Аккаунт @oloid.vn этот модуль не выбирает и не публикует.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { HistoryItem } from "./store.js";
import type { Media, Project, Rubric } from "./projects.js";

export const STUDIO_PROJECT_ID = "studio";
export const STUDIO_FACT_LOOKBACK = 10;
/** Событие «Первые письма» можно называть только до этого момента, не включая его. */
export const TISHINA_EVENT_UNTIL_MS = Date.parse("2026-11-21T13:55:00+03:00");
const MEDIA_ORIGIN = "https://threads-autopost-six.vercel.app";

export const STUDIO_RUBRIC_ORDER = ["how", "diary", "news", "ask", "thoughts"] as const;

const STUDIO_IDENTITY = [
  "Пост пишет Илья из Mazkof Games. Можно «я делаю» и «мы в Mazkof Games». Это личный аккаунт, не страница одной игры.",
  "У студии одна страница и кнопка «Предложить идею игры».",
];

type StudioImage = { id: string; file: string; about: string };
type StudioFact = {
  id: string;
  label: string;
  text: string;
  rubrics: readonly string[];
  image?: string;
  /** Факт гаснет в этот момент (МСК уже учтён в метке). */
  untilMs?: number;
};
type StudioSubject = {
  id: string;
  name: string;
  anchor?: string;
  storeUrl?: string;
  /** Рубрики, в которых проект вообще можно брать. Sic Mundus — только дневник. */
  rubrics: readonly string[];
  images: readonly string[];
  facts: readonly StudioFact[];
};

const IMAGES: readonly StudioImage[] = [
  { id: "tishina-pochta", file: "tishina/01_pochta.jpg", about: "пластилиновая почта на сваях, бирка до Седла, карманные часы и сумка. Текст телеграммы не пересказывай и имена с неё не называй." },
  { id: "tishina-two", file: "tishina/02_two_characters.jpg", about: "две пластилиновые фигурки у подсолнухов, бирка до Седла. Имён с табличек не называй." },
  { id: "tishina-clock", file: "tishina/03_clock.jpg", about: "пластилиновая звонарня и карманные часы. Числа с часов в текст не копируй." },
  { id: "tishina-forest", file: "tishina/04_forest.jpg", about: "пластилиновый почтальон с палкой среди ёлок. Не называй его скелетом и не делай из кадра хоррор." },
  { id: "tishina-map", file: "tishina/05_map.jpg", about: "пластилиновая карта главы «Долина»: Почта, Сваи, Звонарня, Кадушки, НИИ, Седло. Числа с карты в текст не копируй." },
  { id: "tishina-letter", file: "tishina/06_letter.jpg", about: "сумка и письмо крупным планом. Текст письма не цитируй и не пересказывай." },
  { id: "tishina-nii", file: "tishina/07_nii.jpg", about: "пластилиновое здание с табличкой «НИИ». Текст телеграммы не пересказывай." },
  { id: "tishina-goat", file: "tishina/08_kozlyonok.jpg", about: "белый козлёнок на фоне НИИ. Текст карточки не цитируй." },
  { id: "komm-map", file: "kommunalka/map.jpg", about: "план коммуналки сверху: кухня, комнаты, коридор, одна тёплая лампа. Это был самый сложный кадр." },
  { id: "komm-intro", file: "kommunalka/intro.jpg", about: "кухня коммуналки: девушка наливает чай, тёплый свет. Имени ей не давай." },
  { id: "komm-heroine", file: "kommunalka/heroine.jpg", about: "рыжая девушка с кружкой у холодильника. Имени в фактах нет — не выдумывай." },
  { id: "komm-liza", file: "kommunalka/liza.jpg", about: "портрет Лизы: светлая блузка и длинная юбка, охра." },
  { id: "komm-serafima", file: "kommunalka/serafima.jpg", about: "портрет Серафимы: серо-зелёное платье, шалфей." },
  { id: "komm-vitya", file: "kommunalka/vitya.jpg", about: "портрет Вити: тёмная футболка и штаны." },
  { id: "komm-stats", file: "kommunalka/stats.jpg", about: "инфографика «Коммуналка в цифрах». В текст можно только числа из факта этого поста. Остальные числа с картинки, двери и концовки не называй." },
  { id: "oloid-yard", file: "oloid/yard.jpg", about: "петербургский двор-колодец днём: жёлтые стены, бельё, арка." },
  { id: "oloid-kitchen", file: "oloid/kitchen.jpg", about: "коммунальная кухня: плиты, клеёнка, тёплый свет. Без сюжета." },
  { id: "oloid-bar", file: "oloid/bar.jpg", about: "подвальный бар под кирпичным сводом, тёплые лампы." },
  { id: "oloid-street", file: "oloid/street-night.jpg", about: "ночная петербургская улица, фонари и доходные дома." },
  { id: "oloid-dvor-2018", file: "oloid/02_dvor_spb_2018.jpg", about: "петербургский двор в начале игры. Год с кадра пиши только если он есть в факте этого поста." },
  { id: "oloid-corridor", file: "oloid/corridor-1.jpg", about: "коммунальный коридор: паркет ёлочкой, ряд дверей, лампочка." },
  { id: "oloid-table", file: "oloid/03_egor_tashchit_stol.jpg", about: "руки тащат стол рывками по полу. Это мини-игра движением руки, не кликом." },
];

const imageById = new Map(IMAGES.map((image) => [image.id, image]));

const OLOID_IMAGES = ["oloid-yard", "oloid-kitchen", "oloid-bar", "oloid-street", "oloid-dvor-2018", "oloid-corridor", "oloid-table"];
const TISHINA_IMAGES = ["tishina-pochta", "tishina-two", "tishina-clock", "tishina-forest", "tishina-map", "tishina-letter", "tishina-nii", "tishina-goat"];
const KOMM_IMAGES = ["komm-map", "komm-intro", "komm-heroine", "komm-liza", "komm-serafima", "komm-vitya", "komm-stats"];

const EVENT_UNTIL = TISHINA_EVENT_UNTIL_MS;

const SUBJECTS: readonly StudioSubject[] = [
  {
    id: "oloid",
    name: "Олоид",
    anchor: "oloid",
    storeUrl: "https://apps.apple.com/ru/app/id6817809325",
    rubrics: ["how", "diary", "news", "ask", "thoughts"],
    images: OLOID_IMAGES,
    facts: [
      { id: "oloid-hand", label: "мини-игра рукой", rubrics: ["how", "diary"], image: "oloid-table", text: "Мини-игры в «Олоиде» устроены движением руки, не кликом: стол, например, тащат рывками." },
      { id: "oloid-tours", label: "экскурсии", rubrics: ["how", "diary"], image: "oloid-yard", text: "Ради «Олоида» ходили на экскурсии по петербургским коммуналкам." },
      { id: "oloid-paint", label: "масляная живопись", rubrics: ["how", "diary"], image: "oloid-kitchen", text: "Визуал «Олоида» — в стиле масляной живописи, приглушённая тёплая охра. Нейросети использовались как инструмент, всё дорабатывалось вручную." },
      { id: "oloid-sprites", label: "спрайты под мазок", rubrics: ["diary"], image: "oloid-corridor", text: "Спрайты «Олоида» переписывали под мазок: окно диалога было стеклом и стало мазком." },
      { id: "oloid-what", label: "что это", rubrics: ["news", "ask", "thoughts"], image: "oloid-dvor-2018", text: "«Олоид» — мистическая визуальная новелла, не хоррор. Действие в Петербурге в 2018 году. Главный герой — документалист Егор. Эпизод I называется «Что было, то и будет»." },
      { id: "oloid-stores", label: "где вышел", rubrics: ["news"], image: "oloid-street", text: "«Олоид» вышел в App Store на iPhone и iPad и на VK Play. Android в разработке, Steam не решён: не пиши, что игра там вышла, и не ставь дату." },
      { id: "oloid-price", label: "цена эпизода", rubrics: ["news"], image: "oloid-bar", text: "Цена «Олоида» — 199 ₽ за эпизод. Рейтинг 16+. Эпизод I проходит примерно за 2–3 часа." },
      { id: "oloid-guitar", label: "гитара", rubrics: ["how", "thoughts"], image: "oloid-corridor", text: "Саундтрек «Олоида» — только сольная акустическая гитара. Имя композитора не называть. Играть лучше в наушниках." },
      { id: "oloid-ask", label: "вопрос про двор", rubrics: ["ask"], image: "oloid-yard", text: "Можно спросить, узнаёт ли человек свой старый двор. Новых фактов сверх этой фразы нет." },
      { id: "oloid-thought", label: "медленные истории", rubrics: ["thoughts"], text: "Мнение: «Олоид» для тех, кто любит медленные мистические истории и готов читать. Это не новая цифра и не обещание." },
    ],
  },
  {
    id: "tishina",
    name: "Тишина",
    anchor: "tishina",
    storeUrl: "https://apps.apple.com/app/id6831583069",
    rubrics: ["how", "diary", "news", "ask", "thoughts"],
    images: TISHINA_IMAGES,
    facts: [
      { id: "tishina-steps", label: "шаги и сумка", rubrics: ["how"], image: "tishina-pochta", text: "В «Тишине» нет шагов — герой стоит. У каждого километра свой адресат. В сумке три места, игрок выбирает, чьё письмо нести. Пропустил день — письмо ждёт." },
      { id: "tishina-clay", label: "пластилин", rubrics: ["how", "thoughts"], image: "tishina-forest", text: "Мир «Тишины» пластилиновый, в духе The Neverhood: сухой юмор и никакой стрельбы. Игра только на iPhone." },
      { id: "tishina-weather", label: "погода", rubrics: ["how"], image: "tishina-clock", text: "Реальную погоду в «Тишине» можно включить по желанию." },
      { id: "tishina-valley", label: "глава Долина", rubrics: ["news", "how"], image: "tishina-map", text: "Первая глава «Тишины» называется «Долина»: Почта, Сваи, Звонарня, Кадушки, НИИ и перевал Седло." },
      { id: "tishina-released", label: "выход", rubrics: ["news"], image: "tishina-pochta", text: "«Тишина. Последний почтальон» вышла 13.11.2026 в App Store, только на iPhone. Обе главы бесплатно, рейтинг 9+. Новые главы будут, сроков нет. В ЕС игра пока недоступна." },
      { id: "tishina-event", label: "Первые письма", rubrics: ["news"], image: "tishina-letter", untilMs: EVENT_UNTIL, text: "В App Store идёт событие «Первые письма»: с 14.11.2026 13:55 МСК до 21.11.2026 13:55 МСК. После этого момента событие не упоминать." },
      { id: "tishina-launch", label: "день запуска", rubrics: ["diary"], image: "tishina-pochta", text: "«Тишину» хотели выпустить 11.11.2026 и выпустили 13.11.2026, сразу после одобрения." },
      { id: "tishina-free", label: "вторая глава бесплатно", rubrics: ["diary", "news"], image: "tishina-map", text: "Вторую главу «Тишины» собирались сделать платной и оставили бесплатной. Обе главы бесплатно, сроков следующих глав нет." },
      { id: "tishina-screens", label: "восемь скринов", rubrics: ["diary"], image: "tishina-goat", text: "Скриншоты «Тишины» в App Store Илья заменил своими, их восемь. Восьмой — козлёнок. Цвета на скринах не меняли." },
      { id: "tishina-event-shift", label: "сдвиг события", rubrics: ["diary"], image: "tishina-nii", untilMs: EVENT_UNTIL, text: "Старт события «Первые письма» сдвинули с 17.11.2026 на 14.11.2026. Вход в игру есть из карточки события в App Store." },
      { id: "tishina-ask", label: "вопрос про шаги", rubrics: ["ask"], image: "tishina-forest", text: "Можно спросить, стали бы люди носить чужие письма своими шагами. Лор писем не рассказывать." },
      { id: "tishina-thought", label: "шаги и так есть", rubrics: ["thoughts"], image: "tishina-forest", text: "Мнение: шаги и так уже часть дня, из них можно сделать игру без стрельбы. Это не новый факт о механике." },
    ],
  },
  {
    id: "tvoyak",
    name: "Твояк",
    anchor: "tvoyak",
    rubrics: ["how", "diary", "news", "ask", "thoughts"],
    images: [],
    facts: [
      { id: "tvoyak-play", label: "экран и телефоны", rubrics: ["how", "news"], text: "«Твояк» — веб-квиз для компании: вопросы на большом экране, игроки отвечают с телефонов по коду. ИИ засчитывает близкие ответы. Игроки играют бесплатно." },
      { id: "tvoyak-host", label: "голос Марины", rubrics: ["how", "diary"], text: "Вести «Твояк» может человек или бот голосом Марины через Яндекс SpeechKit. Озвучка кэшируется." },
      { id: "tvoyak-surprise", label: "сюрпризы", rubrics: ["how"], text: "В партии «Твояка» 2–3 клетки-сюрприза и рулетка из 15 эффектов. Фон — хаус, на медиа он затихает." },
      { id: "tvoyak-away", label: "не у экрана", rubrics: ["how"], text: "В «Твояке» есть режим «Я не у экрана»." },
      { id: "tvoyak-questions", label: "отбор вопросов", rubrics: ["diary"], text: "Вопросы «Твояка» пополняются по понедельникам и пятницам из трендов. Илья отбирает их вручную. Бывают музыка, видео, картинки, ребусы, эмодзи-шифры и размытые постеры." },
      { id: "tvoyak-draw", label: "детский рисунок", rubrics: ["diary", "how"], text: "В каждой игре «Твояка» есть тема «Детский рисунок»: Дамбо, Кот в сапогах, Морозко и Нарния." },
      { id: "tvoyak-tv", label: "Яндекс ТВ", rubrics: ["diary"], text: "«Твояк» проверяли на Яндекс ТВ." },
      { id: "tvoyak-price", label: "тариф", rubrics: ["news"], text: "«Твояк» уже работает. Первая игра бесплатно, дальше 99 ₽ за партию или 499 ₽ за 30 дней безлимита. За столом 2–10 игроков и до 30 зрителей. Без политики и без 18+." },
      { id: "tvoyak-ask", label: "вопрос компании", rubrics: ["ask"], text: "Можно спросить, во что компания играет, когда есть большой экран и телефоны." },
      { id: "tvoyak-thought", label: "не экзамен", rubrics: ["thoughts"], text: "Мнение: квиз для компании ближе к вечеру за одним столом, чем к экзамену." },
    ],
  },
  {
    id: "etozhety",
    name: "Этожеты",
    anchor: "etozhety",
    rubrics: ["how", "diary", "news", "ask", "thoughts"],
    images: [],
    facts: [
      { id: "etozhety-play", label: "как играется", rubrics: ["how", "ask"], text: "«Бюро Этожеты!» собирает детективный вечер для своих: вводите игроков и получаете дело с уликами, конвертами и подозреваемыми. Убийцей может оказаться любой из вас. Стол на 4–8 гостей, партия около 90 минут." },
      { id: "etozhety-text", label: "тексты под компанию", rubrics: ["how", "diary"], text: "Тексты дела в «Этожетах» пишет нейросеть под конкретную компанию. Сервис делает один человек." },
      { id: "etozhety-home", label: "короткая главная", rubrics: ["diary"], text: "В октябре 2026 главную «Этожет» упростили до двух экранов: есть FAQ и кнопка «Прочитать готовое дело»." },
      { id: "etozhety-demo", label: "демо", rubrics: ["how", "news"], text: "На сайте «Этожет» есть бесплатное демо." },
      { id: "etozhety-price", label: "цена дела", rubrics: ["news"], text: "Дело в «Бюро Этожеты!» сейчас стоит 100 ₽. Цена временная." },
      { id: "etozhety-secret", label: "свои тайны", rubrics: ["how", "thoughts"], text: "В «Этожетах» свою тайну каждый хранит сам, а чужие выясняют разговором за столом." },
      { id: "etozhety-ask", label: "кого в подозреваемые", rubrics: ["ask"], text: "Можно спросить, кого из друзей первым записали бы в подозреваемые." },
      { id: "etozhety-thought", label: "тайна у каждого", rubrics: ["thoughts"], text: "Мнение: детективный вечер интереснее, когда тайна есть у каждого за столом, а не только на карточке." },
    ],
  },
  {
    id: "kommunalka",
    name: "Коммуналка",
    anchor: "kommunalka",
    rubrics: ["how", "diary", "news", "ask", "thoughts"],
    images: KOMM_IMAGES,
    facts: [
      { id: "komm-morning", label: "одно утро", rubrics: ["how", "news", "ask"], image: "komm-intro", text: "«Коммуналка» — браузерный симулятор одного утра: список дел и три соседа из разных веков. Нужно выйти вовремя, если квартира отпустит. Играется на телефоне и на ПК." },
      { id: "komm-plan", label: "план сверху", rubrics: ["how", "diary"], image: "komm-map", text: "План квартиры в «Коммуналке» сверху был самым сложным кадром: выбрали из трёх моделей, комнаты выверяли наложением." },
      { id: "komm-art", label: "масло и фигурки", rubrics: ["how", "diary"], image: "komm-liza", text: "Арт «Коммуналки» — масло: охра, умбра и одна тёплая лампа. Жильцов вырезали в отдельные фигурки." },
      { id: "komm-liza", label: "Лиза", rubrics: ["how", "diary"], image: "komm-liza", text: "Соседка Лиза в «Коммуналке» собрана в охре." },
      { id: "komm-serafima", label: "Серафима", rubrics: ["how", "diary"], image: "komm-serafima", text: "Соседка Серафима в «Коммуналке» собрана в шалфее." },
      { id: "komm-vitya", label: "Витя", rubrics: ["how", "diary"], image: "komm-vitya", text: "Сосед Витя в «Коммуналке» собран в серо-голубом." },
      { id: "komm-out", label: "выход", rubrics: ["news"], image: "komm-intro", text: "«Коммуналка» вышла в середине сентября 2026. Это браузерный спин-офф «Олоида»: масляная живопись и старый Петербург." },
      { id: "komm-players", label: "150 игроков", rubrics: ["news", "diary"], image: "komm-stats", text: "С 16 сентября по 8 октября 2026 в «Коммуналку» зашли 150 игроков." },
      { id: "komm-mornings", label: "116 утр", rubrics: ["news"], image: "komm-stats", text: "В «Коммуналке» за этот срок начато 116 утр, 95 из них пройдены." },
      { id: "komm-avg", label: "три утра", rubrics: ["news"], image: "komm-stats", text: "На игрока в «Коммуналке» пришлось около 3 утр." },
      { id: "komm-peak", label: "пик 29 сентября", rubrics: ["news"], image: "komm-stats", text: "Пик «Коммуналки» был 29 сентября: 30 визитов." },
      { id: "komm-return", label: "седьмой заход", rubrics: ["news"], image: "komm-stats", text: "В «Коммуналке» 8 визитов пришлось на 7-й заход и дальше." },
      { id: "komm-ontime", label: "вышли вовремя", rubrics: ["news"], image: "komm-stats", text: "Вовремя из «Коммуналки» вышли 32 из 55." },
      { id: "komm-ask", label: "успеете выйти", rubrics: ["ask"], image: "komm-intro", text: "Можно спросить, успел бы человек выйти из дома вовремя в такое утро." },
      { id: "komm-thought", label: "короткий спин-офф", rubrics: ["thoughts"], image: "komm-map", text: "Мнение: короткое утро в браузере может быть спин-оффом большой истории. Сюжет «Олоида» при этом не пересказывать." },
    ],
  },
  {
    id: "sic-mundus",
    name: "Sic Mundus",
    rubrics: ["diary"],
    images: [],
    facts: [
      { id: "sic-maps", label: "не карты", rubrics: ["diary"], text: "Первую идею Sic Mundus — фото мест и описания — не стали делать: получались Google Карты. Латынь в названии значит «так устроен мир»." },
      { id: "sic-types", label: "тип объекта", rubrics: ["diary"], text: "В Sic Mundus объект сам понимает тип: дом, природа, транспорт, житель, вещь или улица. Вещь становится гигантским памятником на площади. Дом занимает 2 на 2, транспорт 1 на 2, житель и вещь 1 на 1." },
      { id: "sic-island", label: "бесконечная карта", rubrics: ["diary"], text: "Карта Sic Mundus бесконечная. Раньше это был круглый остров. Небо, время суток и погода читаются светом." },
      { id: "sic-spin", label: "два пальца", rubrics: ["diary"], text: "Карту Sic Mundus крутят двумя пальцами. Фигурки всегда смотрят на тебя, есть компас." },
      { id: "sic-frame", label: "стиль Кадр", rubrics: ["diary"], text: "Стиль «Кадр» в Sic Mundus оставлен как одна из вариаций, не как единственный вид." },
      { id: "sic-native", label: "SwiftUI", rubrics: ["diary"], text: "Sic Mundus перенесли с веб-прототипа на натив SwiftUI, у таб-бара Liquid Glass. Адрес прототипа не называть." },
      { id: "sic-icon", label: "буква-шторка", rubrics: ["diary"], text: "Иконка Sic Mundus — «Буква-шторка» с домиком." },
      { id: "sic-splash", label: "сплэш студии", rubrics: ["diary"], text: "На сплэше Sic Mundus логотип Mazkof Games: засечный шрифт и винный глитч-мазок. Его утвердили 14.11.2026." },
      { id: "sic-login", label: "вход", rubrics: ["diary"], text: "Город Sic Mundus можно смотреть всем. Лепить фигурки можно после входа через Telegram." },
      { id: "sic-build", label: "первая сборка", rubrics: ["diary"], text: "14.11.2026 у Sic Mundus собрали первую внутреннюю сборку в TestFlight. Публичного релиза нет и сроков нет." },
    ],
  },
  {
    id: "site",
    name: "Mazkof Games",
    anchor: "",
    rubrics: ["news", "ask", "thoughts"],
    images: [],
    facts: [
      { id: "site-page", label: "одна страница", rubrics: ["news"], text: "Сайт студии — одна страница: игры и сервисы собраны на ней. Слогана нет." },
      { id: "site-idea", label: "предложить идею", rubrics: ["ask", "news"], text: "На странице студии есть кнопка «Предложить идею игры». Заявка приходит Илье." },
      { id: "site-thought", label: "зачем одна страница", rubrics: ["thoughts"], text: "Мнение: студии хватает одной страницы, если с неё видно, во что уже можно играть." },
    ],
  },
];

const subjectById = new Map(SUBJECTS.map((subject) => [subject.id, subject]));

export type StudioSlot = {
  rubricId: string;
  subjectId: string;
  subjectName: string;
  factId: string;
  factText: string;
  topic: string;
  /** Паспорт поста: кто говорит и один факт. Других фактов модель не видит. */
  facts: string[];
  steer: string;
  link?: string;
  needsDetective: boolean;
  media?: Media;
  pictureNote?: string;
};

export const STUDIO_PROJECT: Project = {
  id: "studio",
  name: "Mazkof Games",
  link: () => "https://mazkof.games/",
  requireLink: false,
  topicTags: ["Инди-игры", "Геймдев", "Разработка игр"],
  voice: [
    "Пишешь от первого лица Ильи. Можно «я делаю» и «мы в Mazkof Games». Это личный блог студии, не рекламный отдел одной игры.",
    "Весь пост строчными, как в Threads. Заглавные только у имён собственных.",
    "Короткие абзацы: одна-две связанные фразы на строке, не больше трёх. Между абзацами пустая строка. Не разбивай каждую фразу отдельной строкой. Если ссылка есть, она отдельной строкой после пустой.",
    "Один пост — один проект и один факт. Не перечисляй все игры студии и не добавляй цифр.",
    "Без капса, без хештегов, не больше одного эмодзи. Без «успей», «только сегодня» и канцелярита.",
    "Нельзя вайбкодинг, «навайбкожено», слово «вайб», рассказы что нейросеть или ИИ-агент пишет код, названия инструментов и моделей, pull request и слово «лей».",
  ].join("\n"),
  facts: STUDIO_IDENTITY,
  forbidden: [
    "Вайбкодинг, «вайб», «навайбкожено», ИИ-агенты, которые пишут код, названия инструментов и моделей, pull request и слово «лей».",
    "Инфраструктура, хостинг, IP, адреса vercel, ключи, репозитории, админки, реквизиты, ИНН, платёжные кабинеты и любые промокоды.",
    "Спойлеры «Олоида»: природа артефакта, ритуал, разгадки убийств, скелет, тайная комната. «Олоид» не называть хоррором.",
    "Не писать, что «Олоид» вышел в Steam или Android, и не ставить этим площадкам дату.",
    "«Тишина»: тайна «той ночи», содержание писем, следующие главы, их цены и даты, Android и iPad. Событие «Первые письма» — только пока оно ещё идёт.",
    "«Коммуналка»: концовки, пасхалка с дальней дверью, тёмная комната, хостинг и IP.",
    "Sic Mundus: любые ссылки, скриншоты, цены, монетизация и сроки релиза. Неутверждённые идеи не писать: общий туман, легенды, тема дня, слои времени.",
    "Жеглов, Штирлиц и Пуаро не упоминать.",
    "Сериал «Это же ты!» не упоминать: статус публикации не подтверждён.",
    "Выдуманные отзывы, выручка, данные игроков и проблемы оплаты.",
  ],
  rubrics: [
    { id: "how", weight: 1, brief: "Как делаются игры: одно продуктовое или дизайнерское решение из факта этого поста. Не рассказывай, какими инструментами пишется код." },
    { id: "diary", weight: 1, brief: "Дневник разработки: только история из факта этого поста, от первого лица. Не добавляй дат, цен и эпизодов сверх факта." },
    { id: "news", weight: 1, brief: "Релиз или новость: что уже вышло или сколько сейчас стоит, строго по факту. Не обещай дат, которых в факте нет." },
    { id: "ask", weight: 1, brief: "Вопрос читателям, на который хочется ответить. Если факт про идеи игр — позови предложить идею. Варианты не перечисляй списком." },
    { id: "thoughts", weight: 1, brief: "Мысль продакта про инди, игры или свою студию. Это мнение. Новых фактов и цифр сверх факта поста не добавляй." },
  ],
};

const STUDIO_EXTRA =
  /^(?:тишин\p{L}*|твояк\p{L}*|этожет\p{L}*|бюро|коммуналк\p{L}*|games|sic|mundus|testflight|swiftui|speechkit|neverhood|jackbox|iphone|ipad|store|play|tv|qr|яндекс\p{L}*|марин\p{L}*|илья|ильи|илье|илью|ильёй|дамбо|морозк\p{L}*|нарни\p{L}*|жидк\p{L}*)$/iu;

/** Дополнительные имена студии. Имена «Олоида» проверяет общий список. */
export function studioProperWord(word: string): boolean {
  return STUDIO_EXTRA.test(word);
}

function studioPosts(history: readonly HistoryItem[]): HistoryItem[] {
  return history.filter((item) => item.project === STUDIO_PROJECT_ID);
}

function stampOf(lastUsed: Readonly<Record<string, string | undefined>>, id: string): number {
  const raw = lastUsed[id];
  if (!raw) return 0;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? 0 : at;
}

function leastRecent<T extends { id: string }>(items: readonly T[], lastUsed: Readonly<Record<string, string | undefined>>): T {
  let best = items[0];
  let bestAt = stampOf(lastUsed, best.id);
  for (const item of items.slice(1)) {
    const at = stampOf(lastUsed, item.id);
    if (at < bestAt) {
      best = item;
      bestAt = at;
    }
  }
  return best;
}

function newestMap(history: readonly HistoryItem[], key: (item: HistoryItem) => string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of studioPosts(history)) {
    const id = key(item);
    if (!id || out[id]) continue;
    out[id] = item.at;
  }
  return out;
}

function factOpen(fact: StudioFact, now: Date): boolean {
  return fact.untilMs == null || now.getTime() < fact.untilMs;
}

function factsFor(subject: StudioSubject, rubricId: string, now: Date): StudioFact[] {
  return subject.facts.filter((fact) => fact.rubrics.includes(rubricId) && factOpen(fact, now));
}

/** id фактов, которые сейчас можно дать в эту рубрику. Для проверок даты события. */
export function studioFactIds(subjectId: string, rubricId: string, now: Date): string[] {
  const subject = subjectById.get(subjectId);
  if (!subject) return [];
  return factsFor(subject, rubricId, now).map((fact) => fact.id);
}

function recentFactIds(history: readonly HistoryItem[]): Set<string> {
  return new Set(
    studioPosts(history)
      .slice(0, STUDIO_FACT_LOOKBACK)
      .map((item) => item.studioFactId)
      .filter((id): id is string => Boolean(id)),
  );
}

export function studioWantsLink(publishedCount: number, subjectId: string): boolean {
  if (subjectId === "sic-mundus") return false;
  return publishedCount % 2 === 0;
}

export function studioLinkFor(subjectId: string, rubricId: string, publishedCount: number): string | undefined {
  if (!studioWantsLink(publishedCount, subjectId)) return undefined;
  if (rubricId === "ask") return "https://mazkof.games/";
  const subject = subjectById.get(subjectId);
  if (!subject) return undefined;
  const useStore = Math.floor(publishedCount / 2) % 2 === 1;
  if (useStore && subject.storeUrl) return subject.storeUrl;
  if (subject.anchor) return `https://mazkof.games/#${subject.anchor}`;
  return "https://mazkof.games/";
}

function fileReady(file: string): boolean {
  return existsSync(join(process.cwd(), "public", "media", file));
}

function mediaFrom(id: string | undefined): { media?: Media; pictureNote?: string } {
  if (!id) return {};
  const image = imageById.get(id);
  if (!image || !fileReady(image.file)) return {};
  return {
    media: { type: "IMAGE", url: `${MEDIA_ORIGIN}/media/${image.file}`, droppable: true },
    pictureNote: image.about,
  };
}

function pickImageId(subject: StudioSubject, fact: StudioFact, history: readonly HistoryItem[]): string | undefined {
  if (fact.image) return fact.image;
  if (!subject.images.length) return undefined;
  const pool = subject.images.filter((id) => id !== "komm-stats");
  const items = (pool.length ? pool : subject.images).map((id) => ({ id }));
  const used = newestMap(history, (item) => {
    const url = item.media ?? "";
    return subject.images.find((id) => url.endsWith(imageById.get(id)?.file ?? "\0"));
  });
  return leastRecent(items, used).id;
}

function eligibleSubjects(rubricId: string, now: Date): StudioSubject[] {
  return SUBJECTS.filter((subject) => subject.rubrics.includes(rubricId) && factsFor(subject, rubricId, now).length > 0);
}

export function pickStudioSlot(opts: {
  history: readonly HistoryItem[];
  now: Date;
  forcedRubric?: string;
  forcedTopic?: string;
}): StudioSlot {
  const posts = studioPosts(opts.history);
  const rubricItems = STUDIO_PROJECT.rubrics.filter((rubric) =>
    (STUDIO_RUBRIC_ORDER as readonly string[]).includes(rubric.id),
  );
  const forcedRubric = rubricItems.find((rubric) => rubric.id === opts.forcedRubric);
  const rubric = forcedRubric ?? leastRecent(rubricItems, newestMap(opts.history, (item) => item.rubric));
  let pool = eligibleSubjects(rubric.id, opts.now);
  const wanted = opts.forcedTopic?.trim().toLowerCase();
  const forced = wanted
    ? pool.find((subject) => subject.id === wanted || subject.name.toLowerCase().includes(wanted) || subject.facts.some((fact) => fact.id === wanted))
    : undefined;
  if (!forced) {
    const last = posts[0]?.studioSubject;
    const withoutLast = pool.filter((subject) => subject.id !== last);
    if (withoutLast.length) pool = withoutLast;
  }
  const subject = forced ?? leastRecent(pool, newestMap(opts.history, (item) => item.studioSubject));
  const openFacts = factsFor(subject, rubric.id, opts.now);
  const fresh = openFacts.filter((fact) => !recentFactIds(opts.history).has(fact.id));
  const fact = leastRecent(fresh.length ? fresh : openFacts, newestMap(opts.history, (item) => item.studioFactId));
  const count = posts.length;
  const link = studioLinkFor(subject.id, rubric.id, count);
  const shown = mediaFrom(pickImageId(subject, fact, opts.history));
  const steer = [
    `Проект этого поста: ${subject.name}. Другие проекты студии не называй.`,
    `Единственный факт, сверх которого ничего не добавляй: ${fact.text}`,
    subject.id === "etozhety" ? "Нужна одна мемная отсылка к детективу. Не Жеглов, не Штирлиц и не Пуаро. Это шутка, не связь сервиса с фильмом." : "",
    subject.id === "sic-mundus" ? "Ссылки, цены, сроки релиза и скриншоты не ставь. Адрес прототипа не пиши." : "",
    link ? "Ссылку поставь только ту, что задана отдельной строкой, и больше нигде адрес не повторяй." : "Ссылку и голый адрес не ставь. Вопрос читателю можно.",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    rubricId: rubric.id,
    subjectId: subject.id,
    subjectName: subject.name,
    factId: fact.id,
    factText: fact.text,
    topic: `${subject.name} · ${fact.label}`,
    facts: [...STUDIO_IDENTITY, fact.text],
    steer,
    link,
    needsDetective: subject.id === "etozhety",
    media: shown.media,
    pictureNote: shown.pictureNote,
  };
}

const VIBE =
  /вайб|vibe(?:[\s-]?cod(?:e|ing))?|нейросет\p{L}*\s+(?:пишет|пишут|написа\p{L}*|сгенерир\p{L}*)\s+код|ии[-\s]?агент|ai[-\s]?agent|агент\p{L}*\s+пиш\p{L}*\s+код|(?<![a-z])cursor(?![a-z])|(?<![a-z])claude(?![a-z])|(?<![a-z])chatgpt(?![a-z])|(?<![a-z])openai(?![a-z])|(?<![a-z])anthropic(?![a-z])|(?<![a-z])copilot(?![a-z])|(?<![a-z])gpt(?![a-z])|(?<![a-z])sonnet(?![a-z])|pull[\s-]?requests?|пул+[- ]?реквест|(?<![\p{L}])лей(?![\p{L}])/iu;
const LEAK =
  /vercel(?:\.app)?|версел|shop[\s_-]?id|(?<![\p{L}])инн(?![\p{L}])|(?<![\p{L}])огрн(?![\p{L}])|расч[её]тн\p{L}*\s+сч|yookassa|юkassa|юкасса|(?<![a-z0-9])(?:omsk|guest|playtest)(?![a-z0-9])|threads_access|cron_secret|anthropic_api|redis_url|preview_key|github\.com|\b\d{1,3}(?:\.\d{1,3}){3}\b/iu;
const SPOILER =
  /жеглов|штирлиц|пуаро|скелет|тайной\s+комнат|тайную\s+комнат|тайная\s+комнат|ритуал|дальн\p{L}*\s+двер|т[её]мн\p{L}*\s+комнат|хостинг|той\s+ночи|общий\s+туман|слои\s+времени|тема\s+дня|шерстян\p{L}*\s+носк|колобов/iu;
const BARE_DOMAIN =
  /mazkof\.games|oloid-game\.ru|etozhety\.ru|tvoyak\.ru|kommunalka-game\.ru|apps\.apple\.com|vkplay\.ru|vercel\.app/iu;

function numberTokens(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

/** Черновик студии: вайбкодинг, утечки, спойлеры, чужие числа и ссылка не из слота. */
export function studioProblem(text: string, slot: Pick<StudioSlot, "subjectId" | "factText" | "link">, now: Date): string | null {
  if (VIBE.test(text)) return "вайбкодинг, ИИ-агент, инструмент или «лей» — убери";
  if (LEAK.test(text)) return "в черновике инфраструктура, реквизит или промокод — убери";
  if (SPOILER.test(text)) return "спойлер или запрещённое имя — убери";
  if (/хоррор|horror|ужастик/iu.test(text)) return "хоррор не пиши";
  if (/промокод/iu.test(text)) return "промокоды не упоминать";
  if (slot.subjectId === "tishina" && /android|айпад|(?<![a-z])ipad(?![a-z])/iu.test(text)) return "у «Тишины» нет Android и iPad";
  if (slot.subjectId === "tishina" && now.getTime() >= TISHINA_EVENT_UNTIL_MS && /первые\s+письма/iu.test(text)) {
    return "событие «Первые письма» уже кончилось — не упоминай";
  }
  if (slot.subjectId === "kommunalka" && /концовк|пасхалк/iu.test(text)) return "концовку и пасхалку «Коммуналки» не пиши";
  if (slot.subjectId === "sic-mundus" && /выйдет|дата\s+выхода|монетиз|₽|(?<![\p{L}])цен(?:а|у|ы|е)(?![\p{L}])/iu.test(text)) {
    return "у Sic Mundus нет цены и срока релиза";
  }
  if (/steam/iu.test(text) && /выш|уже\s+в|релиз/iu.test(text) && !/не\s+реш[её]н|не\s+опублик/iu.test(text)) {
    return "не пиши, что игра вышла в Steam";
  }
  const allowed = new Set(numberTokens(slot.factText));
  const withoutUrls = text.replace(/https?:\/\/\S+/g, " ");
  const extra = numberTokens(withoutUrls).find((token) => !allowed.has(token));
  if (extra) return `число ${extra} не из факта этого поста`;
  const urls = (text.match(/https?:\/\/\S+/g) ?? []).map((url) => url.replace(/[.,)]+$/, ""));
  if (slot.link) {
    if (urls.length !== 1 || urls[0] !== slot.link) return `ссылка должна быть ровно одна и такой: ${slot.link}`;
    if (!text.includes(`\n\n${slot.link}`)) return "ссылка — отдельной строкой после пустой";
    if (BARE_DOMAIN.test(withoutUrls)) return "адрес только в ссылке, второй раз не пиши";
  } else if (urls.length || BARE_DOMAIN.test(text)) {
    return "в этом посте ссылки нет";
  }
  return null;
}

export function studioDetectiveHistory(history: readonly HistoryItem[]): HistoryItem[] {
  return history.map((item) =>
    item.project === STUDIO_PROJECT_ID && item.studioSubject === "etozhety" ? { ...item, project: "buro" } : item,
  );
}

export function studioRubric(id: string): Rubric | undefined {
  return STUDIO_PROJECT.rubrics.find((rubric) => rubric.id === id);
}
