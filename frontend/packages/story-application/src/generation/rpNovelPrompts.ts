import { cleanDialogueOutput } from "./rp-engine/cleaning/clean-dialogue";
import { cleanUserTextOutput } from "./rp-engine/cleaning/clean-user-text";
import { cleanVisualDescriptionOutput } from "./rp-engine/cleaning/clean-visual";
import { renderPromptTemplate } from "./rp-engine/prompt/mustache-renderer";
import { buildPromptContextView } from "./rp-engine/prompt/prompt-context-view";
import { buildConcreteNoveltyInstruction } from "./rp-engine/prompt/concrete-novelty-instructions";
import {
  playerChoiceContextBlockTemplate,
  playerChoiceExamplesBlockTemplate,
  playerChoiceFinalTaskBlockTemplate,
  playerChoiceIdentityBlockTemplate,
  playerChoiceNoveltyBlockTemplate,
  playerChoiceRulesBlockTemplate
} from "./rp-engine/prompt/player-choice-prompt";
import { extractForbiddenFragments } from "./rp-engine/novelty/repetition-guard";
import { detailBudgetInstructionForControls, noveltyControlSummary, withNoveltyControls } from "./rp-engine/novelty/candidate-scoring";
import {
  buildNoveltyCandidateBuffer,
  noveltySelectionSummary,
  selectCoherentNoveltyBeat,
  type CoherentNoveltySelection,
  type NoveltyAgentNote,
  type NoveltyCoherenceRunner
} from "./rp-engine/novelty/coherence-judge";
import { RP_DIALOGUE_STOP, RP_NOVEL_STOP } from "./rp-engine/runtime/stop-sequences";
import { stableHash } from "./rp-engine/runtime/cache-store";
import { applyForcedNoveltyToPromptInput } from "./rp-engine/agents/agent-run-helpers";
import { playerResponseAdvancementDeck, romanceAdvancementDeck, ROMANCE_AGENT } from "./rp-engine/agents/romance-agent";
import { NPC_PERSONNA_AGENT } from "./rp-engine/agents/npc-personna-agent";
import { VISUAL_CUE_AGENT } from "./rp-engine/agents/visual-cue-agent";
import { SEX_SCENE_AGENT } from "./rp-engine/agents/sex-scene-agent";
import { DIALOGUE_QUALITY_AGENT } from "./rp-engine/agents/dialogue-quality-agent";
import type { AgentContribution, AgentNoveltyCandidate, AgentRunInput, RpAgent } from "./rp-engine/agents/types";
import { normalizeActorNames, resolvedActorLabels } from "./rp-engine/state/actor-state";
import { buildActorNameExtractionPrompt, parseActorNameExtractionOutput } from "./rp-engine/tasks/actor-name-extract.task";
import {
  recentOutputsFromNode,
  storySetupFromContext
} from "./rp-engine/state/story-context";
import type {
  ActorNameExtractionRunner,
  AdvancementCard,
  AgentDebugTrace,
  BeatType,
  CandidateDebugEntry,
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
  AgentDebugTrace,
  BeatType,
  CandidateDebugEntry,
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
    promptMemory: string;
    worldInfoBefore: string;
    worldInfoAfter: string;
    fullExchange: string;
    latestPreviousTurn: string;
    recentOutputToAvoid: string;
    previousVisual: string;
    userText: string;
    dialogue: string;
  };
  romance: Record<string, unknown>;
  npcPersonna: Record<string, unknown>;
  sexScene: Record<string, unknown>;
  agentNotes: Array<{ source: string; text: string }>;
  novelty: {
    freshnessRule: string;
    noveltyControlSummary: string;
    detailBudgetInstruction: string;
    turnRedirect: string;
    coherenceSummary: string;
    concreteSelectedBeat: string;
    concreteExecution: string;
    concreteAllowedForms: Array<{ text: string }>;
    concreteAvoid: Array<{ text: string }>;
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

type PromptGenerationAgentPass = {
  agentIds: string[];
  contributions: AgentContribution[];
  notes: NoveltyAgentNote[];
  candidates: AgentNoveltyCandidate[];
  romance: Record<string, unknown>;
  npcPersonna: Record<string, unknown>;
  sexScene: Record<string, unknown>;
  noveltyContext: ReturnType<typeof withNoveltyControls>;
};

function runPromptGenerationAgents(input: RpPromptRenderInput): PromptGenerationAgentPass {
  const forcedNovelty = forcedNoveltyFromPromptInput(input);
  const promptInput = applyForcedNoveltyToPromptInput(input, forcedNovelty);
  const agents: RpAgent[] = [NPC_PERSONNA_AGENT, ROMANCE_AGENT, SEX_SCENE_AGENT, DIALOGUE_QUALITY_AGENT];
  const notes: NoveltyAgentNote[] = [];
  const candidates: AgentNoveltyCandidate[] = [];
  const contributions: AgentContribution[] = [];

  for (const agent of agents) {
    const contribution = agent.run({
      node: promptInput.node,
      promptInput,
      actorNames: input.actorNames ?? null,
      forcedNovelty,
      previousAgentNotes: notes
    });

    contributions.push(contribution);
    notes.push(...(contribution.notes ?? []));
    candidates.push(...(contribution.candidates ?? []));
  }

  const npcPersonnaContribution = contributions.find((contribution) => contribution.promptViews?.npcPersonna);
  const romanceContribution = contributions.find((contribution) => contribution.promptViews?.romance);
  const sexSceneContribution = contributions.find((contribution) => contribution.promptViews?.sexScene);
  const romanceContext = romanceContribution?.novelty?.context ?? ROMANCE_AGENT.run({ node: promptInput.node, promptInput, forcedNovelty }).novelty?.context!;
  const noveltyContext = withNoveltyControls({
    ...romanceContext,
    sexScene: sexSceneContribution?.novelty?.intimacy,
    npcPersonna: npcPersonnaContribution?.novelty?.npcPersonna,
    boundaryDetected: Boolean(romanceContext.boundaryDetected || sexSceneContribution?.novelty?.intimacy?.boundaryDetected)
  }, promptInput.novelty);

  return {
    agentIds: agents.map((agent) => agent.id),
    contributions,
    notes,
    candidates,
    npcPersonna: npcPersonnaContribution ? npcPersonnaPromptViewFromContribution(npcPersonnaContribution) : {},
    romance: romanceContribution ? romancePromptViewFromContribution(romanceContribution) : {},
    sexScene: sexSceneContribution ? sexScenePromptViewFromContribution(sexSceneContribution) : {},
    noveltyContext
  };
}

type CoherentRedirectLoopResult = {
  promptInput: RpPromptRenderInput;
  agentPass: PromptGenerationAgentPass;
  candidates: AgentNoveltyCandidate[];
  noveltySelection: CoherentNoveltySelection;
  debugTrace: AgentDebugTrace;
};

async function runCoherentRedirectPromptLoop(
  input: RpPromptRenderInput,
  deck: AdvancementCard[],
  runHiddenNoveltyCoherence?: NoveltyCoherenceRunner
): Promise<CoherentRedirectLoopResult> {
  const forcedNovelty = forcedNoveltyFromPromptInput(input);
  const promptInput = applyForcedNoveltyToPromptInput(input, forcedNovelty);
  const agentPass = runPromptGenerationAgents(promptInput);
  const candidates = buildNoveltyCandidateBuffer({
    promptInput,
    deck,
    context: agentPass.noveltyContext,
    agentCandidates: agentPass.candidates
  });
  const noveltySelection = await selectCoherentNoveltyBeat({
    promptInput,
    sceneText: noveltySceneTextFromInput(promptInput),
    agentNotes: agentPass.notes,
    candidates,
    runCoherenceCheck: runHiddenNoveltyCoherence
  });
  return {
    promptInput,
    agentPass,
    candidates,
    noveltySelection,
    debugTrace: buildAgentDebugTrace(promptInput, agentPass, candidates, noveltySelection)
  };
}

function buildAgentDebugTrace(
  input: RpPromptRenderInput,
  agentPass: PromptGenerationAgentPass,
  candidateBuffer: AgentNoveltyCandidate[],
  noveltySelection: CoherentNoveltySelection
): AgentDebugTrace {
  const agents = agentPass.contributions.map((contribution, index) => {
    const id = agentPass.agentIds[index] ?? contribution.notes?.[0]?.source ?? `agent-${index + 1}`;
    return {
      id,
      label: agentLabel(id),
      notes: (contribution.notes ?? []).map((note) => note.text),
      candidates: (contribution.candidates ?? []).map(candidateDebugEntry)
    };
  });

  return {
    sceneId: [input.storyId ?? "unknown-story", input.selectedNodeId ?? stableHash(input.node.context || "empty")].join(":"),
    generatedAt: new Date().toISOString(),
    agents,
    candidateBuffer: candidateBuffer.map(candidateDebugEntry),
    coherenceChecks: noveltySelection.coherenceChecks ?? [],
    selectedRedirect: {
      candidateId: noveltySelection.candidate?.id,
      source: noveltySelection.candidate?.source,
      text: noveltySelection.redirectText,
      fallback: !noveltySelection.acceptedByJudge,
      reason: selectedRedirectReason(noveltySelection)
    }
  };
}

function candidateDebugEntry(candidate: AgentNoveltyCandidate): CandidateDebugEntry {
  return {
    id: candidate.id,
    source: candidate.source,
    text: candidate.text,
    weight: Number.isFinite(candidate.weight) ? candidate.weight : undefined,
    label: candidate.label
  };
}

function selectedRedirectReason(selection: CoherentNoveltySelection): AgentDebugTrace["selectedRedirect"]["reason"] {
  if (selection.acceptedByJudge) return "accepted";
  const reason = (selection.fallbackReason ?? "").toLowerCase();
  if (reason.includes("no agent") || reason.includes("no candidates")) return "no_candidates";
  if (reason.includes("failed") || reason.includes("error")) return "checker_error";
  if (reason.includes("disabled") || reason.includes("no hidden")) return "disabled";
  return "all_rejected";
}

function agentLabel(id: string): string {
  switch (id) {
    case "npc-personna":
      return "NPC Personna Agent";
    case "romance":
      return "Romance Agent";
    case "sex-scene":
      return "Sex Scene Agent";
    case "dialogue-quality":
      return "Dialogue Quality Agent";
    default:
      return id.replace(/[-_]/g, " ");
  }
}

function buildPromptTemplateData(
  input: RpPromptRenderInput,
  agentPass: PromptGenerationAgentPass,
  noveltySelection?: CoherentNoveltySelection | null
): PromptTemplateData {
  const labels = resolvedActorLabels(input.actorNames ?? null);
  const forbiddenFragments = extractForbiddenFragments(recentOutputsFromNode(input.node).join("\n"));
  const promptContext = buildPromptContextView(input.node);
  const concreteNovelty = buildConcreteNoveltyInstruction(noveltySelection);

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
      promptMemory: promptContext.promptMemory,
      worldInfoBefore: promptContext.worldInfoBefore,
      worldInfoAfter: promptContext.worldInfoAfter,
      fullExchange: promptContext.priorExchange,
      latestPreviousTurn: promptContext.latestPreviousTurn,
      recentOutputToAvoid: promptContext.recentOutputToAvoid,
      previousVisual: promptContext.previousVisual,
      userText: promptContext.userText,
      dialogue: promptContext.dialogue
    },
    romance: agentPass.romance,
    npcPersonna: agentPass.npcPersonna,
    sexScene: agentPass.sexScene,
    agentNotes: agentPass.notes.map((note) => ({ source: note.source, text: note.text })),
    novelty: {
      freshnessRule: freshnessRuleFromForbiddenFragments(forbiddenFragments),
      noveltyControlSummary: noveltyControlSummary(input.novelty),
      detailBudgetInstruction: detailBudgetInstructionForControls(input.novelty),
      turnRedirect: noveltySelection?.redirectText ?? "Do not force a new novelty beat this turn. Stabilize the scene and answer the latest player input directly.",
      coherenceSummary: noveltySelectionSummary(noveltySelection),
      concreteSelectedBeat: concreteNovelty.selectedBeat,
      concreteExecution: concreteNovelty.execution,
      concreteAllowedForms: concreteNovelty.allowedForms.map((text) => ({ text })),
      concreteAvoid: concreteNovelty.avoid.map((text) => ({ text }))
    },
    antiPatterns: ROMANCE_ANTI_PATTERNS.map((text) => ({ text }))
  };
}


