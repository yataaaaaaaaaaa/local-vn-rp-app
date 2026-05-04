import type { StoryNodeFields } from "@local-vn/story-domain";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";

export const RP_NOVEL_PRESET: Partial<BackendRuntimeConfig["llm"]> = {
  prompt_format: "mistral_inst",
  context_size: 8192,
  max_tokens: 96,
  temperature: 0.7,
  top_p: 1,
  top_k: 40,
  min_p: 0.05,
  repeat_penalty: 1
};

export const RP_NOVEL_STOP = [
  "</s>",
  "\nUser:",
  "\nPlayer:",
  "\n{{user}}:",
  "\nUSER:",
  "\nPLAYER:"
];

export const RP_DIALOGUE_STOP = [
  ...RP_NOVEL_STOP
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

function storyContextBlock(node: StoryNodeFields): string {
  return [
    "FULL_STORY_CONTEXT:",
    node.context || "(empty)"
  ].join("\n");
}

function visualContextBlock(node: StoryNodeFields): string {
  return [
    "STORY_AND_CHARACTER_CONTEXT:",
    compactVisualContext(node.context) || "(empty)"
  ].join("\n");
}

function compactVisualContext(context: string): string {
  const paragraphs = context
    .split(/\n\s*\n/g)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const useful = paragraphs.filter((part) =>
    /\b(?:user|player|npc|woman|girl|man|character|wearing|clothing|outfit|hair|eyes?|pose|setting|scene|scenario|previous_turn|visual_cue|visible scene)\b/i.test(part)
  );

  return (useful.length ? useful : paragraphs)
    .join("\n")
    .slice(0, 1800)
    .trim();
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

function latestPreviousTurnBlock(node: StoryNodeFields): string {
  return [
    "LATEST_PREVIOUS_TURN:",
    latestPreviousTurnFromContext(node.context) || "(empty)"
  ].join("\n");
}

function latestPreviousTurnFromContext(context: string): string {
  const marker = "PREVIOUS_TURN:";
  const index = context.lastIndexOf(marker);

  if (index < 0) {
    return "";
  }

  return context
    .slice(index + marker.length)
    .replace(/\n\s*\n[\s\S]*$/g, "")
    .trim();
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
    "- One or two complete VN textbox sentences are best; never exceed three short lines.",
    "- End with complete terminal punctuation. Do not trail off mid-sentence.",
    "- Use FULL_STORY_CONTEXT as the full accumulated story memory from the initial setup through all previous dialogue and visual cues.",
    "- Continue from LATEST_PREVIOUS_TURN and CURRENT_TURN; do not replay or summarize earlier turns.",
    "- Do not write the player.",
    "- Do not write visual description.",
    "- NPC spoken dialogue may use first person.",
    "- Any narration or action prose must be third person, using the NPC name or pronouns; never write first-person narration.",
    "- Do not write first-person action like 'I lean closer' unless it is inside quoted spoken dialogue.",
    "- If mixing narration and spoken dialogue, put spoken dialogue in quotes so first-person words are clearly speech.",
    "- Do not use asterisks for action text.",
    "- Do not add speaker names, role labels, bracketed stage directions, camera notes, image-prompt wording, tags, or a future player reply.",
    "- Do not summarize the scene. Do not continue after NPC_REPLY.",
    "",
    storyContextBlock(input.node),
    "",
    latestPreviousTurnBlock(input.node),
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
    "- Output a compact VISUAL_CUE only.",
    "- One or two short sentences.",
    "- Literal visible facts only.",
    "- Mention character count, pose, clothing, setting, props, lighting.",
    "- Preserve stable character identity and appearance from context; infer known visible traits from named characters when needed.",
    "- No dialogue or quoted speech.",
    "- No thoughts or emotions that are not visible on the face/body.",
    "- No plot lore, source/fandom names, measurements, word counts, or checklists.",
    "- No Danbooru tags, comma-tag prompt syntax, LoRA syntax, JSON, headings, or markdown.",
    "- No prose style or dramatic narration.",
    "",
    visualContextBlock(input.node),
    "",
    previousVisualBlock(input.node),
    "",
    currentResolvedTurnBlock(input.node),
    "",
    "FINAL TASK:",
    "Write the literal VISUAL_CUE only.",
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
    "- Use FULL_STORY_CONTEXT as the full accumulated story memory from the initial setup through all previous dialogue and visual cues.",
    "- Continue from LATEST_PREVIOUS_TURN; do not replay or summarize it.",
    "- Write the player's next spoken line or concise player intent only.",
    "- Do not write visual description, narration, ambience, or stage directions.",
    "- Do not write first-person prose like 'I lean closer' or action in asterisks.",
    "- If the player speaks, output only the spoken words without quotation marks.",
    "- End with complete terminal punctuation. Do not trail off mid-sentence.",
    "- Do not continue after USER_REPLY.",
    "",
    storyContextBlock(input.node),
    "",
    latestPreviousTurnBlock(input.node),
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
        .replace(/\*/g, "")
        .replace(/^\s*(?:npc|npc_reply|character|speaker)\s*:\s*/i, "")
        .trim()
    )
    .filter(Boolean)
    .slice(0, 3);

  return trimDanglingSentence(lines.join("\n").trim());
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
  return sentences
    .slice(0, 2)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join(" ");
}

export function cleanSingleLineOutput(text: string): string {
  return cleanLines(text)[0]?.trim() ?? "";
}

export function cleanUserTextOutput(text: string): string {
  const line = cleanSingleLineOutput(text)
    .replace(/\*[^*]{0,240}\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*(?:user|player|user_reply|reply)\s*:\s*/i, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();

  const withoutFirstPersonAction = line
    .replace(/\b(?:as\s+)?I\s+(?:lean|step|move|reach|touch|grab|look|glance|smile|whisper|speak|say|ask|reply|turn|raise|lower|press|pull|push)\b[^.!?]*[.!?]?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return trimDanglingSentence(withoutFirstPersonAction || line)
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();
}

function trimDanglingSentence(text: string): string {
  if (!text || /[.!?]"?$/.test(text)) {
    return closeUnbalancedDoubleQuote(text);
  }

  const match = text.match(/^([\s\S]*[.!?]"?)(?:\s+[^.!?]*)$/);
  return closeUnbalancedDoubleQuote(match?.[1]?.trim() || text);
}

function closeUnbalancedDoubleQuote(text: string): string {
  const quoteCount = (text.match(/"/g) ?? []).length;
  return quoteCount % 2 === 1 ? `${text}"` : text;
}
