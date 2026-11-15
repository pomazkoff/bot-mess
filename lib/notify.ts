import type { TgButton } from "./drafts.js";

function botToken(): string | undefined {
  return process.env.TG_BOT_TOKEN?.trim() || undefined;
}

async function telegram(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; description?: string; messageId?: number }> {
  const token = botToken();
  if (!token) return { ok: false, description: "Telegram не настроен" };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (json.ok) {
    const messageId = json.result?.message_id;
    return { ok: true, messageId: typeof messageId === "number" ? messageId : undefined };
  }
  return { ok: false, description: String(json.description ?? res.status) };
}

/** Отчёт в Telegram. Ошибку не пробрасывает (постинг важнее), но пишет в лог и возвращает для диагностики. */
export async function notify(msg: string, keyboard?: TgButton[][]): Promise<string> {
  const chatId = process.env.TG_CHAT_ID?.trim();
  if (!botToken() || !chatId) return "Telegram не настроен";
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: msg.slice(0, 4000),
    disable_web_page_preview: true,
  };
  if (keyboard?.length) payload.reply_markup = { inline_keyboard: keyboard };
  try {
    const json = await telegram("sendMessage", payload);
    if (json.ok) return "ok";
    console.error("Telegram:", json.description);
    return `ошибка: ${json.description}`;
  } catch (e: any) {
    console.error("Telegram:", e?.message ?? e);
    return `ошибка: ${e?.message ?? e}`;
  }
}

/** Снимает крутилку на кнопке. text — всплывашка, не длиннее 200 символов. false — запрос уже протух. */
export async function answerCallbackQuery(callbackId: string, text?: string, alert = false): Promise<boolean> {
  try {
    const json = await telegram("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: text?.slice(0, 200),
      show_alert: Boolean(alert && text),
    });
    if (json.ok) return true;
    console.error("Telegram answerCallbackQuery:", json.description);
    return false;
  } catch (e: any) {
    console.error("Telegram answerCallbackQuery:", e?.message ?? e);
    return false;
  }
}

/** Новый текст и пустая клавиатура. «message is not modified» — кнопки уже сняты. */
export async function editMessageClearButtons(chatId: string, messageId: number, text: string): Promise<void> {
  const json = await telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4096),
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
  if (json.ok) return;
  if (/message is not modified/i.test(json.description ?? "")) return;
  throw new Error(json.description || "editMessageText");
}

export async function replyMessage(chatId: string, messageId: number, text: string): Promise<void> {
  const json = await telegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    reply_to_message_id: messageId,
    disable_web_page_preview: true,
  });
  if (!json.ok) throw new Error(json.description || "sendMessage");
}

/** Просьба прислать текст ответом. message_id нужен, чтобы узнать, какой черновик правят. */
export async function sendEditPrompt(chatId: string, replyTo: number, html: string): Promise<number> {
  const json = await telegram("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    reply_to_message_id: replyTo,
    disable_web_page_preview: true,
    reply_markup: { force_reply: true, selective: true },
  });
  if (!json.ok || json.messageId == null) throw new Error(json.description || "sendMessage");
  return json.messageId;
}

/** Новая карточка черновика с кнопками. В Threads ничего не отправляет. */
export async function sendDraftCard(chatId: string, text: string, keyboard: TgButton[][]): Promise<void> {
  const json = await telegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
    reply_markup: keyboard.length ? { inline_keyboard: keyboard } : undefined,
  });
  if (!json.ok) throw new Error(json.description || "sendMessage");
}
