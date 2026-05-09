import type {
  BackendRuntimeConfig,
  LlmGenerateRequest
} from "@local-vn/shared-types";

import { RP_NOVEL_STOP } from "./rpNovelPrompts";

export function rpNovelLlmRequestConfig(
  runtimeConfig: BackendRuntimeConfig,
  prompt: string,
  overrides: Partial<LlmGenerateRequest> = {}
): LlmGenerateRequest {
  const request: LlmGenerateRequest = {
    prompt,
    model_path: runtimeConfig.llm.model_path,
    prompt_format: overrides.prompt_format ?? runtimeConfig.llm.prompt_format,
    context_size: overrides.context_size ?? runtimeConfig.llm.context_size,
    max_tokens: overrides.max_tokens ?? runtimeConfig.llm.max_tokens,
    temperature: overrides.temperature ?? runtimeConfig.llm.temperature,
    top_p: overrides.top_p ?? runtimeConfig.llm.top_p,
    top_k: overrides.top_k ?? runtimeConfig.llm.top_k,
    min_p: overrides.min_p ?? runtimeConfig.llm.min_p,
    repeat_penalty: overrides.repeat_penalty ?? runtimeConfig.llm.repeat_penalty,
    stop: overrides.stop ?? RP_NOVEL_STOP
  };

  if (overrides.seed !== undefined) {
    request.seed = overrides.seed;
  }

  if (overrides.timeout_seconds !== undefined) {
    request.timeout_seconds = overrides.timeout_seconds;
  }

  if (overrides.debug_no_log !== undefined) {
    request.debug_no_log = overrides.debug_no_log;
  }

  return request;
}
