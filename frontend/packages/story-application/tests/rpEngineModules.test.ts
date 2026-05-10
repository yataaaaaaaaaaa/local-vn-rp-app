import { describe, expect, it } from "vitest";

import { renderPromptTemplate } from "../src/generation/rp-engine/prompt/mustache-renderer";
import { buildNoveltyCandidateBuffer, buildNoveltyCoherenceJudgePrompt, parseNoveltyCoherenceResult, selectCoherentNoveltyBeat } from "../src/generation/rp-engine/novelty/coherence-judge";
import { extractForbiddenFragments } from "../src/generation/rp-engine/novelty/repetition-guard";
import { detailBudgetInstructionForControls, selectRomanceBeat, withNoveltyControls, type CandidateScoringContext } from "../src/generation/rp-engine/novelty/candidate-scoring";
import { PLAYER_RESPONSE_BEATS } from "../src/generation/rp-engine/novelty/player-beat-deck";
import { ROMANCE_AGENT } from "../src/generation/rp-engine/agents/romance-agent";
import { NPC_PERSONNA_AGENT } from "../src/generation/rp-engine/agents/npc-personna-agent";
import { SEX_SCENE_AGENT } from "../src/generation/rp-engine/agents/sex-scene-agent";
import { DIALOGUE_QUALITY_AGENT } from "../src/generation/rp-engine/agents/dialogue-quality-agent";
import type { RpPromptInput } from "../src/generation/rp-engine/types";

const emptyNode: RpPromptInput["node"] = {
  context: "",
  userText: "",
  dialogue: "",
  visualDescription: "",
  resolverText: "",
  selectedTags: "",
  danbotTags: "",
  positivePrompt: "",
  negativePrompt: "",
  imageRef: ""
};

const trustContext: CandidateScoringContext = {
  closeness: 5,
  phase: "trust",
  currentTension: "emotional honesty and trust are active",
  callbackDetail: "(none)",
  boundaryDetected: false
};

describe("RP engine modules", () => {
  it("renders Mustache prompt variables as raw text instead of HTML entities", () => {
    expect(renderPromptTemplate("VALUE: {{value}}", { value: "<raw & visible>" })).toBe("VALUE: <raw & visible>");
  });

  it("extracts repetition guard fragments from recent output text", () => {
    expect(
      extractForbiddenFragments("She looks at the candle and remembers the promise. He waits by the rain-streaked window.")
    ).toContain("She looks at the candle and remembers the");
  });

  it("builds a text-first candidate buffer and YES/NO coherence prompt", () => {
    const candidates = buildNoveltyCandidateBuffer({
      promptInput: { node: emptyNode, rng: () => 0 },
      deck: PLAYER_RESPONSE_BEATS,
      context: withNoveltyControls(trustContext, { candidate_pool_size: 3 })
    });
    const prompt = buildNoveltyCoherenceJudgePrompt({
      sceneText: "USER: Take my hand.",
      agentNotes: [{ source: "romance", text: "phase=trust; closeness=5/10" }],
      candidate: candidates[0]!
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(candidates[0]!.text).toContain("Use one");
    expect(prompt).toContain("CANDIDATE_REDIRECT:");
    expect(prompt).toContain("Output exactly one token: YES or NO");
    expect(parseNoveltyCoherenceResult("YES").accepted).toBe(true);
    expect(parseNoveltyCoherenceResult("YES.").accepted).toBe(true);
    expect(parseNoveltyCoherenceResult("No, not coherent").accepted).toBe(false);
  });

  it("falls back to stabilization when the RP-LLM coherence checker rejects every candidate", async () => {
    const selection = await selectCoherentNoveltyBeat({
      promptInput: { node: emptyNode, rng: () => 0, novelty: { coherence_retries: 2, candidate_pool_size: 2 } },
      deck: PLAYER_RESPONSE_BEATS,
      context: trustContext,
      sceneText: "USER: Stay with me, but do not rush.",
      agentNotes: [{ source: "romance", text: "phase=trust; closeness=5/10" }],
      runCoherenceCheck: async () => "NO"
    });

    expect(selection.acceptedByJudge).toBe(false);
    expect(selection.redirectText).toContain("Do not force a new novelty beat");
    expect(selection.candidate).toBeUndefined();
    expect(selection.rejectedCandidateIds.length).toBe(2);
  });

  it("accepts exactly one redirect candidate when the hidden checker says YES", async () => {
    const selection = await selectCoherentNoveltyBeat({
      promptInput: { node: emptyNode, rng: () => 0, novelty: { coherence_retries: 2, candidate_pool_size: 2 } },
      candidates: [{ id: "manual:direct-answer", source: "dialogue_quality", weight: 1, text: "Have the NPC answer directly and move one small step forward." }],
      sceneText: "USER: Answer me honestly.",
      agentNotes: [{ source: "dialogue-quality", text: "avoid repeated questions" }],
      runCoherenceCheck: async () => "YES."
    });

    expect(selection.acceptedByJudge).toBe(true);
    expect(selection.redirectText).toContain("answer directly");
    expect(selection.checkedCandidateIds).toEqual(["manual:direct-answer"]);
  });

  it("runs the four dialogue agents as note/candidate producers", () => {
    const node = {
      ...emptyNode,
      context: "Story setup: A cool kuudere NPC waits with the player under heavy rain.",
      userText: "You do not have to pretend the thunder did not scare you."
    };
    const input = { node, promptInput: { node, rng: () => 0.2 }, previousAgentNotes: [] };
    const outputs = [
      NPC_PERSONNA_AGENT.run(input),
      ROMANCE_AGENT.run(input),
      SEX_SCENE_AGENT.run(input),
      DIALOGUE_QUALITY_AGENT.run(input)
    ];

    expect(outputs.flatMap((output) => output.notes ?? []).length).toBeGreaterThan(0);
    expect(outputs.flatMap((output) => output.candidates ?? []).length).toBeGreaterThan(0);
  });

  it("keeps numeric novelty controls code-side", () => {
    expect(detailBudgetInstructionForControls({ detail_budget: 0 })).toContain("stabilize");
    expect(detailBudgetInstructionForControls({ detail_budget: 2 })).toContain("support details");
  });

  it("switches player novelty planning to the boundary-safe beat", () => {
    const beat = selectRomanceBeat(
      {
        node: { ...emptyNode, userText: "Wait, slow down." },
        boundaryDetected: true
      },
      PLAYER_RESPONSE_BEATS,
      trustContext
    );

    expect(beat.id).toBe("player_hold_boundary");
  });
});
