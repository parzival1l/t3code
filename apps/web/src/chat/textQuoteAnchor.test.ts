import { describe, expect, it } from "vite-plus/test";

import {
  ANCHOR_CONTEXT_LENGTH,
  buildTextQuoteAnchor,
  locateTextQuoteAnchor,
  type TextQuoteAnchor,
} from "./textQuoteAnchor";

function anchorFor(text: string, quote: string, from = 0): TextQuoteAnchor {
  const start = text.indexOf(quote, from);
  expect(start).toBeGreaterThanOrEqual(0);
  const anchor = buildTextQuoteAnchor(text, { start, end: start + quote.length });
  expect(anchor).not.toBeNull();
  return anchor as TextQuoteAnchor;
}

describe("buildTextQuoteAnchor", () => {
  it("captures the quote with context on both sides", () => {
    const text = "what is allowed to happen and what counts as success in the retry path";
    const anchor = anchorFor(text, "what counts as success");

    expect(anchor.exact).toBe("what counts as success");
    expect(text.endsWith(anchor.suffix)).toBe(true);
    expect(anchor.prefix.endsWith("and ")).toBe(true);
    expect(anchor.occurrence).toBe(0);
  });

  it("caps context at ANCHOR_CONTEXT_LENGTH on each side", () => {
    const text = `${"a".repeat(200)}QUOTE${"b".repeat(200)}`;
    const anchor = anchorFor(text, "QUOTE");

    expect(anchor.prefix).toHaveLength(ANCHOR_CONTEXT_LENGTH);
    expect(anchor.suffix).toHaveLength(ANCHOR_CONTEXT_LENGTH);
  });

  it("truncates context at the message edges without padding", () => {
    const anchor = anchorFor("QUOTE tail", "QUOTE");

    expect(anchor.prefix).toBe("");
    expect(anchor.suffix).toBe(" tail");
  });

  it("records which occurrence was selected", () => {
    const text = "retry retry retry";
    const second = buildTextQuoteAnchor(text, { start: 6, end: 11 });

    expect(second?.exact).toBe("retry");
    expect(second?.occurrence).toBe(1);
  });

  it("rejects ranges that cannot be highlighted", () => {
    const text = "some message text";

    expect(buildTextQuoteAnchor(text, { start: 4, end: 4 })).toBeNull();
    expect(buildTextQuoteAnchor(text, { start: 6, end: 2 })).toBeNull();
    expect(buildTextQuoteAnchor(text, { start: -1, end: 4 })).toBeNull();
    expect(buildTextQuoteAnchor(text, { start: 0, end: text.length + 1 })).toBeNull();
    expect(buildTextQuoteAnchor(text, { start: 1.5, end: 4 })).toBeNull();
  });

  it("rejects a whitespace-only quote, which would match almost anywhere", () => {
    expect(buildTextQuoteAnchor("alpha   beta", { start: 5, end: 8 })).toBeNull();
  });
});

describe("locateTextQuoteAnchor", () => {
  it("round-trips an unchanged message", () => {
    const text = "what is allowed to happen and what counts as success in the retry path";
    const anchor = anchorFor(text, "what counts as success");
    const start = text.indexOf("what counts as success");

    expect(locateTextQuoteAnchor(text, anchor)).toEqual({
      start,
      end: start + "what counts as success".length,
    });
  });

  it("uses context to pick the right one of several identical quotes", () => {
    const text = [
      "alpha then failure here",
      "beta then failure here",
      "gamma then failure here",
    ].join("\n");
    const anchor = anchorFor(text, "failure", text.indexOf("beta"));
    const located = locateTextQuoteAnchor(text, anchor);

    expect(located).not.toBeNull();
    expect(text.slice(0, located?.start)).toContain("beta");
    expect(text.slice(0, located?.start)).not.toContain("gamma");
  });

  it("still resolves after unrelated text changes elsewhere", () => {
    const original = "intro paragraph. what counts as success. closing paragraph.";
    const anchor = anchorFor(original, "what counts as success");
    const edited = "a totally rewritten intro. what counts as success. closing paragraph.";
    const located = locateTextQuoteAnchor(edited, anchor);

    expect(located).not.toBeNull();
    expect(edited.slice(located?.start, located?.end)).toBe("what counts as success");
  });

  it("falls back to the recorded occurrence when context is gone on both sides", () => {
    const anchor: TextQuoteAnchor = { exact: "retry", prefix: "", suffix: "", occurrence: 2 };
    const located = locateTextQuoteAnchor("retry retry retry retry", anchor);

    expect(located).toEqual({ start: 12, end: 17 });
  });

  it("returns null when the quote no longer exists", () => {
    const anchor = anchorFor("the original sentence here", "original sentence");

    expect(locateTextQuoteAnchor("this message was replaced wholesale", anchor)).toBeNull();
    expect(locateTextQuoteAnchor("", anchor)).toBeNull();
  });

  it("returns null for an empty quote rather than matching at offset zero", () => {
    const anchor: TextQuoteAnchor = { exact: "", prefix: "", suffix: "", occurrence: 0 };

    expect(locateTextQuoteAnchor("any message", anchor)).toBeNull();
  });
});
