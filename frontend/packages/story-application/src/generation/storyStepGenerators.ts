import type { WorkflowGenerationResult, WorkflowStepDefinition, WorkflowStepMode } from "@local-vn/workflow-core";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import {
  createStoryWorkflowStepDescriptors,
  defaultStoryWorkflowModes,
  joinPromptParts,
  storyWorkflowStepIds,
  type StoryNodeFields,
  type StoryWorkflowModes,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";

import type { StoryGenerationBackend } from "../ports";
import {
  buildAutomaticUserAnswerPrompt,
  buildRpAnswerPrompt,
  buildVisualRepresentationPrompt
} from "./rpNovelPrompts";
import { rpNovelLlmRequestConfig } from "./llmRequestConfig";
import {
  buildImageGenerateRequest,
  createImageId,
  createImageRefPayload
} from "./imageOutput";

export interface StoryStepGenerationContext {
  backend: StoryGenerationBackend;
  config: BackendRuntimeConfig;
  storyId: string | null;
  selectedNodeId: string | null;
  outputImageFile?: (storyId: string, imageId: string) => string;
  now?: () => Date;
}

export type StoryWorkflowStep = WorkflowStepDefinition<
  StoryWorkflowStepId,
  StoryNodeFields,
  StoryStepGenerationContext,
  StoryWorkflowPayload
>;

export type StoryWorkflowStepGenerator = (input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}) => Promise<WorkflowGenerationResult<StoryWorkflowPayload>> | WorkflowGenerationResult<StoryWorkflowPayload>;

export type StoryWorkflowStepGenerators = Partial<
  Record<StoryWorkflowStepId, StoryWorkflowStepGenerator>
>;

export function createStoryStepGenerators(): StoryWorkflowStepGenerators {
  return {
    context: generateContextStep,
    userText: generateUserTextStep,
    dialogue: generateDialogueStep,
    visualDescription: generateVisualDescriptionStep,
    resolverText: generateResolverTextStep,
    selectedTags: generateSelectedTagsStep,
    danbot: generateDanbotStep,
    prompt: generatePromptStep,
    image: generateImageStep
  };
}

export function createStoryWorkflowSteps(
  modes: Partial<StoryWorkflowModes> = {}
): StoryWorkflowStep[] {
  const descriptors = createStoryWorkflowStepDescriptors(modes);
  const generators = createStoryStepGenerators();

  return descriptors.map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    mode: (modes[descriptor.id] ?? defaultStoryWorkflowModes[descriptor.id]) as WorkflowStepMode,
    generate: generators[descriptor.id],
    read: descriptor.read,
    write: descriptor.write,
    empty: descriptor.empty,
    merge: descriptor.merge,
    normalize: descriptor.normalize
  }));
}

export const storyWorkflowStepById = Object.fromEntries(
  createStoryWorkflowSteps().map((step) => [step.id, step])
) as Record<StoryWorkflowStepId, StoryWorkflowStep>;

export function generateContextStep(input: {
  document: StoryNodeFields;
}): WorkflowGenerationResult<StoryWorkflowPayload> {
  return {
    value: {
      context: input.document.context
    }
  };
}

export async function generateUserTextStep(input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}): Promise<WorkflowGenerationResult<StoryWorkflowPayload>> {
  const result = await input.context.backend.generateLlm(
    rpNovelLlmRequestConfig(
      input.context.config,
      buildAutomaticUserAnswerPrompt({
        node: input.document,
        storyId: input.context.storyId,
        selectedNodeId: input.context.selectedNodeId
      }),
      {
        max_tokens: Math.min(input.context.config.llm.max_tokens, 80)
      }
    )
  );

  return {
    value: {
      userText: result.text.trim()
    }
  };
}

export async function generateDialogueStep(input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}): Promise<WorkflowGenerationResult<StoryWorkflowPayload>> {
  const result = await input.context.backend.generateLlm(
    rpNovelLlmRequestConfig(
      input.context.config,
      buildRpAnswerPrompt({
        node: input.document,
        storyId: input.context.storyId,
        selectedNodeId: input.context.selectedNodeId
      }),
      {
        max_tokens: Math.min(input.context.config.llm.max_tokens, 140)
      }
    )
  );

  return {
    value: {
      dialogue: result.text.trim()
    }
  };
}

export async function generateVisualDescriptionStep(input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}): Promise<WorkflowGenerationResult<StoryWorkflowPayload>> {
  const result = await input.context.backend.generateLlm(
    rpNovelLlmRequestConfig(
      input.context.config,
      buildVisualRepresentationPrompt({
        node: input.document,
        storyId: input.context.storyId,
        selectedNodeId: input.context.selectedNodeId
      }),
      {
        max_tokens: Math.min(input.context.config.llm.max_tokens, 90)
      }
    )
  );

  const text = result.text.trim();

  return {
    value: {
      visualDescription: text,
      resolverText: text
    }
  };
}

export function generateResolverTextStep(input: {
  document: StoryNodeFields;
}): WorkflowGenerationResult<StoryWorkflowPayload> {
  return {
    value: {
      resolverText:
        input.document.visualDescription ||
        input.document.dialogue ||
        input.document.context
    }
  };
}

export function generateSelectedTagsStep(input: {
  document: StoryNodeFields;
}): WorkflowGenerationResult<StoryWorkflowPayload> {
  return {
    value: {
      selectedTags: input.document.selectedTags
    }
  };
}

export async function generateDanbotStep(input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}): Promise<WorkflowGenerationResult<StoryWorkflowPayload>> {
  const result = await input.context.backend.generateDanbotTags({
    scene_text:
      input.document.visualDescription ||
      input.document.dialogue ||
      input.document.context,
    max_tags: input.context.config.danbot.max_tags,
    model_path: input.context.config.danbot.model_path || undefined
  });

  return {
    value: {
      danbotTags: result.tags.join(", "),
      positivePrompt: result.prompt
    },
    warnings: result.warnings
  };
}

export function generatePromptStep(input: {
  document: StoryNodeFields;
}): WorkflowGenerationResult<StoryWorkflowPayload> {
  return {
    value: {
      positivePrompt:
        input.document.positivePrompt ||
        joinPromptParts([
          input.document.selectedTags,
          input.document.danbotTags
        ]),
      negativePrompt: input.document.negativePrompt || "lowres, bad anatomy"
    }
  };
}

export async function generateImageStep(input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}): Promise<WorkflowGenerationResult<StoryWorkflowPayload>> {
  if (!input.context.storyId || !input.context.selectedNodeId) {
    throw new Error("No selected story/node for image output path.");
  }

  const now = input.context.now?.() ?? new Date();
  const imageId = createImageId({
    nodeId: input.context.selectedNodeId,
    now
  });

  const outputPath = input.context.outputImageFile
    ? input.context.outputImageFile(input.context.storyId, imageId)
    : imageId;

  const result = await input.context.backend.generateImage(
    buildImageGenerateRequest({
      fields: input.document,
      config: input.context.config,
      storyId: input.context.storyId,
      nodeId: input.context.selectedNodeId,
      imageId,
      outputPath,
      seed: now.getTime() % 2147483647
    })
  );

  return {
    value: createImageRefPayload({
      imageId,
      result,
      createdAt: now
    }),
    warnings: result.warnings
  };
}

export function isStoryWorkflowStepId(value: string): value is StoryWorkflowStepId {
  return (storyWorkflowStepIds as readonly string[]).includes(value);
}
