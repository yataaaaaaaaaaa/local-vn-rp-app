import type { RpPromptInput } from "../types";
import type { AgentRunInput } from "./types";

export function promptInputFromAgentRun(input: AgentRunInput): RpPromptInput {
  return applyForcedNoveltyToPromptInput(input.promptInput ?? { node: input.node }, input.forcedNovelty);
}

export function applyForcedNoveltyToPromptInput<TInput extends RpPromptInput>(
  input: TInput,
  forcedNovelty?: AgentRunInput["forcedNovelty"]
): TInput {
  if (!forcedNovelty) return input;

  return {
    ...input,
    advancementCard: hasOwn(forcedNovelty, "advancementCard")
      ? forcedNovelty.advancementCard
      : input.advancementCard,
    recentBeatTypes: forcedNovelty.recentBeatTypes ?? input.recentBeatTypes,
    boundaryDetected: hasOwn(forcedNovelty, "boundaryDetected")
      ? forcedNovelty.boundaryDetected
      : input.boundaryDetected
  } as TInput;
}

export function forcedForbiddenFragments(input: AgentRunInput): string[] {
  return input.forcedNovelty?.forbiddenFragments ?? [];
}

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}
