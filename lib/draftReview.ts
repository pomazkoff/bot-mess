import { mayRepublishWithoutMedia } from "./oloidEditorial.js";
import { postAlreadyPublished } from "./threads.js";
import {
  chatAllowed,
  claimDecision,
  composeEditedText,
  draftKeyboard,
  draftTelegramText,
  EDIT_ALREADY_PUBLISHED,
  EDIT_ALREADY_SKIPPED,
  editLengthReply,
  editPromptHtml,
  historyFromDraft,
  parseDraftCallback,
  publishErrorText,
  publishedNote,
  secretMatches,
  SKIPPED_NOTE,
  THREADS_TEXT_MAX,
  withOutcome,
  withReplaced,
  type ClaimResult,
  type DraftGate,
  type DraftHistoryRecord,
  type DraftMedia,
  type PendingDraftEdit,
  type PublishDraft,
  type TgButton,
} from "./drafts.js";

export type PublishedDraft = {
  postId: string;
  permalink?: string;
  mediaUrl?: string;
  clearMedia: boolean;
};

export type DraftStore = {
  get(id: string): Promise<PublishDraft | null>;
  claim(id: string): Promise<ClaimResult>;
  release(id: string): Promise<void>;
  markPublished(id: string, postId: string, permalink?: string): Promise<void>;
  skip(id: string): Promise<"ok" | "missing" | "published" | "skipped" | "busy">;
  recordPublication(item: DraftHistoryRecord, opts: { matchAt: string; clearMedia: boolean }): Promise<void>;
  gate(id: string): Promise<DraftGate>;
  updateText(id: string, text: string): Promise<"ok" | "missing" | "published" | "skipped" | "busy">;
  rememberEdit(chatId: string, pending: PendingDraftEdit): Promise<void>;
  findEdit(chatId: string, replyToMessageId?: number): Promise<PendingDraftEdit | null>;
  clearEdit(chatId: string, pending: PendingDraftEdit): Promise<void>;
};

export type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number | string };
  reply_to_message?: { message_id?: number };
};

export type TelegramUpdate = {
  callback_query?: {
    id?: string;
    data?: string;
    message?: TelegramMessage;
  };
  message?: TelegramMessage;
};

export type DraftCallbackDeps = {
  secretHeader: string | undefined;
  webhookSecret: string | undefined;
  allowedChatId: string | undefined;
  update: TelegramUpdate;
  store: DraftStore;
  publish: (draft: PublishDraft) => Promise<PublishedDraft>;
  answer: (callbackId: string, text?: string, alert?: boolean) => Promise<boolean>;
  edit: (chatId: string, messageId: number, text: string) => Promise<void>;
  reply: (chatId: string, messageId: number, text: string) => Promise<void>;
  allowChannel: (channelId: string) => boolean;
  beginEdit: (chatId: string, replyTo: number, html: string) => Promise<number>;
};

function visibleText(origin: string | undefined, draft?: PublishDraft | null): string {
  if (origin?.trim()) return origin;
  if (draft) return draftTelegramText(draft);
  return "черновик @pomazkof";
}

