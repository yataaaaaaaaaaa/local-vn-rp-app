import { createDefaultBackendRuntimeConfig } from "@local-vn/config";
import type { StoryNodeFields } from "@local-vn/story-domain";
import { describe, expect, it, vi } from "vitest";

import {
  generateDialogueStep,
  generateUserTextStep,
  generateVisualDescriptionStep,
  type StoryStepGenerationContext
} from "../src/generation/storyStepGenerators";

describe("story step generators", () => {
  it("records RP LLM traces for user, NPC, and visual cue calls only", async () => {
    const trace = vi.fn();
    const resolverTrace = vi.fn();
    const context = createContext(trace, resolverTrace);

    await generateUserTextStep({ document: baseNode(), context });
    await generateDialogueStep({
      document: { ...baseNode(), userText: "Take my hand." },
      context
    });
    await generateVisualDescriptionStep({
      document: {
        ...baseNode(),
        userText: "Take my hand.",
        dialogue: "Only if you keep up."
      },
      context
    });

    expect(trace).toHaveBeenCalledTimes(3);
    expect(trace.mock.calls.map(([entries]) => entries[0].stepId)).toEqual([
      "userText",
      "dialogue",
      "visualDescription"
    ]);
    expect(trace.mock.calls[0][0][0].answer).toBe("Generated answer.");
    expect(resolverTrace).not.toHaveBeenCalled();
  });
});

function createContext(
  onRpLlmTrace: StoryStepGenerationContext["onRpLlmTrace"],
  onResolverTextTrace: StoryStepGenerationContext["onResolverTextTrace"]
): StoryStepGenerationContext {
  return {
    backend: {
      generateLlm: vi.fn(async () => ({
        text: "Generated answer.",
        finish_reason: "stop",
        seed: 1
      })),
      generateDanbotTags: vi.fn(),
      generateImage: vi.fn()
    },
    config: createDefaultBackendRuntimeConfig(),
    storyId: "story-1",
    selectedNodeId: "node-1",
    onResolverTextTrace,
    onRpLlmTrace
  };
}

function baseNode(): StoryNodeFields {
  return {
    context: "PREVIOUS_TURN:\nUSER: Are you ready?\nNPC: I am.",
    userText: "",
    dialogue: "",
    visualDescription: "",
    resolverText: "",
    selectedTags: "",
    danbotTags: "",
    positivePrompt: "",
    negativePrompt: "",
    imageRef: ""
  };
}
