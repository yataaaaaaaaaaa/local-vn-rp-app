import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import type { StoryNodeFields } from "@local-vn/story-domain";

import type { StoryGenerationBackend } from "../ports";
import type { ActionCompositionSelectionIssue } from "./actionCompositionTree";
import { rpNovelLlmRequestConfig } from "./llmRequestConfig";
import { RP_NOVEL_STOP } from "./rp-engine/runtime/stop-sequences";
import {
    buildNamedChildChoiceQuestion,
    buildNaturalRawDescriptionQuestion,
    buildNaturalTagQuestion,
    buildNaturalYesNoQuestion,
    buildNumberedTagChoiceQuestion,
    buildVisualPlannerPrompt,
    cleanOneLineAnswer,
    cleanRawDescription,
    parseNumberedChoiceAnswer,
    parseOptionalNumberedChoiceAnswer,
    type VisualPlannerPromptFacts
} from "./rp-engine/tasks/visual-planner-question.task";
import type { ResolverTextTraceRecorder } from "./resolverTextTrace";
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
    facts: VisualPlannerPromptFacts;
    abortSignal?: AbortSignal;
    onActionCompositionSelectionError?: (issue: ActionCompositionSelectionIssue) => void;
    trace?: ResolverTextTraceRecorder;
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
    const response = await askRawLlmLine({
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
        response.answer,
        input.allowedTags,
        input.fallback ?? []
    );

    runtime.facts[input.key] = tags;
    runtime.trace?.recordQuestion({
        key: input.key,
        kind: "tag_question",
        fullPrompt: response.fullPrompt,
        rawAnswer: response.rawAnswer,
        answer: response.answer,
        associatedTags: tags
    });

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
    const response = await askRawLlmLine({
        runtime,
        question: buildNumberedTagChoiceQuestion({
            question: input.question,
            allowedTags: input.allowedTags,
            example: input.example ?? "3"
        })
    });

    const chosenIndex = parseNumberedChoiceAnswer(response.answer, input.allowedTags.length);
    const chosenTag = chosenIndex === null
        ? input.fallback ?? null
        : input.allowedTags[chosenIndex].tag;

    if (chosenTag) {
        if (input.addToPlan !== false) {
            plan.fixedTags.push(chosenTag);
        }

        runtime.facts[input.key] = chosenTag;
    }

    runtime.trace?.recordQuestion({
        key: input.key,
        kind: "numbered_choice",
        fullPrompt: response.fullPrompt,
        rawAnswer: response.rawAnswer,
        answer: response.answer,
        associatedTags: chosenTag ? [chosenTag] : []
    });

    return chosenTag;
}

export async function chooseNamedChildFromQuestion(
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        question: string;
        choices: string[];
        example?: string;
    }
): Promise<string | null> {
    const response = await askRawLlmLine({
        runtime,
        question: buildNamedChildChoiceQuestion({
            question: input.question,
            choices: input.choices,
            example: input.example ?? "1"
        })
    });

    const chosenIndex = parseOptionalNumberedChoiceAnswer(response.answer, input.choices.length);
    const chosenName = chosenIndex === null ? null : input.choices[chosenIndex];
    runtime.facts[input.key] = chosenName ?? "none";
    runtime.trace?.recordQuestion({
        key: input.key,
        kind: "named_child_choice",
        fullPrompt: response.fullPrompt,
        rawAnswer: response.rawAnswer,
        answer: response.answer,
        associatedTags: []
    });

    return chosenName;
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
    const response = await askRawLlmLine({
        runtime,
        question: buildNaturalYesNoQuestion({
            question: input.question,
            target: input.target,
            example:
                input.example ??
                `Yes, the ${input.target} is visible.`
        })
    });

    const visible = parseYesNoAnswer(response.answer) ?? input.fallback ?? false;
    runtime.facts[input.key] = visible;
    runtime.trace?.recordQuestion({
        key: input.key,
        kind: "yes_no",
        fullPrompt: response.fullPrompt,
        rawAnswer: response.rawAnswer,
        answer: response.answer,
        associatedTags: []
    });

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
    const response = await askRawLlmLine({
        runtime,
        question: buildNaturalRawDescriptionQuestion({
            question: input.question,
            example:
                input.example ??
                "A side-view upper-body image of one girl standing near a rainy neon street."
        })
    });

    const text = cleanRawDescription(response.answer);

    if (text) {
        plan.rawDanbotDescriptions.push(text);
        runtime.facts[input.key] = text;
    }

    runtime.trace?.recordQuestion({
        key: input.key,
        kind: "raw_description",
        fullPrompt: response.fullPrompt,
        rawAnswer: response.rawAnswer,
        answer: response.answer,
        associatedTags: []
    });

    return text;
}

async function askRawLlmLine(input: {
    runtime: VisualPlannerRuntime;
    question: string;
}): Promise<{
    fullPrompt: string;
    rawAnswer: string;
    answer: string;
}> {
    const fullPrompt = buildVisualPlannerPrompt({
        node: input.runtime.node,
        facts: input.runtime.facts,
        question: input.question
    });
    const result = await input.runtime.backend.generateLlm(
        rpNovelLlmRequestConfig(
            input.runtime.config,
            fullPrompt,
            {
                max_tokens: Math.min(input.runtime.config.llm.max_tokens, 80),
                temperature: Math.min(input.runtime.config.llm.temperature, 0.15),
                stop: RP_NOVEL_STOP
            }
        ),
        { signal: input.runtime.abortSignal }
    );

    return {
        fullPrompt,
        rawAnswer: result.text,
        answer: cleanOneLineAnswer(result.text)
    };
}

