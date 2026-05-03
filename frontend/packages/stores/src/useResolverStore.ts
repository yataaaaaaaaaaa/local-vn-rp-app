import { create } from "zustand";
import { extractDanbooruTags, type DanbooruResolverConfig, type DanbooruTagMatch } from "danbooru-tag-resolver";
import { resolverConfigFile } from "@local-vn/config";
import { persistenceApi } from "./persistenceBridge";

interface ResolverResult {
  tags: string[];
  prompt: string;
  warnings: string[];
  matches: DanbooruTagMatch[];
}

interface ResolverState {
  config: DanbooruResolverConfig;
  rawText: string;
  seed: number;
  result: ResolverResult;
  autoApply: boolean;
  load(): Promise<void>;
  save(): Promise<void>;
  setConfig(config: DanbooruResolverConfig): void;
  setRawText(rawText: string): void;
  setSeed(seed: number): void;
  setAutoApply(autoApply: boolean): void;
  resolve(rawText?: string): ResolverResult;
}

const emptyConfig: DanbooruResolverConfig = { schemaVersion: 1, categories: [] };
const emptyResult: ResolverResult = { tags: [], prompt: "", warnings: [], matches: [] };

export const useResolverStore = create<ResolverState>((set, get) => ({
  config: emptyConfig,
  rawText: "",
  seed: 0,
  result: emptyResult,
  autoApply: false,
  load: async () => {
    const config = await persistenceApi().readJson<DanbooruResolverConfig>(resolverConfigFile(), emptyConfig);
    set({ config });
  },
  save: async () => {
    await persistenceApi().writeJson(resolverConfigFile(), get().config);
  },
  setConfig: (config) => {
    set({ config });
    void get().save();
  },
  setRawText: (rawText) => set({ rawText }),
  setSeed: (seed) => set({ seed }),
  setAutoApply: (autoApply) => set({ autoApply }),
  resolve: (rawText) => {
    const state = get();
    const extracted = extractDanbooruTags(state.config, rawText ?? state.rawText, state.seed);
    const result = {
      tags: extracted.tags ?? [],
      prompt: extracted.prompt ?? (extracted.tags ?? []).join(", "),
      warnings: (extracted.warnings ?? []).map((warning) => typeof warning === "string" ? warning : warning.message ?? String(warning)),
      matches: extracted.matches ?? []
    };
    set({ result });
    return result;
  }
}));
