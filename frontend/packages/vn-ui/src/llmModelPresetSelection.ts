import type { BackendRuntimeConfig } from "@local-vn/shared-types";

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
            label: "Selected RP LLM",
            patch: {
                model_path: modelPath
            }
        };
    }

    return null;
}
