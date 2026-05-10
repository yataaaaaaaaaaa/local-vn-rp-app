import type { StoryNodeFields } from "@local-vn/story-domain";
import type { NoveltyRuntimeConfig } from "@local-vn/shared-types";

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
  | "cliche_locked_gaze"
  | "cliche_shared_shelter"
  | "cliche_accidental_touch"
  | "cliche_fixing_detail"
  | "cliche_offer_warmth"
  | "cliche_shared_drink"
  | "cliche_walk_home"
  | "cliche_private_dance"
  | "cliche_almost_kiss"
  | "cliche_caught_stumble"
  | "cliche_sleepy_vigil"
  | "cliche_domestic_tenderness"
  | "cliche_token_exchange"
  | "cliche_name_softening"
  | "cliche_mild_jealousy"
  | "cliche_reunion_pause"
  | "cliche_farewell_linger"
  | "cliche_secret_place"
  | "cliche_protective_cover"
  | "cliche_forehead_touch"
  | "persona_clumsy_mishap"
  | "persona_protective_intercept"
  | "persona_dumb_sacrifice"
  | "persona_dere_contradiction"
  | "persona_signature_tell"
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

export type RomanceClicheLifetime = "instant" | "beat" | "scene" | "relationship" | "arc";

export type RomanceClicheFacet = {
  facet: string;
  label: string;
  family: string;
  lifetime: RomanceClicheLifetime;
  minCloseness: number;
  phases: RomancePhase[];
  tags: string[];
  directive: string;
  constraint: string;
  avoid: string;
  observed: boolean;
};

export type RomanceClicheNoveltyContext = {
  active: boolean;
  detailSummary: string;
  detailLifetimes: string[];
  facets: RomanceClicheFacet[];
  targetFacets: string[];
  persistentDetails: string[];
  beatDetails: string[];
  noveltyInstruction: string;
  families: string[];
};

export type NpcPersonnaDereType =
  | "deredere"
  | "tsundere"
  | "kuudere"
  | "dandere"
  | "himedere"
  | "kamidere"
  | "bakadere"
  | "mayadere";

export type NpcPersonnaLifetime = "seed" | "arc" | "relationship" | "scene" | "beat" | "instant";

export type NpcPersonnaNoveltyInfluence = {
  id: string;
  label: string;
  family: string;
  lifetime: NpcPersonnaLifetime;
  triggerChance: number;
  tags: string[];
  directive: string;
  constraint: string;
};

export type NpcPersonnaNoveltyContext = {
  active: boolean;
  contextHash: string;
  source: "explicit" | "seeded";
  dereType: NpcPersonnaDereType;
  dereLabel: string;
  core: string;
  publicMask: string;
  privateTell: string;
  temperament: string;
  attachmentStyle: string;
  coreValue: string;
  flaw: string;
  vulnerability: string;
  loveLanguage: string;
  pressureResponse: string;
  dialogueStyle: string;
  dimensions: string[];
  detailLifetimes: string[];
  noveltyLevers: string[];
  influences: NpcPersonnaNoveltyInfluence[];
  selectedInfluence?: NpcPersonnaNoveltyInfluence;
  shouldInfluenceNovelty: boolean;
  noveltyRoll: number;
  noveltyInstruction: string;
  summary: string;
  visualTags: string[];
};

export type SexSceneNoveltyFacet = {
  facet: string;
  label: string;
  lifetime: string;
};

export type SexSceneNoveltyPressure =
  | "none"
  | "stabilize"
  | "micro_shift"
  | "reframe"
  | "aftercare"
  | "boundary_repair"
  | "fade_to_black";

export type SexSceneNoveltyContext = {
  active: boolean;
  step: string;
  label: string;
  stepOrder: number;
  boundaryDetected: boolean;
  requiresAdultFraming: boolean;
  shouldFadeToBlack: boolean;
  detailSummary: string;
  detailLifetimes: string[];
  facets: SexSceneNoveltyFacet[];
  positions: string[];
  contacts: string[];
  persistentDetails: string[];
  beatDetails: string[];
  noveltyPressure: SexSceneNoveltyPressure;
};

export type AgentDebugTrace = {
  sceneId: string;
  generatedAt: string;
  agents: AgentDebugEntry[];
  candidateBuffer: CandidateDebugEntry[];
  coherenceChecks: CoherenceCheckDebugEntry[];
  selectedRedirect: SelectedRedirectDebugEntry;
};

export type AgentDebugEntry = {
  id: string;
  label: string;
  notes: string[];
  candidates: CandidateDebugEntry[];
};

export type CandidateDebugEntry = {
  id: string;
  source: string;
  text: string;
  weight?: number;
  label?: string;
};

export type CoherenceCheckDebugEntry = {
  attempt: number;
  candidateId: string;
  candidateText: string;
  verdict: "YES" | "NO" | "ERROR";
  rawOutput?: string;
};

export type SelectedRedirectDebugEntry = {
  candidateId?: string;
  source?: string;
  text: string;
  fallback: boolean;
  reason: "accepted" | "no_candidates" | "all_rejected" | "checker_error" | "disabled";
};

export type RpPromptBuildResult = {
  prompt: string;
  actorNames?: RpActorNames | null;
  debugTrace?: AgentDebugTrace;
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
  /** Global backend-config controls for novelty orchestration. */
  novelty?: Partial<NoveltyRuntimeConfig> | null;
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
