import type { StoryNodeFields } from "@local-vn/story-domain";

import { normalizeContextSnippet } from "../cleaning/text-utils";

export function compactStoryContext(context: string): string {
  const normalized = context
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return normalized || "(empty)";
}

export function storySetupFromContext(context: string): string {
  const withoutTurns = context.split(/(?:^|\n)PREVIOUS_TURN:/)[0] ?? "";
  return compactStoryContext(withoutTurns);
}

export function fullExchangeFromContext(context: string): string {
  const matches = [
    ...context.matchAll(
      /(?:^|\n)PREVIOUS_TURN:\s*([\s\S]*?)(?=\nPREVIOUS_TURN:|\nLATEST_PREVIOUS_TURN:|\nCURRENT_TURN:|\nFINAL TASK:|$)/g
    )
  ];
  const turns = matches.map((match) => normalizeContextSnippet(match[1])).filter(Boolean);

  return turns.length ? turns.join("\n\n") : "";
}

export function latestPreviousTurnFromContext(context: string): string {
  const matches = [
    ...context.matchAll(
      /(?:^|\n)PREVIOUS_TURN:\s*([\s\S]*?)(?=\nPREVIOUS_TURN:|\nLATEST_PREVIOUS_TURN:|\nCURRENT_TURN:|\nFINAL TASK:|$)/g
    )
  ];

  return normalizeContextSnippet(matches.at(-1)?.[1] ?? "");
}

export function lastVisualCueFromContext(context: string): string {
  const matches = [...context.matchAll(/(?:^|\n)(?:VISUAL_CUE|Visible scene):\s*(.+?)(?=\n[A-Z_ ]+:|\n\n|$)/gis)];

  return normalizeContextSnippet(matches.at(-1)?.[1] ?? "");
}

export function recentOutputToAvoidText(node: StoryNodeFields): string {
  const turns = recentOutputsFromNode(node).slice(-5);
  return turns.length ? turns.join("\n") : "(empty)";
}

export function recentOutputsFromNode(node: StoryNodeFields): string[] {
  const context = node.context || "";
  const contextOutputs = [
    ...context.matchAll(
      /(?:USER|NPC|NPC_REPLY|VISUAL_CUE):\s*(.+?)(?=\n(?:USER|NPC|NPC_REPLY|VISUAL_CUE|PREVIOUS_TURN|LATEST_PREVIOUS_TURN|CURRENT_TURN):|$)/gis
    )
  ].map((match) => normalizeContextSnippet(match[1]));

  return [...contextOutputs, node.userText, node.dialogue, node.visualDescription]
    .map((part) => normalizeContextSnippet(part || ""))
    .filter(Boolean)
    .slice(-16);
}

export function previousTurnCount(context: string): number {
  return [...context.matchAll(/(?:^|\n)PREVIOUS_TURN:/g)].length;
}
