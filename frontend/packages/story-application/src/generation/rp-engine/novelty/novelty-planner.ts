import type { NoveltyRuntimeConfig } from "@local-vn/shared-types";
import type { AdvancementCard, BeatType, NoveltyPlan, NoveltySource, NpcPersonnaNoveltyContext, RomanceClicheNoveltyContext, RomancePhase, RpPromptInput, SexSceneNoveltyContext } from "../types";

export type NoveltyPlanningContext = {
  closeness: number;
  phase: RomancePhase;
  currentTension: string;
  callbackDetail: string;
  boundaryDetected: boolean;
  /** Optional adult-intimacy state supplied by the sex-scene agent. */
  sexScene?: SexSceneNoveltyContext;
  /** Optional unordered romantic trope/facet state supplied by the romance agent. */
  romanceCliches?: RomanceClicheNoveltyContext;
  /** Optional seeded/explicit NPC personna supplied by the npc-personna agent. */
  npcPersonna?: NpcPersonnaNoveltyContext;
  /** Global backend-config sliders that orchestrate how much agents affect novelty. */
  controls?: NoveltyRuntimeConfig;
};

const DEFAULT_NOVELTY_CONTROLS: NoveltyRuntimeConfig = {
  level: 1,
  agent_influence: 1,
  romance_cliche_influence: 1,
  npc_personna_influence: 1,
  sex_scene_influence: 1,
  repetition_guard: 1,
  detail_budget: 1
};

export function normalizeNoveltyControls(value?: Partial<NoveltyRuntimeConfig> | null): NoveltyRuntimeConfig {
  return {
    level: bounded(value?.level, DEFAULT_NOVELTY_CONTROLS.level, 0, 2),
    agent_influence: bounded(value?.agent_influence, DEFAULT_NOVELTY_CONTROLS.agent_influence, 0, 2),
    romance_cliche_influence: bounded(value?.romance_cliche_influence, DEFAULT_NOVELTY_CONTROLS.romance_cliche_influence, 0, 2),
    npc_personna_influence: bounded(value?.npc_personna_influence, DEFAULT_NOVELTY_CONTROLS.npc_personna_influence, 0, 2),
    sex_scene_influence: bounded(value?.sex_scene_influence, DEFAULT_NOVELTY_CONTROLS.sex_scene_influence, 0, 2),
    repetition_guard: bounded(value?.repetition_guard, DEFAULT_NOVELTY_CONTROLS.repetition_guard, 0, 2),
    detail_budget: bounded(value?.detail_budget, DEFAULT_NOVELTY_CONTROLS.detail_budget, 0, 2)
  };
}

export function withNoveltyControls(
  context: NoveltyPlanningContext,
  controls?: Partial<NoveltyRuntimeConfig> | null
): NoveltyPlanningContext {
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
    `repetition_guard=${normalized.repetition_guard.toFixed(2)}`
  ].join("; ");
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function withSexSceneNoveltyContext(
  context: NoveltyPlanningContext,
  sexScene?: SexSceneNoveltyContext | null
): NoveltyPlanningContext {
  if (!sexScene) return context;

  return {
    ...context,
    sexScene,
    boundaryDetected: context.boundaryDetected || sexScene.boundaryDetected,
    phase: sexScene.active && sexScene.stepOrder >= 6 && context.phase !== "resolution" ? "intimacy" : context.phase,
    closeness: sexScene.active ? Math.max(context.closeness, sexScene.stepOrder >= 7 ? 9 : sexScene.stepOrder >= 5 ? 8 : 7) : context.closeness,
    currentTension: sexScene.active
      ? mergeTension(context.currentTension, intimacyTensionLabel(sexScene))
      : context.currentTension
  };
}

export function withNpcPersonnaNoveltyContext(
  context: NoveltyPlanningContext,
  npcPersonna?: NpcPersonnaNoveltyContext | null
): NoveltyPlanningContext {
  if (!npcPersonna) return context;

  return {
    ...context,
    npcPersonna,
    currentTension: npcPersonna.shouldInfluenceNovelty && npcPersonna.selectedInfluence
      ? mergeTension(context.currentTension, `npc personna novelty: ${npcPersonna.dereLabel} / ${npcPersonna.selectedInfluence.family}`)
      : mergeTension(context.currentTension, `npc personna stable: ${npcPersonna.dereLabel}`)
  };
}

function mergeTension(primary: string, addition: string): string {
  if (!addition) return primary;
  if (!primary || primary === "early rapport and curiosity") return addition;
  if (primary.includes(addition)) return primary;
  return `${primary}; ${addition}`;
}

function intimacyTensionLabel(sexScene: SexSceneNoveltyContext): string {
  if (sexScene.boundaryDetected) return "adult-intimacy boundary or pacing needs repair";
  if (sexScene.shouldFadeToBlack) return "adult intimacy should transition through fade-to-black or aftermath";
  if (sexScene.noveltyPressure === "aftercare") return "aftercare and emotional continuity are active";
  if (sexScene.active) return "adult intimacy details are active and need lifetime-aware continuity";
  return "";
}

type ScoredBeat = AdvancementCard & {
  score: number;
  rationale: string;
};

type NoveltyArbitration = {
  primary: NoveltySource;
  suppressed: NoveltySource[];
  policy: string;
};

const AGENT_NOVELTY_SOURCES: NoveltySource[] = ["sex_scene", "romance_cliche", "npc_personna"];


/**
 * Select one relationship beat using a SillyTavern-style prompt-planning mindset:
 * stable character/context first, recent chat history second, and a fresh post-history
 * instruction last. The planner favors phase-appropriate continuity and strongly
 * suppresses recent beat loops instead of using raw weighted randomness only.
 */
