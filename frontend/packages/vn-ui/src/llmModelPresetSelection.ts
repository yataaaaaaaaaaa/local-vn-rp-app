import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import { RP_NOVEL_PRESET } from "@local-vn/story-application";

export type PickedLlmPresetResult = {
    label: string;
    patch: Partial<BackendRuntimeConfig["llm"]>;
} | null;

const FORGOTTEN_SAFEWORD_RE = /Forgotten-Safeword-12B-v4\.0.*\.gguf$/i;

export function presetForPickedLlmModelPath(modelPath: string): PickedLlmPresetResult {
    const normalized = modelPath.replaceAll("\\", "/");
    const fileName = normalized.split("/").at(-1) ?? normalized;

    if (FORGOTTEN_SAFEWORD_RE.test(fileName)) {
        return {
            label: "RP_NOVEL_PRESET",
            patch: {
                ...RP_NOVEL_PRESET,
                model_path: modelPath
            }
        };
    }

    return null;
}