import { create } from "zustand";
import type { TextTree } from "@replayable-text-tree/core";
import type { BackendRuntimeConfig, ImageRef, StoryManifest, StoryNodeFieldKey, StoryNodeFields } from "@local-vn/shared-types";
import {
  createWorkflowSnapshot,
  canEditWorkflowStep,
  ensureWorkflowStepState,
  invalidateWorkflowStepsAfter,
  markWorkflowStepFailed,
  markWorkflowStepGenerating,
  markWorkflowStepValidated,
  nextStepId,
  setWorkflowStepCandidate,
  setWorkflowStepEdited,
  type WorkflowSnapshot
} from "@local-vn/story-mechanism";
import {
  createStoryWorkflowSteps,
  defaultStoryWorkflowAutoValidateGeneratedCandidate,
  fieldsForStoryWorkflowStep,
  storyWorkflowStepIds,
  type StoryWorkflowAutoValidateByStepId,
  type StoryWorkflowPayload,
  type StoryWorkflowStep,
  type StoryWorkflowStepId
} from "@local-vn/story-mechanism";
import {
  addStoryChildNode,
  createStoryTreeBundle,
  editStoryNodeFields,
  loadStoryBundle,
  parseImageRef,
  resolveStoryNodeFields,
  saveStoryBundle,
  type StoryTreeBundle
} from "@local-vn/story-tree";
import { persistenceApi } from "./persistenceBridge";
import { backendClientOrThrow } from "./useBackendClientStore";
import { useBackendConfigStore } from "./useBackendConfigStore";
import { getChildIds, getParentId, getSiblingIds } from "./treeShape";

type StoryWorkflowSnapshot = WorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>;
type StoryWorkflowByNodeId = Record<string, StoryWorkflowSnapshot>;

interface RunningWorkflowJob {
  id: string;
  nodeId: string;
  stepId: StoryWorkflowStepId;
}

interface StorySessionState {
  storyId: string | null;
  manifest: StoryManifest | null;
  tree: TextTree | null;
  selectedNodeId: string | null;
  imageRefs: Record<string, ImageRef>;
  historyBack: string[];
  historyForward: string[];
  workflowByNodeId: StoryWorkflowByNodeId;
  activeStepId: StoryWorkflowStepId;
  runningJob: RunningWorkflowJob | null;
  autoValidateGeneratedCandidateByStepId: StoryWorkflowAutoValidateByStepId;
  busy: boolean;
  message: string | null;
  dirty: boolean;

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

