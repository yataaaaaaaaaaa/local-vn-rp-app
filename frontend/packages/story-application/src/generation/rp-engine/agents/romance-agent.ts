import type { StoryNodeFields } from "@local-vn/story-domain";

import { normalizeContextSnippet, splitSentences } from "../cleaning/text-utils";
import { noveltyPlanFromBeat, selectRomanceBeat, type NoveltyPlanningContext } from "../novelty/novelty-planner";
import { PLAYER_RESPONSE_BEATS } from "../novelty/player-beat-deck";
import { latestPreviousTurnFromContext, previousTurnCount } from "../state/story-context";
import type { AdvancementCard, BeatType, RomancePhase, RpPromptInput } from "../types";
import { promptInputFromAgentRun } from "./agent-run-helpers";
import type { RpAgent } from "./types";

type RomancePromptView = NoveltyPlanningContext & {
  closenessLabel: string;
  phaseLabel: string;
  openHook: string;
};

type ClosenessLevel = {
  level: number;
  label: string;
  description: string;
};

export const ROMANCE_AGENT: RpAgent = {
  id: "romance_agent",
  run(input) {
    const promptInput = promptInputFromAgentRun(input);
    const romance = estimateRomancePromptView(promptInput);

    return {
      facts: {
        romance_state: romancePromptViewToText(romance)
      },
      fixedTags: [],
      promptViews: {
        romance
      },
      novelty: {
        context: romancePromptViewToNoveltyContext(romance)
      }
    };
  }
};

export function selectRomanceAdvancement(input: RpPromptInput, context: NoveltyPlanningContext): AdvancementCard {
  return selectRomanceBeat(input, ROMANCE_BEATS, context);
}

export function selectVisualRomanceAdvancement(input: RpPromptInput, context: NoveltyPlanningContext): AdvancementCard {
  return selectRomanceBeat(input, VISUAL_ROMANCE_BEATS, context);
}

export function getRomanceBeat(id: BeatType): AdvancementCard {
  return (
    ROMANCE_BEATS.find((card) => card.id === id) ??
    PLAYER_RESPONSE_BEATS.find((card) => card.id === id) ??
    VISUAL_ROMANCE_BEATS.find((card) => card.id === id) ??
    ROMANCE_BEATS[0]!
  );
}

export function noveltyPlanForRomanceBeat(
  beat: AdvancementCard,
  context: NoveltyPlanningContext,
  forbiddenFragments: string[]
) {
  return noveltyPlanFromBeat(beat, context, forbiddenFragments);
}

function estimateRomancePromptView(input: RpPromptInput): RomancePromptView {
  const text = [input.node.context, input.node.userText, input.node.dialogue, input.node.visualDescription]
    .join("\n")
    .toLowerCase();
  const turnCount = previousTurnCount(input.node.context || "");
  let closeness = Math.min(10, Math.floor(turnCount / 5));

  const cues: Array<[RegExp, number]> = [
    [/\b(?:stranger|first met|just met|unknown|customer|client)\b/i, 1],
    [/\b(?:smile|tease|joke|banter|compliment|curious|laugh)\b/i, 2],
    [/\b(?:flirt|blush|lingering|closer|chemistry|tension)\b/i, 3],
    [/\b(?:hand|touch|sleeve|shoulder|near|close|leans?|gaze)\b/i, 4],
    [/\b(?:trust|honest|truth|afraid|vulnerable|stay|remembered|promise)\b/i, 5],
    [/\b(?:hold|held|embrace|kiss|near-kiss|almost kiss|come closer)\b/i, 6],
    [/\b(?:confess|confession|want you|desire|love|choose me|stay with me)\b/i, 7],
    [/\b(?:adult|intimate|bed|undress|fade to black|aftercare|consent)\b/i, 8],
    [/\b(?:afterward|morning after|together|commit|forever|goodbye|epilogue)\b/i, 9]
  ];

  for (const [pattern, level] of cues) {
    if (pattern.test(text)) closeness = Math.max(closeness, level);
  }

  if (detectPacingBoundaryCue(text)) {
    closeness = Math.min(closeness, 6);
  }

  closeness = clampInteger(closeness, 0, 10);
  const phase = phaseForCloseness(closeness, turnCount);

  return {
    closeness,
    closenessLabel: closenessLabel(closeness),
    phase,
    phaseLabel: PHASE_LABELS[phase],
    currentTension: inferCurrentTension(text),
    openHook: inferOpenHook(input.node),
    callbackDetail: inferCallbackDetail(input.node),
    boundaryDetected: Boolean(input.boundaryDetected) || detectPacingBoundaryCue(text)
  };
}

