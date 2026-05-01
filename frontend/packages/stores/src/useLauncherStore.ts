import { create } from "zustand";
import { configureStoragePaths } from "@local-vn/config";
import type { LauncherArgs, StoragePaths } from "@local-vn/shared-types";

interface LauncherState {
  ready: boolean;
  args: LauncherArgs | null;
  storagePaths: StoragePaths | null;
  initialize(args: LauncherArgs): void;
}

export const useLauncherStore = create<LauncherState>((set) => ({
  ready: false,
  args: null,
  storagePaths: null,
  initialize: (args) => {
    const storagePaths = configureStoragePaths({
      project_name: "local-vn-rp-app",
      app_root: args.appRoot,
      story_root: args.storyRoot,
      output_root: args.outputRoot
    });
    set({ ready: true, args, storagePaths });
  }
}));

export function launcherArgsOrThrow(): LauncherArgs {
  const args = useLauncherStore.getState().args;
  if (!args) throw new Error("Launcher arguments are not initialized.");
  return args;
}
