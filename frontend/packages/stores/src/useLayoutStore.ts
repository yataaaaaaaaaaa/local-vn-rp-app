import { create } from "zustand";
import { frontendLayoutFile } from "@local-vn/config";
import { persistenceApi } from "@local-vn/story-infrastructure";

interface PersistedLayoutSnapshot {
  selectedStoryId?: string;
}

interface LayoutSnapshot {
  selectedStoryId: string;
}

interface LayoutState extends LayoutSnapshot {
  load(): Promise<void>;
  save(): Promise<void>;
  patch(patch: Partial<LayoutSnapshot>): void;
}

const defaults: LayoutSnapshot = {
  selectedStoryId: "default_story"
};

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...defaults,
  load: async () => {
    const loaded = await persistenceApi().readJson<PersistedLayoutSnapshot>(frontendLayoutFile(), defaults);
    set({
      selectedStoryId: loaded.selectedStoryId ?? defaults.selectedStoryId
    });
  },
  save: async () => {
    const { selectedStoryId } = get();
    await persistenceApi().writeJson(frontendLayoutFile(), { selectedStoryId });
  },
  patch: (patch) => {
    set(patch);
    void get().save();
  }
}));
