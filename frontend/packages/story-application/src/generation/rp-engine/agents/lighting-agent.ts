import { latestMatchingCue } from "./agent-cue-helpers";
import type { AgentContribution, RpAgent } from "./types";

type LightingId =
  | "unknown"
  | "moonlight"
  | "sunlight"
  | "golden_hour"
  | "warm_light"
  | "cool_light"
  | "low_light"
  | "neon"
  | "backlighting"
  | "candlelight";

type LightingCue = {
  id: LightingId;
  tags: string[];
  promptView: string;
  pattern: RegExp;
};

type LightingState = {
  id: LightingId;
  tags: string[];
  promptView: string;
};

export const LIGHTING_AGENT: RpAgent = {
  id: "lighting_agent",
  run(input) {
    return createLightingContribution([
      input.node.context,
      input.node.userText,
      input.node.dialogue,
      input.node.visualDescription
    ].join("\n"));
  }
};

function createLightingContribution(text: string): AgentContribution {
  const state = extractLightingState(text);
  const facts: Record<string, string | boolean | string[]> = {
    lighting_state: lightingStateToPromptText(state)
  };

  if (state.id !== "unknown") {
    facts.lighting = state.id;
  }

  return {
    facts,
    fixedTags: state.tags
  };
}

function extractLightingState(text: string): LightingState {
  const match = latestMatchingCue(text, LIGHTING_CUES);

  if (!match) {
    return {
      id: "unknown",
      tags: [],
      promptView: "No explicit lighting is established. Keep lighting consistent with location, time of day, and prior visual cues."
    };
  }

  return {
    id: match.id,
    tags: match.tags,
    promptView: match.promptView
  };
}

function lightingStateToPromptText(state: LightingState): string {
  const tags = state.tags.length ? ` Preferred lighting tags: ${state.tags.join(", ")}.` : "";
  return `LIGHTING_STATE: ${state.promptView}${tags}`;
}

const LIGHTING_CUES: LightingCue[] = [
  {
    id: "moonlight",
    tags: ["moonlight", "low light"],
    promptView: "Moonlight is established. Preserve cool night illumination and avoid daylight lighting.",
    pattern: /\b(?:moonlight|moonlit|silver light|under the moon)\b/i
  },
  {
    id: "candlelight",
    tags: ["warm light", "low light"],
    promptView: "Candlelight is established. Preserve warm low light and close interior atmosphere.",
    pattern: /\b(?:candlelight|candle light|candles?|lantern(?:s)?|lamp glow|firelight)\b/i
  },
  {
    id: "neon",
    tags: ["neon lighting"],
    promptView: "Neon lighting is established. Preserve colored artificial light and urban/night mood when appropriate.",
    pattern: /\b(?:neon|neon-lit|neon light)\b/i
  },
  {
    id: "golden_hour",
    tags: ["golden hour", "warm light"],
    promptView: "Golden-hour lighting is established. Preserve warm low-angle sunlight.",
    pattern: /\b(?:golden hour|golden light|low golden light)\b/i
  },
  {
    id: "sunlight",
    tags: ["sunlight"],
    promptView: "Sunlight is established. Preserve daylight illumination.",
    pattern: /\b(?:sunlight|sunlit|sunbeam|sunbeams|bright sun|dappled sunlight)\b/i
  },
  {
    id: "backlighting",
    tags: ["backlighting"],
    promptView: "Backlighting or rim lighting is established. Preserve strong edge light or silhouette cues.",
    pattern: /\b(?:backlit|backlighting|rim light|silhouette)\b/i
  },
  {
    id: "low_light",
    tags: ["low light"],
    promptView: "Low light is established. Preserve dim lighting without inventing strong daylight.",
    pattern: /\b(?:low light|dim light|dimly lit|dark room|shadowed room)\b/i
  },
  {
    id: "warm_light",
    tags: ["warm light"],
    promptView: "Warm light is established. Preserve warm color temperature in the scene.",
    pattern: /\b(?:warm light|amber light|golden glow|soft orange light)\b/i
  },
  {
    id: "cool_light",
    tags: ["cool light"],
    promptView: "Cool light is established. Preserve cool color temperature in the scene.",
    pattern: /\b(?:cool light|blue light|pale blue light|cold light)\b/i
  }
];
