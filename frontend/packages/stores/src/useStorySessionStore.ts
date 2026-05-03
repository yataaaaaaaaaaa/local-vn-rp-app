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
  type StorySessionStoreState
} from "@local-vn/story-application";
import {
  selectCurrentWorkflowSnapshot as selectDomainCurrentWorkflowSnapshot
} from "@local-vn/story-domain";
import type { StoryWorkflowSnapshot } from "@local-vn/story-domain";
import {
  loadStoryBundle,
  persistenceApi,
  saveStoryBundle
} from "@local-vn/story-infrastructure";

import { backendClientOrThrow } from "./useBackendClientStore";
import { useBackendConfigStore } from "./useBackendConfigStore";
import { useLayoutStore } from "./useLayoutStore";

export type StorySessionState = StorySessionStoreState;

const storyPersistence: StoryPersistencePort = {
  loadStory: (storyId) => loadStoryBundle(persistenceApi(), storyId),
  saveStory: (bundle) => saveStoryBundle(persistenceApi(), bundle)
};

const storyBackend: StoryGenerationBackend & StoryModelLoadingBackend = {
  generateLlm: (request) => backendClientOrThrow().generateLlm(request),
  generateDanbotTags: (request) =>
    backendClientOrThrow().generateDanbotTags(request),
  generateImage: (request) => backendClientOrThrow().generateImage(request),
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
  }
};

export const storySessionController = new StorySessionController({
  services: {
    persistence: storyPersistence,
    backend: storyBackend,
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

  if (state.storyId && useLayoutStore.getState().selectedStoryId !== state.storyId) {
    useLayoutStore.getState().patch({ selectedStoryId: state.storyId });
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
