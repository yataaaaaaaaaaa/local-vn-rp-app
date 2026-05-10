import { normalizeContextSnippet } from "../text/text-utils";

export function extractForbiddenFragments(text: string): string[] {
  const sentences = text
    .split(/[.!?]\s+|\n+/)
    .map((part) => normalizeContextSnippet(part))
    .filter((part) => part.length >= 18)
    .slice(-10);
  const fragments = new Set<string>();

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= 8) {
      fragments.add(sentence);
      continue;
    }
    fragments.add(words.slice(0, 8).join(" "));
    fragments.add(words.slice(-8).join(" "));
  }

  return [...fragments].slice(-12);
}
