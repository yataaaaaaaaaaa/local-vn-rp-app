import { cleanGeneratedOutput, finalizeTextboxOutput } from "./clean-dialogue";
import { splitSentences } from "./text-utils";

export function cleanUserTextOutput(text: string): string {
  const cleaned = cleanGeneratedOutput(text);
  const quoted = extractFirstQuotedPlayerText(cleaned);

  if (quoted) return finalizeTextboxOutput(quoted, 1);

  return cleanSingleLineOutput(cleaned.replace(/\*[^*]*\*/g, ""));
}

function cleanSingleLineOutput(text: string): string {
  return finalizeTextboxOutput(cleanGeneratedOutput(text), 1).split(/\r?\n/)[0]?.trim() ?? "";
}

function extractFirstQuotedPlayerText(text: string): string | null {
  const quotedSegments = extractQuotedSegments(text);

  for (const segment of quotedSegments) {
    const complete = splitSentences(segment).find((sentence) => /[.!?]$/.test(sentence));
    if (complete) return complete;
  }

  return quotedSegments[0] ?? null;
}

function extractQuotedSegments(text: string): string[] {
  const segments: string[] = [];
  const quotedText = /["\u201c]([^"\u201d]+)(?:["\u201d]|$)/gu;
  let match: RegExpExecArray | null;

  while ((match = quotedText.exec(text)) !== null) {
    const segment = match[1]?.trim();

    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}
