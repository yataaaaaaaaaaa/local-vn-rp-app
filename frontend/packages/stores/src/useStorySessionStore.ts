import { create } from "zustand";

import type { TextTree } from "@replayable-text-tree/core";
import type { ImageRef, StoryManifest, StoryNodeFieldKey, StoryNodeFields } from "@local-vn/shared-types";
import {
  StoryWorkflowRunner,
  asStoryWorkflowStepId,
  canEditWorkflowStep,
  coerceWorkflowByNodeId,
  createWorkflowSnapshot,
  createStoryWorkflowSteps,
  defaultStoryWorkflowAutoValidateGeneratedCandidate,
  ensureWorkflowRecord,
  markInitialFieldStepsValidated,
  selectCurrentWorkflowSnapshot as selectRunnerWorkflowSnapshot,
  selectResolvedWorkflowCurrent,
  storyWorkflowStepIds,
  type StoryWorkflowAutoValidateByStepId,
  type StoryWorkflowByNodeId,
  type StoryWorkflowPayload,
  type StoryWorkflowRunningJob,
  type StoryWorkflowRunnerPatch,
  type StoryWorkflowRunnerState,
  type StoryWorkflowSnapshot,
  type StoryWorkflowStep,
  type StoryWorkflowStepId
} from "@local-vn/story-mechanism";
import {
  addStoryChildNode,
  createStoryTreeBundle,
  deleteStorySubtree,
  loadStoryBundle,
  resolveStoryNodeFields,
  saveStoryBundle,
  type StoryTreeBundle
} from "@local-vn/story-tree";
import { persistenceApi } from "./persistenceBridge";
import { backendClientOrThrow } from "./useBackendClientStore";
import { useBackendConfigStore } from "./useBackendConfigStore";
import { getChildIds, getParentId, getSiblingIds } from "./treeShape";

export interface StorySessionState extends StoryWorkflowRunnerState {
  manifest: StoryManifest | null;

  createStory(title: string, storyId?: string, initialFields?: Partial<StoryNodeFields>): Promise<void>;
  loadStory(storyId: string): Promise<boolean>;
  saveStory(): Promise<void>;

  selectNode(nodeId: string): void;
  goToParent(): void;
  goToFirstChild(): void;
  goToChild(nodeId: string): void;
  goToPreviousSibling(): void;
  goToNextSibling(): void;
  goBack(): void;
  goForward(): void;

  createChildFromCurrent(initialFields?: Partial<StoryNodeFields>, continueFromStepId?: StoryWorkflowStepId, options?: { autoContinue?: boolean }): string;
  submitUserText(text: string, generateDialogue?: boolean): Promise<void>;
  createAlternateBranch(initialFields?: Partial<StoryNodeFields>): string | null;
  duplicateCurrentBranch(): string | null;
  deleteNode(nodeId: string): void;
  deleteCurrentLeaf(): void;

  setAutoValidateGeneratedCandidate(stepId: StoryWorkflowStepId, enabled: boolean): void;
  selectWorkflowStep(stepId: StoryWorkflowStepId): void;
  editStepField(stepId: StoryWorkflowStepId, field: StoryNodeFieldKey, value: string): void;
  validateStep(stepId?: StoryWorkflowStepId): Promise<void>;
  regenerateStep(stepId?: StoryWorkflowStepId): Promise<void>;
  continueFrom(stepId?: StoryWorkflowStepId): Promise<void>;
  applyPresetContext(context: string): Promise<void>;
  applyResolverResult(input: { rawText: string; tags: string[]; prompt: string }): Promise<void>;
}

const steps = createStoryWorkflowSteps();
const stepById = Object.fromEntries(steps.map((step) => [step.id, step])) as Record<StoryWorkflowStepId, StoryWorkflowStep>;

let workflowRunner: StoryWorkflowRunner;
let saveQueue: Promise<void> = Promise.resolve();
let saveSequence = 0;

