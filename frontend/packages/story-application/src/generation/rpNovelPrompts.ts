import { cleanDialogueOutput } from "./rp-engine/cleaning/clean-dialogue";
import { cleanUserTextOutput } from "./rp-engine/cleaning/clean-user-text";
import { cleanVisualDescriptionOutput } from "./rp-engine/cleaning/clean-visual";
import { renderPromptTemplate } from "./rp-engine/prompt/mustache-renderer";
import { extractForbiddenFragments } from "./rp-engine/novelty/repetition-guard";
import { noveltyPlanFromBeat, selectRomanceBeat } from "./rp-engine/novelty/novelty-planner";
import { PLAYER_RESPONSE_BEATS } from "./rp-engine/novelty/player-beat-deck";
import { RP_DIALOGUE_STOP, RP_NOVEL_STOP } from "./rp-engine/runtime/stop-sequences";
import { stableHash } from "./rp-engine/runtime/cache-store";
import { applyForcedNoveltyToPromptInput } from "./rp-engine/agents/agent-run-helpers";
import { getRomanceBeat, ROMANCE_AGENT, selectRomanceAdvancement } from "./rp-engine/agents/romance-agent";
import { VISUAL_CUE_AGENT } from "./rp-engine/agents/visual-cue-agent";
import type { AgentRunInput } from "./rp-engine/agents/types";
import { normalizeActorNames, resolvedActorLabels, sentenceStart } from "./rp-engine/state/actor-state";
import { buildActorNameExtractionPrompt, parseActorNameExtractionOutput } from "./rp-engine/tasks/actor-name-extract.task";
import {
  compactStoryContext,
  fullExchangeFromContext,
  lastVisualCueFromContext,
  latestPreviousTurnFromContext,
  recentOutputToAvoidText,
  recentOutputsFromNode,
  storySetupFromContext
} from "./rp-engine/state/story-context";
import type {
  ActorNameExtractionRunner,
  AdvancementCard,
  BeatType,
  NoveltyAxis,
  NoveltyPlan,
  RomancePhase,
  RpActorNames,
  RpPromptBuildResult,
  RpPromptInput,
  RpPromptRenderInput
} from "./rp-engine/types";

export { RP_DIALOGUE_STOP, RP_NOVEL_STOP };
export { cleanDialogueOutput, cleanUserTextOutput, cleanVisualDescriptionOutput };
export type {
  ActorNameExtractionRunner,
  AdvancementCard,
  BeatType,
  NoveltyAxis,
  NoveltyPlan,
  RomancePhase,
  RpActorNames,
  RpPromptBuildResult,
  RpPromptInput
} from "./rp-engine/types";

const ROMANCE_ANTI_PATTERNS = [
  "Do not control the player's thoughts, feelings, dialogue, bodily reactions, choices, desire, or consent.",
  "Do not introduce a rival, villain, sudden attack, lore twist, or unrelated emergency for novelty.",
  "Do not repeat generic blushing, smirking, breath-catching, or 'are you sure?' loops.",
  "Do not make every reply a question.",
  "Do not jump straight to confession or physical intimacy unless the scene has earned it.",
  "Do not add more than one major romance beat in one reply.",
  "Do not use asterisks or markdown stage directions."
];

const ACTOR_METADATA_CACHE = new Map<string, ActorMetadataCacheResult>();
const ACTOR_METADATA_CACHE_MAX_ENTRIES = 250;

type ActorMetadataCacheResult = {
  cacheKey: string;
  contextHash: string;
  actorNames: RpActorNames | null;
  cacheHit: boolean;
};

type ActorNameExtractionPromptResult = {
  cacheKey: string;
  contextHash: string;
  cacheHit: boolean;
  actorNames?: RpActorNames | null;
  prompt?: string;
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
    fullExchange: string;
    latestPreviousTurn: string;
    recentOutputToAvoid: string;
    previousVisual: string;
    userText: string;
    dialogue: string;
  };
  romance: Record<string, unknown>;
  beat: {
    id: BeatType;
    label: string;
    directive: string;
    constraint: string;
    avoid: string;
    minCloseness: number;
    typicalAfter: number;
    tags: string;
  };
  novelty: {
    axis: NoveltyAxis;
    directive: string;
    hasForbiddenFragments: boolean;
    forbiddenFragmentsBlock: string;
  };
  antiPatterns: Array<{ text: string }>;
};

