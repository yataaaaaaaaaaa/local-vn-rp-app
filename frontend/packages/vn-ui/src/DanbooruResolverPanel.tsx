import { useEffect, useMemo, useState } from "react";
import { DanbooruTagResolverEditor } from "danbooru-tag-resolver";
import { useResolverStore, useStorySessionStore } from "@local-vn/stores";
import { useResolvedCurrentNode } from "./useResolvedCurrentNode";

export function DanbooruResolverPanel() {
  const currentNode = useResolvedCurrentNode();
  const applyResolverResultToWorkflow = useStorySessionStore((state) => state.applyResolverResult);
  const config = useResolverStore((state) => state.config);
  const seed = useResolverStore((state) => state.seed);
  const result = useResolverStore((state) => state.result);
  const setConfig = useResolverStore((state) => state.setConfig);
  const setRawText = useResolverStore((state) => state.setRawText);
  const setSeed = useResolverStore((state) => state.setSeed);
  const resolve = useResolverStore((state) => state.resolve);
  const [message, setMessage] = useState<string | null>(null);
  const [activeMatchKey, setActiveMatchKey] = useState<string | null>(null);

  const rawText = useMemo(() => currentNode.visualDescription || currentNode.dialogue || currentNode.context, [currentNode.context, currentNode.dialogue, currentNode.visualDescription]);
  const inputSegments = useMemo(() => buildInputSegments(rawText, result.matches), [rawText, result.matches]);
  const tagAssociations = useMemo(() => buildTagAssociations(result.tags, result.matches), [result.tags, result.matches]);

  useEffect(() => {
    setRawText(rawText);
    resolve(rawText);
  }, [rawText, seed, config, setRawText, resolve]);

  function applyResolverResult() {
    const resolved = resolve(rawText);
    void applyResolverResultToWorkflow({ rawText, tags: resolved.tags, prompt: resolved.prompt })
      .then(() => setMessage("Resolver output accepted through the workflow."));
  }

  return (
    <section className="panel danbooru-resolver-panel">
      <div className="panel-header">
        <div>
          <h2>Danbooru Tag Resolver UI</h2>
          <div className="small">The resolver writes through the workflow command layer; it no longer edits story fields directly.</div>
        </div>
        <div className="button-row">
          <label><span>Seed</span><input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
          <button onClick={() => { resolve(rawText); setMessage("Resolver preview refreshed."); }}>Preview tags</button>
          <button onClick={applyResolverResult}>Apply to workflow</button>
        </div>
      </div>

      <div className="resolver-top-grid">
        <div className="resolver-input-panel">
          <h3>Resolver input</h3>
          <div className="readonly-box resolver-highlight-text">
            {rawText ? inputSegments.map((segment) => (
              segment.matchKey ? (
                <span
                  key={segment.key}
                  className={["resolver-source-highlight", activeMatchKey === segment.matchKey ? "active" : ""].filter(Boolean).join(" ")}
                  onMouseEnter={() => setActiveMatchKey(segment.matchKey)}
                  onMouseLeave={() => setActiveMatchKey(null)}
                  title={segment.label}
                >
                  {segment.text}
                </span>
              ) : (
                <span key={segment.key}>{segment.text}</span>
              )
            )) : "No visual description/dialogue/context available."}
          </div>
        </div>

        <div className="resolver-preview-panel">
          <h3>Resolver preview</h3>
          <div className="readonly-box resolver-tag-preview">
            {tagAssociations.length ? tagAssociations.map((tag) => (
              <span
                key={tag.tag}
                className={["resolver-tag-chip", tag.matchKeys.includes(activeMatchKey ?? "") ? "active" : ""].filter(Boolean).join(" ")}
                onMouseEnter={() => setActiveMatchKey(tag.matchKeys[0] ?? null)}
                onMouseLeave={() => setActiveMatchKey(null)}
                title={tag.labels.join(", ")}
              >
                {tag.tag}
              </span>
            )) : "No tags resolved yet."}
          </div>
          {result.warnings.length ? <ul className="warning-list">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
        </div>
      </div>

      <div className="resolver-editor-row">
        <h3>Danbooru tag resolver</h3>
        <DanbooruTagResolverEditor value={config} rawText={rawText} seed={seed} onChange={setConfig} />
      </div>
      {message ? <p className="small">{message}</p> : null}
    </section>
  );
}

type InputSegment = {
  key: string;
  text: string;
  matchKey: string | null;
  label: string;
};

type ResolverMatch = {
  categoryId: string;
  categoryName: string;
  entryId: string;
  entryName: string;
  matchedPhrases: string[];
  selectedTags: string[];
};

function buildInputSegments(rawText: string, matches: ResolverMatch[]): InputSegment[] {
  if (!rawText) return [];

  const ranges = matches.flatMap((match) => {
    const matchKey = keyForMatch(match);
    return match.matchedPhrases.flatMap((phrase) =>
      findPhraseRanges(rawText, phrase).map((range) => ({
        ...range,
        matchKey,
        label: `${match.entryName}: ${match.selectedTags.join(", ")}`
      }))
    );
  }).sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));

  const selectedRanges: typeof ranges = [];
  for (const range of ranges) {
    if (!selectedRanges.some((selected) => rangesOverlap(range, selected))) selectedRanges.push(range);
  }
  selectedRanges.sort((left, right) => left.start - right.start);

  const segments: InputSegment[] = [];
  let cursor = 0;
  selectedRanges.forEach((range, index) => {
    if (range.start > cursor) {
      segments.push({ key: `plain-${cursor}`, text: rawText.slice(cursor, range.start), matchKey: null, label: "" });
    }
    segments.push({
      key: `match-${range.matchKey}-${index}-${range.start}`,
      text: rawText.slice(range.start, range.end),
      matchKey: range.matchKey,
      label: range.label
    });
    cursor = range.end;
  });
  if (cursor < rawText.length) segments.push({ key: `plain-${cursor}`, text: rawText.slice(cursor), matchKey: null, label: "" });
  return segments.length ? segments : [{ key: "plain-0", text: rawText, matchKey: null, label: "" }];
}

