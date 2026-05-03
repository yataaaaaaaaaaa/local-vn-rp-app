export interface InputSegment {
  key: string;
  text: string;
  matchKey: string | null;
  label?: string;
}

export interface ResolverTextMatch {
  [key: string]: unknown;
  phrase?: string;
  text?: string;
  source?: string;
  start?: number;
  end?: number;
  tags?: string[];
}

export interface PhraseRange {
  start: number;
  end: number;
  phrase: string;
  matchKey: string;
  label: string;
}

export function buildInputSegments(
  rawText: string,
  matches: readonly unknown[] = []
): InputSegment[] {
  if (!rawText) {
    return [];
  }

  const ranges = normalizeResolverTextWithRanges(rawText, matches);

  if (!ranges.length) {
    return [
      {
        key: "plain-0",
        text: rawText,
        matchKey: null
      }
    ];
  }

  const segments: InputSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({
        key: `plain-${cursor}`,
        text: rawText.slice(cursor, range.start),
        matchKey: null
      });
    }

    segments.push({
      key: `match-${range.matchKey}-${range.start}-${range.end}`,
      text: rawText.slice(range.start, range.end),
      matchKey: range.matchKey,
      label: range.label
    });

    cursor = range.end;
  }

  if (cursor < rawText.length) {
    segments.push({
      key: `plain-${cursor}`,
      text: rawText.slice(cursor),
      matchKey: null
    });
  }

  return segments;
}

export function normalizeResolverTextWithRanges(
  rawText: string,
  matches: readonly unknown[] = []
): PhraseRange[] {
  const resolverMatches = matches.filter(isResolverTextMatch);
  const explicitRanges = resolverMatches
    .map((match, index) => normalizeExplicitRange(rawText, match, index))
    .filter((range): range is PhraseRange => range !== null);

  const phraseRanges = resolverMatches.flatMap((match, index) => {
    const phrase = match.phrase ?? match.text ?? match.source ?? "";

    if (!phrase.trim()) {
      return [];
    }

    return findPhraseRanges(rawText, phrase).map((range, rangeIndex) => ({
      ...range,
      phrase,
      matchKey: keyForTextMatch(match, index, rangeIndex),
      label: labelForTextMatch(match, phrase)
    }));
  });

  return [...explicitRanges, ...phraseRanges]
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce<PhraseRange[]>((accepted, candidate) => {
      if (accepted.some((range) => rangesOverlap(range, candidate))) {
        return accepted;
      }

      accepted.push(candidate);
      return accepted;
    }, []);
}

export function findPhraseRanges(rawText: string, phrase: string): Array<{
  start: number;
  end: number;
}> {
  const normalizedPhrase = normalizeResolverText(phrase);

  if (!normalizedPhrase) {
    return [];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  const normalizedRawText = normalizeResolverText(rawText);
  let searchStart = 0;

  while (searchStart < normalizedRawText.length) {
    const index = normalizedRawText.indexOf(normalizedPhrase, searchStart);

    if (index < 0) {
      break;
    }

    ranges.push({
      start: index,
      end: index + normalizedPhrase.length
    });

    searchStart = index + normalizedPhrase.length;
  }

  return ranges;
}

export function rangesOverlap(
  first: { start: number; end: number },
  second: { start: number; end: number }
): boolean {
  return first.start < second.end && second.start < first.end;
}

export function normalizeResolverText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeExplicitRange(
  rawText: string,
  match: ResolverTextMatch,
  index: number
): PhraseRange | null {
  if (
    typeof match.start !== "number" ||
    typeof match.end !== "number" ||
    match.start < 0 ||
    match.end <= match.start ||
    match.end > rawText.length
  ) {
    return null;
  }

  const phrase = match.phrase ?? match.text ?? match.source ?? rawText.slice(match.start, match.end);

  return {
    start: match.start,
    end: match.end,
    phrase,
    matchKey: keyForTextMatch(match, index, 0),
    label: labelForTextMatch(match, phrase)
  };
}

function keyForTextMatch(
  match: ResolverTextMatch,
  index: number,
  rangeIndex: number
): string {
  const phrase = match.phrase ?? match.text ?? match.source ?? "match";
  return `${index}:${rangeIndex}:${phrase}`;
}

function labelForTextMatch(match: ResolverTextMatch, phrase: string): string {
  const tags = Array.isArray(match.tags) ? match.tags.join(", ") : "";
  return tags ? `${phrase} → ${tags}` : phrase;
}


function isResolverTextMatch(value: unknown): value is ResolverTextMatch {
  return typeof value === "object" && value !== null;
}
