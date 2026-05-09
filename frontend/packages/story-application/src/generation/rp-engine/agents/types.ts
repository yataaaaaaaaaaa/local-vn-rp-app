import type { StoryNodeFields } from "@local-vn/story-domain";
import type { NoveltyPlanningContext } from "../novelty/novelty-planner";
import type {
  AdvancementCard,
  BeatType,
  NoveltyPlan,
  RpActorNames,
  RpPromptInput
} from "../types";

export type AgentVisualPlanContribution = {
  facts: Record<string, string | boolean | string[]>;
  fixedTags: string[];
};

export type AgentNoveltyContribution = {
  context?: NoveltyPlanningContext;
  advancementCard?: AdvancementCard;
  noveltyPlan?: NoveltyPlan;
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
};

export type AgentContribution = AgentVisualPlanContribution & {
  prompt?: string;
  promptViews?: Record<string, unknown>;
  novelty?: AgentNoveltyContribution;
};

export interface RpAgent {
  id: string;
  run(input: AgentRunInput): AgentContribution;
}
