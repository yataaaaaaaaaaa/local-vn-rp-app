import { latestMatchingCue } from "./agent-cue-helpers";
import type { AgentContribution, RpAgent } from "./types";

type TimeOfDayId =
  | "unknown"
  | "dawn"
  | "sunrise"
  | "morning"
  | "day"
  | "noon"
  | "afternoon"
  | "golden_hour"
  | "sunset"
  | "dusk"
  | "twilight"
  | "evening"
  | "night"
  | "midnight";

type TimeOfDayCue = {
  id: TimeOfDayId;
  tag: string;
  promptView: string;
  pattern: RegExp;
};

type TimeOfDayState = {
  id: TimeOfDayId;
  tag: string | null;
  promptView: string;
};

export const TIME_OF_DAY_AGENT: RpAgent = {
  id: "time_of_day_agent",
  run(input) {
    return createTimeOfDayContribution([
      input.node.context,
      input.node.userText,
      input.node.dialogue,
      input.node.visualDescription
    ].join("\n"));
  }
};

function createTimeOfDayContribution(text: string): AgentContribution {
  const state = extractTimeOfDayState(text);
  const facts: Record<string, string | boolean | string[]> = {
    time_of_day_state: timeOfDayStateToPromptText(state)
  };

  if (state.tag) {
    facts.time_of_day = state.tag;
  }

  return {
    facts,
    fixedTags: state.tag ? [state.tag] : []
  };
}

function extractTimeOfDayState(text: string): TimeOfDayState {
  const match = latestMatchingCue(text, TIME_OF_DAY_CUES);

  if (!match) {
    return {
      id: "unknown",
      tag: null,
      promptView: "No explicit time of day is established. Keep time-of-day choices consistent with visible lighting and prior scene memory."
    };
  }

  return {
    id: match.id,
    tag: match.tag,
    promptView: match.promptView
  };
}

function timeOfDayStateToPromptText(state: TimeOfDayState): string {
  const tag = state.tag ? ` Preferred visual tag: ${state.tag}.` : "";
  return `TIME_OF_DAY_STATE: ${state.promptView}${tag}`;
}

const TIME_OF_DAY_CUES: TimeOfDayCue[] = [
  {
    id: "midnight",
    tag: "midnight",
    promptView: "The scene is set at midnight. Favor deep night lighting and avoid daylight cues.",
    pattern: /\b(?:midnight|middle of the night)\b/i
  },
  {
    id: "night",
    tag: "night",
    promptView: "The scene is set at night. Favor night lighting, moonlight, dark sky, or interior low light when appropriate.",
    pattern: /\b(?:night|nighttime|moonlit|moonlight|under the moon|stars?|night sky)\b/i
  },
  {
    id: "evening",
    tag: "evening",
    promptView: "The scene is set in the evening. Favor dimming light, lamps, warm interiors, or late-day atmosphere.",
    pattern: /\b(?:evening|early night|late evening)\b/i
  },
  {
    id: "twilight",
    tag: "twilight",
    promptView: "The scene is set at twilight. Favor blue-purple low light and transitional sky cues.",
    pattern: /\b(?:twilight|blue hour)\b/i
  },
  {
    id: "dusk",
    tag: "dusk",
    promptView: "The scene is set at dusk. Favor fading daylight and early night transition cues.",
    pattern: /\b(?:dusk|nightfall)\b/i
  },
  {
    id: "sunset",
    tag: "sunset",
    promptView: "The scene is set at sunset. Favor sunset sky, warm rim light, and late-day color.",
    pattern: /\b(?:sunset|sundown|setting sun)\b/i
  },
  {
    id: "golden_hour",
    tag: "golden hour",
    promptView: "The scene is set during golden hour. Favor warm low-angle sunlight.",
    pattern: /\b(?:golden hour|late afternoon sun|low golden light)\b/i
  },
  {
    id: "afternoon",
    tag: "afternoon",
    promptView: "The scene is set in the afternoon. Favor clear daytime continuity without morning or night cues.",
    pattern: /\b(?:afternoon|late day)\b/i
  },
  {
    id: "noon",
    tag: "noon",
    promptView: "The scene is set at noon. Favor strong daylight and avoid sunset or night cues.",
    pattern: /\b(?:noon|midday|middle of the day)\b/i
  },
  {
    id: "morning",
    tag: "morning",
    promptView: "The scene is set in the morning. Favor fresh daylight and morning continuity.",
    pattern: /\b(?:morning|early day|breakfast time)\b/i
  },
  {
    id: "sunrise",
    tag: "sunrise",
    promptView: "The scene is set at sunrise. Favor first light and warm horizon cues.",
    pattern: /\b(?:sunrise|rising sun)\b/i
  },
  {
    id: "dawn",
    tag: "dawn",
    promptView: "The scene is set at dawn. Favor soft early light and pre-morning atmosphere.",
    pattern: /\b(?:dawn|daybreak|first light)\b/i
  },
  {
    id: "day",
    tag: "day",
    promptView: "The scene is set during the day. Favor daylight continuity.",
    pattern: /\b(?:daytime|broad daylight|during the day)\b/i
  }
];