export const useStorySessionStore = create<StorySessionState>((set, get) => ({
  storyId: null,
  manifest: null,
  tree: null,
  selectedNodeId: null,
  imageRefs: {},
  historyBack: [],
  historyForward: [],
  workflowByNodeId: {},
  activeStepId: "context",
  runningJob: null,
  autoValidateGeneratedCandidateByStepId: { ...defaultStoryWorkflowAutoValidateGeneratedCandidate },
  busy: false,
  message: null,
  dirty: false,

  createStory: async (title, storyId, initialFields = {}) => {
    workflowRunner.cancelAll();

    const bundle = createStoryTreeBundle(title, storyId, initialFields);
    const workflowByNodeId = ensureWorkflowRecord(
      {},
      bundle.selectedNodeId,
      asStoryWorkflowStepId(bundle.activeWorkflowStepId) ?? "context"
    );

    set({
      ...bundleToState({ ...bundle, workflowByNodeId, activeWorkflowStepId: "context" }, true),
      workflowByNodeId,
      activeStepId: "context",
      busy: false,
      runningJob: null,
      message: null
    });

    await get().saveStory();
    void workflowRunner.continueFrom("context", bundle.selectedNodeId);
  },

  loadStory: async (storyId) => {
    workflowRunner.cancelAll();

    const bundle = await loadStoryBundle(persistenceApi(), storyId);
    if (!bundle) return false;

    const workflowByNodeId = ensureWorkflowRecord(
      coerceWorkflowByNodeId(bundle.workflowByNodeId),
      bundle.selectedNodeId,
      asStoryWorkflowStepId(bundle.activeWorkflowStepId) ?? "context"
    );
    const activeStepId = asStoryWorkflowStepId(bundle.activeWorkflowStepId)
      ?? workflowByNodeId[bundle.selectedNodeId]?.activeStepId
      ?? "context";

    set({
      ...bundleToState({ ...bundle, workflowByNodeId, activeWorkflowStepId: activeStepId }, false),
      workflowByNodeId,
      activeStepId,
      busy: false,
      runningJob: null,
      message: null
    });

    return true;
  },

  saveStory: async () => {
    const saveId = ++saveSequence;
    saveQueue = saveQueue.then(async () => {
      const state = get();
      if (!state.manifest || !state.tree || !state.selectedNodeId) return;

      const updatedManifest = { ...state.manifest, updated_at: new Date().toISOString() };
      await saveStoryBundle(persistenceApi(), {
        manifest: updatedManifest,
        tree: state.tree,
        selectedNodeId: state.selectedNodeId,
        imageRefs: state.imageRefs,
        historyBack: state.historyBack,
        historyForward: state.historyForward,
        workflowByNodeId: state.workflowByNodeId,
        activeWorkflowStepId: state.activeStepId
      });

      set((current) => ({
        manifest: current.manifest?.story_id === updatedManifest.story_id ? updatedManifest : current.manifest,
        dirty: saveId === saveSequence ? false : current.dirty
      }));
    });

    await saveQueue;
  },

  selectNode: (nodeId) => {
    const current = get().selectedNodeId;
    const changedNode = Boolean(current && current !== nodeId);
    if (changedNode && current) workflowRunner.cancelNode(current);

    set((previous) => {
      const workflowByNodeId = ensureWorkflowRecord(previous.workflowByNodeId, nodeId);
      const activeStepId = workflowByNodeId[nodeId]?.activeStepId ?? "context";
      return {
        selectedNodeId: nodeId,
        historyBack: current && current !== nodeId ? [...previous.historyBack, current] : previous.historyBack,
        historyForward: [],
        workflowByNodeId,
        activeStepId,
        busy: changedNode ? false : previous.busy,
        runningJob: changedNode ? null : previous.runningJob,
        message: null
      };
    });

    void get().saveStory();
  },

  goToParent: () => {
    const state = get();
    const parentId = getParentId(state.tree, state.selectedNodeId);
    if (parentId) state.selectNode(parentId);
  },

  goToFirstChild: () => {
    const state = get();
    const [childId] = getChildIds(state.tree, state.selectedNodeId);
    if (childId) state.selectNode(childId);
  },

  goToChild: (nodeId) => get().selectNode(nodeId),

  goToPreviousSibling: () => {
    const state = get();
    const siblings = getSiblingIds(state.tree, state.selectedNodeId);
    const index = state.selectedNodeId ? siblings.indexOf(state.selectedNodeId) : -1;
    if (index > 0) state.selectNode(siblings[index - 1]);
  },

  goToNextSibling: () => {
    const state = get();
    const siblings = getSiblingIds(state.tree, state.selectedNodeId);
    const index = state.selectedNodeId ? siblings.indexOf(state.selectedNodeId) : -1;
    if (index >= 0 && index < siblings.length - 1) state.selectNode(siblings[index + 1]);
  },

  goBack: () => {
    set((state) => {
      const previous = state.historyBack.at(-1);
      if (!previous) return state;
      if (state.selectedNodeId) workflowRunner.cancelNode(state.selectedNodeId);

      const workflowByNodeId = ensureWorkflowRecord(state.workflowByNodeId, previous);
      return {
        selectedNodeId: previous,
        historyBack: state.historyBack.slice(0, -1),
        historyForward: state.selectedNodeId ? [state.selectedNodeId, ...state.historyForward] : state.historyForward,
        workflowByNodeId,
        activeStepId: workflowByNodeId[previous]?.activeStepId ?? "context",
        busy: false,
        runningJob: null,
        message: null
      };
    });

    void get().saveStory();
  },

  goForward: () => {
    set((state) => {
      const [next, ...rest] = state.historyForward;
      if (!next) return state;
      if (state.selectedNodeId) workflowRunner.cancelNode(state.selectedNodeId);

      const workflowByNodeId = ensureWorkflowRecord(state.workflowByNodeId, next);
      return {
        selectedNodeId: next,
        historyBack: state.selectedNodeId ? [...state.historyBack, state.selectedNodeId] : state.historyBack,
        historyForward: rest,
        workflowByNodeId,
        activeStepId: workflowByNodeId[next]?.activeStepId ?? "context",
        busy: false,
        runningJob: null,
        message: null
      };
    });

    void get().saveStory();
  },

  createChildFromCurrent: (initialFields = {}, continueFromStepId = "context", options = {}) => {
    return createChildFromCurrentInternal(get, set, initialFields, continueFromStepId, options.autoContinue ?? true);
  },

  submitUserText: async (text, generateDialogue = true) => {
    const userText = text.trim();
    if (!userText) return;

    const state = get();

    if (state.activeStepId !== "userText" || !state.tree || !state.selectedNodeId) {
      createChildFromCurrentInternal(get, set, { userText }, "userText", false);
      if (generateDialogue) await workflowRunner.regenerateStep("dialogue");
      else await workflowRunner.continueFrom("dialogue", get().selectedNodeId);
      return;
    }

    workflowRunner.editStepField("userText", "userText", userText);
    await workflowRunner.validateStep("userText");

    if (generateDialogue) await workflowRunner.regenerateStep("dialogue");
  },

  createAlternateBranch: (initialFields = {}) => {
    const state = get();
    const parentId = getParentId(state.tree, state.selectedNodeId);
    if (!state.tree || !parentId) return null;

    if (state.selectedNodeId) workflowRunner.cancelNode(state.selectedNodeId);

    const resolved = selectResolvedCurrent(state);
    const added = addStoryChildNode(state.tree, parentId, { ...resolved, ...initialFields });
    const workflowByNodeId = ensureWorkflowRecord(state.workflowByNodeId, added.nodeId);

    set({
      tree: added.tree,
      selectedNodeId: added.nodeId,
      workflowByNodeId,
      activeStepId: "context",
      busy: false,
      runningJob: null,
      dirty: true,
      message: null
    });

    void get().saveStory();
    return added.nodeId;
  },

  duplicateCurrentBranch: () => {
    const state = get();
    return state.createAlternateBranch(selectResolvedCurrent(state));
  },

  deleteNode: (nodeId) => {
    const state = get();
    if (!state.tree || !state.selectedNodeId) return;
    try {
      const deleted = deleteStorySubtree(state.tree, nodeId);
      const deletedIds = new Set(deleted.deletedNodeIds);
      for (const deletedNodeId of deletedIds) workflowRunner.cancelNode(deletedNodeId);

      const workflowByNodeId = Object.fromEntries(
        Object.entries(state.workflowByNodeId).filter(([candidateId]) => !deletedIds.has(candidateId))
      ) as StoryWorkflowByNodeId;
      const imageRefs = Object.fromEntries(
        Object.entries(state.imageRefs).filter(([candidateId]) => !deletedIds.has(candidateId))
      ) as Record<string, ImageRef>;
      const selectedNodeId = deletedIds.has(state.selectedNodeId) ? deleted.parentId : state.selectedNodeId;
      const nextWorkflowByNodeId = ensureWorkflowRecord(workflowByNodeId, selectedNodeId);
      const activeStepId = nextWorkflowByNodeId[selectedNodeId]?.activeStepId ?? "context";

      set({
        tree: deleted.tree,
        selectedNodeId,
        imageRefs,
        historyBack: state.historyBack.filter((candidateId) => !deletedIds.has(candidateId)),
        historyForward: state.historyForward.filter((candidateId) => !deletedIds.has(candidateId)),
        workflowByNodeId: nextWorkflowByNodeId,
        activeStepId,
        busy: deletedIds.has(state.runningJob?.nodeId ?? "") ? false : state.busy,
        runningJob: deletedIds.has(state.runningJob?.nodeId ?? "") ? null : state.runningJob,
        dirty: true,
        message: deleted.deletedNodeIds.length > 1 ? "Scene branch deleted." : "Scene deleted."
      });
      void get().saveStory();
    } catch (error) {
      set({ message: error instanceof Error ? error.message : String(error) });
    }
  },

  deleteCurrentLeaf: () => {
    const selectedNodeId = get().selectedNodeId;
    if (selectedNodeId) get().deleteNode(selectedNodeId);
  },

  setAutoValidateGeneratedCandidate: (stepId, enabled) => {
    set((state) => ({
      autoValidateGeneratedCandidateByStepId: {
        ...state.autoValidateGeneratedCandidateByStepId,
        [stepId]: enabled
      }
    }));
  },

  selectWorkflowStep: (stepId) => workflowRunner.selectWorkflowStep(stepId),
  editStepField: (stepId, field, value) => workflowRunner.editStepField(stepId, field, value),
  validateStep: (stepId) => workflowRunner.validateStep(stepId),
  regenerateStep: (stepId) => workflowRunner.regenerateStep(stepId),
  continueFrom: (stepId) => workflowRunner.continueFrom(stepId),
  applyPresetContext: (context) => workflowRunner.applyPresetContext(context),
  applyResolverResult: (input) => workflowRunner.applyResolverResult(input)
}));

