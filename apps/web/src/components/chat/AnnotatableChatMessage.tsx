import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatAnnotationPopover } from "./ChatAnnotationPopover";
import { ChatSelectionToolbar, type SelectionToolbarAnchorRect } from "./ChatSelectionToolbar";
import { buildAnchorForRange, resolveAnchorToRange } from "~/chat/domTextAnchor";
import { clearPaintedRanges, setPaintedRanges } from "~/chat/highlightPainter";
import type { TextQuoteAnchor } from "~/chat/textQuoteAnchor";
import { selectMessageHighlights, useChatHighlightStore } from "~/chatHighlightStore";
import { useComposerDraftStore, type DraftId } from "~/composerDraftStore";
import type { AnnotationContext } from "~/annotationContext";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { chatMarkdownClipboardPayload } from "~/markdown-clipboard";
import type { ScopedThreadRef } from "@t3tools/contracts";

interface PendingSelection {
  readonly range: Range;
  readonly rect: SelectionToolbarAnchorRect;
  /** The selection as markdown, so an annotation keeps lists and code intact. */
  readonly markdown: string;
  readonly anchor: TextQuoteAnchor;
  /** Id of an existing highlight the selection overlaps, if any. */
  readonly overlappingHighlightId: string | null;
}

interface AnnotatableChatMessageProps {
  threadKey: string;
  messageId: string;
  composerDraftTarget: ScopedThreadRef | DraftId;
  /** Selection actions stay off while text is still arriving. */
  isStreaming: boolean;
  children: React.ReactNode;
}

function rangesOverlap(left: Range, right: Range): boolean {
  return (
    left.compareBoundaryPoints(Range.END_TO_START, right) < 0 &&
    left.compareBoundaryPoints(Range.START_TO_END, right) > 0
  );
}

function toAnchorRect(range: Range): SelectionToolbarAnchorRect | null {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, bottom: rect.bottom };
}

function isInsideOwnUi(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return (
    element?.closest(
      "[data-chat-selection-toolbar='true'],[data-chat-annotation-popover='true']",
    ) != null
  );
}

/**
 * Adds highlight, annotate, and copy to one rendered assistant message.
 *
 * Highlights are painted through the CSS Custom Highlight API, so this component
 * never mutates the markdown React rendered — see `highlightPainter.ts`. That is
 * what lets a highlight survive re-render and streaming without corrupting the
 * message.
 */