function forcedNoveltyFromPromptInput(input: RpPromptInput): AgentRunInput["forcedNovelty"] {
  return {
    advancementCard: input.advancementCard,
    recentBeatTypes: input.recentBeatTypes,
    boundaryDetected: input.boundaryDetected
  };
}

function buildPromptTemplateData(
  input: RpPromptRenderInput,
  beat?: AdvancementCard,
  noveltyPlan?: NoveltyPlan
): PromptTemplateData {
  const labels = resolvedActorLabels(input.actorNames ?? null);
  const forcedNovelty = forcedNoveltyFromPromptInput(input);
  const promptInput = applyForcedNoveltyToPromptInput(input, forcedNovelty);
  const romanceContribution = ROMANCE_AGENT.run({
    node: promptInput.node,
    promptInput,
    forcedNovelty
  });
  const romance = romancePromptViewFromContribution(romanceContribution);
  const noveltyContext = romanceContribution.novelty?.context!;
  const selectedBeat = beat ?? getRomanceBeat("callback_intimacy");
  const selectedNoveltyPlan = noveltyPlan ?? noveltyPlanFromBeat(selectedBeat, noveltyContext, []);

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
      storySetup: storySetupFromContext(input.node.context || "") || "(empty)",
      fullExchange: fullExchangeFromContext(input.node.context || "") || compactStoryContext(input.node.context || "(empty)"),
      latestPreviousTurn: latestPreviousTurnFromContext(input.node.context || "") || "(empty)",
      recentOutputToAvoid: recentOutputToAvoidText(input.node),
      previousVisual: input.node.visualDescription || lastVisualCueFromContext(input.node.context || "") || "(empty)",
      userText: input.node.userText || "(empty)",
      dialogue: input.node.dialogue || "(empty)"
    },
    romance,
    beat: {
      id: selectedBeat.id,
      label: selectedBeat.label ?? sentenceStart(selectedBeat.id.replace(/_/g, " ")),
      directive: selectedBeat.directive,
      constraint: selectedBeat.constraint ?? "Keep the beat grounded in the visible exchange and current scene.",
      avoid: selectedBeat.avoid ?? "Do not turn the beat into unrelated plot novelty.",
      minCloseness: selectedBeat.minCloseness ?? 0,
      typicalAfter: selectedBeat.typicalAfter ?? noveltyContext.closeness,
      tags: selectedBeat.tags?.join(", ") ?? "romance"
    },
    novelty: {
      axis: selectedNoveltyPlan.axis,
      directive: selectedNoveltyPlan.directive,
      hasForbiddenFragments: selectedNoveltyPlan.forbiddenFragments.length > 0,
      forbiddenFragmentsBlock: selectedNoveltyPlan.forbiddenFragments.map((fragment) => "  - " + fragment).join("\n")
    },
    antiPatterns: ROMANCE_ANTI_PATTERNS.map((text) => ({ text }))
  };
}

function romancePromptViewFromContribution(contribution: ReturnType<typeof ROMANCE_AGENT.run>): Record<string, unknown> {
  return (contribution.promptViews?.romance as Record<string, unknown> | undefined) ?? {};
}

function rpIdentityInstructionTemplate(): string {
  return [
    "You are a strict two-character romance visual-novel textbox engine.",
    "You write compact VN textbox output for a short one-shot romance RP, not long prose fiction.",
    "Preserve agency for {{user.name}} completely.",
    "Return only the requested output. No headings, labels, notes, JSON, markdown, or explanations."
  ].join("\n");
}

