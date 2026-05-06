import { create } from "zustand";
import { frontendPreferencesFile } from "@local-vn/config";
import { persistenceApi } from "@local-vn/story-infrastructure";

interface PersistedFrontendPreferencesSnapshot {
  generateUserAnswerFromLlm?: boolean;
  deferDanbotGeneration?: boolean;
  deferImageGeneration?: boolean;
}

interface FrontendPreferencesSnapshot {
  generateUserAnswerFromLlm: boolean;
  deferDanbotGeneration: boolean;
  deferImageGeneration: boolean;
}

interface FrontendPreferencesState extends FrontendPreferencesSnapshot {
  load(): Promise<void>;
  save(): Promise<void>;
  setGenerateUserAnswerFromLlm(enabled: boolean): void;
  setDeferDanbotGeneration(enabled: boolean): void;
  setDeferImageGeneration(enabled: boolean): void;
}

const defaults: FrontendPreferencesSnapshot = {
  generateUserAnswerFromLlm: false,
  deferDanbotGeneration: false,
  deferImageGeneration: false
};

export const useFrontendPreferencesStore = create<FrontendPreferencesState>((set, get) => ({
  ...defaults,
  load: async () => {
    const loaded = await persistenceApi().readJson<PersistedFrontendPreferencesSnapshot>(
      frontendPreferencesFile(),
      defaults
    );

    set({
      generateUserAnswerFromLlm:
        loaded.generateUserAnswerFromLlm ?? defaults.generateUserAnswerFromLlm,
      deferDanbotGeneration:
        loaded.deferDanbotGeneration ?? defaults.deferDanbotGeneration,
      deferImageGeneration:
        loaded.deferImageGeneration ?? defaults.deferImageGeneration
    });
  },
  save: async () => {
    const {
      generateUserAnswerFromLlm,
      deferDanbotGeneration,
      deferImageGeneration
    } = get();

    await persistenceApi().writeJson(frontendPreferencesFile(), {
      generateUserAnswerFromLlm,
      deferDanbotGeneration,
      deferImageGeneration
    });
  },
  setGenerateUserAnswerFromLlm: (enabled) => {
    set({ generateUserAnswerFromLlm: enabled });
    void get().save();
  },
  setDeferDanbotGeneration: (enabled) => {
    set({ deferDanbotGeneration: enabled });
    void get().save();
  },
  setDeferImageGeneration: (enabled) => {
    set({ deferImageGeneration: enabled });
    void get().save();
  }
}));
