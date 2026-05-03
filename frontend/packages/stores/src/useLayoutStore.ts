import { create } from "zustand";
import { frontendLayoutFile } from "@local-vn/config";
import { persistenceApi } from "@local-vn/story-infrastructure";

interface PersistedLayoutSnapshot {
  lastOpenedStoryId?: string | null;
}

interface LayoutSnapshot {
  lastOpenedStoryId: string | null;
}

interface LayoutState extends LayoutSnapshot {
  load(): Promise<void>;
  save(): Promise<void>;
  patch(patch: Partial<LayoutSnapshot>): void;
}

const defaults: LayoutSnapshot = {
  lastOpenedStoryId: null
};

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...defaults,
  load: async () => {
    const loaded = await persistenceApi().readJson<PersistedLayoutSnapshot>(
      frontendLayoutFile(),
      defaults
    );
    set({
      lastOpenedStoryId:
        loaded.lastOpenedStoryId ?? defaults.lastOpenedStoryId
    });
  },
  save: async () => {
    const { lastOpenedStoryId } = get();
    await persistenceApi().writeJson(frontendLayoutFile(), { lastOpenedStoryId });
  },
  patch: (patch) => {
    set(patch);
    void get().save();
  }
}));
