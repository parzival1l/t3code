/**
 * Paints chat highlights with the CSS Custom Highlight API.
 *
 * Wrapping text in `<mark>` would mean mutating markdown that `react-markdown`
 * owns, which fights reconciliation and breaks mid-stream. A custom highlight
 * is registered as a set of `Range` objects instead, styled through
 * `::highlight(t3-chat-highlight)`, so the DOM is never modified.
 *
 * All messages share one highlight name — the API keys styling by name, not by
 * range — so this module keeps ranges per message and rebuilds the single
 * registry entry whenever any message changes.
 */

export const CHAT_HIGHLIGHT_NAME = "t3-chat-highlight";

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

type HighlightConstructor = new (...ranges: ReadonlyArray<Range>) => unknown;

function highlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === "undefined") return null;
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  return registry ?? null;
}

function highlightConstructor(): HighlightConstructor | null {
  const candidate = (globalThis as { Highlight?: HighlightConstructor }).Highlight;
  return typeof candidate === "function" ? candidate : null;
}

/**
 * Whether this runtime can paint highlights at all. Electron ships Chromium, so
 * this is true on desktop; a browser without the API degrades to storing
 * highlights that simply do not render, which is better than a broken overlay.
 */
export function supportsChatHighlights(): boolean {
  return highlightRegistry() !== null && highlightConstructor() !== null;
}

const rangesByPaintKey = new Map<string, ReadonlyArray<Range>>();

function repaint(): void {
  const registry = highlightRegistry();
  const Ctor = highlightConstructor();
  if (registry === null || Ctor === null) return;

  const allRanges = [...rangesByPaintKey.values()].flat();
  if (allRanges.length === 0) {
    registry.delete(CHAT_HIGHLIGHT_NAME);
    return;
  }
  registry.set(CHAT_HIGHLIGHT_NAME, new Ctor(...allRanges));
}

/**
 * Replaces the painted ranges for one message. Callers pass every range for
 * that message each time; partial updates would need range identity, which
 * re-rendered DOM does not preserve.
 */
export function setPaintedRanges(paintKey: string, ranges: ReadonlyArray<Range>): void {
  if (ranges.length === 0) {
    if (!rangesByPaintKey.delete(paintKey)) return;
  } else {
    rangesByPaintKey.set(paintKey, [...ranges]);
  }
  repaint();
}

/** Drops a message's ranges, e.g. when its row unmounts. */
export function clearPaintedRanges(paintKey: string): void {
  if (rangesByPaintKey.delete(paintKey)) repaint();
}

/** Test and teardown helper: forgets every painted range. */
export function clearAllPaintedRanges(): void {
  if (rangesByPaintKey.size === 0) return;
  rangesByPaintKey.clear();
  repaint();
}
