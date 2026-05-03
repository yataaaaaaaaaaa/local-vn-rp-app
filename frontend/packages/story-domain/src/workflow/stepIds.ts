import type { StoryNodeFields } from "../story/types";

export const storyWorkflowStepIds = [
  "context",
  "userText",
  "dialogue",
  "visualDescription",
  "resolverText",
  "selectedTags",
  "danbot",
  "prompt",
  "image"
] as const;

export type StoryWorkflowStepId = (typeof storyWorkflowStepIds)[number];

export type StoryWorkflowPayload = Partial<StoryNodeFields>;

export type StoryWorkflowModes = Record<StoryWorkflowStepId, "auto" | "manual">;

export type StoryWorkflowAutoValidateByStepId = Record<StoryWorkflowStepId, boolean>;

export const defaultStoryWorkflowModes: StoryWorkflowModes = {
  context: "manual",
  userText: "manual",
  dialogue: "auto",
  visualDescription: "auto",
  resolverText: "auto",
  selectedTags: "manual",
  danbot: "auto",
  prompt: "auto",
  image: "manual"
};

export const defaultStoryWorkflowAutoValidateGeneratedCandidate: StoryWorkflowAutoValidateByStepId = {
  context: true,
  userText: true,
  dialogue: true,
  visualDescription: true,
  resolverText: true,
  selectedTags: true,
  danbot: true,
  prompt: true,
  image: false
};
