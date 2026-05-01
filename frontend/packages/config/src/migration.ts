import type { BackendRuntimeConfig, StoryConfig } from "@local-vn/shared-types";
import { createDefaultBackendRuntimeConfig, createDefaultStoryConfig, type BackendRuntimeConfigPatch } from "./defaults";

export function migrateBackendRuntimeConfig(raw: unknown, launcher?: Partial<BackendRuntimeConfig["backend"]>): BackendRuntimeConfig {
  const defaults = createDefaultBackendRuntimeConfig();
  const launcherPatch = configFromLauncher(launcher);

  if (!isObject(raw)) {
    return createDefaultBackendRuntimeConfig(launcherPatch);
  }

  const partial = raw as BackendRuntimeConfigPatch;
  return createDefaultBackendRuntimeConfig({
    ...partial,
    backend: {
      ...launcherPatch.backend,
      ...partial.backend
    },
    llm: {
      ...launcherPatch.llm,
      ...stripRuntimeOwnedLlmSettings(partial.llm),
      context_size: positiveNumber(partial.llm?.context_size, defaults.llm.context_size),
      startup_timeout_seconds: positiveNumber(partial.llm?.startup_timeout_seconds, defaults.llm.startup_timeout_seconds),
      timeout_seconds: positiveNumber(partial.llm?.timeout_seconds, defaults.llm.timeout_seconds),
      max_tokens: positiveNumber(partial.llm?.max_tokens, defaults.llm.max_tokens),
      temperature: positiveNumber(partial.llm?.temperature, defaults.llm.temperature),
      top_p: optionalPositiveNumber(partial.llm?.top_p, defaults.llm.top_p),
      top_k: optionalPositiveNumber(partial.llm?.top_k, defaults.llm.top_k),
      min_p: optionalPositiveNumber(partial.llm?.min_p, defaults.llm.min_p),
      repeat_penalty: optionalPositiveNumber(partial.llm?.repeat_penalty, defaults.llm.repeat_penalty)
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