function romancePromptViewToText(state: RomancePromptView): string {
  return [
    `phase: ${state.phaseLabel}`,
    `closeness: ${state.closeness} / 10 (${state.closenessLabel})`,
    `current tension: ${state.currentTension}`,
    `open hook: ${state.openHook}`,
    `callback detail: ${state.callbackDetail}`,
    state.boundaryDetected ? "boundary language is present" : "no active boundary detected"
  ].join("\n");
}

function romancePromptViewToNoveltyContext(state: RomancePromptView): NoveltyPlanningContext {
  return {
    closeness: state.closeness,
    phase: state.phase,
    currentTension: state.currentTension,
    callbackDetail: state.callbackDetail,
    boundaryDetected: state.boundaryDetected
  };
}

function phaseForCloseness(closeness: number, turnCount: number): RomancePhase {
  if (closeness >= 9 || turnCount >= 42) return "resolution";
  if (closeness >= 8) return "intimacy";
  if (closeness >= 7) return "threshold";
  if (closeness >= 5) return "trust";
  if (closeness >= 3) return "charge";
  return "spark";
}

function closenessLabel(level: number): string {
  const match = CLOSENESS_LEVELS.find((item) => item.level === level) ?? CLOSENESS_LEVELS[0]!;
  return match.label + " - " + match.description;
}

function inferCurrentTension(text: string): string {
  if (detectPacingBoundaryCue(text)) return "boundary, pace, or consent needs attention";
  if (/\b(?:kiss|want|desire|close|touch|hand|stay)\b/i.test(text)) return "romantic closeness is available but must remain chosen";
  if (/\b(?:truth|honest|afraid|trust|promise|remember)\b/i.test(text)) return "emotional honesty and trust are active";
  if (/\b(?:tease|joke|smile|banter|compliment)\b/i.test(text)) return "playful attraction and subtext are active";
  return "early rapport and curiosity";
}

