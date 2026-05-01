import type { StoryNodeFields, StoryNodeFieldKey } from "@local-vn/shared-types";

export const storyNodeFieldKeys: StoryNodeFieldKey[] = [
  "context",
  "userText",
  "dialogue",
  "visualDescription",
  "resolverText",
  "selectedTags",
  "danbotTags",
  "positivePrompt",
  "negativePrompt",
  "imageRef"
];

export function createEmptyStoryNodeFields(overrides: Partial<StoryNodeFields> = {}): StoryNodeFields {
  return {
    context: "",
    userText: "",
    dialogue: "",
    visualDescription: "",
    resolverText: "",
    selectedTags: "",
    danbotTags: "",
    positivePrompt: "",
    negativePrompt: "lowres, bad anatomy",
    imageRef: "",
    ...overrides
  };
}

export function normalizeStoryNodeFields(fields: Partial<Record<StoryNodeFieldKey, string>>): StoryNodeFields {
  const empty = createEmptyStoryNodeFields();
  for (const key of storyNodeFieldKeys) empty[key] = fields[key] ?? "";
  if (!empty.negativePrompt) empty.negativePrompt = "lowres, bad anatomy";
  return empty;
}
