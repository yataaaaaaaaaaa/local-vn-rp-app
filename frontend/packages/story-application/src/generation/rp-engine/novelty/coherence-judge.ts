import type { AdvancementCard, BeatType, CoherenceCheckDebugEntry, RpPromptInput } from "../types";
import type { AgentNote, AgentNoveltyCandidate } from "../agents/types";
import {
  normalizeNoveltyControls,
  rankRomanceBeatCandidates,
  type CandidateScoringContext
} from "./candidate-scoring";

export type NoveltyAgentNote = AgentNote;

export type NoveltyCandidate = AgentNoveltyCandidate & {
  source: string;
  beatId?: BeatType;
  beat?: AdvancementCard;
  label?: string;
};

export type NoveltyCoherenceResult = {
  accepted: boolean;
  raw: string;
};

export type NoveltyCoherenceRunner = (prompt: string) => Promise<string>;

export type CoherentNoveltySelection = {
  /** The single text instruction that is allowed to become TURN_REDIRECT. */
  redirectText: string;
  candidate?: NoveltyCandidate;
  acceptedByJudge: boolean;
  checkedCandidateIds: string[];
  rejectedCandidateIds: string[];
  fallbackReason?: string;
  judgePrompts: string[];
  coherenceChecks: CoherenceCheckDebugEntry[];
  /** Present only when the accepted redirect originated from a deterministic deck card. */
  beat?: AdvancementCard;
};

export type SelectCoherentNoveltyInput = {
  promptInput: RpPromptInput;
  sceneText: string;
  agentNotes: NoveltyAgentNote[];
  candidates?: NoveltyCandidate[];
  /** Optional deterministic deck source used by tests/debug tools and as built-in candidates. */
  deck?: AdvancementCard[];
  context?: CandidateScoringContext;
  runCoherenceCheck?: NoveltyCoherenceRunner;
};

/**
 * Executable version of the RP prompt-generation loop.
 *
 * Pseudo-code shape kept intentionally close to the implementation:
 *
 * async function generateNpcDialogPromptForSceneI(sceneI, agents, config) {
 *   const agentNotes = [];
 *   const candidateBuffer = [];
 *
 *   for (const agent of agents) {
 *     const output = await agent.run({ scene: sceneI, previousAgentNotes: agentNotes, config });
 *     agentNotes.push(...output.notes);
 *     candidateBuffer.push(...output.candidates);
 *   }
 *
 *   let retryBuffer = weightedShuffleAndTrim(candidateBuffer, config.novelty);
 *   let acceptedCandidate = null;
 *
 *   for (let attempt = 0; attempt < config.novelty.coherence_retries && retryBuffer.length > 0; attempt++) {
 *     const candidate = retryBuffer.shift();
 *     const verdict = await callRpLlm(buildNoveltyCoherenceJudgePrompt(sceneI, agentNotes, candidate));
 *     if (parseYesNo(verdict) === "YES") {
 *       acceptedCandidate = candidate;
 *       break;
 *     }
 *   }
 *
 *   const turnRedirect = acceptedCandidate
 *     ? acceptedCandidate.text
 *     : "Do not force a new novelty beat this turn; stabilize the scene.";
 *
 *   return renderFinalPrompt({ scene: sceneI, agentNotes, turnRedirect });
 * }
 */