export function selectRomanceBeat(
  input: RpPromptInput,
  deck: AdvancementCard[],
  state: NoveltyPlanningContext
): AdvancementCard {
  if (input.boundaryDetected || state.boundaryDetected || state.sexScene?.boundaryDetected) {
    const boundaryBeat = deck.find((card) => card.id === "repair_and_respect" || card.id === "player_hold_boundary" || card.id === "boundary_check");
    if (boundaryBeat) return boundaryBeat;
  }

  if (input.advancementCard) {
    const explicit = typeof input.advancementCard === "string"
      ? deck.find((card) => card.id === input.advancementCard)
      : input.advancementCard;

    if (explicit) return explicit;
  }

  const scored = scoreRomanceDeck(input, deck, state);
  const viable = scored.filter((card) => card.score > 0);

  return weightedPick(viable.length ? viable : scored, input.rng);
}

export function noveltyPlanFromBeat(
  beat: AdvancementCard,
  state: NoveltyPlanningContext,
  forbiddenFragments: string[]
): NoveltyPlan {
  const controls = controlsForState(state);
  const arbitration = resolveNoveltyArbitration(beat, state, controls);
  const continuityAnchor = continuityAnchorForState(state);
  const freshnessRule = freshnessRuleForBeat(beat, forbiddenFragments, state, arbitration);
  const relationshipDelta = relationshipDeltaForBeat(beat);
  const intimacyContinuity = intimacyContinuityForState(state, arbitration.primary === "sex_scene" || arbitration.primary === "safety");
  const intimacyDetailDelta = agentDetailDeltaForSource("sex_scene", beat, state, arbitration);
  const intimacyConstraint = intimacyConstraintForState(state);
  const npcPersonnaContinuity = npcPersonnaContinuityForState(state, arbitration.primary === "npc_personna");
  const npcPersonnaDetailDelta = agentDetailDeltaForSource("npc_personna", beat, state, arbitration);
  const npcPersonnaConstraint = npcPersonnaConstraintForState(state);
  const romanceClicheContinuity = romanceClicheContinuityForState(state, arbitration.primary === "romance_cliche");
  const romanceClicheDetailDelta = agentDetailDeltaForSource("romance_cliche", beat, state, arbitration);
  const romanceClicheConstraint = romanceClicheConstraintForState(state);
  const controlSummary = noveltyControlSummary(controls);
  const detailBudgetInstruction = detailBudgetInstructionForControls(controls);

  return {
    axis: beat.id,
    label: beat.label,
    directive: beat.directive,
    forbiddenFragments,
    minCloseness: beat.minCloseness,
    typicalAfter: beat.typicalAfter,
    phase: state.phase,
    closenessBefore: state.closeness,
    closenessAfter: beat.typicalAfter ?? state.closeness,
    rationale: rationaleForBeat(beat, state),
    relationshipDelta,
    continuityAnchor,
    freshnessRule,
    postHistoryInstruction: postHistoryInstructionForBeat(beat, relationshipDelta, continuityAnchor, freshnessRule, intimacyContinuity, intimacyDetailDelta, intimacyConstraint, npcPersonnaContinuity, npcPersonnaDetailDelta, npcPersonnaConstraint, romanceClicheContinuity, romanceClicheDetailDelta, romanceClicheConstraint, controlSummary, detailBudgetInstruction, arbitration),
    intimacyContinuity,
    intimacyDetailDelta,
    intimacyConstraint,
    npcPersonnaContinuity,
    npcPersonnaDetailDelta,
    npcPersonnaConstraint,
    romanceClicheContinuity,
    romanceClicheDetailDelta,
    romanceClicheConstraint,
    noveltyControlSummary: controlSummary,
    detailBudgetInstruction,
    selectedNoveltySource: arbitration.primary,
    agentConflictPolicy: arbitration.policy,
    suppressedNoveltySources: arbitration.suppressed
  };
}

export function weightedPick<T extends { weight: number }>(items: T[], rng = Math.random): T {
  const safe = items.filter((item) => item.weight > 0);
  const pool = safe.length ? safe : items;
  const total = pool.reduce((sum, item) => sum + Math.max(0, item.weight), 0);

  if (total <= 0) return pool[0]!;

  let roll = rng() * total;

  for (const item of pool) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }

  return pool.at(-1)!;
}