/** Вебхук Telegram. 401 — чужой секрет, без вызова API. После проверки секрета всегда 200: повтор Telegram не должен публиковать ещё раз. */
export async function handleDraftCallback(deps: DraftCallbackDeps): Promise<{ status: number }> {
  if (!secretMatches(deps.secretHeader, deps.webhookSecret)) return { status: 401 };
  const query = deps.update.callback_query;
  if (!query?.id) return { status: 200 };

  const message = query.message;
  const chatId = message?.chat?.id;
  const messageId = typeof message?.message_id === "number" ? message.message_id : undefined;
  const origin = message?.text;

  const answer = (text?: string, alert = false) => deps.answer(query.id as string, text, alert).catch(() => false);
  const show = async (text: string) => {
    if (chatId == null || messageId == null) return;
    await deps.edit(String(chatId), messageId, text).catch((error) => console.error("telegram edit", error));
  };

  if (!chatAllowed(chatId, deps.allowedChatId)) {
    await answer("Недоступно", true);
    return { status: 200 };
  }

  const parsed = parseDraftCallback(query.data);
  if (!parsed) {
    await answer();
    return { status: 200 };
  }
  const { action, id } = parsed;

  try {
    if (action === "edit") {
      const gate = await deps.store.gate(id);
      if (gate === "missing") {
        await answer("Черновик устарел", true);
        return { status: 200 };
      }
      if (gate === "busy") {
        await answer("Публикация уже идёт");
        return { status: 200 };
      }
      const draft = await deps.store.get(id);
      if (gate === "published" || draft?.status === "published") {
        await show(withOutcome(visibleText(origin, draft), publishedNote(draft?.permalink)));
        await answer(EDIT_ALREADY_PUBLISHED);
        return { status: 200 };
      }
      if (gate === "skipped" || draft?.status === "skipped") {
        await show(withOutcome(visibleText(origin, draft), SKIPPED_NOTE));
        await answer(EDIT_ALREADY_SKIPPED);
        return { status: 200 };
      }
      if (!draft || chatId == null || messageId == null) {
        await answer("Черновик устарел", true);
        return { status: 200 };
      }
      if (!deps.allowChannel(draft.channelId)) {
        await answer("Недоступно", true);
        return { status: 200 };
      }
      await answer("Жду текст");
      try {
        const promptId = await deps.beginEdit(String(chatId), messageId, editPromptHtml(draft.text));
        await deps.store.rememberEdit(String(chatId).trim(), {
          draftId: draft.id,
          promptMessageId: promptId,
          draftMessageId: messageId,
          originText: visibleText(origin, draft),
        });
      } catch (error) {
        console.error("telegram edit prompt", error);
        await deps.reply(String(chatId), messageId, "Не удалось запросить правку. Нажми «Редактировать» ещё раз.").catch((replyError) => console.error("telegram reply", replyError));
      }
      return { status: 200 };
    }

    if (action === "skip") {
      const result = await deps.store.skip(id);
      if (result === "missing") {
        await answer("Черновик устарел", true);
        return { status: 200 };
      }
      if (result === "busy") {
        await answer("Публикация уже идёт");
        return { status: 200 };
      }
      const draft = await deps.store.get(id);
      if (result === "published") {
        await show(withOutcome(visibleText(origin, draft), publishedNote(draft?.permalink)));
        await answer("Уже опубликовано");
        return { status: 200 };
      }
      await show(withOutcome(visibleText(origin, draft), SKIPPED_NOTE));
      await answer(result === "skipped" ? "Уже пропущено" : "Пропущено");
      return { status: 200 };
    }

    const claim = await deps.store.claim(id);
    if (claim.kind === "missing") {
      await answer("Черновик устарел", true);
      return { status: 200 };
    }
    if (claim.kind === "busy") {
      await answer("Публикация уже идёт");
      return { status: 200 };
    }
    if (claim.kind === "published") {
      await show(withOutcome(visibleText(origin, claim.draft), publishedNote(claim.draft.permalink)));
      await answer("Уже опубликовано");
      return { status: 200 };
    }
    if (claim.kind === "skipped") {
      await show(withOutcome(visibleText(origin, claim.draft), SKIPPED_NOTE));
      await answer("Уже пропущено");
      return { status: 200 };
    }

    try {
      const published = await deps.publish(claim.draft);
      await deps.store.markPublished(id, published.postId, published.permalink);
      await deps.store
        .recordPublication(historyFromDraft(claim.draft, published.postId, published.mediaUrl, published.clearMedia), {
          matchAt: claim.draft.at,
          clearMedia: published.clearMedia,
        })
        .catch((error) => console.error("history", error));
      await show(withOutcome(visibleText(origin, claim.draft), publishedNote(published.permalink)));
      await answer("Опубликовано");
      return { status: 200 };
    } catch (error) {
      await deps.store.release(id).catch((releaseError) => console.error("draft lock", releaseError));
      const errText = publishErrorText(error instanceof Error ? error.message : String(error ?? ""));
      const ok = await answer(errText, true);
      if (!ok && chatId != null && messageId != null) {
        await deps.reply(String(chatId), messageId, errText).catch((replyError) => console.error("telegram reply", replyError));
      }
      return { status: 200 };
    }
  } catch (error) {
    console.error("telegram callback", error);
    await answer("Ошибка публикации: не удалось обработать кнопку", true);
    return { status: 200 };
  }
}