function romanceModeBlockTemplate(): string {
  return [
    "ROMANCE_MODE:",
    "- This is a compact one-shot scene expected to resolve in fewer than about 50 exchanges.",
    "- The focus is two-character romance, intimacy growth, emotional tension, trust, and consent-aware closeness.",
    "- Novelty means one grounded relationship shift, not a random plot twist.",
    "- Keep focus on {{user.name}} and {{npc.name}}. Do not introduce new major characters or unrelated external drama.",
    "- If adult intimacy appears in context, all characters must be adults and consent must be clear, ongoing, and unpressured. Otherwise keep intimacy romantic/sensual or fade-to-black."
  ].join("\n");
}

function agencyRuleBlockTemplate(): string {
  return [
    "PLAYER_AGENCY:",
    "- Never write {{user.name}}'s thoughts, feelings, dialogue, choices, bodily reactions, desire, or consent.",
    "- Do not assume attraction, embarrassment, arousal, fear, agreement, or reciprocation from {{user.name}}.",
    "- Offer openings, signals, invitations, pauses, and choices that {{user.name}} can accept, refuse, or redirect.",
    "- NPC spoken dialogue may use first person.",
    "- Any narration or action prose must be third person and must not control {{user.name}}.",
    "- Do not use asterisks; write clean VN textbox prose.",
    "- End with complete terminal punctuation."
  ].join("\n");
}

function storyContextBlockTemplate(): string {
  return [
    "FULL_STORY_CONTEXT:",
    "{{node.storyContext}}",
    "",
    "This is the full accumulated story memory. Use it for continuity, callbacks, tone, and consequences."
  ].join("\n");
}

function latestPreviousTurnBlockTemplate(): string {
  return [
    "LATEST_PREVIOUS_TURN:",
    "{{node.latestPreviousTurn}}",
    "",
    "Continue from LATEST_PREVIOUS_TURN, but answer the latest player input when CURRENT_TURN is present."
  ].join("\n");
}

function fullExchangeBlockTemplate(): string {
  return [
    "FULL_EXCHANGE_SO_FAR:",
    "{{node.fullExchange}}",
    "",
    "Use the full exchange for rhythm, callbacks, and romantic continuity."
  ].join("\n");
}

function currentPlayerTurnBlockTemplate(): string {
  return ["CURRENT_TURN:", "USER: {{node.userText}}"].join("\n");
}

function currentResolvedTurnBlockTemplate(): string {
  return ["CURRENT_TURN:", "USER: {{node.userText}}", "NPC_REPLY: {{node.dialogue}}"].join("\n");
}

function previousVisualBlockTemplate(): string {
  return ["PREVIOUS_VISUAL:", "{{node.previousVisual}}"].join("\n");
}

function recentOutputToAvoidBlockTemplate(): string {
  return ["RECENT_OUTPUT_TO_AVOID:", "{{node.recentOutputToAvoid}}"].join("\n");
}

function romancePromptViewBlockTemplate(): string {
  return [
    "ROMANCE_STATE:",
    "- Closeness level: {{romance.closeness}} / 10 ({{romance.closenessLabel}}).",
    "- Current phase: {{romance.phaseLabel}}.",
    "- Current tension: {{romance.currentTension}}.",
    "- Open hook: {{romance.openHook}}.",
    "- Recent callback detail: {{romance.callbackDetail}}.",
    "- If boundary language is present, respect it and choose safety over escalation."
  ].join("\n");
}

function selectedBeatBlockTemplate(): string {
  return [
    "THIS_TURN_ROMANCE_BEAT:",
    "- Beat: {{beat.label}}.",
    "- Minimum closeness: {{beat.minCloseness}}. Typical after: {{beat.typicalAfter}}.",
    "- Tags: {{beat.tags}}.",
    "- Direction: {{beat.directive}}",
    "- Constraint: {{beat.constraint}}",
    "- Avoid: {{beat.avoid}}",
    "- Apply exactly one major romance beat."
  ].join("\n");
}

