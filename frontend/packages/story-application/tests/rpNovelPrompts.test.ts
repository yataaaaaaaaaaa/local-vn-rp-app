import { describe, expect, it } from "vitest";

import {
  RP_DIALOGUE_STOP,
  buildAutomaticUserAnswerPromptWithActorNameCache,
  buildRpAnswerPromptWithActorNameCache,
  buildVisualRepresentationPromptWithActorNameCache,
  cleanDialogueOutput,
  cleanUserTextOutput,
  cleanVisualDescriptionOutput
} from "../src/generation/rpNovelPrompts";

async function runHiddenActorNameExtraction(): Promise<string> {
  return JSON.stringify({ playerName: null, npcName: null });
}

async function buildNpcPrompt(
  input: Parameters<typeof buildRpAnswerPromptWithActorNameCache>[0]
): Promise<string> {
  return (
    await buildRpAnswerPromptWithActorNameCache(input, runHiddenActorNameExtraction)
  ).prompt;
}

async function buildUserPrompt(
  input: Parameters<typeof buildAutomaticUserAnswerPromptWithActorNameCache>[0]
): Promise<string> {
  return (
    await buildAutomaticUserAnswerPromptWithActorNameCache(
      input,
      runHiddenActorNameExtraction
    )
  ).prompt;
}

function buildVisualPrompt(
  input: Parameters<typeof buildVisualRepresentationPromptWithActorNameCache>[0]
): Promise<string> {
  return buildVisualRepresentationPromptWithActorNameCache(
    input,
    runHiddenActorNameExtraction
  );
}

