import type { BackendClient } from "@local-vn/backend-client";
import {
  buildAutomaticUserAnswerPrompt,
  buildRpAnswerPrompt,
  buildVisualRepresentationPrompt,
  outputImageFile,
  rpNovelLlmRequestConfig
} from "@local-vn/config";
import type { BackendRuntimeConfig, ImageRef, StoryNodeFieldKey, StoryNodeFields } from "@local-vn/shared-types";
import { stringifyImageRef } from "@local-vn/story-tree";
import type { WorkflowStepDefinition, WorkflowStepMode } from "./workflowCore";

export const storyWorkflowStepIds = [
  "context",
  "userText",
  "dialogue",
  "visualDescription",
  "resolverText",
  "selectedTags",
  "danbot",
  "prompt",
  "image"
] as const;

export type StoryWorkflowStepId = typeof storyWorkflowStepIds[number];
export type StoryWorkflowPayload = Partial<Record<StoryNodeFieldKey, string>>;

export interface StoryWorkflowContext {
  backend: Pick<BackendClient, "generateLlm" | "generateDanbotTags" | "generateImage">;
  config: BackendRuntimeConfig;
  storyId: string | null;
  selectedNodeId: string | null;
}

export type StoryWorkflowStep = WorkflowStepDefinition<StoryWorkflowStepId, StoryNodeFields, StoryWorkflowContext, StoryWorkflowPayload>;
export type StoryWorkflowModes = Partial<Record<StoryWorkflowStepId, WorkflowStepMode>>;
export type StoryWorkflowAutoValidateByStepId = Record<StoryWorkflowStepId, boolean>;

export const defaultStoryWorkflowModes: Record<StoryWorkflowStepId, WorkflowStepMode> = {
  context: "auto",
  userText: "manual",
  dialogue: "manual",
  visualDescription: "auto",
  resolverText: "auto",
  selectedTags: "auto",
  danbot: "auto",
  prompt: "auto",
  image: "auto"
};

export const defaultStoryWorkflowAutoValidateGeneratedCandidate: StoryWorkflowAutoValidateByStepId = {
  context: true,
  userText: true,
  dialogue: true,
  visualDescription: true,
  resolverText: true,
  selectedTags: true,
  danbot: true,
  prompt: true,
  image: true
};