export async function selectCoherentNoveltyBeat(input: SelectCoherentNoveltyInput): Promise<CoherentNoveltySelection> {
  const controls = normalizeNoveltyControls(input.promptInput.novelty);
  const retries = Math.max(0, Math.min(8, Math.floor(controls.coherence_retries)));
  const candidateBuffer = input.candidates ?? buildNoveltyCandidateBuffer({
    promptInput: input.promptInput,
    deck: input.deck,
    context: input.context
  });
  const candidates = weightedShuffleAndTrim(candidateBuffer, input.promptInput, controls.candidate_pool_size);

  if (!input.runCoherenceCheck) {
    const fallbackReason = "No hidden RP-LLM coherence runner was provided.";
    return stabilizationSelection(fallbackReason);
  }

  if (retries <= 0) {
    const fallbackReason = "Coherence retries are disabled by config.";
    return stabilizationSelection(fallbackReason);
  }

  if (candidates.length === 0) {
    const fallbackReason = "No agent or built-in redirect candidates were available.";
    return stabilizationSelection(fallbackReason);
  }

  const checkedCandidateIds: string[] = [];
  const rejectedCandidateIds: string[] = [];
  const judgePrompts: string[] = [];
  const coherenceChecks: CoherenceCheckDebugEntry[] = [];

  for (let i = 0; i < retries && candidates.length > 0; i += 1) {
    const candidate = candidates.shift()!;
    const prompt = buildNoveltyCoherenceJudgePrompt({
      sceneText: input.sceneText,
      agentNotes: input.agentNotes,
      candidate
    });
    judgePrompts.push(prompt);
    checkedCandidateIds.push(candidate.id);

    let raw = "";
    try {
      raw = await input.runCoherenceCheck(prompt);
    } catch (error) {
      rejectedCandidateIds.push(candidate.id);
      coherenceChecks.push({
        attempt: i + 1,
        candidateId: candidate.id,
        candidateText: candidate.text,
        verdict: "ERROR",
        rawOutput: error instanceof Error ? error.message : String(error)
      });
      return stabilizationSelection(
        error instanceof Error
          ? `The hidden RP-LLM coherence checker failed: ${error.message}`
          : "The hidden RP-LLM coherence checker failed.",
        checkedCandidateIds,
        rejectedCandidateIds,
        judgePrompts,
        coherenceChecks
      );
    }

    const verdict = parseNoveltyCoherenceResult(raw);
    coherenceChecks.push({
      attempt: i + 1,
      candidateId: candidate.id,
      candidateText: candidate.text,
      verdict: verdict.accepted ? "YES" : "NO",
      rawOutput: raw
    });
    if (verdict.accepted) {
      return {
        beat: candidate.beat,
        redirectText: candidate.text,
        candidate,
        acceptedByJudge: true,
        checkedCandidateIds,
        rejectedCandidateIds,
        judgePrompts,
        coherenceChecks
      };
    }

    rejectedCandidateIds.push(candidate.id);
  }

  return stabilizationSelection(
    "The RP-LLM coherence checker rejected or exhausted the sampled redirect candidates.",
    checkedCandidateIds,
    rejectedCandidateIds,
    judgePrompts,
    coherenceChecks
  );
}

export function buildNoveltyCandidateBuffer(input: {
  promptInput: RpPromptInput;
  deck?: AdvancementCard[];
  context?: CandidateScoringContext;
  agentCandidates?: AgentNoveltyCandidate[];
}): NoveltyCandidate[] {
  const agentCandidates = (input.agentCandidates ?? []).map((candidate) => normalizeCandidate(candidate));
  const deckCandidates = input.deck && input.context
    ? buildDeckCandidates(input.promptInput, input.deck, input.context)
    : [];

  return dedupeCandidates([...agentCandidates, ...deckCandidates]);
}

export function buildNoveltyCoherenceJudgePrompt(input: {
  sceneText: string;
  agentNotes: NoveltyAgentNote[];
  candidate: NoveltyCandidate;
}): string {
  const notes = input.agentNotes.length
    ? input.agentNotes.map((note) => `- ${note.source}: ${note.text}`).join("\n")
    : "- none";

  return [
    "You are a hidden coherence checker for a romance/visual-novel RP engine.",
    "The next generation model can output only raw story text, so your job is only to accept or reject one possible redirect.",
    "",
    "SCENE_CONTEXT:",
    input.sceneText.trim() || "(empty)",
    "",
    "PREVIOUS_AGENT_NOTES:",
    notes,
    "",
    "CANDIDATE_REDIRECT:",
    input.candidate.text,
    "",
    "Answer YES only if all are true:",
    "- It fits the current scene and the latest user turn.",
    "- It does not contradict established facts, visible state, personna, intimacy state, or romance state.",
    "- It does not hijack the player's character, consent, thoughts, feelings, dialogue, or irreversible actions.",
    "- It can be expressed as one compact next reply without stacking another unrelated novelty beat.",
    "- It does not override boundary, safety, continuity, or fade-to-black requirements.",
    "",
    "If any condition fails, answer NO.",
    "Output exactly one token: YES or NO."
  ].join("\n");
}

export function parseNoveltyCoherenceResult(raw: string): NoveltyCoherenceResult {
  const firstToken = raw.trim().split(/\s+/)[0]?.replace(/[^a-z]/gi, "").toUpperCase() ?? "";
  return {
    accepted: firstToken === "YES" || firstToken === "Y",
    raw
  };
}

export function noveltySelectionSummary(selection?: CoherentNoveltySelection | null): string {
  if (!selection) return "No coherence selection was run.";
  if (selection.acceptedByJudge && selection.candidate) {
    return `RP-LLM coherence accepted ${selection.candidate.id} after ${selection.checkedCandidateIds.length} attempt(s).`;
  }
  return `Coherence fallback/stabilization: ${selection.fallbackReason ?? "no accepted candidate"}; checked=${selection.checkedCandidateIds.join(", ") || "none"}; rejected=${selection.rejectedCandidateIds.join(", ") || "none"}.`;
}