function antiPatternBlockTemplate(): string {
  return [
    "ANTI_PATTERNS:",
    "{{#antiPatterns}}- {{text}}\n{{/antiPatterns}}"
  ].join("\n");
}

function actorMetadataBlockTemplate(): string {
  return [
    "ACTOR_REFERENCE:",
    "- Player-side character reference: {{user.name}}.",
    "- Romance counterpart reference: {{npc.name}}.",
    "- If names are unknown, keep wording natural and role-based.",
    "- Do not render implementation metadata such as story id, node id, selectedNodeId, cache keys, or beat ids as story facts."
  ].join("\n");
}

function counterpartExampleBlockTemplate(): string[] {
  return [
    "GOOD OUTPUT SHAPE EXAMPLES:",
    "Aiko lets the joke fade, her hand stopping just short of his sleeve. \"You remembered that?\"",
    "Mara glances toward the rain-streaked window, then back to him. \"If you ask me to stay, I might.\"",
    "Seren's teasing smile weakens for the first time. \"Careful. I might start believing you mean that.\"",
    "",
    "BAD OUTPUT SHAPE EXAMPLES:",
    "You blush and realize you want her.",
    "A jealous rival kicks down the door.",
    "She smirks and asks if you are sure."
  ];
}

function playerExampleBlockTemplate(): string[] {
  return [
    "GOOD USER_REPLY EXAMPLES:",
    "Then stop pretending it does not matter.",
    "I take one step closer, but leave the last one to you.",
    "Not yet. Tell me what you actually want first.",
    "",
    "BAD USER_REPLY EXAMPLES:",
    "She smiles, overwhelmed by my response.",
    "The room fills with moonlight as destiny seals us together.",
    "I blush uncontrollably and realize I love you."
  ];
}

function counterpartNoveltyRequestBlockTemplate(): string {
  return [
    "INTERNAL_ROMANCE_NOVELTY_REQUEST:",
    "- This block is for generation control only. Do not mention it.",
    "- Novelty axis: {{novelty.axis}}.",
    "- {{novelty.directive}}",
    "- The novelty must come from recognition, tension, vulnerability, trust, boundary, consent-aware closeness, or callback meaning.",
    "- The output must not merely reword a recent event.",
    "- Prefer deepening an existing hook over adding a new external event.",
    "{{#novelty.hasForbiddenFragments}}- Forbidden recent fragments:\n{{novelty.forbiddenFragmentsBlock}}{{/novelty.hasForbiddenFragments}}"
  ].join("\n");
}

function playerNoveltyRequestBlockTemplate(): string {
  return [
    "INTERNAL_PLAYER_RESPONSE_REQUEST:",
    "- This block is for generation control only. Do not mention it.",
    "- Player response axis: {{novelty.axis}}.",
    "- {{novelty.directive}}",
    "- USER_REPLY must be one short command, spoken line, or direct action by {{user.name}}.",
    "- Do not narrate {{npc.name}}, the room, lighting, facial expressions, or aftermath.",
    "{{#novelty.hasForbiddenFragments}}- Forbidden recent fragments:\n{{novelty.forbiddenFragmentsBlock}}{{/novelty.hasForbiddenFragments}}"
  ].join("\n");
}

function layoutCounterpartAnswerPromptTemplate(): string {
  return [
    rpIdentityInstructionTemplate(),
    "",
    romanceModeBlockTemplate(),
    "",
    agencyRuleBlockTemplate(),
    "",
    ...counterpartExampleBlockTemplate(),
    "",
    actorMetadataBlockTemplate(),
    "",
    storyContextBlockTemplate(),
    "",
    fullExchangeBlockTemplate(),
    "",
    latestPreviousTurnBlockTemplate(),
    "",
    currentPlayerTurnBlockTemplate(),
    "",
    previousVisualBlockTemplate(),
    "",
    recentOutputToAvoidBlockTemplate(),
    "",
    romancePromptViewBlockTemplate(),
    "",
    selectedBeatBlockTemplate(),
    "",
    counterpartNoveltyRequestBlockTemplate(),
    "",
    antiPatternBlockTemplate(),
    "",
    "FINAL TASK:",
    "Write only the next textbox reply for {{npc.name}} and brief third-person scene narration.",
    "Respond directly to CURRENT_TURN.",
    "Advance the romantic dynamic by exactly one meaningful beat using THIS_TURN_ROMANCE_BEAT.",
    "End with room for {{user.name}} to respond; do not resolve the whole relationship too quickly.",
    "Maximum 65 words.",
    "",
    "OUTPUT ONLY THAT TEXT BELOW:"
  ].join("\n");
}