describe("RP novel prompts", () => {
  it("uses RP stop sequences without assistant-label hard stops", () => {
    expect(RP_DIALOGUE_STOP).toContain("</s>");
    expect(RP_DIALOGUE_STOP).not.toContain("\nAssistant:");
    expect(RP_DIALOGUE_STOP).not.toContain("\nPrompt:");
  });

  it("keeps character appearance anchors in the visual cue prompt", async () => {
    const prompt = await buildVisualPrompt({
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

  it("tells dialogue generations to keep narration third person and complete", async () => {
    const prompt = await buildNpcPrompt({
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

  it("anchors automatic user text to the latest previous turn", async () => {
    const prompt = await buildUserPrompt({
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

  it("stages current-turn context per generation step", async () => {
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

    const npcPrompt = await buildNpcPrompt({ node: { ...node, dialogue: "" } });
    const visualPrompt = await buildVisualPrompt({ node });

    expect(npcPrompt).toContain("CURRENT_TURN:\nUSER: Take my hand.");
    expect(npcPrompt).not.toContain("NPC_REPLY: Only if you keep up.");
    expect(visualPrompt).toContain("CURRENT_TURN:\nUSER: Take my hand.\nNPC_REPLY: Only if you keep up.");
    expect(visualPrompt).toContain("FULL_STORY_CONTEXT:");
  });






  it("uses hidden RP-LLM coherence selection to produce one TURN_REDIRECT", async () => {
    const coherencePrompts: string[] = [];
    const result = await buildRpAnswerPromptWithActorNameCache(
      {
        node: {
          context: "NPC_PERSONNA: Rei is a cool kuudere. PREVIOUS_TURN:\nUSER: The thunder startled me.\nNPC: I noticed.",
          userText: "You moved before I even looked up.",
          dialogue: "",
          visualDescription: "Rain taps the window.",
          resolverText: "",
          selectedTags: "",
          danbotTags: "",
          positivePrompt: "",
          negativePrompt: "",
          imageRef: ""
        },
        novelty: { coherence_retries: 2, candidate_pool_size: 4 },
        rng: () => 0
      },
      runHiddenActorNameExtraction,
      async (prompt) => {
        coherencePrompts.push(prompt);
        return "YES";
      }
    );

    expect(coherencePrompts.length).toBe(1);
    expect(coherencePrompts[0]).toContain("CANDIDATE_REDIRECT:");
    expect(result.prompt).toContain("TURN_REDIRECT:");
    expect(result.prompt).toContain("RP-LLM coherence accepted");
    expect(result.prompt).toContain("single accepted novelty direction");
  });

  it("injects NPC personna state and personna novelty guidance into final RP prompt", async () => {
    const prompt = await buildNpcPrompt({
      node: {
        context: "NPC_PERSONNA: Rei is a cool kuudere who protects the player from tiny problems. PREVIOUS_TURN:\nUSER: The thunder startled me.",
        userText: "You moved before I even looked up.",
        dialogue: "",
        visualDescription: "Rain runs down the window.",
        resolverText: "",
        selectedTags: "",
        danbotTags: "",
        positivePrompt: "",
        negativePrompt: "",
        imageRef: ""
      }
    });

    expect(prompt).toContain("NPC_PERSONNA_STATE:");
    expect(prompt).toContain("Dere archetype: kuudere");
    expect(prompt).toContain("NPC-personna detail delta:");
    expect(prompt).toContain("NPC-personna constraint:");
    expect(prompt).toContain("Selected personna novelty:");
    expect(prompt).toContain("preserve seed/arc personna dimensions");
  });

  it("injects sex-scene facet state into final RP prompt", async () => {
    const prompt = await buildNpcPrompt({
      node: {
        context: "Both characters are adults in a private bedroom. PREVIOUS_TURN:\nUSER: Stay close.",
        userText: "Only if you keep checking in.",
        dialogue: "",
        visualDescription: "They sit at the edge of the bed under a blanket.",
        resolverText: "",
        selectedTags: "",
        danbotTags: "",
        positivePrompt: "",
        negativePrompt: "",
        imageRef: ""
      }
    });

    expect(prompt).toContain("ROMANTIC_CLICHE_STATE:");
    expect(prompt).toContain("Romantic-cliche detail delta:");
    expect(prompt).toContain("SEX_SCENE_DETAIL_STATE:");
    expect(prompt).toContain("Detail lifetimes:");
    expect(prompt).toContain("independent facets");
    expect(prompt).toContain("Post-history intimacy instruction:");
    expect(prompt).toContain("Sex-scene / novelty bridge:");
    expect(prompt).toContain("Novelty facet targets this turn:");
    expect(prompt).toContain("Intimacy detail delta:");
  });

  it("injects global novelty-control scalars into final RP prompt", async () => {
    const prompt = await buildNpcPrompt({
      node: {
        context: "Darkness is the main NPC. Kazuma is the user/player character.",
        userText: "Do something unexpected, but keep it small.",
        dialogue: "",
        visualDescription: "They stand beside a candlelit table.",
        resolverText: "",
        selectedTags: "",
        danbotTags: "",
        positivePrompt: "",
        negativePrompt: "",
        imageRef: ""
      },
      novelty: {
        level: 0.35,
        agent_influence: 0.25,
        romance_cliche_influence: 0.1,
        npc_personna_influence: 0.2,
        sex_scene_influence: 0.15,
        repetition_guard: 1.8,
        detail_budget: 0.2
      }
    });

    expect(prompt).toContain("Novelty controls:");
    expect(prompt).toContain("level=0.35");
    expect(prompt).toContain("agent_influence=0.25");
    expect(prompt).toContain("Novelty detail budget: stabilize the scene");
  });

  it("uses prompt-manager style memory and post-history novelty instructions", async () => {
    const prompt = await buildNpcPrompt({
      node: {
        context: [
          "INITIAL SETUP: The archive smells of old parchment.",
          "Darkness is the main NPC. Kazuma is the user/player character.",
          "PREVIOUS_TURN:",
          "USER: You remembered the candle?",
          "NPC: Of course I did."
        ].join("\n"),
        userText: "What else did you remember?",
        dialogue: "",
        visualDescription: "Darkness stands beside the candlelit table.",
        resolverText: "The tags that describe the image are: 1girl, candlelight",
        selectedTags: "",
        danbotTags: "",
        positivePrompt: "",
        negativePrompt: "",
        imageRef: ""
      },
      rng: () => 0
    });

    expect(prompt).toContain("PROMPT_MANAGER_LAYOUT:");
    expect(prompt).toContain("WORLD_INFO_BEFORE_HISTORY:");
    expect(prompt).toContain("PROMPT_MEMORY:");
    expect(prompt).toContain("WORLD_INFO_AFTER_HISTORY:");
    expect(prompt).toContain("POST_HISTORY_INSTRUCTIONS:");
    expect(prompt).toContain("ROMANTIC_CLICHE_STATE:");
    expect(prompt).toContain("Relationship delta:");
    expect(prompt).toContain("Freshness rule:");
    expect(prompt).toContain("Romantic-cliche continuity:");
    expect(prompt).toContain("Resolved visual tags: The tags that describe the image are: 1girl, candlelight");
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
