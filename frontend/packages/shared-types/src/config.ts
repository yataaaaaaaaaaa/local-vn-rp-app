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

export interface NoveltyRuntimeConfig {
  /** 0 = steady/low novelty, 1 = balanced, 2 = high novelty. */
  level: number;
  /** Global strength of optional agent-driven novelty multipliers. */
  agent_influence: number;
  /** Strength of unordered romantic-cliche/trope facets in novelty selection. */
  romance_cliche_influence: number;
  /** Strength of seeded NPC personna quirks in novelty selection. */
  npc_personna_influence: number;
  /** Strength of sex-scene/lifetime state in novelty selection. */
  sex_scene_influence: number;
  /** 0 = relaxed repetition guard, 1 = default, 2 = strict anti-loop suppression. */
  repetition_guard: number;
  /** 0 = stabilize only, 1 = one detail, 2 = up to two compatible micro-details. */
  detail_budget: number;
  /** Number of hidden RP-LLM YES/NO coherence attempts before using a stabilization redirect. */
  coherence_retries: number;
  /** Maximum number of preselected novelty candidates offered to the hidden coherence checker. */
  candidate_pool_size: number;
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
  novelty: NoveltyRuntimeConfig;
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
