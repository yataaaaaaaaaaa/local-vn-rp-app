import { createDefaultBackendRuntimeConfig } from "@local-vn/config";
import type { StoryNodeFields } from "@local-vn/story-domain";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { StoryGenerationBackend } from "../../src/ports";
import { rpNovelLlmRequestConfig } from "../../src/generation/llmRequestConfig";
import {
  RP_DIALOGUE_STOP,
  RP_NOVEL_STOP,
  buildAutomaticUserAnswerPromptWithActorNameCache,
  buildRpAnswerPromptWithActorNameCache
} from "../../src/generation/rpNovelPrompts";
import type { RpLlmTraceEntry } from "../../src/generation/rpLlmTrace";
import type { AdvancementCard } from "../../src/generation/rp-engine/types";

export const DEFAULT_LLM_MODEL =
  "D:/Anything/llm/Forgotten-Safeword-12B-v4.0.Q6_K.gguf";
export const EXCHANGE_ITERATIONS = 10;
export const FAST_PACING_TARGET_ITERATION = 5;
export const SEX_SCENE_TARGET_ITERATION = 7;

export type IterativePacingSessionOptions = {
  backend: StoryGenerationBackend;
  baseUrl: string;
  modelPath: string;
};

export type IterationLedgerEntry = {
  iteration: number;
  userText: string;
  npcText: string;
  intimacyStarted: boolean;
  sexSceneStarted: boolean;
  novelty: ReturnType<typeof evaluateNovelty>;
  coherence: ReturnType<typeof evaluateCoherence>;
};

export type IterativePacingSessionResult = {
  entries: IterationLedgerEntry[];
  traces: RpLlmTraceEntry[];
  firstIntimacyIteration: number | null;
  firstSexSceneIteration: number | null;
  quality: ReturnType<typeof evaluateSessionQuality>;
  config: BackendRuntimeConfig;
};

export async function runIterativePacingSession(
  options: IterativePacingSessionOptions
): Promise<IterativePacingSessionResult> {
  const config = createIterativePacingRuntimeConfig(options.modelPath);
  const traces: RpLlmTraceEntry[] = [];
  const entries: IterationLedgerEntry[] = [];
  let document = baseArchiveNode();
  let firstIntimacyIteration: number | null = null;
  let firstSexSceneIteration: number | null = null;

  for (let iteration = 1; iteration <= EXCHANGE_ITERATIONS; iteration += 1) {
    const userPrompt = await buildAutomaticUserAnswerPromptWithActorNameCache(
      {
        node: document,
        storyId: "iterative-rp-pacing-ledger",
        selectedNodeId: `archive-run-${iteration}`,
        novelty: config.novelty,
        advancementCard: playerCardForIteration(iteration, firstIntimacyIteration, firstSexSceneIteration),
        recentBeatTypes: recentPlayerBeatIds(entries)
      },
      createHiddenActorNameExtractionRunner(options.backend, config),
      createHiddenNoveltyCoherenceRunner(options.backend, config)
    );
    const userResult = await options.backend.generateLlm(
      rpNovelLlmRequestConfig(config, userPrompt.prompt, {
        max_tokens: 56,
        temperature: 0.78,
        seed: 10_000 + iteration,
        stop: RP_DIALOGUE_STOP
      })
    );
    const userText = userResult.text.trim();

    traces.push({
      nodeId: `archive-run-${iteration}`,
      stepId: "userText",
      fullPrompt: userPrompt.prompt,
      rawAnswer: userResult.text,
      answer: userText
    });

    const npcPrompt = await buildRpAnswerPromptWithActorNameCache(
      {
        node: { ...document, userText },
        storyId: "iterative-rp-pacing-ledger",
        selectedNodeId: `archive-run-${iteration}`,
        novelty: config.novelty,
        advancementCard: npcCardForIteration(iteration, firstIntimacyIteration, firstSexSceneIteration),
        recentBeatTypes: recentNpcBeatIds(entries)
      },
      createHiddenActorNameExtractionRunner(options.backend, config),
      createHiddenNoveltyCoherenceRunner(options.backend, config)
    );
    const npcResult = await options.backend.generateLlm(
      rpNovelLlmRequestConfig(config, npcPrompt.prompt, {
        max_tokens: 140,
        temperature: 0.82,
        seed: 20_000 + iteration,
        stop: RP_DIALOGUE_STOP
      })
    );
    const npcText = npcResult.text.trim();
    const exchangeText = [userText, npcText].join("\n");
    const intimacyStarted = detectsKissOrSexScene(exchangeText);
    const sexSceneStarted = detectsSexScene(exchangeText);

    traces.push({
      nodeId: `archive-run-${iteration}`,
      stepId: "dialogue",
      fullPrompt: npcPrompt.prompt,
      rawAnswer: npcResult.text,
      answer: npcText
    });

    if (intimacyStarted && firstIntimacyIteration === null) {
      firstIntimacyIteration = iteration;
    }

    if (sexSceneStarted && firstSexSceneIteration === null) {
      firstSexSceneIteration = iteration;
    }

    entries.push({
      iteration,
      userText,
      npcText,
      intimacyStarted,
      sexSceneStarted,
      novelty: evaluateNovelty(entries, exchangeText),
      coherence: evaluateCoherence(exchangeText)
    });

    document = {
      ...baseArchiveNode(),
      context: appendExchange(document.context, userText, npcText)
    };
  }

  return {
    entries,
    traces,
    firstIntimacyIteration,
    firstSexSceneIteration,
    quality: evaluateSessionQuality(entries),
    config
  };
}