function scoreRomanceDeck(
  input: RpPromptInput,
  deck: AdvancementCard[],
  state: NoveltyPlanningContext
): ScoredBeat[] {
  const recentBeatTypes = input.recentBeatTypes ?? [];
  const lastBeat = recentBeatTypes.at(-1);
  const recent = new Set<BeatType>(recentBeatTypes.slice(-5));
  const controls = controlsForState(state);
  const repeatPenalties = repeatPenaltiesForControls(controls);
  const tolerance = state.phase === "spark" ? 1 : state.phase === "charge" ? 1.25 : 1.75;

  const candidates = deck.filter((card) => (card.minCloseness ?? 0) <= state.closeness + tolerance);
  const pool = candidates.length ? candidates : deck;

  return pool
    .map((card) => {
      let score = card.weight;
      const candidateSource = noveltySourceForCard(card, state);
      const rationale: string[] = [`base weight ${card.weight}`, `source=${candidateSource}`];

      if (lastBeat === card.id) {
        score *= repeatPenalties.hard;
        rationale.push(`last beat repeat suppressed x${repeatPenalties.hard.toFixed(2)}`);
      } else if (recent.has(card.id)) {
        score *= repeatPenalties.soft;
        rationale.push(`recent beat repeat softened x${repeatPenalties.soft.toFixed(2)}`);
      }

      if (card.phases?.includes(state.phase)) {
        score *= 1.55;
        rationale.push(`fits ${state.phase} phase`);
      } else if (card.phases?.length) {
        score *= 0.7;
        rationale.push(`off-phase for ${state.phase}`);
      }

      if (state.callbackDetail !== "(none)" && card.tags?.includes("callback")) {
        score *= 1.55;
        rationale.push("uses available callback memory");
      }

      if (state.currentTension.includes("boundary") && card.tags?.includes("consent")) {
        score *= 1.65;
        rationale.push("matches boundary/consent tension");
      }

      if (state.phase === "resolution" && card.tags?.includes("ending")) {
        score *= 2.1;
        rationale.push("supports resolution phase");
      }

      if (state.phase !== "resolution" && card.tags?.includes("ending")) {
        score *= 0.35;
        rationale.push("ending beat delayed until resolution");
      }

      const overallNoveltyMultiplier = noveltyLevelScoreMultiplier(card, controls);
      if (overallNoveltyMultiplier !== 1) {
        score *= overallNoveltyMultiplier;
        rationale.push(`global novelty level x${overallNoveltyMultiplier.toFixed(2)}`);
      }

      const intimacyMultiplier = candidateSource === "sex_scene" || candidateSource === "safety"
        ? scaleAgentMultiplier(
          intimacyScoreMultiplier(card, state.sexScene),
          controls.agent_influence * controls.sex_scene_influence
        )
        : 1;
      if (intimacyMultiplier !== 1) {
        score *= intimacyMultiplier;
        rationale.push(`sex-scene primary-source bridge x${intimacyMultiplier.toFixed(2)}`);
      }

      const clicheMultiplier = candidateSource === "romance_cliche"
        ? scaleAgentMultiplier(
          romanceClicheScoreMultiplier(card, state.romanceCliches),
          controls.agent_influence * controls.romance_cliche_influence
        )
        : 1;
      if (clicheMultiplier !== 1) {
        score *= clicheMultiplier;
        rationale.push(`romantic-cliche primary-source x${clicheMultiplier.toFixed(2)}`);
      }

      const personnaMultiplier = candidateSource === "npc_personna"
        ? scaleAgentMultiplier(
          npcPersonnaScoreMultiplier(card, state.npcPersonna),
          controls.agent_influence * controls.npc_personna_influence
        )
        : 1;
      if (personnaMultiplier !== 1) {
        score *= personnaMultiplier;
        rationale.push(`npc-personna primary-source x${personnaMultiplier.toFixed(2)}`);
      }

      if (state.closeness < 6 && card.tags?.some((tag) => tag === "intimacy" || tag === "desire" || tag === "adult")) {
        score *= 0.45;
        rationale.push("intimacy held back until earned");
      }

      return { ...card, weight: score, score, rationale: rationale.join("; ") };
    })
    .filter((card) => card.score > 0);
}

function noveltySourceForCard(card: AdvancementCard, state: NoveltyPlanningContext): NoveltySource {
  const tags = card.tags ?? [];

  if (
    state.boundaryDetected &&
    (card.id === "repair_and_respect" || card.id === "boundary_check" || card.id === "player_hold_boundary" || card.id === "player_slow_pace" || tags.includes("repair") || tags.includes("consent"))
  ) {
    return "safety";
  }

  if (card.id.startsWith("persona_") || tags.includes("personna") || tags.includes("persona")) return "npc_personna";
  if (card.id.startsWith("cliche_") || tags.includes("cliche")) return "romance_cliche";
  if (card.id.startsWith("player_")) return "player";
  if (card.id.startsWith("visual_")) return "visual";

  if (state.sexScene?.active) {
    if (
      card.id === "consent_aware_closeness" ||
      card.id === "desire_without_pressure" ||
      card.id === "boundary_check" ||
      tags.some((tag) => tag === "adult" || tag === "desire" || tag === "touch" || tag === "kiss")
    ) {
      return "sex_scene";
    }

    if (
      (state.sexScene.noveltyPressure === "aftercare" || state.sexScene.shouldFadeToBlack) &&
      (card.id === "protective_tenderness" || card.id === "emotional_opening" || card.id === "callback_intimacy" || card.id === "final_callback_payoff")
    ) {
      return "sex_scene";
    }
  }

  return "base";
}

function resolveNoveltyArbitration(
  beat: AdvancementCard,
  state: NoveltyPlanningContext,
  controls: NoveltyRuntimeConfig
): NoveltyArbitration {
  const primary = noveltySourceForCard(beat, state);
  const active = activeAgentNoveltySources(state);
  const suppressed = active.filter((source) => source !== primary);
  const suppressedLabel = suppressed.length ? suppressed.join(", ") : "none";
  const primaryLabel = primary === "base" ? "base romance beat" : primary.replace(/_/g, " ");
  const budget = controls.detail_budget <= 1.25
    ? "The current detail budget allows one novelty source only."
    : "The current detail budget allows extra ambient micro-detail, but no second agent-specific novelty lever.";

  return {
    primary,
    suppressed,
    policy: `Novelty arbiter: primary source=${primaryLabel}; suppressed agent detail sources=${suppressedLabel}. ${budget} Non-primary agents may provide continuity, voice, or already-established facts only; they must not introduce a new trope, quirk, position, intimacy mechanic, or plot event this turn.`
  };
}

