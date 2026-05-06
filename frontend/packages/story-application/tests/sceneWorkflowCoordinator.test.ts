import { describe, expect, it } from "vitest";

import {
  selectSceneResumeStep,
  shouldGenerateOnSceneEntry
} from "../src/workflow/sceneWorkflowCoordinator";

describe("scene workflow coordinator", () => {
  it("treats deferred steps as complete when resuming a scene", () => {
    const workflow = {
      stepStates: {
        context: { status: "validated" },
        userText: { status: "validated" },
        dialogue: { status: "validated" },
        visualDescription: { status: "validated" },
        resolverText: { status: "validated" },
        selectedTags: { status: "validated" },
        danbot: { status: "deferred" },
        prompt: { status: "validated" },
        image: { status: "deferred" },
        nextScene: { status: "validated" }
      }
    };

    expect(selectSceneResumeStep(workflow)).toBe("nextScene");
    expect(shouldGenerateOnSceneEntry(workflow, "danbot")).toBe(false);
    expect(shouldGenerateOnSceneEntry(workflow, "image")).toBe(false);
  });
});
