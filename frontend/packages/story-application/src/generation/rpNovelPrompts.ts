import Mustache from "mustache";
import type { StoryNodeFields } from "@local-vn/story-domain";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";

export const RP_NOVEL_PRESET: Partial<BackendRuntimeConfig["llm"]> = {
  prompt_format: "mistral_inst",
  context_size: 8192,
  max_tokens: 90,
  temperature: 0.68,
  top_p: 0.92,
  top_k: 50,
  min_p: 0.05,
  repeat_penalty: 1.14
};

export const RP_NOVEL_STOP = [
  "</s>",
  "\nUser:",
  "\nPlayer:",
  "\n{{user}}:",
  "\nUSER:",
  "\nPLAYER:",
  "\nNPC:",
  "\nNPC_REPLY:",
  "\nVISUAL_CUE:",
  "\nFINAL TASK:",
  "\nOUTPUT:"
];

export const RP_DIALOGUE_STOP = [...RP_NOVEL_STOP];

export type BeatType =
  | "commit"
  | "object_change"
  | "environment_change"
  | "new_information"
  | "new_risk"
  | "forced_choice"
  | "reversible_consequence"
  | "interrupt"
  | "phase_exit"
  | "boundary_pause";

export type AdvancementCard = {
  id: BeatType;
  weight: number;
  directive: string;
};

export type RpActorNames = {
  playerName?: string | null;
  npcName?: string | null;
};

export type RpActorLabels = {
  player: string;
  npc: string;
  Player: string;
  Npc: string;
  playerPossessive: string;
  npcPossessive: string;
};

export type NoveltyAxis =
  | "unused_object"
  | "new_rule"
  | "new_cost"
  | "timer"
  | "blocked_option"
  | "changed_exit"
  | "npc_reveals_constraint"
  | "tool_or_prop"
  | "relationship_leverage"
  | "small_consequence";

export type NoveltyPlan = {
  axis: NoveltyAxis;
  directive: string;
  forbiddenFragments: string[];
};

export type RpPromptBuildResult = {
  prompt: string;
  advancementCard?: AdvancementCard;
  noveltyPlan?: NoveltyPlan;
  actorNames?: RpActorNames | null;
};

export type ActorMetadataCacheResult = {
  cacheKey: string;
  contextHash: string;
  actorNames: RpActorNames | null;
  cacheHit: boolean;
};

export type ActorNameExtractionPromptResult = {
  cacheKey: string;
  contextHash: string;
  cacheHit: boolean;
  actorNames?: RpActorNames | null;
  prompt?: string;
};

export type RpPromptInput = {
  node: StoryNodeFields;
  storyId?: string | null;
  selectedNodeId?: string | null;

  /**
   * Optional external pacing control.
   * Preferred usage: select this outside the LLM, log it, then pass it in.
   */
  advancementCard?: AdvancementCard | BeatType | null;
  recentBeatTypes?: BeatType[];
  boundaryDetected?: boolean;
  rng?: () => number;

  /**
   * Optional metadata.
   * Can be supplied directly, loaded from actor metadata cache,
   * or extracted by a separate hidden LLM prestep.
   */
  actorNames?: RpActorNames | null;
};

type MustacheRenderConfig = {
  escape?: (value: unknown) => string;
};

type PromptTemplateData = {
  user: {
    name: string;
    Name: string;
    possessive: string;
  };
  npc: {
    name: string;
    Name: string;
    possessive: string;
  };
  node: {
    storyContext: string;
    storySetup: string;
    latestPreviousTurn: string;
    recentOutputToAvoid: string;
    previousVisual: string;
    userText: string;
    dialogue: string;
  };
  advancement: AdvancementTemplateData;
  novelty: {
    axis: NoveltyAxis;
    directive: string;
    hasForbiddenFragments: boolean;
    forbiddenFragmentsBlock: string;
  };
};

type AdvancementTemplateData = {
  id: BeatType;
  isCommit: boolean;
  isObjectChange: boolean;
  isEnvironmentChange: boolean;
  isNewInformation: boolean;
  isNewRisk: boolean;
  isForcedChoice: boolean;
  isReversibleConsequence: boolean;
  isInterrupt: boolean;
  isPhaseExit: boolean;
  isBoundaryPause: boolean;
};

export const ADVANCEMENT_DECK: AdvancementCard[] = [
  {
    id: "commit",
    weight: 14,
    directive:
      "Make the acting side commit to a concrete next course: proceed, refuse, redirect, inspect, seal, flee, bargain, wait, or impose a condition."
  },
  {
    id: "object_change",
    weight: 12,
    directive:
      "Change the state of one visible or named object: opened, closed, marked, moved, activated, damaged, revealed, locked, unlocked, taken, placed, used, or consumed."
  },
  {
    id: "environment_change",
    weight: 8,
    directive:
      "Change the local environment in one concrete way: a light changes, a door reacts, a signal appears, a mechanism starts, an exit changes, or the room condition shifts."
  },
  {
    id: "new_information",
    weight: 12,
    directive: "Reveal one new actionable fact that helps decide the next move."
  },
  {
    id: "new_risk",
    weight: 10,
    directive:
      "Introduce one new specific risk, limit, cost, timer, rule, or failure condition."
  },
  {
    id: "forced_choice",
    weight: 12,
    directive:
      "End with a concrete choice between two or three practical next actions."
  },
  {
    id: "reversible_consequence",
    weight: 10,
    directive:
      "Apply one small reversible consequence from the previous action. It changes the situation without resolving the whole scene."
  },
  {
    id: "interrupt",
    weight: 6,
    directive:
      "Interrupt the exchange with one concrete external event: arrival, alarm, message, noise, signal, malfunction, attack, discovery, or reaction."
  },
  {
    id: "phase_exit",
    weight: 8,
    directive:
      "Exit the current micro-phase. Move from setup or negotiation into action, consequence, complication, or decision."
  },
  {
    id: "boundary_pause",
    weight: 0,
    directive:
      "Pause escalation, respect the boundary, and move to a safer concrete next step."
  }
];

