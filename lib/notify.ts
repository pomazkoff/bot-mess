/** Отчёт в Telegram. Ошибку не пробрасывает (постинг важнее), но пишет в лог и возвращает для диагностики. */
export async function notify(msg: string): Promise<string> {
  const token = process.env.TG_BOT_TOKEN?.trim();
  const chatId = process.env.TG_CHAT_ID?.trim();
  if (!token || !chatId) return "Telegram не настроен";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg.slice(0, 4000), disable_web_page_preview: true }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (json.ok) return "ok";
    console.error("Telegram:", json.description ?? res.status);
    return `ошибка: ${json.description ?? res.status}`;
  } catch (e: any) {
    console.error("Telegram:", e?.message ?? e);
    return `ошибка: ${e?.message ?? e}`;
  }
}
