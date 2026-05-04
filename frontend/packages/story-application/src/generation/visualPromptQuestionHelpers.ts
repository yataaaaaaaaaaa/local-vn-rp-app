import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import type { StoryNodeFields } from "@local-vn/story-domain";

import type { StoryGenerationBackend } from "../ports";
import { rpNovelLlmRequestConfig } from "./llmRequestConfig";
import { RP_NOVEL_STOP } from "./rpNovelPrompts";
import type { VisualPromptPlan } from "./visualPromptProtocol";
import {
    extractAllowedTagsFromAnswer,
    parseYesNoAnswer,
    type AllowedTag
} from "./visualPromptTagHelpers";

export interface VisualPlannerRuntime {
    backend: StoryGenerationBackend;
    config: BackendRuntimeConfig;
    node: StoryNodeFields;
    storyId: string | null;
    selectedNodeId: string | null;
    facts: Record<string, string | boolean | string[]>;
    abortSignal?: AbortSignal;
}

export async function askTagsFromQuestion(
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        question: string;
        allowedTags: AllowedTag[];
        fallback?: string[];
        example?: string;
    }
): Promise<string[]> {
    const answer = await askRawLlmLine({
        runtime,
        question: buildNaturalTagQuestion({
            question: input.question,
            allowedTags: input.allowedTags,
            example:
                input.example ??
                "The tags that describe the image are: 1girl, solo."
        })
    });

    const tags = extractAllowedTagsFromAnswer(
        answer,
        input.allowedTags,
        input.fallback ?? []
    );

    runtime.facts[input.key] = tags;

    return tags;
}

export async function addTagsFromQuestion(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        question: string;
        allowedTags: AllowedTag[];
        fallback?: string[];
        example?: string;
    }
): Promise<string[]> {
    const tags = await askTagsFromQuestion(runtime, input);

    if (tags.length) {
        plan.fixedTags.push(...tags);
    }

    return tags;
}

export async function addSingleTagChoiceByNumber(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        question: string;
        allowedTags: AllowedTag[];
        fallback?: string;
        example?: string;
        addToPlan?: boolean;
    }
): Promise<string | null> {
    const answer = await askRawLlmLine({
        runtime,
        question: buildNumberedTagChoiceQuestion({
            question: input.question,
            allowedTags: input.allowedTags,
            example: input.example ?? "3"
        })
    });

    const chosenIndex = parseNumberedChoiceAnswer(answer, input.allowedTags.length);
    const chosenTag = chosenIndex === null
        ? input.fallback ?? null
        : input.allowedTags[chosenIndex].tag;

    if (chosenTag) {
        if (input.addToPlan !== false) {
            plan.fixedTags.push(chosenTag);
        }

        runtime.facts[input.key] = chosenTag;
    }

    return chosenTag;
}

export async function isVisible(
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        target: string;
        question: string;
        fallback?: boolean;
        example?: string;
    }
): Promise<boolean> {
    const answer = await askRawLlmLine({
        runtime,
        question: buildNaturalYesNoQuestion({
            question: input.question,
            target: input.target,
            example:
                input.example ??
                `Yes, the ${input.target} is visible.`
        })
    });

    const visible = parseYesNoAnswer(answer) ?? input.fallback ?? false;
    runtime.facts[input.key] = visible;

    return visible;
}

export async function addRawDanbotDescription(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        question: string;
        example?: string;
    }
): Promise<string> {
    const answer = await askRawLlmLine({
        runtime,
        question: buildNaturalRawDescriptionQuestion({
            question: input.question,
            example:
                input.example ??
                "A side-view upper-body image of one girl standing near a rainy neon street."
        })
    });

    const text = cleanRawDescription(answer);

    if (text) {
        plan.rawDanbotDescriptions.push(text);
        runtime.facts[input.key] = text;
    }

    return text;
}

async function askRawLlmLine(input: {
    runtime: VisualPlannerRuntime;
    question: string;
}): Promise<string> {
    const result = await input.runtime.backend.generateLlm(
        rpNovelLlmRequestConfig(
            input.runtime.config,
            buildVisualPlannerPrompt({
                runtime: input.runtime,
                question: input.question
            }),
            {
                max_tokens: Math.min(input.runtime.config.llm.max_tokens, 80),
                temperature: Math.min(input.runtime.config.llm.temperature, 0.15),
                stop: RP_NOVEL_STOP
            }
        ),
        { signal: input.runtime.abortSignal }
    );

    return cleanOneLineAnswer(result.text);
}

function buildVisualPlannerPrompt(input: {
    runtime: VisualPlannerRuntime;
    question: string;
}): string {
    const { runtime } = input;
    const node = runtime.node;

    return [
        "You answer short visual image-prompt questions.",
        "Use the full story context and the current visual description.",
        "Answer naturally, but keep the answer short.",
        "Do not output JSON.",
        "Do not output markdown.",
        "Do not output bullet lists.",
        "Do not add explanations.",
        "Do not invent details that contradict the current scene.",
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
        formatKnownFacts(runtime.facts),
        "",
        input.question,
        "",
        "Your answer:"
    ].join("\n");
}

function buildNaturalTagQuestion(input: {
    question: string;
    allowedTags: AllowedTag[];
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

function buildNumberedTagChoiceQuestion(input: {
    question: string;
    allowedTags: AllowedTag[];
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

function buildNaturalYesNoQuestion(input: {
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

function buildNaturalRawDescriptionQuestion(input: {
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

function parseNumberedChoiceAnswer(answer: string, optionCount: number): number | null {
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

function formatKnownFacts(
    facts: Record<string, string | boolean | string[]>
): string {
    const lines = Object.entries(facts).map(([key, value]) => {
        const rendered = Array.isArray(value) ? value.join(", ") : String(value);
        return `${key}: ${rendered}`;
    });

    return lines.length ? lines.join("\n") : "(none)";
}

function cleanOneLineAnswer(answer: string): string {
    return answer
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0] ?? "";
}

function cleanRawDescription(answer: string): string {
    return answer
        .replace(/^\s*(?:answer|description)\s*:\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
}