workflowRunner = new StoryWorkflowRunner({
  getState: () => useStorySessionStore.getState(),
  setState: (patch) => {
    if (typeof patch === "function") {
      useStorySessionStore.setState((state) => patch(state));
      return;
    }
    useStorySessionStore.setState(patch as StoryWorkflowRunnerPatch);
  },
  saveStory: () => useStorySessionStore.getState().saveStory(),
  getWorkflowContext: (nodeId) => {
    const state = useStorySessionStore.getState();
    return {
      backend: backendClientOrThrow(),
      config: useBackendConfigStore.getState().config,
      storyId: state.storyId,
      selectedNodeId: nodeId
    };
  }
});

export function selectResolvedCurrent(state: Pick<StorySessionState, "tree" | "selectedNodeId">): StoryNodeFields {
  return selectResolvedWorkflowCurrent(state);
}

export function selectCurrentWorkflowSnapshot(state: StorySessionState): StoryWorkflowSnapshot | null {
  return selectRunnerWorkflowSnapshot(state);
}

export function selectActiveWorkflowStep(state: StorySessionState): StoryWorkflowStep {
  return stepById[state.activeStepId];
}

export function selectCanEditStep(state: StorySessionState, stepId: StoryWorkflowStepId): boolean {
  const snapshot = selectCurrentWorkflowSnapshot(state);
  return snapshot ? canEditWorkflowStep(storyWorkflowStepIds, snapshot, stepId) : false;
}

