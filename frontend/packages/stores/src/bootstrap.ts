import type { LauncherArgs } from "@local-vn/shared-types";
import { useBackendClientStore } from "./useBackendClientStore";
import { useBackendConfigStore } from "./useBackendConfigStore";
import { useLauncherStore } from "./useLauncherStore";
import { useLayoutStore } from "./useLayoutStore";
import { useFrontendPreferencesStore } from "./useFrontendPreferencesStore";
import { useResolverStore } from "./useResolverStore";
import { useRuntimeEventsStore } from "./useRuntimeEventsStore";
import { useStorySessionStore } from "./useStorySessionStore";

let bootstrapped = false;

export async function bootstrapFrontend(): Promise<void> {
  if (bootstrapped) return;
  const args = await readLauncherArgs();
  useLauncherStore.getState().initialize(args);

  await useLayoutStore.getState().load();
  await useFrontendPreferencesStore.getState().load();
  await useBackendConfigStore.getState().load();
  await useResolverStore.getState().load();

  const config = useBackendConfigStore.getState().config;
  useBackendClientStore.getState().setBaseUrl(config.backend.baseUrl);
  void useBackendClientStore.getState().refreshStatus();

  const lastOpenedStoryId = useLayoutStore.getState().lastOpenedStoryId;
  let restored = false;

  if (lastOpenedStoryId) {
    await useStorySessionStore.getState().loadStory(lastOpenedStoryId, {
      resume: false
    });
    restored = useStorySessionStore.getState().storyId === lastOpenedStoryId;
  }

  if (!restored) {
    await useStorySessionStore.getState().createStory("Default Story");
  }

  try {
    useRuntimeEventsStore.getState().connect();
  } catch {
    /* Backend may not be up during frontend-only tests. */
  }

  bootstrapped = true;
}

async function readLauncherArgs(): Promise<LauncherArgs> {
  if (window.launcher?.getArgs) return window.launcher.getArgs();
  return {
    backend: "http://127.0.0.1:17860",
    backendHost: "127.0.0.1",
    backendPort: 17860,
    appRoot: "D:/Anything/storage/local-vn-rp-app-storage",
    storyRoot: "D:/Anything/storage/local-vn-rp-app-storage/stories",
    outputRoot: "D:/Anything/storage/local-vn-rp-app-storage/outputs"
  };
}