export function AnnotatableChatMessage({
  threadKey,
  messageId,
  composerDraftTarget,
  isStreaming,
  children,
}: AnnotatableChatMessageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);

  const highlights = useChatHighlightStore((store) =>
    selectMessageHighlights(store, threadKey, messageId),
  );
  const addHighlight = useChatHighlightStore((store) => store.addHighlight);
  const removeHighlight = useChatHighlightStore((store) => store.removeHighlight);
  const pruneHighlights = useChatHighlightStore((store) => store.pruneHighlights);
  const addChatAnnotation = useComposerDraftStore((store) => store.addChatAnnotation);

  const paintKey = useMemo(() => `${threadKey}:${messageId}`, [threadKey, messageId]);

  // Resolve stored anchors against the DOM as it stands now, paint the hits, and
  // forget the misses. Runs whenever the message text or the highlight set
  // changes, which covers re-render, stream completion, and edits.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ranges: Range[] = [];
    const resolvedIds: string[] = [];
    for (const highlight of highlights) {
      const range = resolveAnchorToRange(container, highlight.anchor);
      if (range === null) continue;
      ranges.push(range);
      resolvedIds.push(highlight.id);
    }
    setPaintedRanges(paintKey, ranges);

    if (resolvedIds.length !== highlights.length && !isStreaming) {
      // Mid-stream misses are expected, so only prune once the text has settled.
      pruneHighlights({ threadKey, messageId, keepIds: resolvedIds });
    }
  }, [highlights, isStreaming, messageId, paintKey, pruneHighlights, threadKey]);

  useEffect(() => () => clearPaintedRanges(paintKey), [paintKey]);

  const dismiss = useCallback(() => {
    setPending(null);
    setIsAnnotating(false);
  }, []);

  // Track the browser selection rather than mouse events: this way a
  // keyboard-extended or double-click selection gets the same toolbar.
  useEffect(() => {
    if (isStreaming) return;

    const onSelectionChange = () => {
      // While the note editor is open the textarea owns the selection.
      if (isAnnotating) return;

      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPending(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setPending(null);
        return;
      }

      const rect = toAnchorRect(range);
      const anchor = buildAnchorForRange(container, range);
      const payload = chatMarkdownClipboardPayload(selection);
      if (rect === null || anchor === null || payload === null) {
        setPending(null);
        return;
      }

      let overlappingHighlightId: string | null = null;
      for (const highlight of highlights) {
        const existing = resolveAnchorToRange(container, highlight.anchor);
        if (existing !== null && rangesOverlap(existing, range)) {
          overlappingHighlightId = highlight.id;
          break;
        }
      }

      setPending({
        range: range.cloneRange(),
        rect,
        markdown: payload.text,
        anchor,
        overlappingHighlightId,
      });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [highlights, isAnnotating, isStreaming]);

  // A click outside the message closes the toolbar; the note editor stays until
  // the reader saves or cancels so a stray click cannot lose what they typed.
  useEffect(() => {
    if (pending === null) return;

    const onPointerDown = (event: PointerEvent) => {
      if (isInsideOwnUi(event.target as Node)) return;
      if (isAnnotating) return;
      const container = containerRef.current;
      if (container && container.contains(event.target as Node)) return;
      dismiss();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [dismiss, isAnnotating, pending]);

  const onHighlight = useCallback(() => {
    if (pending === null) return;
    if (pending.overlappingHighlightId !== null) {
      removeHighlight({ threadKey, messageId, highlightId: pending.overlappingHighlightId });
    } else {
      addHighlight({
        threadKey,
        messageId,
        highlight: {
          id: `highlight:${messageId}:${Date.now().toString(36)}`,
          anchor: pending.anchor,
          createdAt: new Date().toISOString(),
        },
      });
    }
    window.getSelection()?.removeAllRanges();
    dismiss();
  }, [addHighlight, dismiss, messageId, pending, removeHighlight, threadKey]);

  const onCopy = useCallback(() => {
    if (pending === null) return;
    void writeTextToClipboard(pending.markdown, "selection");
    dismiss();
  }, [dismiss, pending]);

  const onSaveAnnotation = useCallback(
    (comment: string) => {
      if (pending === null) return;
      const annotation: AnnotationContext = {
        id: `annotation:${messageId}:${Date.now().toString(36)}`,
        messageId,
        quotedText: pending.markdown,
        comment: comment.trim(),
      };
      addChatAnnotation(composerDraftTarget, annotation);
      window.getSelection()?.removeAllRanges();
      dismiss();
    },
    [addChatAnnotation, composerDraftTarget, dismiss, messageId, pending],
  );

  /**
   * Both overlays position themselves from viewport coordinates
   * (`getBoundingClientRect`), so they must be portalled out of the message.
   * LegendList gives each virtualized row `contain: content`, and `contain:
   * layout` makes that row the containing block for `position: fixed`
   * descendants — the overlay would be offset by the row's own page position
   * and land far below the viewport for any message low on screen.
   */
  const overlay =
    pending === null ? null : isAnnotating ? (
      <ChatAnnotationPopover
        anchorRect={pending.rect}
        quotedText={pending.markdown}
        onSave={onSaveAnnotation}
        onCancel={dismiss}
      />
    ) : (
      <ChatSelectionToolbar
        anchorRect={pending.rect}
        isHighlighted={pending.overlappingHighlightId !== null}
        onHighlight={onHighlight}
        onAnnotate={() => setIsAnnotating(true)}
        onCopy={onCopy}
      />
    );

  return (
    <div ref={containerRef} data-chat-message-id={messageId}>
      {children}
      {overlay !== null && typeof document !== "undefined"
        ? createPortal(overlay, document.body)
        : null}
    </div>
  );
}
