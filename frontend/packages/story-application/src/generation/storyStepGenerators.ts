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
  RP_DIALOGUE_STOP,
  RP_NOVEL_STOP,
  buildAutomaticUserAnswerPrompt,
  buildRpAnswerPrompt,
  buildVisualRepresentationPrompt,
  cleanDialogueOutput,
  cleanUserTextOutput,
  cleanVisualDescriptionOutput
} from "./rpNovelPrompts";
import { rpNovelLlmRequestConfig } from "./llmRequestConfig";
import {
  buildImageGenerateRequest,
  createImageId,
  createImageRefPayload
} from "./imageOutput";
import { generateVisualPromptPlan } from "./visualPromptPlanner";
import type { ResolverTextTraceEntry } from "./resolverTextTrace";
import type {
  ActionCompositionNode,
  ActionCompositionSelectionIssue
} from "./actionCompositionTree";
import {
  dedupeTags,
  parseVisualPromptPlan
} from "./visualPromptProtocol";

export interface StoryStepGenerationContext {
  backend: StoryGenerationBackend;
  config: BackendRuntimeConfig;
  storyId: string | null;
  selectedNodeId: string | null;
  outputImageFile?: (storyId: string, imageId: string) => string;
  actionCompositionTree?: ActionCompositionNode | null;
  actionCompositionSeed?: number;
  onActionCompositionSelectionError?: (issue: ActionCompositionSelectionIssue) => void;
  onResolverTextTrace?: (entries: ResolverTextTraceEntry[]) => void | Promise<void>;
  now?: () => Date;
  abortSignal?: AbortSignal;
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
}) =>
  | Promise<WorkflowGenerationResult<StoryWorkflowPayload>>
  | WorkflowGenerationResult<StoryWorkflowPayload>;

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
    image: generateImageStep,
    nextScene: generateNextSceneStep
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
    mode: (modes[descriptor.id] ??
      defaultStoryWorkflowModes[descriptor.id]) as WorkflowStepMode,
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
        max_tokens: Math.min(input.context.config.llm.max_tokens, 40),
        stop: RP_DIALOGUE_STOP
      }
    ),
    { signal: input.context.abortSignal }
  );

  return {
    value: {
      userText: cleanUserTextOutput(result.text)
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
        max_tokens: Math.min(input.context.config.llm.max_tokens, 96),
        stop: RP_DIALOGUE_STOP
      }
    ),
    { signal: input.context.abortSignal }
  );

  return {
    value: {
      dialogue: cleanDialogueOutput(result.text)
    }
  };
}

export async function generateVisualDescriptionStep(input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}): Promise<WorkflowGenerationResult<StoryWorkflowPayload>> {
  if (input.document.userText.trim() && !input.document.dialogue.trim()) {
    return {
      value: {
        visualDescription: "",
        resolverText: ""
      },
      warnings: ["Skipped visual cue generation because NPC_REPLY is empty."]
    };
  }

  const result = await input.context.backend.generateLlm(
    rpNovelLlmRequestConfig(
      input.context.config,
      buildVisualRepresentationPrompt({
        node: input.document,
        storyId: input.context.storyId,
        selectedNodeId: input.context.selectedNodeId
      }),
      {
        max_tokens: Math.min(input.context.config.llm.max_tokens, 64),
        temperature: Math.min(input.context.config.llm.temperature, 0.35),
        stop: RP_NOVEL_STOP
      }
    ),
    { signal: input.context.abortSignal }
  );

  const text = cleanVisualDescriptionOutput(result.text);

  return {
    value: {
      visualDescription: text,
      resolverText: ""
    }
  };
}

export async function generateResolverTextStep(input: {
  document: StoryNodeFields;
  context: StoryStepGenerationContext;
}): Promise<WorkflowGenerationResult<StoryWorkflowPayload>> {
  const visualDescription = input.document.visualDescription.trim();

  if (!visualDescription) {
    return {
      value: {
        resolverText: ""
      },
      warnings: ["No visual description available for resolver planning."]
    };
  }

  const planResult = await generateVisualPromptPlan({
    backend: input.context.backend,
    config: input.context.config,
    node: input.document,
    storyId: input.context.storyId,
    selectedNodeId: input.context.selectedNodeId,
    actionCompositionTree: input.context.actionCompositionTree,
    actionCompositionSeed: input.context.actionCompositionSeed,
    onActionCompositionSelectionError: input.context.onActionCompositionSelectionError,
    abortSignal: input.context.abortSignal
  });

  await input.context.onResolverTextTrace?.(planResult.traceEntries);

  return {
    value: {
      resolverText: planResult.resolverText
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
  const resolverText = input.document.resolverText.trim();
  const fallbackText = input.document.visualDescription.trim();

  if (!resolverText && !fallbackText) {
    return {
      value: {
        danbotTags: "",
        positivePrompt: input.document.selectedTags.trim()
      },
      warnings: ["No tagger-safe visual cue available for DanBot."]
    };
  }

  const plan = resolverText
    ? parseVisualPromptPlan(resolverText)
    : {
      fixedTags: [],
      rawDanbotDescriptions: [fallbackText]
    };

  const rawDescriptions = resolverText
    ? plan.rawDanbotDescriptions
    : plan.rawDanbotDescriptions.length
      ? plan.rawDanbotDescriptions
      : [fallbackText];

  const allDanbotTags: string[] = [];
  const warnings: string[] = [];

  for (const rawDescription of rawDescriptions) {
    const text = rawDescription.trim();

    if (!text) {
      continue;
    }

    const result = await input.context.backend.generateDanbotTags(
      {
        scene_text: text,
        max_tags: input.context.config.danbot.max_tags,
        model_path: input.context.config.danbot.model_path || undefined
      },
      { signal: input.context.abortSignal }
    );

    allDanbotTags.push(...result.tags);
    warnings.push(...result.warnings);
  }

  const manuallySelectedTags = splitPromptTags(input.document.selectedTags);

  const positiveTags = dedupeTags([
    ...manuallySelectedTags,
    ...plan.fixedTags,
    ...allDanbotTags
  ]);

  return {
    value: {
      danbotTags: dedupeTags(allDanbotTags).join(", "),
      positivePrompt: positiveTags.join(", ")
    },
    warnings
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
    }),
    { signal: input.context.abortSignal }
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

export function generateNextSceneStep(): WorkflowGenerationResult<StoryWorkflowPayload> {
  return {
    value: {}
  };
}

export function isStoryWorkflowStepId(value: string): value is StoryWorkflowStepId {
  return (storyWorkflowStepIds as readonly string[]).includes(value);
}

function splitPromptTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
