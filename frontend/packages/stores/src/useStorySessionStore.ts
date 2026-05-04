import { create } from "zustand";

import {
  StorySessionController,
  createStorySessionStoreState,
  selectActiveWorkflowStep,
  selectCanEditStep,
  selectCanGenerateStep,
  selectCanValidateStep,
  selectCurrentNodeImageRef,
  selectDisplayedImageRef,
  selectParentNodeImageRef,
  selectResolvedCurrent,
  type StoryGenerationBackend,
  type StoryModelLoadingBackend,
  type StoryPersistencePort,
  type StoryRuntimeControlBackend,
  type StorySessionStoreState
} from "@local-vn/story-application";
import {
  selectCurrentWorkflowSnapshot as selectDomainCurrentWorkflowSnapshot
} from "@local-vn/story-domain";
import type { StoryWorkflowSnapshot } from "@local-vn/story-domain";
import {
  listStoryManifests,
  loadStoryBundle,
  persistenceApi,
  saveStoryBundle
} from "@local-vn/story-infrastructure";

import { backendClientOrThrow } from "./useBackendClientStore";
import { useActionCompositionCorrectionStore } from "./useActionCompositionCorrectionStore";
import { useActionCompositionTreeStore } from "./useActionCompositionTreeStore";
import { useBackendConfigStore } from "./useBackendConfigStore";
import { useFrontendPreferencesStore } from "./useFrontendPreferencesStore";
import { useLayoutStore } from "./useLayoutStore";
import { useResolverStore } from "./useResolverStore";

export type StorySessionState = StorySessionStoreState;

const storyPersistence: StoryPersistencePort = {
  loadStory: (storyId) => loadStoryBundle(persistenceApi(), storyId),
  saveStory: (bundle) => saveStoryBundle(persistenceApi(), bundle),
  listStories: () => listStoryManifests(persistenceApi())
};

const storyBackend: StoryGenerationBackend & StoryModelLoadingBackend & StoryRuntimeControlBackend = {
  generateLlm: (request, options) => backendClientOrThrow().generateLlm(request, options),
  generateDanbotTags: (request, options) =>
    backendClientOrThrow().generateDanbotTags(request, options),
  generateImage: (request, options) =>
    backendClientOrThrow().generateImage(request, options),
  resolveAssets: (request) => backendClientOrThrow().resolveAssets(request),
  getRuntimeStatus: () => backendClientOrThrow().runtimeStatus(),
  loadLlmModel: async (request) => {
    await backendClientOrThrow().loadLlm(request);
  },
  loadImageModel: async (request) => {
    await backendClientOrThrow().loadImageModel(request);
  },
  loadDanbotModel: async (request) => {
    await backendClientOrThrow().loadDanbot(request);
  },
  cancelAll: async () => {
    await backendClientOrThrow().cancel();
  }
};

export const storySessionController = new StorySessionController({
  services: {
    persistence: storyPersistence,
    backend: storyBackend,
    userInputPolicy: {
      shouldAutoGenerateUserText: () =>
        useFrontendPreferencesStore.getState().generateUserAnswerFromLlm
    },
    actionCompositionTree: {
      getTree: () => useActionCompositionTreeStore.getState().tree,
      getSeed: () => useResolverStore.getState().seed,
      reportSelectionIssue: (issue) =>
        useActionCompositionCorrectionStore.getState().open(issue)
    },
    autosave: true
  },
  initialState: {
    backendConfig: useBackendConfigStore.getState().config
  }
});

export const useStorySessionStore = create<StorySessionState>(() =>
  createStorySessionStoreState(storySessionController)
);

storySessionController.subscribe((state) => {
  useStorySessionStore.setState(state);

  if (state.storyId && useLayoutStore.getState().lastOpenedStoryId !== state.storyId) {
    useLayoutStore.getState().patch({ lastOpenedStoryId: state.storyId });
  }
});

useBackendConfigStore.subscribe((state) => {
  storySessionController.setBackendConfig(state.config);
});

export function selectCurrentWorkflowSnapshot(
  state: Pick<StorySessionState, "workflowByNodeId" | "selectedNodeId">
): StoryWorkflowSnapshot | null {
  return selectDomainCurrentWorkflowSnapshot({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId
  });
}

export {
  selectActiveWorkflowStep,
  selectCanEditStep,
  selectCanGenerateStep,
  selectCanValidateStep,
  selectCurrentNodeImageRef,
  selectDisplayedImageRef,
  selectParentNodeImageRef,
  selectResolvedCurrent
};
