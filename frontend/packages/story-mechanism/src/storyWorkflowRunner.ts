import type { TextTree } from "@replayable-text-tree/core";
import type { BackendRuntimeConfig, ImageRef, StoryNodeFieldKey, StoryNodeFields } from "@local-vn/shared-types";
import {
  addStoryChildNode,
  editStoryNodeFields,
  parseImageRef,
  resolveStoryNodeFields
} from "@local-vn/story-tree";
import {
  canEditWorkflowStep,
  createWorkflowSnapshot,
  ensureWorkflowStepState,
  invalidateWorkflowStepsAfter,
  markWorkflowStepFailed,
  markWorkflowStepGenerating,
  markWorkflowStepValidated,
  nextStepId,
  setWorkflowStepCandidate,
  setWorkflowStepEdited,
  type WorkflowMachineState,
  type WorkflowSnapshot
} from "./workflowCore";
import {
  createStoryWorkflowSteps,
  fieldsForStoryWorkflowStep,
  storyWorkflowStepIds,
  type StoryWorkflowAutoValidateByStepId,
  type StoryWorkflowContext,
  type StoryWorkflowPayload,
  type StoryWorkflowStep,
  type StoryWorkflowStepId
} from "./backendWorkflow";

export type StoryWorkflowSnapshot = WorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>;
export type StoryWorkflowByNodeId = Record<string, StoryWorkflowSnapshot>;

export interface StoryWorkflowRunningJob {
  id: string;
  nodeId: string;
  runId: string;
  stepId: StoryWorkflowStepId;
}

export interface StoryWorkflowRunnerState {
  storyId: string | null;
  tree: TextTree | null;
  selectedNodeId: string | null;
  imageRefs: Record<string, ImageRef>;
  historyBack: string[];
  historyForward: string[];
  workflowByNodeId: StoryWorkflowByNodeId;
  activeStepId: StoryWorkflowStepId;
  runningJob: StoryWorkflowRunningJob | null;
  autoValidateGeneratedCandidateByStepId: StoryWorkflowAutoValidateByStepId;
  busy: boolean;
  message: string | null;
  dirty: boolean;
}

export type StoryWorkflowRunnerPatch = Partial<StoryWorkflowRunnerState>;

export interface StoryWorkflowRunnerAdapter {
  getState(): StoryWorkflowRunnerState;
  setState(
    patch:
      | StoryWorkflowRunnerPatch
      | ((state: StoryWorkflowRunnerState) => StoryWorkflowRunnerPatch)
  ): void;
  saveStory(): Promise<void>;
  getWorkflowContext(nodeId: string): StoryWorkflowContext;
}

interface WorkflowRunToken {
  nodeId: string;
  runId: string;
}

interface GenerateCandidateOptions {
  nodeId?: string;
  runId?: string;
  stayEditing: boolean;
}

interface CommitStepOptions {
  nodeId?: string;
}

export class StoryWorkflowRunner {
  private readonly steps: StoryWorkflowStep[];
  private readonly stepById: Record<StoryWorkflowStepId, StoryWorkflowStep>;
  private generationSequence = 0;
  private runSequence = 0;
  private activeGenerationByKey = new Map<string, string>();
  private activeRunByNodeId = new Map<string, string>();

  public constructor(private readonly adapter: StoryWorkflowRunnerAdapter, steps = createStoryWorkflowSteps()) {
    this.steps = steps;
    this.stepById = Object.fromEntries(steps.map((step) => [step.id, step])) as Record<StoryWorkflowStepId, StoryWorkflowStep>;
  }

  public cancelAll(): void {
    this.runSequence += 1;
    this.generationSequence += 1;
    this.activeRunByNodeId.clear();
    this.activeGenerationByKey.clear();
  }

  public cancelNode(nodeId: string): void {
    this.activeRunByNodeId.delete(nodeId);
    for (const key of [...this.activeGenerationByKey.keys()]) {
      if (key.startsWith(`${nodeId}:`)) this.activeGenerationByKey.delete(key);
    }
  }

