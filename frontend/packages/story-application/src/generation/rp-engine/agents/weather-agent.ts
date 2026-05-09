import { latestMatchingCue } from "./agent-cue-helpers";
import type { AgentContribution, RpAgent } from "./types";

type WeatherId =
  | "unknown"
  | "rain"
  | "snow"
  | "cloudy"
  | "storm"
  | "fog"
  | "wind"
  | "clear";

type WeatherCue = {
  id: WeatherId;
  tags: string[];
  promptView: string;
  pattern: RegExp;
};

type WeatherState = {
  id: WeatherId;
  tags: string[];
  promptView: string;
};

export const WEATHER_AGENT: RpAgent = {
  id: "weather_agent",
  run(input) {
    return createWeatherContribution([
      input.node.context,
      input.node.userText,
      input.node.dialogue,
      input.node.visualDescription
    ].join("\n"));
  }
};

function createWeatherContribution(text: string): AgentContribution {
  const state = extractWeatherState(text);
  const facts: Record<string, string | boolean | string[]> = {
    weather_state: weatherStateToPromptText(state)
  };

  if (state.id !== "unknown") {
    facts.weather = state.id;
  }

  return {
    facts,
    fixedTags: state.tags
  };
}

function extractWeatherState(text: string): WeatherState {
  const match = latestMatchingCue(text, WEATHER_CUES);

  if (!match) {
    return {
      id: "unknown",
      tags: [],
      promptView: "No explicit weather is established. Do not invent weather unless another visual decision requires it."
    };
  }

  return {
    id: match.id,
    tags: match.tags,
    promptView: match.promptView
  };
}

function weatherStateToPromptText(state: WeatherState): string {
  const tags = state.tags.length ? ` Preferred weather tags: ${state.tags.join(", ")}.` : "";
  return `WEATHER_STATE: ${state.promptView}${tags}`;
}

const WEATHER_CUES: WeatherCue[] = [
  {
    id: "storm",
    tags: ["rain", "cloudy sky"],
    promptView: "A storm is present. Preserve stormy, rainy, or dark-cloud continuity when the background is visible.",
    pattern: /\b(?:storm|thunder|lightning|downpour|tempest)\b/i
  },
  {
    id: "rain",
    tags: ["rain"],
    promptView: "Rain is present. Preserve wet surfaces, rain streaks, window rain, or rainy background continuity.",
    pattern: /\b(?:rain|raining|rainy|drizzle|raindrops?|rain-streaked|wet from the rain)\b/i
  },
  {
    id: "snow",
    tags: ["snow"],
    promptView: "Snow is present. Preserve snow, cold air, or snowy background continuity.",
    pattern: /\b(?:snow|snowing|snowy|snowflakes?|blizzard)\b/i
  },
  {
    id: "fog",
    tags: ["fog"],
    promptView: "Fog or mist is present. Preserve low-visibility atmospheric continuity.",
    pattern: /\b(?:fog|foggy|mist|misty|haze|hazy)\b/i
  },
  {
    id: "cloudy",
    tags: ["cloudy sky"],
    promptView: "The sky is cloudy or overcast. Preserve muted daylight or cloud cover if the sky is visible.",
    pattern: /\b(?:cloudy|overcast|gray sky|grey sky|cloud cover)\b/i
  },
  {
    id: "wind",
    tags: [],
    promptView: "Wind is present. It may affect hair, clothing, curtains, leaves, or rain direction, but only if visible.",
    pattern: /\b(?:wind|windy|breeze|gust|draft)\b/i
  },
  {
    id: "clear",
    tags: [],
    promptView: "The weather is clear. Avoid adding rain, snow, fog, or storm effects.",
    pattern: /\b(?:clear sky|clear weather|cloudless|no rain)\b/i
  }
];
