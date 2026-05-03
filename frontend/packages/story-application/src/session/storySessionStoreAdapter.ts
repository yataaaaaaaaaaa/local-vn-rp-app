import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import type {
  StoryNodeFieldKey,
  StoryWorkflowStepId
} from "@local-vn/story-domain";

import type { StorySessionController } from "./storySessionController";
import type { StorySessionStoreState } from "./storySessionState";

export function createStorySessionStoreState(
  controller: StorySessionController
): StorySessionStoreState {
  return {
    ...controller.getState(),

    createStory: (title: string) => controller.createStory(title),
    loadStory: (storyId: string) => controller.loadStory(storyId),
    saveStory: () => controller.saveStory(),

    selectNode: (nodeId: string) => controller.selectNode(nodeId),
    goBack: () => controller.goBack(),
    goForward: () => controller.goForward(),
    goToParent: () => controller.goToParent(),
    goToFirstChild: () => controller.goToFirstChild(),
    goToChild: (nodeId: string) => controller.goToChild(nodeId),
    goToPreviousSibling: () => controller.goToPreviousSibling(),
    goToNextSibling: () => controller.goToNextSibling(),

    createChildFromCurrent: (initialUserText?: string) =>
      controller.createChildFromCurrent(initialUserText),
    submitUserText: (userText: string) => controller.submitUserText(userText),
    createAlternateBranch: (userText?: string) =>
      controller.createAlternateBranch(userText),
    duplicateCurrentBranch: () => controller.duplicateCurrentBranch(),
    deleteNode: (nodeId: string) => controller.deleteNode(nodeId),
    deleteCurrentLeaf: () => controller.deleteCurrentLeaf(),

    selectWorkflowStep: (stepId: StoryWorkflowStepId) =>
      controller.selectWorkflowStep(stepId),
    editStepField: (
      stepId: StoryWorkflowStepId,
      field: StoryNodeFieldKey,
      value: string
    ) => controller.editStepField(stepId, field, value),
    validateStep: (stepId?: StoryWorkflowStepId) =>
      controller.validateStep(stepId),
    regenerateStep: (stepId?: StoryWorkflowStepId) =>
      controller.regenerateStep(stepId),
    continueFrom: (
      stepId?: StoryWorkflowStepId,
      nodeId?: string | null
    ) => controller.continueFrom(stepId, nodeId),
    setStepAutoValidate: (stepId: StoryWorkflowStepId, enabled: boolean) =>
      controller.setStepAutoValidate(stepId, enabled),
    applyPresetContext: (context: string) =>
      controller.applyPresetContext(context),
    applyResolverResult: (input: {
      rawText: string;
      tags: string[];
      prompt: string;
    }) => controller.applyResolverResult(input),

    cancelAll: () => controller.cancelAll(),
    cancelNode: (nodeId: string) => controller.cancelNode(nodeId),

    setBackendConfig: (config: BackendRuntimeConfig | null) =>
      controller.setBackendConfig(config),
    setMessage: (message: string | null) => controller.setMessage(message)
  };
}
