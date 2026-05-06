import { describe, expect, it } from "vitest";

import {
  RP_DIALOGUE_STOP,
  RP_NOVEL_PRESET,
  buildAutomaticUserAnswerPrompt,
  buildRpAnswerPrompt,
  buildVisualRepresentationPrompt,
  cleanDialogueOutput,
  cleanUserTextOutput,
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
    expect(prompt).toContain("Continue from LATEST_PREVIOUS_TURN");
    expect(prompt).toContain("Do not use asterisks");
  });

  it("anchors automatic user text to the latest previous turn", () => {
    const prompt = buildAutomaticUserAnswerPrompt({
      node: {
        context: [
          "INITIAL SETUP: The archive smells of old parchment.",
          "",
          "Darkness is the main NPC. Kazuma is the user/player character.",
          "",
          "PREVIOUS_TURN:",
          "USER: Are you ready?",
          "NPC: I am.",
          "VISUAL_CUE: Darkness stands beside an oak table.",
          "",
          "PREVIOUS_TURN:",
          "USER: What are you waiting for?",
          "NPC: Give me your hand."
        ].join("\n"),
        userText: "",
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

    expect(prompt).toContain("LATEST_PREVIOUS_TURN:");
    expect(prompt).toContain("FULL_STORY_CONTEXT:");
    expect(prompt).toContain("INITIAL SETUP: The archive smells of old parchment.");
    expect(prompt).toContain("NPC: I am.");
    expect(prompt).toContain("VISUAL_CUE: Darkness stands beside an oak table.");
    expect(prompt).toContain("NPC: Give me your hand.");
    expect(prompt).toContain("Continue from LATEST_PREVIOUS_TURN");
    expect(prompt).toContain("current turn has not started yet");
    expect(prompt).toContain("full accumulated story memory");
    expect(prompt).toContain("Do not write first-person prose");
    expect(prompt).not.toContain("CURRENT_TURN:");
    expect(prompt).not.toContain("NPC: I am.\n\nCURRENT_TURN");
  });

  it("stages current-turn context per generation step", () => {
    const node = {
      context: "PREVIOUS_TURN:\nUSER: Are you ready?\nNPC: I am.",
      userText: "Take my hand.",
      dialogue: "Only if you keep up.",
      visualDescription: "",
      resolverText: "",
      selectedTags: "",
      danbotTags: "",
      positivePrompt: "",
      negativePrompt: "",
      imageRef: ""
    };

    const npcPrompt = buildRpAnswerPrompt({ node: { ...node, dialogue: "" } });
    const visualPrompt = buildVisualRepresentationPrompt({ node });

    expect(npcPrompt).toContain("CURRENT_TURN:\nUSER: Take my hand.");
    expect(npcPrompt).not.toContain("NPC_REPLY: Only if you keep up.");
    expect(visualPrompt).toContain("CURRENT_TURN:\nUSER: Take my hand.\nNPC_REPLY: Only if you keep up.");
    expect(visualPrompt).toContain("FULL_STORY_CONTEXT:");
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

  it("cleans automatic user text away from narration and dangling continuations", () => {
    expect(
      cleanUserTextOutput(
        '*The air crackles with tension as I lean closer, my voice dropping to a whisper.* "Are you certain you\'re ready for this, Kazuma? Once we begin, there\'s no'
      )
    ).toBe("Are you certain you're ready for this, Kazuma?");
  });
});