function activeAgentNoveltySources(state: NoveltyPlanningContext): NoveltySource[] {
  return AGENT_NOVELTY_SOURCES.filter((source) => {
    if (source === "sex_scene") return Boolean(state.sexScene?.active);
    if (source === "romance_cliche") return Boolean(state.romanceCliches?.active);
    if (source === "npc_personna") return Boolean(state.npcPersonna?.active && (state.npcPersonna.shouldInfluenceNovelty || state.npcPersonna.selectedInfluence));
    return false;
  });
}

function agentDetailDeltaForSource(
  source: "sex_scene" | "romance_cliche" | "npc_personna",
  beat: AdvancementCard,
  state: NoveltyPlanningContext,
  arbitration: NoveltyArbitration
): string | undefined {
  if (arbitration.primary === source || (source === "sex_scene" && arbitration.primary === "safety")) {
    if (source === "sex_scene") return intimacyDetailDeltaForBeat(beat, state);
    if (source === "romance_cliche") return romanceClicheDetailDeltaForBeat(beat, state);
    return npcPersonnaDetailDeltaForBeat(beat, state);
  }

  return suppressedAgentDetailDelta(source, state, arbitration);
}

function suppressedAgentDetailDelta(
  source: "sex_scene" | "romance_cliche" | "npc_personna",
  state: NoveltyPlanningContext,
  arbitration: NoveltyArbitration
): string | undefined {
  if (source === "sex_scene" && state.sexScene?.active) {
    if (state.sexScene.boundaryDetected) return "Intimacy detail delta: safety owns this turn; preserve boundaries and do not add intimacy mechanics.";
    return `Intimacy detail delta: sex-scene agent is continuity-only because ${arbitration.primary} owns novelty; preserve active facets and do not introduce a new position, contact, clothing, camera, or aftercare detail.`;
  }

  if (source === "romance_cliche" && state.romanceCliches?.active) {
    return `Romantic-cliche detail delta: romance-cliche agent is continuity-only because ${arbitration.primary} owns novelty; keep existing trope facts as background and do not add a new cliche facet.`;
  }

  if (source === "npc_personna" && state.npcPersonna?.active) {
    return `NPC-personna detail delta: npc-personna agent is continuity-only because ${arbitration.primary} owns novelty; preserve dere/seed/arc traits and do not surface a new quirk, accident, protective intercept, or sacrifice beat.`;
  }

  return undefined;
}

function rationaleForBeat(beat: AdvancementCard, state: NoveltyPlanningContext): string {
  const reasons = [
    `phase=${state.phase}`,
    `closeness=${state.closeness}/10`,
    `tension=${state.currentTension}`
  ];

  if (state.npcPersonna?.selectedInfluence && noveltySourceForCard(beat, state) === "npc_personna") {
    return `Anchor the beat on the selected NPC-personna lever: ${state.npcPersonna.dereLabel} / ${state.npcPersonna.selectedInfluence.family}:${state.npcPersonna.selectedInfluence.label}.`;
  }

  if (state.callbackDetail !== "(none)") {
    reasons.push(`callback=${state.callbackDetail}`);
  }

  if (state.romanceCliches?.active) {
    reasons.push(`romantic-cliche facets=${state.romanceCliches.targetFacets.slice(0, 3).join(", ")}`);
  }

  if (state.npcPersonna?.active) {
    const selected = state.npcPersonna.selectedInfluence ? `/${state.npcPersonna.selectedInfluence.family}` : "";
    reasons.push(`npc-personna=${state.npcPersonna.dereLabel}${selected}`);
  }

  return `${beat.label ?? beat.id} selected from ${reasons.join("; ")}.`;
}

