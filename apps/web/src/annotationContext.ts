/**
 * Chat annotations: a passage the reader selected in an assistant message, plus
 * their note about it.
 *
 * An annotation replaces the copy-paste-then-explain loop. Instead of quoting
 * the agent back at itself by hand, the reader selects the passage, types a
 * note, and sends. The passage travels with the note as an `<annotation>` block
 * appended to the prompt.
 *
 * The block grammar deliberately matches `<review_comment>` (see
 * `reviewCommentContext.ts`) so both kinds of inline context parse the same way
 * and a sent user message can render either as a card.
 */

import * as Schema from "effect/Schema";

import {
  escapeContextBlockAttribute,
  formatReviewCommentFence,
  readContextBlockAttributes,
} from "./reviewCommentContext";

export const AnnotationContextSchema = Schema.Struct({
  id: Schema.String,
  /** The assistant message the passage was selected in. */
  messageId: Schema.String,
  /** The selected passage, as markdown so lists and code survive the round trip. */
  quotedText: Schema.String,
  /** The reader's note. May be empty — selecting and sending is a valid ask. */
  comment: Schema.String,
});

export interface AnnotationContext {
  readonly id: string;
  readonly messageId: string;
  readonly quotedText: string;
  readonly comment: string;
}

export type AnnotationMessageSegment =
  | { readonly kind: "text"; readonly id: string; readonly text: string }
  | { readonly kind: "annotation"; readonly annotation: AnnotationContext };

const ANNOTATION_BLOCK_PATTERN = /<annotation\b([^>]*)>\s*([\s\S]*?)<\/annotation>/g;
const ANNOTATION_FENCE_PATTERN = /(`{3,})([^\s`]*)[^\n]*\n([\s\S]*?)\n\1/g;

/** Language tag on the quoted fence. Markdown, because the quote is markdown. */
const ANNOTATION_FENCE_LANGUAGE = "markdown";

/**
 * Splits a block body into the note and the quoted passage. The quote is the
 * last fence in the body, mirroring how a review comment carries its diff, so a
 * note that itself contains a fenced example does not confuse the split.
 */
function extractAnnotationBody(rawBody: string): { comment: string; quotedText: string } {
  const matches = Array.from(rawBody.matchAll(ANNOTATION_FENCE_PATTERN));
  const match = matches.at(-1);
  const fenceIndex = match?.index;
  return {
    comment: rawBody.slice(0, fenceIndex ?? rawBody.length).trim(),
    quotedText: match?.[3] ?? "",
  };
}

function parseAnnotationContext(
  rawAttributes: string,
  rawBody: string,
  index: number,
): AnnotationContext | null {
  const attributes = readContextBlockAttributes(rawAttributes);
  const messageId = attributes.messageId?.trim();
  if (!messageId) return null;

  const body = extractAnnotationBody(rawBody);
  if (body.quotedText.trim().length === 0) return null;

  return {
    id: `annotation:${index}:${messageId}`,
    messageId,
    quotedText: body.quotedText,
    comment: body.comment,
  };
}

/**
 * Splits a message into plain text and annotation blocks so a sent user message
 * renders its annotations as cards instead of raw markup.
 */
export function parseAnnotationMessageSegments(
  value: string,
): ReadonlyArray<AnnotationMessageSegment> {
  const segments: AnnotationMessageSegment[] = [];
  let cursor = 0;
  let parsedIndex = 0;

  for (const match of value.matchAll(ANNOTATION_BLOCK_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const beforeText = value.slice(cursor, matchIndex);
    if (beforeText.length > 0) {
      segments.push({ kind: "text", id: `annotation-text:${cursor}`, text: beforeText });
    }

    const annotation = parseAnnotationContext(match[1] ?? "", match[2] ?? "", parsedIndex);
    if (annotation) {
      segments.push({ kind: "annotation", annotation });
      parsedIndex += 1;
    } else {
      // Keep an unparseable block visible rather than silently dropping the
      // reader's words.
      segments.push({ kind: "text", id: `annotation-invalid:${matchIndex}`, text: match[0] });
    }

    cursor = matchIndex + match[0].length;
  }

  const rest = value.slice(cursor);
  if (rest.length > 0) {
    segments.push({ kind: "text", id: `annotation-text:${cursor}`, text: rest });
  }

  return segments;
}

export function hasAnnotationMessageSegments(value: string): boolean {
  return parseAnnotationMessageSegments(value).some((segment) => segment.kind === "annotation");
}

export function formatAnnotationContext(annotation: AnnotationContext): string {
  return [
    `<annotation messageId="${escapeContextBlockAttribute(annotation.messageId)}">`,
    annotation.comment.trim(),
    formatReviewCommentFence(ANNOTATION_FENCE_LANGUAGE, annotation.quotedText),
    "</annotation>",
  ].join("\n");
}

export function appendAnnotationsToPrompt(
  prompt: string,
  annotations: ReadonlyArray<AnnotationContext>,
): string {
  const blocks = annotations.map(formatAnnotationContext);
  if (blocks.length === 0) return prompt;
  const trimmedPrompt = prompt.trim();
  return trimmedPrompt.length > 0
    ? `${trimmedPrompt}\n\n${blocks.join("\n\n")}`
    : blocks.join("\n\n");
}

/** Short single-line label for the composer chip and the hover card. */
export function annotationQuoteLabel(annotation: AnnotationContext, maxLength = 48): string {
  const collapsed = annotation.quotedText.replace(/\s+/g, " ").trim();
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1)}…`;
}
