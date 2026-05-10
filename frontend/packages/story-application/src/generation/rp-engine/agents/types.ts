import type { StoryNodeFields } from "@local-vn/story-domain";
import type { CandidateScoringContext } from "../novelty/candidate-scoring";
import type {
  AdvancementCard,
  BeatType,
  RpActorNames,
  SexSceneNoveltyContext,
  NpcPersonnaNoveltyContext,
  RpPromptInput
} from "../types";

export type AgentVisualPlanContribution = {
  facts: Record<string, string | boolean | string[]>;
  fixedTags: string[];
};

export type AgentNote = {
  /** Stable agent identifier used in hidden planning prompts. */
  source: string;
  /** Compact natural-language fact for other agents and the hidden coherence checker. */
  text: string;
};

export type AgentNoveltyCandidate = {
  id: string;
  /** Source family, for code-side weighting and final traces only. */
  source: string;
  /** Code-side score. The RP LLM never sees this number. */
  weight: number;
  /** Natural-language redirect shown to the hidden coherence checker and, if accepted, to the final RP prompt. */
  text: string;
  /** Optional fields when a candidate comes from a deterministic beat deck. */
  beatId?: BeatType;
  label?: string;
  rationale?: string;
};

export type AgentNoveltyContribution = {
  context?: CandidateScoringContext;
  /** Intimacy-state bridge supplied by SEX_SCENE_AGENT for candidate weighting and prompt notes. */
  intimacy?: SexSceneNoveltyContext;
  /** Seeded/explicit NPC personna bridge supplied by NPC_PERSONNA_AGENT for candidate weighting and prompt notes. */
  npcPersonna?: NpcPersonnaNoveltyContext;
};

export type AgentRunInput = {
  node: StoryNodeFields;
  promptInput?: RpPromptInput;
  actorNames?: RpActorNames | null;
  forcedNovelty?: {
    advancementCard?: AdvancementCard | BeatType | null;
    recentBeatTypes?: BeatType[];
    boundaryDetected?: boolean;
    forbiddenFragments?: string[];
  };
  recentOutputText?: string;
  previousAgentNotes?: AgentNote[];
};

export type AgentContribution = AgentVisualPlanContribution & {
  prompt?: string;
  promptViews?: Record<string, unknown>;
  novelty?: AgentNoveltyContribution;
  notes?: AgentNote[];
  candidates?: AgentNoveltyCandidate[];
};

export interface RpAgent {
  id: string;
  run(input: AgentRunInput): AgentContribution;
}
