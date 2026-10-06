import type { Project } from "./projects.js";

// Аккаунты Threads, в которые постит бот. У каждого свой токен, свои проекты (идут по очереди)
// и своё расписание: кроны в vercel.json вызывают /api/cron?channel=<id>.
export type Channel = {
  id: string;
  name: string; // для отчётов в Telegram
  tokenEnv: string; // переменная окружения с долгоживущим токеном этого аккаунта
  projects: Project["id"][];
  voiceNote?: string; // поправка к голосу проекта для этого аккаунта
};

export const CHANNELS: Channel[] = [
  { id: "pomazkof", name: "@pomazkof", tokenEnv: "THREADS_ACCESS_TOKEN", projects: ["buro", "oloid"] },
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
