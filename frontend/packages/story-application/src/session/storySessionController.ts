import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import {
  addStoryChildNode,
  createEmptyStoryNodeFields,
  createStoryTreeBundle,
  fieldsForStoryWorkflowStep,
  getChildIds,
  getParentId,
  resolveStoryNodeFields,
  storyWorkflowStepIds,
  type StoryNodeFieldKey,
  type StoryNodeFields,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";

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
import { editStepField as editStepFieldUseCase } from "../usecases/editStepField";
import { SceneWorkflowCoordinator } from "../workflow/sceneWorkflowCoordinator";
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
  createStorySessionStateFromBundle,
  type StorySessionControllerOptions,
  type StorySessionListener,
  type StorySessionPatch,
  type StorySessionState,
  type StorySessionStateUpdater
} from "./storySessionState";

export class StorySessionController {
  private state: StorySessionState;
  private readonly listeners = new Set<StorySessionListener>();
  private readonly workflowCoordinator: SceneWorkflowCoordinator;

  public constructor(private readonly options: StorySessionControllerOptions) {
    this.state = createInitialStorySessionState(options.initialState);
    this.workflowCoordinator = new SceneWorkflowCoordinator(
      {
        getState: () => this.getState(),
        setState: (patch) => this.setState(patch),
        saveStory: () => this.saveStory(),
        handleError: (error) => this.handleError(error)
      },
      options.services
    );
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
        backendConfig: this.state.backendConfig,
        autoValidateGeneratedCandidateByStepId:
          this.state.autoValidateGeneratedCandidateByStepId,
        busy: false
      };
    });
  }

  public async renameStory(title: string): Promise<void> {
    const trimmed = title.trim();

    if (!trimmed || !this.state.manifest) {
      return;
    }

    this.setState({
      manifest: {
        ...this.state.manifest,
        title: trimmed,
        updated_at: new Date().toISOString()
      },
      dirty: true,
      message: "Story renamed."
    });

    await this.saveStory();
  }

  public async loadStory(
    storyId: string,
    options: { resume?: boolean } = {}
  ): Promise<void> {
    let selectedNodeId: string | null = null;

    await this.runBusy(async () => {
      const result = await loadStoryUseCase({
        storyId,
        persistence: this.options.services.persistence,
        previousState: this.state
      });

      if (result.state) {
        this.state = {
          ...result.state,
          backendConfig: this.state.backendConfig,
          autoValidateGeneratedCandidateByStepId:
            this.state.autoValidateGeneratedCandidateByStepId,
          busy: false
        };
        selectedNodeId = result.state.selectedNodeId;
      }
    });

    if (options.resume !== false) {
      this.resumeSceneInBackground(selectedNodeId);
    }
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
      await this.continueFrom(
        "dialogue",
        result.selectedNodeId ?? this.state.selectedNodeId
      );
    }
  }

  public async createAlternateBranch(userText?: string): Promise<void> {
    const result = createAlternateBranchUseCase(this.state, userText);
    this.applyBranchCommand(result);

    if (result.changed) {
      await this.saveStory();

      if (userText?.trim()) {
        await this.continueFrom(
          "dialogue",
          result.selectedNodeId ?? this.state.selectedNodeId
        );
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
    this.workflowCoordinator.selectStep(stepId);
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
      if (this.shouldCreateBranchOnEdit()) {
        this.editStepFieldInNewBranch(stepId, field, value);
        return;
      }

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
    await this.workflowCoordinator.validateStep({
      stepId,
      reason: "manual"
    });
  }

  public async regenerateStep(
    stepId: StoryWorkflowStepId = this.state.activeStepId
  ): Promise<void> {
    await this.workflowCoordinator.startGeneration({
      stepId,
      reason: "manual"
    });
  }

  public async continueFrom(
    stepId: StoryWorkflowStepId = this.state.activeStepId,
    nodeId: string | null = this.state.selectedNodeId
  ): Promise<void> {
    await this.workflowCoordinator.startGeneration({
      nodeId,
      stepId,
      reason: "compat"
    });
  }

  public setStepAutoValidate(
    stepId: StoryWorkflowStepId,
    enabled: boolean
  ): void {
    this.workflowCoordinator.setStepAutoValidate(stepId, enabled);
  }

  public async generateDeferredDanbot(): Promise<void> {
    await this.workflowCoordinator.generateDeferredDanbot();
  }

  public async generateDeferredImages(): Promise<void> {
    await this.workflowCoordinator.generateDeferredImages();
  }

  public async regenerateStoryDanbot(): Promise<void> {
    await this.workflowCoordinator.regenerateStoryDanbot();
  }

  public async regenerateStoryImages(): Promise<void> {
    await this.workflowCoordinator.regenerateStoryImages();
  }

  public async cancelDeferredGeneration(): Promise<void> {
    await this.workflowCoordinator.cancelDeferredGeneration();
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

  public async cancelAll(): Promise<void> {
    await this.workflowCoordinator.cancelAll();
  }

  public async cancelNode(nodeId: string): Promise<void> {
    await this.workflowCoordinator.cancelNode(nodeId);
  }

  public setBackendConfig(config: BackendRuntimeConfig | null): void {
    const wasReady = Boolean(this.state.backendConfig);

    this.setState({
      backendConfig: config
    });

    if (config && !wasReady) {
      this.resumeSceneInBackground(this.state.selectedNodeId);
    }
  }

  public setMessage(message: string | null): void {
    this.setState({
      message
    });
  }

  private shouldCreateBranchOnEdit(): boolean {
    return Boolean(
      this.state.tree &&
        this.state.selectedNodeId &&
        getChildIds(this.state.tree, this.state.selectedNodeId).length > 0
    );
  }

  private editStepFieldInNewBranch(
    stepId: StoryWorkflowStepId,
    field: StoryNodeFieldKey,
    value: string
  ): void {
    if (!this.state.tree || !this.state.selectedNodeId) {
      return;
    }

    const selectedNodeId = this.state.selectedNodeId;
    const currentFields = resolveStoryNodeFields(this.state.tree, selectedNodeId);
    const initialFields = createBranchFields(currentFields, stepId, field, value);
    const parentId = getParentId(this.state.tree, selectedNodeId);

    if (!parentId) {
      const bundle = createStoryTreeBundle(
        this.state.manifest?.title ?? "Story",
        undefined,
        initialFields
      );
      const rootNodeId = bundle.manifest.root_node_id;
      const rootFields = resolveStoryNodeFields(bundle.tree, rootNodeId);
      const result = editStepFieldUseCase({
        workflowByNodeId: {},
        nodeId: rootNodeId,
        fields: rootFields,
        stepId,
        field,
        value
      });

      bundle.workflowByNodeId = result.workflowByNodeId;
      bundle.activeWorkflowStepId = stepId;

      this.state = createStorySessionStateFromBundle(bundle, {
        backendConfig: this.state.backendConfig,
        autoValidateGeneratedCandidateByStepId:
          this.state.autoValidateGeneratedCandidateByStepId,
        activeStepId: stepId,
        dirty: true,
        message: "Created a new story from the edited root scene."
      });
      this.emit();
      void this.saveStory();
      return;
    }

    const branch = addStoryChildNode(this.state.tree, parentId, initialFields);
    const siblingFields = resolveStoryNodeFields(branch.tree, branch.nodeId);
    const result = editStepFieldUseCase({
      workflowByNodeId: this.state.workflowByNodeId,
      nodeId: branch.nodeId,
      fields: siblingFields,
      stepId,
      field,
      value
    });

    this.state = {
      ...this.state,
      tree: branch.tree,
      selectedNodeId: branch.nodeId,
      workflowByNodeId: result.workflowByNodeId,
      activeStepId: stepId,
      historyBack: [...this.state.historyBack, selectedNodeId],
      historyForward: [],
      dirty: true,
      message: "Created a sibling branch for the edited scene."
    };
    this.emit();
    void this.saveStory();
  }

  private applyNavigation(result: { state: StorySessionState; changed: boolean }): void {
    if (!result.changed && result.state === this.state) {
      return;
    }

    this.state = result.state;
    this.emit();

    if (result.changed) {
      void this.saveStory();
      this.resumeSceneInBackground(result.state.selectedNodeId);
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

  private resumeSceneInBackground(nodeId?: string | null): void {
    void this.workflowCoordinator.resumeScene(nodeId).catch((error) => {
      this.handleError(error);
    });
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

function createBranchFields(
  source: StoryNodeFields,
  stepId: StoryWorkflowStepId,
  field: StoryNodeFieldKey,
  value: string
): StoryNodeFields {
  const nextFields = createEmptyStoryNodeFields();
  const endIndex = storyWorkflowStepIds.indexOf(stepId);

  for (const candidateStepId of storyWorkflowStepIds.slice(0, endIndex + 1)) {
    for (const candidateField of fieldsForStoryWorkflowStep(candidateStepId)) {
      nextFields[candidateField] = source[candidateField];
    }
  }

  nextFields[field] = value;
  return nextFields;
}
