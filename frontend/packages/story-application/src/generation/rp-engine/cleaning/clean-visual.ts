import { cleanGeneratedOutput, finalizeTextboxOutput } from "./clean-dialogue";

export function cleanVisualDescriptionOutput(text: string): string {
  return finalizeTextboxOutput(cleanGeneratedOutput(text), 2);
}
