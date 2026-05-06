import type { StoryWorkflowStepId } from "@local-vn/story-domain";

export type RpLlmTraceStepId = Extract<
  StoryWorkflowStepId,
  "userText" | "dialogue" | "visualDescription"
>;

export interface RpLlmTraceEntry {
  nodeId: string;
  stepId: RpLlmTraceStepId;
  fullPrompt: string;
  rawAnswer: string;
  answer: string;
}