const NOVELTY_AXES: Array<{ id: NoveltyAxis; weight: number; directive: string }> = [
  {
    id: "unused_object",
    weight: 12,
    directive:
      "Use a visible or named object that has not been the focus of the last three turns."
  },
  {
    id: "new_rule",
    weight: 10,
    directive:
      "Introduce a concrete rule of the scene, system, threat, relationship, contract, environment, or conflict."
  },
  {
    id: "new_cost",
    weight: 10,
    directive:
      "Attach a specific cost to the next powerful or important action."
  },
  {
    id: "timer",
    weight: 8,
    directive:
      "Add or advance a clear timer, countdown, threshold, deadline, or limited window."
  },
  {
    id: "blocked_option",
    weight: 8,
    directive:
      "Make one obvious option unavailable, unsafe, locked, spent, compromised, or too costly."
  },
  {
    id: "changed_exit",
    weight: 6,
    directive:
      "Change the status of an exit, route, escape path, doorway, threshold, or way forward."
  },
  {
    id: "npc_reveals_constraint",
    weight: 10,
    directive:
      "Have the counterpart reveal one constraint they know or discover."
  },
  {
    id: "tool_or_prop",
    weight: 10,
    directive:
      "Introduce, activate, move, reveal, damage, or consume one useful tool or prop."
  },
  {
    id: "relationship_leverage",
    weight: 5,
    directive:
      "Use trust, rivalry, duty, debt, promise, partnership, authority, or loyalty as a practical constraint."
  },
  {
    id: "small_consequence",
    weight: 12,
    directive:
      "Apply one small concrete consequence from the immediately previous action."
  }
];

/**
 * Static in-process metadata cache.
 *
 * Avoids repeating optional actor-name extraction when the same stable story setup
 * is reused. This cache is local and volatile; it resets when the backend process reloads.
 */
const ACTOR_METADATA_CACHE = new Map<string, ActorMetadataCacheResult>();
const ACTOR_METADATA_CACHE_MAX_ENTRIES = 250;

function renderPromptTemplate(template: string, data: PromptTemplateData): string {
  return (Mustache.render as unknown as (
    template: string,
    view: PromptTemplateData,
    partials?: Record<string, string>,
    config?: MustacheRenderConfig
  ) => string)(template, data, {}, { escape: (value: unknown) => String(value ?? "") });
}

function buildPromptTemplateData(
  input: RpPromptInput,
  advancementCard?: AdvancementCard,
  noveltyPlan?: NoveltyPlan
): PromptTemplateData {
  const labels = resolvedActorLabels(input.actorNames ?? null);
  const selectedAdvancementCard = advancementCard ?? getAdvancementCard("reversible_consequence");
  const selectedNoveltyPlan =
    noveltyPlan ??
    ({
      axis: "small_consequence",
      directive: "Apply one small concrete consequence from the immediately previous action.",
      forbiddenFragments: []
    } satisfies NoveltyPlan);

  return {
    user: {
      name: labels.player,
      Name: labels.Player,
      possessive: labels.playerPossessive
    },
    npc: {
      name: labels.npc,
      Name: labels.Npc,
      possessive: labels.npcPossessive
    },
    node: {
      storyContext: compactStoryContext(input.node.context || "(empty)"),
      storySetup: storySetupFromContext(input.node.context || "(empty)") || "(empty)",
      latestPreviousTurn: latestPreviousTurnFromContext(input.node.context || "") || "(empty)",
      recentOutputToAvoid: recentOutputToAvoidText(input.node),
      previousVisual: lastVisualCueFromContext(input.node.context || "") || "(empty)",
      userText: input.node.userText || "(empty)",
      dialogue: input.node.dialogue || "(empty)"
    },
    advancement: advancementTemplateData(selectedAdvancementCard.id),
    novelty: {
      axis: selectedNoveltyPlan.axis,
      directive: selectedNoveltyPlan.directive,
      hasForbiddenFragments: selectedNoveltyPlan.forbiddenFragments.length > 0,
      forbiddenFragmentsBlock: selectedNoveltyPlan.forbiddenFragments
        .map((fragment) => "  - " + fragment)
        .join("\n")
    }
  };
}

function advancementTemplateData(id: BeatType): AdvancementTemplateData {
  return {
    id,
    isCommit: id === "commit",
    isObjectChange: id === "object_change",
    isEnvironmentChange: id === "environment_change",
    isNewInformation: id === "new_information",
    isNewRisk: id === "new_risk",
    isForcedChoice: id === "forced_choice",
    isReversibleConsequence: id === "reversible_consequence",
    isInterrupt: id === "interrupt",
    isPhaseExit: id === "phase_exit",
    isBoundaryPause: id === "boundary_pause"
  };
}

