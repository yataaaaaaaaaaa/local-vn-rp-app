import type { BackendRuntimeConfig, StoryConfig } from "@local-vn/shared-types";

export type BackendRuntimeConfigPatch = Partial<{
  config_version: 1;
  backend: Partial<BackendRuntimeConfig["backend"]>;
  llm: Partial<BackendRuntimeConfig["llm"]>;
  image: Partial<BackendRuntimeConfig["image"]>;
  prompts: Partial<BackendRuntimeConfig["prompts"]>;
  novelty: Partial<BackendRuntimeConfig["novelty"]>;
  danbot: Partial<BackendRuntimeConfig["danbot"]>;
}>;

export function createDefaultBackendRuntimeConfig(overrides: BackendRuntimeConfigPatch = {}): BackendRuntimeConfig {
  const base: BackendRuntimeConfig = {
    config_version: 1,
    backend: {
      baseUrl: "http://127.0.0.1:17860",
      host: "127.0.0.1",
      port: 17860,
      startup_timeout_seconds: 30
    },
    llm: {
      backend: "llama_server",
      model_path: "",
      context_size: 8192,
      gpu_layers: "auto",
      prompt_format: "mistral_inst",
      startup_timeout_seconds: 90,
      timeout_seconds: 120,
      max_tokens: 96,
      temperature: 0.7,
      top_p: 1,
      top_k: 40,
      min_p: 0.05,
      repeat_penalty: 1
    },
    image: {
      backend: "diffusers",
      model_type: "sdxl",
      model_path: "",
      dtype: "fp16",
      device: "cuda",
      lora_root: "",
      embedding_root: "",
      manual_lora_paths: [],
      default_width: 1024,
      default_height: 1024,
      default_steps: 28,
      default_cfg_scale: 5.5,
      sampler: "euler_ancestral",
      scheduler: "normal",
      timeout_seconds: 180
    },
    prompts: {
      default_positive_prompt: "",
      default_negative_prompt: "lowres, bad anatomy"
    },
    novelty: {
      level: 1,
      agent_influence: 1,
      romance_cliche_influence: 1,
      npc_personna_influence: 1,
      sex_scene_influence: 1,
      repetition_guard: 1,
      detail_budget: 1,
      coherence_retries: 3,
      candidate_pool_size: 8
    },
    danbot: {
      backend: "danbot_nl",
      model_path: "",
      device: "cpu",
      dtype: "auto",
      max_tags: 80
    }
  };
  return mergeBackendRuntimeConfig(base, overrides);
}

export function createDefaultStoryConfig(storyId: string, title: string): StoryConfig {
  return {
    config_version: 1,
    story_id: storyId,
    title,
    image_mode_policy: "automatic",
    forbidden_tags: [],
    default_negative_prompt: "lowres, bad anatomy"
  };
}

function mergeBackendRuntimeConfig(base: BackendRuntimeConfig, overrides: BackendRuntimeConfigPatch): BackendRuntimeConfig {
  return {
    ...base,
    ...overrides,
    config_version: 1,
    backend: { ...base.backend, ...overrides.backend },
    llm: { ...base.llm, ...stripRuntimeOwnedLlmSettings(overrides.llm), backend: "llama_server" },
    image: { ...base.image, ...overrides.image, backend: "diffusers", manual_lora_paths: overrides.image?.manual_lora_paths ?? base.image.manual_lora_paths },
    prompts: { ...base.prompts, ...overrides.prompts },
    novelty: { ...base.novelty, ...overrides.novelty },
    danbot: { ...base.danbot, ...overrides.danbot, backend: "danbot_nl" }
  };
}

function stripRuntimeOwnedLlmSettings(value: BackendRuntimeConfigPatch["llm"]): Partial<BackendRuntimeConfig["llm"]> | undefined {
  if (!value) return undefined;
  const {
    llama_server_path: _llamaServerPath,
    llama_server_host: _llamaServerHost,
    llama_server_port: _llamaServerPort,
    ...clean
  } = value as Partial<BackendRuntimeConfig["llm"]> & {
    llama_server_path?: unknown;
    llama_server_host?: unknown;
    llama_server_port?: unknown;
  };
  return clean;
}