function relationshipDeltaForBeat(beat: AdvancementCard): string {
  switch (beat.id) {
    case "specific_recognition":
      return "The counterpart recognizes one concrete visible choice or detail, making the player feel seen without assuming their feelings.";
    case "gentle_tease":
      return "Playful friction becomes warmer or more personal while leaving the next move open.";
    case "charged_silence":
      return "The unspoken tension becomes clearer through restraint, not through a forced confession.";
    case "callback_intimacy":
      return "A prior object, phrase, promise, or gesture gains new romantic meaning.";
    case "emotional_opening":
      return "The counterpart reveals a small vulnerable truth that invites, rather than demands, a response.";
    case "consent_aware_closeness":
      return "Closeness is offered as a choice with an easy path to accept, refuse, or redirect.";
    case "soft_reversal":
      return "The expected power or teasing dynamic flips gently for one beat.";
    case "protective_tenderness":
      return "Care becomes specific and practical, not possessive or controlling.";
    case "honest_question":
      return "One honest question clarifies desire, fear, or intent without interrogating the player.";
    case "almost_confession":
    case "partial_confession":
      return "A truth almost surfaces, creating momentum without solving the whole relationship.";
    case "desire_without_pressure":
    case "romantic_invitation":
      return "Attraction is framed as an invitation, not an assumption or demand.";
    case "cliche_locked_gaze":
      return "A familiar gaze trope makes the unspoken attraction legible while leaving the player free to answer it.";
    case "cliche_shared_shelter":
      return "A practical shared-shelter trope narrows the distance without requiring emotional confession.";
    case "cliche_accidental_touch":
      return "One accidental contact sparks awareness, then stops before assuming the player's response.";
    case "cliche_fixing_detail":
      return "A tiny care gesture turns a clothing, hair, or smudge detail into permission-aware closeness.";
    case "cliche_offer_warmth":
      return "Practical warmth becomes tenderness, not possession.";
    case "cliche_shared_drink":
      return "A shared drink, dessert, or cup lets banter deepen into something more personal.";
    case "cliche_walk_home":
      return "A transition or walk-together offer creates a low-pressure choice to continue the moment.";
    case "cliche_private_dance":
      return "A dance or guided step tests mutual rhythm without deciding the player's acceptance.";
    case "cliche_almost_kiss":
      return "An almost-kiss or stopped-short lean-in marks the threshold and keeps consent visible.";
    case "cliche_caught_stumble":
      return "A brief support beat creates closeness through care, then releases it.";
    case "cliche_sleepy_vigil":
      return "Quiet staying-near care reveals devotion without controlling the player.";
    case "cliche_domestic_tenderness":
      return "An ordinary domestic detail becomes intimacy through small practical care.";
    case "cliche_token_exchange":
      return "A small token or established object gains relationship meaning.";
    case "cliche_name_softening":
      return "A name, title, or nickname shift reveals a changed dynamic.";
    case "cliche_mild_jealousy":
      return "A tiny jealousy flicker exposes vulnerability and then makes room for honesty.";
    case "cliche_reunion_pause":
      return "The first pause after reunion carries the romantic weight.";
    case "cliche_farewell_linger":
      return "A goodbye that lingers creates a choice-point instead of closure.";
    case "cliche_secret_place":
      return "A trusted place becomes a setting anchor for closeness.";
    case "cliche_protective_cover":
      return "Practical cover or shielding shows care while preserving agency.";
    case "cliche_forehead_touch":
      return "A small care touch becomes tenderness when permission is clear.";
    case "persona_clumsy_mishap":
      return "The NPC's seeded personna surfaces through one harmless mishap that opens a fresh romantic reaction.";
    case "persona_protective_intercept":
      return "The NPC's protective streak becomes visible through one practical intercept, shield, or offered cover.";
    case "persona_dumb_sacrifice":
      return "The NPC treats a tiny inconvenience as a noble sacrifice, making their affection funny and specific.";
    case "persona_dere_contradiction":
      return "The NPC's dere mask and private feeling briefly contradict each other in a fresh way.";
    case "persona_signature_tell":
      return "A stable private tell reveals what the NPC will not say directly.";
    case "boundary_check":
    case "repair_and_respect":
      return "The scene repairs trust or checks pace before any further escalation.";
    case "final_callback_payoff":
      return "A remembered detail pays off as closure, promise, or chosen ending.";
    case "player_tease_back":
      return "The player-side response meets tension with a short playable tease.";
    case "player_ask_directly":
      return "The player-side response asks for clarity in one direct line.";
    case "player_step_closer":
      return "The player-side response accepts one step of closeness without deciding the counterpart's reaction.";
    case "player_hold_boundary":
    case "player_slow_pace":
      return "The player-side response preserves agency by slowing or setting a boundary.";
    case "player_admit_small_truth":
      return "The player-side response offers a small truth the counterpart can answer.";
    case "player_accept_invitation":
      return "The player-side response accepts the invitation but leaves the outcome to the next turn.";
    case "player_challenge_softly":
      return "The player-side response challenges the counterpart to be clearer without becoming cruel.";
    case "visual_proximity":
    case "visual_expression":
    case "visual_callback_object":
    case "visual_lighting_mood":
      return "The visual cue changes one visible element that supports the emotional beat.";
    default:
      return "One meaningful relationship detail changes while continuity stays stable.";
  }
}

function continuityAnchorForState(state: NoveltyPlanningContext): string {
  if (state.callbackDetail !== "(none)") {
    return `Reuse one established callback detail if it fits: ${state.callbackDetail}.`;
  }

  if (state.currentTension.includes("boundary")) {
    return "Anchor the beat on the active boundary, pace, or consent language.";
  }

  if (state.romanceCliches?.active && state.romanceCliches.targetFacets.length > 0) {
    return `Anchor the beat on one available romantic-cliche facet if it fits: ${state.romanceCliches.targetFacets.slice(0, 4).join(", ")}.`;
  }

  if (state.currentTension.includes("honesty") || state.currentTension.includes("trust")) {
    return "Anchor the beat on the current vulnerability, promise, or trust question.";
  }

  if (state.currentTension.includes("playful")) {
    return "Anchor the beat on the current banter, joke, or playful friction.";
  }

  return "Anchor the beat on the latest visible action and the current player input.";
}

function freshnessRuleForBeat(beat: AdvancementCard, forbiddenFragments: string[], state?: NoveltyPlanningContext, arbitration?: NoveltyArbitration): string {
  const forbidden = forbiddenFragments.length > 0
    ? " Do not reuse the listed recent fragments, sentence openings, or the same emotional maneuver."
    : " Do not paraphrase the immediately previous reply or repeat its sentence shape.";

  const intimacy = state?.sexScene?.active
    ? ` If adult-intimacy state is active, create novelty by changing only one compatible short-lived facet; preserve position/scene/encounter-lifetime facts until text explicitly changes them.`
    : "";
  const cliche = state?.romanceCliches?.active
    ? ` If using a romantic cliche, make it specific to the current exchange and rotate only one compatible facet; preserve relationship/arc-lifetime cliche facts until text explicitly changes them.`
    : "";
  const personna = state?.npcPersonna?.active
    ? ` If using NPC-personna novelty, preserve seed/arc traits and surface at most one beat/scene-lifetime quirk; do not rewrite the character card mid-scene.`
    : "";
  const budget = state
    ? ` ${detailBudgetInstructionForControls(controlsForState(state))}`
    : "";
  const arbiter = arbitration
    ? ` ${arbitration.policy}`
    : "";

  return `Make the beat novel through ${beat.tags?.join(", ") || beat.id}, not by adding random external drama.${forbidden}${intimacy}${cliche}${personna}${budget}${arbiter}`;
}

