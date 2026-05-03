import { create } from "zustand";
import { frontendPreferencesFile } from "@local-vn/config";
import { persistenceApi } from "@local-vn/story-infrastructure";

interface PersistedFrontendPreferencesSnapshot {
  generateUserAnswerFromLlm?: boolean;
}

interface FrontendPreferencesSnapshot {
  generateUserAnswerFromLlm: boolean;
}

interface FrontendPreferencesState extends FrontendPreferencesSnapshot {
  load(): Promise<void>;
  save(): Promise<void>;
  setGenerateUserAnswerFromLlm(enabled: boolean): void;
}

const defaults: FrontendPreferencesSnapshot = {
  generateUserAnswerFromLlm: false
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
        loaded.generateUserAnswerFromLlm ?? defaults.generateUserAnswerFromLlm
    });
  },
  save: async () => {
    await persistenceApi().writeJson(frontendPreferencesFile(), {
      generateUserAnswerFromLlm: get().generateUserAnswerFromLlm
    });
  },
  setGenerateUserAnswerFromLlm: (enabled) => {
    set({ generateUserAnswerFromLlm: enabled });
    void get().save();
  }
}));