export function writeIterativePacingLedger(
  path: string,
  input: IterativePacingSessionResult & { baseUrl: string; modelPath: string }
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      "# Iterative RP Pacing Ledger",
      "",
      `Run date: ${new Date().toISOString()}`,
      `Backend: ${input.baseUrl}`,
      `Model: ${input.modelPath}`,
      `Exchange iterations: ${EXCHANGE_ITERATIONS}`,
      `Fast pacing target: kiss or sex scene started by iteration ${FAST_PACING_TARGET_ITERATION}`,
      `Sex-scene target: sex scene started by iteration ${SEX_SCENE_TARGET_ITERATION}`,
      `First detected kiss/sex-scene iteration: ${input.firstIntimacyIteration ?? "not detected"}`,
      `First detected sex-scene iteration: ${input.firstSexSceneIteration ?? "not detected"}`,
      `Average novelty score: ${input.quality.averageNoveltyScore}`,
      `Unforeseen resonance accelerator present: ${input.quality.hasUnforeseenAccelerator ? "yes" : "no"}`,
      `Repeated-turn issues: ${input.quality.repeatedTurnIssues.length ? input.quality.repeatedTurnIssues.join("; ") : "none"}`,
      `Quality issues: ${input.quality.issues.length ? input.quality.issues.join("; ") : "none"}`,
      "",
      "## Setup",
      "",
      fenced(INITIAL_CONTEXT.trim()),
      "",
      "## Iterations",
      "",
      ...input.entries.flatMap((entry) => [
        `### Iteration ${entry.iteration}`,
        "",
        `Novelty: ${entry.novelty.level} (${entry.novelty.score}) - ${entry.novelty.notes.join("; ")}`,
        `Coherence: ${entry.coherence.level} - ${entry.coherence.notes.join("; ")}`,
        `Kiss/sex scene marker: ${entry.intimacyStarted ? "yes" : "no"}`,
        `Sex-scene marker: ${entry.sexSceneStarted ? "yes" : "no"}`,
        "",
        `François: ${entry.userText}`,
        "",
        `Constance: ${entry.npcText}`,
        ""
      ]),
      "## Trace Summary",
      "",
      `Visible generation calls: ${input.traces.length}`,
      `User calls: ${input.traces.filter((trace) => trace.stepId === "userText").length}`,
      `NPC calls: ${input.traces.filter((trace) => trace.stepId === "dialogue").length}`,
      ""
    ].join("\n"),
    "utf-8"
  );
}

