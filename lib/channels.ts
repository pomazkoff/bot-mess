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
  /** Крон собирает пост как для публикации, но в Threads его не отправляет: текст, картинка и ссылка уходят в Telegram. */
  draftOnly?: boolean;
};

export const CHANNELS: Channel[] = [
  // Личный блог Ильи обо всех проектах Mazkof Games. Слоты 11:00, 16:00 и 21:00 МСК.
  // draftOnly: черновик в Telegram («черновик @pomazkof»), без публикации. Токен — THREADS_ACCESS_TOKEN.
  // Снять черновики и начать публиковать: убрать draftOnly (или поставить false) и задеплоить. Других правок не нужно.
  // @oloid.vn этот флаг не касается.
  {
    id: "pomazkof",
    name: "@pomazkof",
    tokenEnv: "THREADS_ACCESS_TOKEN",
    projects: ["studio"],
    draftOnly: true,
    voiceNote: "Личный аккаунт Ильи. Пиши от первого лица («я делаю», «мы в Mazkof Games»), не от лица одной игры.",
  },
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
