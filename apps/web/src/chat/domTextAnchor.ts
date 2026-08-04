/**
 * DOM adapter for text-quote anchoring.
 *
 * Flattens a rendered chat message into one string plus a map back to the text
 * nodes it came from, so `textQuoteAnchor.ts` can do the matching on plain
 * strings. Nothing here mutates the DOM: anchors become `Range` objects, which
 * the CSS Custom Highlight API paints without touching React's tree.
 */

import { isSkippedMarkdownElement } from "../markdown-clipboard";
import {
  buildTextQuoteAnchor,
  locateTextQuoteAnchor,
  type FlatTextRange,
  type TextQuoteAnchor,
} from "./textQuoteAnchor";

interface FlatSegment {
  readonly node: Text;
  /** Offset of this node's first character within the flattened string. */
  readonly start: number;
  readonly length: number;
}

export interface FlattenedText {
  readonly text: string;
  readonly segments: ReadonlyArray<FlatSegment>;
}

function isInsideSkippedElement(node: Node, container: Element): boolean {
  let current = node.parentElement;
  while (current !== null && current !== container) {
    if (isSkippedMarkdownElement(current)) return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * Concatenates the container's visible text nodes in document order. The
 * flattened string is what anchors are expressed against, so it must be built
 * the same way every time — hence the shared skip predicate.
 */
export function flattenElementText(container: Element): FlattenedText {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const segments: FlatSegment[] = [];
  let text = "";

  let node = walker.nextNode();
  while (node !== null) {
    const textNode = node as Text;
    const value = textNode.data;
    if (value.length > 0 && !isInsideSkippedElement(textNode, container)) {
      segments.push({ node: textNode, start: text.length, length: value.length });
      text += value;
    }
    node = walker.nextNode();
  }

  return { text, segments };
}

function flatOffsetOfBoundary(flattened: FlattenedText, node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const segment = flattened.segments.find((candidate) => candidate.node === node);
    if (!segment) return null;
    return segment.start + Math.min(offset, segment.length);
  }

  // An element boundary: Range offsets count child nodes, so map to the first
  // flattened character at or after that child.
  const child = node.childNodes[offset] ?? null;
  if (child === null) {
    const last = flattened.segments.at(-1);
    return last === undefined ? 0 : last.start + last.length;
  }
  const segment = flattened.segments.find(
    (candidate) => candidate.node === child || child.contains(candidate.node),
  );
  return segment?.start ?? null;
}

function flatRangeFromDomRange(flattened: FlattenedText, range: Range): FlatTextRange | null {
  const start = flatOffsetOfBoundary(flattened, range.startContainer, range.startOffset);
  const end = flatOffsetOfBoundary(flattened, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function domRangeFromFlatRange(flattened: FlattenedText, flat: FlatTextRange): Range | null {
  const startSegment = flattened.segments.find(
    (segment) => flat.start >= segment.start && flat.start < segment.start + segment.length,
  );
  const endSegment = flattened.segments.find(
    (segment) => flat.end > segment.start && flat.end <= segment.start + segment.length,
  );
  if (!startSegment || !endSegment) return null;

  const range = document.createRange();
  range.setStart(startSegment.node, flat.start - startSegment.start);
  range.setEnd(endSegment.node, flat.end - endSegment.start);
  return range;
}

/** Captures a live selection range as a durable anchor. */
export function buildAnchorForRange(container: Element, range: Range): TextQuoteAnchor | null {
  const flattened = flattenElementText(container);
  const flat = flatRangeFromDomRange(flattened, range);
  if (flat === null) return null;
  return buildTextQuoteAnchor(flattened.text, flat);
}

/** Resolves a stored anchor back to a paintable range, or null if it is gone. */
export function resolveAnchorToRange(container: Element, anchor: TextQuoteAnchor): Range | null {
  const flattened = flattenElementText(container);
  const flat = locateTextQuoteAnchor(flattened.text, anchor);
  if (flat === null) return null;
  return domRangeFromFlatRange(flattened, flat);
}

/** The plain text an anchor currently covers, used for chip and card labels. */
export function anchorPreviewText(anchor: TextQuoteAnchor, maxLength = 120): string {
  const collapsed = anchor.exact.replace(/\s+/g, " ").trim();
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1)}…`;
}
