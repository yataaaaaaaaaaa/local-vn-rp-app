import type {
  StoryNodeFieldKey,
  StoryNodeFields
} from "../story/types";
import type {
  StoryWorkflowPayload,
  StoryWorkflowStepId
} from "./stepIds";

export function fieldsForStoryWorkflowStep(
  stepId: StoryWorkflowStepId
): StoryNodeFieldKey[] {
  switch (stepId) {
    case "context":
      return ["context"];
    case "userText":
      return ["userText"];
    case "dialogue":
      return ["dialogue"];
    case "visualDescription":
      return ["visualDescription"];
    case "resolverText":
      return ["resolverText"];
    case "selectedTags":
      return ["selectedTags"];
    case "danbot":
      return ["danbotTags"];
    case "prompt":
      return ["positivePrompt", "negativePrompt"];
    case "image":
      return ["imageRef"];
  }
}

export function readFields(
  fields: StoryNodeFields,
  stepId: StoryWorkflowStepId
): StoryWorkflowPayload {
  const payload: StoryWorkflowPayload = {};

  for (const field of fieldsForStoryWorkflowStep(stepId)) {
    payload[field] = fields[field];
  }

  return payload;
}

export function emptyFields(stepId: StoryWorkflowStepId): StoryWorkflowPayload {
  const payload: StoryWorkflowPayload = {};

  for (const field of fieldsForStoryWorkflowStep(stepId)) {
    payload[field] = "";
  }

  if (stepId === "prompt") {
    payload.negativePrompt = "lowres, bad anatomy";
  }

  return payload;
}

export function writeFields(
  fields: StoryNodeFields,
  stepId: StoryWorkflowStepId,
  payload: StoryWorkflowPayload
): StoryNodeFields {
  const nextFields: StoryNodeFields = { ...fields };

  for (const field of fieldsForStoryWorkflowStep(stepId)) {
    const value = payload[field];

    if (typeof value === "string") {
      nextFields[field] = value;
    }
  }

  return nextFields;
}

export function mergePayload(
  base: StoryWorkflowPayload,
  patch: Partial<StoryWorkflowPayload>
): StoryWorkflowPayload {
  const nextPayload: StoryWorkflowPayload = { ...base };

  for (const [key, value] of Object.entries(patch) as Array<
    [StoryNodeFieldKey, string | undefined]
  >) {
    if (typeof value === "string") {
      nextPayload[key] = value;
    }
  }

  return nextPayload;
}

export function trimFields(payload: StoryWorkflowPayload): StoryWorkflowPayload {
  const nextPayload: StoryWorkflowPayload = {};

  for (const [key, value] of Object.entries(payload) as Array<
    [StoryNodeFieldKey, string | undefined]
  >) {
    if (typeof value === "string") {
      nextPayload[key] = value.trim();
    }
  }

  return nextPayload;
}

export function joinPromptParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}