  public selectWorkflowStep(stepId: StoryWorkflowStepId): void {
    const state = this.adapter.getState();
    if (!state.selectedNodeId) return;

    this.updateWorkflowForNode(state.selectedNodeId, (snapshot) => {
      snapshot.activeStepId = stepId;
      return snapshot;
    }, {
      activeStepId: stepId
    });

    void this.adapter.saveStory();
  }

  public editStepField(stepId: StoryWorkflowStepId, field: StoryNodeFieldKey, value: string): void {
    const state = this.adapter.getState();
    if (!state.tree || !state.selectedNodeId) return;

    const snapshot = workflowForNode(state, state.selectedNodeId);
    if (!canEditWorkflowStep(storyWorkflowStepIds, snapshot, stepId)) {
      this.adapter.setState({ message: "Future steps are view-only until the workflow reaches them." });
      return;
    }

    const step = this.stepById[stepId];
    const document = resolveStoryNodeFields(state.tree, state.selectedNodeId);
    ensureWorkflowStepState(snapshot, stepId, () => step.read(document));
    const currentEdited = snapshot.stepStates[stepId]?.edited ?? step.read(document);
    setWorkflowStepEdited(snapshot, stepId, step.merge(currentEdited, { [field]: value }));
    snapshot.activeStepId = stepId;

    this.setStateForNode(state.selectedNodeId, snapshot, {
      activeStepId: stepId,
      message: null
    });

    void this.adapter.saveStory();
  }

  public async validateStep(stepId = this.adapter.getState().activeStepId): Promise<void> {
    const state = this.adapter.getState();
    const nodeId = state.selectedNodeId;
    if (!nodeId) return;

    await this.commitStep(stepId, { nodeId });

    const next = nextStepId(storyWorkflowStepIds, stepId);
    if (next) {
      await this.continueFrom(next, nodeId);
      return;
    }

    await this.completeSceneAndAdvance(nodeId);
  }

  public async regenerateStep(stepId = this.adapter.getState().activeStepId): Promise<void> {
    const nodeId = this.adapter.getState().selectedNodeId;
    if (!nodeId) return;

    const run = this.beginRun(nodeId);
    const generated = await this.generateCandidate(stepId, {
      nodeId,
      runId: run.runId,
      stayEditing: true
    });

    if (generated && this.adapter.getState().autoValidateGeneratedCandidateByStepId[stepId]) {
      await this.validateStep(stepId);
    }
  }

  public async continueFrom(stepId = this.adapter.getState().activeStepId, nodeId = this.adapter.getState().selectedNodeId): Promise<void> {
    if (!nodeId) return;

    const run = this.beginRun(nodeId);
    let currentStepId: StoryWorkflowStepId | null = stepId;
    this.setWorkflowMachine(nodeId, "running", currentStepId);

    while (currentStepId) {
      if (!this.isRunCurrent(run)) return;

      const state = this.adapter.getState();
      if (!state.tree) return;

      const step = this.stepById[currentStepId];
      const snapshot = workflowForNode(state, nodeId);

      if (step.mode === "manual") {
        ensureWorkflowStepState(snapshot, currentStepId, () => step.read(resolveStoryNodeFields(state.tree, nodeId)));
        snapshot.machineState = "editing";
        snapshot.frontierStepId = currentStepId;
        snapshot.activeStepId = currentStepId;

        this.setStateForNode(nodeId, snapshot, {
          activeStepId: currentStepId,
          busy: false,
          runningJob: null,
          message: `Waiting for validation at ${step.label}.`
        });

        await this.adapter.saveStory();
        return;
      }

      if (step.generate) {
        const generated = await this.generateCandidate(currentStepId, {
          nodeId,
          runId: run.runId,
          stayEditing: false
        });
        if (!generated || !this.isRunCurrent(run)) return;

        if (!this.adapter.getState().autoValidateGeneratedCandidateByStepId[currentStepId]) {
          const nextSnapshot = workflowForNode(this.adapter.getState(), nodeId);
          nextSnapshot.machineState = "editing";
          nextSnapshot.frontierStepId = currentStepId;
          nextSnapshot.activeStepId = currentStepId;
          this.setStateForNode(nodeId, nextSnapshot, {
            activeStepId: currentStepId,
            busy: false,
            runningJob: null,
            message: `Generated ${step.label}; waiting for validation.`
          });
          await this.adapter.saveStory();
          return;
        }
      }

      await this.commitStep(currentStepId, { nodeId });
      if (!this.isRunCurrent(run)) return;
      currentStepId = nextStepId(storyWorkflowStepIds, currentStepId);
    }

    if (this.isRunCurrent(run)) {
      await this.completeSceneAndAdvance(nodeId);
    }
  }