function buildDeckCandidates(
  promptInput: RpPromptInput,
  deck: AdvancementCard[],
  context: CandidateScoringContext
): NoveltyCandidate[] {
  const controls = normalizeNoveltyControls(context.controls ?? promptInput.novelty);
  const ranked = rankRomanceBeatCandidates(promptInput, deck, context, controls.candidate_pool_size);

  return ranked.map((beat) => {
    const source = sourceForBeat(beat);
    const label = beat.label ?? beat.id.replace(/_/g, " ");
    return {
      id: `deck:${source}:${beat.id}`,
      source,
      beatId: beat.id,
      beat,
      label,
      weight: Math.max(0, beat.weight),
      rationale: `Deterministic deck candidate: ${label}.`,
      text: candidateRedirectText(beat, source)
    };
  });
}

function sourceForBeat(beat: AdvancementCard): string {
  if (beat.id.startsWith("cliche_")) return "romance_cliche";
  if (beat.id.startsWith("persona_")) return "npc_personna";
  if (beat.id.startsWith("visual_")) return "visual";
  if (beat.id.startsWith("player_")) return "player";
  if (beat.id === "repair_and_respect" || beat.id === "boundary_check") return "safety";
  return "base";
}

function candidateRedirectText(beat: AdvancementCard, source: string): string {
  const label = beat.label ?? beat.id.replace(/_/g, " ");
  const constraint = beat.constraint ? ` Constraint: ${beat.constraint}` : "";
  const avoid = beat.avoid ? ` Avoid: ${beat.avoid}` : "";
  const sourceNote = source === "base" ? "general romance" : source.replace(/_/g, " ");
  return `Use one ${sourceNote} redirect (${label}): ${beat.directive}${constraint}${avoid} Do not add a second unrelated novelty beat.`;
}

function normalizeCandidate(candidate: AgentNoveltyCandidate): NoveltyCandidate {
  return {
    ...candidate,
    weight: Math.max(0, Number.isFinite(candidate.weight) ? candidate.weight : 0.25)
  };
}

function dedupeCandidates(candidates: NoveltyCandidate[]): NoveltyCandidate[] {
  const seen = new Set<string>();
  const deduped: NoveltyCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.id || `${candidate.source}:${candidate.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function stabilizationSelection(
  reason: string,
  checkedCandidateIds: string[] = [],
  rejectedCandidateIds: string[] = [],
  judgePrompts: string[] = [],
  coherenceChecks: CoherenceCheckDebugEntry[] = []
): CoherentNoveltySelection {
  return {
    redirectText: fallbackRedirectText(reason),
    acceptedByJudge: false,
    checkedCandidateIds,
    rejectedCandidateIds,
    fallbackReason: reason,
    judgePrompts,
    coherenceChecks
  };
}

function fallbackRedirectText(reason: string): string {
  return `Do not force a new novelty beat this turn. Stabilize the scene, answer the latest player input directly, preserve established agent state, and continue with one coherent low-risk detail. Reason: ${reason}`;
}

function weightedShuffleAndTrim(
  candidates: NoveltyCandidate[],
  promptInput: RpPromptInput,
  limit: number
): NoveltyCandidate[] {
  const maxSize = Math.max(1, Math.min(32, Math.floor(limit)));
  const pool = candidates.map((candidate) => ({
    ...candidate,
    weight: adjustedCandidateWeight(candidate, promptInput)
  }));
  const shuffled: NoveltyCandidate[] = [];
  const rng = promptInput.rng ?? Math.random;

  while (pool.length > 0 && shuffled.length < maxSize) {
    const total = pool.reduce((sum, candidate) => sum + Math.max(0.0001, candidate.weight), 0);
    let roll = Math.max(0, Math.min(0.999999999, rng())) * total;
    let index = 0;

    for (; index < pool.length; index += 1) {
      roll -= Math.max(0.0001, pool[index]!.weight);
      if (roll <= 0) break;
    }

    const [picked] = pool.splice(Math.min(index, pool.length - 1), 1);
    if (picked) shuffled.push(picked);
  }

  return shuffled;
}

function adjustedCandidateWeight(candidate: NoveltyCandidate, promptInput: RpPromptInput): number {
  const controls = normalizeNoveltyControls(promptInput.novelty);
  let weight = Math.max(0.0001, candidate.weight) * controls.level;

  switch (candidate.source) {
    case "romance_cliche":
      weight *= controls.romance_cliche_influence;
      break;
    case "npc_personna":
      weight *= controls.npc_personna_influence;
      break;
    case "sex_scene":
      weight *= controls.sex_scene_influence;
      break;
    default:
      weight *= controls.agent_influence;
      break;
  }

  if (candidate.beatId && promptInput.recentBeatTypes?.includes(candidate.beatId)) {
    weight /= Math.max(1, 1 + controls.repetition_guard);
  }

  return Math.max(0.0001, weight);
}
