import { create } from "zustand";

import {
  StorySessionController,
  createStorySessionStoreState,
  selectActiveWorkflowStep,
  selectCanEditStep,
  selectCanGenerateStep,
  selectCanValidateStep,
  selectCurrentWorkflowSnapshot,
  selectResolvedCurrent,
  type StorySessionStoreState
} from "@local-vn/story-mechanism";
import { persistenceApi } from "./persistenceBridge";
import { backendClientOrThrow } from "./useBackendClientStore";
import { useBackendConfigStore } from "./useBackendConfigStore";

export type StorySessionState = StorySessionStoreState;

export const storySessionController = new StorySessionController({
  persistence: () => persistenceApi(),
  backend: () => backendClientOrThrow(),
  getConfig: () => useBackendConfigStore.getState().config
});

export const useStorySessionStore = create<StorySessionState>(() => createStorySessionStoreState(storySessionController));

storySessionController.subscribe((state) => {
  useStorySessionStore.setState(state);
});

export {
  selectActiveWorkflowStep,
  selectCanEditStep,
  selectCanGenerateStep,
  selectCanValidateStep,
  selectResolvedCurrent
};