function postHistoryInstructionForBeat(
  beat: AdvancementCard,
  relationshipDelta: string,
  continuityAnchor: string,
  freshnessRule: string,
  intimacyContinuity?: string,
  intimacyDetailDelta?: string,
  intimacyConstraint?: string,
  npcPersonnaContinuity?: string,
  npcPersonnaDetailDelta?: string,
  npcPersonnaConstraint?: string,
  romanceClicheContinuity?: string,
  romanceClicheDetailDelta?: string,
  romanceClicheConstraint?: string,
  controlSummary?: string,
  detailBudgetInstruction?: string,
  arbitration?: NoveltyArbitration
): string {
  return [
    `Change exactly one meaningful relationship or visual detail using the ${beat.label ?? beat.id} beat.`,
    relationshipDelta,
    continuityAnchor,
    freshnessRule,
    intimacyContinuity,
    intimacyDetailDelta,
    intimacyConstraint,
    npcPersonnaContinuity,
    npcPersonnaDetailDelta,
    npcPersonnaConstraint,
    romanceClicheContinuity,
    romanceClicheDetailDelta,
    romanceClicheConstraint,
    controlSummary ? `Novelty controls: ${controlSummary}.` : undefined,
    detailBudgetInstruction,
    arbitration?.policy,
    "Do not resolve the whole romance unless the selected beat explicitly requires closure."
  ].filter(Boolean).join(" ");
}

function controlsForState(state: NoveltyPlanningContext): NoveltyRuntimeConfig {
  return normalizeNoveltyControls(state.controls);
}

function repeatPenaltiesForControls(controls: NoveltyRuntimeConfig): { hard: number; soft: number } {
  return {
    hard: bounded(0.25 * Math.pow(0.32, controls.repetition_guard), 0.08, 0.015, 0.5),
    soft: bounded(0.6 * Math.pow(0.58, controls.repetition_guard), 0.35, 0.12, 0.8)
  };
}

function scaleAgentMultiplier(multiplier: number, influence: number): number {
  const strength = bounded(influence, 1, 0, 2);
  return Math.max(0.02, 1 + (multiplier - 1) * strength);
}

function noveltyLevelScoreMultiplier(card: AdvancementCard, controls: NoveltyRuntimeConfig): number {
  const tags = card.tags ?? [];
  const isAgentBeat = card.id.startsWith("persona_") || card.id.startsWith("cliche_");
  const isHighNovelty = isAgentBeat || tags.some((tag) =>
    ["cliche", "personna", "persona", "adult", "desire", "touch", "kiss", "jealousy", "protective"].includes(tag)
  );
  const isStabilizer = tags.some((tag) => ["consent", "repair", "callback", "care", "ending", "agency"].includes(tag));

  if (controls.level < 0.35) {
    if (isHighNovelty) return 0.18 + controls.level * 0.7;
    if (isStabilizer) return 1.25;
    return 0.85;
  }

  if (controls.level < 0.85) {
    if (isAgentBeat) return 0.55 + controls.level * 0.45;
    if (isHighNovelty) return 0.75 + controls.level * 0.25;
    if (isStabilizer) return 1.08;
    return 0.95;
  }

  if (controls.level > 1.15 && isHighNovelty) {
    return 1 + Math.min(0.65, (controls.level - 1) * 0.65);
  }

  return 1;
}

function detailBudgetInstructionForControls(controls: NoveltyRuntimeConfig): string {
  if (controls.detail_budget <= 0.25) {
    return "Novelty detail budget: stabilize the scene; do not introduce a new trope, quirk, position, or plot object unless already explicit.";
  }
  if (controls.detail_budget < 0.85) {
    return "Novelty detail budget: use at most one tiny micro-change; prefer phrasing, gaze, tone, or a short-lived beat detail.";
  }
  if (controls.detail_budget <= 1.25) {
    return "Novelty detail budget: change exactly one meaningful relationship, visual, trope, personna, or intimacy detail; preserve all other active lifetimes.";
  }
  return "Novelty detail budget: up to two compatible micro-details may shift, but only one may come from an agent-specific lever; never stack multiple major beats.";
}

function npcPersonnaScoreMultiplier(card: AdvancementCard, personna?: NpcPersonnaNoveltyContext): number {
  if (!personna?.active) return 1;

  const tags = card.tags ?? [];
  const selected = personna.selectedInfluence;
  let multiplier = tags.includes("personna") || tags.includes("persona") ? 1.14 : 1;

  if (selected) {
    const selectedTags = new Set(selected.tags);
    const matchingTags = tags.filter((tag) => selectedTags.has(tag)).length;
    if (matchingTags > 0) multiplier *= 1 + Math.min(1.2, matchingTags * 0.28);

    if (selected.family === "clumsy" && card.id === "persona_clumsy_mishap") multiplier *= 3.4;
    if (selected.family === "protective" && card.id === "persona_protective_intercept") multiplier *= 3.2;
    if (selected.family === "sacrifice" && card.id === "persona_dumb_sacrifice") multiplier *= 3.1;
    if (["cool_to_soft", "flustered", "quiet_bravery", "trust_test"].includes(selected.family) && card.id === "persona_dere_contradiction") multiplier *= 2.7;
    if (["gift", "precision"].includes(selected.family) && card.id === "persona_signature_tell") multiplier *= 2.4;
  } else {
    if (card.id.startsWith("persona_")) multiplier *= 0.52;
  }

  if (personna.dereType === "kuudere" && card.id === "protective_tenderness") multiplier *= 1.35;
  if (personna.dereType === "tsundere" && (card.id === "gentle_tease" || card.id === "soft_reversal")) multiplier *= 1.28;
  if (personna.dereType === "deredere" && card.id === "emotional_opening") multiplier *= 1.18;
  if (personna.dereType === "dandere" && card.id === "charged_silence") multiplier *= 1.28;

  if (personna.shouldInfluenceNovelty && card.id.startsWith("persona_")) multiplier *= 1.45;

  return multiplier;
}

