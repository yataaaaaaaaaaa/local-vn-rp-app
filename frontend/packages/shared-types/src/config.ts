export interface StoryNodeFields {
  context: string;
  userText: string;
  dialogue: string;
  visualDescription: string;
  resolverText: string;
  selectedTags: string;
  danbotTags: string;
  positivePrompt: string;
  negativePrompt: string;
  imageRef: string;
}

export type StoryNodeFieldKey = keyof StoryNodeFields;

export interface LauncherArgs {
  backend: string;
  backendHost: string;
  backendPort: number;
  appRoot: string;
  storyRoot: string;
  outputRoot: string;
}

export interface StoragePaths {
  project_name: string;
  app_root: string;
  story_root: string;
  output_root: string;
}

export interface BackendRuntimeConfig {
  config_version: 1;
  backend: {
    baseUrl: string;
    host: string;
    port: number;
    startup_timeout_seconds: number;
  };
  llm: {
    backend: "llama_server";
    model_path: string;
    context_size: number;
    gpu_layers: "auto" | number;
    prompt_format?: string;
    startup_timeout_seconds: number;
    timeout_seconds: number;
    max_tokens: number;
    temperature: number;
    top_p?: number;
    top_k?: number;
    min_p?: number;
    repeat_penalty?: number;
    stop?: string[];
  };
  image: {
    backend: "diffusers";
    model_type?: string;
    model_path: string;
    dtype?: string;
    device?: "cpu" | "cuda" | "auto";
    lora_root: string;
    embedding_root: string;
    manual_lora_paths: string[];
    default_width: number;
    default_height: number;
    default_steps: number;
    default_cfg_scale: number;
    sampler: string;
    scheduler: string;
    timeout_seconds: number;
  };
  prompts: {
    default_positive_prompt: string;
    default_negative_prompt: string;
  };
  danbot: {
    backend: "danbot_nl";
    model_path: string;
    device: "cpu" | "cuda" | "auto";
    dtype: "auto" | string;
    max_tags: number;
  };
}

export type StoryImageModePolicy = "manual" | "automatic" | "ask";

export interface StoryConfig {
  config_version: 1;
  story_id: string;
  title: string;
  image_mode_policy: StoryImageModePolicy;
  forbidden_tags: string[];
  default_negative_prompt: string;
}
