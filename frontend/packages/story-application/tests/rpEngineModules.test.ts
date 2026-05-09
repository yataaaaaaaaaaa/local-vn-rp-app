import { describe, expect, it } from "vitest";

import { renderPromptTemplate } from "../src/generation/rp-engine/prompt/mustache-renderer";
import { extractForbiddenFragments } from "../src/generation/rp-engine/novelty/repetition-guard";
import { selectRomanceBeat, type NoveltyPlanningContext } from "../src/generation/rp-engine/novelty/novelty-planner";
import { PLAYER_RESPONSE_BEATS } from "../src/generation/rp-engine/novelty/player-beat-deck";
import { LIGHTING_AGENT } from "../src/generation/rp-engine/agents/lighting-agent";
import { LOCATION_AGENT } from "../src/generation/rp-engine/agents/location-agent";
import { NPC_CLOTHING_AGENT } from "../src/generation/rp-engine/agents/npc-clothing-agent";
import { ROMANCE_AGENT } from "../src/generation/rp-engine/agents/romance-agent";
import { SEX_SCENE_AGENT } from "../src/generation/rp-engine/agents/sex-scene-agent";
import { TIME_OF_DAY_AGENT } from "../src/generation/rp-engine/agents/time-of-day-agent";
import { USER_CLOTHING_AGENT } from "../src/generation/rp-engine/agents/user-clothing-agent";
import { VISUAL_CUE_AGENT } from "../src/generation/rp-engine/agents/visual-cue-agent";
import { WEATHER_AGENT } from "../src/generation/rp-engine/agents/weather-agent";
import { buildActorNameExtractionPrompt, parseActorNameText } from "../src/generation/rp-engine/tasks/actor-name-extract.task";
import {
  buildNumberedTagChoiceQuestion,
  buildVisualPlannerPrompt,
  cleanOneLineAnswer,
  parseNumberedChoiceAnswer
} from "../src/generation/rp-engine/tasks/visual-planner-question.task";
import type { RpPromptInput } from "../src/generation/rp-engine/types";