  createChildFromCurrent(initialFields?: Partial<StoryNodeFields>, continueFromStepId?: StoryWorkflowStepId): string;
  submitUserText(text: string, generateDialogue?: boolean): Promise<void>;
  createAlternateBranch(initialFields?: Partial<StoryNodeFields>): string | null;
  duplicateCurrentBranch(): string | null;
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
    const bundle = createStoryTreeBundle(title, storyId, initialFields);
    const workflowByNodeId = ensureWorkflowRecord({}, bundle.selectedNodeId, bundle.activeWorkflowStepId as StoryWorkflowStepId | undefined);
    set({
      ...bundleToState({ ...bundle, workflowByNodeId, activeWorkflowStepId: "context" }, true),
      workflowByNodeId,
      activeStepId: "context"
    });
    await get().saveStory();
    void get().continueFrom("context");
  },

  loadStory: async (storyId) => {
    const bundle = await loadStoryBundle(persistenceApi(), storyId);
    if (!bundle) return false;
    const workflowByNodeId = ensureWorkflowRecord(
      coerceWorkflowByNodeId(bundle.workflowByNodeId),
      bundle.selectedNodeId,
      asStoryWorkflowStepId(bundle.activeWorkflowStepId) ?? "context"
    );
    const activeStepId = asStoryWorkflowStepId(bundle.activeWorkflowStepId) ?? workflowByNodeId[bundle.selectedNodeId]?.activeStepId ?? "context";
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
    set({ dirty: false, manifest: updatedManifest });
  },

  selectNode: (nodeId) => {
    const state = get();
    const current = state.selectedNodeId;
    set((previous) => {
      const workflowByNodeId = ensureWorkflowRecord(previous.workflowByNodeId, nodeId);
      const activeStepId = workflowByNodeId[nodeId]?.activeStepId ?? "context";
      return {
        selectedNodeId: nodeId,
        historyBack: current && current !== nodeId ? [...previous.historyBack, current] : previous.historyBack,
        historyForward: [],
        workflowByNodeId,
        activeStepId,
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
      const workflowByNodeId = ensureWorkflowRecord(state.workflowByNodeId, previous);
      return {
        selectedNodeId: previous,
        historyBack: state.historyBack.slice(0, -1),
        historyForward: state.selectedNodeId ? [state.selectedNodeId, ...state.historyForward] : state.historyForward,
        workflowByNodeId,
        activeStepId: workflowByNodeId[previous]?.activeStepId ?? "context"
      };
    });
    void get().saveStory();
  },

  goForward: () => {
    set((state) => {
      const [next, ...rest] = state.historyForward;
      if (!next) return state;
      const workflowByNodeId = ensureWorkflowRecord(state.workflowByNodeId, next);
      return {
        selectedNodeId: next,
        historyBack: state.selectedNodeId ? [...state.historyBack, state.selectedNodeId] : state.historyBack,
        historyForward: rest,
        workflowByNodeId,
        activeStepId: workflowByNodeId[next]?.activeStepId ?? "context"
      };
    });
    void get().saveStory();
  },

  createChildFromCurrent: (initialFields = {}, continueFromStepId = "context") => {
    const state = get();
    if (!state.tree || !state.selectedNodeId) throw new Error("No selected story node.");
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
      workflowByNodeId: { ...previous.workflowByNodeId, [added.nodeId]: workflow },
      activeStepId: continueFromStepId,
      dirty: true,
      message: null
    }));
    void get().saveStory();
    void get().continueFrom(continueFromStepId);
    return added.nodeId;
  },

  submitUserText: async (text, generateDialogue = false) => {
    const userText = text.trim();
    if (!userText) return;

    const state = get();
    const stepId = generateDialogue ? "dialogue" : "userText";
    if (state.activeStepId !== "userText" || !state.tree || !state.selectedNodeId) {
      state.createChildFromCurrent({ userText }, stepId);
      if (generateDialogue) await get().regenerateStep("dialogue");
      return;
    }

    const snapshot = workflowForSelected(state);
    setWorkflowStepEdited(snapshot, "userText", { userText });
    snapshot.machineState = "editing";
    snapshot.frontierStepId = "userText";
    snapshot.activeStepId = "userText";
    set({
      workflowByNodeId: { ...state.workflowByNodeId, [state.selectedNodeId]: snapshot },
      activeStepId: "userText",
      dirty: true,
      message: null
    });
    await commitStep("userText", { continueAfter: false });
    if (generateDialogue) await get().regenerateStep("dialogue");
    else await get().continueFrom("dialogue");
  },

  createAlternateBranch: (initialFields = {}) => {
    const state = get();
    const parentId = getParentId(state.tree, state.selectedNodeId);
    if (!state.tree || !parentId) return null;
    const resolved = selectResolvedCurrent(state);
    const added = addStoryChildNode(state.tree, parentId, { ...resolved, ...initialFields });
    const workflowByNodeId = ensureWorkflowRecord(state.workflowByNodeId, added.nodeId);
    set({ tree: added.tree, selectedNodeId: added.nodeId, workflowByNodeId, activeStepId: "context", dirty: true });
    void get().saveStory();
    return added.nodeId;
  },

  duplicateCurrentBranch: () => {
    const state = get();
    return state.createAlternateBranch(selectResolvedCurrent(state));
  },

  deleteCurrentLeaf: () => {
    console.warn("Delete leaf is intentionally not implemented until replayable-text-tree exposes a delete API.");
  },

  setAutoValidateGeneratedCandidate: (stepId, enabled) => {
    set((state) => ({
      autoValidateGeneratedCandidateByStepId: {
        ...state.autoValidateGeneratedCandidateByStepId,
        [stepId]: enabled
      }
    }));
  },

  selectWorkflowStep: (stepId) => {
    const state = get();
    if (!state.selectedNodeId) return;
    set((previous) => {
      const workflowByNodeId = ensureWorkflowRecord(previous.workflowByNodeId, previous.selectedNodeId ?? "", stepId);
      const snapshot = cloneWorkflowSnapshot(workflowByNodeId[previous.selectedNodeId ?? ""]);
      snapshot.activeStepId = stepId;
      workflowByNodeId[previous.selectedNodeId ?? ""] = snapshot;
      return { activeStepId: stepId, workflowByNodeId };
    });
    void get().saveStory();
  },

  editStepField: (stepId, field, value) => {
    const state = get();
    if (!state.tree || !state.selectedNodeId) return;
    const snapshot = workflowForSelected(state);
    if (!canEditWorkflowStep(storyWorkflowStepIds, snapshot, stepId)) {
      set({ message: "Future steps are view-only until the workflow reaches them." });
      return;
    }

    const step = stepById[stepId];
    const document = selectResolvedCurrent(state);
    ensureWorkflowStepState(snapshot, stepId, () => step.read(document));
    const currentEdited = snapshot.stepStates[stepId]?.edited ?? step.read(document);
    setWorkflowStepEdited(snapshot, stepId, step.merge(currentEdited, { [field]: value }));
    snapshot.activeStepId = stepId;

    set({
      workflowByNodeId: { ...state.workflowByNodeId, [state.selectedNodeId]: snapshot },
      activeStepId: stepId,
      dirty: true,
      message: null
    });
    void get().saveStory();
  },

  validateStep: async (stepId = get().activeStepId) => {
    await commitStep(stepId);
    const next = nextStepId(storyWorkflowStepIds, stepId);
    if (next) await get().continueFrom(next);
    else await completeSceneAndAdvance();
  },

  regenerateStep: async (stepId = get().activeStepId) => {
    const generated = await generateCandidate(stepId, { stayEditing: true });
    if (generated && get().autoValidateGeneratedCandidateByStepId[stepId]) {
      await get().validateStep(stepId);
    }
  },

  continueFrom: async (stepId = get().activeStepId) => {
    const startNodeId = get().selectedNodeId;
    if (!startNodeId) return;

    let currentStepId: StoryWorkflowStepId | null = stepId;
    setWorkflowMachine(startNodeId, "running", currentStepId);

    while (currentStepId) {
      const state = get();
      if (!state.tree || state.selectedNodeId !== startNodeId) return;
      const step = stepById[currentStepId];
      const snapshot = workflowForSelected(state);

      if (step.mode === "manual") {
        ensureWorkflowStepState(snapshot, currentStepId, () => step.read(selectResolvedCurrent(state)));
        snapshot.machineState = "editing";
        snapshot.frontierStepId = currentStepId;
        snapshot.activeStepId = currentStepId;
        set({
          workflowByNodeId: { ...state.workflowByNodeId, [startNodeId]: snapshot },
          activeStepId: currentStepId,
          busy: false,
          runningJob: null,
          message: `Waiting for validation at ${step.label}.`
        });
        void get().saveStory();
        return;
      }

      if (step.generate) {
        const generated = await generateCandidate(currentStepId, { stayEditing: false, nodeId: startNodeId });
        if (!generated) return;
        if (!get().autoValidateGeneratedCandidateByStepId[currentStepId]) {
          const afterGenerate = get();
          const nextSnapshot = workflowForNode(afterGenerate, startNodeId);
          nextSnapshot.machineState = "editing";
          nextSnapshot.frontierStepId = currentStepId;
          nextSnapshot.activeStepId = currentStepId;
          setStateForNode(startNodeId, nextSnapshot, {
            activeStepId: currentStepId,
            busy: false,
            runningJob: null,
            message: `Generated ${step.label}; waiting for validation.`
          });
          void get().saveStory();
          return;
        }
      }
      await commitStep(currentStepId, { continueAfter: false, nodeId: startNodeId });
      currentStepId = nextStepId(storyWorkflowStepIds, currentStepId);
    }

    await completeSceneAndAdvance(startNodeId);
  },

  applyPresetContext: async (context) => {
    const state = get();
    if (!state.selectedNodeId) return;
    const snapshot = workflowForSelected(state);
    setWorkflowStepEdited(snapshot, "context", { context });
    set({ workflowByNodeId: { ...state.workflowByNodeId, [state.selectedNodeId]: snapshot }, activeStepId: "context", dirty: true });
    await commitStep("context", { continueAfter: false });
    await get().continueFrom("userText");
  },

  applyResolverResult: async ({ rawText, tags, prompt }) => {
    const state = get();
    if (!state.tree || !state.selectedNodeId) return;
    const patch = {
      resolverText: rawText,
      selectedTags: tags.join(", "),
      positivePrompt: prompt
    };
    const tree = editStoryNodeFields(state.tree, state.selectedNodeId, patch);
    const snapshot = workflowForSelected(state);
    markWorkflowStepValidated(snapshot, "resolverText", { resolverText: rawText });
    markWorkflowStepValidated(snapshot, "selectedTags", { selectedTags: patch.selectedTags });
    markWorkflowStepValidated(snapshot, "prompt", { positivePrompt: prompt, negativePrompt: selectResolvedCurrent(state).negativePrompt });
    invalidateWorkflowStepsAfter(storyWorkflowStepIds, snapshot, "prompt");
    snapshot.activeStepId = "prompt";
    snapshot.frontierStepId = "image";
    snapshot.machineState = "editing";
    set({
      tree,
      workflowByNodeId: { ...state.workflowByNodeId, [state.selectedNodeId]: snapshot },
      activeStepId: "prompt",
      dirty: true,
      message: "Resolver result accepted into the workflow."
    });
    await get().saveStory();
  }
}));

