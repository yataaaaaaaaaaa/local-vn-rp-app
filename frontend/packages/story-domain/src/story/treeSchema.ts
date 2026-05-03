import type { TextTreeSchema } from "@replayable-text-tree/core";

export const storyTreeSchema = {
  fields: {
    context: { storage: "diff" },
    userText: { storage: "diff" },
    dialogue: { storage: "diff" },
    visualDescription: { storage: "diff" },
    resolverText: { storage: "raw" },
    selectedTags: { storage: "raw" },
    danbotTags: { storage: "raw" },
    positivePrompt: { storage: "raw" },
    negativePrompt: { storage: "raw" },
    imageRef: { storage: "raw" }
  }
} satisfies TextTreeSchema;
