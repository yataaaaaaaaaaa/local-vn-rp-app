import { cleanGeneratedOutput, finalizeTextboxOutput } from "./clean-dialogue";
import { splitSentences } from "./text-utils";

export function cleanUserTextOutput(text: string): string {
  const cleaned = cleanGeneratedOutput(text);
  const quoted = extractFirstQuotedCompleteSentence(cleaned);

  if (quoted) return finalizeTextboxOutput(quoted, 1);

  return cleanSingleLineOutput(cleaned.replace(/\*[^*]*\*/g, ""));
}

function cleanSingleLineOutput(text: string): string {
  return finalizeTextboxOutput(cleanGeneratedOutput(text), 1).split(/\r?\n/)[0]?.trim() ?? "";
}

function extractFirstQuotedCompleteSentence(text: string): string | null {
  const quoteMatch = text.match(/["“]([^"”]+)["”]?/);
  if (!quoteMatch) return null;

  const content = quoteMatch[1].trim();
  const complete = splitSentences(content).find((sentence) => /[.!?]$/.test(sentence));

  return complete ?? content;
}
