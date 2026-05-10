import type { StoryNodeFields } from "@local-vn/story-domain";

export type VisualPlannerPromptFacts = Record<string, string | boolean | string[]>;

type VisualPlannerAllowedTag = {
  tag: string;
};

export function buildVisualPlannerPrompt(input: {
  node: StoryNodeFields;
  facts: VisualPlannerPromptFacts;
  question: string;
}): string {
  const { node } = input;

  return [
    "You answer short visual image-prompt questions.",
    "Use a SillyTavern-style prompt stack: stable story context, current exchange, known visual decisions, then the final answer contract.",
    "Use the full story context and the current visual description.",
    "Answer naturally, but keep the answer short.",
    "Do not output JSON.",
    "Do not output markdown.",
    "Do not output bullet lists.",
    "Do not add explanations.",
    "Do not invent details that contradict the current scene.",
    "When uncertain, prefer already-established visual facts over novelty.",
    "",
    "FULL STORY CONTEXT:",
    node.context.trim() || "(empty)",
    "",
    "CURRENT USER TEXT:",
    node.userText.trim() || "(empty)",
    "",
    "CURRENT NPC REPLY:",
    node.dialogue.trim() || "(empty)",
    "",
    "CURRENT VISUAL DESCRIPTION:",
    node.visualDescription.trim() || "(empty)",
    "",
    "KNOWN VISUAL DECISIONS FOR THIS SCENE:",
    formatKnownFacts(input.facts),
    "",
    "POST_HISTORY_VISUAL_CONTRACT:",
    "- Answer only the requested visual classification or description.",
    "- Preserve character identity, clothing continuity, location, lighting, and camera-visible facts.",
    "- Do not add a new event, new character, or hidden internal state just to make the image more novel.",
    "",
    input.question,
    "",
    "Your answer:"
  ].join("\n");
}

export function buildNaturalTagQuestion(input: {
  question: string;
  allowedTags: VisualPlannerAllowedTag[];
  example: string;
}): string {
  return [
    input.question,
    "",
    "Choose only from these allowed tags:",
    input.allowedTags.map((tag) => `- ${tag.tag}`).join("\n"),
    "",
    "Answer as a short natural sentence.",
    "Use the exact tag names from the allowed list.",
    "If several allowed tags apply, include all of them in the same sentence.",
    "If none apply, say that no allowed tag applies.",
    "Example:",
    input.example
  ].join("\n");
}

export function buildNumberedTagChoiceQuestion(input: {
  question: string;
  allowedTags: VisualPlannerAllowedTag[];
  example: string;
}): string {
  return [
    input.question,
    "",
    "Choose exactly one option by number:",
    input.allowedTags.map((tag, index) => `${index + 1}. ${tag.tag}`).join("\n"),
    "",
    "Answer with the number only.",
    "Do not output the tag name.",
    "Example:",
    input.example
  ].join("\n");
}

export function buildNamedChildChoiceQuestion(input: {
  question: string;
  choices: string[];
  example: string;
}): string {
  return [
    input.question,
    "",
    "Choose exactly one option by number, or choose 0 if none of these choices fit the scene:",
    "0. none of these choices",
    input.choices.map((choice, index) => `${index + 1}. ${choice}`).join("\n"),
    "",
    "Answer with the number only.",
    "Do not output the choice name.",
    "Example:",
    input.example
  ].join("\n");
}

export function buildNaturalYesNoQuestion(input: {
  question: string;
  target: string;
  example: string;
}): string {
  return [
    input.question,
    "",
    `Decide whether the ${input.target} is visible in the current scene image.`,
    "Answer yes or no in one short natural sentence.",
    "Consider camera angle, framing, pose, clothing, hair, and occlusion.",
    "Example:",
    input.example
  ].join("\n");
}

export function buildNaturalRawDescriptionQuestion(input: {
  question: string;
  example: string;
}): string {
  return [
    input.question,
    "",
    "Answer as one short visual sentence.",
    "This sentence will be sent to an image tagger.",
    "Do not use comma-tag prompt syntax.",
    "Do not mention hidden or invisible details.",
    "Use only visual details that should appear in the image.",
    "Example:",
    input.example
  ].join("\n");
}

export function parseNumberedChoiceAnswer(answer: string, optionCount: number): number | null {
  const match = answer.match(/\b(?:option|choice|number|#)?\s*(\d{1,3})\b/i);

  if (!match) {
    return null;
  }

  const number = Number(match[1]);

  if (!Number.isInteger(number) || number < 1 || number > optionCount) {
    return null;
  }

  return number - 1;
}

export function parseOptionalNumberedChoiceAnswer(answer: string, optionCount: number): number | null {
  if (/\b(?:none|no choice|aucun|aucune)\b/i.test(answer)) {
    return null;
  }

  const match = answer.match(/\b(?:option|choice|number|#)?\s*(\d{1,3})\b/i);

  if (!match) {
    return null;
  }

  const number = Number(match[1]);

  if (number === 0) {
    return null;
  }

  if (!Number.isInteger(number) || number < 1 || number > optionCount) {
    return null;
  }

  return number - 1;
}

export function cleanOneLineAnswer(answer: string): string {
  return answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? "";
}

export function cleanRawDescription(answer: string): string {
  return answer
    .replace(/^\s*(?:answer|description)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatKnownFacts(
  facts: VisualPlannerPromptFacts
): string {
  const lines = Object.entries(facts).map(([key, value]) => {
    const rendered = Array.isArray(value) ? value.join(", ") : String(value);
    return `${key}: ${rendered}`;
  });

  return lines.length ? lines.join("\n") : "(none)";
}
