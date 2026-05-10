import { withNoveltyControls, type CandidateScoringContext } from "../novelty/candidate-scoring";
import { renderPromptTemplate } from "../prompt/mustache-renderer";
import { resolvedActorLabels, sentenceStart } from "../state/actor-state";
import {
  compactStoryContext,
  lastVisualCueFromContext,
  storySetupFromContext
} from "../state/story-context";
import type { AdvancementCard, BeatType, RpPromptRenderInput } from "../types";
import { promptInputFromAgentRun } from "./agent-run-helpers";
import { ROMANCE_AGENT, selectVisualRomanceAdvancement } from "./romance-agent";
import type { RpAgent } from "./types";

type VisualPromptTemplateData = {
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
  antiPatterns: Array<{ text: string }>;
};

export const VISUAL_CUE_AGENT: RpAgent = {
  id: "visual_cue_agent",
  run(input) {
    const promptInput = promptInputFromAgentRun(input);
    const renderInput: RpPromptRenderInput = {
      ...promptInput,
      actorNames: input.actorNames ?? null
    };
    const romanceContribution = ROMANCE_AGENT.run({
      node: renderInput.node,
      promptInput: renderInput,
      forcedNovelty: input.forcedNovelty
    });
    const romance = romancePromptViewFromContribution(romanceContribution);
    const noveltyContext = withNoveltyControls(
      romanceContribution.novelty?.context!,
      renderInput.novelty
    );
    const advancementCard = selectVisualRomanceAdvancement(renderInput, noveltyContext);
    const prompt = renderPromptTemplate(
      layoutVisualRepresentationPromptTemplate(),
      buildVisualPromptTemplateData(renderInput, romance, noveltyContext, advancementCard)
    );

    return {
      facts: {},
      fixedTags: [],
      prompt,
      promptViews: {
        romance
      },
      novelty: {
        context: noveltyContext
      }
    };
  }
};

function buildVisualPromptTemplateData(
  input: RpPromptRenderInput,
  romance: Record<string, unknown>,
  noveltyContext: CandidateScoringContext,
  selectedBeat: AdvancementCard
): VisualPromptTemplateData {
  const labels = resolvedActorLabels(input.actorNames ?? null);

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
      fullExchange: "",
      latestPreviousTurn: "",
      recentOutputToAvoid: "",
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
    antiPatterns: []
  };
}

function romancePromptViewFromContribution(contribution: ReturnType<typeof ROMANCE_AGENT.run>): Record<string, unknown> {
  return (contribution.promptViews?.romance as Record<string, unknown> | undefined) ?? {};
}

function layoutVisualRepresentationPromptTemplate(): string {
  return [
    "You write simple literal visual cues for anime image tagging and VN scene display.",
    "",
    "VISUAL_RULES:",
    "- Output VISUAL_CUE only.",
    "- One or two short sentences, maximum 40 words.",
    "- Literal visible facts only: character count, pose, proximity, clothing, setting, props, lighting, and expression.",
    "- Preserve stable character identity and appearance from FULL_STORY_CONTEXT; infer known visible traits from it when present.",
    "- Use CURRENT_TURN as the newest visible state.",
    "- Use {{user.name}} and {{npc.name}} as visual references when names are known.",
    "- Capture romantic tension visually through body language, distance, hands, gaze, lighting, and meaningful objects.",
    "- Do not add new story events, new characters, dialogue, thoughts, feelings, motives, desire, or actions not present in the scene.",
    "- Do not output markdown, labels, explanations, or poetic abstraction.",
    "",
    ...visualExampleBlockTemplate(),
    "",
    actorMetadataBlockTemplate(),
    "",
    storyContextBlockTemplate(),
    "",
    previousVisualBlockTemplate(),
    "",
    currentResolvedTurnBlockTemplate(),
    "",
    romancePromptViewBlockTemplate(),
    "",
    visualRedirectGuideBlockTemplate(),
    "",
    "FINAL TASK:",
    "Write the literal VISUAL_CUE only. Represent the current romance beat visually without inventing new plot.",
    "",
    "OUTPUT ONLY THE VISUAL_CUE TEXT BELOW:"
  ].join("\n");
}

function visualExampleBlockTemplate(): string[] {
  return [
    "GOOD VISUAL_CUE EXAMPLES:",
    "Two characters stand close beside an oak table under warm lantern light, hands paused near each other above open books.",
    "{{npc.Name}} faces {{user.name}} in a quiet doorway, shoulders relaxed, candlelight catching the edge of a remembered ribbon.",
    "",
    "BAD VISUAL_CUE EXAMPLES:",
    "Her heart races with forbidden desire.",
    "They confess their love and kiss passionately.",
    "A masked rival enters the room."
  ];
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

function storyContextBlockTemplate(): string {
  return [
    "FULL_STORY_CONTEXT:",
    "{{node.storyContext}}",
    "",
    "This is the full accumulated story memory. Use it for continuity, callbacks, tone, and consequences."
  ].join("\n");
}

function previousVisualBlockTemplate(): string {
  return ["PREVIOUS_VISUAL:", "{{node.previousVisual}}"].join("\n");
}

function currentResolvedTurnBlockTemplate(): string {
  return ["CURRENT_TURN:", "USER: {{node.userText}}", "NPC_REPLY: {{node.dialogue}}"].join("\n");
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

function visualRedirectGuideBlockTemplate(): string {
  return [
    "VISUAL_REDIRECT_GUIDE:",
    "- Guide: {{beat.label}}.",
    "- Tags: {{beat.tags}}.",
    "- Direction: {{beat.directive}}",
    "- Constraint: {{beat.constraint}}",
    "- Avoid: {{beat.avoid}}",
    "- Render this as visible composition only; do not invent new story action."
  ].join("\n");
}