function detectPacingBoundaryCue(text: string): boolean {
  return /\b(?:stop|halt|wait|pause|no|don't|do not|not comfortable|uncomfortable|slow down|too fast|boundary|not yet|later)\b/i.test(text);
}

function inferOpenHook(node: StoryNodeFields): string {
  const latest = latestPreviousTurnFromContext(node.context || "") || node.dialogue || node.userText || "";
  const normalized = normalizeContextSnippet(latest);

  if (!normalized) return "(none)";

  const sentences = splitSentences(normalized);
  return sentences.at(-1)?.slice(0, 180) || normalized.slice(0, 180);
}

function inferCallbackDetail(node: StoryNodeFields): string {
  const text = [node.context, node.visualDescription]
    .join("\n")
    .replace(/\b(?:the|and|that|with|from|this|there|their|your|hers?|him|she|he|you|they)\b/gi, " ");
  const candidates = [
    ...text.matchAll(/\b(?:ring|ribbon|book|letter|coat|glove|door|window|rain|candle|lantern|table|flower|necklace|sword|cup|scar|mark|promise|joke|name|hand)\b/gi)
  ].map((match) => match[0].toLowerCase());
  const unique = [...new Set(candidates)];

  return unique.slice(-3).join(", ") || "(none)";
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

const CLOSENESS_LEVELS: ClosenessLevel[] = [
  { level: 0, label: "No bond", description: "Strangers, cold start, or purely transactional contact." },
  { level: 1, label: "Awareness", description: "They notice each other; mild curiosity is plausible." },
  { level: 2, label: "Rapport", description: "Basic comfort, early warmth, and light friction are plausible." },
  { level: 3, label: "Flirt signal", description: "Playful tension, ambiguous attraction, and banter are plausible." },
  { level: 4, label: "Mutual charge", description: "Romantic tension is visible, but trust is still limited." },
  { level: 5, label: "Trust opening", description: "Small vulnerability, emotional honesty, or boundary checks are plausible." },
  { level: 6, label: "Chosen closeness", description: "Gentle closeness is plausible if clearly agency-preserving." },
  { level: 7, label: "Romantic threshold", description: "Near-confession, near-kiss, or a direct romantic choice is plausible." },
  { level: 8, label: "Intimate invitation", description: "Adult desire or intimacy invitation is plausible only with clear consent and adult framing." },
  { level: 9, label: "Intimate bond", description: "Adult intimacy, aftermath, aftercare, or deep vulnerability may be plausible if already chosen." },
  { level: 10, label: "Resolution", description: "Commitment, closure, goodbye, promise, or final callback payoff." }
];

const PHASE_LABELS: Record<RomancePhase, string> = {
  spark: "Spark: attention, rapport, light attraction",
  charge: "Charge: chemistry, subtext, romantic tension",
  trust: "Trust test: vulnerability, boundary, meaningful choice",
  threshold: "Threshold: near-confession, invitation, chosen closeness",
  intimacy: "Intimacy: adult consensual escalation or fade-to-black threshold",
  resolution: "Resolution: aftermath, promise, final callback, closure"
};

const ROMANCE_BEATS: AdvancementCard[] = [
  {
    id: "specific_recognition",
    label: "Specific recognition",
    weight: 16,
    minCloseness: 1,
    typicalAfter: 3,
    phases: ["spark", "charge"],
    tags: ["recognition", "attention", "low-intensity"],
    directive:
      "Let the romance partner notice one concrete detail about the player-side character, their words, their choice, or the current scene.",
    constraint:
      "Do not infer the player's private feelings; the recognition must be based on visible words, actions, or context.",
    avoid: "Do not use generic beauty praise; make the observation specific."
  },
  {
    id: "gentle_tease",
    label: "Gentle tease",
    weight: 14,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge"],
    tags: ["flirt", "banter", "chemistry"],
    directive:
      "Use playful friction or teasing that reveals attraction, nervousness, or affection underneath.",
    constraint: "Keep the tease warm; it must not become cruel, humiliating, or scene-derailing.",
    avoid: "Do not repeat smirk/blush banter without a new relationship shift."
  },
  {
    id: "charged_silence",
    label: "Charged silence",
    weight: 12,
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold"],
    tags: ["subtext", "body-language", "tension"],
    directive:
      "Let a pause, gaze, breath, hesitation, or restrained movement make the unspoken tension more important than the spoken words.",
    constraint: "Do not describe the player's internal state or bodily response.",
    avoid: "Do not make silence the whole reply; pair it with one clear next opening."
  },
  {
    id: "callback_intimacy",
    label: "Callback intimacy",
    weight: 18,
    minCloseness: 3,
    typicalAfter: 6,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["callback", "recognition", "trust"],
    directive:
      "Reuse a small earlier phrase, object, gesture, or choice as evidence that the romance partner noticed and remembered.",
    constraint: "The callback must come from FULL_STORY_CONTEXT, LATEST_PREVIOUS_TURN, CURRENT_TURN, or the visible scene.",
    avoid: "Do not invent a fake prior memory."
  },
  {
    id: "emotional_opening",
    label: "Emotional opening",
    weight: 15,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold"],
    tags: ["vulnerability", "truth", "intimacy"],
    directive:
      "Let the romance partner reveal one brief true feeling, insecurity, hope, or fear without fully confessing everything.",
    constraint: "Keep it compact and grounded in the current moment; no long backstory monologue.",
    avoid: "Do not resolve all romantic tension in one speech."
  },
  {
    id: "consent_aware_closeness",
    label: "Consent-aware closeness",
    weight: 14,
    minCloseness: 5,
    typicalAfter: 7,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["consent", "touch", "agency"],
    directive:
      "Create a moment of physical or emotional closeness while clearly leaving the player room to accept, refuse, or redirect.",
    constraint: "Do not assume consent, desire, reciprocation, or bodily reaction from the player.",
    avoid: "Do not make the romance partner pushy, possessive, or entitled."
  },
  {
    id: "soft_reversal",
    label: "Soft reversal",
    weight: 12,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["charge", "trust", "threshold"],
    tags: ["power-shift", "vulnerability", "novelty"],
    directive:
      "Shift the emotional power balance: the confident character falters, the guarded character becomes bold, or teasing turns sincere.",
    constraint: "Make the reversal subtle and believable from the exchange.",
    avoid: "Do not change the character's core personality."
  },
  {
    id: "protective_tenderness",
    label: "Protective tenderness",
    weight: 12,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold"],
    tags: ["care", "action", "trust"],
    directive:
      "Show care through a small concrete action, offered help, or protective positioning instead of a speech.",
    constraint: "The action must preserve player agency and should not decide the player's reaction.",
    avoid: "Avoid possessiveness unless the story explicitly frames it as a flaw."
  },
  {
    id: "honest_question",
    label: "Honest question",
    weight: 10,
    minCloseness: 5,
    typicalAfter: 6,
    phases: ["trust", "threshold"],
    tags: ["choice", "truth", "agency"],
    directive:
      "Ask one direct question that invites emotional truth or choice from the player-side character.",
    constraint: "Ask only one question and do not imply there is a required answer.",
    avoid: "Do not make every reply a question."
  },
  {
    id: "almost_confession",
    label: "Almost-confession",
    weight: 9,
    minCloseness: 6,
    typicalAfter: 7,
    phases: ["threshold"],
    tags: ["confession", "restraint", "tension"],
    directive:
      "Let the romance partner come close to admitting something important, then express it through action, an unfinished sentence, or a safer truth.",
    constraint: "Do not fully resolve the romantic tension yet.",
    avoid: "Do not fake interruptions repeatedly; make the hesitation emotionally grounded."
  },
  {
    id: "partial_confession",
    label: "Partial confession",
    weight: 8,
    minCloseness: 6,
    typicalAfter: 8,
    phases: ["threshold", "intimacy"],
    tags: ["confession", "truth", "desire"],
    directive:
      "State a clear but limited romantic truth: missing them, wanting them near, fearing the moment matters, or choosing honesty.",
    constraint: "Leave the player free to accept, deflect, refuse, or redirect.",
    avoid: "Do not jump directly to permanent commitment unless the scene is at resolution."
  },
  {
    id: "desire_without_pressure",
    label: "Desire without pressure",
    weight: 7,
    minCloseness: 7,
    typicalAfter: 8,
    phases: ["threshold", "intimacy"],
    tags: ["adult", "desire", "consent"],
    directive:
      "Let the romance partner express adult desire or longing clearly while leaving the pace and next step to the player.",
    constraint:
      "All characters must be adults; consent must be clear, ongoing, and unpressured. If the story has not opted into explicit adult mode, keep this sensual or fade-to-black.",
    avoid: "Do not write explicit acts, player bodily reactions, or assumed consent."
  },
  {
    id: "romantic_invitation",
    label: "Romantic invitation",
    weight: 8,
    minCloseness: 6,
    typicalAfter: 8,
    phases: ["threshold", "intimacy"],
    tags: ["choice", "kiss", "invitation"],
    directive:
      "Offer a clear romantic next step: stay, come closer, take a hand, dance, talk honestly, or invite a kiss if earned.",
    constraint: "Frame the invitation so refusal or slowing down remains easy and safe.",
    avoid: "Do not complete the player's acceptance."
  },
  {
    id: "boundary_check",
    label: "Boundary check",
    weight: 10,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["consent", "trust", "agency"],
    directive:
      "Let the romance partner notice the edge of intimacy and give the player a natural way to choose the pace.",
    constraint: "Make it romantic and in-character, not clinical or bureaucratic.",
    avoid: "Do not turn consent into pressure for reassurance."
  },
  {
    id: "repair_and_respect",
    label: "Repair and respect",
    weight: 11,
    minCloseness: 3,
    typicalAfter: 6,
    phases: ["trust", "threshold", "resolution"],
    tags: ["repair", "boundary", "trust"],
    directive:
      "If there is hesitation, refusal, discomfort, or boundary language, slow down, respect it, and create a safer emotional next step.",
    constraint: "Never punish the player for slowing or refusing intimacy.",
    avoid: "Do not make the romance partner sulk, guilt-trip, or push past the boundary."
  },
  {
    id: "final_callback_payoff",
    label: "Final callback payoff",
    weight: 5,
    minCloseness: 7,
    typicalAfter: 10,
    phases: ["resolution"],
    tags: ["ending", "callback", "closure"],
    directive:
      "Use an earlier detail as the emotional payoff for a kiss, promise, goodbye, commitment, or bittersweet closure.",
    constraint: "Only use this if the scene feels near an ending.",
    avoid: "Do not open unrelated new plot threads."
  }
];

const VISUAL_ROMANCE_BEATS: AdvancementCard[] = [
  {
    id: "visual_proximity",
    label: "Visual proximity",
    weight: 14,
    directive:
      "Represent the current romantic tension through distance, orientation, hands, posture, and where each character is looking.",
    constraint: "Do not add new touch, new actions, or new story events not already present.",
    minCloseness: 1,
    typicalAfter: 1,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"]
  },
  {
    id: "visual_expression",
    label: "Visible expression",
    weight: 12,
    directive:
      "Make the current emotional temperature visible through expression, pose, stillness, or restraint.",
    constraint: "Do not describe thoughts, desire, motives, or invisible feelings.",
    minCloseness: 1,
    typicalAfter: 1,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"]
  },
  {
    id: "visual_callback_object",
    label: "Meaningful object callback",
    weight: 10,
    directive:
      "Include a visible object, prop, clothing detail, or setting element already present in the exchange as a romantic visual anchor.",
    constraint: "Do not invent a new symbolic object unless it already exists in context.",
    minCloseness: 2,
    typicalAfter: 2,
    phases: ["charge", "trust", "threshold", "resolution"]
  },
  {
    id: "visual_lighting_mood",
    label: "Lighting and mood",
    weight: 10,
    directive:
      "Use lighting, framing, and setting details to make the current romantic mood legible.",
    constraint: "Keep it literal and image-friendly; no poetic abstraction.",
    minCloseness: 0,
    typicalAfter: 0,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"]
  }
];
