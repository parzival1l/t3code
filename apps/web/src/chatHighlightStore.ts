/**
 * Persisted chat highlights.
 *
 * A highlight is a private reading aid: it marks a passage the reader wants to
 * find again when they come back to the thread. It is never sent to a provider.
 * Annotations are the path that reaches the agent — see `annotationContext.ts`.
 *
 * Storage is localStorage for now, which means highlights are per device. Every
 * read and write goes through `readPersistedHighlights` / `persistHighlights`
 * below, so moving to a server-backed store later is a change inside this file
 * rather than at each call site.
 */

import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";

import type { TextQuoteAnchor } from "./chat/textQuoteAnchor";

export const CHAT_HIGHLIGHTS_STORAGE_KEY = "t3code:chat-highlights:v1";

/** Cap per message so a pathological thread cannot fill the storage quota. */
const MAX_HIGHLIGHTS_PER_MESSAGE = 64;

export interface ChatHighlight {
  readonly id: string;
  readonly anchor: TextQuoteAnchor;
  readonly createdAt: string;
}

/** `${environmentId}:${threadId}` → messageId → highlights. */
type HighlightsByThreadKey = Record<string, Record<string, ChatHighlight[]>>;

export interface ChatHighlightState {
  highlightsByThreadKey: HighlightsByThreadKey;
}

const EMPTY_HIGHLIGHTS: ReadonlyArray<ChatHighlight> = Object.freeze([]);

export function chatHighlightThreadKey(environmentId: string, threadId: string): string {
  return `${environmentId}:${threadId}`;
}

function isAnchor(value: unknown): value is TextQuoteAnchor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.exact === "string" &&
    candidate.exact.length > 0 &&
    typeof candidate.prefix === "string" &&
    typeof candidate.suffix === "string" &&
    typeof candidate.occurrence === "number" &&
    Number.isInteger(candidate.occurrence)
  );
}

function isHighlight(value: unknown): value is ChatHighlight {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.createdAt === "string" &&
    isAnchor(candidate.anchor)
  );
}

/**
 * Rebuilds state from storage, discarding anything malformed. A highlight is
 * disposable, so a partially corrupt payload drops the bad entries instead of
 * failing the whole read.
 */
function readPersistedHighlights(): HighlightsByThreadKey {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHAT_HIGHLIGHTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const next: HighlightsByThreadKey = {};
    for (const [threadKey, byMessage] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadKey || typeof byMessage !== "object" || byMessage === null) continue;
      const messages: Record<string, ChatHighlight[]> = {};
      for (const [messageId, entries] of Object.entries(byMessage as Record<string, unknown>)) {
        if (!messageId || !Array.isArray(entries)) continue;
        const valid = entries.filter(isHighlight).slice(0, MAX_HIGHLIGHTS_PER_MESSAGE);
        if (valid.length > 0) messages[messageId] = valid;
      }
      if (Object.keys(messages).length > 0) next[threadKey] = messages;
    }
    return next;
  } catch {
    return {};
  }
}

function persistHighlights(state: ChatHighlightState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CHAT_HIGHLIGHTS_STORAGE_KEY,
      JSON.stringify(state.highlightsByThreadKey),
    );
  } catch {
    // Ignore quota and privacy-mode errors; a lost highlight must not break chat.
  }
}

const debouncedPersist = new Debouncer(persistHighlights, { wait: 500 });

/**
 * Pure reducers. Exported so the add/remove/prune rules are unit-testable
 * without a DOM or a storage backend.
 */
export function addHighlight(
  state: ChatHighlightState,
  input: { threadKey: string; messageId: string; highlight: ChatHighlight },
): ChatHighlightState {
  const { threadKey, messageId, highlight } = input;
  if (!threadKey || !messageId || !isHighlight(highlight)) return state;

  const byMessage = state.highlightsByThreadKey[threadKey] ?? {};
  const existing = byMessage[messageId] ?? [];
  // Re-highlighting the same passage is a no-op rather than a duplicate paint.
  if (existing.some((entry) => entry.anchor.exact === highlight.anchor.exact)) return state;

  const nextEntries = [...existing, highlight].slice(-MAX_HIGHLIGHTS_PER_MESSAGE);
  return {
    highlightsByThreadKey: {
      ...state.highlightsByThreadKey,
      [threadKey]: { ...byMessage, [messageId]: nextEntries },
    },
  };
}