export function selectCanGenerateStep(state: StorySessionState, stepId: StoryWorkflowStepId): boolean {
  return selectCanEditStep(state, stepId) && Boolean(stepById[stepId].generate) && !state.busy;
}

export function selectCanValidateStep(state: StorySessionState, stepId: StoryWorkflowStepId): boolean {
  const snapshot = selectCurrentWorkflowSnapshot(state);
  return Boolean(snapshot?.stepStates[stepId]?.edited) && selectCanEditStep(state, stepId) && !state.busy;
}

function createChildFromCurrentInternal(
  get: () => StorySessionState,
  set: (partial: Partial<StorySessionState> | ((state: StorySessionState) => Partial<StorySessionState>)) => void,
  initialFields: Partial<StoryNodeFields>,
  continueFromStepId: StoryWorkflowStepId,
  autoContinue: boolean
): string {
  const state = get();
  if (!state.tree || !state.selectedNodeId) throw new Error("No selected story node.");

  workflowRunner.cancelNode(state.selectedNodeId);

  const current = selectResolvedCurrent(state);
  const childFields = {
    context: current.dialogue || current.context,
    ...initialFields
  };
  const added = addStoryChildNode(state.tree, state.selectedNodeId, childFields);
  const workflow = createWorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>(storyWorkflowStepIds, continueFromStepId);
  workflow.frontierStepId = continueFromStepId;
  workflow.activeStepId = continueFromStepId;
  markInitialFieldStepsValidated(workflow, childFields);

  set((previous) => ({
    tree: added.tree,
    selectedNodeId: added.nodeId,
    historyBack: previous.selectedNodeId ? [...previous.historyBack, previous.selectedNodeId] : previous.historyBack,
    historyForward: [],
    workflowByNodeId: {
      ...previous.workflowByNodeId,
      [added.nodeId]: workflow
    },
    activeStepId: continueFromStepId,
    busy: false,
    runningJob: null,
    dirty: true,
    message: null
  }));

  void get().saveStory();
  if (autoContinue) void workflowRunner.continueFrom(continueFromStepId, added.nodeId);

  return added.nodeId;
}

function bundleToState(bundle: StoryTreeBundle, dirty: boolean): Partial<StorySessionState> {
  return {
    storyId: bundle.manifest.story_id,
    manifest: bundle.manifest,
    tree: bundle.tree,
    selectedNodeId: bundle.selectedNodeId,
    imageRefs: bundle.imageRefs,
    historyBack: bundle.historyBack ?? [],
    historyForward: bundle.historyForward ?? [],
    workflowByNodeId: coerceWorkflowByNodeId(bundle.workflowByNodeId),
    activeStepId: asStoryWorkflowStepId(bundle.activeWorkflowStepId) ?? "context",
    dirty
  };
}
