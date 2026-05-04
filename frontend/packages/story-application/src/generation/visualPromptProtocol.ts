export const VISUAL_PLAN_SEPARATOR = "======================";

export interface VisualPromptPlan {
    fixedTags: string[];
    rawDanbotDescriptions: string[];
}

export function formatVisualPromptPlan(plan: VisualPromptPlan): string {
    const tagLine = `The tags that describe the image are: ${dedupeTags(plan.fixedTags).join(", ")}`;

    return [
        tagLine,
        ...plan.rawDanbotDescriptions.map((text) => text.trim()).filter(Boolean)
    ].join(`\n${VISUAL_PLAN_SEPARATOR}\n`);
}

export function parseVisualPromptPlan(text: string): VisualPromptPlan {
    const parts = text
        .split(VISUAL_PLAN_SEPARATOR)
        .map((part) => part.trim())
        .filter(Boolean);

    if (!parts.length) {
        return {
            fixedTags: [],
            rawDanbotDescriptions: []
        };
    }

    return {
        fixedTags: extractTagsFromTagSentence(parts[0]),
        rawDanbotDescriptions: parts.slice(1)
    };
}

export function extractTagsFromTagSentence(text: string): string[] {
    const afterIntro = text
        .replace(/^.*?\b(?:tag|tags)\b.*?\b(?:is|are)\b\s*:?\s*/i, "")
        .trim();

    return afterIntro
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function dedupeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const tag of tags) {
        const cleanTag = tag.trim();
        const key = cleanTag.toLowerCase();

        if (!cleanTag || seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(cleanTag);
    }

    return result;
}