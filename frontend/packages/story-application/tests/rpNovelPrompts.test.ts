import { describe, expect, it } from "vitest";

import {
  RP_DIALOGUE_STOP,
  RP_NOVEL_PRESET,
  buildRpAnswerPrompt,
  buildVisualRepresentationPrompt,
  cleanDialogueOutput,
  cleanVisualDescriptionOutput
} from "../src/generation/rpNovelPrompts";

describe("RP novel prompts", () => {
  it("uses the Mistral RP sampler baseline without assistant-label hard stops", () => {
    expect(RP_NOVEL_PRESET).toMatchObject({
      prompt_format: "mistral_inst",
      temperature: 0.7,
      top_p: 1,
      top_k: 40,
      min_p: 0.05,
      repeat_penalty: 1
    });
    expect(RP_DIALOGUE_STOP).toContain("</s>");
    expect(RP_DIALOGUE_STOP).not.toContain("\nAssistant:");
    expect(RP_DIALOGUE_STOP).not.toContain("\nPrompt:");
  });

  it("keeps character appearance anchors in the visual cue prompt", () => {
    const prompt = buildVisualRepresentationPrompt({
      node: {
        context: [
          "The archive smells of old parchment.",
          "",
          "Darkness is the main NPC partner: a blonde armored woman with blue eyes.",
          "",
          "PREVIOUS_TURN:\nUSER: What are you waiting for?\nNPC: Nothing.\nVISUAL_CUE: 1girl seated at an oak table."
        ].join("\n"),
        userText: "What are you waiting for?",
        dialogue: "Nothing. Give me your hand.",
        visualDescription: "",
        resolverText: "",
        selectedTags: "",
        danbotTags: "",
        positivePrompt: "",
        negativePrompt: "",
        imageRef: ""
      }
    });

    expect(prompt).toContain("blonde armored woman");
    expect(prompt).toContain("1girl seated at an oak table");
    expect(prompt).toContain("infer known visible traits");
  });

  it("tells dialogue generations to keep narration third person and complete", () => {
    const prompt = buildRpAnswerPrompt({
      node: {
        context: "Darkness is the main NPC. Kazuma is the user/player character.",
        userText: "What are you waiting for?",
        dialogue: "",
        visualDescription: "",
        resolverText: "",
        selectedTags: "",
        danbotTags: "",
        positivePrompt: "",
        negativePrompt: "",
        imageRef: ""
      }
    });

    expect(prompt).toContain("NPC spoken dialogue may use first person.");
    expect(prompt).toContain("narration or action prose must be third person");
    expect(prompt).toContain("End with complete terminal punctuation");
    expect(prompt).toContain("Do not use asterisks");
  });

  it("cleans labels after generation instead of relying on brittle hard stops", () => {
    expect(cleanDialogueOutput("Assistant: I am ready.\nUser: future input")).toBe("I am ready.");
    expect(
      cleanDialogueOutput(
        '*Darkness leans closer.* "This is no longer theory. It is'
      )
    ).toBe('Darkness leans closer. "This is no longer theory."');
    expect(
      cleanVisualDescriptionOutput(
        "VISUAL_CUE: 1girl with blonde hair sits at an archive table. Candles and open books surround her. Extra sentence."
      )
    ).toBe(
      "1girl with blonde hair sits at an archive table. Candles and open books surround her."
    );
  });
});
