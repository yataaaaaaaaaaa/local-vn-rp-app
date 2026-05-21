import type { NoveltyRuntimeConfig } from "@local-vn/shared-types";
import type { AdvancementCard, NpcPersonnaNoveltyContext, RomanceClicheNoveltyContext, RomancePhase, RpPromptInput, SexSceneNoveltyContext } from "../types";

export type CandidateScoringContext = {
  closeness: number;
  phase: RomancePhase;
  currentTension: string;
  callbackDetail: string;
  boundaryDetected: boolean;
  /** Optional adult-intimacy state supplied by the sex-scene agent. Used only for candidate scoring. */
  sexScene?: SexSceneNoveltyContext;
  /** Optional unordered romantic trope/facet state supplied by the romance agent. Used only for candidate scoring. */
  romanceCliches?: RomanceClicheNoveltyContext;
  /** Optional seeded/explicit NPC personna supplied by the npc-personna agent. Used only for candidate scoring. */
  npcPersonna?: NpcPersonnaNoveltyContext;
  /** Global backend-config sliders. These are code-side controls; the RP LLM sees only natural-language redirects. */
  controls?: NoveltyRuntimeConfig;
};

const DEFAULT_NOVELTY_CONTROLS: NoveltyRuntimeConfig = {
  level: 1,
  agent_influence: 1,
  romance_cliche_influence: 1,
  npc_personna_influence: 1,
  sex_scene_influence: 1,
  repetition_guard: 1,
  detail_budget: 1,
  coherence_retries: 3,
  candidate_pool_size: 8
};

export function normalizeNoveltyControls(value?: Partial<NoveltyRuntimeConfig> | null): NoveltyRuntimeConfig {
  return {
    level: bounded(value?.level, DEFAULT_NOVELTY_CONTROLS.level, 0, 2),
    agent_influence: bounded(value?.agent_influence, DEFAULT_NOVELTY_CONTROLS.agent_influence, 0, 2),
    romance_cliche_influence: bounded(value?.romance_cliche_influence, DEFAULT_NOVELTY_CONTROLS.romance_cliche_influence, 0, 2),
    npc_personna_influence: bounded(value?.npc_personna_influence, DEFAULT_NOVELTY_CONTROLS.npc_personna_influence, 0, 2),
    sex_scene_influence: bounded(value?.sex_scene_influence, DEFAULT_NOVELTY_CONTROLS.sex_scene_influence, 0, 2),
    repetition_guard: bounded(value?.repetition_guard, DEFAULT_NOVELTY_CONTROLS.repetition_guard, 0, 2),
    detail_budget: bounded(value?.detail_budget, DEFAULT_NOVELTY_CONTROLS.detail_budget, 0, 2),
    coherence_retries: bounded(value?.coherence_retries, DEFAULT_NOVELTY_CONTROLS.coherence_retries, 0, 6),
    candidate_pool_size: bounded(value?.candidate_pool_size, DEFAULT_NOVELTY_CONTROLS.candidate_pool_size, 1, 20)
  };
}

export function withNoveltyControls(
  context: CandidateScoringContext,
  controls?: Partial<NoveltyRuntimeConfig> | null
): CandidateScoringContext {
  return {
    ...context,
    controls: normalizeNoveltyControls(controls)
  };
}

export function noveltyControlSummary(controls?: Partial<NoveltyRuntimeConfig> | null): string {
  const normalized = normalizeNoveltyControls(controls);
  return [
    `level=${normalized.level.toFixed(2)}`,
    `detail_budget=${normalized.detail_budget.toFixed(2)}`,
    `agent_influence=${normalized.agent_influence.toFixed(2)}`,
    `romance_cliche=${normalized.romance_cliche_influence.toFixed(2)}`,
    `npc_personna=${normalized.npc_personna_influence.toFixed(2)}`,
    `sex_scene=${normalized.sex_scene_influence.toFixed(2)}`,
    `repetition_guard=${normalized.repetition_guard.toFixed(2)}`,
    `coherence_retries=${normalized.coherence_retries.toFixed(0)}`,
    `candidate_pool=${normalized.candidate_pool_size.toFixed(0)}`
  ].join("; ");
}

