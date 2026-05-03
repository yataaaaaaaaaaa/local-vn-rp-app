import { describe, expect, it } from "vitest";
import { createDefaultBackendRuntimeConfig } from "../src/defaults";
import { migrateBackendRuntimeConfig } from "../src/migration";
import { backendRuntimeConfigFile, configureStoragePaths, outputImageFile, storyFile, storyNodeFile, storyStateFile, storyTreeFile } from "../src/storagePaths";

describe("config package", () => {
  it("default backend runtime config is separated from story state", () => {
    const config = createDefaultBackendRuntimeConfig();
    expect(config.llm.backend).toBe("llama_server");
    expect(config.image.backend).toBe("diffusers");
    expect(config.danbot.backend).toBe("danbot_nl");
    expect(config.prompts.default_negative_prompt).toBe("lowres, bad anatomy");
    expect(config.prompts.default_positive_prompt).toBe("");
    expect("story" in config).toBe(false);
  });

  it("uses launcher-provided storage roots", () => {
    configureStoragePaths({
      project_name: "local-vn-rp-app",
      app_root: "D:/Anything/storage/local-vn-rp-app-storage",
      story_root: "D:/Anything/storage/local-vn-rp-app-storage/stories",
      output_root: "D:/Anything/storage/local-vn-rp-app-storage/outputs"
    });
    expect(backendRuntimeConfigFile()).toBe("D:/Anything/storage/local-vn-rp-app-storage/config/backend.runtime.json");
    expect(storyFile("story_a")).toBe("D:/Anything/storage/local-vn-rp-app-storage/stories/story_a/story.json");
    expect(storyTreeFile("story_a")).toBe("D:/Anything/storage/local-vn-rp-app-storage/stories/story_a/tree.json");
    expect(storyStateFile("story_a")).toBe("D:/Anything/storage/local-vn-rp-app-storage/stories/story_a/zustand.story-state.json");
    expect(storyNodeFile("story_a", "node_1")).toBe("D:/Anything/storage/local-vn-rp-app-storage/stories/story_a/nodes/node_1.json");
    expect(outputImageFile("story_a", "img_42")).toBe("D:/Anything/storage/local-vn-rp-app-storage/outputs/story_a/img_42.png");
  });

  it("migrates backend runtime config", () => {
    const migrated = migrateBackendRuntimeConfig({
      image: { default_steps: 30 },
      prompts: { default_positive_prompt: "cinematic lighting" },
      danbot: { max_tags: 12 }
    });
    expect(migrated.image.default_steps).toBe(30);
    expect(migrated.prompts.default_positive_prompt).toBe("cinematic lighting");
    expect(migrated.danbot.max_tags).toBe(12);
  });
});