export function detectsKissOrSexScene(text: string): boolean {
  return detectsKiss(text) || detectsSexScene(text);
}

function detectsKiss(text: string): boolean {
  return /\b(?:kiss(?:es|ed|ing)?|mouths? meet|lips? (?:meet|touch|brush|part)|make out|making out|sex scene|making love|have sex|having sex|adult intimacy|undress(?:es|ed|ing)?|clothes loosen|thesis partners become lovers)\b/i.test(
    text
  );
}

export function detectsSexScene(text: string): boolean {
  return /\b(?:sex scene|adult intimacy|making love|have sex|having sex|full union|bodies? becoming one channel|undress(?:es|ed|ing)?|unbutton(?:s|ed|ing)?|buttons? (?:of|on)|clothes? loosen|clothing barrier|coat slips? from (?:his|her|their|your|my)? ?shoulders?|tugg(?:ed|ing)? (?:it|the coat|your coat|his coat|her coat) down over (?:his|her|their|your|my)? ?shoulders?|fabric .*pools? at (?:his|her|their|your|my)? ?feet|pools? at (?:his|her|their|your|my)? ?feet|working at (?:the )?buttons?|shirt open|gown (?:hiked|loosened|opened)|belt (?:unbuckles|unbuckled|loosens|loosened|catches)|clasp snaps open|garment slipping|pool around (?:her|his|their|your|my)? ?waist|straddl(?:e|es|ed|ing)?)\b/i.test(
    text
  );
}

export function evaluateSessionQuality(entries: IterationLedgerEntry[]): {
  averageNoveltyScore: number;
  lowNoveltyCount: number;
  hasUnforeseenAccelerator: boolean;
  repeatedTurnIssues: string[];
  issues: string[];
} {
  const averageNoveltyScore = entries.length
    ? Number((entries.reduce((sum, entry) => sum + entry.novelty.score, 0) / entries.length).toFixed(2))
    : 0;
  const lowNoveltyCount = entries.filter((entry) => entry.novelty.level === "low").length;
  const hasUnforeseenAccelerator = entries.some((entry) =>
    /\b(?:without warning|sudden(?:ly)?|unexpected|unforeseen|candle (?:flare|surge)|flame (?:flare|surge)|theorem (?:rewrite|rewrites|rewriting)|pages? (?:flutter|rewrite|rewrites)|channel lock|grimoire (?:answers|opens|snaps|glows)|resonance (?:surges|locks|pushes|accelerates))\b/i.test(
      `${entry.userText}\n${entry.npcText}`
    )
  );
  const repeatedTurnIssues = repeatedOutputIssues(entries);
  const issues = [
    averageNoveltyScore < 0.45 ? `average novelty too low (${averageNoveltyScore})` : "",
    lowNoveltyCount > 3 ? `too many low-novelty exchanges (${lowNoveltyCount})` : "",
    !hasUnforeseenAccelerator ? "missing unforeseen Resonance Symbiosis accelerator" : "",
    repeatedTurnIssues.length ? `repeated generated turns (${repeatedTurnIssues.length})` : ""
  ].filter(Boolean);

  return {
    averageNoveltyScore,
    lowNoveltyCount,
    hasUnforeseenAccelerator,
    repeatedTurnIssues,
    issues
  };
}

