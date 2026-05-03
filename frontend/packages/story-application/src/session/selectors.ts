import {
  resolveStoryNodeFields,
  selectCanEditStep as selectDomainCanEditStep,
  selectCanGenerateStep as selectDomainCanGenerateStep,
  selectCanValidateStep as selectDomainCanValidateStep,
  selectActiveWorkflowStep as selectDomainActiveWorkflowStep,
  type StoryNodeFields,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";

import type { StorySessionState } from "./storySessionState";

export function selectResolvedCurrent(
  state: Pick<StorySessionState, "tree" | "selectedNodeId">
): StoryNodeFields {
  return resolveStoryNodeFields(state.tree, state.selectedNodeId);
}

export function selectActiveWorkflowStep(
  state: Pick<
    StorySessionState,
    "workflowByNodeId" | "selectedNodeId" | "activeStepId"
  >
): StoryWorkflowStepId {
  return selectDomainActiveWorkflowStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    activeWorkflowStepId: state.activeStepId
  });
}

export function selectCanEditStep(
  state: Pick<StorySessionState, "workflowByNodeId" | "selectedNodeId">,
  stepId: StoryWorkflowStepId
): boolean {
  return selectDomainCanEditStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    stepId
  });
}

export function selectCanGenerateStep(
  state: Pick<
    StorySessionState,
    "workflowByNodeId" | "selectedNodeId" | "backendConfig"
  >,
  stepId: StoryWorkflowStepId
): boolean {
  return selectDomainCanGenerateStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    stepId,
    isBackendReady: Boolean(state.backendConfig)
  });
}

export function selectCanValidateStep(
  state: Pick<StorySessionState, "workflowByNodeId" | "selectedNodeId">,
  stepId: StoryWorkflowStepId
): boolean {
  return selectDomainCanValidateStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    stepId
  });
}
