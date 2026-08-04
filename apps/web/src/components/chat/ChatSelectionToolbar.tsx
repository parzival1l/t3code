import { Copy, Highlighter, MessageSquareQuote } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

/** Gap between the selection and the toolbar. */
const SELECTION_GAP_PX = 8;
/** Keep the toolbar this far from the viewport edges. */
const VIEWPORT_MARGIN_PX = 8;

export interface SelectionToolbarAnchorRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly bottom: number;
}

interface ChatSelectionToolbarProps {
  anchorRect: SelectionToolbarAnchorRect;
  /** True when the selection already sits inside a highlight. */
  isHighlighted: boolean;
  onHighlight: () => void;
  onAnnotate: () => void;
  onCopy: () => void;
}

/**
 * Floating actions for a text selection inside an assistant message.
 *
 * Positioned against the selection rectangle rather than the mouse, so the
 * toolbar lands in the same place whether the reader dragged, double-clicked, or
 * extended the selection with the keyboard. Uses fixed positioning to escape the
 * timeline's scroll container.
 */
export function ChatSelectionToolbar({
  anchorRect,
  isHighlighted,
  onHighlight,
  onAnnotate,
  onCopy,
}: ChatSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Measure after paint: the toolbar's width depends on its label text, and
  // centring it on the selection needs that width.
  useLayoutEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();

    const preferredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN_PX;
    const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(preferredLeft, maxLeft));

    // Above the selection by default; flip below when there is no room.
    const above = anchorRect.top - height - SELECTION_GAP_PX;
    const top = above >= VIEWPORT_MARGIN_PX ? above : anchorRect.bottom + SELECTION_GAP_PX;

    setPosition({ top, left });
  }, [anchorRect]);

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selection actions"
      data-chat-selection-toolbar="true"
      // Keep the browser selection alive when the reader clicks a button.
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "fixed z-50 flex items-center gap-0.5 rounded-lg border border-border/80 bg-popover p-1 shadow-md",
        position === null && "pointer-events-none opacity-0",
      )}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
    >
      <ToolbarButton
        icon={<Highlighter className="size-3.5" aria-hidden />}
        label={isHighlighted ? "Remove highlight" : "Highlight"}
        onClick={onHighlight}
      />
      <ToolbarButton
        icon={<MessageSquareQuote className="size-3.5" aria-hidden />}
        label="Annotate"
        onClick={onAnnotate}
      />
      <ToolbarButton
        icon={<Copy className="size-3.5" aria-hidden />}
        label="Copy"
        onClick={onCopy}
      />
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-foreground/90 text-xs transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      {icon}
      {label}
    </button>
  );
}