const emptyNode: RpPromptInput["node"] = {
  context: "",
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

const trustContext: NoveltyPlanningContext = {
  closeness: 5,
  phase: "trust",
  currentTension: "emotional honesty and trust are active",
  callbackDetail: "(none)",
  boundaryDetected: false
};

describe("RP engine modules", () => {
  it("renders Mustache prompt variables as raw text instead of HTML entities", () => {
    expect(renderPromptTemplate("VALUE: {{value}}", { value: "<raw & visible>" })).toBe("VALUE: <raw & visible>");
  });

  it("extracts repetition guard fragments from recent output text", () => {
    expect(
      extractForbiddenFragments("She looks at the candle and remembers the promise. He waits by the rain-streaked window.")
    ).toContain("She looks at the candle and remembers the");
  });

  it("switches player novelty planning to the boundary-safe beat", () => {
    const beat = selectRomanceBeat(
      {
        node: { ...emptyNode, userText: "Wait, slow down." },
        boundaryDetected: true
      },
      PLAYER_RESPONSE_BEATS,
      trustContext
    );

    expect(beat.id).toBe("player_hold_boundary");
  });

  it("uses the raw line protocol for actor-name extraction", () => {
    const prompt = buildActorNameExtractionPrompt({
      ...emptyNode,
      context: "Kazuma is the player character. Darkness is the main NPC."
    });

    expect(prompt).toContain("PLAYER_NAME: <name or UNKNOWN>");
    expect(prompt).toContain("NPC_NAME: <name or UNKNOWN>");
    expect(prompt).not.toContain("OUTPUT JSON ONLY");
    expect(parseActorNameText("PLAYER_NAME: Kazuma\nNPC_NAME: UNKNOWN")).toEqual({
      playerName: "Kazuma",
      npcName: null
    });
  });

  it("renders visual planner questions through the RP engine task layer", () => {
    const question = buildNumberedTagChoiceQuestion({
      question: "Choose the expression.",
      allowedTags: [{ tag: "neutral expression" }, { tag: "soft smile" }],
      example: "2"
    });
    const prompt = buildVisualPlannerPrompt({
      node: {
        ...emptyNode,
        context: "The archive smells of old parchment.",
        visualDescription: "Darkness stands by an oak table."
      },
      facts: { visible_body_regions: ["face", "hands"] },
      question
    });

    expect(prompt).toContain("KNOWN VISUAL DECISIONS FOR THIS SCENE:");
    expect(prompt).toContain("visible_body_regions: face, hands");
    expect(prompt).toContain("Choose exactly one option by number:");
    expect(parseNumberedChoiceAnswer("Option 2", 2)).toBe(1);
    expect(cleanOneLineAnswer("  2  \nignored")).toBe("2");
  });

  it("uses shared clothing agents for user and NPC undressing state", () => {
    const userContribution = USER_CLOTHING_AGENT.run({
      node: {
      ...emptyNode,
      userText: "I slip off my jacket and loosen my shirt."
      }
    });
    const npcContribution = NPC_CLOTHING_AGENT.run({
      node: {
      ...emptyNode,
      dialogue: "Darkness unbuttons her blouse, leaving one bare shoulder visible."
      }
    });

    expect(userContribution.facts.user_clothing_coverage).toBe("partially_undressed");
    expect(userContribution.facts.user_clothing_change).toBe("undressed");
    expect(userContribution.fixedTags).toContain("open clothes");
    expect(npcContribution.facts.npc_clothing_coverage).toBe("partially_undressed");
    expect(npcContribution.facts.npc_clothing_change).toBe("undressed");
    expect(npcContribution.fixedTags).toContain("bare shoulders");
    expect(npcContribution.facts.npc_clothing_state).toContain("NPC counterpart clothing state");
  });

  it("lets each agent contribute to visual planning through one interface", () => {
    const userContribution = USER_CLOTHING_AGENT.run({
      node: {
      ...emptyNode,
      userText: "I slip off my jacket."
      }
    });
    const sexSceneContribution = SEX_SCENE_AGENT.run({
      node: {
      ...emptyNode,
      dialogue: "They kiss beside the bed."
      }
    });

    expect(userContribution.facts.user_clothing_state).toContain("player-side character clothing state");
    expect(userContribution.fixedTags).toContain("open clothes");
    expect(sexSceneContribution.facts.sex_scene_state).toContain("SEX_SCENE_STATE");
    expect(sexSceneContribution.facts.sex_scene_step).toBe("kissing");
  });

  it("extracts ordered sex-scene steps with consent and boundary handling", () => {
    const activeContribution = SEX_SCENE_AGENT.run({
      node: {
      ...emptyNode,
      context: "Both characters are adults.",
      dialogue: "Only if you want this. We can stop any time.",
      visualDescription: "They kiss on the edge of the bed."
      }
    });
    const boundaryContribution = SEX_SCENE_AGENT.run({
      node: {
      ...emptyNode,
      dialogue: "Wait, slow down. I am not comfortable yet."
      }
    });

    expect(activeContribution.facts.sex_scene_step).toBe("kissing");
    expect(activeContribution.facts.sex_scene_requires_adult_framing).toBe(false);
    expect(activeContribution.facts.sex_scene_state).toContain("consent or pacing language");
    expect(activeContribution.fixedTags).toContain("kiss");
    expect(boundaryContribution.facts.sex_scene_step).toBe("boundary_pause");
    expect(boundaryContribution.facts.sex_scene_state).toContain("pause escalation");
    expect(boundaryContribution.fixedTags).toEqual([]);
  });

  it("extracts scene context agents for time, location, weather, and lighting", () => {
    const node = {
      ...emptyNode,
      context: "The archive windows look over the old city.",
      visualDescription: "At night, rain streaks the glass while candlelight warms the library table."
    };
    const timeContribution = TIME_OF_DAY_AGENT.run({ node });
    const locationContribution = LOCATION_AGENT.run({ node });
    const weatherContribution = WEATHER_AGENT.run({ node });
    const lightingContribution = LIGHTING_AGENT.run({ node });

    expect(timeContribution.facts.time_of_day).toBe("night");
    expect(timeContribution.fixedTags).toContain("night");
    expect(locationContribution.facts.scene_location).toBe("library");
    expect(locationContribution.fixedTags).toContain("indoors");
    expect(weatherContribution.facts.weather).toBe("rain");
    expect(weatherContribution.fixedTags).toContain("rain");
    expect(lightingContribution.facts.lighting).toBe("candlelight");
    expect(lightingContribution.fixedTags).toContain("warm light");
  });

  it("treats romance and visual cue generation as agents", () => {
    const node = {
      ...emptyNode,
      context: "Darkness is the main NPC. Kazuma is the user/player character.",
      userText: "Take my hand.",
      dialogue: "Only if you keep up."
    };
    const romanceContribution = ROMANCE_AGENT.run({
      node,
      forcedNovelty: { boundaryDetected: true }
    });
    const visualCueContribution = VISUAL_CUE_AGENT.run({
      node,
      promptInput: { node },
      actorNames: { playerName: "Kazuma", npcName: "Darkness" },
      forcedNovelty: { advancementCard: "visual_lighting_mood" }
    });

    expect(romanceContribution.facts.romance_state).toContain("phase:");
    expect(romanceContribution.promptViews?.romance).toBeTruthy();
    expect(romanceContribution.novelty?.context?.boundaryDetected).toBe(true);
    expect(visualCueContribution.prompt).toContain("VISUAL_RULES:");
    expect(visualCueContribution.prompt).toContain("CURRENT_TURN:");
    expect(visualCueContribution.novelty?.advancementCard?.id).toBe("visual_lighting_mood");
  });
});