function npcPersonnaContinuityForState(state: NoveltyPlanningContext, ownsDetail = false): string | undefined {
  const personna = state.npcPersonna;
  if (!personna?.active) return undefined;
  const selected = personna.selectedInfluence && ownsDetail
    ? ` Active novelty lever: ${personna.selectedInfluence.family}:${personna.selectedInfluence.label}.`
    : personna.selectedInfluence
      ? ` Registered lever kept as subtext this turn: ${personna.selectedInfluence.family}:${personna.selectedInfluence.label}.`
      : " No quirk is forced this turn.";

  return `NPC-personna continuity: ${ownsDetail ? "selected novelty source" : "continuity-only source"}; keep ${personna.dereLabel} stable from context hash ${personna.contextHash}; preserve seed/arc dimensions (${personna.dimensions.slice(0, 6).join(", ")}).${selected}`;
}

function npcPersonnaDetailDeltaForBeat(beat: AdvancementCard, state: NoveltyPlanningContext): string | undefined {
  const personna = state.npcPersonna;
  if (!personna?.active) return undefined;
  const seedArc = personna.detailLifetimes.filter((item) => item.includes("[seed]") || item.includes("[arc]")).slice(0, 8);
  const mutable = personna.detailLifetimes.filter((item) => item.includes("[scene]") || item.includes("[beat]") || item.includes("[instant]")).slice(0, 8);
  const selected = personna.selectedInfluence;

  if (beat.id.startsWith("persona_") && selected) {
    return `NPC-personna detail delta: surface exactly one ${selected.family} lever (${selected.label}); preserve seed/arc details (${seedArc.join(", ") || "none"}) and mutate at most one scene/beat detail (${mutable.join(", ") || "none"}).`;
  }

  if (beat.tags?.includes("care") || beat.tags?.includes("protective")) {
    return `NPC-personna detail delta: express ${personna.dereLabel} through ${personna.loveLanguage} or ${personna.pressureResponse}; keep core dere/values stable (${seedArc.join(", ") || "none"}).`;
  }

  return `NPC-personna detail delta: preserve character-card dimensions (${seedArc.join(", ") || "none"}); optional quirks may remain subtext unless they sharpen this beat.`;
}

function npcPersonnaConstraintForState(state: NoveltyPlanningContext): string | undefined {
  const personna = state.npcPersonna;
  if (!personna?.active) return undefined;
  const selectedConstraint = personna.selectedInfluence?.constraint ? ` ${personna.selectedInfluence.constraint}` : "";
  return `NPC-personna constraint: personna influences delivery, mistakes, protective choices, and tells; it must not override player agency, contradict established facts, or become a new plot emergency.${selectedConstraint}`;
}

function romanceClicheScoreMultiplier(card: AdvancementCard, cliches?: RomanceClicheNoveltyContext): number {
  if (!cliches?.active) return 1;

  const tags = card.tags ?? [];
  let multiplier = tags.includes("cliche") ? 1.18 : 1;
  const targetText = cliches.targetFacets.join(" ").toLowerCase();
  const familyMatches = cliches.families.filter((family) => tags.includes(family)).length;
  const targetMatches = tags.filter((tag) => targetText.includes(tag.toLowerCase())).length;

  if (familyMatches > 0) multiplier *= 1 + Math.min(0.7, familyMatches * 0.22);
  if (targetMatches > 0) multiplier *= 1 + Math.min(0.9, targetMatches * 0.18);

  if (card.tags?.includes("jealousy") && !cliches.families.includes("friction")) multiplier *= 0.45;
  if (card.tags?.includes("kiss") && !cliches.families.includes("threshold") && cliches.families.includes("gaze")) multiplier *= 1.12;
  if (card.tags?.includes("callback") && cliches.persistentDetails.length > 0) multiplier *= 1.25;

  return multiplier;
}

function intimacyScoreMultiplier(card: AdvancementCard, sexScene?: SexSceneNoveltyContext): number {
  if (!sexScene?.active) return 1;

  if (sexScene.boundaryDetected) {
    if (card.id === "repair_and_respect" || card.id === "boundary_check" || card.id === "player_hold_boundary" || card.id === "player_slow_pace") return 3.2;
    if (card.tags?.some((tag) => tag === "desire" || tag === "adult" || tag === "kiss" || tag === "touch")) return 0.12;
    return 0.75;
  }

  if (sexScene.shouldFadeToBlack) {
    if (card.id === "protective_tenderness" || card.id === "emotional_opening" || card.id === "final_callback_payoff") return 1.85;
    if (card.tags?.some((tag) => tag === "adult" || tag === "desire" || tag === "kiss" || tag === "touch")) return 0.4;
    return 1;
  }

  if (sexScene.noveltyPressure === "aftercare") {
    if (card.id === "protective_tenderness" || card.id === "emotional_opening" || card.id === "callback_intimacy" || card.id === "final_callback_payoff") return 2.15;
    if (card.tags?.some((tag) => tag === "adult" || tag === "desire" || tag === "kiss" || tag === "touch")) return 0.45;
    return 0.95;
  }

  if (sexScene.stepOrder >= 5) {
    if (card.id === "consent_aware_closeness" || card.id === "desire_without_pressure" || card.id === "boundary_check") return 1.95;
    if (card.id === "specific_recognition" || card.id === "gentle_tease") return 0.45;
    if (card.tags?.includes("ending")) return 0.6;
  }

  if (sexScene.detailLifetimes.some((item) => item.includes("[position]") || item.includes("[scene]"))) {
    if (card.id === "visual_proximity" || card.id === "charged_silence" || card.id === "consent_aware_closeness") return 1.45;
  }

  return 1;
}

