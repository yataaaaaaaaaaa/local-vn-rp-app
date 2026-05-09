import type { AdvancementCard, NoveltyPlan, RomancePhase, RpPromptInput } from "../types";

export type NoveltyPlanningContext = {
  closeness: number;
  phase: RomancePhase;
  currentTension: string;
  callbackDetail: string;
  boundaryDetected: boolean;
};

export function selectRomanceBeat(
  input: RpPromptInput,
  deck: AdvancementCard[],
  state: NoveltyPlanningContext
): AdvancementCard {
  if (input.boundaryDetected || state.boundaryDetected) {
    const boundaryBeat = deck.find((card) => card.id === "repair_and_respect" || card.id === "player_hold_boundary" || card.id === "boundary_check");
    if (boundaryBeat) return boundaryBeat;
  }

  if (input.advancementCard) {
    const explicit = typeof input.advancementCard === "string"
      ? deck.find((card) => card.id === input.advancementCard)
      : input.advancementCard;

    if (explicit) return explicit;
  }

  const recent = new Set(input.recentBeatTypes?.slice(-4) ?? []);
  const tolerance = state.phase === "spark" ? 1 : state.phase === "charge" ? 1.25 : 1.75;
  const allowed = deck
    .filter((card) => (card.minCloseness ?? 0) <= state.closeness + tolerance)
    .map((card) => {
      let weight = card.weight;
      if (recent.has(card.id)) weight *= 0.25;
      if (card.phases?.includes(state.phase)) weight *= 1.45;
      if (state.callbackDetail !== "(none)" && card.tags?.includes("callback")) weight *= 1.4;
      if (state.currentTension.includes("boundary") && card.tags?.includes("consent")) weight *= 1.5;
      if (state.phase === "resolution" && card.tags?.includes("ending")) weight *= 2;

      return { ...card, weight };
    })
    .filter((card) => card.weight > 0);

  return weightedPick(allowed.length ? allowed : deck, input.rng);
}

export function noveltyPlanFromBeat(
  beat: AdvancementCard,
  state: NoveltyPlanningContext,
  forbiddenFragments: string[]
): NoveltyPlan {
  return {
    axis: beat.id,
    label: beat.label,
    directive: beat.directive,
    forbiddenFragments,
    minCloseness: beat.minCloseness,
    typicalAfter: beat.typicalAfter,
    phase: state.phase,
    closenessBefore: state.closeness,
    closenessAfter: beat.typicalAfter ?? state.closeness
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
