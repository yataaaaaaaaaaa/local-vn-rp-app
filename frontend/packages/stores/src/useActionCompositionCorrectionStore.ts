import { create } from "zustand";
import type { ActionCompositionSelectionIssue } from "@local-vn/story-application";

interface ActionCompositionCorrectionState {
  issue: ActionCompositionSelectionIssue | null;
  open(issue: ActionCompositionSelectionIssue): void;
  close(): void;
}

export const useActionCompositionCorrectionStore = create<ActionCompositionCorrectionState>((set) => ({
  issue: null,
  open: (issue) => set({ issue }),
  close: () => set({ issue: null })
}));