function rpIdentityInstructionTemplate(): string {
  return [
    "You are a strict visual-novel duo-RP textbox engine.",
    "You write compact VN textbox output, not prose fiction.",
    "Preserve agency for {{user.name}} completely.",
    "Return only the requested output. No headings, labels, notes, JSON, markdown, or explanations."
  ].join("\n");
}

function resolvedActorLabels(actorNames?: RpActorNames | null): RpActorLabels {
  const player = normalizeActorName(actorNames?.playerName) || "the player character";
  const npc = normalizeActorName(actorNames?.npcName) || "the counterpart";

  return {
    player,
    npc,
    Player: sentenceStart(player),
    Npc: sentenceStart(npc),
    playerPossessive: possessive(player),
    npcPossessive: possessive(npc)
  };
}

function sentenceStart(text: string): string {
  if (!text) {
    return text;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function possessive(text: string): string {
  const trimmed = text.trim();

  if (!trimmed) {
    return trimmed;
  }

  return /s$/i.test(trimmed) ? trimmed + "'" : trimmed + "'s";
}

function storyContextBlockTemplate(): string {
  return ["FULL_STORY_CONTEXT:", "{{node.storyContext}}"].join("\n");
}

function currentPlayerTurnBlockTemplate(): string {
  return ["CURRENT_TURN:", "{{user.name}}: {{node.userText}}"].join("\n");
}

function currentResolvedTurnBlockTemplate(): string {
  return [
    "CURRENT_TURN:",
    "{{user.name}}: {{node.userText}}",
    "{{npc.name}}: {{node.dialogue}}"
  ].join("\n");
}

function latestPreviousTurnBlockTemplate(): string {
  return ["LATEST_PREVIOUS_TURN:", "{{node.latestPreviousTurn}}"].join("\n");
}

function previousVisualBlockTemplate(): string {
  return ["PREVIOUS_VISUAL:", "{{node.previousVisual}}"].join("\n");
}

function recentOutputToAvoidBlockTemplate(): string {
  return ["RECENT_OUTPUT_TO_AVOID:", "{{node.recentOutputToAvoid}}"].join("\n");
}

function latestPreviousTurnFromContext(context: string): string {
  const matches = [
    ...context.matchAll(
      /(?:^|\n)PREVIOUS_TURN:\s*([\s\S]*?)(?=\nPREVIOUS_TURN:|\nLATEST_PREVIOUS_TURN:|\nCURRENT_TURN:|\nFINAL TASK:|$)/g
    )
  ];

  return normalizeContextSnippet(matches.at(-1)?.[1] ?? "");
}

function lastVisualCueFromContext(context: string): string {
  const matches = [
    ...context.matchAll(/(?:^|\n)(?:VISUAL_CUE|Visible scene):\s*(.+?)(?=\n[A-Z_ ]+:|\n\n|$)/gis)
  ];

  return normalizeContextSnippet(matches.at(-1)?.[1] ?? "");
}

function recentOutputToAvoidText(node: StoryNodeFields): string {
  const context = node.context || "";
  const turns = [
    ...context.matchAll(
      /(?:^|\n)PREVIOUS_TURN:\s*([\s\S]*?)(?=\nPREVIOUS_TURN:|\nLATEST_PREVIOUS_TURN:|\nCURRENT_TURN:|\nFINAL TASK:|$)/g
    )
  ]
    .map((match) => normalizeContextSnippet(match[1]))
    .filter(Boolean)
    .slice(-3);

  return turns.length ? turns.join("\n") : "(empty)";
}

function counterpartAdvancementDirectiveBlockTemplate(): string {
  return [
    "ADVANCEMENT_DIRECTIVE:",
    "- Selected card: {{advancement.id}}.",
    "{{#advancement.isCommit}}- {{npc.Name}} must make a concrete decision: accept, refuse, redirect, warn, impose a condition, or force a practical next step.{{/advancement.isCommit}}",
    "{{#advancement.isObjectChange}}- {{npc.Name}} must change one visible or named object without controlling {{user.name}}.{{/advancement.isObjectChange}}",
    "{{#advancement.isEnvironmentChange}}- {{npc.possessive}} reply must make the local environment change in one concrete way.{{/advancement.isEnvironmentChange}}",
    "{{#advancement.isNewInformation}}- {{npc.Name}} must reveal one new actionable fact, rule, clue, timer, weakness, or constraint.{{/advancement.isNewInformation}}",
    "{{#advancement.isNewRisk}}- {{npc.Name}} must introduce one specific new risk, cost, timer, limit, rule, or failure condition.{{/advancement.isNewRisk}}",
    "{{#advancement.isForcedChoice}}- {{npc.Name}} must force a practical choice between two or three next actions.{{/advancement.isForcedChoice}}",
    "{{#advancement.isReversibleConsequence}}- {{npc.Name}} must apply one small reversible consequence caused by the previous action.{{/advancement.isReversibleConsequence}}",
    "{{#advancement.isInterrupt}}- {{npc.possessive}} reply must introduce one external interruption that changes what can happen next.{{/advancement.isInterrupt}}",
    "{{#advancement.isPhaseExit}}- {{npc.Name}} must move the scene out of the current beat into action, consequence, complication, or decision.{{/advancement.isPhaseExit}}",
    "{{#advancement.isBoundaryPause}}- {{npc.Name}} must pause escalation and offer a safer concrete next step.{{/advancement.isBoundaryPause}}",
    "- This directive overrides generic pacing preferences.",
    "- The output must create exactly one new concrete story delta.",
    "- Do not repeat a prior signal, object change, environmental change, warning, line of dialogue, or visual cue.",
    "- Do not satisfy this with emotion, hesitation, silence, attraction, fear, or atmosphere.",
    "- Preserve agency for {{user.name}} completely."
  ].join("\n");
}

function playerAdvancementDirectiveBlockTemplate(): string {
  return [
    "ADVANCEMENT_DIRECTIVE:",
    "- Selected card: {{advancement.id}}.",
    "{{#advancement.isCommit}}- {{user.Name}} must choose one concrete executable action, not describe mood, scenery, or {{npc.name}}.{{/advancement.isCommit}}",
    "{{#advancement.isObjectChange}}- {{user.Name}} must command or perform one object-focused action.{{/advancement.isObjectChange}}",
    "{{#advancement.isEnvironmentChange}}- {{user.Name}} must trigger, use, block, inspect, or respond to one environmental feature.{{/advancement.isEnvironmentChange}}",
    "{{#advancement.isNewInformation}}- {{user.Name}} must ask for, test, read, expose, or act on one actionable fact.{{/advancement.isNewInformation}}",
    "{{#advancement.isNewRisk}}- {{user.Name}} must choose an action that accepts, avoids, tests, or redirects a specific risk.{{/advancement.isNewRisk}}",
    "{{#advancement.isForcedChoice}}- {{user.Name}} must choose one practical option from the current situation.{{/advancement.isForcedChoice}}",
    "{{#advancement.isReversibleConsequence}}- {{user.Name}} must react to the latest consequence with one concrete corrective or escalating action.{{/advancement.isReversibleConsequence}}",
    "{{#advancement.isInterrupt}}- {{user.Name}} must respond to the interruption with one concrete command or action.{{/advancement.isInterrupt}}",
    "{{#advancement.isPhaseExit}}- {{user.Name}} must stop setup or description and choose the next concrete action.{{/advancement.isPhaseExit}}",
    "{{#advancement.isBoundaryPause}}- {{user.Name}} must set or maintain a boundary with a concrete safe instruction.{{/advancement.isBoundaryPause}}",
    "- This directive overrides generic pacing preferences.",
    "- The output must create exactly one new concrete story delta.",
    "- Do not repeat a prior signal, object change, environmental change, warning, line of dialogue, or visual cue.",
    "- Do not satisfy this with emotion, hesitation, silence, attraction, fear, or atmosphere.",
    "- Preserve agency for {{user.name}} completely."
  ].join("\n");
}

function counterpartNoveltyRequestBlockTemplate(): string {
  return [
    "INTERNAL_NOVELTY_REQUEST:",
    "- This block is for generation control only. Do not mention it.",
    "- Novelty axis: {{novelty.axis}}.",
    "- {{novelty.directive}}",
    "- The output must add one durable new fact that future turns can refer to.",
    "- The output must not merely reword a recent event.",
    "- If an object, signal, warning, obstacle, route, mechanism, or line already changed recently, advance to its consequence instead of repeating it.",
    "- {{npc.Name}} may speak, but speech alone is not enough unless it creates a new obligation, choice, rule, refusal, or state change.",
    "{{#novelty.hasForbiddenFragments}}- Forbidden recent fragments:\n{{novelty.forbiddenFragmentsBlock}}{{/novelty.hasForbiddenFragments}}"
  ].join("\n");
}

function playerNoveltyRequestBlockTemplate(): string {
  return [
    "INTERNAL_NOVELTY_REQUEST:",
    "- This block is for generation control only. Do not mention it.",
    "- Novelty axis: {{novelty.axis}}.",
    "- {{novelty.directive}}",
    "- The output must add one durable new fact that future turns can refer to.",
    "- The output must not merely reword a recent event.",
    "- If an object, signal, warning, obstacle, route, mechanism, or line already changed recently, advance to its consequence instead of repeating it.",
    "- USER_REPLY must be a command/action by {{user.name}}, not scene narration.",
    "{{#novelty.hasForbiddenFragments}}- Forbidden recent fragments:\n{{novelty.forbiddenFragmentsBlock}}{{/novelty.hasForbiddenFragments}}"
  ].join("\n");
}

function actorMetadataBlockTemplate(): string {
  return [
    "ACTOR_REFERENCE:",
    "- Player-side character reference: {{user.name}}.",
    "- Counterpart reference: {{npc.name}}.",
    "- Use these references in natural-language instructions and generated prose when appropriate.",
    "- Keep role boundaries unchanged.",
    "- Do not invent additional character names.",
    "- Keep structural labels such as USER_REPLY, NPC_REPLY, and VISUAL_CUE unchanged."
  ].join("\n");
}

function counterpartExampleBlockTemplate(): string[] {
  return [
    "BAD COUNTERPART_REPLY EXAMPLES:",
    "The air between us feels charged.",
    "\"What should we do?\"",
    "\"Do it!\"",
    "{{npc.Name}} repeats the same object change again.",
    "",
    "GOOD COUNTERPART_REPLY EXAMPLES:",
    "\"No.\" {{npc.Name}} locks the box with a metal clasp.",
    "\"Use the circle, not the door.\" {{npc.Name}} marks the safe symbol.",
    "\"Too late for that option.\" The second marker turns black.",
    "\"Choose now: seal it, read it, or run.\""
  ];
}

function playerExampleBlockTemplate(): string[] {
  return [
    "BAD USER_REPLY EXAMPLES:",
    "{{npc.possessive}} gaze locks onto mine.",
    "The room lights flicker.",
    "The stone breaks under my foot.",
    "My gaze lingers on your face.",
    "I lean closer.",
    "The air feels tense.",
    "",
    "GOOD USER_REPLY EXAMPLES:",
    "Seal the breach.",
    "Use the safer option.",
    "Read the next line aloud.",
    "Mark the safe symbol.",
    "Stop. Stabilize this first.",
    "Take the key.",
    "Refuse the link.",
    "Ask what changed.",
    "Choose the left route.",
    "Close the door."
  ];
}

function generalRuleBlockTemplate(): string {
  return [
    "GENERAL_RULE:",
    "- Output one or two VN textbox sentences only.",
    "- Prefer spoken dialogue.",
    "- Do not ask another clarification if action is possible.",
    "- If the prior turn negotiated, this turn must decide, activate, reveal, impose, or force a choice.",
    "- Avoid repeated wording from recent turns."
  ].join("\n");
}

function compactStoryContext(context: string): string {
  const trimmed = context.trim();

  if (!trimmed || trimmed === "(empty)") {
    return "(empty)";
  }

  const setup = storySetupFromContext(trimmed);
  const previousTurns = [
    ...trimmed.matchAll(
      /(?:^|\n)PREVIOUS_TURN:\s*([\s\S]*?)(?=\nPREVIOUS_TURN:|\nLATEST_PREVIOUS_TURN:|\nCURRENT_TURN:|\nFINAL TASK:|$)/g
    )
  ]
    .map((match) => normalizeContextSnippet(match[1]))
    .filter(Boolean);

  return [
    setup,
    ...previousTurns.slice(-3).map((turn) => "PREVIOUS_TURN:\n" + turn)
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function storySetupFromContext(context: string): string {
  return normalizeContextSnippet(context.split(/\nPREVIOUS_TURN:/)[0]?.trim() ?? "");
}

function normalizeContextSnippet(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function selectAdvancementCard(input: RpPromptInput): AdvancementCard {
  if (input.boundaryDetected || detectBoundary(input.node.userText || "")) {
    return getAdvancementCard("boundary_pause");
  }

  if (input.advancementCard) {
    return typeof input.advancementCard === "string"
      ? getAdvancementCard(input.advancementCard)
      : input.advancementCard;
  }

  const recent = new Set(input.recentBeatTypes?.slice(-3) ?? []);
  const candidates = ADVANCEMENT_DECK.filter(
    (card) => card.id !== "boundary_pause" && !recent.has(card.id)
  );

  return weightedPick(
    candidates.length ? candidates : ADVANCEMENT_DECK.filter((card) => card.id !== "boundary_pause"),
    input.rng
  );
}

function selectNoveltyPlan(input: RpPromptInput): NoveltyPlan {
  const recentText = recentOutputsFromNode(input.node).join("\n");
  const forbiddenFragments = extractForbiddenFragments(recentText);
  const axis = weightedPick(NOVELTY_AXES, input.rng);

  return {
    axis: axis.id,
    directive: axis.directive,
    forbiddenFragments
  };
}

function recentOutputsFromNode(node: StoryNodeFields): string[] {
  const context = node.context || "";

  return [
    ...context.matchAll(
      /(?:USER|NPC|NPC_REPLY|VISUAL_CUE):\s*(.+?)(?=\n(?:USER|NPC|NPC_REPLY|VISUAL_CUE|PREVIOUS_TURN|LATEST_PREVIOUS_TURN|CURRENT_TURN):|$)/gis
    )
  ]
    .map((match) => normalizeContextSnippet(match[1]))
    .filter(Boolean)
    .slice(-12);
}

function extractForbiddenFragments(text: string): string[] {
  const sentences = text
    .split(/[.!?]\s+|\n+/)
    .map((part) => normalizeContextSnippet(part))
    .filter((part) => part.length >= 18)
    .slice(-10);

  const fragments = new Set<string>();

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);

    if (words.length <= 8) {
      fragments.add(sentence);
      continue;
    }

    fragments.add(words.slice(0, 8).join(" "));
    fragments.add(words.slice(-8).join(" "));
  }

  return [...fragments].slice(-12);
}

function getAdvancementCard(id: BeatType): AdvancementCard {
  return ADVANCEMENT_DECK.find((card) => card.id === id) ?? ADVANCEMENT_DECK[0];
}

function weightedPick<T extends { weight: number }>(items: T[], rng = Math.random): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;

  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) {
      return item;
    }
  }

  return items.at(-1)!;
}