function layoutAutomaticPlayerAnswerPromptTemplate(): string {
  return [
    rpIdentityInstructionTemplate(),
    "",
    romanceModeBlockTemplate(),
    "",
    "PLAYER_TEXT_RULES:",
    "- Output USER_REPLY only.",
    "- Write as {{user.name}} choosing the next command, spoken line, or direct action.",
    "- The current turn has not started yet; continue from LATEST_PREVIOUS_TURN.",
    "- Continue from LATEST_PREVIOUS_TURN using FULL_STORY_CONTEXT as full accumulated story memory.",
    "- Keep it short and playable; one line or one action + line is enough.",
    "- Do not write first-person prose narration unless it is a bare spoken line or direct command.",
    "- Do not describe {{npc.name}}, the room, lighting, sounds, facial expressions, body language, or atmosphere.",
    "- Do not write the NPC reaction or resolve the whole romance.",
    "- Do not repeat prior USER_REPLY, counterpart reply, or VISUAL_CUE text.",
    "",
    ...playerExampleBlockTemplate(),
    "",
    actorMetadataBlockTemplate(),
    "",
    storyContextBlockTemplate(),
    "",
    fullExchangeBlockTemplate(),
    "",
    latestPreviousTurnBlockTemplate(),
    "",
    recentOutputToAvoidBlockTemplate(),
    "",
    romancePromptViewBlockTemplate(),
    "",
    selectedBeatBlockTemplate(),
    "",
    playerNoveltyRequestBlockTemplate(),
    "",
    antiPatternBlockTemplate(),
    "",
    "FINAL TASK:",
    "Write only the next textbox reply for {{user.name}}.",
    "Maximum 28 words.",
    "",
    "OUTPUT ONLY THAT TEXT BELOW:"
  ].join("\n");
}

function renderRpAnswerPromptWithResolvedActors(input: RpPromptRenderInput): RpPromptBuildResult {
  const forcedNovelty = forcedNoveltyFromPromptInput(input);
  const promptInput = applyForcedNoveltyToPromptInput(input, forcedNovelty);
  const romanceContribution = ROMANCE_AGENT.run({
    node: promptInput.node,
    promptInput,
    forcedNovelty
  });
  const noveltyContext = romanceContribution.novelty?.context!;
  const advancementCard = selectRomanceAdvancement(promptInput, noveltyContext);
  const noveltyPlan = noveltyPlanFromBeat(advancementCard, noveltyContext, extractForbiddenFragments(recentOutputsFromNode(input.node).join("\n")));
  const template = layoutCounterpartAnswerPromptTemplate();
  const data = buildPromptTemplateData(promptInput, advancementCard, noveltyPlan);

  return {
    advancementCard,
    noveltyPlan,
    actorNames: input.actorNames ?? null,
    prompt: renderPromptTemplate(template, data)
  };
}

export async function buildRpAnswerPromptWithActorNameCache(
  input: RpPromptInput,
  runHiddenActorNameExtraction: ActorNameExtractionRunner
): Promise<RpPromptBuildResult> {
  const actorNames = await resolveActorNamesForPrompt(input, runHiddenActorNameExtraction);

  return renderRpAnswerPromptWithResolvedActors({
    ...input,
    actorNames
  });
}

