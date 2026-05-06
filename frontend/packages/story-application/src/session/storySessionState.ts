import type { TextTree } from "@replayable-text-tree/core";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import {
  defaultStoryWorkflowAutoValidateGeneratedCandidate,
  type ImageRef,
  type StoryManifest,
  type StoryNodeFieldKey,
  type StoryTreeBundle,
  type StoryWorkflowAutoValidateByStepId,
  type StoryWorkflowByNodeId,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";

import type { StorySessionServices } from "../ports";

export interface StorySessionRunningJob {
  id: string;
  nodeId: string;
  runId: string;
  stepId: StoryWorkflowStepId;
}

export interface StorySessionDeferredBatchJob {
  id: string;
  kind: "danbot" | "image";
  status: "running" | "complete" | "cancelled" | "failed";
  currentNodeId: string | null;
  currentIndex: number;
  total: number;
  completed: number;
  startedAt: string;
  message: string | null;
}

export interface StorySessionState {
  storyId: string | null;
  manifest: StoryManifest | null;
  tree: TextTree | null;
  selectedNodeId: string | null;
  imageRefs: Record<string, ImageRef>;
  historyBack: string[];
  historyForward: string[];
  workflowByNodeId: StoryWorkflowByNodeId;
  activeStepId: StoryWorkflowStepId;
  runningJob: StorySessionRunningJob | null;
  deferredBatchJob: StorySessionDeferredBatchJob | null;
  autoValidateGeneratedCandidateByStepId: StoryWorkflowAutoValidateByStepId;
  busy: boolean;
  message: string | null;
  dirty: boolean;
  backendConfig: BackendRuntimeConfig | null;
}

export type StorySessionPatch = Partial<StorySessionState>;

export type StorySessionStateUpdater = (
  state: StorySessionState
) => StorySessionPatch;

export type StorySessionListener = (state: StorySessionState) => void;

export interface StorySessionActions {
  createStory(title: string): Promise<void>;
  loadStory(storyId: string, options?: { resume?: boolean }): Promise<void>;
  renameStory(title: string): Promise<void>;
  saveStory(): Promise<void>;

  selectNode(nodeId: string): void;
  goBack(): void;
  goForward(): void;
  goToParent(): void;
  goToFirstChild(): void;
  goToChild(nodeId: string): void;
  goToPreviousSibling(): void;
  goToNextSibling(): void;

  createChildFromCurrent(initialUserText?: string): Promise<void>;
  submitUserText(userText: string): Promise<void>;
  createAlternateBranch(userText?: string): Promise<void>;
  duplicateCurrentBranch(): Promise<void>;
  deleteNode(nodeId: string): Promise<void>;
  deleteCurrentLeaf(): Promise<void>;

  selectWorkflowStep(stepId: StoryWorkflowStepId): void;
  editStepField(
    stepId: StoryWorkflowStepId,
    field: StoryNodeFieldKey,
    value: string
  ): void;
  validateStep(stepId?: StoryWorkflowStepId): Promise<void>;
  regenerateStep(stepId?: StoryWorkflowStepId): Promise<void>;
  continueFrom(
    stepId?: StoryWorkflowStepId,
    nodeId?: string | null
  ): Promise<void>;
  setStepAutoValidate(stepId: StoryWorkflowStepId, enabled: boolean): void;
  generateDeferredDanbot(): Promise<void>;
  generateDeferredImages(): Promise<void>;
  regenerateStoryDanbot(): Promise<void>;
  regenerateStoryImages(): Promise<void>;
  cancelDeferredGeneration(): Promise<void>;
  applyPresetContext(context: string): Promise<void>;
  applyResolverResult(input: {
    rawText: string;
    tags: string[];
    prompt: string;
  }): Promise<void>;

  cancelAll(): Promise<void>;
  cancelNode(nodeId: string): Promise<void>;

  setBackendConfig(config: BackendRuntimeConfig | null): void;
  setMessage(message: string | null): void;
}

export type StorySessionStoreState = StorySessionState & StorySessionActions;

export interface StorySessionControllerOptions {
  services: StorySessionServices;
  initialState?: Partial<StorySessionState>;
}

export function createInitialStorySessionState(
  overrides: Partial<StorySessionState> = {}
): StorySessionState {
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
    deferredBatchJob: null,
    autoValidateGeneratedCandidateByStepId: {
      ...defaultStoryWorkflowAutoValidateGeneratedCandidate
    },
    busy: false,
    message: null,
    dirty: false,
    backendConfig: null,
    ...overrides
  };
}

export function createStorySessionStateFromBundle(
  bundle: StoryTreeBundle,
  overrides: Partial<StorySessionState> = {}
): StorySessionState {
  return createInitialStorySessionState({
    storyId: bundle.manifest.story_id,
    manifest: bundle.manifest,
    tree: bundle.tree,
    selectedNodeId: bundle.selectedNodeId,
    imageRefs: bundle.imageRefs,
    historyBack: bundle.historyBack ?? [],
    historyForward: bundle.historyForward ?? [],
    workflowByNodeId: (bundle.workflowByNodeId as StoryWorkflowByNodeId) ?? {},
    activeStepId:
      (bundle.activeWorkflowStepId as StoryWorkflowStepId | undefined) ??
      "context",
    dirty: false,
    ...overrides
  });
}

export function applyStorySessionPatch(
  state: StorySessionState,
  patch: StorySessionPatch | StorySessionStateUpdater
): StorySessionState {
  const resolvedPatch = typeof patch === "function" ? patch(state) : patch;

  return {
    ...state,
    ...resolvedPatch
  };
}