function detectBoundary(text: string): boolean {
  return /\b(?:stop|halt|wait|pause|no|don't|do not|not comfortable|uncomfortable|slow down|boundary)\b/i.test(text);
}

function layoutCounterpartAnswerPromptTemplate(): string {
  return [
    rpIdentityInstructionTemplate(),
    "",
    generalRuleBlockTemplate(),
    "",
    "RULES:",
    "- Output one or two VN textbox sentences only.",
    "- Maximum 45 words.",
    "- Prefer spoken dialogue.",
    "- Include exactly one concrete state change.",
    "- Dialogue alone is insufficient unless the spoken line creates a clear new obligation, choice, rule, refusal, or state change.",
    "- Do not repeat recent wording, prior object changes, prior alarms/signals, prior warnings, or prior visual cues.",
    "- Preserve agency for {{user.name}}; do not narrate {{user.name}} acting, deciding, feeling, or speaking.",
    "",
    ...counterpartExampleBlockTemplate(),
    "",
    actorMetadataBlockTemplate(),
    "",
    storyContextBlockTemplate(),
    "",
    latestPreviousTurnBlockTemplate(),
    "",
    recentOutputToAvoidBlockTemplate(),
    "",
    counterpartNoveltyRequestBlockTemplate(),
    "",
    counterpartAdvancementDirectiveBlockTemplate(),
    "",
    currentPlayerTurnBlockTemplate(),
    "",
    "FINAL TASK:",
    "Write only the next textbox reply for {{npc.name}}.",
    "",
    "OUTPUT ONLY THAT TEXT BELOW:"
  ].join("\n");
}

export function buildRpAnswerPromptWithMetadata(input: RpPromptInput): RpPromptBuildResult {
  const advancementCard = selectAdvancementCard(input);
  const noveltyPlan = selectNoveltyPlan(input);
  const template = layoutCounterpartAnswerPromptTemplate();
  const data = buildPromptTemplateData(input, advancementCard, noveltyPlan);

  return {
    advancementCard,
    noveltyPlan,
    actorNames: input.actorNames ?? null,
    prompt: renderPromptTemplate(template, data)
  };
}

export function buildRpAnswerPrompt(input: RpPromptInput): string {
  return buildRpAnswerPromptWithMetadata(input).prompt;
}

function layoutVisualRepresentationPromptTemplate(): string {
  return [
    "You write simple literal visual cues for anime image tagging.",
    "",
    "RULES:",
    "- Output VISUAL_CUE only.",
    "- One or two short sentences.",
    "- Maximum 35 words.",
    "- Literal visible facts only.",
    "- Mention character count, pose, clothing, setting, props, and lighting when visible.",
    "- Preserve stable character identity and appearance from FULL_STORY_CONTEXT.",
    "- Use CURRENT_TURN as the newest visible state.",
    "- Use {{user.name}} and {{npc.name}} as visual references when names are known.",
    "- Do not include dialogue, thoughts, feelings, motives, desire, narration labels, markdown, or explanations.",
    "",
    "BAD VISUAL_CUE EXAMPLES:",
    "Her pupils dilated with fear and something darker.",
    "The air feels charged with primal tension.",
    "Her voice wavers slightly as she repeats the words.",
    "The gown strains against her heaving chest.",
    "",
    "GOOD VISUAL_CUE EXAMPLES:",
    "Two characters stand beside an oak table under lantern light, with open books and loose notes between them.",
    "{{npc.Name}} points to a glowing mark above the open book, sleeves pushed back under flickering lantern light.",
    "",
    actorMetadataBlockTemplate(),
    "",
    storyContextBlockTemplate(),
    "",
    previousVisualBlockTemplate(),
    "",
    currentResolvedTurnBlockTemplate(),
    "",
    "FINAL TASK:",
    "Write the literal VISUAL_CUE only.",
    "",
    "OUTPUT ONLY THE VISUAL_CUE TEXT BELOW:"
  ].join("\n");
}

export function buildVisualRepresentationPrompt(input: RpPromptInput): string {
  const template = layoutVisualRepresentationPromptTemplate();
  const data = buildPromptTemplateData(input);

  return renderPromptTemplate(template, data);
}

function layoutAutomaticPlayerAnswerPromptTemplate(): string {
  return [
    rpIdentityInstructionTemplate(),
    "",
    generalRuleBlockTemplate(),
    "",
    "RULES:",
    "- Output USER_REPLY only.",
    "- Write as {{user.name}} choosing the next command, spoken line, or direct action.",
    "- Prefer short imperative action: verb + object.",
    "- Do not describe {{npc.name}}, the room, lighting, sounds, facial expressions, body language, or atmosphere.",
    "- Do not repeat prior USER_REPLY, counterpart reply, or VISUAL_CUE text.",
    "- Spoken dialogue must be bare text without quotation marks.",
    "",
    ...playerExampleBlockTemplate(),
    "",
    actorMetadataBlockTemplate(),
    "",
    storyContextBlockTemplate(),
    "",
    latestPreviousTurnBlockTemplate(),
    "",
    recentOutputToAvoidBlockTemplate(),
    "",
    playerNoveltyRequestBlockTemplate(),
    "",
    playerAdvancementDirectiveBlockTemplate(),
    "",
    "FINAL TASK:",
    "Write only the next textbox reply for {{user.name}}.",
    "",
    "OUTPUT ONLY THAT TEXT BELOW:"
  ].join("\n");
}

export function buildAutomaticUserAnswerPromptWithMetadata(input: RpPromptInput): RpPromptBuildResult {
  const advancementCard = selectAdvancementCard(input);
  const noveltyPlan = selectNoveltyPlan(input);
  const template = layoutAutomaticPlayerAnswerPromptTemplate();
  const data = buildPromptTemplateData(input, advancementCard, noveltyPlan);

  return {
    advancementCard,
    noveltyPlan,
    actorNames: input.actorNames ?? null,
    prompt: renderPromptTemplate(template, data)
  };
}

export function buildAutomaticUserAnswerPrompt(input: RpPromptInput): string {
  return buildAutomaticUserAnswerPromptWithMetadata(input).prompt;
}

/**
 * Optional hidden prestep.
 *
 * Usage:
 * 1. Call buildActorNameExtractionPromptWithCache(input).
 * 2. If cacheHit is true, reuse actorNames and skip the LLM call.
 * 3. If prompt is returned, call the LLM with that prompt.
 * 4. Parse with parseActorNameExtractionOutput(raw).
 * 5. Store with rememberActorNamesForPrompt(input, parsed).
 * 6. Pass actorNames into normal prompt builders.
 */
export function buildActorNameExtractionPromptWithCache(
  input: RpPromptInput
): ActorNameExtractionPromptResult {
  const cached = getCachedActorNamesForPrompt(input);

  if (cached.cacheHit) {
    return {
      cacheKey: cached.cacheKey,
      contextHash: cached.contextHash,
      cacheHit: true,
      actorNames: cached.actorNames
    };
  }

  return {
    cacheKey: cached.cacheKey,
    contextHash: cached.contextHash,
    cacheHit: false,
    prompt: buildActorNameExtractionPrompt(input.node)
  };
}

function layoutActorNameExtractionPromptTemplate(): string {
  return [
    "Extract actor names from the RP context.",
    "Return compact JSON only.",
    "If uncertain, use null.",
    "",
    "Schema:",
    "{ \"playerName\": string | null, \"npcName\": string | null }",
    "",
    "Rules:",
    "- playerName is the controlled/player-side character.",
    "- npcName is the main counterpart currently interacting with the player-side character.",
    "- Do not infer names unless the context clearly assigns roles.",
    "- Do not include titles, descriptions, or extra fields.",
    "",
    "STABLE_STORY_SETUP:",
    "{{node.storySetup}}",
    "",
    "OUTPUT JSON ONLY:"
  ].join("\n");
}

export function buildActorNameExtractionPrompt(node: StoryNodeFields): string {
  const template = layoutActorNameExtractionPromptTemplate();
  const data = buildPromptTemplateData({ node, actorNames: null });

  return renderPromptTemplate(template, data);
}

export function parseActorNameExtractionOutput(raw: string): RpActorNames | null {
  const cleaned = stripProtocolNoise(raw)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<RpActorNames>;

    return normalizeActorNames({
      playerName: typeof parsed.playerName === "string" ? parsed.playerName : null,
      npcName: typeof parsed.npcName === "string" ? parsed.npcName : null
    });
  } catch {
    return null;
  }
}

