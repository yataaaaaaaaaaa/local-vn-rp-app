import type { StoryNodeFields } from "@local-vn/story-domain";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";

export const RP_NOVEL_PRESET: Partial<BackendRuntimeConfig["llm"]> = {
  prompt_format: "mistral_inst",
  context_size: 8192,
  max_tokens: 96,
  temperature: 0.62,
  top_p: 0.86,
  top_k: 40,
  min_p: 0.05,
  repeat_penalty: 1.12
};

export const RP_NOVEL_STOP = [
  "\nUser:",
  "\nPlayer:",
  "\n{{user}}:",
  "\nAssistant:",
  "\nSystem:",
  "\nNarrator:",
  "\n# Scene",
  "\n# Visual",
  "\nScene description:",
  "\nVisual description:",
  "\nImage prompt:",
  "\nDanbooru:"
];

export const RP_DIALOGUE_STOP = [
  ...RP_NOVEL_STOP,
  "\n\n",
  "\nVisual:",
  "\nDescription:",
  "\nTags:",
  "\nPrompt:"
];

export type RpPromptInput = {
  node: StoryNodeFields;
  storyId?: string | null;
  selectedNodeId?: string | null;
};

function baseRpInstruction(): string {
  return [
    "You are a visual-novel roleplay writing engine.",
    "You write for a small VN textbox, not a chapter.",
    "Hard rule: short output only. Prefer one line; never exceed three short lines.",
    "Preserve player agency.",
    "Never write the player's dialogue, thoughts, emotions, or actions unless they were explicitly provided.",
    "Keep story/dialogue text separate from visual scene-description text.",
    "Return only the requested output. No headings, labels, notes, JSON, tags, markdown, or explanations."
  ].join("\n");
}

function storyContext(input: RpPromptInput): string {
  const { node, storyId, selectedNodeId } = input;

  return [
    `Story id: ${storyId ?? "unknown"}`,
    `Node id: ${selectedNodeId ?? "unknown"}`,
    "",
    "# Context",
    node.context || "(empty)",
    "",
    "# Current user/player text",
    node.userText || "(empty)",
    "",
    "# Existing dialogue / narration",
    node.dialogue || "(empty)",
    "",
    "# Existing visual description",
    node.visualDescription || "(empty)"
  ].join("\n");
}

export function buildRpAnswerPrompt(input: RpPromptInput): string {
  return [
    baseRpInstruction(),
    "",
    storyContext(input),
    "",
    "# Task",
    "Generate ONLY the next VN textbox reply to the player's latest text.",
    "Output style: dialogue only, or one very brief immediate reaction if no NPC can speak.",
    "Length limit: one sentence or one spoken line is best; maximum three short lines.",
    "Do not add speaker names, role labels, stage directions, camera notes, image-prompt wording, tags, or a future player reply.",
    "Do not summarize the scene. Do not continue the conversation after the reply.",
    "",
    "# Good output examples",
    "\"Then we should open it before the rain gets worse.\"",
    "She lowers her voice. \"Stay close, and don't touch the glass.\"",
    "",
    "# Output"
  ].join("\n");
}

export function buildVisualRepresentationPrompt(input: RpPromptInput): string {
  return [
    baseRpInstruction(),
    "",
    storyContext(input),
    "",
    "# Task",
    "Describe ONLY the current visible scene as concrete visual information for image generation.",
    "Length: 1-2 compact sentences.",
    "Include visible characters, pose, clothing, expression, environment, lighting, composition, and mood.",
    "Do not write dialogue, thoughts, plot continuation, consequences, character intent, or VN prose.",
    "Do not include Danbooru tags, comma-tag prompt syntax, LoRA syntax, JSON, headings, or markdown.",
    "",
    "# Output"
  ].join("\n");
}

export function buildAutomaticUserAnswerPrompt(input: RpPromptInput): string {
  return [
    baseRpInstruction(),
    "",
    storyContext(input),
    "",
    "# Task",
    "Generate one plausible next player/user answer.",
    "Write only the player/user's next short reply or action.",
    "Length: one short line.",
    "Do not include NPC narration.",
    "Do not continue after the user answer.",
    "",
    "# Output"
  ].join("\n");
}

function stripProtocolNoise(text: string): string {
  return text
    .replace(/<\/?s>/gi, "")
    .replace(/<\/?(?:assistant|user|system)>/gi, "")
    .replace(/^\s*(?:#+\s*)?(?:output|answer|assistant|ai|bot|narrator|scene|dialogue|response)\s*:\s*/i, "")
    .trim();
}

function cleanLines(text: string): string[] {
  const blockedSpeaker = /^(?:user|player|{{user}}|system|assistant|visual|danbooru|tags?|prompt|image prompt)\s*:/i;

  return stripProtocolNoise(text)
    .split(/\r?\n/)
    .map((line) => stripProtocolNoise(line).trim())
    .filter((line) => line.length > 0)
    .filter((line) => !blockedSpeaker.test(line));
}

export function cleanDialogueOutput(text: string): string {
  const lines = cleanLines(text)
    .map((line) =>
      line
        .replace(/^[-*•]\s*/, "")
        .replace(/^\s*(?:npc|character|speaker)\s*:\s*/i, "")
        .trim()
    )
    .filter(Boolean)
    .slice(0, 3);

  return lines.join("\n").trim();
}

export function cleanVisualDescriptionOutput(text: string): string {
  const compact = cleanLines(text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = compact.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [compact];
  return sentences.slice(0, 2).join(" ").trim();
}

export function cleanSingleLineOutput(text: string): string {
  return cleanLines(text)[0]?.trim() ?? "";
}
