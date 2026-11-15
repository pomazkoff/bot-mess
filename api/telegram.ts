import type { VercelRequest, VercelResponse } from "@vercel/node";
import { channelById } from "../lib/channels.js";
import { handleDraftCallback, publishStoredDraft, type TelegramUpdate } from "../lib/draftReview.js";
import { DRAFT_TTL_SEC } from "../lib/drafts.js";
import { answerCallbackQuery, editMessageClearButtons, replyMessage } from "../lib/notify.js";
import {
  claimPublishDraft,
  getPublishDraft,
  markDraftPublished,
  recordDraftPublication,
  releaseDraftClaim,
  skipPublishDraft,
} from "../lib/store.js";
import { findRecentPostByText, postPermalink, publishPost } from "../lib/threads.js";

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// Кнопки под черновиком @pomazkof. Крон сюда не ходит и сам в Threads не публикует.
// Секрет вебхука — TELEGRAM_WEBHOOK_SECRET, чат — тот же TG_CHAT_ID, куда уходят отчёты.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  let update: TelegramUpdate = {};
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    update = body && typeof body === "object" ? (body as TelegramUpdate) : {};
  } catch {
    update = {};
  }
  const result = await handleDraftCallback({
    secretHeader: header(req, "x-telegram-bot-api-secret-token"),
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim(),
    allowedChatId: process.env.TG_CHAT_ID?.trim(),
    update,
    store: {
      get: getPublishDraft,
      claim: claimPublishDraft,
      release: releaseDraftClaim,
      markPublished: markDraftPublished,
      skip: skipPublishDraft,
      recordPublication: recordDraftPublication,
    },
    publish: async (draft) => {
      const channel = channelById(draft.channelId);
      return publishStoredDraft(draft, {
        channel,
        publishPost: (media) => {
          if (!channel) throw new Error("канал не найден");
          return publishPost(channel, draft.text, draft.topicTag, media, draft.poll);
        },
        findExisting: () => {
          if (!channel) return Promise.resolve(null);
          return findRecentPostByText(channel, draft.text, DRAFT_TTL_SEC * 1000);
        },
        permalink: (postId) => {
          if (!channel) return Promise.resolve(undefined);
          return postPermalink(channel, postId);
        },
      });
    },
    answer: answerCallbackQuery,
    edit: editMessageClearButtons,
    reply: replyMessage,
  });
  if (result.status === 401) return res.status(401).json({ error: "unauthorized" });
  return res.status(200).json({ ok: true });
}