  public async applyPresetContext(context: string): Promise<void> {
    const state = this.adapter.getState();
    if (!state.selectedNodeId) return;

    const snapshot = workflowForNode(state, state.selectedNodeId);
    setWorkflowStepEdited(snapshot, "context", { context });
    this.setStateForNode(state.selectedNodeId, snapshot, {
      activeStepId: "context"
    });

    await this.commitStep("context", { nodeId: state.selectedNodeId });
    await this.continueFrom("userText", state.selectedNodeId);
  }

  public async applyResolverResult(input: { rawText: string; tags: string[]; prompt: string }): Promise<void> {
    const state = this.adapter.getState();
    if (!state.tree || !state.selectedNodeId) return;

    const nodeId = state.selectedNodeId;
    const patch = {
      resolverText: input.rawText,
      selectedTags: input.tags.join(", "),
      positivePrompt: input.prompt
    };
    const tree = editStoryNodeFields(state.tree, nodeId, patch);
    const snapshot = workflowForNode(state, nodeId);

    markWorkflowStepValidated(snapshot, "resolverText", { resolverText: input.rawText });
    markWorkflowStepValidated(snapshot, "selectedTags", { selectedTags: patch.selectedTags });
    markWorkflowStepValidated(snapshot, "prompt", {
      positivePrompt: input.prompt,
      negativePrompt: resolveStoryNodeFields(state.tree, nodeId).negativePrompt
    });
    invalidateWorkflowStepsAfter(storyWorkflowStepIds, snapshot, "prompt");
    snapshot.activeStepId = "prompt";
    snapshot.frontierStepId = "image";
    snapshot.machineState = "editing";

    this.setStateForNode(nodeId, snapshot, {
      tree,
      activeStepId: "prompt",
      message: "Resolver result accepted into the workflow."
    });

    await this.adapter.saveStory();
  }

  private async generateCandidate(stepId: StoryWorkflowStepId, options: GenerateCandidateOptions): Promise<boolean> {
    const state = this.adapter.getState();
    const nodeId = options.nodeId ?? state.selectedNodeId;
    if (!state.tree || !nodeId) return false;
    if (options.runId && !this.isRunCurrent({ nodeId, runId: options.runId })) return false;

    const step = this.stepById[stepId];
    if (!step.generate) return false;

    const document = resolveStoryNodeFields(state.tree, nodeId);
    const snapshot = workflowForNode(state, nodeId);
    const previousEdited = snapshot.stepStates[stepId]?.edited ?? step.read(document);
    const context = this.adapter.getWorkflowContext(nodeId);
    const validationError = validateGenerationConfig(stepId, context.config);

    if (validationError) {
      markWorkflowStepFailed(snapshot, stepId, validationError, previousEdited);
      snapshot.machineState = "editing";
      snapshot.frontierStepId = stepId;
      snapshot.activeStepId = stepId;
      this.setStateForNode(nodeId, snapshot, {
        activeStepId: stepId,
        busy: false,
        runningJob: null,
        message: validationError
      });
      await this.adapter.saveStory();
      return false;
    }

    markWorkflowStepGenerating(snapshot, stepId, previousEdited);
    snapshot.activeStepId = stepId;

    const generationId = `${nodeId}:${stepId}:${++this.generationSequence}`;
    const generationKey = generationKeyFor(nodeId, stepId);
    this.activeGenerationByKey.set(generationKey, generationId);

    this.setStateForNode(nodeId, snapshot, {
      activeStepId: stepId,
      busy: true,
      runningJob: {
        id: generationId,
        nodeId,
        runId: options.runId ?? generationId,
        stepId
      },
      message: `Generating ${step.label}...`
    });

    try {
      const latest = this.adapter.getState();
      if (!latest.tree || !this.isGenerationCurrent(generationKey, generationId)) return false;
      if (options.runId && !this.isRunCurrent({ nodeId, runId: options.runId })) return false;

      const result = await step.generate({
        document: resolveStoryNodeFields(latest.tree, nodeId),
        context
      });

      if (!this.isGenerationCurrent(generationKey, generationId)) return false;
      if (options.runId && !this.isRunCurrent({ nodeId, runId: options.runId })) return false;

      const nextSnapshot = workflowForNode(this.adapter.getState(), nodeId);
      const normalized = step.normalize ? step.normalize(result.value) : result.value;
      setWorkflowStepCandidate(nextSnapshot, stepId, normalized, result.warnings ?? []);
      nextSnapshot.machineState = options.stayEditing ? "editing" : nextSnapshot.machineState;
      nextSnapshot.activeStepId = stepId;

      this.setStateForNode(nodeId, nextSnapshot, {
        activeStepId: stepId,
        busy: false,
        runningJob: null,
        message: result.warnings?.length ? result.warnings.join("; ") : `${step.label} generated.`
      });

      await this.adapter.saveStory();
      return true;
    } catch (error) {
      if (!this.isGenerationCurrent(generationKey, generationId)) return false;
      if (options.runId && !this.isRunCurrent({ nodeId, runId: options.runId })) return false;

      const nextSnapshot = workflowForNode(this.adapter.getState(), nodeId);
      const message = error instanceof Error ? error.message : String(error);
      markWorkflowStepFailed(nextSnapshot, stepId, message, previousEdited);
      nextSnapshot.machineState = "editing";
      nextSnapshot.frontierStepId = stepId;
      nextSnapshot.activeStepId = stepId;

      this.setStateForNode(nodeId, nextSnapshot, {
        activeStepId: stepId,
        busy: false,
        runningJob: null,
        message
      });

      await this.adapter.saveStory();
      return false;
    } finally {
      if (this.isGenerationCurrent(generationKey, generationId)) {
        this.activeGenerationByKey.delete(generationKey);
      }
    }
  }