function freshnessRuleFromForbiddenFragments(forbiddenFragments: string[]): string {
  if (forbiddenFragments.length === 0) {
    return "Do not paraphrase the immediately previous reply or repeat its sentence shape.";
  }

  return `Do not reuse these recent fragments or their sentence shape: ${forbiddenFragments.slice(0, 4).join("; ")}.`;
}

function romancePromptViewFromContribution(contribution: ReturnType<typeof ROMANCE_AGENT.run>): Record<string, unknown> {
  return (contribution.promptViews?.romance as Record<string, unknown> | undefined) ?? {};
}

function sexScenePromptViewFromContribution(contribution: ReturnType<typeof SEX_SCENE_AGENT.run>): Record<string, unknown> {
  return (contribution.promptViews?.sexScene as Record<string, unknown> | undefined) ?? {};
}

function npcPersonnaPromptViewFromContribution(contribution: ReturnType<typeof NPC_PERSONNA_AGENT.run>): Record<string, unknown> {
  return (contribution.promptViews?.npcPersonna as Record<string, unknown> | undefined) ?? {};
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

function promptManagerLayoutBlockTemplate(): string {
  return [
    "PROMPT_MANAGER_LAYOUT:",
    "- Treat this prompt like a SillyTavern-style ordered stack: main instructions first, world/lore memory next, chat history, then post-history instructions last.",
    "- Higher sections define stable rules; later CURRENT_TURN and POST_HISTORY_INSTRUCTIONS decide this exact output.",
    "- Do not expose section names, hidden planning, or implementation metadata in the story text."
  ].join("\n");
}

function worldInfoBeforeBlockTemplate(): string {
  return [
    "WORLD_INFO_BEFORE_HISTORY:",
    "{{node.worldInfoBefore}}",
    "",
    "Use this as stable lore and setup, not as text to copy verbatim."
  ].join("\n");
}

function promptMemoryBlockTemplate(): string {
  return [
    "PROMPT_MEMORY:",
    "{{node.promptMemory}}",
    "",
    "This is compressed memory for continuity; prefer it over inventing new background facts."
  ].join("\n");
}

function worldInfoAfterBlockTemplate(): string {
  return [
    "WORLD_INFO_AFTER_HISTORY:",
    "{{node.worldInfoAfter}}",
    "",
    "Use this as a late reminder for continuity and anti-repetition."
  ].join("\n");
}

function postHistoryInstructionBlockTemplate(): string {
  return [
    "POST_HISTORY_INSTRUCTIONS:",
    "- TURN_REDIRECT: {{novelty.turnRedirect}}",
    "- RP-LLM coherence: {{novelty.coherenceSummary}}",
    "- Authority rule: TURN_REDIRECT is the only accepted scene movement for this reply.",
    "- Agent notes are continuity and style constraints; do not combine unselected agent ideas into extra novelty.",
    "- Freshness rule: {{novelty.freshnessRule}}",
    "- Novelty controls are code-side only: {{novelty.noveltyControlSummary}}",
    "- Detail budget: {{novelty.detailBudgetInstruction}}"
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
    "RECENT_EXCHANGE_BEFORE_LATEST:",
    "{{node.fullExchange}}",
    "",
    "Use only for rhythm and callbacks. The latest turn is provided separately below."
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


function npcPersonnaPromptViewBlockTemplate(): string {
  return [
    "NPC_PERSONNA_STATE:",
    "- Source: {{npcPersonna.source}}. Context hash: {{npcPersonna.contextHash}}.",
    "- Dere archetype: {{npcPersonna.dereLabel}} ({{npcPersonna.core}})",
    "- Temperament: {{npcPersonna.temperament}}. Attachment: {{npcPersonna.attachmentStyle}}. Core value: {{npcPersonna.coreValue}}.",
    "- Flaw/vulnerability: {{npcPersonna.flaw}} / {{npcPersonna.vulnerability}}.",
    "- Affection style: {{npcPersonna.loveLanguage}}. Pressure response: {{npcPersonna.pressureResponse}}.",
    "- Public mask: {{npcPersonna.publicMask}}. Private tell: {{npcPersonna.privateTell}}.",
    "- Dialogue style: {{npcPersonna.dialogueStyle}}",
    "- Detail lifetimes: {{#npcPersonna.detailLifetimes}}{{.}}; {{/npcPersonna.detailLifetimes}}",
    "- Novelty levers: {{#npcPersonna.noveltyLevers}}{{.}}; {{/npcPersonna.noveltyLevers}}",
    "- Selected personna novelty: {{npcPersonna.selectedInfluence}}. Should influence this turn: {{npcPersonna.shouldInfluenceNovelty}}.",
    "- Selected directive: {{npcPersonna.selectedInfluenceDirective}}",
    "- Selected constraint: {{npcPersonna.selectedInfluenceConstraint}}",
    "- Agent instruction: {{npcPersonna.noveltyInstruction}}",
    "- Preserve seed/arc personna dimensions. A quirk may affect delivery, a mistake, a protective choice, or a private tell; it must not become random external plot."
  ].join("\n");
}

function romanticClichePromptViewBlockTemplate(): string {
  return [
    "ROMANTIC_CLICHE_STATE:",
    "- Summary: {{romance.clicheDetailSummary}}",
    "- Families: {{#romance.clicheFamilies}}{{.}}; {{/romance.clicheFamilies}}",
    "- Detail lifetimes: {{#romance.clicheDetailLifetimes}}{{.}}; {{/romance.clicheDetailLifetimes}}",
    "- Novelty target facets: {{#romance.clicheTargetFacets}}{{.}}; {{/romance.clicheTargetFacets}}",
    "- Agent instruction: {{romance.clicheNoveltyInstruction}}",
    "- Romantic cliches are independent interaction facets, not a required order. Do not stack many tropes in one reply."
  ].join("\n");
}

function sexScenePromptViewBlockTemplate(): string {
  return [
    "SEX_SCENE_DETAIL_STATE:",
    "- Active: {{sexScene.active}}. Step: {{sexScene.label}}. Novelty pressure: {{sexScene.noveltyPressure}}.",
    "- Summary: {{sexScene.detailSummary}}",
    "- Detail lifetimes: {{#sexScene.detailLifetimes}}{{.}}; {{/sexScene.detailLifetimes}}",
    "- Novelty facet targets this turn: {{#sexScene.noveltyFacetTargets}}{{.}}; {{/sexScene.noveltyFacetTargets}}",
    "- Adult framing required: {{sexScene.requiresAdultFraming}}. Fade to black: {{sexScene.shouldFadeToBlack}}. Boundary detected: {{sexScene.boundaryDetected}}.",
    "- Sex-scene / novelty bridge: {{sexScene.noveltyBridgeInstruction}}",
    "- Post-history intimacy instruction: {{sexScene.postHistoryInstruction}}",
    "- Treat position, contact, clothing, camera/framing, setting, and aftercare as independent facets. Do not force a fake order among unrelated details."
  ].join("\n");
}

function agentNotesBlockTemplate(): string {
  return [
    "AGENT_NOTES:",
    "{{#agentNotes}}- {{source}}: {{text}}\n{{/agentNotes}}",
    "",
    "These notes describe state and style only. They are not separate scene actions unless TURN_REDIRECT selects one."
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

function counterpartNoveltyRequestBlockTemplate(): string {
  return [
    "INTERNAL_REDIRECT_REQUEST:",
    "- TURN_REDIRECT: {{novelty.turnRedirect}}",
    "- RP-LLM coherence: {{novelty.coherenceSummary}}",
    "- Use no other agent candidate this turn."
  ].join("\n");
}

function concreteNoveltyInstructionBlockTemplate(): string {
  return [
    "CONCRETE_NOVELTY_BEAT:",
    "- Selected beat: {{novelty.concreteSelectedBeat}}",
    "- Concrete execution: {{novelty.concreteExecution}}",
    "- Scene anchor rule: reuse an existing concrete object, task, place, or wording from the accepted context when available; otherwise choose the smallest plausible physical move.",
    "- Allowed forms: {{#novelty.concreteAllowedForms}}{{text}}; {{/novelty.concreteAllowedForms}}",
    "- Avoid: {{#novelty.concreteAvoid}}{{text}}; {{/novelty.concreteAvoid}}"
  ].join("\n");
}

function layoutCounterpartAnswerPromptTemplate(): string {
  return [
    rpIdentityInstructionTemplate(),
    "",
    promptManagerLayoutBlockTemplate(),
    "",
    romanceModeBlockTemplate(),
    "",
    agencyRuleBlockTemplate(),
    "",
    ...counterpartExampleBlockTemplate(),
    "",
    actorMetadataBlockTemplate(),
    "",
    worldInfoBeforeBlockTemplate(),
    "",
    promptMemoryBlockTemplate(),
    "",
    fullExchangeBlockTemplate(),
    "",
    latestPreviousTurnBlockTemplate(),
    "",
    currentPlayerTurnBlockTemplate(),
    "",
    worldInfoAfterBlockTemplate(),
    "",
    previousVisualBlockTemplate(),
    "",
    recentOutputToAvoidBlockTemplate(),
    "",
    npcPersonnaPromptViewBlockTemplate(),
    "",
    romancePromptViewBlockTemplate(),
    "",
    romanticClichePromptViewBlockTemplate(),
    "",
    sexScenePromptViewBlockTemplate(),
    "",
    agentNotesBlockTemplate(),
    "",
    counterpartNoveltyRequestBlockTemplate(),
    "",
    concreteNoveltyInstructionBlockTemplate(),
    "",
    antiPatternBlockTemplate(),
    "",
    postHistoryInstructionBlockTemplate(),
    "",
    "FINAL TASK:",
    "Write only the next textbox reply for {{npc.name}} and brief third-person scene narration.",
    "Respond directly to CURRENT_TURN.",
    "Follow TURN_REDIRECT as the single accepted novelty direction; do not combine it with other agent ideas.",
    "Execute CONCRETE_NOVELTY_BEAT as one observable move, not as a vague mood, repeated texture, or visible prompt label.",
    "Use agent notes only for continuity, voice, and constraints; do not introduce unaccepted agent candidates.",
    "End with room for {{user.name}} to respond; do not resolve the whole relationship too quickly.",
    "Maximum 65 words.",
    "",
    "OUTPUT ONLY THAT TEXT BELOW:"
  ].join("\n");
}

function layoutAutomaticPlayerAnswerPromptTemplate(): string {
  return [
    playerChoiceIdentityBlockTemplate(),
    "",
    playerChoiceRulesBlockTemplate(),
    "",
    ...playerChoiceExamplesBlockTemplate(),
    "",
    actorMetadataBlockTemplate(),
    "",
    playerChoiceContextBlockTemplate(),
    "",
    playerChoiceNoveltyBlockTemplate(),
    "",
    antiPatternBlockTemplate(),
    "",
    ...playerChoiceFinalTaskBlockTemplate()
  ].join("\n");
}


function noveltySceneTextFromInput(input: RpPromptRenderInput): string {
  const promptContext = buildPromptContextView(input.node);

  return [
    "STORY_SETUP:",
    promptContext.storySetup,
    "",
    "RECENT_EXCHANGE_BEFORE_LATEST:",
    promptContext.priorExchange,
    "",
    "LATEST_PREVIOUS_TURN:",
    promptContext.latestPreviousTurn,
    "",
    "CURRENT_TURN:",
    input.node.userText?.trim() ? `USER: ${input.node.userText.trim()}` : "USER: (empty)",
    input.node.dialogue?.trim() ? `NPC_REPLY: ${input.node.dialogue.trim()}` : "",
    "",
    "PREVIOUS_VISUAL:",
    promptContext.previousVisual,
    "",
    "RECENT_OUTPUT_TO_AVOID:",
    promptContext.recentOutputToAvoid
  ].filter((line) => line !== "").join("\n");
}

async function renderRpAnswerPromptWithResolvedActors(
  input: RpPromptRenderInput,
  runHiddenNoveltyCoherence?: NoveltyCoherenceRunner
): Promise<RpPromptBuildResult> {
  const loop = await runCoherentRedirectPromptLoop(input, romanceAdvancementDeck(), runHiddenNoveltyCoherence);
  const template = layoutCounterpartAnswerPromptTemplate();
  const data = buildPromptTemplateData(loop.promptInput, loop.agentPass, loop.noveltySelection);

  return {
    actorNames: input.actorNames ?? null,
    prompt: renderPromptTemplate(template, data),
    debugTrace: loop.debugTrace
  };
}

export async function buildRpAnswerPromptWithActorNameCache(
  input: RpPromptInput,
  runHiddenActorNameExtraction: ActorNameExtractionRunner,
  runHiddenNoveltyCoherence?: NoveltyCoherenceRunner
): Promise<RpPromptBuildResult> {
  const actorNames = await resolveActorNamesForPrompt(input, runHiddenActorNameExtraction);

  return renderRpAnswerPromptWithResolvedActors({
    ...input,
    actorNames
  }, runHiddenNoveltyCoherence);
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

async function renderAutomaticUserAnswerPromptWithResolvedActors(
  input: RpPromptRenderInput,
  runHiddenNoveltyCoherence?: NoveltyCoherenceRunner
): Promise<RpPromptBuildResult> {
  const loop = await runCoherentRedirectPromptLoop(input, playerResponseAdvancementDeck(), runHiddenNoveltyCoherence);
  const template = layoutAutomaticPlayerAnswerPromptTemplate();
  const data = buildPromptTemplateData(loop.promptInput, loop.agentPass, loop.noveltySelection);

  return {
    actorNames: input.actorNames ?? null,
    prompt: renderPromptTemplate(template, data),
    debugTrace: loop.debugTrace
  };
}

export async function buildAutomaticUserAnswerPromptWithActorNameCache(
  input: RpPromptInput,
  runHiddenActorNameExtraction: ActorNameExtractionRunner,
  runHiddenNoveltyCoherence?: NoveltyCoherenceRunner
): Promise<RpPromptBuildResult> {
  const actorNames = await resolveActorNamesForPrompt(input, runHiddenActorNameExtraction);

  return renderAutomaticUserAnswerPromptWithResolvedActors({
    ...input,
    actorNames
  }, runHiddenNoveltyCoherence);
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
