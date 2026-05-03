import type { TextTree } from "@replayable-text-tree/core";
import {
  defaultStoryWorkflowAutoValidateGeneratedCandidate,
  resolveStoryNodeFields,
  storyWorkflowStepIds,
  type StoryWorkflowAutoValidateByStepId,
  type StoryWorkflowByNodeId,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import { nextStepId } from "@local-vn/workflow-core";

import type { StoryStepGenerationContext } from "../generation/storyStepGenerators";
import {
  generateStepCandidate,
  generationKeyFor,
  type GenerateStepCandidateResult,
  type StoryWorkflowRunningJob
} from "./generateStepCandidate";
import {
  commitStep,
  type CommitStepResult
} from "./commitStep";

export interface WorkflowRunToken {
  key: string;
  nodeId: string;
  startStepId: StoryWorkflowStepId;
  currentStepId: StoryWorkflowStepId;
  startedAt: string;
  abortController: AbortController;
}

export type WorkflowRunRegistry = Record<string, WorkflowRunToken>;

export interface ContinueWorkflowInput {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  startStepId: StoryWorkflowStepId;
  context: StoryStepGenerationContext;
  activeRuns?: WorkflowRunRegistry;
  autoValidateByStepId?: Partial<StoryWorkflowAutoValidateByStepId>;
  maxSteps?: number;
  onCandidate?: (result: GenerateStepCandidateResult & {
    stepId: StoryWorkflowStepId;
    tree: TextTree;
  }) => void | Promise<void>;
  onCommit?: (result: CommitStepResult & {
    stepId: StoryWorkflowStepId;
  }) => void | Promise<void>;
}

export interface ContinueWorkflowResult {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  activeRuns: WorkflowRunRegistry;
  completedStepIds: StoryWorkflowStepId[];
  lastPayload: StoryWorkflowPayload | null;
  stoppedAtStepId: StoryWorkflowStepId;
  error?: string;
  cancelled: boolean;
}

export function beginWorkflowRun(input: {
  activeRuns?: WorkflowRunRegistry;
  nodeId: string;
  startStepId: StoryWorkflowStepId;
  abortController?: AbortController;
  startedAt?: Date;
}): {
  activeRuns: WorkflowRunRegistry;
  token: WorkflowRunToken;
} {
  const activeRuns = { ...(input.activeRuns ?? {}) };
  const abortController = input.abortController ?? new AbortController();
  const key = generationKeyFor(input.nodeId, input.startStepId);

  const token: WorkflowRunToken = {
    key,
    nodeId: input.nodeId,
    startStepId: input.startStepId,
    currentStepId: input.startStepId,
    startedAt: (input.startedAt ?? new Date()).toISOString(),
    abortController
  };

  activeRuns[key] = token;

  return {
    activeRuns,
    token
  };
}

export function isWorkflowRunCurrent(
  activeRuns: WorkflowRunRegistry | undefined,
  token: WorkflowRunToken
): boolean {
  return activeRuns?.[token.key] === token && !token.abortController.signal.aborted;
}

export function cancelWorkflowRun(
  activeRuns: WorkflowRunRegistry | undefined,
  nodeId: string,
  stepId: StoryWorkflowStepId
): WorkflowRunRegistry {
  const nextRuns = { ...(activeRuns ?? {}) };
  const key = generationKeyFor(nodeId, stepId);
  const token = nextRuns[key];

  if (token) {
    token.abortController.abort();
    delete nextRuns[key];
  }

  return nextRuns;
}

export function cancelNodeWorkflowRuns(
  activeRuns: WorkflowRunRegistry | undefined,
  nodeId: string
): WorkflowRunRegistry {
  const nextRuns = { ...(activeRuns ?? {}) };

  for (const [key, token] of Object.entries(nextRuns)) {
    if (token.nodeId === nodeId) {
      token.abortController.abort();
      delete nextRuns[key];
    }
  }

  return nextRuns;
}

export function cancelAllWorkflowRuns(
  activeRuns: WorkflowRunRegistry | undefined
): WorkflowRunRegistry {
  for (const token of Object.values(activeRuns ?? {})) {
    token.abortController.abort();
  }

  return {};
}

export function toRunningJob(token: WorkflowRunToken): StoryWorkflowRunningJob {
  return {
    key: token.key,
    nodeId: token.nodeId,
    stepId: token.currentStepId,
    startedAt: token.startedAt,
    abortController: token.abortController
  };
}

export async function continueWorkflow(
  input: ContinueWorkflowInput
): Promise<ContinueWorkflowResult> {
  const autoValidateByStepId: StoryWorkflowAutoValidateByStepId = {
    ...defaultStoryWorkflowAutoValidateGeneratedCandidate,
    ...input.autoValidateByStepId
  };

  const { token, activeRuns: initialActiveRuns } = beginWorkflowRun({
    activeRuns: input.activeRuns,
    nodeId: input.nodeId,
    startStepId: input.startStepId
  });

  let activeRuns = initialActiveRuns;
  let tree = input.tree;
  let workflowByNodeId = input.workflowByNodeId;
  let stepId: StoryWorkflowStepId | null = input.startStepId;
  let lastPayload: StoryWorkflowPayload | null = null;
  let stoppedAtStepId: StoryWorkflowStepId = input.startStepId;
  const completedStepIds: StoryWorkflowStepId[] = [];
  const maxSteps = input.maxSteps ?? storyWorkflowStepIds.length;
  let iterations = 0;

  try {
    while (stepId) {
      token.currentStepId = stepId;
      stoppedAtStepId = stepId;

      assertWorkflowRunCurrent(activeRuns, token);
      assertMaxSteps(iterations, maxSteps);

      const fields = resolveStoryNodeFields(tree, input.nodeId);

      const candidateResult = await generateStepCandidate({
        workflowByNodeId,
        nodeId: input.nodeId,
        fields,
        stepId,
        context: input.context,
        abortSignal: token.abortController.signal
      });

      workflowByNodeId = candidateResult.workflowByNodeId;
      lastPayload = candidateResult.payload;

      await input.onCandidate?.({
        ...candidateResult,
        stepId,
        tree
      });

      assertWorkflowRunCurrent(activeRuns, token);

      if (candidateResult.error) {
        return finishWorkflowRun({
          tree,
          workflowByNodeId,
          activeRuns,
          token,
          completedStepIds,
          lastPayload,
          stoppedAtStepId: stepId,
          error: candidateResult.error,
          cancelled: false
        });
      }

      if (!autoValidateByStepId[stepId]) {
        return finishWorkflowRun({
          tree,
          workflowByNodeId,
          activeRuns,
          token,
          completedStepIds,
          lastPayload,
          stoppedAtStepId: stepId,
          cancelled: false
        });
      }

      const commitResult = commitStep({
        tree,
        workflowByNodeId,
        nodeId: input.nodeId,
        fields,
        stepId
      });

      tree = commitResult.tree;
      workflowByNodeId = commitResult.workflowByNodeId;
      completedStepIds.push(stepId);

      await input.onCommit?.({
        ...commitResult,
        stepId
      });

      assertWorkflowRunCurrent(activeRuns, token);

      stepId = nextStepId(storyWorkflowStepIds, stepId);
      iterations += 1;
    }

    return finishWorkflowRun({
      tree,
      workflowByNodeId,
      activeRuns,
      token,
      completedStepIds,
      lastPayload,
      stoppedAtStepId,
      cancelled: false
    });
  } catch (error) {
    const cancelled = token.abortController.signal.aborted;
    const message = error instanceof Error ? error.message : String(error);

    return finishWorkflowRun({
      tree,
      workflowByNodeId,
      activeRuns,
      token,
      completedStepIds,
      lastPayload,
      stoppedAtStepId,
      error: cancelled ? undefined : message,
      cancelled
    });
  }
}

function finishWorkflowRun(input: {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  activeRuns: WorkflowRunRegistry;
  token: WorkflowRunToken;
  completedStepIds: StoryWorkflowStepId[];
  lastPayload: StoryWorkflowPayload | null;
  stoppedAtStepId: StoryWorkflowStepId;
  error?: string;
  cancelled: boolean;
}): ContinueWorkflowResult {
  const activeRuns = { ...input.activeRuns };

  if (activeRuns[input.token.key] === input.token) {
    delete activeRuns[input.token.key];
  }

  return {
    tree: input.tree,
    workflowByNodeId: input.workflowByNodeId,
    activeRuns,
    completedStepIds: input.completedStepIds,
    lastPayload: input.lastPayload,
    stoppedAtStepId: input.stoppedAtStepId,
    error: input.error,
    cancelled: input.cancelled
  };
}

function assertWorkflowRunCurrent(
  activeRuns: WorkflowRunRegistry,
  token: WorkflowRunToken
): void {
  if (!isWorkflowRunCurrent(activeRuns, token)) {
    throw new Error("Workflow generation was cancelled.");
  }
}

function assertMaxSteps(iterations: number, maxSteps: number): void {
  if (iterations >= maxSteps) {
    throw new Error(`Workflow generation exceeded maximum step count: ${maxSteps}.`);
  }
}
