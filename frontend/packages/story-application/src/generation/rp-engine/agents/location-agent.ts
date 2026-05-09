import { latestMatchingCue } from "./agent-cue-helpers";
import type { AgentContribution, RpAgent } from "./types";

type LocationId =
  | "unknown"
  | "bedroom"
  | "living_room"
  | "kitchen"
  | "bathroom"
  | "classroom"
  | "library"
  | "office"
  | "street"
  | "city"
  | "park"
  | "forest"
  | "beach"
  | "indoors"
  | "outdoors";

type LocationCue = {
  id: LocationId;
  tag: string;
  promptView: string;
  pattern: RegExp;
  secondaryTags?: string[];
};

type LocationState = {
  id: LocationId;
  tag: string | null;
  promptView: string;
  secondaryTags: string[];
};

export const LOCATION_AGENT: RpAgent = {
  id: "location_agent",
  run(input) {
    return createLocationContribution([
      input.node.context,
      input.node.userText,
      input.node.dialogue,
      input.node.visualDescription
    ].join("\n"));
  }
};

function createLocationContribution(text: string): AgentContribution {
  const state = extractLocationState(text);
  const facts: Record<string, string | boolean | string[]> = {
    scene_location_state: locationStateToPromptText(state)
  };
  const tags = state.tag ? [state.tag, ...state.secondaryTags] : [];

  if (state.tag) {
    facts.scene_location = state.tag;
  }

  return {
    facts,
    fixedTags: tags
  };
}

function extractLocationState(text: string): LocationState {
  const match = latestMatchingCue(text, LOCATION_CUES);

  if (!match) {
    return {
      id: "unknown",
      tag: null,
      promptView: "No explicit scene location is established. Keep the background consistent with prior visual context.",
      secondaryTags: []
    };
  }

  return {
    id: match.id,
    tag: match.tag,
    promptView: match.promptView,
    secondaryTags: match.secondaryTags ?? []
  };
}

function locationStateToPromptText(state: LocationState): string {
  const tag = state.tag ? ` Preferred background tag: ${state.tag}.` : "";
  const extra = state.secondaryTags.length ? ` Supporting tags: ${state.secondaryTags.join(", ")}.` : "";
  return `SCENE_LOCATION_STATE: ${state.promptView}${tag}${extra}`;
}

const LOCATION_CUES: LocationCue[] = [
  {
    id: "bedroom",
    tag: "bedroom",
    promptView: "The scene is in a bedroom. Keep bed, private room, and indoor background continuity available.",
    pattern: /\b(?:bedroom|bed room|on the bed|beside the bed|edge of the bed)\b/i,
    secondaryTags: ["indoors"]
  },
  {
    id: "living_room",
    tag: "living room",
    promptView: "The scene is in a living room or lounge-like interior.",
    pattern: /\b(?:living room|lounge|sofa|couch|sitting room)\b/i,
    secondaryTags: ["indoors"]
  },
  {
    id: "kitchen",
    tag: "kitchen",
    promptView: "The scene is in a kitchen.",
    pattern: /\b(?:kitchen|countertop|stove|sink|tea kettle)\b/i,
    secondaryTags: ["indoors"]
  },
  {
    id: "bathroom",
    tag: "bathroom",
    promptView: "The scene is in a bathroom or bathing space.",
    pattern: /\b(?:bathroom|bath|shower|bathtub|washroom)\b/i,
    secondaryTags: ["indoors"]
  },
  {
    id: "classroom",
    tag: "classroom",
    promptView: "The scene is in a classroom.",
    pattern: /\b(?:classroom|school desk|chalkboard|blackboard|homeroom)\b/i,
    secondaryTags: ["indoors"]
  },
  {
    id: "library",
    tag: "library",
    promptView: "The scene is in a library or archive. Preserve shelves, books, desks, and quiet interior cues.",
    pattern: /\b(?:library|archive|bookshelves?|book shelves?|reading room)\b/i,
    secondaryTags: ["indoors"]
  },
  {
    id: "office",
    tag: "office",
    promptView: "The scene is in an office or study-like workspace.",
    pattern: /\b(?:office|study|desk|workroom)\b/i,
    secondaryTags: ["indoors"]
  },
  {
    id: "street",
    tag: "street",
    promptView: "The scene is on a street. Preserve road, sidewalk, storefront, or city-edge cues when visible.",
    pattern: /\b(?:street|sidewalk|crosswalk|alley|road)\b/i,
    secondaryTags: ["outdoors"]
  },
  {
    id: "city",
    tag: "city",
    promptView: "The scene is in a city environment.",
    pattern: /\b(?:city|downtown|skyscrapers?|neon district|urban)\b/i,
    secondaryTags: ["outdoors"]
  },
  {
    id: "park",
    tag: "park",
    promptView: "The scene is in a park or garden-like outdoor space.",
    pattern: /\b(?:park|garden|bench|fountain|path through the trees)\b/i,
    secondaryTags: ["outdoors"]
  },
  {
    id: "forest",
    tag: "forest",
    promptView: "The scene is in a forest or wooded area.",
    pattern: /\b(?:forest|woods|woodland|among the trees|tree line)\b/i,
    secondaryTags: ["outdoors"]
  },
  {
    id: "beach",
    tag: "beach",
    promptView: "The scene is at a beach or shoreline.",
    pattern: /\b(?:beach|shore|shoreline|ocean|sea breeze|sand)\b/i,
    secondaryTags: ["outdoors"]
  },
  {
    id: "indoors",
    tag: "indoors",
    promptView: "The scene is indoors, but the exact room is not explicit.",
    pattern: /\b(?:indoors|inside|interior|inside the room|inside the house)\b/i
  },
  {
    id: "outdoors",
    tag: "outdoors",
    promptView: "The scene is outdoors, but the exact place is not explicit.",
    pattern: /\b(?:outdoors|outside|open air|outside the house)\b/i
  }
];
