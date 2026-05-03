import {
  canEditWorkflowStep,
  nextStepId
} from "@local-vn/workflow-core";
import type { WorkflowStepState } from "@local-vn/workflow-core";

import type { StoryNodeFields } from "../story/types";
import {
  storyWorkflowStepIds,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId
} from "./stepIds";
import { readFields } from "./stepFields";
import type {
  StoryWorkflowByNodeId,
  StoryWorkflowSnapshot
} from "./snapshot";
import { workflowForNode } from "./snapshot";

export interface ResolvedStoryWorkflowCurrent {
  nodeId: string;
  fields: StoryNodeFields;
  workflow: StoryWorkflowSnapshot;
}

export function selectCurrentWorkflowSnapshot(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
}): StoryWorkflowSnapshot | null {
  return workflowForNode(input.workflowByNodeId, input.currentNodeId);
}

export function selectActiveWorkflowStep(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  activeWorkflowStepId?: StoryWorkflowStepId | null;
}): StoryWorkflowStepId {
  const workflow = selectCurrentWorkflowSnapshot(input);

  return (
    input.activeWorkflowStepId ??
    workflow?.activeStepId ??
    storyWorkflowStepIds[0]
  );
}

export function selectWorkflowStepState(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  stepId: StoryWorkflowStepId;
}): WorkflowStepState<StoryWorkflowPayload> | null {
  const workflow = selectCurrentWorkflowSnapshot(input);
  return workflow?.stepStates[input.stepId] ?? null;
}

export function selectWorkflowStepPayload(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  fields: StoryNodeFields;
  stepId: StoryWorkflowStepId;
}): StoryWorkflowPayload {
  const stepState = selectWorkflowStepState(input);

  return (
    stepState?.edited ??
    stepState?.generated ??
    readFields(input.fields, input.stepId)
  );
}

export function selectCanEditStep(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  stepId: StoryWorkflowStepId;
}): boolean {
  const workflow = selectCurrentWorkflowSnapshot(input);

  if (!workflow) {
    return false;
  }

  return canEditWorkflowStep(workflow, storyWorkflowStepIds, input.stepId);
}

export function selectCanGenerateStep(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  stepId: StoryWorkflowStepId;
  isBackendReady?: boolean;
}): boolean {
  const workflow = selectCurrentWorkflowSnapshot(input);

  if (!workflow) {
    return false;
  }

  if (input.isBackendReady === false && input.stepId !== "nextScene") {
    return false;
  }

  if (workflow.machineState === "running") {
    return false;
  }

  const stepState = workflow.stepStates[input.stepId];

  if (stepState?.status === "generating") {
    return false;
  }

  return canEditWorkflowStep(workflow, storyWorkflowStepIds, input.stepId);
}

export function selectCanValidateStep(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  stepId: StoryWorkflowStepId;
}): boolean {
  const workflow = selectCurrentWorkflowSnapshot(input);

  if (!workflow || workflow.machineState === "running") {
    return false;
  }

  const stepState = workflow.stepStates[input.stepId];

  return (
    stepState?.status === "candidate" ||
    stepState?.status === "invalidated" ||
    stepState?.status === "failed"
  );
}

export function selectNextWorkflowStep(
  stepId: StoryWorkflowStepId
): StoryWorkflowStepId | null {
  return nextStepId(storyWorkflowStepIds, stepId);
}

export function selectIsWorkflowStepValidated(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  stepId: StoryWorkflowStepId;
}): boolean {
  return selectWorkflowStepState(input)?.status === "validated";
}

export function selectIsWorkflowStepGenerating(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  stepId: StoryWorkflowStepId;
}): boolean {
  return selectWorkflowStepState(input)?.status === "generating";
}

export function selectWorkflowError(input: {
  workflowByNodeId: StoryWorkflowByNodeId;
  currentNodeId: string | null;
  stepId: StoryWorkflowStepId;
}): string | undefined {
  return selectWorkflowStepState(input)?.error;
}
