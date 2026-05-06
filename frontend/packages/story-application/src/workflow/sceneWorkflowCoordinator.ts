import { outputImageFile } from "@local-vn/config";
import {
  cloneWorkflowByNodeId,
  ensureWorkflowRecord,
  getStoryNodeIds,
  parseImageRef,
  resolveStoryNodeFields,
  storyWorkflowStepIds,
  type StoryNodeFields,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import {
  invalidateWorkflowStepsAfter,
  nextStepId,
  setWorkflowStepCandidate
} from "@local-vn/workflow-core";

import type { StoryStepGenerationContext } from "../generation/storyStepGenerators";
import {
  generateDanbotStep,
  generateImageStep,
  generatePromptStep,
  storyWorkflowStepById
} from "../generation/storyStepGenerators";
import { commitStep } from "../usecases/commitStep";
import { deferStep } from "../usecases/deferStep";
import { completeSceneAndAdvance } from "../usecases/completeSceneAndAdvance";
import { generateStepCandidate } from "../usecases/generateStepCandidate";
import type {
  StorySessionPatch,
  StorySessionRunningJob,
  StorySessionState,
  StorySessionStateUpdater
} from "../session/storySessionState";
import type { StorySessionServices } from "../ports";

export interface SceneWorkflowCoordinatorHost {
  getState(): StorySessionState;
  setState(patch: StorySessionPatch | StorySessionStateUpdater): void;
  saveStory(): Promise<void>;
  handleError(error: unknown): void;
}

export interface SceneWorkflowRun {
  runId: string;
  nodeId: string;
  stepId: StoryWorkflowStepId;
  startedAt: string;
  abortController: AbortController;
}

export interface DeferredGenerationRun {
  runId: string;
  kind: "danbot" | "image";
  startedAt: string;
  abortController: AbortController;
}

export interface StartSceneStepGenerationInput {
  nodeId?: string | null;
  stepId?: StoryWorkflowStepId;
  reason?: "manual" | "auto" | "navigation" | "compat";
}

export interface ValidateSceneStepInput {
  nodeId?: string | null;
  stepId?: StoryWorkflowStepId;
  reason?: "manual" | "auto" | "compat";
}

export class SceneWorkflowCoordinator {
  private currentRun: SceneWorkflowRun | null = null;
  private currentDeferredRun: DeferredGenerationRun | null = null;
  private runSerial = 0;

  public constructor(
    private readonly host: SceneWorkflowCoordinatorHost,
    private readonly services: StorySessionServices
  ) {}

  public async cancelAll(message = "Workflow cancelled."): Promise<void> {
    this.abortCurrentRun();
    this.abortDeferredRun();

    try {
      await this.services.backend.cancelAll?.();
    } catch (error) {
      this.services.onError?.(error);
    } finally {
      this.host.setState({
        busy: false,
        runningJob: null,
        deferredBatchJob: null,
        message
      });
    }
  }

  public async cancelDeferredGeneration(): Promise<void> {
    this.abortDeferredRun();

    try {
      await this.services.backend.cancelAll?.();
    } catch (error) {
      this.services.onError?.(error);
    } finally {
      this.host.setState({
        busy: false,
        deferredBatchJob: null,
        message: "Deferred generation cancelled."
      });
    }
  }

  public async cancelNode(nodeId: string): Promise<void> {
    if (this.currentRun?.nodeId === nodeId) {
      await this.cancelAll();
    }
  }

  public selectStep(stepId: StoryWorkflowStepId): void {
    const state = this.host.getState();

    if (!state.selectedNodeId) {
      return;
    }

    this.abortCurrentRun();
    this.host.setState({
      activeStepId: stepId,
      runningJob: null,
      busy: false,
      message: null,
      dirty: true
    });

    void this.host.saveStory();
  }

  public async resumeScene(nodeId?: string | null): Promise<void> {
    const state = this.host.getState();
    const resolvedNodeId = nodeId ?? state.selectedNodeId;

    if (!state.tree || !resolvedNodeId) {
      return;
    }

    this.abortCurrentRun();

    const fields = resolveStoryNodeFields(state.tree, resolvedNodeId);
    const workflowByNodeId = cloneWorkflowByNodeId(state.workflowByNodeId);
    const workflow = ensureWorkflowRecord(workflowByNodeId, resolvedNodeId, fields);
    const stepId = selectSceneResumeStep(workflow);
    workflow.frontierStepId = stepId;
    workflow.activeStepId = stepId;

    this.host.setState({
      workflowByNodeId,
      activeStepId: stepId,
      runningJob: null,
      busy: false,
      message: null,
      dirty: true
    });

    await this.host.saveStory();

    if (shouldGenerateOnSceneEntry(workflow, stepId)) {
      await this.startGeneration({
        nodeId: resolvedNodeId,
        stepId,
        reason: "navigation"
      });
    }
  }

  public async startGeneration(
    input: StartSceneStepGenerationInput = {}
  ): Promise<void> {
    const state = this.host.getState();
    const nodeId = input.nodeId ?? state.selectedNodeId;
    const stepId = input.stepId ?? state.activeStepId;

    if (!state.tree || !nodeId) {
      return;
    }

    if (stepId === "nextScene") {
      await this.advanceToNextScene({
        nodeId,
        reason: input.reason
      });
      return;
    }

    if (this.shouldPauseForUserText(stepId, input.reason)) {
      await this.pauseForUserText(nodeId);
      return;
    }

    if (this.shouldDeferStep(stepId)) {
      await this.deferStepAndContinue({
        nodeId,
        stepId,
        reason: input.reason
      });
      return;
    }

    if (!state.backendConfig) {
      return;
    }

    this.abortCurrentRun();

    const run = this.createRun(nodeId, stepId);
    this.currentRun = run;

    this.host.setState({
      busy: true,
      activeStepId: stepId,
      runningJob: toStorySessionRunningJob(run),
      message: generationMessage(input.reason)
    });

    try {
      const result = await generateStepCandidate({
        workflowByNodeId: this.host.getState().workflowByNodeId,
        nodeId,
        fields: resolveStoryNodeFields(this.host.getState().tree, nodeId),
        stepId,
        context: this.createWorkflowContext(
          nodeId,
          stepId,
          run.abortController.signal
        ),
        abortSignal: run.abortController.signal
      });

      if (!this.isCurrentRun(run)) {
        return;
      }

      this.currentRun = null;

      this.host.setState({
        workflowByNodeId: result.workflowByNodeId,
        busy: false,
        runningJob: null,
        activeStepId: stepId,
        dirty: true,
        message: result.error ?? result.warnings?.join("; ") ?? "Step generated."
      });

      await this.host.saveStory();

      if (
        !result.error &&
        this.host.getState().autoValidateGeneratedCandidateByStepId[stepId]
      ) {
        await this.validateStep({
          nodeId,
          stepId,
          reason: "auto"
        });
      }
    } catch (error) {
      if (!this.isCurrentRun(run)) {
        return;
      }

      this.currentRun = null;
      this.host.setState({
        busy: false,
        runningJob: null
      });
      this.host.handleError(error);
    }
  }

  public async validateStep(input: ValidateSceneStepInput = {}): Promise<void> {
    const state = this.host.getState();
    const nodeId = input.nodeId ?? state.selectedNodeId;
    const stepId = input.stepId ?? state.activeStepId;

    if (!state.tree || !nodeId) {
      return;
    }

    this.abortCurrentRun();

    try {
      const fields = resolveStoryNodeFields(state.tree, nodeId);
      const result = commitStep({
        tree: state.tree,
        workflowByNodeId: state.workflowByNodeId,
        nodeId,
        fields,
        stepId
      });

      invalidateWorkflowStepsAfter(
        result.workflow,
        storyWorkflowStepIds,
        stepId
      );

      const next = nextStepId(storyWorkflowStepIds, stepId);

      if (next) {
        result.workflow.frontierStepId = next;
        result.workflow.activeStepId = next;
      }

      const imageRef =
        typeof result.payload.imageRef === "string"
          ? parseImageRef(result.payload.imageRef)
          : null;

      this.host.setState({
        tree: result.tree,
        workflowByNodeId: result.workflowByNodeId,
        imageRefs: imageRef
          ? {
              ...state.imageRefs,
              [nodeId]: imageRef
            }
          : state.imageRefs,
        activeStepId: next ?? stepId,
        busy: false,
        runningJob: null,
        dirty: true,
        message: "Step validated."
      });

      await this.host.saveStory();

      if (next) {
        await this.startGeneration({
          nodeId,
          stepId: next,
          reason: "auto"
        });
      }
    } catch (error) {
      this.host.handleError(error);
    }
  }

  public setStepAutoValidate(
    stepId: StoryWorkflowStepId,
    enabled: boolean
  ): void {
    this.host.setState((state) => ({
      autoValidateGeneratedCandidateByStepId: {
        ...state.autoValidateGeneratedCandidateByStepId,
        [stepId]: enabled
      },
      dirty: true,
      message: null
    }));

    void this.host.saveStory();
  }

  public async generateDeferredDanbot(): Promise<void> {
    await this.runDeferredBatch("danbot");
  }

  public async generateDeferredImages(): Promise<void> {
    await this.runDeferredBatch("image");
  }

  private shouldDeferStep(stepId: StoryWorkflowStepId): boolean {
    if (stepId === "danbot") {
      return Boolean(this.services.generationDeferPolicy?.shouldDeferDanbot());
    }

    if (stepId === "image") {
      return Boolean(this.services.generationDeferPolicy?.shouldDeferImage());
    }

    return false;
  }

  private async deferStepAndContinue(input: {
    nodeId: string;
    stepId: StoryWorkflowStepId;
    reason?: StartSceneStepGenerationInput["reason"];
  }): Promise<void> {
    const state = this.host.getState();

    if (!state.tree) {
      return;
    }

    this.abortCurrentRun();

    const fields = resolveStoryNodeFields(state.tree, input.nodeId);
    const payload = deferredPayloadForStep(input.stepId);
    const result = deferStep({
      tree: state.tree,
      workflowByNodeId: state.workflowByNodeId,
      nodeId: input.nodeId,
      fields,
      stepId: input.stepId,
      payload,
      inputFingerprint: deferredInputFingerprint(
        input.stepId,
        fields,
        state.backendConfig
      )
    });

    invalidateWorkflowStepsAfter(
      result.workflow,
      storyWorkflowStepIds,
      input.stepId
    );

    const next = nextStepId(storyWorkflowStepIds, input.stepId);

    if (next) {
      result.workflow.frontierStepId = next;
      result.workflow.activeStepId = next;
    }

    this.host.setState({
      tree: result.tree,
      workflowByNodeId: result.workflowByNodeId,
      activeStepId: next ?? input.stepId,
      busy: false,
      runningJob: null,
      dirty: true,
      message:
        input.stepId === "danbot"
          ? "DanBot generation deferred."
          : "Image generation deferred."
    });

    await this.host.saveStory();

    if (next) {
      await this.startGeneration({
        nodeId: input.nodeId,
        stepId: next,
        reason: input.reason === "manual" ? "manual" : "auto"
      });
    }
  }

  private async runDeferredBatch(kind: "danbot" | "image"): Promise<void> {
    const state = this.host.getState();

    if (!state.tree || !state.backendConfig) {
      this.host.setState({
        message: "Load a story and backend config before deferred generation."
      });
      return;
    }

    if (state.busy || state.deferredBatchJob?.status === "running") {
      this.host.setState({
        message: "Another generation job is already running."
      });
      return;
    }

    const nodeIds = deferredNodeIds(state, kind);

    if (nodeIds.length === 0) {
      this.host.setState({
        message:
          kind === "danbot"
            ? "No deferred DanBot steps found."
            : "No deferred image steps found."
      });
      return;
    }

    this.abortCurrentRun();
    this.abortDeferredRun();

    const run = this.createDeferredRun(kind);
    this.currentDeferredRun = run;

    this.host.setState({
      busy: true,
      runningJob: null,
      deferredBatchJob: {
        id: run.runId,
        kind,
        status: "running",
        currentNodeId: null,
        currentIndex: 0,
        total: nodeIds.length,
        completed: 0,
        startedAt: run.startedAt,
        message: kind === "danbot"
          ? "Loading DanBot model..."
          : "Loading image model..."
      },
      message: kind === "danbot"
        ? "Generating deferred DanBot steps..."
        : "Generating deferred image steps..."
    });

    try {
      await this.loadModelForDeferredBatch(kind, state.backendConfig);

      let completed = 0;

      for (const [index, nodeId] of nodeIds.entries()) {
        if (!this.isCurrentDeferredRun(run)) {
          return;
        }

        const currentState = this.host.getState();

        if (!isNodeStepDeferred(currentState, nodeId, kind)) {
          completed += 1;
          this.updateDeferredBatchJob(run, {
            currentNodeId: nodeId,
            currentIndex: index + 1,
            completed,
            message: "Skipped because the step is no longer deferred."
          });
          continue;
        }

        this.updateDeferredBatchJob(run, {
          currentNodeId: nodeId,
          currentIndex: index + 1,
          completed,
          message:
            kind === "danbot"
              ? "Generating DanBot tags..."
              : "Generating image..."
        });

        const applied = kind === "danbot"
          ? await this.generateDeferredDanbotForNode(run, nodeId)
          : await this.generateDeferredImageForNode(run, nodeId);

        if (!this.isCurrentDeferredRun(run)) {
          return;
        }

        if (applied) {
          completed += 1;
        }

        this.updateDeferredBatchJob(run, {
          currentNodeId: nodeId,
          currentIndex: index + 1,
          completed,
          message: applied ? "Scene updated." : "Skipped stale scene."
        });
      }

      if (!this.isCurrentDeferredRun(run)) {
        return;
      }

      this.currentDeferredRun = null;
      this.host.setState((latest) => ({
        busy: false,
        deferredBatchJob: latest.deferredBatchJob
          ? {
              ...latest.deferredBatchJob,
              status: "complete",
              currentNodeId: null,
              currentIndex: nodeIds.length,
              completed,
              message: "Deferred generation complete."
            }
          : null,
        dirty: true,
        message: "Deferred generation complete."
      }));
      await this.host.saveStory();
    } catch (error) {
      if (!this.isCurrentDeferredRun(run)) {
        return;
      }

      this.currentDeferredRun = null;
      this.host.setState((latest) => ({
        busy: false,
        deferredBatchJob: latest.deferredBatchJob
          ? {
              ...latest.deferredBatchJob,
              status: "failed",
              message: error instanceof Error ? error.message : String(error)
            }
          : null,
        message: error instanceof Error ? error.message : String(error)
      }));
      this.services.onError?.(error);
    }
  }

  private async loadModelForDeferredBatch(
    kind: "danbot" | "image",
    config: StorySessionState["backendConfig"]
  ): Promise<void> {
    if (!config) {
      throw new Error("Backend config is unavailable.");
    }

    if (kind === "danbot") {
      if (!config.danbot.model_path) {
        throw new Error("DanBot model path is required for deferred generation.");
      }

      await this.services.backend.loadDanbotModel({
        backend: "danbot_nl",
        model_path: config.danbot.model_path,
        device: config.danbot.device,
        dtype: config.danbot.dtype
      });
      return;
    }

    if (!config.image.model_path) {
      throw new Error("Image model path is required for deferred generation.");
    }

    await this.services.backend.loadImageModel({
      backend: "diffusers",
      model_type: config.image.model_type,
      model_path: config.image.model_path,
      dtype: config.image.dtype,
      device: config.image.device,
      lora_root: config.image.lora_root,
      embedding_root: config.image.embedding_root,
      manual_lora_paths: config.image.manual_lora_paths
    });
  }

  private async generateDeferredDanbotForNode(
    run: DeferredGenerationRun,
    nodeId: string
  ): Promise<boolean> {
    const state = this.host.getState();

    if (!state.tree || !state.backendConfig || !state.storyId) {
      return false;
    }

    const fields = resolveStoryNodeFields(state.tree, nodeId);
    const fingerprint = deferredInputFingerprint("danbot", fields, state.backendConfig);
    const danbotResult = await generateDanbotStep({
      document: fields,
      context: this.createWorkflowContext(
        nodeId,
        "danbot",
        run.abortController.signal
      )
    });

    const danbotPayload = normalizeStepPayload("danbot", danbotResult.value);
    const fieldsWithDanbot: StoryNodeFields = {
      ...fields,
      danbotTags: danbotPayload.danbotTags ?? fields.danbotTags,
      positivePrompt: ""
    };
    const promptResult = generatePromptStep({
      document: fieldsWithDanbot
    });
    const promptPayload = normalizeStepPayload("prompt", promptResult.value);

    if (!this.isCurrentDeferredRun(run)) {
      return false;
    }

    const latestState = this.host.getState();
    const latestFields = resolveStoryNodeFields(latestState.tree, nodeId);

    if (
      !isNodeStepDeferred(latestState, nodeId, "danbot") ||
      fingerprint !== deferredInputFingerprint("danbot", latestFields, latestState.backendConfig)
    ) {
      return false;
    }

    let workflowByNodeId = cloneWorkflowByNodeId(latestState.workflowByNodeId);
    let workflow = ensureWorkflowRecord(workflowByNodeId, nodeId, latestFields);
    setWorkflowStepCandidate(
      workflow,
      "danbot",
      danbotPayload,
      danbotResult.warnings
    );

    const committedDanbot = commitStep({
      tree: latestState.tree!,
      workflowByNodeId,
      nodeId,
      fields: latestFields,
      stepId: "danbot"
    });

    const fieldsAfterDanbot = resolveStoryNodeFields(
      committedDanbot.tree,
      nodeId
    );
    workflowByNodeId = cloneWorkflowByNodeId(committedDanbot.workflowByNodeId);
    workflow = ensureWorkflowRecord(workflowByNodeId, nodeId, fieldsAfterDanbot);
    setWorkflowStepCandidate(workflow, "prompt", promptPayload);

    const committedPrompt = commitStep({
      tree: committedDanbot.tree,
      workflowByNodeId,
      nodeId,
      fields: fieldsAfterDanbot,
      stepId: "prompt"
    });

    invalidateWorkflowStepsAfter(
      committedPrompt.workflow,
      storyWorkflowStepIds,
      "prompt"
    );

    const next = nextStepId(storyWorkflowStepIds, "prompt");

    if (next) {
      committedPrompt.workflow.frontierStepId = next;
      committedPrompt.workflow.activeStepId = next;
    }

    this.host.setState({
      tree: committedPrompt.tree,
      workflowByNodeId: committedPrompt.workflowByNodeId,
      dirty: true,
      message: "Deferred DanBot scene updated."
    });
    await this.host.saveStory();

    return true;
  }

  private async generateDeferredImageForNode(
    run: DeferredGenerationRun,
    nodeId: string
  ): Promise<boolean> {
    const state = this.host.getState();

    if (!state.tree || !state.backendConfig || !state.storyId) {
      return false;
    }

    const fields = resolveStoryNodeFields(state.tree, nodeId);
    const fingerprint = deferredInputFingerprint("image", fields, state.backendConfig);
    const imageResult = await generateImageStep({
      document: fields,
      context: this.createWorkflowContext(
        nodeId,
        "image",
        run.abortController.signal
      )
    });
    const imagePayload = normalizeStepPayload("image", imageResult.value);

    if (!this.isCurrentDeferredRun(run)) {
      return false;
    }

    const latestState = this.host.getState();
    const latestFields = resolveStoryNodeFields(latestState.tree, nodeId);

    if (
      !isNodeStepDeferred(latestState, nodeId, "image") ||
      fingerprint !== deferredInputFingerprint("image", latestFields, latestState.backendConfig)
    ) {
      return false;
    }

    const workflowByNodeId = cloneWorkflowByNodeId(latestState.workflowByNodeId);
    const workflow = ensureWorkflowRecord(workflowByNodeId, nodeId, latestFields);
    setWorkflowStepCandidate(
      workflow,
      "image",
      imagePayload,
      imageResult.warnings
    );

    const committed = commitStep({
      tree: latestState.tree!,
      workflowByNodeId,
      nodeId,
      fields: latestFields,
      stepId: "image"
    });
    const imageRef =
      typeof committed.payload.imageRef === "string"
        ? parseImageRef(committed.payload.imageRef)
        : null;

    this.host.setState({
      tree: committed.tree,
      workflowByNodeId: committed.workflowByNodeId,
      imageRefs: imageRef
        ? {
            ...latestState.imageRefs,
            [nodeId]: imageRef
          }
        : latestState.imageRefs,
      dirty: true,
      message: "Deferred image scene updated."
    });
    await this.host.saveStory();

    return true;
  }

  private updateDeferredBatchJob(
    run: DeferredGenerationRun,
    patch: Partial<NonNullable<StorySessionState["deferredBatchJob"]>>
  ): void {
    if (!this.isCurrentDeferredRun(run)) {
      return;
    }

    this.host.setState((state) => ({
      deferredBatchJob: state.deferredBatchJob
        ? {
            ...state.deferredBatchJob,
            ...patch
          }
        : state.deferredBatchJob
    }));
  }

  private async advanceToNextScene(input: {
    nodeId: string;
    reason?: StartSceneStepGenerationInput["reason"];
  }): Promise<void> {
    const state = this.host.getState();

    if (!state.tree) {
      return;
    }

    this.abortCurrentRun();

    const run = this.createRun(input.nodeId, "nextScene");
    this.currentRun = run;

    this.host.setState({
      busy: true,
      activeStepId: "nextScene",
      runningJob: toStorySessionRunningJob(run),
      message: input.reason === "auto"
        ? "Creating the next scene..."
        : "Advancing to the next scene..."
    });

    try {
      const currentState = this.host.getState();

      if (!currentState.tree) {
        return;
      }

      const fields = resolveStoryNodeFields(
        currentState.tree,
        input.nodeId
      );
      const committed = commitStep({
        tree: currentState.tree,
        workflowByNodeId: currentState.workflowByNodeId,
        nodeId: input.nodeId,
        fields,
        stepId: "nextScene"
      });
      const advanced = completeSceneAndAdvance({
        tree: committed.tree,
        workflowByNodeId: committed.workflowByNodeId,
        nodeId: input.nodeId,
        currentFields: fields
      });

      if (!this.isCurrentRun(run)) {
        return;
      }

      this.currentRun = null;

      const nextWorkflow = advanced.workflowByNodeId[advanced.nextNodeId];

      this.host.setState({
        tree: advanced.tree,
        workflowByNodeId: advanced.workflowByNodeId,
        selectedNodeId: advanced.nextNodeId,
        historyBack: [...currentState.historyBack, input.nodeId],
        historyForward: [],
        activeStepId: nextWorkflow?.activeStepId ?? "userText",
        busy: false,
        runningJob: null,
        dirty: true,
        message: "Next scene created."
      });

      await this.host.saveStory();

      await this.startGeneration({
        nodeId: advanced.nextNodeId,
        stepId: nextWorkflow?.activeStepId ?? "userText",
        reason: "auto"
      });
    } catch (error) {
      if (!this.isCurrentRun(run)) {
        return;
      }

      this.currentRun = null;
      this.host.setState({
        busy: false,
        runningJob: null
      });
      this.host.handleError(error);
    }
  }

  private shouldPauseForUserText(
    stepId: StoryWorkflowStepId,
    reason: StartSceneStepGenerationInput["reason"]
  ): boolean {
    if (stepId !== "userText" || reason === "manual") {
      return false;
    }

    return !this.services.userInputPolicy?.shouldAutoGenerateUserText();
  }

  private async pauseForUserText(nodeId: string): Promise<void> {
    const state = this.host.getState();

    if (!state.tree) {
      return;
    }

    this.abortCurrentRun();

    const workflowByNodeId = cloneWorkflowByNodeId(state.workflowByNodeId);
    const fields = resolveStoryNodeFields(state.tree, nodeId);
    const workflow = ensureWorkflowRecord(workflowByNodeId, nodeId, fields);
    workflow.frontierStepId = "userText";
    workflow.activeStepId = "userText";
    workflow.machineState = "editing";

    this.host.setState({
      workflowByNodeId,
      activeStepId: "userText",
      busy: false,
      runningJob: null,
      dirty: true,
      message: "Waiting for player input."
    });

    await this.host.saveStory();
  }

  private createRun(
    nodeId: string,
    stepId: StoryWorkflowStepId
  ): SceneWorkflowRun {
    const serial = ++this.runSerial;
    const startedAt = new Date().toISOString();

    return {
      runId: `${nodeId}:${stepId}:${Date.now()}:${serial}`,
      nodeId,
      stepId,
      startedAt,
      abortController: new AbortController()
    };
  }

  private createDeferredRun(kind: "danbot" | "image"): DeferredGenerationRun {
    const serial = ++this.runSerial;
    const startedAt = new Date().toISOString();

    return {
      runId: `deferred:${kind}:${Date.now()}:${serial}`,
      kind,
      startedAt,
      abortController: new AbortController()
    };
  }

  private abortCurrentRun(): void {
    if (this.currentRun) {
      this.currentRun.abortController.abort();
      this.currentRun = null;
    }
  }

  private abortDeferredRun(): void {
    if (this.currentDeferredRun) {
      this.currentDeferredRun.abortController.abort();
      this.currentDeferredRun = null;
    }
  }

  private isCurrentRun(run: SceneWorkflowRun): boolean {
    return this.currentRun?.runId === run.runId && !run.abortController.signal.aborted;
  }

  private isCurrentDeferredRun(run: DeferredGenerationRun): boolean {
    return (
      this.currentDeferredRun?.runId === run.runId &&
      !run.abortController.signal.aborted
    );
  }

  private createWorkflowContext(
    nodeId: string,
    stepId: StoryWorkflowStepId,
    abortSignal?: AbortSignal
  ): StoryStepGenerationContext {
    const state = this.host.getState();

    if (!state.tree || !state.backendConfig) {
      throw new Error("Cannot create workflow context without tree and backend config.");
    }

    return {
      backend: this.services.backend,
      config: state.backendConfig,
      storyId: state.storyId,
      selectedNodeId: nodeId,
      outputImageFile,
      actionCompositionTree: this.services.actionCompositionTree?.getTree() ?? null,
      actionCompositionSeed: this.services.actionCompositionTree?.getSeed() ?? 0,
      onActionCompositionSelectionError:
        this.services.actionCompositionTree?.reportSelectionIssue,
      onResolverTextTrace: this.createResolverTextTraceHandler(state.storyId),
      onRpLlmTrace: this.createRpLlmTraceHandler(state.storyId),
      now: this.services.now,
      abortSignal
    };
  }

  private createResolverTextTraceHandler(
    storyId: string | null
  ): StoryStepGenerationContext["onResolverTextTrace"] | undefined {
    const sink = this.services.resolverTextTraceSink;

    if (!sink || !storyId) {
      return undefined;
    }

    return async (entries) => {
      if (entries.length === 0) {
        return;
      }

      try {
        await sink.appendResolverTextTrace({
          storyId,
          entries
        });
      } catch (error) {
        this.services.onError?.(error);
      }
    };
  }

  private createRpLlmTraceHandler(
    storyId: string | null
  ): StoryStepGenerationContext["onRpLlmTrace"] | undefined {
    const sink = this.services.rpLlmTraceSink;

    if (!sink || !storyId) {
      return undefined;
    }

    return async (entries) => {
      if (entries.length === 0) {
        return;
      }

      try {
        await sink.appendRpLlmTrace({
          storyId,
          entries
        });
      } catch (error) {
        this.services.onError?.(error);
      }
    };
  }
}

export function selectSceneResumeStep(
  workflow: { stepStates: Partial<Record<StoryWorkflowStepId, { status?: string }>> }
): StoryWorkflowStepId {
  const generatingStep = storyWorkflowStepIds.find(
    (stepId) => workflow.stepStates[stepId]?.status === "generating"
  );

  if (generatingStep) {
    return generatingStep;
  }

  return (
    storyWorkflowStepIds.find(
      (stepId) => !isWorkflowStepCompleteForResume(workflow.stepStates[stepId]?.status)
    ) ?? storyWorkflowStepIds[storyWorkflowStepIds.length - 1]
  );
}

export function shouldGenerateOnSceneEntry(
  workflow: { stepStates: Partial<Record<StoryWorkflowStepId, { status?: string }>> },
  stepId: StoryWorkflowStepId
): boolean {
  const status = workflow.stepStates[stepId]?.status ?? "empty";

  return (
    status === "empty" ||
    status === "invalidated" ||
    status === "failed"
  );
}

function isWorkflowStepCompleteForResume(status: string | undefined): boolean {
  return status === "validated" || status === "deferred";
}

function deferredPayloadForStep(
  stepId: StoryWorkflowStepId
): StoryWorkflowPayload {
  switch (stepId) {
    case "danbot":
      return {
        danbotTags: ""
      };
    case "image":
      return {
        imageRef: ""
      };
    default:
      throw new Error(`Workflow step cannot be deferred: ${stepId}`);
  }
}

function deferredNodeIds(
  state: Pick<StorySessionState, "tree" | "workflowByNodeId">,
  kind: "danbot" | "image"
): string[] {
  return getStoryNodeIds(state.tree).filter((nodeId) =>
    isNodeStepDeferred(state, nodeId, kind)
  );
}

function isNodeStepDeferred(
  state: Pick<StorySessionState, "tree" | "workflowByNodeId">,
  nodeId: string,
  kind: "danbot" | "image"
): boolean {
  if (!state.tree || !getStoryNodeIds(state.tree).includes(nodeId)) {
    return false;
  }

  return state.workflowByNodeId[nodeId]?.stepStates[kind]?.status === "deferred";
}

function normalizeStepPayload(
  stepId: StoryWorkflowStepId,
  payload: StoryWorkflowPayload
): StoryWorkflowPayload {
  return storyWorkflowStepById[stepId].normalize
    ? storyWorkflowStepById[stepId].normalize(payload)
    : payload;
}

function deferredInputFingerprint(
  stepId: StoryWorkflowStepId,
  fields: StoryNodeFields,
  config: StorySessionState["backendConfig"]
): string {
  if (stepId === "danbot") {
    return stableStringify({
      resolverText: fields.resolverText,
      visualDescription: fields.visualDescription,
      selectedTags: fields.selectedTags,
      positivePrompt: fields.positivePrompt,
      negativePrompt: fields.negativePrompt,
      danbot: config
        ? {
            model_path: config.danbot.model_path,
            max_tags: config.danbot.max_tags
          }
        : null
    });
  }

  if (stepId === "image") {
    return stableStringify({
      positivePrompt: fields.positivePrompt,
      negativePrompt: fields.negativePrompt,
      image: config
        ? {
            model_path: config.image.model_path,
            model_type: config.image.model_type,
            default_width: config.image.default_width,
            default_height: config.image.default_height,
            default_steps: config.image.default_steps,
            default_cfg_scale: config.image.default_cfg_scale,
            sampler: config.image.sampler,
            scheduler: config.image.scheduler,
            manual_lora_paths: config.image.manual_lora_paths
          }
        : null
    });
  }

  return stableStringify({
    stepId,
    fields
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function toStorySessionRunningJob(run: SceneWorkflowRun): StorySessionRunningJob {
  return {
    id: run.runId,
    nodeId: run.nodeId,
    runId: run.runId,
    stepId: run.stepId
  };
}

function generationMessage(reason: StartSceneStepGenerationInput["reason"]): string {
  switch (reason) {
    case "navigation":
      return "Resuming scene workflow...";
    case "manual":
      return "Generating...";
    case "compat":
      return "Running workflow...";
    case "auto":
    default:
      return "Generating next step...";
  }
}
