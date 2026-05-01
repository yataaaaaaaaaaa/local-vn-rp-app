import type { BackendRuntimeConfig, StoryNodeFields } from "@local-vn/shared-types";

export const RP_NOVEL_PRESET: Partial<BackendRuntimeConfig["llm"]> = {
    prompt_format: "mistral_inst",
    context_size: 8192,
    max_tokens: 700,
    temperature: 0.7,
    top_p: 1,
    top_k: 40,
    min_p: 0.05,
    repeat_penalty: 1
};

export const RP_NOVEL_STOP = [
    "\nUser:",
    "\nPlayer:",
    "\n{{user}}:",
    "\nAssistant:",
    "\nSystem:"
];

export type RpPromptInput = {
    node: StoryNodeFields;
    storyId?: string | null;
    selectedNodeId?: string | null;
};

function baseRpInstruction(): string {
    return [
        "You are a fiction roleplay and visual-novel writing engine.",
        "Write immersive prose with strong scene continuity.",
        "Preserve player agency.",
        "Never write the player's dialogue, thoughts, emotions, or actions unless they were explicitly provided.",
        "Only write NPC dialogue, narration, environment, consequences, and scene progression.",
        "Return only the requested output. Do not explain."
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
        "Generate the next visual-novel answer: NPC dialogue, narration, and immediate scene consequences.",
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
        "Describe the current scene as concrete visual information for image generation.",
        "Focus on characters, pose, clothing, expression, environment, lighting, composition, and mood.",
        "Do not write story prose.",
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