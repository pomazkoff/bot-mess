import type { VercelRequest, VercelResponse } from "@vercel/node";
import { channelById } from "../lib/channels.js";
import { handleDraftCallback, handleDraftMessage, publishStoredDraft, type DraftStore, type TelegramUpdate } from "../lib/draftReview.js";
import { DRAFT_TTL_SEC } from "../lib/drafts.js";
import { answerCallbackQuery, editMessageClearButtons, replyMessage, sendDraftCard, sendEditPrompt } from "../lib/notify.js";
import {
  claimPublishDraft,
  clearDraftEdit,
  findDraftEdit,
  gatePublishDraft,
  getPublishDraft,
  markDraftPublished,
  recordDraftPublication,
  releaseDraftClaim,
  rememberDraftEdit,
  skipPublishDraft,
  updatePublishDraftText,
} from "../lib/store.js";
import { findRecentPostByText, postPermalink, publishPost } from "../lib/threads.js";

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

const draftStore: DraftStore = {
  get: getPublishDraft,
  claim: claimPublishDraft,
  release: releaseDraftClaim,
  markPublished: markDraftPublished,
  skip: skipPublishDraft,
  recordPublication: recordDraftPublication,
  gate: gatePublishDraft,
  updateText: updatePublishDraftText,
  rememberEdit: rememberDraftEdit,
  findEdit: findDraftEdit,
  clearEdit: clearDraftEdit,
};

const allowDraftChannel = (channelId: string) => Boolean(channelById(channelId)?.draftOnly);

// Кнопки под черновиком @pomazkof. Крон сюда не ходит и сам в Threads не публикует.
// Секрет вебхука — TELEGRAM_WEBHOOK_SECRET, чат — тот же TG_CHAT_ID, куда уходят отчёты.
// Сообщение с правкой только меняет текст черновика. Публикация — по-прежнему кнопка «Опубликовать».
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  let update: TelegramUpdate = {};
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    update = body && typeof body === "object" ? (body as TelegramUpdate) : {};
  } catch {
    update = {};
  }
  const secretHeader = header(req, "x-telegram-bot-api-secret-token");
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const allowedChatId = process.env.TG_CHAT_ID?.trim();
  if (update.message && !update.callback_query) {
    const edited = await handleDraftMessage({
      secretHeader,
      webhookSecret,
      allowedChatId,
      update,
      store: draftStore,
      allowChannel: allowDraftChannel,
      sendDraft: sendDraftCard,
      edit: editMessageClearButtons,
      reply: replyMessage,
    });
    if (edited.status === 401) return res.status(401).json({ error: "unauthorized" });
    return res.status(200).json({ ok: true });
  }
  const result = await handleDraftCallback({
    secretHeader,
    webhookSecret,
    allowedChatId,
    update,
    store: draftStore,
    allowChannel: allowDraftChannel,
    beginEdit: sendEditPrompt,
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