function intimacyContinuityForState(state: NoveltyPlanningContext, ownsDetail = false): string | undefined {
  const sexScene = state.sexScene;
  if (!sexScene?.active) return undefined;
  if (sexScene.boundaryDetected) return "Sex-scene continuity: boundary/pacing state overrides novelty; pause or repair before any intimacy detail changes.";
  if (sexScene.shouldFadeToBlack) return "Sex-scene continuity: keep adult details private and shift novelty into aftermath, emotional consequence, or covered visual framing.";

  const summary = sexScene.detailSummary && sexScene.detailSummary !== "No extra intimacy-position details are established."
    ? ` Established facets: ${sexScene.detailSummary}.`
    : "";

  const role = ownsDetail ? "selected novelty source" : "continuity-only source";
  return `Sex-scene continuity: ${role}; track phase=${sexScene.label}; preserve independent facets and their lifetimes rather than resetting the pose every turn.${summary}`;
}

function intimacyDetailDeltaForBeat(beat: AdvancementCard, state: NoveltyPlanningContext): string | undefined {
  const sexScene = state.sexScene;
  if (!sexScene?.active) return undefined;
  if (sexScene.boundaryDetected) return "Intimacy detail delta: change no erotic/detail facet; the only allowed novelty is respect, distance, clarification, or safety.";
  if (sexScene.shouldFadeToBlack) return "Intimacy detail delta: retire active beat-level mechanics and preserve only aftermath-safe scene/encounter facts.";
  if (sexScene.noveltyPressure === "aftercare") return "Intimacy detail delta: do not restart sex; change only aftercare, emotional honesty, cleanup, comfort, or callback meaning.";

  const persistent = sexScene.persistentDetails.length ? sexScene.persistentDetails.join(", ") : "none";
  const shortLived = sexScene.beatDetails.length ? sexScene.beatDetails.join(", ") : "none";

  if (beat.tags?.includes("consent") || beat.id === "boundary_check" || beat.id === "consent_aware_closeness") {
    return `Intimacy detail delta: use the novelty beat as a consent/pacing micro-check; preserve persistent details (${persistent}) and update at most one beat/instant detail (${shortLived}).`;
  }

  if (beat.id === "visual_proximity" || beat.id === "charged_silence") {
    return `Intimacy detail delta: novelty should be visual/framing/proximity only; keep position/scene/encounter details stable (${persistent}).`;
  }

  return `Intimacy detail delta: update at most one short-lived facet while preserving persistent details (${persistent}); do not advance every facet at once.`;
}

function intimacyConstraintForState(state: NoveltyPlanningContext): string | undefined {
  const sexScene = state.sexScene;
  if (!sexScene?.active) return undefined;
  if (sexScene.requiresAdultFraming) {
    return "Intimacy constraint: all characters must be clearly adult; consent must be explicit or clearly ongoing, reversible, and unpressured; never write the player's desire, consent, body reactions, or choices.";
  }
  return "Intimacy constraint: keep the scene romantic/sensual and agency-preserving unless the current context explicitly establishes adult intimacy.";
}


function romanceClicheContinuityForState(state: NoveltyPlanningContext, ownsDetail = false): string | undefined {
  const cliches = state.romanceCliches;
  if (!cliches?.active) return undefined;

  const summary = cliches.detailSummary && cliches.detailSummary !== "No romantic-cliche facets are currently selected."
    ? ` Available facets: ${cliches.detailSummary}.`
    : "";

  const role = ownsDetail ? "selected novelty source" : "continuity-only source";
  return `Romantic-cliche continuity: ${role}; cliches are unordered facets, not a required ladder; use at most one only when the arbiter selected romance_cliche.${summary}`;
}

function romanceClicheDetailDeltaForBeat(beat: AdvancementCard, state: NoveltyPlanningContext): string | undefined {
  const cliches = state.romanceCliches;
  if (!cliches?.active) return undefined;

  const persistent = cliches.persistentDetails.length ? cliches.persistentDetails.join(", ") : "none";
  const shortLived = cliches.beatDetails.length ? cliches.beatDetails.join(", ") : "none";
  const targets = cliches.targetFacets.length ? cliches.targetFacets.join(", ") : "none";

  if (beat.tags?.includes("cliche")) {
    return `Romantic-cliche detail delta: select one target facet (${targets}); preserve persistent cliche facts (${persistent}) and rotate at most one instant/beat detail (${shortLived}).`;
  }

  if (beat.tags?.includes("callback")) {
    return `Romantic-cliche detail delta: reuse a scene/relationship/arc lifetime cliche fact if relevant (${persistent}); otherwise leave cliches unchanged.`;
  }

  if (beat.tags?.includes("consent") || beat.tags?.includes("agency")) {
    return `Romantic-cliche detail delta: any trope must remain an invitation or pause; do not use cliche momentum to force touch, kiss, confession, or acceptance.`;
  }

  return `Romantic-cliche detail delta: do not stack tropes; either keep cliche state stable (${persistent}) or rotate one short-lived detail (${shortLived}).`;
}

function romanceClicheConstraintForState(state: NoveltyPlanningContext): string | undefined {
  const cliches = state.romanceCliches;
  if (!cliches?.active) return undefined;
  return "Romantic-cliche constraint: familiar tropes are allowed only as concrete, scene-grounded interaction details; never use them to control the player's feelings, consent, response, or destiny.";
}