export function detailBudgetInstructionForControls(controls?: Partial<NoveltyRuntimeConfig> | null): string {
  const budget = normalizeNoveltyControls(controls).detail_budget;
  if (budget <= 0.25) return "Novelty detail budget: stabilize the scene; avoid adding a new visible or emotional detail unless required by the latest user input.";
  if (budget <= 0.75) return "Novelty detail budget: at most one tiny texture detail while following TURN_REDIRECT.";
  if (budget <= 1.25) return "Novelty detail budget: one coherent redirect detail; do not stack additional agent ideas.";
  if (budget <= 1.75) return "Novelty detail budget: one redirect detail plus one compatible support detail if it already follows from the scene.";
  return "Novelty detail budget: one redirect detail plus up to two compatible support details, still without introducing a second beat.";
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function selectRomanceBeat(
  input: RpPromptInput,
  deck: AdvancementCard[],
  state: CandidateScoringContext
): AdvancementCard {
  const ranked = rankRomanceBeatCandidates(input, deck, state, deck.length || 1);
  return weightedPick(ranked.length ? ranked : deck, input.rng) ?? deck[0]!;
}

export function rankRomanceBeatCandidates(
  input: RpPromptInput,
  deck: AdvancementCard[],
  state: CandidateScoringContext,
  limit = normalizeNoveltyControls(state.controls).candidate_pool_size
): AdvancementCard[] {
  if (deck.length === 0) return [];

  const explicit = explicitCard(input.advancementCard, deck);
  if (explicit) return [explicit];

  if (input.boundaryDetected || state.boundaryDetected || state.sexScene?.boundaryDetected) {
    const boundaryBeat = deck.find((card) => card.id === "repair_and_respect" || card.id === "player_hold_boundary" || card.id === "boundary_check");
    if (boundaryBeat) return [boundaryBeat];
  }

  const controls = normalizeNoveltyControls(state.controls ?? input.novelty);
  const scored = deck
    .map((card) => ({ card, score: scoreCard(card, input, state, controls) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => ({ ...item.card, weight: item.score }));
  const fallback = deck.map((card) => ({ ...card, weight: Math.max(0.0001, card.weight) }));
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));

  return (scored.length ? scored : fallback).slice(0, boundedLimit);
}

function explicitCard(value: RpPromptInput["advancementCard"], deck: AdvancementCard[]): AdvancementCard | null {
  if (!value) return null;
  if (typeof value === "string") return deck.find((card) => card.id === value) ?? null;
  return value;
}

function scoreCard(
  card: AdvancementCard,
  input: RpPromptInput,
  state: CandidateScoringContext,
  controls: NoveltyRuntimeConfig
): number {
  let score = Math.max(0.0001, card.weight) * controls.level;

  if (typeof card.minCloseness === "number" && state.closeness < card.minCloseness) {
    score *= 0.35;
  }

  if (card.phases?.length && !card.phases.includes(state.phase)) {
    score *= 0.45;
  }

  if (input.recentBeatTypes?.includes(card.id)) {
    score /= Math.max(1, 1 + controls.repetition_guard);
  }

  if (card.id.startsWith("cliche_")) score *= controls.romance_cliche_influence;
  else if (card.id.startsWith("persona_")) score *= controls.npc_personna_influence;
  else if (card.id === "repair_and_respect" || card.id === "boundary_check") score *= Math.max(1, controls.agent_influence);
  else score *= controls.agent_influence;

  if (state.sexScene?.active && (card.tags?.includes("touch") || card.tags?.includes("desire"))) {
    score *= controls.sex_scene_influence;
  }

  return Math.max(0.0001, score);
}

function weightedPick(cards: AdvancementCard[], rng: (() => number) | undefined): AdvancementCard | null {
  if (cards.length === 0) return null;
  const rollSource = rng ?? Math.random;
  const total = cards.reduce((sum, card) => sum + Math.max(0.0001, card.weight), 0);
  let roll = Math.max(0, Math.min(0.999999999, rollSource())) * total;

  for (const card of cards) {
    roll -= Math.max(0.0001, card.weight);
    if (roll <= 0) return card;
  }

  return cards[cards.length - 1] ?? null;
}
