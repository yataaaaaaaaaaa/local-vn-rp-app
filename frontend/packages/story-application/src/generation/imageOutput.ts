import type {
  BackendRuntimeConfig,
  ImageGenerateRequest,
  ImageGenerateResponse
} from "@local-vn/shared-types";
import type {
  ImageRef,
  StoryNodeFields
} from "@local-vn/story-domain";
import { stringifyImageRef } from "@local-vn/story-domain";

export function createImageId(input: {
  nodeId: string;
  now?: Date | number;
}): string {
  const timestamp =
    typeof input.now === "number"
      ? input.now
      : (input.now ?? new Date()).getTime();

  return `node_${input.nodeId}_${timestamp}`;
}

export function buildImageGenerateRequest(input: {
  fields: StoryNodeFields;
  config: BackendRuntimeConfig;
  storyId: string;
  nodeId: string;
  imageId: string;
  outputPath: string;
  seed?: number;
}): ImageGenerateRequest {
  return {
    positive_prompt:
      input.fields.positivePrompt ||
      input.fields.selectedTags ||
      input.fields.danbotTags,
    negative_prompt: input.fields.negativePrompt,
    model_path: input.config.image.model_path || undefined,
    width: input.config.image.default_width,
    height: input.config.image.default_height,
    steps: input.config.image.default_steps,
    cfg_scale: input.config.image.default_cfg_scale,
    sampler: input.config.image.sampler,
    scheduler: input.config.image.scheduler,
    seed: input.seed ?? Date.now() % 2147483647,
    timeout_seconds: input.config.image.timeout_seconds,
    output_path: input.outputPath,
    metadata: {
      story_id: input.storyId,
      node_id: input.nodeId,
      image_id: input.imageId
    }
  };
}

export function createImageRefFromGenerationResult(input: {
  imageId: string;
  result: ImageGenerateResponse;
  createdAt?: Date;
}): ImageRef {
  return {
    image_id: input.imageId,
    image_path: input.result.image_path,
    metadata_path: input.result.metadata_path,
    seed: input.result.seed,
    created_at: (input.createdAt ?? new Date()).toISOString()
  };
}

export function createImageRefPayload(input: {
  imageId: string;
  result: ImageGenerateResponse;
  createdAt?: Date;
}): { imageRef: string } {
  return {
    imageRef: stringifyImageRef(
      createImageRefFromGenerationResult({
        imageId: input.imageId,
        result: input.result,
        createdAt: input.createdAt
      })
    )
  };
}