function buildTagAssociations(tags: string[], matches: ResolverMatch[]) {
  return tags.map((tag) => {
    const matchingEntries = matches.filter((match) => match.selectedTags.includes(tag));
    return {
      tag,
      matchKeys: matchingEntries.map(keyForMatch),
      labels: matchingEntries.map((match) => `${match.entryName}: ${match.matchedPhrases.join(", ")}`)
    };
  });
}

function keyForMatch(match: ResolverMatch): string {
  return `${match.categoryId}/${match.entryId}`;
}

function findPhraseRanges(rawText: string, phrase: string): Array<{ start: number; end: number }> {
  const needle = normalizeResolverText(phrase);
  if (!needle) return [];

  const { normalized, ranges: originalRanges } = normalizeResolverTextWithRanges(rawText);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = normalized.indexOf(needle);
  while (start >= 0) {
    const end = start + needle.length;
    const originalStart = originalRanges[start]?.start;
    const originalEnd = originalRanges[end - 1]?.end;
    const hasStartBoundary = start === 0 || normalized[start - 1] === " ";
    const hasEndBoundary = end === normalized.length || normalized[end] === " ";
    if (hasStartBoundary && hasEndBoundary && originalStart !== undefined && originalEnd !== undefined) {
      ranges.push({ start: originalStart, end: originalEnd });
    }
    start = normalized.indexOf(needle, end);
  }
  return ranges;
}

function rangesOverlap(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  return left.start < right.end && right.start < left.end;
}

function normalizeResolverText(input: string): string {
  return input
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeResolverTextWithRanges(input: string): { normalized: string; ranges: Array<{ start: number; end: number }> } {
  let normalized = "";
  const ranges: Array<{ start: number; end: number }> = [];
  let rawIndex = 0;

  for (const character of input) {
    const start = rawIndex;
    const end = start + character.length;
    rawIndex = end;

    const normalizedCharacter = /[\p{P}\p{S}\s]/u.test(character)
      ? " "
      : character.normalize("NFKC").toLocaleLowerCase();

    for (const outputCharacter of normalizedCharacter) {
      if (outputCharacter === " " && normalized.endsWith(" ")) continue;
      normalized += outputCharacter;
      ranges.push({ start, end });
    }
  }

  if (normalized.startsWith(" ")) {
    normalized = normalized.slice(1);
    ranges.shift();
  }
  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    ranges.pop();
  }

  return { normalized, ranges };
}
