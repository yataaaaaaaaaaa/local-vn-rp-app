import type { WorkflowStepMode } from "@local-vn/workflow-core";
import type { StoryNodeFields } from "../story/types";
import {
  defaultStoryWorkflowModes,
  storyWorkflowStepIds,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId,
  type StoryWorkflowModes
} from "./stepIds";
import {
  emptyFields,
  fieldsForStoryWorkflowStep,
  mergePayload,
  readFields,
  trimFields,
  writeFields
} from "./stepFields";

export interface StoryWorkflowStepDescriptor {
  id: StoryWorkflowStepId;
  label: string;
  mode: WorkflowStepMode;
  fields: ReturnType<typeof fieldsForStoryWorkflowStep>;
  read(fields: StoryNodeFields): StoryWorkflowPayload;
  write(fields: StoryNodeFields, payload: StoryWorkflowPayload): StoryNodeFields;
  empty(): StoryWorkflowPayload;
  merge(base: StoryWorkflowPayload, patch: Partial<StoryWorkflowPayload>): StoryWorkflowPayload;
  normalize(payload: StoryWorkflowPayload): StoryWorkflowPayload;
}

export function createStoryWorkflowStepDescriptors(
  modes: Partial<StoryWorkflowModes> = {}
): StoryWorkflowStepDescriptor[] {
  const resolvedModes: StoryWorkflowModes = {
    ...defaultStoryWorkflowModes,
    ...modes
  };

  return storyWorkflowStepIds.map((id) => ({
    id,
    label: labelForStoryWorkflowStep(id),
    mode: resolvedModes[id],
    fields: fieldsForStoryWorkflowStep(id),
    read: (fields) => readFields(fields, id),
    write: (fields, payload) => writeFields(fields, id, payload),
    empty: () => emptyFields(id),
    merge: mergePayload,
    normalize: trimFields
  }));
}

export function storyWorkflowStepDescriptorById(
  modes: Partial<StoryWorkflowModes> = {}
): Record<StoryWorkflowStepId, StoryWorkflowStepDescriptor> {
  return Object.fromEntries(
    createStoryWorkflowStepDescriptors(modes).map((descriptor) => [
      descriptor.id,
      descriptor
    ])
  ) as Record<StoryWorkflowStepId, StoryWorkflowStepDescriptor>;
}

export function labelForStoryWorkflowStep(stepId: StoryWorkflowStepId): string {
  switch (stepId) {
    case "context":
      return "Context";
    case "userText":
      return "User Text";
    case "dialogue":
      return "Dialogue";
    case "visualDescription":
      return "Visual Description";
    case "resolverText":
      return "Resolver Text";
    case "selectedTags":
      return "Selected Tags";
    case "danbot":
      return "DanBot";
    case "prompt":
      return "Prompt";
    case "image":
      return "Image";
    case "nextScene":
      return "Go to Next Scene";
  }
}
