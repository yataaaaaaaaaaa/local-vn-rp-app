import type { StoryNodeFields } from "@local-vn/story-domain";

import { chooseNamedChildFromQuestion, type VisualPlannerRuntime } from "./visualPromptQuestionHelpers";

export interface ActionCompositionNode {
    name: string;
    question?: string;
    weight?: number;
    content: string[];
    child?: ActionCompositionNode[];
}

export interface ActionCompositionSelectionIssue {
    storyContext: string;
    visualContext: string;
    nodePath: string[];
    currentNodeName: string;
    availableChoices: string[];
    knownVisualDecisions: Record<string, string | boolean | string[]>;
}

export class ActionCompositionSelectionError extends Error {
    public readonly issue: ActionCompositionSelectionIssue;

    public constructor(issue: ActionCompositionSelectionIssue) {
        super(
            `Action composition tree has no matching child under "${issue.currentNodeName}". Add a node and regenerate.`
        );
        this.name = "ActionCompositionSelectionError";
        this.issue = issue;
    }
}

export const defaultActionCompositionTree: ActionCompositionNode = {
    name: "action composition decision tree",
    question: "Which action/composition branch best matches the current visible scene?",
    content: [],
    child: [
        {
            name: "default standing composition",
            weight: 1,
            content: ["standing", "straight-on", "upper body"]
        }
    ]
};

export async function selectActionCompositionTreeTags(input: {
    tree: ActionCompositionNode | null | undefined;
    runtime: VisualPlannerRuntime;
    seed: number;
}): Promise<string[]> {
    const tree = input.tree ?? defaultActionCompositionTree;
    const path: string[] = [tree.name];
    const selectedTags: string[] = [];
    let current = tree;

    for (let depth = 0; depth < 80; depth += 1) {
        validateActionCompositionNode(current);
        selectedTags.push(...cleanTags(current.content));
        input.runtime.facts.action_composition_tree = path.join(" > ");
        input.runtime.facts.action_composition_tags = selectedTags;

        const children = current.child ?? [];

        if (children.length === 0) {
            return selectedTags;
        }

        const weightedChildren = children.filter((child) => isPositiveWeight(child.weight));
        const next = weightedChildren.length
            ? chooseWeightedChild(children, `${input.seed}:${path.join("/")}`)
            : await chooseLlmChild({
                runtime: input.runtime,
                current,
                children,
                path
            });

        if (!next) {
            const issue = buildSelectionIssue(input.runtime.node, input.runtime.facts, path, current, children);
            input.runtime.onActionCompositionSelectionError?.(issue);
            throw new ActionCompositionSelectionError(issue);
        }

        current = next;
        path.push(current.name);
    }

    throw new Error("Action composition tree selection exceeded the maximum depth.");
}

export function validateActionCompositionNode(value: unknown): asserts value is ActionCompositionNode {
    if (!isRecord(value)) {
        throw new Error("Action composition tree node must be an object.");
    }

    if (typeof value.name !== "string" || !value.name.trim()) {
        throw new Error("Action composition tree node requires a non-empty name.");
    }

    if (value.weight !== undefined && typeof value.weight !== "number") {
        throw new Error(`Action composition node "${value.name}" has a non-numeric weight.`);
    }

    if (value.question !== undefined && typeof value.question !== "string") {
        throw new Error(`Action composition node "${value.name}" has a non-string question.`);
    }

    if (!Array.isArray(value.content) || !value.content.every((item) => typeof item === "string")) {
        throw new Error(`Action composition node "${value.name}" requires a content array.`);
    }

    if (value.child !== undefined && !Array.isArray(value.child)) {
        throw new Error(`Action composition node "${value.name}" has a non-array child field.`);
    }

    if (Array.isArray(value.child)) {
        for (const child of value.child) {
            validateActionCompositionNode(child);
        }
    }
}

export function cloneActionCompositionTree(tree: ActionCompositionNode): ActionCompositionNode {
    return JSON.parse(JSON.stringify(tree)) as ActionCompositionNode;
}

async function chooseLlmChild(input: {
    runtime: VisualPlannerRuntime;
    current: ActionCompositionNode;
    children: ActionCompositionNode[];
    path: string[];
}): Promise<ActionCompositionNode | null> {
    const choices = input.children.map((child) => child.name);
    const selectedName = await chooseNamedChildFromQuestion(input.runtime, {
        key: `action_composition_${toQuestionKeySuffix(input.path.join("_"))}`,
        question: input.current.question?.trim() ||
            `Choose the action/composition branch that best matches the current scene under "${input.current.name}".`,
        choices,
        example: "1"
    });

    if (!selectedName) {
        return null;
    }

    return input.children.find((child) => child.name === selectedName) ?? null;
}

function chooseWeightedChild(
    children: ActionCompositionNode[],
    seedText: string
): ActionCompositionNode {
    const totalWeight = children.reduce((sum, child) => sum + normalizedWeight(child.weight), 0);
    let cursor = seededRandom(seedText) * totalWeight;

    for (const child of children) {
        cursor -= normalizedWeight(child.weight);

        if (cursor <= 0) {
            return child;
        }
    }

    return children[children.length - 1];
}

function buildSelectionIssue(
    node: StoryNodeFields,
    facts: Record<string, string | boolean | string[]>,
    path: string[],
    current: ActionCompositionNode,
    children: ActionCompositionNode[]
): ActionCompositionSelectionIssue {
    return {
        storyContext: [
            node.context.trim() ? `CONTEXT:\n${node.context.trim()}` : "",
            node.userText.trim() ? `USER:\n${node.userText.trim()}` : "",
            node.dialogue.trim() ? `NPC:\n${node.dialogue.trim()}` : ""
        ].filter(Boolean).join("\n\n"),
        visualContext: node.visualDescription.trim(),
        nodePath: path,
        currentNodeName: current.name,
        availableChoices: children.map((child) => child.name),
        knownVisualDecisions: { ...facts }
    };
}

function normalizedWeight(weight: number | undefined): number {
    return isPositiveWeight(weight) ? weight : 1;
}

function cleanTags(tags: string[]): string[] {
    return tags.map((tag) => tag.trim()).filter(Boolean);
}

function isPositiveWeight(weight: number | undefined): weight is number {
    return typeof weight === "number" && Number.isFinite(weight) && weight > 0;
}

function seededRandom(seedText: string): number {
    let hash = 2166136261;

    for (let index = 0; index < seedText.length; index += 1) {
        hash ^= seedText.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    let state = hash >>> 0;
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

function toQuestionKeySuffix(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
