import { Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "../ui/button";
import type { SelectionToolbarAnchorRect } from "./ChatSelectionToolbar";
import { cn } from "~/lib/utils";

const SELECTION_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
const POPOVER_WIDTH_PX = 320;

interface ChatAnnotationPopoverProps {
  anchorRect: SelectionToolbarAnchorRect;
  quotedText: string;
  onSave: (comment: string) => void;
  onCancel: () => void;
}

/**
 * Note editor for a new annotation.
 *
 * Saving with an empty note is allowed: quoting a passage and asking about it is
 * a complete thought, and forcing a note would just make readers type "this".
 */
export function ChatAnnotationPopover({
  anchorRect,
  quotedText,
  onSave,
  onCancel,
}: ChatAnnotationPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [comment, setComment] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const element = popoverRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();

    const preferredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN_PX;
    const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(preferredLeft, maxLeft));

    const above = anchorRect.top - height - SELECTION_GAP_PX;
    const top = above >= VIEWPORT_MARGIN_PX ? above : anchorRect.bottom + SELECTION_GAP_PX;

    setPosition({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Annotate selection"
      data-chat-annotation-popover="true"
      className={cn(
        "fixed z-50 rounded-xl border border-border/80 bg-popover p-3 shadow-lg",
        position === null && "pointer-events-none opacity-0",
      )}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, width: POPOVER_WIDTH_PX }}
    >
      <p className="mb-2 line-clamp-2 border-border/60 border-l-2 pl-2 text-muted-foreground text-xs">
        {quotedText}
      </p>
      <textarea
        ref={textareaRef}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          // Enter saves, matching the composer. Shift+Enter adds a line.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSave(comment);
          }
        }}
        rows={3}
        placeholder="Add a note…"
        className="w-full resize-none rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
      />
      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Discard annotation"
          onClick={onCancel}
          className="text-muted-foreground"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="default" size="sm" onClick={() => onSave(comment)}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
