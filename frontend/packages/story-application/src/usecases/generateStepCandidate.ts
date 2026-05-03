import {
  cloneWorkflowByNodeId,
  ensureWorkflowRecord,
  readFields,
  type StoryNodeFields,
  type StoryWorkflowByNodeId,
  type StoryWorkflowPayload,
  type StoryWorkflowSnapshot,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import {
  markWorkflowStepFailed,
  markWorkflowStepGenerating,
  setWorkflowStepCandidate
} from "@local-vn/workflow-core";

import type { StoryStepGenerationContext } from "../generation/storyStepGenerators";
import { storyWorkflowStepById } from "../generation/storyStepGenerators";
import { assertGenerationConfig } from "../generation/generationConfigValidation";

export interface StoryWorkflowRunningJob {
  key: string;
  nodeId: string;
  stepId: StoryWorkflowStepId;
  startedAt: string;
  abortController?: AbortController;
}

export interface GenerateStepCandidateInput {
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  fields: StoryNodeFields;
  stepId: StoryWorkflowStepId;
  context: StoryStepGenerationContext;
  abortSignal?: AbortSignal;
}

export interface GenerateStepCandidateResult {
  workflowByNodeId: StoryWorkflowByNodeId;
  workflow: StoryWorkflowSnapshot;
  payload: StoryWorkflowPayload | null;
  warnings?: string[];
  error?: string;
}

export function generationKeyFor(
  nodeId: string,
  stepId: StoryWorkflowStepId
): string {
  return `${nodeId}:${stepId}`;
}

export function createStoryWorkflowRunningJob(input: {
  nodeId: string;
  stepId: StoryWorkflowStepId;
  abortController?: AbortController;
  startedAt?: Date;
}): StoryWorkflowRunningJob {
  return {
    key: generationKeyFor(input.nodeId, input.stepId),
    nodeId: input.nodeId,
    stepId: input.stepId,
    startedAt: (input.startedAt ?? new Date()).toISOString(),
    abortController: input.abortController
  };
}

export async function generateStepCandidate(
  input: GenerateStepCandidateInput
): Promise<GenerateStepCandidateResult> {
  const workflowByNodeId = cloneWorkflowByNodeId(input.workflowByNodeId);
  const workflow = ensureWorkflowRecord(
    workflowByNodeId,
    input.nodeId,
    input.fields
  );
  const step = storyWorkflowStepById[input.stepId];

  if (!step) {
    throw new Error(`Unknown workflow step: ${input.stepId}`);
  }

  try {
    assertNotAborted(input.abortSignal);
    assertGenerationConfig(input.context.config, input.stepId);

    markWorkflowStepGenerating(
      workflow,
      input.stepId,
      () => readFields(input.fields, input.stepId)
    );

    const generationResult = step.generate
      ? await step.generate({
          document: input.fields,
          context: input.context
        })
      : {
          value: readFields(input.fields, input.stepId)
        };

    assertNotAborted(input.abortSignal);

    const normalizedPayload = step.normalize
      ? step.normalize(generationResult.value)
      : generationResult.value;

    setWorkflowStepCandidate(
      workflow,
      input.stepId,
      normalizedPayload,
      generationResult.warnings
    );

    return {
      workflowByNodeId,
      workflow,
      payload: normalizedPayload,
      warnings: generationResult.warnings
    };
  } catch (error) {
    const message = errorToMessage(error);

    markWorkflowStepFailed(
      workflow,
      input.stepId,
      message,
      () => readFields(input.fields, input.stepId)
    );

    return {
      workflowByNodeId,
      workflow,
      payload: null,
      error: message
    };
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Workflow generation was cancelled.");
  }
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
