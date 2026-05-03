import type { StoryWorkflowStepId } from "@local-vn/story-domain";
import {
  generationKeyFor,
  type StoryWorkflowRunningJob
} from "./generateStepCandidate";

export interface WorkflowRunToken {
  key: string;
  nodeId: string;
  startStepId: StoryWorkflowStepId;
  currentStepId: StoryWorkflowStepId;
  startedAt: string;
  abortController: AbortController;
}

export type WorkflowRunRegistry = Record<string, WorkflowRunToken>;

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

export async function continueWorkflow(): Promise<never> {
  throw new Error(
    "continueWorkflow was removed as an orchestration engine. Use SceneWorkflowCoordinator instead."
  );
}
