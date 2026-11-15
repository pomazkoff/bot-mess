// Регистрирует вебхук кнопок и правок черновика. Бот в этом репозитории только шлёт sendMessage
// и не вызывает getUpdates: этот вызов заменяет предыдущий вебхук того же бота.
// После деплоя скрипт нужно запустить заново: иначе Telegram не пришлёт message, и «Редактировать» не получит текст.
//
//   openssl rand -hex 24 | npx vercel env add TELEGRAM_WEBHOOK_SECRET production
//   npx vercel deploy --prod
//   TELEGRAM_WEBHOOK_URL=https://threads-autopost-six.vercel.app/api/telegram \
//     node scripts/set-telegram-webhook.mjs
//
// В окружении команды нужны TG_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET — тот же секрет, что в Vercel.
// Секрет Telegram: 1–256 символов, только A–Z a–z 0–9 _ -

const token = process.env.TG_BOT_TOKEN?.trim() ?? "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
const url = (process.env.TELEGRAM_WEBHOOK_URL?.trim() || "https://threads-autopost-six.vercel.app/api/telegram").replace(/\/$/, "");

if (!token || !secret) {
  console.error("нужны TG_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}
if (!/^https:\/\//.test(url)) {
  console.error("TELEGRAM_WEBHOOK_URL должен начинаться с https://");
  process.exit(1);
}

const hide = (text) => text.split(token).join("***");

async function call(method, body) {
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(hide(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
  const json = await res.json().catch(() => ({}));
  return json;
}

const set = await call("setWebhook", {
  url,
  secret_token: secret,
  allowed_updates: ["callback_query", "message"],
});
if (!set.ok) {
  console.error(hide(String(set.description || "setWebhook не прошёл")));
  process.exit(1);
}

const info = await call("getWebhookInfo", {});
const result = info.result ?? {};
console.log(JSON.stringify({
  ok: true,
  url: result.url,
  pending_update_count: result.pending_update_count,
  allowed_updates: result.allowed_updates,
  last_error_message: result.last_error_message,
}, null, 2));
