export type GenerationKind = "llm" | "image" | "danbot";

export type ProgressEvent =
  | { type: "generation_started"; job_id: string; kind: GenerationKind }
  | { type: "text_delta"; job_id: string; kind: "llm" | "danbot"; text: string }
  | { type: "generation_progress"; job_id: string; kind: "image"; stage?: "ksampler" | string; progress: number; step: number; total_steps: number }
  | { type: "generation_completed"; job_id: string; kind: GenerationKind; result: unknown }
  | { type: "generation_failed"; job_id: string; kind: GenerationKind; error: string }
  | { type: "generation_cancelled"; job_id: string; kind: GenerationKind };

export interface RuntimeStatus {
  busy: boolean;
  active_model_type: "none" | "llm" | "image" | string;
  loaded_llm: string | null;
  loaded_image_model: string | null;
  loaded_danbot_model: string | null;
  gpu_owner: "none" | "llm" | "image" | string;
  last_error: string | null;
}

export interface LlmLoadRequest {
  backend: "llama_server";
  model_path: string;
  context_size: number;
  gpu_layers: "auto" | number;
  prompt_format?: string;
  llm_startup_timeout_seconds?: number;
  startup_timeout_seconds?: number;
  timeout_seconds?: number;
}

export interface LlmGenerateRequest {
  prompt: string;
  model_path?: string;
  prompt_format?: string;
  context_size?: number;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  repeat_penalty?: number;
  seed?: number;
  stop?: string[];
  timeout_seconds?: number;
}

export interface LlmGenerateResponse {
  text: string;
  finish_reason: string;
  seed: number;
  timing?: { prompt_ms: number; generation_ms: number };
}

export interface ImageModelLoadRequest {
  backend: "diffusers";
  model_type?: string;
  model_path: string;
  dtype?: string;
  device?: "cpu" | "cuda" | "auto";
  lora_root: string;
  embedding_root: string;
  manual_lora_paths?: string[];
}

export interface ImageGenerateRequest {
  positive_prompt: string;
  negative_prompt: string;
  model_path?: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler: string;
  scheduler: string;
  seed: number;
  timeout_seconds?: number;
  output_path: string;
  metadata: Record<string, unknown>;
}

export interface ImageGenerateResponse {
  image_path: string;
  metadata_path: string;
  seed: number;
  resolved_loras: unknown[];
  resolved_embeddings: unknown[];
  warnings: string[];
}

export interface DanbotLoadRequest {
  backend: "danbot_nl";
  model_path: string;
  device: "cpu" | "cuda" | "auto";
  dtype: "auto" | string;
}

export interface DanbotGenerateRequest {
  scene_text: string;
  aspect_ratio?: string;
  rating?: string;
  translate_length?: string;
  translate_mode?: string;
  max_tags?: number;
  seed?: number;
  model_path?: string;
}

export interface DanbotGenerateResponse {
  tags: string[];
  prompt: string;
  model_path: string;
  warnings: string[];
}

export interface AssetResolveRequest {
  positive_prompt: string;
  negative_prompt: string;
}

export interface AssetResolveResponse {
  resolved_prompt: string;
  loras: unknown[];
  embeddings: unknown[];
  missing: string[];
  duplicates_ignored: string[];
}
