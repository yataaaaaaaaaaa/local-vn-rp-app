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
  "\nUSER:",
  "\nPLAYER:",
  "\n# Scene",
  "\n# Visual",
  "\nScene description:",
  "\nVisual description:",
  "\nImage prompt:",
  "\nDanbooru:"
];

export const RP_DIALOGUE_STOP = [
  ...RP_NOVEL_STOP,
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

function rpIdentityInstruction(): string {
  return [
    "You are a visual-novel duo-RP writing engine.",
    "You write for a small VN textbox, not a chapter.",
    "Preserve player agency.",
    "Return only the requested output. No headings, labels, notes, JSON, markdown, or explanations."
  ].join("\n");
}

function metadataBlock(input: RpPromptInput): string {
  return [
    `STORY_ID: ${input.storyId ?? "unknown"}`,
    `NODE_ID: ${input.selectedNodeId ?? "unknown"}`
  ].join("\n");
}

function storyContextBlock(node: StoryNodeFields): string {
  return [
    "STORY_CONTEXT:",
    node.context || "(empty)"
  ].join("\n");
}

function visualContextBlock(node: StoryNodeFields): string {
  return [
    "VISIBLE_SCENE_CONTEXT:",
    compactVisibleContext(node.context) || "(empty)"
  ].join("\n");
}

function compactVisibleContext(context: string): string {
  const firstParagraph = context
    .split(/\n\s*\n/g)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .find(Boolean) ?? "";

  return firstParagraph.slice(0, 700).trim();
}

function currentUserTurnBlock(node: StoryNodeFields): string {
  return [
    "CURRENT_TURN:",
    `USER: ${node.userText || "(empty)"}`
  ].join("\n");
}

function currentResolvedTurnBlock(node: StoryNodeFields): string {
  return [
    "CURRENT_TURN:",
    `USER: ${node.userText || "(empty)"}`,
    `NPC_REPLY: ${node.dialogue || "(empty)"}`
  ].join("\n");
}

function previousVisualBlock(node: StoryNodeFields): string {
  const previousVisual = lastVisualCueFromContext(node.context);

  return [
    "PREVIOUS_VISUAL:",
    previousVisual || "(empty)"
  ].join("\n");
}

function lastVisualCueFromContext(context: string): string {
  const matches = [...context.matchAll(/(?:^|\n)(?:VISUAL_CUE|Visible scene):\s*(.+?)(?=\n[A-Z_ ]+:|\n\n|$)/gis)];
  const lastMatch = matches.at(-1);

  return lastMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildRpAnswerPrompt(input: RpPromptInput): string {
  return [
    rpIdentityInstruction(),
    "",
    "RULES:",
    "- Output NPC_REPLY only.",
    "- One short VN textbox line is best; never exceed three short lines.",
    "- Do not write the player.",
    "- Do not write visual description.",
    "- Do not add speaker names, role labels, stage directions, camera notes, image-prompt wording, tags, or a future player reply.",
    "- Do not summarize the scene. Do not continue after NPC_REPLY.",
    "",
    metadataBlock(input),
    "",
    storyContextBlock(input.node),
    "",
    currentUserTurnBlock(input.node),
    "",
    "FINAL TASK:",
    "Write NPC_REPLY only.",
    "",
    "OUTPUT ONLY THE NPC_REPLY TEXT BELOW:",
  ].join("\n");
}

export function buildVisualRepresentationPrompt(input: RpPromptInput): string {
  return [
    "You write simple visual cues for anime image tagging.",
    "",
    "RULES:",
    "- Output one compact VISUAL_CUE sentence only.",
    "- Under 35 words.",
    "- Literal visible facts only.",
    "- Mention character count, pose, clothing, setting, props, lighting.",
    "- No dialogue or quoted speech.",
    "- No thoughts or emotions that are not visible on the face/body.",
    "- No plot lore, source/fandom names, measurements, word counts, or checklists.",
    "- No Danbooru tags, comma-tag prompt syntax, LoRA syntax, JSON, headings, or markdown.",
    "- No prose style or dramatic narration.",
    "",
    metadataBlock(input),
    "",
    visualContextBlock(input.node),
    "",
    previousVisualBlock(input.node),
    "",
    currentResolvedTurnBlock(input.node),
    "",
    "FINAL TASK:",
    "Write one literal VISUAL_CUE sentence only.",
    "",
    "OUTPUT ONLY THE VISUAL_CUE TEXT BELOW:"
  ].join("\n");
}

export function buildAutomaticUserAnswerPrompt(input: RpPromptInput): string {
  return [
    rpIdentityInstruction(),
    "",
    "RULES:",
    "- Output USER_REPLY only.",
    "- One short VN textbox line.",
    "- Do not write the NPC.",
    "- Do not write visual description.",
    "- Do not continue after USER_REPLY.",
    "",
    metadataBlock(input),
    "",
    storyContextBlock(input.node),
    "",
    currentResolvedTurnBlock(input.node),
    "",
    "FINAL TASK:",
    "Write USER_REPLY only.",
    "",
    "OUTPUT:"
  ].join("\n");
}

function stripProtocolNoise(text: string): string {
  return text
    .replace(/<\/?s>/gi, "")
    .replace(/<\/?(?:assistant|user|system)>/gi, "")
    .replace(/^\s*(?:#+\s*)?(?:output|answer|assistant|ai|bot|narrator|scene|dialogue|response|npc_reply|user_reply|visual_cue)\s*:\s*/i, "")
    .trim();
}

function cleanLines(text: string): string[] {
  const blockedSpeaker = /^(?:user|player|{{user}}|system|assistant|visual|visual_cue|danbooru|tags?|prompt|image prompt)\s*:/i;

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
        .replace(/^\s*(?:npc|npc_reply|character|speaker)\s*:\s*/i, "")
        .trim()
    )
    .filter(Boolean)
    .slice(0, 3);

  return lines.join("\n").trim();
}

export function cleanVisualDescriptionOutput(text: string): string {
  const compact = cleanLines(text)
    .join(" ")
    .replace(/^(?:\s*\d+\s*\/\s*\d+[.;:\-]?)+\s*/, "")
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/[“"][^“”"]{1,160}[”"]/g, "")
    .replace(/\b(?:whispers?|says?|replies?|asks?)\b[^.!?]*[.!?]?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = compact.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [compact];
  return sentences[0]?.trim() ?? "";
}

export function cleanSingleLineOutput(text: string): string {
  return cleanLines(text)[0]?.trim() ?? "";
}