  private async commitStep(stepId: StoryWorkflowStepId, options: CommitStepOptions = {}): Promise<void> {
    const state = this.adapter.getState();
    const nodeId = options.nodeId ?? state.selectedNodeId;
    if (!state.tree || !nodeId) return;

    const step = this.stepById[stepId];
    const document = resolveStoryNodeFields(state.tree, nodeId);
    const snapshot = workflowForNode(state, nodeId);
    const stepState = ensureWorkflowStepState(snapshot, stepId, () => step.read(document));
    const edited = step.normalize
      ? step.normalize(stepState.edited ?? step.read(document))
      : (stepState.edited ?? step.read(document));
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

    this.setStateForNode(nodeId, snapshot, {
      tree,
      imageRefs: imageRef ? { ...state.imageRefs, [nodeId]: imageRef } : state.imageRefs,
      activeStepId: stepId,
      message: `${step.label} validated.`
    });

    await this.adapter.saveStory();
  }

  private async completeSceneAndAdvance(nodeId: string): Promise<void> {
    const state = this.adapter.getState();
    if (!state.tree || state.selectedNodeId !== nodeId) return;

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

    this.adapter.setState((previous) => ({
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

    await this.adapter.saveStory();
  }

  private beginRun(nodeId: string): WorkflowRunToken {
    const runId = `${nodeId}:run:${++this.runSequence}`;
    this.activeRunByNodeId.set(nodeId, runId);
    return { nodeId, runId };
  }

  private isRunCurrent(token: WorkflowRunToken): boolean {
    return this.activeRunByNodeId.get(token.nodeId) === token.runId;
  }

  private isGenerationCurrent(key: string, generationId: string): boolean {
    return this.activeGenerationByKey.get(key) === generationId;
  }

  private setWorkflowMachine(nodeId: string, machineState: WorkflowMachineState, stepId: StoryWorkflowStepId): void {
    const snapshot = workflowForNode(this.adapter.getState(), nodeId);
    snapshot.machineState = machineState;
    snapshot.frontierStepId = stepId;
    snapshot.activeStepId = stepId;
    this.setStateForNode(nodeId, snapshot, {
      activeStepId: stepId,
      busy: machineState === "running"
    });
  }

  private updateWorkflowForNode(
    nodeId: string,
    update: (snapshot: StoryWorkflowSnapshot) => StoryWorkflowSnapshot,
    patch: StoryWorkflowRunnerPatch = {}
  ): void {
    const snapshot = update(workflowForNode(this.adapter.getState(), nodeId));
    this.setStateForNode(nodeId, snapshot, patch);
  }

  private setStateForNode(nodeId: string, snapshot: StoryWorkflowSnapshot, patch: StoryWorkflowRunnerPatch = {}): void {
    this.adapter.setState((state) => {
      const isSelected = state.selectedNodeId === nodeId;
      const nextPatch = { ...patch };
      if (patch.activeStepId && !isSelected) {
        delete nextPatch.activeStepId;
      }

      return {
        ...nextPatch,
        workflowByNodeId: {
          ...state.workflowByNodeId,
          [nodeId]: snapshot
        },
        dirty: true
      };
    });
  }
}

export function selectResolvedWorkflowCurrent(state: Pick<StoryWorkflowRunnerState, "tree" | "selectedNodeId">): StoryNodeFields {
  return resolveStoryNodeFields(state.tree, state.selectedNodeId);
}

export function selectCurrentWorkflowSnapshot(state: StoryWorkflowRunnerState): StoryWorkflowSnapshot | null {
  if (!state.selectedNodeId) return null;
  return state.workflowByNodeId[state.selectedNodeId] ?? null;
}

export function ensureWorkflowRecord(
  record: StoryWorkflowByNodeId,
  nodeId: string,
  activeStepId: StoryWorkflowStepId = "context"
): StoryWorkflowByNodeId {
  if (!nodeId) return record;
  if (record[nodeId]) return { ...record };
  return { ...record, [nodeId]: createWorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>(storyWorkflowStepIds, activeStepId) };
}

export function workflowForNode(state: Pick<StoryWorkflowRunnerState, "workflowByNodeId">, nodeId: string): StoryWorkflowSnapshot {
  return cloneWorkflowSnapshot(state.workflowByNodeId[nodeId] ?? createWorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>(storyWorkflowStepIds, "context"));
}

export function cloneWorkflowSnapshot(snapshot: StoryWorkflowSnapshot): StoryWorkflowSnapshot {
  return {
    machineState: snapshot.machineState,
    frontierStepId: snapshot.frontierStepId,
    activeStepId: snapshot.activeStepId,
    stepStates: Object.fromEntries(
      Object.entries(snapshot.stepStates).map(([stepId, state]) => [
        stepId,
        state
          ? {
              ...state,
              generated: clonePayload(state.generated),
              edited: clonePayload(state.edited),
              warnings: state.warnings ? [...state.warnings] : undefined
            }
          : state
      ])
    ) as StoryWorkflowSnapshot["stepStates"]
  };
}

export function coerceWorkflowByNodeId(value: unknown): StoryWorkflowByNodeId {
  if (!value || typeof value !== "object") return {};
  return value as StoryWorkflowByNodeId;
}

export function asStoryWorkflowStepId(value: unknown): StoryWorkflowStepId | null {
  return typeof value === "string" && (storyWorkflowStepIds as readonly string[]).includes(value)
    ? value as StoryWorkflowStepId
    : null;
}

export function markInitialFieldStepsValidated(snapshot: StoryWorkflowSnapshot, fields: Partial<StoryNodeFields>): void {
  for (const stepId of storyWorkflowStepIds) {
    const stepFields = fieldsForStoryWorkflowStep(stepId);
    const payload = Object.fromEntries(
      stepFields
        .filter((field) => fields[field] != null)
        .map((field) => [field, fields[field] ?? ""])
    ) as StoryWorkflowPayload;
    if (Object.keys(payload).length) markWorkflowStepValidated(snapshot, stepId, payload);
  }
}

export function validateGenerationConfig(stepId: StoryWorkflowStepId, config: BackendRuntimeConfig): string | null {
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

function generationKeyFor(nodeId: string, stepId: StoryWorkflowStepId): string {
  return `${nodeId}:${stepId}`;
}

function clonePayload(payload: StoryWorkflowPayload | null): StoryWorkflowPayload | null {
  return payload ? { ...payload } : null;
}