export function createStoryWorkflowSteps(modes: StoryWorkflowModes = {}): StoryWorkflowStep[] {
  const modeFor = (id: StoryWorkflowStepId) => modes[id] ?? defaultStoryWorkflowModes[id];

  return [
    {
      id: "context",
      label: "Context",
      mode: modeFor("context"),
      generate: ({ document }) => ({ value: { context: document.context } }),
      read: readFields(["context"]),
      write: writeFields,
      empty: emptyFields(["context"]),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "userText",
      label: "User Text",
      mode: modeFor("userText"),
      generate: async ({ document, context }) => {
        const result = await context.backend.generateLlm({
          prompt: buildAutomaticUserAnswerPrompt({
            node: document,
            storyId: context.storyId,
            selectedNodeId: context.selectedNodeId
          }),
          ...rpNovelLlmRequestConfig(context.config),
          max_tokens: Math.min(context.config.llm.max_tokens, 180)
        });
        return { value: { userText: result.text.trim() } };
      },
      read: readFields(["userText"]),
      write: writeFields,
      empty: emptyFields(["userText"]),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "dialogue",
      label: "Dialogue",
      mode: modeFor("dialogue"),
      generate: async ({ document, context }) => {
        const result = await context.backend.generateLlm({
          prompt: buildRpAnswerPrompt({
            node: document,
            storyId: context.storyId,
            selectedNodeId: context.selectedNodeId
          }),
          ...rpNovelLlmRequestConfig(context.config)
        });
        return { value: { dialogue: result.text.trim() } };
      },
      read: readFields(["dialogue"]),
      write: writeFields,
      empty: emptyFields(["dialogue"]),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "visualDescription",
      label: "Visual Description",
      mode: modeFor("visualDescription"),
      generate: async ({ document, context }) => {
        const result = await context.backend.generateLlm({
          prompt: buildVisualRepresentationPrompt({
            node: document,
            storyId: context.storyId,
            selectedNodeId: context.selectedNodeId
          }),
          ...rpNovelLlmRequestConfig(context.config)
        });
        return { value: { visualDescription: result.text.trim(), resolverText: result.text.trim() } };
      },
      read: readFields(["visualDescription"]),
      write: writeFields,
      empty: emptyFields(["visualDescription"]),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "resolverText",
      label: "Resolver Text",
      mode: modeFor("resolverText"),
      generate: ({ document }) => ({ value: { resolverText: document.visualDescription || document.dialogue || document.context } }),
      read: readFields(["resolverText"]),
      write: writeFields,
      empty: emptyFields(["resolverText"]),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "selectedTags",
      label: "Tags",
      mode: modeFor("selectedTags"),
      generate: ({ document }) => ({ value: { selectedTags: document.selectedTags } }),
      read: readFields(["selectedTags"]),
      write: writeFields,
      empty: emptyFields(["selectedTags"]),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "danbot",
      label: "DanBot",
      mode: modeFor("danbot"),
      generate: async ({ document, context }) => {
        const result = await context.backend.generateDanbotTags({
          scene_text: document.visualDescription || document.dialogue || document.context,
          max_tags: context.config.danbot.max_tags,
          model_path: context.config.danbot.model_path || undefined
        });
        return {
          value: {
            danbotTags: result.tags.join(", "),
            positivePrompt: result.prompt
          },
          warnings: result.warnings
        };
      },
      read: readFields(["danbotTags", "positivePrompt"]),
      write: writeFields,
      empty: emptyFields(["danbotTags", "positivePrompt"]),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "prompt",
      label: "Prompt",
      mode: modeFor("prompt"),
      generate: ({ document, context }) => ({
        value: {
          positivePrompt: document.positivePrompt || joinPromptParts(document.selectedTags, document.danbotTags),
          negativePrompt: document.negativePrompt || "lowres, bad anatomy"
        }
      }),
      read: readFields(["positivePrompt", "negativePrompt"]),
      write: writeFields,
      empty: () => ({ positivePrompt: "", negativePrompt: "lowres, bad anatomy" }),
      merge: mergePayload,
      normalize: trimFields
    },
    {
      id: "image",
      label: "Image",
      mode: modeFor("image"),
      generate: async ({ document, context }) => {
        if (!context.storyId || !context.selectedNodeId) throw new Error("No selected story/node for image output path.");
        const imageId = `node_${context.selectedNodeId}_${Date.now()}`;
        const result = await context.backend.generateImage({
          positive_prompt: document.positivePrompt || document.selectedTags || document.danbotTags,
          negative_prompt: document.negativePrompt,
          model_path: context.config.image.model_path || undefined,
          width: context.config.image.default_width,
          height: context.config.image.default_height,
          steps: context.config.image.default_steps,
          cfg_scale: context.config.image.default_cfg_scale,
          sampler: context.config.image.sampler,
          scheduler: context.config.image.scheduler,
          seed: Date.now() % 2147483647,
          timeout_seconds: context.config.image.timeout_seconds,
          output_path: outputImageFile(context.storyId, imageId),
          metadata: { story_id: context.storyId, node_id: context.selectedNodeId, image_id: imageId }
        });
        const imageRef: ImageRef = {
          image_id: imageId,
          image_path: result.image_path,
          metadata_path: result.metadata_path,
          seed: result.seed,
          created_at: new Date().toISOString()
        };
        return { value: { imageRef: stringifyImageRef(imageRef) }, warnings: result.warnings };
      },
      read: readFields(["imageRef"]),
      write: writeFields,
      empty: emptyFields(["imageRef"]),
      merge: mergePayload,
      normalize: trimFields
    }
  ];
}

export const storyWorkflowStepById = Object.fromEntries(
  createStoryWorkflowSteps().map((step) => [step.id, step])
) as Record<StoryWorkflowStepId, StoryWorkflowStep>;

export function fieldsForStoryWorkflowStep(stepId: StoryWorkflowStepId): StoryNodeFieldKey[] {
  switch (stepId) {
    case "context": return ["context"];
    case "userText": return ["userText"];
    case "dialogue": return ["dialogue"];
    case "visualDescription": return ["visualDescription"];
    case "resolverText": return ["resolverText"];
    case "selectedTags": return ["selectedTags"];
    case "danbot": return ["danbotTags", "positivePrompt"];
    case "prompt": return ["positivePrompt", "negativePrompt"];
    case "image": return ["imageRef"];
  }
}

function readFields(fields: StoryNodeFieldKey[]): (document: StoryNodeFields) => StoryWorkflowPayload {
  return (document) => Object.fromEntries(fields.map((field) => [field, document[field] ?? ""])) as StoryWorkflowPayload;
}

function emptyFields(fields: StoryNodeFieldKey[]): () => StoryWorkflowPayload {
  return () => Object.fromEntries(fields.map((field) => [field, ""])) as StoryWorkflowPayload;
}

function writeFields(document: StoryNodeFields, payload: StoryWorkflowPayload): StoryNodeFields {
  return { ...document, ...payload };
}

function mergePayload(base: StoryWorkflowPayload, patch: Partial<StoryWorkflowPayload>): StoryWorkflowPayload {
  return { ...base, ...patch };
}

function trimFields(payload: StoryWorkflowPayload): StoryWorkflowPayload {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  ) as StoryWorkflowPayload;
}

function joinPromptParts(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(", ");
}
