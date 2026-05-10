import { createDefaultBackendRuntimeConfig } from "@local-vn/config";
import type { StoryNodeFields } from "@local-vn/story-domain";
import { describe, expect, it, vi } from "vitest";

import {
  generateDanbotStep,
  generateDialogueStep,
  generatePromptStep,
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
    expect(trace.mock.calls[0][0][0].answer).toBe("Assistant: Generated answer.\nUser: Future input");
    expect(resolverTrace).not.toHaveBeenCalled();
  });

  it("builds the prompt from resolver tags, selected tags, DanBot tags, and global defaults", () => {
    const context = createContext(vi.fn(), vi.fn());
    context.config.prompts.default_positive_prompt = "global default";

    const result = generatePromptStep({
      document: {
        ...baseNode(),
        resolverText:
          "The tags that describe the image are: moonlight, blue dress\n======================\nA girl stands in moonlight.",
        selectedTags: "1girl, solo",
        danbotTags: "long hair, blue eyes"
      },
      context
    });

    expect(result.value.positivePrompt).toBe(
      "moonlight, blue dress\n\n1girl, solo\n\nlong hair, blue eyes\n\nglobal default"
    );
  });

  it("keeps DanBot generation scoped to DanBot tags so prompt generation owns prompt composition", async () => {
    const context = createContext(vi.fn(), vi.fn());
    vi.mocked(context.backend.generateDanbotTags).mockResolvedValue({
      prompt: "A girl stands in moonlight.",
      tags: ["long hair", "blue eyes"],
      warnings: [],
      model_path: "danbot-model"
    });

    const result = await generateDanbotStep({
      document: {
        ...baseNode(),
        resolverText:
          "The tags that describe the image are: moonlight\n======================\nA girl stands in moonlight."
      },
      context
    });

    expect(result.value).toEqual({
      danbotTags: "long hair, blue eyes"
    });
  });
});

function createContext(
  onRpLlmTrace: StoryStepGenerationContext["onRpLlmTrace"],
  onResolverTextTrace: StoryStepGenerationContext["onResolverTextTrace"]
): StoryStepGenerationContext {
  return {
    backend: {
      generateLlm: vi.fn(async () => ({
        text: "Assistant: Generated answer.\nUser: Future input",
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
