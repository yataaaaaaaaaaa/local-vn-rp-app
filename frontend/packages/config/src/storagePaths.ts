import type { StoragePaths } from "@local-vn/shared-types";

export const PROJECT_NAME = "local-vn-rp-app";
let configuredStoragePaths: StoragePaths | null = null;

export function configureStoragePaths(paths: StoragePaths): StoragePaths {
  configuredStoragePaths = Object.freeze({
    project_name: requiredPathValue(paths.project_name, "project_name"),
    app_root: requiredPathValue(paths.app_root, "app_root"),
    story_root: requiredPathValue(paths.story_root, "story_root"),
    output_root: requiredPathValue(paths.output_root, "output_root")
  });
  return configuredStoragePaths;
}

export function requireStoragePaths(): StoragePaths {
  if (!configuredStoragePaths) {
    throw new Error("Storage paths are not configured. Start the frontend through cli.py so launcher arguments are provided.");
  }
  return configuredStoragePaths;
}

export function storagePaths(): StoragePaths { return requireStoragePaths(); }
export function appRoot(): string { return requireStoragePaths().app_root; }
export function storyRoot(): string { return requireStoragePaths().story_root; }
export function outputRoot(): string { return requireStoragePaths().output_root; }

export function configDirectory(): string { return `${appRoot()}/config`; }
export function backendRuntimeConfigFile(): string { return `${configDirectory()}/backend.runtime.json`; }
export function frontendLayoutFile(): string { return `${configDirectory()}/frontend.layout.json`; }
export function frontendPreferencesFile(): string { return `${configDirectory()}/frontend.preferences.json`; }
export function resolverConfigFile(): string { return `${configDirectory()}/resolver.config.json`; }
export function actionCompositionTreeConfigFile(): string { return `${configDirectory()}/action_composition_tree.json`; }

export function storyDirectory(storyId: string): string { return `${storyRoot()}/${safePathSegment(storyId)}`; }
export function storyFile(storyId: string): string { return `${storyDirectory(storyId)}/story.json`; }
export function storyTreeFile(storyId: string): string { return `${storyDirectory(storyId)}/tree.json`; }
export function storyStateFile(storyId: string): string { return `${storyDirectory(storyId)}/zustand.story-state.json`; }
export function storyNodesDirectory(storyId: string): string { return `${storyDirectory(storyId)}/nodes`; }
export function storyNodeFile(storyId: string, nodeId: string): string { return `${storyNodesDirectory(storyId)}/${safePathSegment(nodeId)}.json`; }
export function outputDirectory(storyId: string): string { return `${outputRoot()}/${safePathSegment(storyId)}`; }
export function outputImageFile(storyId: string, imageId: string): string { return `${outputDirectory(storyId)}/${safePathSegment(imageId)}.png`; }
export function outputImageMetadataFile(storyId: string, imageId: string): string { return `${outputDirectory(storyId)}/${safePathSegment(imageId)}.json`; }

function requiredPathValue(value: string, name: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error(`Missing storage path: ${name}`);
  return trimmed;
}

export function safePathSegment(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) throw new Error(`Invalid storage path segment: ${value}`);
  return trimmed;
}
