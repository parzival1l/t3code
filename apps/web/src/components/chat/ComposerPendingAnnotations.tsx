import { MessageSquareQuote, X } from "lucide-react";

import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { annotationQuoteLabel, type AnnotationContext } from "~/annotationContext";
import { cn } from "~/lib/utils";

interface ComposerPendingAnnotationsProps {
  annotations: ReadonlyArray<AnnotationContext>;
  onRemove: (annotationId: string) => void;
  className?: string;
}

/**
 * Chips for annotations waiting to be sent. The chip shows the quoted passage
 * because that is what the reader recognises; the note is secondary and lives in
 * the tooltip, which mirrors the quote-then-note order of the sent block.
 */
export function ComposerPendingAnnotations({
  annotations,
  onRemove,
  className,
}: ComposerPendingAnnotationsProps) {
  if (annotations.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {annotations.map((annotation) => {
        const label = annotationQuoteLabel(annotation);
        const comment = annotation.comment.trim();
        return (
          <Tooltip key={annotation.id}>
            <TooltipTrigger
              render={
                <span className={cn(COMPOSER_INLINE_CHIP_CLASS_NAME, "pr-1")}>
                  <MessageSquareQuote
                    className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")}
                  />
                  <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
                  <button
                    type="button"
                    aria-label={`Remove annotation on ${label}`}
                    className={COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemove(annotation.id);
                    }}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              }
            />
            <TooltipPopup side="top" className="max-w-96 leading-tight">
              <span className="block text-muted-foreground text-[10px] uppercase tracking-wide">
                Selected text
              </span>
              <span className="mt-0.5 block whitespace-pre-wrap">{annotation.quotedText}</span>
              {comment ? (
                <>
                  <span className="mt-2 block text-muted-foreground text-[10px] uppercase tracking-wide">
                    Your note
                  </span>
                  <span className="mt-0.5 block whitespace-pre-wrap">{comment}</span>
                </>
              ) : null}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}
