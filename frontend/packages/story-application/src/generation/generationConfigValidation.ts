import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import type { StoryWorkflowStepId } from "@local-vn/story-domain";

export function validateGenerationConfig(
  config: BackendRuntimeConfig,
  stepId: StoryWorkflowStepId
): string[] {
  const errors: string[] = [];

  if (requiresLlm(stepId) && !config.llm.model_path) {
    errors.push("LLM model path is required for this workflow step.");
  }

  if (stepId === "danbot" && !config.danbot.model_path) {
    errors.push("DanBot model path is required for DanBot tag generation.");
  }

  if (stepId === "image") {
    if (!config.image.model_path) {
      errors.push("Image model path is required for image generation.");
    }

    if (!config.image.default_width || config.image.default_width <= 0) {
      errors.push("Image width must be greater than 0.");
    }

    if (!config.image.default_height || config.image.default_height <= 0) {
      errors.push("Image height must be greater than 0.");
    }

    if (!config.image.default_steps || config.image.default_steps <= 0) {
      errors.push("Image steps must be greater than 0.");
    }

    if (!config.image.default_cfg_scale || config.image.default_cfg_scale <= 0) {
      errors.push("Image CFG scale must be greater than 0.");
    }
  }

  return errors;
}

export function assertGenerationConfig(
  config: BackendRuntimeConfig,
  stepId: StoryWorkflowStepId
): void {
  const errors = validateGenerationConfig(config, stepId);

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

function requiresLlm(stepId: StoryWorkflowStepId): boolean {
  return (
    stepId === "userText" ||
    stepId === "dialogue" ||
    stepId === "visualDescription"
  );
}
