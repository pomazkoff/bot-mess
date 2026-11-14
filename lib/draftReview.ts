import { mayRepublishWithoutMedia } from "./oloidEditorial.js";
import { postAlreadyPublished } from "./threads.js";
import {
  chatAllowed,
  claimDecision,
  draftTelegramText,
  historyFromDraft,
  parseDraftCallback,
  publishErrorText,
  publishedNote,
  secretMatches,
  SKIPPED_NOTE,
  withOutcome,
  type ClaimResult,
  type DraftHistoryRecord,
  type DraftMedia,
  type PublishDraft,
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
};

export type TelegramUpdate = {
  callback_query?: {
    id?: string;
    data?: string;
    message?: {
      message_id?: number;
      text?: string;
      chat?: { id?: number | string };
    };
  };
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

/** Память для проверок. Замок синхронный: второй вызов в том же тике уже видит SET NX. */
export function createMemoryDraftStore(seed?: PublishDraft): DraftStore & { drafts: Map<string, PublishDraft>; history: DraftHistoryRecord[] } {
  const drafts = new Map<string, PublishDraft>();
  const locks = new Set<string>();
  const history: DraftHistoryRecord[] = [];
  if (seed) drafts.set(seed.id, { ...seed, status: seed.status ?? "pending" });

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