export function removeHighlight(
  state: ChatHighlightState,
  input: { threadKey: string; messageId: string; highlightId: string },
): ChatHighlightState {
  const { threadKey, messageId, highlightId } = input;
  const byMessage = state.highlightsByThreadKey[threadKey];
  const existing = byMessage?.[messageId];
  if (!byMessage || !existing) return state;

  const nextEntries = existing.filter((entry) => entry.id !== highlightId);
  if (nextEntries.length === existing.length) return state;

  const nextByMessage = { ...byMessage };
  if (nextEntries.length === 0) delete nextByMessage[messageId];
  else nextByMessage[messageId] = nextEntries;

  const nextByThreadKey = { ...state.highlightsByThreadKey };
  if (Object.keys(nextByMessage).length === 0) delete nextByThreadKey[threadKey];
  else nextByThreadKey[threadKey] = nextByMessage;

  return { highlightsByThreadKey: nextByThreadKey };
}

/**
 * Forgets highlights whose quote no longer appears in the message. Called after
 * a resolve pass reports misses, so a rewritten message does not keep dead
 * anchors alive in storage forever.
 */
export function pruneHighlights(
  state: ChatHighlightState,
  input: { threadKey: string; messageId: string; keepIds: ReadonlyArray<string> },
): ChatHighlightState {
  const { threadKey, messageId, keepIds } = input;
  const byMessage = state.highlightsByThreadKey[threadKey];
  const existing = byMessage?.[messageId];
  if (!byMessage || !existing) return state;

  const keep = new Set(keepIds);
  const nextEntries = existing.filter((entry) => keep.has(entry.id));
  if (nextEntries.length === existing.length) return state;

  const nextByMessage = { ...byMessage };
  if (nextEntries.length === 0) delete nextByMessage[messageId];
  else nextByMessage[messageId] = nextEntries;

  const nextByThreadKey = { ...state.highlightsByThreadKey };
  if (Object.keys(nextByMessage).length === 0) delete nextByThreadKey[threadKey];
  else nextByThreadKey[threadKey] = nextByMessage;

  return { highlightsByThreadKey: nextByThreadKey };
}

export function selectMessageHighlights(
  state: ChatHighlightState,
  threadKey: string,
  messageId: string,
): ReadonlyArray<ChatHighlight> {
  return state.highlightsByThreadKey[threadKey]?.[messageId] ?? EMPTY_HIGHLIGHTS;
}

interface ChatHighlightStore extends ChatHighlightState {
  addHighlight: (input: { threadKey: string; messageId: string; highlight: ChatHighlight }) => void;
  removeHighlight: (input: { threadKey: string; messageId: string; highlightId: string }) => void;
  pruneHighlights: (input: {
    threadKey: string;
    messageId: string;
    keepIds: ReadonlyArray<string>;
  }) => void;
}

export const useChatHighlightStore = create<ChatHighlightStore>((set) => ({
  highlightsByThreadKey: readPersistedHighlights(),
  addHighlight: (input) => set((state) => addHighlight(state, input)),
  removeHighlight: (input) => set((state) => removeHighlight(state, input)),
  pruneHighlights: (input) => set((state) => pruneHighlights(state, input)),
}));

useChatHighlightStore.subscribe((state) => debouncedPersist.maybeExecute(state));

/** Test helper: resets in-memory state and the persisted payload. */
export function resetChatHighlightStoreForTest(): void {
  useChatHighlightStore.setState({ highlightsByThreadKey: {} });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(CHAT_HIGHLIGHTS_STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }
}
