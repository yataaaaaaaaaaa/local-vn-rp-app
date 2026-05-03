import type { BackendRuntimeConfig, StoryNodeFields } from "@local-vn/shared-types";

export const RP_NOVEL_PRESET: Partial<BackendRuntimeConfig["llm"]> = {
    prompt_format: "mistral_inst",
    context_size: 8192,
    max_tokens: 180,
    temperature: 0.72,
    top_p: 0.9,
    top_k: 40,
    min_p: 0.05,
    repeat_penalty: 1.08
};

export const RP_NOVEL_STOP = [
    "\nUser:",
    "\nPlayer:",
    "\n{{user}}:",
    "\nAssistant:",
    "\nSystem:",
    "\n# Scene",
    "\n# Visual",
    "\nScene description:",
    "\nVisual description:",
    "\nImage prompt:",
    "\nDanbooru:"
];

export type RpPromptInput = {
    node: StoryNodeFields;
    storyId?: string | null;
    selectedNodeId?: string | null;
};

function baseRpInstruction(): string {
    return [
        "You are a concise visual-novel writing engine.",
        "Write short VN beats: readable in a textbox, not a novella.",
        "Prefer 1-3 compact lines unless the task gives another limit.",
        "Preserve player agency.",
        "Never write the player's dialogue, thoughts, emotions, or actions unless they were explicitly provided.",
        "Only write NPC dialogue, immediate narration, and brief consequences when requested.",
        "Keep dialogue/story text separate from visual scene-description text.",
        "Return only the requested output. No headings, notes, JSON, tags, or explanations."
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
        "Generate ONLY the next dialogue/story textbox text.",
        "Length: 1-3 short lines total.",
        "Use at most one brief action/narration sentence, then NPC spoken dialogue if appropriate.",
        "Do not include camera, lighting, clothing inventory, composition, Danbooru tags, or image-prompt wording.",
        "Do not write the player response.",
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
        "Include characters, pose, clothing, expression, environment, lighting, composition, and mood only if visible now.",
        "Do not write dialogue, thoughts, plot continuation, consequences, or VN prose.",
        "Do not include Danbooru tags, comma-tag prompt syntax, LoRA syntax, JSON, or markdown headings.",
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

export function rpNovelLlmRequestConfig(config: BackendRuntimeConfig) {
    return {
        model_path: config.llm.model_path || undefined,
        max_tokens: config.llm.max_tokens,
        temperature: config.llm.temperature,
        top_p: config.llm.top_p,
        top_k: config.llm.top_k,
        min_p: config.llm.min_p,
        repeat_penalty: config.llm.repeat_penalty,
        stop: RP_NOVEL_STOP,
        timeout_seconds: config.llm.timeout_seconds
    };
}
