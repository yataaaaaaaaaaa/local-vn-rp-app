import { outputImageFile } from "@local-vn/config";
import {
  cloneWorkflowByNodeId,
  ensureWorkflowRecord,
  parseImageRef,
  resolveStoryNodeFields,
  storyWorkflowStepIds,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import {
  invalidateWorkflowStepsAfter,
  nextStepId
} from "@local-vn/workflow-core";

import type { StoryStepGenerationContext } from "../generation/storyStepGenerators";
import { commitStep } from "../usecases/commitStep";
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
  private runSerial = 0;

  public constructor(
    private readonly host: SceneWorkflowCoordinatorHost,
    private readonly services: StorySessionServices
  ) {}

  public cancelAll(message = "Workflow cancelled."): void {
    this.abortCurrentRun();
    this.host.setState({
      busy: false,
      runningJob: null,
      message
    });
  }

  public cancelNode(nodeId: string): void {
    if (this.currentRun?.nodeId === nodeId) {
      this.cancelAll();
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
        context: this.createWorkflowContext(nodeId, stepId),
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
        message: "Next scene created. Add the player text to continue."
      });

      await this.host.saveStory();
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

  private abortCurrentRun(): void {
    if (this.currentRun) {
      this.currentRun.abortController.abort();
      this.currentRun = null;
    }
  }

  private isCurrentRun(run: SceneWorkflowRun): boolean {
    return this.currentRun?.runId === run.runId && !run.abortController.signal.aborted;
  }

  private createWorkflowContext(
    nodeId: string,
    stepId: StoryWorkflowStepId
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
      now: this.services.now
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
      (stepId) => workflow.stepStates[stepId]?.status !== "validated"
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
