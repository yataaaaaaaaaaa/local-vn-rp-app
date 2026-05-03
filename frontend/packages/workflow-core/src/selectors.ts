import type { WorkflowSnapshot, WorkflowStepState } from "./types";

export function stepIndex<TStepId extends string>(
  stepIds: readonly TStepId[],
  stepId: TStepId
): number {
  const index = stepIds.indexOf(stepId);

  if (index < 0) {
    throw new Error(`Unknown workflow step id: ${stepId}`);
  }

  return index;
}

export function nextStepId<TStepId extends string>(
  stepIds: readonly TStepId[],
  stepId: TStepId
): TStepId | null {
  const index = stepIndex(stepIds, stepId);
  return stepIds[index + 1] ?? null;
}

export function isFutureWorkflowStep<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepIds: readonly TStepId[],
  stepId: TStepId
): boolean {
  return stepIndex(stepIds, stepId) > stepIndex(stepIds, snapshot.frontierStepId);
}

export function canEditWorkflowStep<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepIds: readonly TStepId[],
  stepId: TStepId
): boolean {
  if (snapshot.machineState === "running") {
    return false;
  }

  if (isFutureWorkflowStep(snapshot, stepIds, stepId)) {
    return false;
  }

  const stepState = snapshot.stepStates[stepId];

  if (!stepState) {
    return true;
  }

  return canEditWorkflowStepState(stepState);
}

export function canEditWorkflowStepState<TPayload>(
  stepState: WorkflowStepState<TPayload>
): boolean {
  return stepState.status !== "generating";
}