export function getCachedActorNamesForPrompt(input: RpPromptInput): ActorMetadataCacheResult {
  const { cacheKey, contextHash } = actorMetadataCacheKey(input);
  const cached = ACTOR_METADATA_CACHE.get(cacheKey);

  if (cached && cached.contextHash === contextHash) {
    return {
      cacheKey,
      contextHash,
      actorNames: cached.actorNames,
      cacheHit: true
    };
  }

  return {
    cacheKey,
    contextHash,
    actorNames: null,
    cacheHit: false
  };
}

export function rememberActorNamesForPrompt(
  input: RpPromptInput,
  actorNames: RpActorNames | null
): ActorMetadataCacheResult {
  const { cacheKey, contextHash } = actorMetadataCacheKey(input);
  const normalized = normalizeActorNames(actorNames ?? {});

  const result: ActorMetadataCacheResult = {
    cacheKey,
    contextHash,
    actorNames: normalized,
    cacheHit: true
  };

  ACTOR_METADATA_CACHE.set(cacheKey, result);
  trimActorMetadataCache();

  return result;
}

export function clearActorMetadataCache(): void {
  ACTOR_METADATA_CACHE.clear();
}

export function actorMetadataCacheSize(): number {
  return ACTOR_METADATA_CACHE.size;
}

