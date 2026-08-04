/**
 * Text-quote anchoring for chat highlights.
 *
 * A highlight has to survive a reload and every React re-render of the message
 * it sits in, so it cannot be stored as DOM coordinates. It is stored the way
 * the W3C Web Annotation model stores one instead: the exact quoted text plus a
 * little context on each side. Resolving an anchor means searching the
 * message's flattened text for that quote again.
 *
 * This module is deliberately DOM-free — it works on a flat string and integer
 * offsets — so the matching rules are unit-testable. `domTextAnchor.ts` adapts
 * it to real text nodes and `Range` objects.
 */

/** How much text on each side of the quote is kept to disambiguate it. */
export const ANCHOR_CONTEXT_LENGTH = 32;

export interface TextQuoteAnchor {
  /** The highlighted text itself. */
  readonly exact: string;
  /** Up to ANCHOR_CONTEXT_LENGTH characters immediately before `exact`. */
  readonly prefix: string;
  /** Up to ANCHOR_CONTEXT_LENGTH characters immediately after `exact`. */
  readonly suffix: string;
  /**
   * Which match of `exact` this was, counting from the start of the message.
   * Only used to break ties when prefix and suffix score equally — a message
   * that repeats a phrase in identical surroundings still resolves stably.
   */
  readonly occurrence: number;
}

export interface FlatTextRange {
  readonly start: number;
  readonly end: number;
}

function occurrencesOf(flatText: string, exact: string): number[] {
  const found: number[] = [];
  if (exact.length === 0) return found;
  let index = flatText.indexOf(exact);
  while (index !== -1) {
    found.push(index);
    index = flatText.indexOf(exact, index + 1);
  }
  return found;
}

/** Length of the longest shared ending between two strings. */
function commonSuffixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let matched = 0;
  while (matched < limit && left[left.length - 1 - matched] === right[right.length - 1 - matched]) {
    matched += 1;
  }
  return matched;
}

/** Length of the longest shared beginning between two strings. */
function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let matched = 0;
  while (matched < limit && left[matched] === right[matched]) {
    matched += 1;
  }
  return matched;
}

/**
 * Captures a range as a quote plus context. Returns null for a range that is
 * empty, out of bounds, or entirely whitespace — none of those are meaningful
 * to highlight, and a whitespace quote would match almost anywhere on reload.
 */
export function buildTextQuoteAnchor(
  flatText: string,
  range: FlatTextRange,
): TextQuoteAnchor | null {
  const { start, end } = range;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end > flatText.length || end <= start) return null;

  const exact = flatText.slice(start, end);
  if (exact.trim().length === 0) return null;

  return {
    exact,
    prefix: flatText.slice(Math.max(0, start - ANCHOR_CONTEXT_LENGTH), start),
    suffix: flatText.slice(end, Math.min(flatText.length, end + ANCHOR_CONTEXT_LENGTH)),
    occurrence: occurrencesOf(flatText, exact).filter((index) => index < start).length,
  };
}

/**
 * Finds where an anchor now sits. Every occurrence of `exact` is scored by how
 * much of the recorded prefix and suffix still lines up, so an edit elsewhere in
 * the message does not move the highlight. Returns null when the quote is gone
 * entirely, which is the signal to drop the highlight rather than guess.
 */
export function locateTextQuoteAnchor(
  flatText: string,
  anchor: TextQuoteAnchor,
): FlatTextRange | null {
  const candidates = occurrencesOf(flatText, anchor.exact);
  if (candidates.length === 0) return null;

  let best: { start: number; end: number; score: number; drift: number } | null = null;

  for (const [occurrence, start] of candidates.entries()) {
    const end = start + anchor.exact.length;
    const precedingText = flatText.slice(Math.max(0, start - anchor.prefix.length), start);
    const followingText = flatText.slice(end, end + anchor.suffix.length);
    const score =
      commonSuffixLength(precedingText, anchor.prefix) +
      commonPrefixLength(followingText, anchor.suffix);
    const drift = Math.abs(occurrence - anchor.occurrence);

    if (best === null || score > best.score || (score === best.score && drift < best.drift)) {
      best = { start, end, score, drift };
    }
  }

  return best === null ? null : { start: best.start, end: best.end };
}