export function selectResolvedCurrent(state: Pick<StorySessionState, "tree" | "selectedNodeId">): StoryNodeFields {
  return resolveStoryNodeFields(state.tree, state.selectedNodeId);
}

export function selectCurrentWorkflowSnapshot(state: StorySessionState): StoryWorkflowSnapshot | null {
  if (!state.selectedNodeId) return null;
  return state.workflowByNodeId[state.selectedNodeId] ?? null;
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

async function generateCandidate(stepId: StoryWorkflowStepId, options: { stayEditing: boolean; nodeId?: string }): Promise<boolean> {
  const state = useStorySessionStore.getState();
  const nodeId = options.nodeId ?? state.selectedNodeId;
  if (!state.tree || !nodeId) return false;
  const step = stepById[stepId];
  if (!step.generate) return false;

  const document = resolveStoryNodeFields(state.tree, nodeId);
  const snapshot = workflowForNode(state, nodeId);
  const previousEdited = snapshot.stepStates[stepId]?.edited ?? step.read(document);

  const config = useBackendConfigStore.getState().config;
  const validationError = validateGenerationConfig(stepId, config);
  if (validationError) {
    markWorkflowStepFailed(snapshot, stepId, validationError, previousEdited);
    snapshot.machineState = "editing";
    snapshot.frontierStepId = stepId;
    snapshot.activeStepId = stepId;
    setStateForNode(nodeId, snapshot, {
      activeStepId: stepId,
      busy: false,
      runningJob: null,
      message: validationError
    });
    return false;
  }

  markWorkflowStepGenerating(snapshot, stepId, previousEdited);
  snapshot.activeStepId = stepId;

  const jobId = `${nodeId}:${stepId}:${Date.now()}`;
  setStateForNode(nodeId, snapshot, {
    activeStepId: stepId,
    busy: true,
    runningJob: { id: jobId, nodeId, stepId },
    message: `Generating ${step.label}...`
  });

  try {
    const latest = useStorySessionStore.getState();
    const result = await step.generate({
      document: resolveStoryNodeFields(latest.tree, nodeId),
      context: {
        backend: backendClientOrThrow(),
        config,
        storyId: latest.storyId,
        selectedNodeId: nodeId
      }
    });

    const after = useStorySessionStore.getState();
    if (after.runningJob?.id !== jobId) return false;
    const nextSnapshot = workflowForNode(after, nodeId);
    const normalized = step.normalize ? step.normalize(result.value) : result.value;
    setWorkflowStepCandidate(nextSnapshot, stepId, normalized, result.warnings ?? []);
    nextSnapshot.machineState = options.stayEditing ? "editing" : nextSnapshot.machineState;
    nextSnapshot.activeStepId = stepId;
    setStateForNode(nodeId, nextSnapshot, {
      activeStepId: stepId,
      busy: false,
      runningJob: null,
      message: result.warnings?.length ? result.warnings.join("; ") : `${step.label} generated.`
    });
    await useStorySessionStore.getState().saveStory();
    return true;
  } catch (error) {
    const after = useStorySessionStore.getState();
    if (after.runningJob?.id !== jobId) return false;
    const nextSnapshot = workflowForNode(after, nodeId);
    markWorkflowStepFailed(nextSnapshot, stepId, error instanceof Error ? error.message : String(error), previousEdited);
    nextSnapshot.machineState = "editing";
    nextSnapshot.frontierStepId = stepId;
    nextSnapshot.activeStepId = stepId;
    setStateForNode(nodeId, nextSnapshot, {
      activeStepId: stepId,
      busy: false,
      runningJob: null,
      message: error instanceof Error ? error.message : String(error)
    });
    await useStorySessionStore.getState().saveStory();
    return false;
  }
}

function validateGenerationConfig(stepId: StoryWorkflowStepId, config: BackendRuntimeConfig): string | null {
  if ((stepId === "userText" || stepId === "dialogue" || stepId === "visualDescription") && !config.llm.model_path.trim()) {
    return "Choose an LLM model path in Backend Configuration before generating this step.";
  }
  if (stepId === "danbot" && !config.danbot.model_path.trim()) {
    return "Choose a DanBotNL model path in Backend Configuration before generating tags.";
  }
  if (stepId === "image" && !config.image.model_path.trim()) {
    return "Choose an image model path in Backend Configuration before generating an image.";
  }
  return null;
}

async function commitStep(stepId: StoryWorkflowStepId, options: { continueAfter?: boolean; nodeId?: string } = {}): Promise<void> {
  const state = useStorySessionStore.getState();
  const nodeId = options.nodeId ?? state.selectedNodeId;
  if (!state.tree || !nodeId) return;
  const step = stepById[stepId];
  const document = resolveStoryNodeFields(state.tree, nodeId);
  const snapshot = workflowForNode(state, nodeId);
  const stepState = ensureWorkflowStepState(snapshot, stepId, () => step.read(document));
  const edited = step.normalize ? step.normalize(stepState.edited ?? step.read(document)) : (stepState.edited ?? step.read(document));
  const fields = fieldsForStoryWorkflowStep(stepId);
  const patch = Object.fromEntries(
    Object.entries(edited).filter(([field]) => fields.includes(field as StoryNodeFieldKey) || field in document)
  ) as Partial<Record<StoryNodeFieldKey, string>>;
  const tree = editStoryNodeFields(state.tree, nodeId, patch);
  const imageRef = typeof patch.imageRef === "string" ? parseImageRef(patch.imageRef) : null;

  markWorkflowStepValidated(snapshot, stepId, edited);
  invalidateWorkflowStepsAfter(storyWorkflowStepIds, snapshot, stepId);
  const next = nextStepId(storyWorkflowStepIds, stepId);
  snapshot.frontierStepId = next ?? stepId;
  snapshot.activeStepId = stepId;
  snapshot.machineState = "editing";

  useStorySessionStore.setState((previous) => ({
    tree,
    imageRefs: imageRef ? { ...previous.imageRefs, [nodeId]: imageRef } : previous.imageRefs,
    workflowByNodeId: { ...previous.workflowByNodeId, [nodeId]: snapshot },
    activeStepId: stepId,
    dirty: true,
    message: `${step.label} validated.`
  }));
  await useStorySessionStore.getState().saveStory();
}

async function completeSceneAndAdvance(nodeId = useStorySessionStore.getState().selectedNodeId): Promise<void> {
  const state = useStorySessionStore.getState();
  if (!state.tree || !nodeId) return;

  const completed = resolveStoryNodeFields(state.tree, nodeId);
  const completedSnapshot = workflowForNode(state, nodeId);
  const finalStepId = storyWorkflowStepIds[storyWorkflowStepIds.length - 1];
  completedSnapshot.machineState = "editing";
  completedSnapshot.frontierStepId = finalStepId;
  completedSnapshot.activeStepId = finalStepId;

  const added = addStoryChildNode(state.tree, nodeId, {
    context: completed.dialogue || completed.context,
    negativePrompt: completed.negativePrompt
  });
  const nextSceneWorkflow = createWorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>(storyWorkflowStepIds, "userText");
  nextSceneWorkflow.frontierStepId = "userText";
  nextSceneWorkflow.activeStepId = "userText";
  markWorkflowStepValidated(nextSceneWorkflow, "context", { context: completed.dialogue || completed.context });

  useStorySessionStore.setState((previous) => ({
    tree: added.tree,
    selectedNodeId: added.nodeId,
    historyBack: previous.selectedNodeId ? [...previous.historyBack, previous.selectedNodeId] : previous.historyBack,
    historyForward: [],
    workflowByNodeId: {
      ...previous.workflowByNodeId,
      [nodeId]: completedSnapshot,
      [added.nodeId]: nextSceneWorkflow
    },
    activeStepId: "userText",
    busy: false,
    runningJob: null,
    dirty: true,
    message: "Scene completed. Waiting for the next user text."
  }));
  await useStorySessionStore.getState().saveStory();
}

function setWorkflowMachine(nodeId: string, machineState: "editing" | "running", stepId: StoryWorkflowStepId): void {
  const state = useStorySessionStore.getState();
  const snapshot = workflowForNode(state, nodeId);
  snapshot.machineState = machineState;
  snapshot.frontierStepId = stepId;
  snapshot.activeStepId = stepId;
  setStateForNode(nodeId, snapshot, { activeStepId: stepId, busy: machineState === "running" });
}

function setStateForNode(nodeId: string, snapshot: StoryWorkflowSnapshot, patch: Partial<StorySessionState>): void {
  useStorySessionStore.setState((state) => ({
    ...patch,
    workflowByNodeId: { ...state.workflowByNodeId, [nodeId]: snapshot },
    dirty: true
  }));
}

function workflowForSelected(state: StorySessionState): StoryWorkflowSnapshot {
  if (!state.selectedNodeId) return createWorkflowSnapshot(storyWorkflowStepIds, "context");
  return workflowForNode(state, state.selectedNodeId);
}

function workflowForNode(state: StorySessionState, nodeId: string): StoryWorkflowSnapshot {
  return cloneWorkflowSnapshot(state.workflowByNodeId[nodeId] ?? createWorkflowSnapshot(storyWorkflowStepIds, "context"));
}

function ensureWorkflowRecord(record: StoryWorkflowByNodeId, nodeId: string, activeStepId: StoryWorkflowStepId = "context"): StoryWorkflowByNodeId {
  if (!nodeId) return record;
  if (record[nodeId]) return { ...record };
  return { ...record, [nodeId]: createWorkflowSnapshot(storyWorkflowStepIds, activeStepId) };
}

function cloneWorkflowSnapshot(snapshot: StoryWorkflowSnapshot): StoryWorkflowSnapshot {
  return {
    machineState: snapshot.machineState,
    frontierStepId: snapshot.frontierStepId,
    activeStepId: snapshot.activeStepId,
    stepStates: Object.fromEntries(
      Object.entries(snapshot.stepStates).map(([stepId, state]) => [
        stepId,
        state ? { ...state, generated: clonePayload(state.generated), edited: clonePayload(state.edited), warnings: state.warnings ? [...state.warnings] : undefined } : state
      ])
    ) as StoryWorkflowSnapshot["stepStates"]
  };
}

function clonePayload(payload: StoryWorkflowPayload | null): StoryWorkflowPayload | null {
  return payload ? { ...payload } : null;
}

function coerceWorkflowByNodeId(value: unknown): StoryWorkflowByNodeId {
  if (!value || typeof value !== "object") return {};
  return value as StoryWorkflowByNodeId;
}

function asStoryWorkflowStepId(value: unknown): StoryWorkflowStepId | null {
  return typeof value === "string" && (storyWorkflowStepIds as readonly string[]).includes(value) ? value as StoryWorkflowStepId : null;
}

function markInitialFieldStepsValidated(snapshot: StoryWorkflowSnapshot, fields: Partial<StoryNodeFields>): void {
  for (const stepId of storyWorkflowStepIds) {
    const stepFields = fieldsForStoryWorkflowStep(stepId);
    const payload = Object.fromEntries(stepFields.filter((field) => fields[field] != null).map((field) => [field, fields[field] ?? ""])) as StoryWorkflowPayload;
    if (Object.keys(payload).length) markWorkflowStepValidated(snapshot, stepId, payload);
  }
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