export async function publishStoredDraft(
  draft: PublishDraft,
  deps: {
    channel: { draftOnly?: boolean } | undefined;
    publishPost: (media?: DraftMedia) => Promise<{ id: string }>;
    findExisting: () => Promise<string | null>;
    permalink: (postId: string) => Promise<string | undefined>;
  },
): Promise<PublishedDraft> {
  if (!deps.channel?.draftOnly) throw new Error("канал не принимает публикацию с кнопки");

  const finish = async (postId: string, used: DraftMedia | undefined): Promise<PublishedDraft> => {
    const permalink = await deps.permalink(postId).catch(() => undefined);
    const mediaUrl = used?.url || used?.urls?.[0];
    return {
      postId,
      permalink: permalink && /^https:\/\//.test(permalink) ? permalink : undefined,
      mediaUrl,
      clearMedia: Boolean(draft.media) && !used,
    };
  };

  const prior = await deps.findExisting().catch(() => null);
  if (prior) return finish(prior, draft.media);

  const take = async (media?: DraftMedia): Promise<{ id: string; used?: DraftMedia }> => {
    try {
      const published = await deps.publishPost(media);
      if (!published?.id) throw new Error("Threads: нет id");
      return { id: published.id, used: media };
    } catch (error) {
      const recovered = await deps.findExisting().catch(() => null);
      if (recovered) return { id: recovered, used: media };
      throw error;
    }
  };

  try {
    const first = await take(draft.media);
    return finish(first.id, first.used);
  } catch (error) {
    if (!draft.media || !mayRepublishWithoutMedia(draft.rubricId, draft.media) || postAlreadyPublished(error)) throw error;
    const second = await take(undefined);
    return finish(second.id, undefined);
  }
}

export type DraftMessageDeps = {
  secretHeader: string | undefined;
  webhookSecret: string | undefined;
  allowedChatId: string | undefined;
  update: TelegramUpdate;
  store: DraftStore;
  allowChannel: (channelId: string) => boolean;
  sendDraft: (chatId: string, text: string, keyboard: TgButton[][]) => Promise<void>;
  edit: (chatId: string, messageId: number, text: string) => Promise<void>;
  reply: (chatId: string, messageId: number, text: string) => Promise<void>;
};

/** Текст от владельца. В Threads не публикует: только подменяет черновик и присылает новую карточку. */
export async function handleDraftMessage(deps: DraftMessageDeps): Promise<{ status: number }> {
  if (!secretMatches(deps.secretHeader, deps.webhookSecret)) return { status: 401 };
  const message = deps.update.message;
  if (!message || typeof message.text !== "string") return { status: 200 };
  const chatId = message.chat?.id;
  if (!chatAllowed(chatId, deps.allowedChatId)) return { status: 200 };
  if (typeof message.message_id !== "number") return { status: 200 };
  const chat = String(chatId).trim();
  const messageId = message.message_id;
  const replyTo = message.reply_to_message?.message_id;
  const pending = await deps.store.findEdit(chat, typeof replyTo === "number" ? replyTo : undefined);
  if (!pending) return { status: 200 };

  const say = (text: string) => deps.reply(chat, messageId, text).catch((error) => console.error("telegram reply", error));
  const draft = await deps.store.get(pending.draftId);
  if (!draft) {
    await deps.store.clearEdit(chat, pending);
    await say("Черновик устарел");
    return { status: 200 };
  }
  if (!deps.allowChannel(draft.channelId)) {
    await deps.store.clearEdit(chat, pending);
    await say("Недоступно");
    return { status: 200 };
  }
  if (draft.status === "published") {
    await deps.store.clearEdit(chat, pending);
    await say(EDIT_ALREADY_PUBLISHED);
    return { status: 200 };
  }
  if (draft.status === "skipped") {
    await deps.store.clearEdit(chat, pending);
    await say(EDIT_ALREADY_SKIPPED);
    return { status: 200 };
  }
  if (!message.text.trim()) {
    await say("Текст пустой. Пришли исправленный текст — правка ещё ждёт.");
    return { status: 200 };
  }

  const composed = composeEditedText(draft.text, message.text, draft.studioLink);
  if (composed.text.length > THREADS_TEXT_MAX) {
    await say(editLengthReply(composed.text.length, composed.appendedLink));
    return { status: 200 };
  }

  const previous = draft.text;
  const updated = await deps.store.updateText(draft.id, composed.text);
  if (updated === "busy") {
    await say("Публикация уже идёт");
    return { status: 200 };
  }
  if (updated === "published") {
    await deps.store.clearEdit(chat, pending);
    await say(EDIT_ALREADY_PUBLISHED);
    return { status: 200 };
  }
  if (updated === "skipped") {
    await deps.store.clearEdit(chat, pending);
    await say(EDIT_ALREADY_SKIPPED);
    return { status: 200 };
  }
  if (updated !== "ok") {
    await deps.store.clearEdit(chat, pending);
    await say("Черновик устарел");
    return { status: 200 };
  }

  const fresh = (await deps.store.get(draft.id)) ?? { ...draft, text: composed.text };
  try {
    await deps.sendDraft(chat, draftTelegramText(fresh), draftKeyboard(fresh.id));
  } catch (error) {
    console.error("telegram draft", error);
    const reverted = await deps.store.updateText(draft.id, previous).catch((revertError) => {
      console.error("draft revert", revertError);
      return "missing" as const;
    });
    await say(
      reverted === "ok"
        ? "Не удалось прислать новую версию. Текст черновика не изменён. Пришли его ещё раз."
        : "Не удалось прислать новую версию. Текст уже сохранён — опубликовать можно кнопкой у старого сообщения.",
    );
    return { status: 200 };
  }
  await deps.edit(chat, pending.draftMessageId, withReplaced(pending.originText)).catch((error) => console.error("telegram edit", error));
  await deps.store.clearEdit(chat, pending);
  return { status: 200 };
}

