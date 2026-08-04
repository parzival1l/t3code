import { describe, expect, it } from "vite-plus/test";

import {
  annotationQuoteLabel,
  appendAnnotationsToPrompt,
  formatAnnotationContext,
  hasAnnotationMessageSegments,
  parseAnnotationMessageSegments,
  type AnnotationContext,
} from "./annotationContext";

function annotation(overrides: Partial<AnnotationContext> = {}): AnnotationContext {
  return {
    id: "annotation:local:1",
    messageId: "msg-1",
    quotedText: "what counts as retryable failure",
    comment: "Spell this out for the 429 case.",
    ...overrides,
  };
}

describe("formatAnnotationContext", () => {
  it("emits the note above a fenced quote", () => {
    const block = formatAnnotationContext(annotation());

    expect(block).toContain('<annotation messageId="msg-1">');
    expect(block).toContain("Spell this out for the 429 case.");
    expect(block).toContain("```markdown");
    expect(block).toContain("what counts as retryable failure");
    expect(block.endsWith("</annotation>")).toBe(true);
  });

  it("escapes attribute-breaking characters in the message id", () => {
    const block = formatAnnotationContext(annotation({ messageId: 'a"b<c&d' }));

    expect(block).toContain('messageId="a&quot;b&lt;c&amp;d"');
  });

  it("widens the fence so a quoted code block cannot terminate it early", () => {
    const quotedText = "```ts\nconst x = 1;\n```";
    const block = formatAnnotationContext(annotation({ quotedText }));
    const parsed = parseAnnotationMessageSegments(block);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.kind).toBe("annotation");
    if (parsed[0]?.kind === "annotation") {
      expect(parsed[0].annotation.quotedText).toBe(quotedText);
    }
  });
});

describe("parseAnnotationMessageSegments", () => {
  it("round-trips a formatted annotation", () => {
    const source = annotation();
    const segments = parseAnnotationMessageSegments(formatAnnotationContext(source));

    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("annotation");
    if (segments[0]?.kind === "annotation") {
      expect(segments[0].annotation.messageId).toBe(source.messageId);
      expect(segments[0].annotation.comment).toBe(source.comment);
      expect(segments[0].annotation.quotedText).toBe(source.quotedText);
    }
  });

  it("keeps the surrounding prompt text as separate segments", () => {
    const prompt = appendAnnotationsToPrompt("Please revise this.", [annotation()]);
    const segments = parseAnnotationMessageSegments(prompt);

    expect(segments[0]?.kind).toBe("text");
    if (segments[0]?.kind === "text") {
      expect(segments[0].text).toContain("Please revise this.");
    }
    expect(segments.some((segment) => segment.kind === "annotation")).toBe(true);
  });

  it("parses several annotations and numbers their ids", () => {
    const prompt = appendAnnotationsToPrompt("Two notes.", [
      annotation({ quotedText: "first quote" }),
      annotation({ quotedText: "second quote", comment: "And this one too." }),
    ]);
    const parsed = parseAnnotationMessageSegments(prompt).flatMap((segment) =>
      segment.kind === "annotation" ? [segment.annotation] : [],
    );

    expect(parsed.map((entry) => entry.quotedText)).toEqual(["first quote", "second quote"]);
    expect(new Set(parsed.map((entry) => entry.id)).size).toBe(2);
  });

  it("accepts an empty note", () => {
    const parsed = parseAnnotationMessageSegments(
      formatAnnotationContext(annotation({ comment: "" })),
    );

    expect(parsed[0]?.kind).toBe("annotation");
    if (parsed[0]?.kind === "annotation") {
      expect(parsed[0].annotation.comment).toBe("");
    }
  });

  it("keeps a block with no message id as visible text", () => {
    const raw = "<annotation>\nnote\n```markdown\nquote\n```\n</annotation>";
    const segments = parseAnnotationMessageSegments(raw);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("text");
  });

  it("keeps a block with no quote as visible text", () => {
    const raw = '<annotation messageId="msg-1">\njust a note\n</annotation>';
    const segments = parseAnnotationMessageSegments(raw);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("text");
  });

  it("treats a plain message as a single text segment", () => {
    const segments = parseAnnotationMessageSegments("no annotations here");

    expect(segments).toEqual([
      { kind: "text", id: "annotation-text:0", text: "no annotations here" },
    ]);
  });

  it("returns nothing for an empty message", () => {
    expect(parseAnnotationMessageSegments("")).toEqual([]);
  });
});

describe("hasAnnotationMessageSegments", () => {
  it("distinguishes annotated messages from plain ones", () => {
    expect(hasAnnotationMessageSegments(formatAnnotationContext(annotation()))).toBe(true);
    expect(hasAnnotationMessageSegments("plain prompt")).toBe(false);
    expect(hasAnnotationMessageSegments("<annotation>malformed</annotation>")).toBe(false);
  });
});

describe("appendAnnotationsToPrompt", () => {
  it("returns the prompt untouched when there are no annotations", () => {
    expect(appendAnnotationsToPrompt("just this", [])).toBe("just this");
  });

  it("emits only blocks when the prompt is empty", () => {
    const result = appendAnnotationsToPrompt("   ", [annotation()]);

    expect(result.startsWith("<annotation")).toBe(true);
  });

  it("separates the prompt from the blocks with a blank line", () => {
    const result = appendAnnotationsToPrompt("Prompt text.", [annotation()]);

    expect(result).toContain("Prompt text.\n\n<annotation");
  });
});

describe("annotationQuoteLabel", () => {
  it("collapses whitespace onto one line", () => {
    expect(annotationQuoteLabel(annotation({ quotedText: "  a\n\n  b  " }))).toBe("a b");
  });

  it("truncates a long quote with an ellipsis", () => {
    const label = annotationQuoteLabel(annotation({ quotedText: "x".repeat(200) }), 10);

    expect(label).toHaveLength(10);
    expect(label.endsWith("…")).toBe(true);
  });
});