function renderVisualRepresentationPromptWithResolvedActors(input: RpPromptRenderInput): string {
  const result = VISUAL_CUE_AGENT.run({
    node: input.node,
    promptInput: input,
    actorNames: input.actorNames ?? null,
    forcedNovelty: forcedNoveltyFromPromptInput(input)
  });

  return result.prompt ?? "";
}

export async function buildVisualRepresentationPromptWithActorNameCache(
  input: RpPromptInput,
  runHiddenActorNameExtraction: ActorNameExtractionRunner
): Promise<string> {
  const actorNames = await resolveActorNamesForPrompt(input, runHiddenActorNameExtraction);

  return renderVisualRepresentationPromptWithResolvedActors({
    ...input,
    actorNames
  });
}

function renderAutomaticUserAnswerPromptWithResolvedActors(input: RpPromptRenderInput): RpPromptBuildResult {
  const forcedNovelty = forcedNoveltyFromPromptInput(input);
  const promptInput = applyForcedNoveltyToPromptInput(input, forcedNovelty);
  const romanceContribution = ROMANCE_AGENT.run({
    node: promptInput.node,
    promptInput,
    forcedNovelty
  });
  const noveltyContext = romanceContribution.novelty?.context!;
  const advancementCard = selectRomanceBeat(promptInput, PLAYER_RESPONSE_BEATS, noveltyContext);
  const noveltyPlan = noveltyPlanFromBeat(advancementCard, noveltyContext, extractForbiddenFragments(recentOutputsFromNode(input.node).join("\n")));
  const template = layoutAutomaticPlayerAnswerPromptTemplate();
  const data = buildPromptTemplateData(promptInput, advancementCard, noveltyPlan);

  return {
    advancementCard,
    noveltyPlan,
    actorNames: input.actorNames ?? null,
    prompt: renderPromptTemplate(template, data)
  };
}

export async function buildAutomaticUserAnswerPromptWithActorNameCache(
  input: RpPromptInput,
  runHiddenActorNameExtraction: ActorNameExtractionRunner
): Promise<RpPromptBuildResult> {
  const actorNames = await resolveActorNamesForPrompt(input, runHiddenActorNameExtraction);

  return renderAutomaticUserAnswerPromptWithResolvedActors({
    ...input,
    actorNames
  });
}

/**
 * Hidden actor-name prestep used by every RP novel LLM prompt builder.
 * Cache hits skip the hidden LLM call but still provide the same metadata path.
 */
function buildActorNameExtractionPromptWithCache(input: RpPromptInput): ActorNameExtractionPromptResult {
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

async function resolveActorNamesForPrompt(
  input: RpPromptInput,
  runHiddenActorNameExtraction: ActorNameExtractionRunner
): Promise<RpActorNames | null> {
  const extraction = buildActorNameExtractionPromptWithCache(input);

  if (extraction.cacheHit) return extraction.actorNames ?? null;
  if (!extraction.prompt) return null;

  const raw = await runHiddenActorNameExtraction(extraction.prompt);
  const parsed = parseActorNameExtractionOutput(raw);

  return rememberActorNamesForPrompt(input, parsed).actorNames;
}

function getCachedActorNamesForPrompt(input: RpPromptInput): ActorMetadataCacheResult {
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

function rememberActorNamesForPrompt(input: RpPromptInput, actorNames: RpActorNames | null): ActorMetadataCacheResult {
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

function actorMetadataCacheKey(input: RpPromptInput): { cacheKey: string; contextHash: string } {
  const stableSetup = storySetupFromContext(input.node.context || "");
  const contextHash = stableHash(stableSetup || "(empty)");
  const storyPart = input.storyId?.trim() || "unknown-story";

  return {
    contextHash,
    cacheKey: storyPart + ":" + contextHash
  };
}

function trimActorMetadataCache(): void {
  while (ACTOR_METADATA_CACHE.size > ACTOR_METADATA_CACHE_MAX_ENTRIES) {
    const firstKey = ACTOR_METADATA_CACHE.keys().next().value as string | undefined;
    if (!firstKey) return;
    ACTOR_METADATA_CACHE.delete(firstKey);
  }
}
