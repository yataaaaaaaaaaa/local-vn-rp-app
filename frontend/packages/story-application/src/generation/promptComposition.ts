import type { StoryNodeFields } from "@local-vn/story-domain";
import { joinPromptParts } from "@local-vn/story-domain";

import {
  dedupeTags,
  parseVisualPromptPlan
} from "./visualPromptProtocol";

export function buildStoryPositivePrompt(input: {
  fields: StoryNodeFields;
  defaultPositivePrompt?: string | null;
}): string {
  return joinPromptParts([
    resolverTextPromptPart(input.fields.resolverText),
    input.fields.selectedTags,
    input.fields.danbotTags,
    input.defaultPositivePrompt
  ]);
}

function resolverTextPromptPart(resolverText: string): string {
  const text = resolverText.trim();

  if (!text) {
    return "";
  }

  const plan = parseVisualPromptPlan(text);

  if (plan.fixedTags.length > 0 || plan.rawDanbotDescriptions.length > 0) {
    return joinPromptParts([
      plan.fixedTags.length > 0 ? dedupeTags(plan.fixedTags).join(", ") : "",
      ...plan.rawDanbotDescriptions
    ]);
  }

  return text;
}
