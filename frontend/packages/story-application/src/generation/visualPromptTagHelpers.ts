export interface AllowedTag {
    tag: string;
    aliases?: string[];
}

export function normalizeTagText(value: string): string {
    return value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[_\-+/\\()[\]{}.,:;!?'"`~*|<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function extractAllowedTagsFromAnswer(
    answer: string,
    allowedTags: AllowedTag[],
    fallback: string[] = []
): string[] {
    const normalizedAnswer = ` ${normalizeTagText(answer)} `;
    const matches: string[] = [];

    for (const allowed of allowedTags) {
        const candidates = [allowed.tag, ...(allowed.aliases ?? [])];

        const matched = candidates.some((candidate) => {
            const normalizedCandidate = normalizeTagText(candidate);

            return (
                normalizedCandidate.length > 0 &&
                normalizedAnswer.includes(` ${normalizedCandidate} `)
            );
        });

        if (matched && !matches.includes(allowed.tag)) {
            matches.push(allowed.tag);
        }
    }

    return matches.length ? matches : fallback;
}

export function hasTagAmong(tags: string[], allowedTags: string[]): boolean {
    const normalizedTags = new Set(tags.map(normalizeTagText));

    return allowedTags.some((tag) => normalizedTags.has(normalizeTagText(tag)));
}

export function getTagsAmong(tags: string[], allowedTags: string[]): string[] {
    const normalizedAllowed = new Set(allowedTags.map(normalizeTagText));

    return tags.filter((tag) => normalizedAllowed.has(normalizeTagText(tag)));
}

export function parseYesNoAnswer(answer: string): boolean | null {
    const normalized = normalizeTagText(answer);

    if (
        /\b(?:yes|visible|shown|seen|clear|clearly visible|partially visible)\b/.test(
            normalized
        )
    ) {
        return true;
    }

    if (
        /\b(?:no|not visible|hidden|covered|cropped out|out of frame|not shown)\b/.test(
            normalized
        )
    ) {
        return false;
    }

    return null;
}