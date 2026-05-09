export type PatternCue = {
  pattern: RegExp;
};

export function latestMatchingCue<TCue extends PatternCue>(text: string, cues: TCue[]): TCue | null {
  let best: { cue: TCue; index: number } | null = null;

  for (const cue of cues) {
    const index = latestMatchIndex(text, cue.pattern);
    if (index === null) continue;
    if (!best || index >= best.index) best = { cue, index };
  }

  return best?.cue ?? null;
}

function latestMatchIndex(text: string, pattern: RegExp): number | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const globalPattern = new RegExp(pattern.source, flags);
  let latest: number | null = null;
  let match: RegExpExecArray | null;

  while ((match = globalPattern.exec(text)) !== null) {
    latest = match.index;
  }

  return latest;
}