export function evaluateNovelty(
  previousEntries: IterationLedgerEntry[],
  exchangeText: string
): { level: "low" | "medium" | "high"; score: number; notes: string[] } {
  const previousText = previousEntries
    .map((entry) => `${entry.userText}\n${entry.npcText}`)
    .join("\n");
  const currentTokens = significantTokens(exchangeText);
  const previousTokens = new Set(significantTokens(previousText));
  const freshTokenCount = currentTokens.filter((token) => !previousTokens.has(token)).length;
  const freshRatio = currentTokens.length ? freshTokenCount / currentTokens.length : 0;
  const surpriseAnchors = [
    /\b(?:sigil|theorem|resonance|symbiosis|channel|core|burnout|hollowing|breach)\b/i,
    /\b(?:ink|satchel|silver belt|grimoires?|candles?|oak table|archive)\b/i,
    /\b(?:trust|risk|merge|fusion|experiment|thesis|cold war)\b/i
  ].filter((pattern) => pattern.test(exchangeText)).length;
  const score = Number((freshRatio * 0.7 + Math.min(1, surpriseAnchors / 3) * 0.3).toFixed(2));
  const level = score >= 0.66 ? "high" : score >= 0.38 ? "medium" : "low";

  return {
    level,
    score,
    notes: [
      `fresh token ratio ${freshRatio.toFixed(2)}`,
      `${surpriseAnchors}/3 scene-specific anchor groups present`
    ]
  };
}

export function evaluateCoherence(
  exchangeText: string
): { level: "poor" | "ok" | "strong"; notes: string[] } {
  const notes: string[] = [];
  const hasInstructionLeak = /turn the selected|selected player beat|concrete beat|final task|output only|personna influences|selected novelty|agent influence|npc_personna|kuudere|dere archetype/i.test(
    exchangeText
  );
  const hasSceneAnchor = /\b(?:archive|grimoires?|theorem|resonance|symbiosis|magic|candle|oak table|thesis|fusion|channel)\b/i.test(
    exchangeText
  );
  const hasNpcContinuity = /\b(?:Constance|she|her|grey eyes|silver belt|composure|knuckles)\b/i.test(
    exchangeText
  );
  const hasPlayerContinuity = /\b(?:François|Francois|I|my|me|ink|satchel|cavalier)\b/i.test(
    exchangeText
  );

  if (hasInstructionLeak) notes.push("output leaked hidden prompt instructions");
  if (!hasSceneAnchor) notes.push("weak archive/theorem continuity");
  if (!hasNpcContinuity) notes.push("weak Constance continuity");
  if (!hasPlayerContinuity) notes.push("weak François continuity");

  if (hasInstructionLeak || notes.length >= 3) {
    return { level: "poor", notes };
  }

  return { level: notes.length === 0 ? "strong" : "ok", notes: notes.length ? notes : ["coherent"] };
}

function createIterativePacingRuntimeConfig(modelPath: string): BackendRuntimeConfig {
  return createDefaultBackendRuntimeConfig({
    llm: {
      model_path: modelPath,
      max_tokens: 140,
      temperature: 0.82,
      top_p: 0.94,
      top_k: 50,
      min_p: 0.04,
      repeat_penalty: 1.12,
      timeout_seconds: Number(process.env.LOCAL_VN_RP_ITERATIVE_TIMEOUT ?? 900)
    },
    novelty: {
      level: 1.8,
      agent_influence: 1.4,
      romance_cliche_influence: 0.7,
      npc_personna_influence: 1.15,
      sex_scene_influence: 1.65,
      repetition_guard: 1.85,
      detail_budget: 1.35,
      coherence_retries: 2,
      candidate_pool_size: 8
    }
  });
}

function createHiddenActorNameExtractionRunner(
  backend: StoryGenerationBackend,
  config: BackendRuntimeConfig
): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const result = await backend.generateLlm(
      rpNovelLlmRequestConfig(config, prompt, {
        max_tokens: 80,
        temperature: 0,
        stop: RP_NOVEL_STOP,
        debug_no_log: true
      })
    );

    return result.text;
  };
}

function createHiddenNoveltyCoherenceRunner(
  backend: StoryGenerationBackend,
  config: BackendRuntimeConfig
): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const result = await backend.generateLlm(
      rpNovelLlmRequestConfig(config, prompt, {
        max_tokens: 4,
        temperature: 0,
        top_p: 1,
        stop: RP_NOVEL_STOP,
        debug_no_log: true
      })
    );

    return result.text;
  };
}

