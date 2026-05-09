import type { StoryNodeFields } from "@local-vn/story-domain";

export type RomancePhase = "spark" | "charge" | "trust" | "threshold" | "intimacy" | "resolution";

export type BeatType =
  | "specific_recognition"
  | "gentle_tease"
  | "charged_silence"
  | "callback_intimacy"
  | "emotional_opening"
  | "consent_aware_closeness"
  | "soft_reversal"
  | "protective_tenderness"
  | "honest_question"
  | "almost_confession"
  | "partial_confession"
  | "desire_without_pressure"
  | "romantic_invitation"
  | "boundary_check"
  | "repair_and_respect"
  | "final_callback_payoff"
  | "visual_proximity"
  | "visual_expression"
  | "visual_callback_object"
  | "visual_lighting_mood"
  | "player_tease_back"
  | "player_ask_directly"
  | "player_step_closer"
  | "player_hold_boundary"
  | "player_admit_small_truth"
  | "player_slow_pace"
  | "player_accept_invitation"
  | "player_challenge_softly";

export type NoveltyAxis = BeatType;

export type AdvancementCard = {
  id: BeatType;
  weight: number;
  directive: string;
  label?: string;
  minCloseness?: number;
  typicalAfter?: number;
  phases?: RomancePhase[];
  constraint?: string;
  avoid?: string;
  tags?: string[];
};

export type RpActorNames = {
  playerName?: string | null;
  npcName?: string | null;
};

export type NoveltyPlan = {
  axis: NoveltyAxis;
  directive: string;
  forbiddenFragments: string[];
  label?: string;
  minCloseness?: number;
  typicalAfter?: number;
  phase?: RomancePhase;
  closenessBefore?: number;
  closenessAfter?: number;
};

export type RpPromptBuildResult = {
  prompt: string;
  advancementCard?: AdvancementCard;
  noveltyPlan?: NoveltyPlan;
  actorNames?: RpActorNames | null;
};

export type ActorNameExtractionRunner = (prompt: string) => Promise<string>;

export type RpPromptInput = {
  node: StoryNodeFields;
  storyId?: string | null;
  selectedNodeId?: string | null;

  /**
   * Optional external pacing control. If provided, the prompt renderer treats this
   * as the selected romance beat for dialogue/user generation.
   */
  advancementCard?: AdvancementCard | BeatType | null;
  recentBeatTypes?: BeatType[];
  boundaryDetected?: boolean;
  rng?: () => number;
};

export type RpPromptRenderInput = RpPromptInput & {
  actorNames?: RpActorNames | null;
};

export type RpActorLabels = {
  player: string;
  npc: string;
  Player: string;
  Npc: string;
  playerPossessive: string;
  npcPossessive: string;
};
