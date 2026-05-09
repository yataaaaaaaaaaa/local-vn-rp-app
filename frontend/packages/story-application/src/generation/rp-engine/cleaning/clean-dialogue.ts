import { stripProtocolNoise } from "./protocol-noise";
import { splitSentences } from "./text-utils";

export function cleanDialogueOutput(text: string): string {
  return finalizeTextboxOutput(cleanGeneratedOutput(text), 2);
}

export function cleanGeneratedOutput(text: string): string {
  const blockedSpeaker = /^(?:user|player|{{user}}|system|assistant|final task|output)\s*:/i;
  const lines: string[] = [];

  for (const rawLine of stripProtocolNoise(text).split(/\r?\n/)) {
    const rawTrimmed = rawLine.trim();

    if (!rawTrimmed || blockedSpeaker.test(rawTrimmed)) {
      continue;
    }

    const line = stripProtocolNoise(rawTrimmed).trim();

    if (!line || blockedSpeaker.test(line)) {
      continue;
    }

    lines.push(line);
  }

  return lines
    .join("\n")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function finalizeTextboxOutput(text: string, maxSentences: number): string {
  let cleaned = text
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const sentences = splitSentences(cleaned);
  if (sentences.length > maxSentences) {
    cleaned = sentences.slice(0, maxSentences).join(" ");
  }

  cleaned = repairDanglingQuote(cleaned);

  if (!/[.!?"']$/.test(cleaned)) cleaned += ".";

  return cleaned;
}

export function repairDanglingQuote(text: string): string {
  const quoteCount = (text.match(/"/g) ?? []).length;
  let repaired = text.trim();

  if (quoteCount % 2 === 1) {
    if (!/[.!?]$/.test(repaired)) repaired += ".";
    repaired += "\"";
  }

  return repaired;
}