function actorMetadataCacheKey(input: RpPromptInput): { cacheKey: string; contextHash: string } {
  const stableSetup = storySetupFromContext(input.node.context || "");
  const contextHash = stableHash(stableSetup || "(empty)");
  const storyPart = input.storyId?.trim() || "unknown-story";

  return {
    contextHash,
    cacheKey: storyPart + ":" + contextHash
  };
}

function normalizeActorNames(actorNames: RpActorNames): RpActorNames {
  return {
    playerName: normalizeActorName(actorNames.playerName),
    npcName: normalizeActorName(actorNames.npcName)
  };
}

function normalizeActorName(name: string | null | undefined): string | null {
  const cleaned = (name ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();

  if (!cleaned || cleaned.toLowerCase() === "null" || cleaned.toLowerCase() === "unknown") {
    return null;
  }

  return cleaned.slice(0, 80);
}

function trimActorMetadataCache(): void {
  while (ACTOR_METADATA_CACHE.size > ACTOR_METADATA_CACHE_MAX_ENTRIES) {
    const firstKey = ACTOR_METADATA_CACHE.keys().next().value as string | undefined;

    if (!firstKey) {
      return;
    }

    ACTOR_METADATA_CACHE.delete(firstKey);
  }
}

/**
 * Small stable non-cryptographic hash.
 * Good enough for cache keys; not for security.
 */
function stableHash(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

export type AdvancementVerificationResult = {
  ok: boolean;
  reason?:
  | "empty_output"
  | "near_repeat"
  | "player_control"
  | "pure_emotion"
  | "missing_forced_choice"
  | "missing_risk"
  | "weak_novelty";
};

export function verifyAdvancementOutput(
  output: string,
  card: AdvancementCard,
  recentOutputs: string[] = []
): AdvancementVerificationResult {
  const trimmed = output.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty_output" };
  }

  if (isNearRepeat(trimmed, recentOutputs)) {
    return { ok: false, reason: "near_repeat" };
  }

  if (/\b(?:you|the player|player character)\s+(?:say|said|cast|move|touch|decide|feel|think|agree|begin)\b/i.test(trimmed)) {
    return { ok: false, reason: "player_control" };
  }

  if (isPureEmotion(trimmed)) {
    return { ok: false, reason: "pure_emotion" };
  }

  if (card.id === "forced_choice" && !/\b(?:choose|choice|either|or|which|continue|stop|left|right|first|second|third)\b/i.test(trimmed)) {
    return { ok: false, reason: "missing_forced_choice" };
  }

  if (card.id === "new_risk" && !/\b(?:risk|cost|limit|timer|before|unless|fail|danger|condition|rule|consequence|deadline|price|lose|loss)\b/i.test(trimmed)) {
    return { ok: false, reason: "missing_risk" };
  }

  if (!hasConcreteProgressionCue(trimmed)) {
    return { ok: false, reason: "weak_novelty" };
  }

  return { ok: true };
}

function isNearRepeat(output: string, recentOutputs: string[]): boolean {
  const normalizedOutput = normalizeForSimilarity(output);

  if (normalizedOutput.length < 18) {
    return false;
  }

  const recent = recentOutputs
    .slice(-8)
    .map(normalizeForSimilarity)
    .filter(Boolean);

  return recent.some((item) => {
    if (item.includes(normalizedOutput) || normalizedOutput.includes(item)) {
      return true;
    }

    return jaccardWords(normalizedOutput, item) >= 0.72;
  });
}

function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/[^a-z0-9à-ÿ\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardWords(a: string, b: string): number {
  const aWords = new Set(a.split(/\s+/).filter((word) => word.length > 2));
  const bWords = new Set(b.split(/\s+/).filter((word) => word.length > 2));

  if (!aWords.size || !bWords.size) {
    return 0;
  }

  let intersection = 0;

  for (const word of aWords) {
    if (bWords.has(word)) {
      intersection += 1;
    }
  }

  return intersection / new Set([...aWords, ...bWords]).size;
}

function hasConcreteProgressionCue(text: string): boolean {
  return /\b(?:opens?|closes?|locks?|unlocks?|marks?|moves?|takes?|places?|activates?|reveals?|breaks?|shatters?|cracks?|changes?|turns?|starts?|stops?|fails?|chooses?|refuses?|accepts?|warns?|offers?|points?|hands?|sets?|burns?|glows?|darkens?|appears?|vanishes?|seals?|cuts?|blocks?|forces?|requires?|costs?|uses?|consumes?|gives?|shows?|removes?|adds?|unless|before|after|now|choose|either|or)\b/i.test(text);
}

function isPureEmotion(text: string): boolean {
  const lower = text.toLowerCase();

  const emotionWords = [
    "hesitates",
    "trembles",
    "blushes",
    "stares",
    "breathes",
    "swallows",
    "nervous",
    "afraid",
    "silent",
    "quiet",
    "tension",
    "longing"
  ];

  const stateChangeWords = [
    "opens",
    "closes",
    "marks",
    "activates",
    "reveals",
    "starts",
    "stops",
    "locks",
    "unlocks",
    "moves",
    "places",
    "takes",
    "chooses",
    "offers",
    "warns",
    "changes",
    "breaks",
    "points",
    "hands",
    "sets",
    "uses",
    "blocks"
  ];

  return emotionWords.some((word) => lower.includes(word)) && !stateChangeWords.some((word) => lower.includes(word));
}

export function fallbackAdvancementCard(reason?: AdvancementVerificationResult["reason"]): AdvancementCard {
  if (reason === "near_repeat") {
    return getAdvancementCard("phase_exit");
  }

  if (reason === "weak_novelty") {
    return getAdvancementCard("new_information");
  }

  if (reason === "pure_emotion") {
    return getAdvancementCard("object_change");
  }

  if (reason === "player_control") {
    return getAdvancementCard("forced_choice");
  }

  if (reason === "missing_forced_choice") {
    return getAdvancementCard("forced_choice");
  }

  if (reason === "missing_risk") {
    return getAdvancementCard("new_risk");
  }

  return getAdvancementCard("reversible_consequence");
}

function stripProtocolNoise(text: string): string {
  return text
    .replace(/<\/?s>/gi, "")
    .replace(/<\/?(?:assistant|user|system)>/gi, "")
    .replace(
      /^\s*(?:#+\s*)?(?:output|answer|assistant|ai|bot|narrator|scene|dialogue|response|npc|npc_reply|user_reply|visual_cue|character|speaker)\s*:\s*/i,
      ""
    )
    .trim();
}

function cleanGeneratedOutput(text: string): string {
  const blockedSpeaker =
    /^(?:user|player|{{user}}|system|assistant|final task|output)\s*:/i;

  return stripProtocolNoise(text)
    .split(/\r?\n/)
    .map((line) => stripProtocolNoise(line).trim())
    .filter(Boolean)
    .filter((line) => !blockedSpeaker.test(line))
    .join("\n")
    .trim();
}

export function cleanDialogueOutput(text: string): string {
  return cleanGeneratedOutput(text);
}

export function cleanVisualDescriptionOutput(text: string): string {
  return cleanGeneratedOutput(text);
}

export function cleanSingleLineOutput(text: string): string {
  return cleanGeneratedOutput(text).split(/\r?\n/)[0]?.trim() ?? "";
}

export function cleanUserTextOutput(text: string): string {
  return cleanGeneratedOutput(text);
}