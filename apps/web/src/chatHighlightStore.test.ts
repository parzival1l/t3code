import { describe, expect, it } from "vite-plus/test";

import {
  addHighlight,
  chatHighlightThreadKey,
  pruneHighlights,
  removeHighlight,
  selectMessageHighlights,
  type ChatHighlight,
  type ChatHighlightState,
} from "./chatHighlightStore";

const THREAD_KEY = chatHighlightThreadKey("env-1", "thread-1");
const MESSAGE_ID = "msg-1";

function highlight(id: string, exact: string): ChatHighlight {
  return {
    id,
    anchor: { exact, prefix: "", suffix: "", occurrence: 0 },
    createdAt: "2026-08-04T00:00:00.000Z",
  };
}

const EMPTY: ChatHighlightState = { highlightsByThreadKey: {} };

function withHighlights(...entries: ChatHighlight[]): ChatHighlightState {
  return entries.reduce<ChatHighlightState>(
    (state, entry) =>
      addHighlight(state, { threadKey: THREAD_KEY, messageId: MESSAGE_ID, highlight: entry }),
    EMPTY,
  );
}

describe("chatHighlightThreadKey", () => {
  it("scopes highlights by environment as well as thread", () => {
    expect(chatHighlightThreadKey("env-a", "t")).not.toBe(chatHighlightThreadKey("env-b", "t"));
  });
});

describe("addHighlight", () => {
  it("stores a highlight under its thread and message", () => {
    const state = withHighlights(highlight("h1", "retryable failure"));

    expect(selectMessageHighlights(state, THREAD_KEY, MESSAGE_ID)).toHaveLength(1);
    expect(selectMessageHighlights(state, THREAD_KEY, MESSAGE_ID)[0]?.id).toBe("h1");
  });

  it("keeps highlights on different messages apart", () => {
    const first = withHighlights(highlight("h1", "alpha"));
    const state = addHighlight(first, {
      threadKey: THREAD_KEY,
      messageId: "msg-2",
      highlight: highlight("h2", "beta"),
    });

    expect(selectMessageHighlights(state, THREAD_KEY, MESSAGE_ID)).toHaveLength(1);
    expect(selectMessageHighlights(state, THREAD_KEY, "msg-2")).toHaveLength(1);
  });

  it("ignores a second highlight over the same passage", () => {
    const state = withHighlights(highlight("h1", "same text"));
    const next = addHighlight(state, {
      threadKey: THREAD_KEY,
      messageId: MESSAGE_ID,
      highlight: highlight("h2", "same text"),
    });

    expect(next).toBe(state);
  });

  it("rejects malformed input without changing state", () => {
    expect(
      addHighlight(EMPTY, { threadKey: "", messageId: MESSAGE_ID, highlight: highlight("h", "x") }),
    ).toBe(EMPTY);
    expect(
      addHighlight(EMPTY, { threadKey: THREAD_KEY, messageId: "", highlight: highlight("h", "x") }),
    ).toBe(EMPTY);
    expect(
      addHighlight(EMPTY, {
        threadKey: THREAD_KEY,
        messageId: MESSAGE_ID,
        highlight: highlight("h", ""),
      }),
    ).toBe(EMPTY);
  });

  it("caps stored highlights per message", () => {
    let state = EMPTY;
    for (let index = 0; index < 70; index += 1) {
      state = addHighlight(state, {
        threadKey: THREAD_KEY,
        messageId: MESSAGE_ID,
        highlight: highlight(`h${index}`, `quote ${index}`),
      });
    }
    const stored = selectMessageHighlights(state, THREAD_KEY, MESSAGE_ID);

    expect(stored).toHaveLength(64);
    // The cap drops the oldest, so the newest highlight always survives.
    expect(stored.at(-1)?.id).toBe("h69");
  });
});

describe("removeHighlight", () => {
  it("removes one highlight and leaves the rest", () => {
    const state = withHighlights(highlight("h1", "alpha"), highlight("h2", "beta"));
    const next = removeHighlight(state, {
      threadKey: THREAD_KEY,
      messageId: MESSAGE_ID,
      highlightId: "h1",
    });

    expect(selectMessageHighlights(next, THREAD_KEY, MESSAGE_ID).map((e) => e.id)).toEqual(["h2"]);
  });

  it("drops empty containers so storage does not accumulate keys", () => {
    const state = withHighlights(highlight("h1", "alpha"));
    const next = removeHighlight(state, {
      threadKey: THREAD_KEY,
      messageId: MESSAGE_ID,
      highlightId: "h1",
    });

    expect(next.highlightsByThreadKey).toEqual({});
  });

  it("returns the same state for an unknown id", () => {
    const state = withHighlights(highlight("h1", "alpha"));

    expect(
      removeHighlight(state, {
        threadKey: THREAD_KEY,
        messageId: MESSAGE_ID,
        highlightId: "nope",
      }),
    ).toBe(state);
    expect(
      removeHighlight(state, { threadKey: "other", messageId: MESSAGE_ID, highlightId: "h1" }),
    ).toBe(state);
  });
});

describe("pruneHighlights", () => {
  it("forgets highlights whose anchors no longer resolve", () => {
    const state = withHighlights(
      highlight("h1", "alpha"),
      highlight("h2", "beta"),
      highlight("h3", "gamma"),
    );
    const next = pruneHighlights(state, {
      threadKey: THREAD_KEY,
      messageId: MESSAGE_ID,
      keepIds: ["h1", "h3"],
    });

    expect(selectMessageHighlights(next, THREAD_KEY, MESSAGE_ID).map((e) => e.id)).toEqual([
      "h1",
      "h3",
    ]);
  });

  it("is a no-op when every highlight still resolves", () => {
    const state = withHighlights(highlight("h1", "alpha"), highlight("h2", "beta"));

    expect(
      pruneHighlights(state, {
        threadKey: THREAD_KEY,
        messageId: MESSAGE_ID,
        keepIds: ["h1", "h2"],
      }),
    ).toBe(state);
  });

  it("clears the message entry when nothing resolves", () => {
    const state = withHighlights(highlight("h1", "alpha"));
    const next = pruneHighlights(state, {
      threadKey: THREAD_KEY,
      messageId: MESSAGE_ID,
      keepIds: [],
    });

    expect(next.highlightsByThreadKey).toEqual({});
  });
});

describe("selectMessageHighlights", () => {
  it("returns a stable empty array for unknown keys", () => {
    expect(selectMessageHighlights(EMPTY, THREAD_KEY, MESSAGE_ID)).toBe(
      selectMessageHighlights(EMPTY, "other", "other"),
    );
  });
});