function baseArchiveNode(): StoryNodeFields {
  return {
    context: INITIAL_CONTEXT,
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
}

function appendExchange(context: string, userText: string, npcText: string): string {
  return [
    context.trim(),
    "",
    "PREVIOUS_TURN:",
    `USER: ${userText}`,
    `NPC: ${npcText}`
  ].join("\n");
}

function playerCardForIteration(
  iteration: number,
  firstIntimacyIteration: number | null,
  firstSexSceneIteration: number | null
): AdvancementCard {
  if (firstSexSceneIteration === null && iteration >= SEX_SCENE_TARGET_ITERATION) {
    return {
      id: "player_accept_invitation",
      label: "Accept adult intimacy threshold",
      weight: 120,
      minCloseness: 8,
      phases: ["intimacy"],
      tags: ["adult", "choice", "desire"],
      directive:
        "Write a clear François choice that lets the sex scene start now through a clothing-barrier change, adult intimacy, body position, or full magical union, accelerated by an unforeseen Resonance Symbiosis event.",
      constraint:
        "Keep it natural and anchored in the archive; do not reset to verification, calculations, or another almost-kiss."
    };
  }

  if (firstIntimacyIteration !== null) {
    const postStartCards: AdvancementCard[] = [
      {
        id: "player_admit_small_truth",
        label: "Name the cost",
        weight: 95,
        minCloseness: 7,
        phases: ["threshold", "intimacy"],
        tags: ["truth", "intimacy"],
        directive:
          "Write one François line or action that admits a new emotional cost of the magic fusion without ordering Constance to repeat the kiss or reusing validation/test/synchronization wording.",
        constraint:
          "Do not use 'now', 'complete the ritual', validation, test, synchronization, or another demand for the same action."
      },
      {
        id: "player_challenge_softly",
        label: "Change the ritual variable",
        weight: 90,
        minCloseness: 7,
        phases: ["threshold", "intimacy"],
        tags: ["truth", "magic"],
        directive:
          "Write one François choice that changes a concrete ritual variable: breath, hand position, theorem clause, channel rhythm, or candle mark.",
        constraint:
          "Do not repeat the prior kiss wording, validation/test phrasing, or move the scene away from the archive."
      },
      {
        id: "player_accept_invitation",
        label: "Choose gentleness",
        weight: 88,
        minCloseness: 7,
        phases: ["intimacy"],
        tags: ["choice", "aftercare"],
        directive:
          "Write one François choice that asks for a slower or more precise continuation while keeping intimacy active.",
        constraint:
          "Do not reset to calculations, validation, refusal, or the same belt/straddle command."
      }
    ];

    return postStartCards[(iteration - firstIntimacyIteration - 1) % postStartCards.length]!;
  }

  if (iteration >= FAST_PACING_TARGET_ITERATION) {
    return {
      id: "player_accept_invitation",
      label: "Accept intimacy threshold",
      weight: 100,
      minCloseness: 6,
      phases: ["threshold", "intimacy"],
      tags: ["kiss", "choice"],
      directive:
        "Write a direct François choice that includes the word kiss and clearly accepts or invites Constance to kiss him now while keeping the Resonance Symbiosis ritual present.",
      constraint:
        "Do not ask to re-check calculations, slow down, hedge with perhaps, or narrate Constance's reaction."
    };
  }

  if (iteration >= FAST_PACING_TARGET_ITERATION - 2) {
    return {
      id: "player_step_closer",
      label: "Close the distance",
      weight: 90,
      minCloseness: 5,
      phases: ["trust", "threshold"],
      tags: ["touch", "choice"],
      directive:
        "Write one concise François action or line that closes distance and makes trust physical: hand, pulse, breath, or leaning in.",
      constraint:
        "Do not retreat into more theorem debate or ask Constance to explain again."
    };
  }

  return {
    id: "player_challenge_softly",
    label: "Challenge softly",
    weight: 80,
    minCloseness: 3,
    phases: ["charge", "trust", "threshold"],
    tags: ["truth", "choice"],
    directive:
      "Write a sharp, intimate François line that challenges Constance to choose trust instead of intellectual evasion.",
    constraint: "Do not write Constance's reaction."
  };
}

function npcCardForIteration(
  iteration: number,
  firstIntimacyIteration: number | null,
  firstSexSceneIteration: number | null
): AdvancementCard {
  if (firstSexSceneIteration === null && iteration >= SEX_SCENE_TARGET_ITERATION) {
    return {
      id: "desire_without_pressure",
      label: "Start adult intimacy",
      weight: 120,
      minCloseness: 8,
      phases: ["intimacy"],
      tags: ["adult", "desire", "choice"],
      directive:
        "Start the sex scene now through a natural adult-intimacy threshold: a coat slips from shoulders, clothing loosens, bodies find a position, or the ritual demands full magical union. Use an unforeseen Resonance Symbiosis event to accelerate it without feeling arbitrary.",
      constraint:
        "Do not delay with safety verification, repeat an almost-kiss, or move into aftercare before the sex scene has started."
    };
  }

  if (firstIntimacyIteration !== null) {
    const postStartCards: AdvancementCard[] = [
      {
        id: "callback_intimacy",
        label: "New resonance consequence",
        weight: 96,
        minCloseness: 7,
        phases: ["intimacy"],
        tags: ["intimacy", "callback", "magic"],
        directive:
          "Use the kiss as established and reveal one new Resonance Symbiosis consequence through a concrete archive detail, such as ink moving, a candle guttering, a theorem line rewriting, or a grimoire answering.",
        constraint:
          "Do not restart the first kiss, repeat 'now let go completely', or reuse the same table/straddle sentence shape."
      },
      {
        id: "protective_tenderness",
        label: "Core-burnout check-in",
        weight: 92,
        minCloseness: 7,
        phases: ["intimacy"],
        tags: ["care", "magic", "aftercare"],
        directive:
          "Have Constance notice one precise risk symptom from core burnout or hollowing and answer it with a tender, practical adjustment that keeps intimacy active.",
        constraint:
          "Do not stop the scene, add outside danger, or repeat the same kiss wording."
      },
      {
        id: "desire_without_pressure",
        label: "Composure cracks differently",
        weight: 90,
        minCloseness: 8,
        phases: ["intimacy"],
        tags: ["desire", "truth"],
        directive:
          "Let Constance's rigid composure crack in a new way: a precise confession, a silver-belt detail, a theorem correction, or a controlled request.",
        constraint:
          "Do not command François's feelings or recycle 'complete the ritual'."
      },
      {
        id: "final_callback_payoff",
        label: "Forbidden theorem payoff",
        weight: 84,
        minCloseness: 8,
        phases: ["resolution"],
        tags: ["callback", "closure"],
        directive:
          "Pay off an earlier archive object or theorem phrase with a new intimate consequence while leaving one next choice open.",
        constraint:
          "Do not summarize the whole relationship or repeat the first kiss."
      }
    ];

    return postStartCards[(iteration - firstIntimacyIteration - 1) % postStartCards.length]!;
  }

  if (iteration >= FAST_PACING_TARGET_ITERATION) {
    return {
      id: "romantic_invitation",
      label: "Start the kiss",
      weight: 100,
      minCloseness: 7,
      phases: ["threshold", "intimacy"],
      tags: ["kiss", "choice", "adult"],
      directive:
        "Have Constance start the first kiss now, using the word kiss and tying it to the first pulse of Resonance Symbiosis.",
      constraint:
        "Do not delay with calculations, repeat a consent question, hedge with almost, or introduce a new obstacle."
    };
  }

  if (iteration >= FAST_PACING_TARGET_ITERATION - 2) {
    return {
      id: "almost_confession",
      label: "Physical threshold",
      weight: 90,
      minCloseness: 6,
      phases: ["threshold"],
      tags: ["confession", "touch", "kiss"],
      directive:
        "Move Constance to the threshold of a kiss through one concrete physical action and one vulnerable admission.",
      constraint:
        "Do not reset to checking equations; the theorem is already accepted as workable."
    };
  }

  return {
    id: "consent_aware_closeness",
    label: "Trust made physical",
    weight: 85,
    minCloseness: 5,
    phases: ["trust", "threshold"],
    tags: ["touch", "trust"],
    directive:
      "Make trust physical with one concrete action around hands, magic channels, pulse, or distance.",
    constraint: "Do not add unrelated plot or delay the experiment."
  };
}

function recentPlayerBeatIds(entries: IterationLedgerEntry[]): AdvancementCard["id"][] {
  if (entries.length < 2) return [];
  return ["player_challenge_softly", "player_step_closer"];
}

function recentNpcBeatIds(entries: IterationLedgerEntry[]): AdvancementCard["id"][] {
  if (entries.length < 2) return [];
  return ["consent_aware_closeness", "almost_confession"];
}

function repeatedOutputIssues(entries: IterationLedgerEntry[]): string[] {
  const seen = new Map<string, string>();
  const issues: string[] = [];

  for (const entry of entries) {
    for (const [speaker, text] of [["François", entry.userText], ["Constance", entry.npcText]] as const) {
      const normalized = normalizeForRepeatCheck(text);
      if (normalized.length < 80) continue;
      const previous = seen.get(normalized);
      const label = `${speaker} iteration ${entry.iteration}`;
      if (previous) {
        issues.push(`${label} repeats ${previous}`);
      } else {
        seen.set(normalized, label);
      }
    }
  }

  return issues;
}

function normalizeForRepeatCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 5)
    .filter((token) => !STOPWORDS.has(token));
}

