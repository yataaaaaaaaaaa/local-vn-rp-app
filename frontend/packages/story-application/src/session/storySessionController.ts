import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import { outputImageFile } from "@local-vn/config";
import {
  parseImageRef,
  resolveStoryNodeFields,
  storyWorkflowStepIds,
  type StoryNodeFieldKey,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import { nextStepId } from "@local-vn/workflow-core";

import type { StorySessionServices } from "../ports";
import { applyPresetContext as applyPresetContextUseCase } from "../usecases/applyPresetContext";
import { applyResolverResult as applyResolverResultUseCase } from "../usecases/applyResolverResult";
import {
  createAlternateBranch as createAlternateBranchUseCase,
  createChildFromCurrent as createChildFromCurrentUseCase,
  deleteCurrentLeaf as deleteCurrentLeafUseCase,
  deleteNode as deleteNodeUseCase,
  duplicateCurrentBranch as duplicateCurrentBranchUseCase,
  submitUserText as submitUserTextUseCase
} from "../usecases/branchCommands";
import { commitStep } from "../usecases/commitStep";
import {
  cancelAllWorkflowRuns,
  cancelNodeWorkflowRuns,
  continueWorkflow,
  type WorkflowRunRegistry
} from "../usecases/continueWorkflow";
import { editStepField as editStepFieldUseCase } from "../usecases/editStepField";
import { generateStepCandidate } from "../usecases/generateStepCandidate";
import {
  createStory as createStoryUseCase,
  loadStory as loadStoryUseCase,
  saveStory as saveStoryUseCase
} from "../usecases/storyLifecycle";
import {
  goBack as goBackUseCase,
  goForward as goForwardUseCase,
  goToChild as goToChildUseCase,
  goToFirstChild as goToFirstChildUseCase,
  goToNextSibling as goToNextSiblingUseCase,
  goToParent as goToParentUseCase,
  goToPreviousSibling as goToPreviousSiblingUseCase,
  selectNode as selectNodeUseCase
} from "../usecases/navigation";
import {
  applyStorySessionPatch,
  createInitialStorySessionState,
  type StorySessionControllerOptions,
  type StorySessionListener,
  type StorySessionPatch,
  type StorySessionState,
  type StorySessionStateUpdater
} from "./storySessionState";

export class StorySessionController {
  private state: StorySessionState;
  private readonly listeners = new Set<StorySessionListener>();
  private activeRuns: WorkflowRunRegistry = {};

  public constructor(private readonly options: StorySessionControllerOptions) {
    this.state = createInitialStorySessionState(options.initialState);
  }

  public getState(): StorySessionState {
    return this.state;
  }

  public subscribe(listener: StorySessionListener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public setState(
    patch: StorySessionPatch | StorySessionStateUpdater
  ): void {
    this.state = applyStorySessionPatch(this.state, patch);
    this.emit();
  }

  public async createStory(title: string): Promise<void> {
    await this.runBusy(async () => {
      const result = await createStoryUseCase({
        title,
        persistence: this.options.services.persistence
      });

      this.state = {
        ...result.state,
        backendConfig: this.state.backendConfig
      };
    });
  }

  public async loadStory(storyId: string): Promise<void> {
    await this.runBusy(async () => {
      const result = await loadStoryUseCase({
        storyId,
        persistence: this.options.services.persistence,
        previousState: this.state
      });

      if (result.state) {
        this.state = result.state;
      }
    });
  }

  public async saveStory(): Promise<void> {
    const result = await saveStoryUseCase({
      state: this.state,
      persistence: this.options.services.persistence
    });

    if (result.saved) {
      this.setState({
        dirty: false,
        manifest: result.bundle?.manifest ?? this.state.manifest
      });
    }
  }

  public selectNode(nodeId: string): void {
    this.applyNavigation(selectNodeUseCase(this.state, nodeId));
  }

  public goBack(): void {
    this.applyNavigation(goBackUseCase(this.state));
  }

  public goForward(): void {
    this.applyNavigation(goForwardUseCase(this.state));
  }

  public goToParent(): void {
    this.applyNavigation(goToParentUseCase(this.state));
  }

  public goToFirstChild(): void {
    this.applyNavigation(goToFirstChildUseCase(this.state));
  }

  public goToChild(nodeId: string): void {
    this.applyNavigation(goToChildUseCase(this.state, nodeId));
  }

  public goToPreviousSibling(): void {
    this.applyNavigation(goToPreviousSiblingUseCase(this.state));
  }

  public goToNextSibling(): void {
    this.applyNavigation(goToNextSiblingUseCase(this.state));
  }

  public async createChildFromCurrent(initialUserText?: string): Promise<void> {
    const result = createChildFromCurrentUseCase(this.state, initialUserText);
    this.applyBranchCommand(result);
    await this.saveIfChanged(result.changed);
  }

  public async submitUserText(userText: string): Promise<void> {
    const result = submitUserTextUseCase(this.state, userText);
    this.applyBranchCommand(result);

    if (result.changed) {
      await this.saveStory();
      await this.continueFrom("dialogue", result.selectedNodeId ?? this.state.selectedNodeId);
    }
  }

  public async createAlternateBranch(userText?: string): Promise<void> {
    const result = createAlternateBranchUseCase(this.state, userText);
    this.applyBranchCommand(result);

    if (result.changed) {
      await this.saveStory();

      if (userText?.trim()) {
        await this.continueFrom("dialogue", result.selectedNodeId ?? this.state.selectedNodeId);
      }
    }
  }

  public async duplicateCurrentBranch(): Promise<void> {
    const result = duplicateCurrentBranchUseCase(this.state);
    this.applyBranchCommand(result);
    await this.saveIfChanged(result.changed);
  }

  public async deleteNode(nodeId: string): Promise<void> {
    const result = deleteNodeUseCase(this.state, nodeId);
    this.applyBranchCommand(result);
    await this.saveIfChanged(result.changed);
  }

  public async deleteCurrentLeaf(): Promise<void> {
    const result = deleteCurrentLeafUseCase(this.state);
    this.applyBranchCommand(result);
    await this.saveIfChanged(result.changed);
  }

  public selectWorkflowStep(stepId: StoryWorkflowStepId): void {
    if (!this.state.selectedNodeId) {
      return;
    }

    this.setState({
      activeStepId: stepId,
      message: null,
      dirty: true
    });

    void this.saveStory();
  }

  public editStepField(
    stepId: StoryWorkflowStepId,
    field: StoryNodeFieldKey,
    value: string
  ): void {
    if (!this.state.tree || !this.state.selectedNodeId) {
      return;
    }

    try {
      const result = editStepFieldUseCase({
        workflowByNodeId: this.state.workflowByNodeId,
        nodeId: this.state.selectedNodeId,
        fields: resolveStoryNodeFields(this.state.tree, this.state.selectedNodeId),
        stepId,
        field,
        value
      });

      this.setState({
        workflowByNodeId: result.workflowByNodeId,
        activeStepId: stepId,
        dirty: true,
        message: null
      });

      void this.saveStory();
    } catch (error) {
      this.handleError(error);
    }
  }

  public async validateStep(
    stepId: StoryWorkflowStepId = this.state.activeStepId
  ): Promise<void> {
    if (!this.state.tree || !this.state.selectedNodeId) {
      return;
    }

    try {
      const nodeId = this.state.selectedNodeId;
      const result = commitStep({
        tree: this.state.tree,
        workflowByNodeId: this.state.workflowByNodeId,
        nodeId,
        fields: resolveStoryNodeFields(this.state.tree, nodeId),
        stepId
      });

      const imageRef =
        typeof result.payload.imageRef === "string"
          ? parseImageRef(result.payload.imageRef)
          : null;

      this.setState({
        tree: result.tree,
        workflowByNodeId: result.workflowByNodeId,
        imageRefs: imageRef
          ? {
              ...this.state.imageRefs,
              [nodeId]: imageRef
            }
          : this.state.imageRefs,
        activeStepId: stepId,
        dirty: true,
        message: "Step validated."
      });

      await this.saveStory();

      const next = nextStepId(storyWorkflowStepIds, stepId);

      if (next) {
        await this.continueFrom(next, nodeId);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  public async regenerateStep(
    stepId: StoryWorkflowStepId = this.state.activeStepId
  ): Promise<void> {
    if (!this.state.tree || !this.state.selectedNodeId || !this.state.backendConfig) {
      return;
    }

    const nodeId = this.state.selectedNodeId;

    try {
      this.setState({
        busy: true,
        activeStepId: stepId,
        runningJob: {
          id: `${nodeId}:${stepId}:${Date.now()}`,
          nodeId,
          runId: `${nodeId}:manual:${Date.now()}`,
          stepId
        },
        message: "Generating..."
      });

      const result = await generateStepCandidate({
        workflowByNodeId: this.state.workflowByNodeId,
        nodeId,
        fields: resolveStoryNodeFields(this.state.tree, nodeId),
        stepId,
        context: this.createWorkflowContext(nodeId, stepId)
      });

      this.setState({
        workflowByNodeId: result.workflowByNodeId,
        busy: false,
        runningJob: null,
        activeStepId: stepId,
        dirty: true,
        message: result.error ?? result.warnings?.join("; ") ?? "Step generated."
      });

      await this.saveStory();

      if (
        !result.error &&
        this.state.autoValidateGeneratedCandidateByStepId[stepId]
      ) {
        await this.validateStep(stepId);
      }
    } catch (error) {
      this.setState({
        busy: false,
        runningJob: null
      });
      this.handleError(error);
    }
  }

  public async continueFrom(
    stepId: StoryWorkflowStepId = this.state.activeStepId,
    nodeId: string | null = this.state.selectedNodeId
  ): Promise<void> {
    if (!this.state.tree || !nodeId || !this.state.backendConfig) {
      return;
    }

    try {
      this.setState({
        busy: true,
        activeStepId: stepId,
        message: "Running workflow..."
      });

      const result = await continueWorkflow({
        tree: this.state.tree,
        workflowByNodeId: this.state.workflowByNodeId,
        nodeId,
        startStepId: stepId,
        context: this.createWorkflowContext(nodeId, stepId),
        activeRuns: this.activeRuns,
        autoValidateByStepId: this.state.autoValidateGeneratedCandidateByStepId
      });

      this.activeRuns = result.activeRuns;

      this.setState({
        tree: result.tree,
        workflowByNodeId: result.workflowByNodeId,
        activeStepId: result.stoppedAtStepId,
        busy: false,
        runningJob: null,
        dirty: true,
        message: result.error
          ? result.error
          : result.cancelled
            ? "Workflow cancelled."
            : "Workflow updated."
      });

      await this.saveStory();
    } catch (error) {
      this.setState({
        busy: false,
        runningJob: null
      });
      this.handleError(error);
    }
  }

  public async applyPresetContext(context: string): Promise<void> {
    if (!this.state.tree || !this.state.selectedNodeId) {
      return;
    }

    try {
      const result = applyPresetContextUseCase({
        tree: this.state.tree,
        workflowByNodeId: this.state.workflowByNodeId,
        nodeId: this.state.selectedNodeId,
        context
      });

      this.setState({
        tree: result.tree,
        workflowByNodeId: result.workflowByNodeId,
        activeStepId: "context",
        dirty: true,
        message: "Preset context applied."
      });

      await this.saveStory();
    } catch (error) {
      this.handleError(error);
    }
  }

  public async applyResolverResult(input: {
    rawText: string;
    tags: string[];
    prompt: string;
  }): Promise<void> {
    if (!this.state.tree || !this.state.selectedNodeId) {
      return;
    }

    try {
      const result = applyResolverResultUseCase({
        tree: this.state.tree,
        workflowByNodeId: this.state.workflowByNodeId,
        nodeId: this.state.selectedNodeId,
        resolverText: input.rawText,
        selectedTags: input.tags,
        commit: true
      });

      this.setState({
        tree: result.tree,
        workflowByNodeId: result.workflowByNodeId,
        activeStepId: "selectedTags",
        dirty: true,
        message: "Resolver result applied."
      });

      if (input.prompt.trim()) {
        this.editStepField("prompt", "positivePrompt", input.prompt);
        await this.validateStep("prompt");
      } else {
        await this.saveStory();
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  public cancelAll(): void {
    this.activeRuns = cancelAllWorkflowRuns(this.activeRuns);
    this.setState({
      busy: false,
      runningJob: null,
      message: "Workflow cancelled."
    });
  }

  public cancelNode(nodeId: string): void {
    this.activeRuns = cancelNodeWorkflowRuns(this.activeRuns, nodeId);
    this.setState({
      busy: false,
      runningJob: null,
      message: "Workflow cancelled."
    });
  }

  public setBackendConfig(config: BackendRuntimeConfig | null): void {
    this.setState({
      backendConfig: config
    });
  }

  public setMessage(message: string | null): void {
    this.setState({
      message
    });
  }

  private createWorkflowContext(
    nodeId: string,
    stepId: StoryWorkflowStepId
  ) {
    if (!this.state.tree || !this.state.backendConfig) {
      throw new Error("Cannot create workflow context without tree and backend config.");
    }

    return {
      backend: this.options.services.backend,
      config: this.state.backendConfig,
      storyId: this.state.storyId,
      selectedNodeId: nodeId,
      stepId,
      outputImageFile,
      now: this.options.services.now
    };
  }

  private applyNavigation(result: { state: StorySessionState; changed: boolean }): void {
    if (!result.changed && result.state === this.state) {
      return;
    }

    this.state = result.state;
    this.emit();

    if (result.changed) {
      void this.saveStory();
    }
  }

  private applyBranchCommand(result: { state: StorySessionState; changed: boolean }): void {
    if (!result.changed && result.state === this.state) {
      return;
    }

    this.state = result.state;
    this.emit();
  }

  private async saveIfChanged(changed: boolean): Promise<void> {
    if (changed) {
      await this.saveStory();
    }
  }

  private async runBusy(work: () => Promise<void>): Promise<void> {
    this.setState({
      busy: true,
      message: null
    });

    try {
      await work();
      this.setState({
        busy: false
      });
    } catch (error) {
      this.setState({
        busy: false
      });
      this.handleError(error);
    }
  }

  private handleError(error: unknown): void {
    this.options.services.onError?.(error);
    this.setState({
      message: error instanceof Error ? error.message : String(error),
      busy: false,
      runningJob: null
    });
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
