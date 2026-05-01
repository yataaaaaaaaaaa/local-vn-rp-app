import { describe, expect, it } from "vitest";
import { backendRuntimeConfigFile, configureStoragePaths, outputImageFile, storyFile, storyNodeFile, storyStateFile, storyTreeFile } from "@local-vn/config";

describe("launcher storage paths", () => {
  it("builds frontend storage paths from launcher roots", () => {
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
});
