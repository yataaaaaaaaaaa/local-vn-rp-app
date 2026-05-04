import type { BackendRuntimeConfig, StoryConfig } from "@local-vn/shared-types";
import { createDefaultBackendRuntimeConfig, createDefaultStoryConfig, type BackendRuntimeConfigPatch } from "./defaults";

export function migrateBackendRuntimeConfig(raw: unknown, launcher?: Partial<BackendRuntimeConfig["backend"]>): BackendRuntimeConfig {
  const defaults = createDefaultBackendRuntimeConfig();
  const launcherPatch = configFromLauncher(launcher);

  if (!isObject(raw)) {
    return createDefaultBackendRuntimeConfig(launcherPatch);
  }

  const partial = raw as BackendRuntimeConfigPatch;
  const llmPatch = upgradeLegacyForgottenSafewordPreset(
    stripRuntimeOwnedLlmSettings(partial.llm)
  );
  return createDefaultBackendRuntimeConfig({
    ...partial,
    backend: {
      ...launcherPatch.backend,
      ...partial.backend
    },
    llm: {
      ...launcherPatch.llm,
      ...llmPatch,
      context_size: positiveNumber(llmPatch?.context_size, defaults.llm.context_size),
      startup_timeout_seconds: positiveNumber(llmPatch?.startup_timeout_seconds, defaults.llm.startup_timeout_seconds),
      timeout_seconds: positiveNumber(llmPatch?.timeout_seconds, defaults.llm.timeout_seconds),
      max_tokens: positiveNumber(llmPatch?.max_tokens, defaults.llm.max_tokens),
      temperature: positiveNumber(llmPatch?.temperature, defaults.llm.temperature),
      top_p: optionalPositiveNumber(llmPatch?.top_p, defaults.llm.top_p),
      top_k: optionalPositiveNumber(llmPatch?.top_k, defaults.llm.top_k),
      min_p: optionalPositiveNumber(llmPatch?.min_p, defaults.llm.min_p),
      repeat_penalty: optionalPositiveNumber(llmPatch?.repeat_penalty, defaults.llm.repeat_penalty)
    },
    image: {
      ...partial.image,
      manual_lora_paths: Array.isArray(partial.image?.manual_lora_paths) ? partial.image.manual_lora_paths : defaults.image.manual_lora_paths,
      default_width: positiveNumber(partial.image?.default_width, defaults.image.default_width),
      default_height: positiveNumber(partial.image?.default_height, defaults.image.default_height),
      default_steps: positiveNumber(partial.image?.default_steps, defaults.image.default_steps),
      default_cfg_scale: positiveNumber(partial.image?.default_cfg_scale, defaults.image.default_cfg_scale),
      timeout_seconds: positiveNumber(partial.image?.timeout_seconds, defaults.image.timeout_seconds)
    },
    prompts: {
      default_positive_prompt: stringValue(partial.prompts?.default_positive_prompt, defaults.prompts.default_positive_prompt),
      default_negative_prompt: stringValue(partial.prompts?.default_negative_prompt, defaults.prompts.default_negative_prompt)
    },
    danbot: {
      ...partial.danbot,
      max_tags: positiveNumber(partial.danbot?.max_tags, defaults.danbot.max_tags)
    }
  });
}

export function migrateStoryConfig(raw: unknown, storyId: string, title: string): StoryConfig {
  const defaults = createDefaultStoryConfig(storyId, title);
  if (!isObject(raw)) return defaults;
  const partial = raw as Partial<StoryConfig>;
  return {
    ...defaults,
    ...partial,
    config_version: 1,
    story_id: partial.story_id ?? storyId,
    title: partial.title ?? title,
    forbidden_tags: Array.isArray(partial.forbidden_tags) ? partial.forbidden_tags : defaults.forbidden_tags,
    image_mode_policy: partial.image_mode_policy === "manual" || partial.image_mode_policy === "ask" ? partial.image_mode_policy : "automatic"
  };
}

function configFromLauncher(launcher?: Partial<BackendRuntimeConfig["backend"]>): BackendRuntimeConfigPatch {
  if (!launcher) return {};
  const patch: BackendRuntimeConfigPatch = {
    backend: {
      baseUrl: launcher.baseUrl ?? `http://${launcher.host ?? "127.0.0.1"}:${launcher.port ?? 17860}`,
      host: launcher.host ?? "127.0.0.1",
      port: launcher.port ?? 17860,
      startup_timeout_seconds: launcher.startup_timeout_seconds ?? 30
    }
  };

  return patch;
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

function upgradeLegacyForgottenSafewordPreset(
  value: Partial<BackendRuntimeConfig["llm"]> | undefined
): Partial<BackendRuntimeConfig["llm"]> | undefined {
  if (!value) {
    return value;
  }

  const normalizedPath = value?.model_path?.replaceAll("\\", "/") ?? "";
  if (!/Forgotten-Safeword-12B-v4\.0.*\.gguf$/i.test(normalizedPath)) {
    return value;
  }

  const hasLegacySampler =
    Number(value.temperature) === 0.62 &&
    Number(value.top_p) === 0.86 &&
    Number(value.repeat_penalty) === 1.12;

  if (!hasLegacySampler) {
    return value;
  }

  return {
    ...value,
    prompt_format: value.prompt_format || "mistral_inst",
    temperature: 0.7,
    top_p: 1,
    repeat_penalty: 1
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalPositiveNumber(value: unknown, fallback: number | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
