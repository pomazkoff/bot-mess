import type { Project } from "./projects.js";

// Аккаунты Threads, в которые постит бот. У каждого свой токен, свои проекты (идут по очереди)
// и своё расписание: кроны в vercel.json вызывают /api/cron?channel=<id>.
export type Channel = {
  id: string;
  name: string; // для отчётов в Telegram
  tokenEnv: string; // переменная окружения с долгоживущим токеном этого аккаунта
  projects: Project["id"][];
  voiceNote?: string; // поправка к голосу проекта для этого аккаунта
  paused?: boolean; // временная пауза публикации этого аккаунта (см. /api/cron)
};

export const CHANNELS: Channel[] = [
  // Только «Бюро»: «Олоид» ведёт бренд-аккаунт, чтобы у каждого проекта было ровно 3 поста в день.
  // Временная пауза «Бюро Этожеты!» (@pomazkof). Слоты 11:00, 16:00 и 21:00 МСК
  // отвечают { skipped: "pomazkof paused" } и не шлют ошибку в Telegram.
  // Олоид (@oloid.vn) и понедельничная сводка /api/stats не затрагиваются.
  // Возобновить: убрать paused (или поставить false) и задеплоить.
  // forceNextRef и BURO_FORCE_NEXT_REF_SINCE не трогать — они сработают на первом посте после снятия паузы.
  { id: "pomazkof", name: "@pomazkof", tokenEnv: "THREADS_ACCESS_TOKEN", projects: ["buro"], paused: true },
  {
    id: "oloid",
    name: "@oloid.vn",
    tokenEnv: "THREADS_ACCESS_TOKEN_OLOID",
    projects: ["oloid"],
    voiceNote:
      "Это официальный аккаунт игры «Олоид». Пиши от лица команды («мы»): без «я», без личных мнений и историй автора. Вопросы к аудитории — от лица проекта.",
  },
];

export const channelById = (id?: string) => CHANNELS.find((c) => c.id === (id || "pomazkof"));
