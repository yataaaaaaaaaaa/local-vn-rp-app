import type { AgentDebugTrace } from "@local-vn/story-application";

export type AnswerAttributionTarget = {
  kind:
    | "selected"
    | "agent"
    | "candidate"
    | "coherence"
    | "fallback"
    | "prompt";
  id: string;
  label: string;
  reason: string;
};

export type AnswerAttribution = {
  segmentId: string;
  text: string;
  targets: AnswerAttributionTarget[];
};

export type HoveredAttribution = {
  segmentId: string;
  targets: AnswerAttributionTarget[];
  x: number;
  y: number;
} | null;

export function buildAnswerAttributions(
  text: string,
  trace?: AgentDebugTrace,
): AnswerAttribution[] {
  const segments = splitAnswerIntoAttributionSegments(text);

  return segments.map((segment, index) => ({
    segmentId: `answer-segment-${index}`,
    text: segment,
    targets: attributionTargetsForSegment(segment, trace),
  }));
}

export function attributionTargetKey(target: AnswerAttributionTarget): string {
  return `${target.kind}:${target.id}`;
}

export function isAttributionTargetActive(
  activeTargetIds: Set<string>,
  kind: AnswerAttributionTarget["kind"],
  id: string,
): boolean {
  return activeTargetIds.has(`${kind}:${id}`);
}

function splitAnswerIntoAttributionSegments(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/\n+|[^.!?\n]+[.!?]+[\"')\]]*\s*|[^.!?\n]+/g);

  return matches?.length ? matches : [text];
}

function attributionTargetsForSegment(
  segment: string,
  trace?: AgentDebugTrace,
): AnswerAttributionTarget[] {
  if (!trace || !segment.trim()) return [];

  const targets: AnswerAttributionTarget[] = [];
  const selected = trace.selectedRedirect;
  const selectedTargetId = selected.fallback
    ? "stabilization"
    : selected.candidateId ?? "redirect";

  targets.push({
    kind: selected.fallback ? "fallback" : "selected",
    id: selectedTargetId,
    label: selected.fallback ? "Stabilization redirect" : "Selected redirect",
    reason: selected.reason,
  });

  if (selected.source) {
    const selectedAgent = trace.agents.find(
      (agent) => agent.id === selected.source,
    );

    targets.push({
      kind: "agent",
      id: selected.source,
      label: selectedAgent?.label ?? selected.source,
      reason: "owns the selected redirect source",
    });
  }

  if (selected.candidateId) {
    const selectedCandidate = trace.candidateBuffer.find(
      (candidate) => candidate.id === selected.candidateId,
    );

    targets.push({
      kind: "candidate",
      id: selected.candidateId,
      label: selectedCandidate?.label ?? selected.candidateId,
      reason: "accepted candidate text",
    });

    targets.push({
      kind: "coherence",
      id: selected.candidateId,
      label: "Coherence check",
      reason: "accepted by the hidden YES/NO check",
    });
  }

  for (const agent of trace.agents) {
    if (hasKeywordOverlap(segment, agent.notes.join(" "))) {
      targets.push({
        kind: "agent",
        id: agent.id,
        label: agent.label,
        reason: "matches agent notes",
      });
    }
  }

  for (const candidate of trace.candidateBuffer) {
    if (
      candidate.id !== selected.candidateId &&
      hasKeywordOverlap(segment, candidate.text)
    ) {
      targets.push({
        kind: "candidate",
        id: candidate.id,
        label: candidate.label ?? candidate.id,
        reason: "shares terms with candidate text",
      });
    }
  }

  if (targets.length === 0) {
    targets.push({
      kind: "prompt",
      id: "final-prompt",
      label: "Final prompt / scene context",
      reason: "no specific agent match",
    });
  }

  return dedupeAttributionTargets(targets).slice(0, 6);
}

function hasKeywordOverlap(answerSegment: string, sourceText: string): boolean {
  const answerKeywords = keywordSet(answerSegment);
  if (answerKeywords.size === 0) return false;

  let matches = 0;
  for (const keyword of keywordSet(sourceText)) {
    if (answerKeywords.has(keyword)) matches += 1;
    if (matches >= 2) return true;
  }

  return false;
}

function keywordSet(value: string): Set<string> {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "agent",
    "before",
    "candidate",
    "could",
    "detail",
    "does",
    "from",
    "have",
    "into",
    "keep",
    "like",
    "more",
    "must",
    "only",
    "reply",
    "scene",
    "that",
    "this",
    "turn",
    "with",
    "would",
    "your",
  ]);

  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]+/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !stopWords.has(word)),
  );
}

function dedupeAttributionTargets(
  targets: AnswerAttributionTarget[],
): AnswerAttributionTarget[] {
  const seen = new Set<string>();
  const deduped: AnswerAttributionTarget[] = [];

  for (const target of targets) {
    const key = attributionTargetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(target);
  }

  return deduped;
}
