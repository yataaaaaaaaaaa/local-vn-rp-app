import { create } from "zustand";
import { backendRuntimeConfigFile, createDefaultBackendRuntimeConfig, migrateBackendRuntimeConfig, readBackendRuntimeConfig, writeBackendRuntimeConfig } from "@local-vn/config";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import { launcherArgsOrThrow } from "./useLauncherStore";
import { persistenceApi } from "@local-vn/story-infrastructure";

type BackendConfigSection = "backend" | "llm" | "image" | "danbot";

interface BackendConfigState {
  config: BackendRuntimeConfig;
  dirty: boolean;
  load(): Promise<void>;
  save(): Promise<void>;
  patch(patch: Partial<BackendRuntimeConfig>): void;
  patchSection<K extends BackendConfigSection>(section: K, patch: Partial<BackendRuntimeConfig[K]>): void;
}

export const useBackendConfigStore = create<BackendConfigState>((set, get) => ({
  config: createDefaultBackendRuntimeConfig(),
  dirty: false,
  load: async () => {
    const args = launcherArgsOrThrow();
    const config = await readBackendRuntimeConfig(persistenceApi(), backendRuntimeConfigFile(), {
      baseUrl: args.backend,
      host: args.backendHost,
      port: args.backendPort
    });
    set({ config, dirty: false });
  },
  save: async () => {
    const config = migrateBackendRuntimeConfig(get().config);
    await writeBackendRuntimeConfig(persistenceApi(), backendRuntimeConfigFile(), config);
    set({ config, dirty: false });
  },
  patch: (patch) => set((state) => ({ config: migrateBackendRuntimeConfig({ ...state.config, ...patch }), dirty: true })),
  patchSection: (section, patch) => set((state) => ({
    config: migrateBackendRuntimeConfig({ ...state.config, [section]: { ...(state.config[section] as object), ...patch } }),
    dirty: true
  }))
}));
