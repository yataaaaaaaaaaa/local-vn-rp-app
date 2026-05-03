import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import type { StoryNodeFields } from "@local-vn/story-domain";

export interface GlobalPromptDefaults {
  defaultPositivePrompt: string;
  defaultNegativePrompt: string;
}

export function readGlobalPromptDefaults(
  config: BackendRuntimeConfig
): GlobalPromptDefaults {
  return {
    defaultPositivePrompt: config.prompts.default_positive_prompt.trim(),
    defaultNegativePrompt: config.prompts.default_negative_prompt.trim()
  };
}

export function resolvePositivePrompt(input: {
  fields: StoryNodeFields;
  defaults: GlobalPromptDefaults;
  fallback?: string;
}): string {
  return joinDistinctPromptBlocks(
    input.defaults.defaultPositivePrompt,
    input.fields.positivePrompt,
    input.fallback
  );
}

export function resolveNegativePrompt(input: {
  fields: StoryNodeFields;
  defaults: GlobalPromptDefaults;
}): string {
  return joinDistinctPromptBlocks(
    input.defaults.defaultNegativePrompt,
    input.fields.negativePrompt
  );
}

export function joinDistinctPromptBlocks(
  ...parts: Array<string | null | undefined>
): string {
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const part of parts) {
    const trimmed = part?.trim() ?? "";

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    blocks.push(trimmed);
  }

  return blocks.join("\n\n");
}
