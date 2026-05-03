import type { BackendClient } from "@local-vn/backend-client";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";

export type StoryMechanismBackend = Pick<
  BackendClient,
  "generateLlm" | "generateDanbotTags" | "generateImage" | "loadLlm" | "loadDanbot" | "loadImageModel"
>;

export async function loadStoryMechanismModels(backend: StoryMechanismBackend, config: BackendRuntimeConfig) {
  const llmStatus = await backend.loadLlm({
    backend: "llama_server",
    model_path: config.llm.model_path,
    context_size: config.llm.context_size,
    gpu_layers: config.llm.gpu_layers,
    prompt_format: config.llm.prompt_format,
    startup_timeout_seconds: config.llm.startup_timeout_seconds,
    timeout_seconds: config.llm.timeout_seconds
  });
  const danbotStatus = await backend.loadDanbot({
    backend: "danbot_nl",
    model_path: config.danbot.model_path,
    device: config.danbot.device,
    dtype: config.danbot.dtype
  });
  const imageStatus = await backend.loadImageModel({
    backend: "diffusers",
    model_path: config.image.model_path,
    model_type: config.image.model_type,
    dtype: config.image.dtype,
    device: config.image.device,
    lora_root: config.image.lora_root,
    embedding_root: config.image.embedding_root,
    manual_lora_paths: config.image.manual_lora_paths
  });

  return { llmStatus, danbotStatus, imageStatus };
}