/** Память для проверок. Замок синхронный: второй вызов в том же тике уже видит SET NX. */
export function createMemoryDraftStore(seed?: PublishDraft): DraftStore & { drafts: Map<string, PublishDraft>; history: DraftHistoryRecord[] } {
  const drafts = new Map<string, PublishDraft>();
  const locks = new Set<string>();
  const history: DraftHistoryRecord[] = [];
  const editByPrompt = new Map<string, PendingDraftEdit>();
  const editLast = new Map<string, PendingDraftEdit>();
  if (seed) drafts.set(seed.id, { ...seed, status: seed.status ?? "pending" });
  const promptKey = (chatId: string, messageId: number) => `${chatId}:${messageId}`;

  const snapshot = (id: string) => {
    const draft = drafts.get(id);
    return draft ? structuredClone(draft) : null;
  };

  return {
    drafts,
    history,
    async get(id) {
      return snapshot(id);
    },
    async claim(id) {
      const draft = snapshot(id);
      let acquired = false;
      if (draft?.status === "pending" && !locks.has(id)) {
        locks.add(id);
        acquired = true;
      }
      const decision = claimDecision(draft, acquired && draft?.status === "pending");
      if (decision.kind !== "go" && acquired) locks.delete(id);
      return decision;
    },
    async release(id) {
      locks.delete(id);
    },
    async markPublished(id, postId, permalink) {
      const draft = drafts.get(id);
      if (draft) drafts.set(id, { ...draft, status: "published", postId, permalink });
      locks.delete(id);
    },
    async skip(id) {
      const draft = drafts.get(id);
      if (!draft) return "missing";
      if (draft.status === "published") return "published";
      if (draft.status === "skipped") return "skipped";
      if (locks.has(id)) return "busy";
      drafts.set(id, { ...draft, status: "skipped" });
      return "ok";
    },
    async gate(id) {
      const draft = drafts.get(id);
      if (!draft) return "missing";
      if (draft.status === "published" || draft.status === "skipped") return draft.status;
      if (locks.has(id)) return "busy";
      return "pending";
    },
    async updateText(id, text) {
      const draft = drafts.get(id);
      if (!draft) return "missing";
      if (draft.status === "published") return "published";
      if (draft.status === "skipped") return "skipped";
      if (locks.has(id)) return "busy";
      const previous = draft.text;
      drafts.set(id, { ...draft, text });
      const row = history.find((item) => (item.channel ?? "pomazkof") === (draft.channelId || "pomazkof") && item.at === draft.at && item.text === previous && !item.postId);
      if (row) row.text = text;
      return "ok";
    },
    async rememberEdit(chatId, pending) {
      editByPrompt.set(promptKey(chatId, pending.promptMessageId), { ...pending });
      editLast.set(chatId, { ...pending });
    },
    async findEdit(chatId, replyToMessageId) {
      if (typeof replyToMessageId === "number") {
        const hit = editByPrompt.get(promptKey(chatId, replyToMessageId));
        if (hit) return { ...hit };
      }
      const last = editLast.get(chatId);
      return last ? { ...last } : null;
    },
    async clearEdit(chatId, pending) {
      editByPrompt.delete(promptKey(chatId, pending.promptMessageId));
      const last = editLast.get(chatId);
      if (last?.promptMessageId === pending.promptMessageId && last.draftId === pending.draftId) editLast.delete(chatId);
    },
    async recordPublication(item, opts) {
      const index = history.findIndex((row) => row.channel === item.channel && row.at === opts.matchAt && row.text === item.text && !row.postId);
      if (index >= 0) {
        const next = { ...history[index], postId: item.postId };
        if (opts.clearMedia) {
          delete next.media;
          delete next.mediaId;
        } else if (item.media) next.media = item.media;
        history[index] = next;
        return;
      }
      const fresh = { ...item };
      if (opts.clearMedia) {
        delete fresh.media;
        delete fresh.mediaId;
      }
      history.unshift(fresh);
    },
  };
}
