import type { StoryNodeFields } from "@local-vn/story-domain";

import {
  lastVisualCueFromContext,
  latestPreviousTurnFromContext,
  storySetupFromContext
} from "../state/story-context";
import { normalizeContextSnippet } from "../text/text-utils";

const MAX_PRIOR_EXCHANGE_TURNS = 4;

type PromptContextView = {
  storySetup: string;
  promptMemory: string;
  worldInfoBefore: string;
  worldInfoAfter: string;
  priorExchange: string;
  latestPreviousTurn: string;
  recentOutputToAvoid: string;
  previousVisual: string;
  userText: string;
  dialogue: string;
};

export function buildPromptContextView(node: StoryNodeFields): PromptContextView {
  const context = node.context || "";
  const storySetup = storySetupFromContext(context) || "(empty)";
  const previousVisual = node.visualDescription || lastVisualCueFromContext(context) || "(empty)";
  const recentOutputToAvoid = recentAcceptedOutputToAvoidText(context);

  return {
    storySetup,
    promptMemory: buildPromptMemory(node),
    worldInfoBefore: storySetup,
    worldInfoAfter: buildWorldInfoAfter(),
    priorExchange: priorExchangeFromContext(context) || "(empty)",
    latestPreviousTurn: latestPreviousTurnFromContext(context) || "(empty)",
    recentOutputToAvoid,
    previousVisual,
    userText: node.userText || "(empty)",
    dialogue: node.dialogue || "(empty)"
  };
}

function buildPromptMemory(node: StoryNodeFields): string {
  const memory = [
    node.resolverText?.trim() ? `Resolved visual tags: ${node.resolverText.trim()}` : ""
  ].filter(Boolean);

  return memory.length ? memory.join("\n") : "(empty)";
}

function buildWorldInfoAfter(): string {
  return "(empty)";
}

function priorExchangeFromContext(context: string): string {
  const turns = previousTurnsFromContext(context);
  const priorTurns = turns.slice(0, -1).slice(-MAX_PRIOR_EXCHANGE_TURNS);

  return priorTurns.length ? priorTurns.join("\n\n") : "";
}

function recentAcceptedOutputToAvoidText(context: string): string {
  const outputs = previousTurnsFromContext(context)
    .slice(-3)
    .flatMap((turn) => turn.split("\n"))
    .map((line) => normalizeContextSnippet(line.replace(/^[^:]{1,40}:\s*/, "")))
    .filter(Boolean)
    .slice(-5);

  return outputs.length ? outputs.join("\n") : "(empty)";
}

function previousTurnsFromContext(context: string): string[] {
  return [
    ...context.matchAll(
      /(?:^|\n)PREVIOUS_TURN:\s*([\s\S]*?)(?=\nPREVIOUS_TURN:|\nLATEST_PREVIOUS_TURN:|\nCURRENT_TURN:|\nFINAL TASK:|$)/g
    )
  ]
    .map((match) => normalizeContextSnippet(match[1]))
    .filter(Boolean);
}
