import type { TextTree } from "@replayable-text-tree/core";
import type { BackendClient } from "@local-vn/backend-client";
import type { BackendRuntimeConfig, ImageRef, StoryManifest, StoryNodeFieldKey, StoryNodeFields } from "@local-vn/shared-types";
import type { FilePersistenceApi } from "@local-vn/config";
import {
  addStoryChildNode,
  createStoryTreeBundle,
  deleteStorySubtree,
  loadStoryBundle,
  resolveStoryNodeFields,
  saveStoryBundle,
  type StoryTreeBundle
} from "@local-vn/story-tree";
import {
  StoryWorkflowRunner,
  asStoryWorkflowStepId,
  coerceWorkflowByNodeId,
  ensureWorkflowRecord,
  markInitialFieldStepsValidated,
  selectCurrentWorkflowSnapshot as selectRunnerWorkflowSnapshot,
  selectResolvedWorkflowCurrent,
  type StoryWorkflowByNodeId,
  type StoryWorkflowRunnerState,
  type StoryWorkflowSnapshot,
  selectCurrentWorkflowSnapshot
} from "./storyWorkflowRunner";
import { canEditWorkflowStep, createWorkflowSnapshot } from "./workflowCore";
import {
  createStoryWorkflowSteps,
  defaultStoryWorkflowAutoValidateGeneratedCandidate,
  StoryWorkflowAutoValidateByStepId,
  StoryWorkflowPayload,
  storyWorkflowStepById,
  storyWorkflowStepIds,
  type StoryWorkflowStep,
  type StoryWorkflowStepId
} from "./backendWorkflow";

export type StorySessionBackend = Pick<BackendClient, "generateLlm" | "generateDanbotTags" | "generateImage">;

export interface StorySessionState extends StoryWorkflowRunnerState {
  manifest: StoryManifest | null;
}

export interface StorySessionServices {
  persistence(): FilePersistenceApi;
  backend(): StorySessionBackend;
  getConfig(): BackendRuntimeConfig;
}

export interface StorySessionActions {
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

export type StorySessionStoreState = StorySessionState & StorySessionActions;
export type StorySessionListener = (state: StorySessionState) => void;
export type StorySessionPatch = Partial<StorySessionState>;

export class StorySessionController implements StorySessionActions {
  private state: StorySessionState = createInitialStorySessionState();
  private readonly workflowRunner: StoryWorkflowRunner;
  private readonly listeners = new Set<StorySessionListener>();
  private saveQueue: Promise<void> = Promise.resolve();
  private saveSequence = 0;

  public constructor(private readonly services: StorySessionServices) {
    this.workflowRunner = new StoryWorkflowRunner({
      getState: () => this.state,
      setState: (patch) => this.setState(patch),
      saveStory: () => this.saveStory(),
      getWorkflowContext: (nodeId) => ({
        backend: this.services.backend(),
        config: this.services.getConfig(),
        storyId: this.state.storyId,
        selectedNodeId: nodeId
      })
    });
  }

  public getState(): StorySessionState {
    return this.state;
  }

