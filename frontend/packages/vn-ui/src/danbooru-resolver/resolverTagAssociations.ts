export interface ResolverMatch {
  [key: string]: unknown;
  phrase?: string;
  text?: string;
  source?: string;
  tag?: string;
  tags?: string[];
  score?: number;
  start?: number;
  end?: number;
}

export interface ResolverTagAssociation {
  tag: string;
  matchKeys: string[];
  labels: string[];
  score?: number;
}

export function buildTagAssociations(
  tags: readonly string[] = [],
  matches: readonly unknown[] = []
): ResolverTagAssociation[] {
  const byTag = new Map<string, ResolverTagAssociation>();

  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);

    if (!normalizedTag) {
      continue;
    }

    byTag.set(normalizedTag, {
      tag: normalizedTag,
      matchKeys: [],
      labels: []
    });
  }

  for (const [index, rawMatch] of matches.entries()) {
    if (!isResolverMatch(rawMatch)) {
      continue;
    }

    const match = rawMatch;
    const matchTags = tagsForMatch(match);
    const matchKey = keyForMatch(match, index);
    const label = labelForMatch(match);

    for (const tag of matchTags) {
      const normalizedTag = normalizeTag(tag);

      if (!normalizedTag) {
        continue;
      }

      const existing =
        byTag.get(normalizedTag) ??
        {
          tag: normalizedTag,
          matchKeys: [],
          labels: [],
          score: match.score
        };

      existing.matchKeys.push(matchKey);

      if (label && !existing.labels.includes(label)) {
        existing.labels.push(label);
      }

      if (typeof match.score === "number") {
        existing.score =
          typeof existing.score === "number"
            ? Math.max(existing.score, match.score)
            : match.score;
      }

      byTag.set(normalizedTag, existing);
    }
  }

  return Array.from(byTag.values()).sort((first, second) => {
    const scoreDelta = (second.score ?? 0) - (first.score ?? 0);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return first.tag.localeCompare(second.tag);
  });
}

export function keyForMatch(match: ResolverMatch, index: number): string {
  const source =
    match.phrase ??
    match.text ??
    match.source ??
    match.tag ??
    match.tags?.join(",") ??
    "match";

  const range =
    typeof match.start === "number" && typeof match.end === "number"
      ? `${match.start}-${match.end}`
      : "no-range";

  return `${index}:${range}:${source}`;
}

function tagsForMatch(match: ResolverMatch): string[] {
  if (Array.isArray(match.tags)) {
    return match.tags;
  }

  if (typeof match.tag === "string") {
    return [match.tag];
  }

  return [];
}

function labelForMatch(match: ResolverMatch): string {
  return (
    match.phrase ??
    match.text ??
    match.source ??
    match.tag ??
    match.tags?.join(", ") ??
    ""
  ).trim();
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, "_");
}


function isResolverMatch(value: unknown): value is ResolverMatch {
  return typeof value === "object" && value !== null;
}
