import { describe, expect, it } from "vitest";

import {
  selectClosestAvailableSceneStep,
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

  it("keeps a preferred scene step when the target scene has reached it", () => {
    const workflow = {
      frontierStepId: "image" as const,
      stepStates: {
        context: { status: "validated" },
        userText: { status: "validated" },
        dialogue: { status: "validated" },
        visualDescription: { status: "validated" },
        resolverText: { status: "validated" },
        selectedTags: { status: "validated" },
        danbot: { status: "deferred" },
        prompt: { status: "validated" },
        image: { status: "deferred" }
      }
    };

    expect(selectClosestAvailableSceneStep(workflow, "prompt")).toBe("prompt");
    expect(selectSceneResumeStep(workflow, "prompt")).toBe("prompt");
  });

  it("falls back to the closest available scene step when preferred step is future", () => {
    const workflow = {
      frontierStepId: "dialogue" as const,
      stepStates: {
        context: { status: "validated" },
        userText: { status: "validated" },
        dialogue: { status: "candidate" }
      }
    };

    expect(selectClosestAvailableSceneStep(workflow, "image")).toBe("dialogue");
    expect(selectSceneResumeStep(workflow, "image")).toBe("dialogue");
  });
});