  public subscribe(listener: StorySessionListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public async createStory(title: string, storyId?: string, initialFields: Partial<StoryNodeFields> = {}): Promise<void> {
    this.workflowRunner.cancelAll();

    const bundle = createStoryTreeBundle(title, storyId, initialFields);
    const workflowByNodeId = ensureWorkflowRecord(
      {},
      bundle.selectedNodeId,
      asStoryWorkflowStepId(bundle.activeWorkflowStepId) ?? "context"
    );

    this.setState({
      ...bundleToState({ ...bundle, workflowByNodeId, activeWorkflowStepId: "context" }, true),
      workflowByNodeId,
      activeStepId: "context",
      busy: false,
      runningJob: null,
      message: null
    });

    await this.saveStory();
    await this.workflowRunner.continueFrom("context", bundle.selectedNodeId);
  }

  public async loadStory(storyId: string): Promise<boolean> {
    this.workflowRunner.cancelAll();

    const bundle = await loadStoryBundle(this.services.persistence(), storyId);
    if (!bundle) return false;

    const workflowByNodeId = ensureWorkflowRecord(
      coerceWorkflowByNodeId(bundle.workflowByNodeId),
      bundle.selectedNodeId,
      asStoryWorkflowStepId(bundle.activeWorkflowStepId) ?? "context"
    );
    const activeStepId = asStoryWorkflowStepId(bundle.activeWorkflowStepId)
      ?? workflowByNodeId[bundle.selectedNodeId]?.activeStepId
      ?? "context";

    this.setState({
      ...bundleToState({ ...bundle, workflowByNodeId, activeWorkflowStepId: activeStepId }, false),
      workflowByNodeId,
      activeStepId,
      busy: false,
      runningJob: null,
      message: null
    });

    return true;
  }

  public async saveStory(): Promise<void> {
    const saveId = ++this.saveSequence;
    this.saveQueue = this.saveQueue.then(async () => {
      const state = this.state;
      if (!state.manifest || !state.tree || !state.selectedNodeId) return;

      const updatedManifest = { ...state.manifest, updated_at: new Date().toISOString() };
      await saveStoryBundle(this.services.persistence(), {
        manifest: updatedManifest,
        tree: state.tree,
        selectedNodeId: state.selectedNodeId,
        imageRefs: state.imageRefs,
        historyBack: state.historyBack,
        historyForward: state.historyForward,
        workflowByNodeId: state.workflowByNodeId,
        activeWorkflowStepId: state.activeStepId
      });

      this.setState((current) => ({
        manifest: current.manifest?.story_id === updatedManifest.story_id ? updatedManifest : current.manifest,
        dirty: saveId === this.saveSequence ? false : current.dirty
      }));
    });

    await this.saveQueue;
  }

  public selectNode(nodeId: string): void {
    const current = this.state.selectedNodeId;
    const changedNode = Boolean(current && current !== nodeId);
    if (changedNode && current) this.workflowRunner.cancelNode(current);

    this.setState((previous) => {
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

    void this.saveStory();
  }

  public goToParent(): void {
    const parentId = getParentId(this.state.tree, this.state.selectedNodeId);
    if (parentId) this.selectNode(parentId);
  }

  public goToFirstChild(): void {
    const [childId] = getChildIds(this.state.tree, this.state.selectedNodeId);
    if (childId) this.selectNode(childId);
  }

  public goToChild(nodeId: string): void {
    this.selectNode(nodeId);
  }

  public goToPreviousSibling(): void {
    const siblings = getSiblingIds(this.state.tree, this.state.selectedNodeId);
    const index = this.state.selectedNodeId ? siblings.indexOf(this.state.selectedNodeId) : -1;
    if (index > 0) this.selectNode(siblings[index - 1]);
  }

  public goToNextSibling(): void {
    const siblings = getSiblingIds(this.state.tree, this.state.selectedNodeId);
    const index = this.state.selectedNodeId ? siblings.indexOf(this.state.selectedNodeId) : -1;
    if (index >= 0 && index < siblings.length - 1) this.selectNode(siblings[index + 1]);
  }

  public goBack(): void {
    this.setState((state) => {
      const previous = state.historyBack.at(-1);
      if (!previous) return {};
      if (state.selectedNodeId) this.workflowRunner.cancelNode(state.selectedNodeId);

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

    void this.saveStory();
  }

  public goForward(): void {
    this.setState((state) => {
      const [next, ...rest] = state.historyForward;
      if (!next) return {};
      if (state.selectedNodeId) this.workflowRunner.cancelNode(state.selectedNodeId);

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

    void this.saveStory();
  }

  public createChildFromCurrent(
    initialFields: Partial<StoryNodeFields> = {},
    continueFromStepId: StoryWorkflowStepId = "context",
    options: { autoContinue?: boolean } = {}
  ): string {
    return this.createChildFromCurrentInternal(initialFields, continueFromStepId, options.autoContinue ?? true);
  }

  public async submitUserText(text: string, generateDialogue = true): Promise<void> {
    const userText = text.trim();
    if (!userText) return;

    if (this.state.activeStepId !== "userText" || !this.state.tree || !this.state.selectedNodeId) {
      this.createChildFromCurrentInternal({ userText }, "userText", false);
      if (generateDialogue) await this.workflowRunner.regenerateStep("dialogue");
      else await this.workflowRunner.continueFrom("dialogue", this.state.selectedNodeId);
      return;
    }

    this.workflowRunner.editStepField("userText", "userText", userText);
    await this.workflowRunner.validateStep("userText");

    if (generateDialogue) await this.workflowRunner.regenerateStep("dialogue");
  }

  public createAlternateBranch(initialFields: Partial<StoryNodeFields> = {}): string | null {
    const parentId = getParentId(this.state.tree, this.state.selectedNodeId);
    if (!this.state.tree || !parentId) return null;

    if (this.state.selectedNodeId) this.workflowRunner.cancelNode(this.state.selectedNodeId);

    const resolved = selectResolvedCurrent(this.state);
    const added = addStoryChildNode(this.state.tree, parentId, { ...resolved, ...initialFields });
    const workflowByNodeId = ensureWorkflowRecord(this.state.workflowByNodeId, added.nodeId);

    this.setState({
      tree: added.tree,
      selectedNodeId: added.nodeId,
      workflowByNodeId,
      activeStepId: "context",
      busy: false,
      runningJob: null,
      dirty: true,
      message: null
    });

    void this.saveStory();
    return added.nodeId;
  }

  public duplicateCurrentBranch(): string | null {
    return this.createAlternateBranch(selectResolvedCurrent(this.state));
  }

  public deleteNode(nodeId: string): void {
    if (!this.state.tree || !this.state.selectedNodeId) return;
    try {
      const deleted = deleteStorySubtree(this.state.tree, nodeId);
      const deletedIds = new Set(deleted.deletedNodeIds);
      for (const deletedNodeId of deletedIds) this.workflowRunner.cancelNode(deletedNodeId);

      const workflowByNodeId = Object.fromEntries(
        Object.entries(this.state.workflowByNodeId).filter(([candidateId]) => !deletedIds.has(candidateId))
      ) as StoryWorkflowByNodeId;
      const imageRefs = Object.fromEntries(
        Object.entries(this.state.imageRefs).filter(([candidateId]) => !deletedIds.has(candidateId))
      ) as Record<string, ImageRef>;
      const selectedNodeId = deletedIds.has(this.state.selectedNodeId) ? deleted.parentId : this.state.selectedNodeId;
      const nextWorkflowByNodeId = ensureWorkflowRecord(workflowByNodeId, selectedNodeId);
      const activeStepId = nextWorkflowByNodeId[selectedNodeId]?.activeStepId ?? "context";

      this.setState({
        tree: deleted.tree,
        selectedNodeId,
        imageRefs,
        historyBack: this.state.historyBack.filter((candidateId) => !deletedIds.has(candidateId)),
        historyForward: this.state.historyForward.filter((candidateId) => !deletedIds.has(candidateId)),
        workflowByNodeId: nextWorkflowByNodeId,
        activeStepId,
        busy: deletedIds.has(this.state.runningJob?.nodeId ?? "") ? false : this.state.busy,
        runningJob: deletedIds.has(this.state.runningJob?.nodeId ?? "") ? null : this.state.runningJob,
        dirty: true,
        message: deleted.deletedNodeIds.length > 1 ? "Scene branch deleted." : "Scene deleted."
      });
      void this.saveStory();
    } catch (error) {
      this.setState({ message: error instanceof Error ? error.message : String(error) });
    }
  }

  public deleteCurrentLeaf(): void {
    if (this.state.selectedNodeId) this.deleteNode(this.state.selectedNodeId);
  }

  public setAutoValidateGeneratedCandidate(stepId: StoryWorkflowStepId, enabled: boolean): void {
    this.setState((state) => ({
      autoValidateGeneratedCandidateByStepId: {
        ...state.autoValidateGeneratedCandidateByStepId,
        [stepId]: enabled
      }
    }));
  }

  public selectWorkflowStep(stepId: StoryWorkflowStepId): void {
    this.workflowRunner.selectWorkflowStep(stepId);
  }

  public editStepField(stepId: StoryWorkflowStepId, field: StoryNodeFieldKey, value: string): void {
    this.workflowRunner.editStepField(stepId, field, value);
  }

  public validateStep(stepId?: StoryWorkflowStepId): Promise<void> {
    return this.workflowRunner.validateStep(stepId);
  }

  public regenerateStep(stepId?: StoryWorkflowStepId): Promise<void> {
    return this.workflowRunner.regenerateStep(stepId);
  }

  public continueFrom(stepId?: StoryWorkflowStepId): Promise<void> {
    return this.workflowRunner.continueFrom(stepId);
  }

  public applyPresetContext(context: string): Promise<void> {
    return this.workflowRunner.applyPresetContext(context);
  }

  public applyResolverResult(input: { rawText: string; tags: string[]; prompt: string }): Promise<void> {
    return this.workflowRunner.applyResolverResult(input);
  }

  private createChildFromCurrentInternal(
    initialFields: Partial<StoryNodeFields>,
    continueFromStepId: StoryWorkflowStepId,
    autoContinue: boolean
  ): string {
    if (!this.state.tree || !this.state.selectedNodeId) throw new Error("No selected story node.");

    this.workflowRunner.cancelNode(this.state.selectedNodeId);

    const current = selectResolvedCurrent(this.state);
    const childFields = {
      context: current.dialogue || current.context,
      ...initialFields
    };
    const added = addStoryChildNode(this.state.tree, this.state.selectedNodeId, childFields);
    const workflow = createWorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>(storyWorkflowStepIds, continueFromStepId);
    workflow.frontierStepId = continueFromStepId;
    workflow.activeStepId = continueFromStepId;
    markInitialFieldStepsValidated(workflow, childFields);

    this.setState((previous) => ({
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

    void this.saveStory();
    if (autoContinue) void this.workflowRunner.continueFrom(continueFromStepId, added.nodeId);

    return added.nodeId;
  }

  private setState(patch: StorySessionPatch | ((state: StorySessionState) => StorySessionPatch)): void {
    const nextPatch = typeof patch === "function" ? patch(this.state) : patch;
    if (!Object.keys(nextPatch).length) return;
    this.state = { ...this.state, ...nextPatch };
    for (const listener of this.listeners) listener(this.state);
  }
}

const steps = createStoryWorkflowSteps();
const stepById = Object.fromEntries(steps.map((step) => [step.id, step])) as Record<StoryWorkflowStepId, StoryWorkflowStep>;

export function createInitialStorySessionState(): StorySessionState {
  return {
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
    autoValidateGeneratedCandidateByStepId: { ...defaultStoryWorkflowAutoValidateGeneratedCandidate } as StoryWorkflowAutoValidateByStepId,
    busy: false,
    message: null,
    dirty: false
  };
}

export function createStorySessionStoreState(controller: StorySessionController): StorySessionStoreState {
  return {
    ...controller.getState(),
    createStory: (...args) => controller.createStory(...args),
    loadStory: (...args) => controller.loadStory(...args),
    saveStory: () => controller.saveStory(),
    selectNode: (...args) => controller.selectNode(...args),
    goToParent: () => controller.goToParent(),
    goToFirstChild: () => controller.goToFirstChild(),
    goToChild: (...args) => controller.goToChild(...args),
    goToPreviousSibling: () => controller.goToPreviousSibling(),
    goToNextSibling: () => controller.goToNextSibling(),
    goBack: () => controller.goBack(),
    goForward: () => controller.goForward(),
    createChildFromCurrent: (...args) => controller.createChildFromCurrent(...args),
    submitUserText: (...args) => controller.submitUserText(...args),
    createAlternateBranch: (...args) => controller.createAlternateBranch(...args),
    duplicateCurrentBranch: () => controller.duplicateCurrentBranch(),
    deleteNode: (...args) => controller.deleteNode(...args),
    deleteCurrentLeaf: () => controller.deleteCurrentLeaf(),
    setAutoValidateGeneratedCandidate: (...args) => controller.setAutoValidateGeneratedCandidate(...args),
    selectWorkflowStep: (...args) => controller.selectWorkflowStep(...args),
    editStepField: (...args) => controller.editStepField(...args),
    validateStep: (...args) => controller.validateStep(...args),
    regenerateStep: (...args) => controller.regenerateStep(...args),
    continueFrom: (...args) => controller.continueFrom(...args),
    applyPresetContext: (...args) => controller.applyPresetContext(...args),
    applyResolverResult: (...args) => controller.applyResolverResult(...args)
  };
}

export function selectResolvedCurrent(state: Pick<StorySessionState, "tree" | "selectedNodeId">): StoryNodeFields {
  return selectResolvedWorkflowCurrent(state);
}


export function selectActiveWorkflowStep(state: StorySessionState): StoryWorkflowStep {
  return storyWorkflowStepById[state.activeStepId] ?? stepById[state.activeStepId];
}

export function selectCanEditStep(state: StorySessionState, stepId: StoryWorkflowStepId): boolean {
  const snapshot = selectCurrentWorkflowSnapshot(state);
  return snapshot ? canEditWorkflowStep(storyWorkflowStepIds, snapshot, stepId) : false;
}

export function selectCanGenerateStep(state: StorySessionState, stepId: StoryWorkflowStepId): boolean {
  return selectCanEditStep(state, stepId) && Boolean((storyWorkflowStepById[stepId] ?? stepById[stepId]).generate) && !state.busy;
}

export function selectCanValidateStep(state: StorySessionState, stepId: StoryWorkflowStepId): boolean {
  const snapshot = selectCurrentWorkflowSnapshot(state);
  return Boolean(snapshot?.stepStates[stepId]?.edited) && selectCanEditStep(state, stepId) && !state.busy;
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


type UnknownNode = Record<string, unknown>;

function getNodeRecord(tree: TextTree | null, nodeId: string | null): UnknownNode | null {
  if (!tree || !nodeId) return null;
  const rawTree = tree as Record<string, unknown>;
  const nodes = rawTree.nodes;
  if (nodes && typeof nodes === "object" && nodeId in nodes) {
    const node = (nodes as Record<string, unknown>)[nodeId];
    return isObject(node) ? node : null;
  }
  return null;
}

function getChildIds(tree: TextTree | null, nodeId: string | null): string[] {
  const node = getNodeRecord(tree, nodeId);
  if (!node) return [];
  const raw = node.childIds ?? node.children ?? node.child_ids;
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.keys(raw);
  return [];
}

function getParentId(tree: TextTree | null, nodeId: string | null): string | null {
  const node = getNodeRecord(tree, nodeId);
  if (node) {
    const parent = node.parentId ?? node.parent_id ?? node.parent;
    if (typeof parent === "string") return parent;
  }
  if (!tree || !nodeId) return null;
  const rawTree = tree as Record<string, unknown>;
  const nodes = rawTree.nodes;
  if (!nodes || typeof nodes !== "object") return null;
  for (const [candidateId, candidateNode] of Object.entries(nodes as Record<string, unknown>)) {
    if (isObject(candidateNode) && getChildIds(tree, candidateId).includes(nodeId)) return candidateId;
  }
  return null;
}

function getSiblingIds(tree: TextTree | null, nodeId: string | null): string[] {
  const parentId = getParentId(tree, nodeId);
  return parentId ? getChildIds(tree, parentId) : [];
}

function isObject(value: unknown): value is UnknownNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
