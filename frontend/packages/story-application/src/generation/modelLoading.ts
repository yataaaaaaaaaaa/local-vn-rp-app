import type { BackendRuntimeConfig } from "@local-vn/shared-types";

import type { StoryModelLoadingBackend } from "../ports";

export type { StoryModelLoadingBackend };

export async function loadStoryMechanismModels(
  backend: StoryModelLoadingBackend,
  config: BackendRuntimeConfig
): Promise<void> {
  if (config.llm.model_path) {
    await backend.loadLlmModel({
      backend: "llama_server",
      model_path: config.llm.model_path,
      context_size: config.llm.context_size,
      gpu_layers: config.llm.gpu_layers,
      prompt_format: config.llm.prompt_format,
      startup_timeout_seconds: config.llm.startup_timeout_seconds,
      timeout_seconds: config.llm.timeout_seconds
    });
  }

  if (config.image.model_path) {
    await backend.loadImageModel({
      backend: "diffusers",
      model_type: config.image.model_type,
      model_path: config.image.model_path,
      dtype: config.image.dtype,
      device: config.image.device,
      lora_root: config.image.lora_root,
      embedding_root: config.image.embedding_root,
      manual_lora_paths: config.image.manual_lora_paths
    });
  }

  if (config.danbot.model_path) {
    await backend.loadDanbotModel({
      backend: "danbot_nl",
      model_path: config.danbot.model_path,
      device: config.danbot.device,
      dtype: config.danbot.dtype
    });
  }
}
