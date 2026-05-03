import { create } from "zustand";
import type { StoryManifest } from "@local-vn/story-domain";
import {
  listStoryManifests,
  persistenceApi
} from "@local-vn/story-infrastructure";

interface StoryLibraryState {
  stories: StoryManifest[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export const useStoryLibraryStore = create<StoryLibraryState>((set) => ({
  stories: [],
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });

    try {
      set({
        stories: await listStoryManifests(persistenceApi()),
        loading: false,
        error: null
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}));