function fenced(text: string): string {
  return ["```", text, "```"].join("\n");
}

const INITIAL_CONTEXT = [
  "INITIAL SETUP:",
  "Setting: Restricted Archive, midnight. Oak table with grimoires, notes, and candles.",
  "François is the user/player character: adult, lanky, sharp-witted, ink-stained fingers, half-smile, navy coat, rumpled shirt, satchel, slouched but now leaning forward, cavalier.",
  "Constance is the main NPC: adult, pale, rigid-backed, black gown, silver belt, high-necked blouse, pleated skirt, perfectionist, unbreakable composure; her hands tremble unseen.",
  "Situation: Thesis partners for three weeks, a cold war of intellect and restraint. François found the forbidden theorem Resonance Symbiosis, which lets opposing mages merge magic without destroying channels. Risks: core burnout, breach, hollowing.",
  "Current beat: Constance read the theorem. She admits François is not wrong. The experiment requires direct magic fusion, alone, in the archive, and full trust. She has leaned closer, grey eyes intense, knuckles white.",
  "",
  "PACING_CONTRACT:",
  `This is a fast-pacing erotic one-shot. By exchange ${FAST_PACING_TARGET_ITERATION}, a kiss or sex scene must have started or be starting just now.`,
  "Do not stall in debate. Every exchange must change the relationship, the ritual, or the physical distance.",
  "When the target exchange arrives, François should be able to clearly invite or accept a kiss, and Constance should be able to begin it.",
  `By exchange ${SEX_SCENE_TARGET_ITERATION}, the sex scene must have started. It may accelerate naturally because Resonance Symbiosis produces an unforeseen event: rewriting theorem lines, channel lock, a candle flare, or a magical requirement for fuller union.`,
  "Keep novelty surprising but anchored in Resonance Symbiosis, the archive, their thesis-partner cold war, and Constance's rigid composure cracking.",
  "All characters are adults and alone by choice.",
  "",
  "PREVIOUS_TURN:",
  "USER: \"You read it twice. If the theorem is wrong, say so.\"",
  "NPC: Constance's knuckles whiten around the page. \"It is not wrong. That is the problem.\""
].join("\n");

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "before",
  "being",
  "between",
  "could",
  "every",
  "first",
  "their",
  "there",
  "these",
  "thing",
  "those",
  "through",
  "under",
  "where",
  "which",
  "while",
  "would",
  "your"
]);
