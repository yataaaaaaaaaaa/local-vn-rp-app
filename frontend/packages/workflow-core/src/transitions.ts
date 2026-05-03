import { ensureWorkflowStepState } from "./snapshot";
import { stepIndex } from "./selectors";
import type { WorkflowSnapshot, WorkflowStepState } from "./types";

export function markWorkflowStepGenerating<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  createEmptyPayload: () => TPayload
): WorkflowSnapshot<TStepId, TPayload> {
  const stepState = ensureWorkflowStepState(snapshot, stepId, createEmptyPayload);

  stepState.status = "generating";
  stepState.error = undefined;
  stepState.warnings = undefined;

  snapshot.machineState = "running";
  snapshot.activeStepId = stepId;

  return snapshot;
}

export function setWorkflowStepCandidate<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  value: TPayload,
  warnings?: string[]
): WorkflowSnapshot<TStepId, TPayload> {
  snapshot.stepStates[stepId] = {
    status: "candidate",
    generated: value,
    edited: value,
    warnings,
    error: undefined
  };

  snapshot.machineState = "editing";
  snapshot.activeStepId = stepId;
  snapshot.frontierStepId = stepId;

  return snapshot;
}

export function setWorkflowStepEdited<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  value: TPayload,
  createEmptyPayload: () => TPayload
): WorkflowSnapshot<TStepId, TPayload> {
  const stepState = ensureWorkflowStepState(snapshot, stepId, createEmptyPayload);

  stepState.edited = value;
  stepState.status = "candidate";
  stepState.error = undefined;

  snapshot.activeStepId = stepId;
  snapshot.frontierStepId = stepId;

  return snapshot;
}

export function markWorkflowStepValidated<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  createEmptyPayload: () => TPayload
): WorkflowSnapshot<TStepId, TPayload> {
  const stepState = ensureWorkflowStepState(snapshot, stepId, createEmptyPayload);

  stepState.status = "validated";
  stepState.error = undefined;

  snapshot.machineState = "editing";
  snapshot.activeStepId = stepId;
  snapshot.frontierStepId = stepId;

  return snapshot;
}

export function markWorkflowStepFailed<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  error: string,
  createEmptyPayload: () => TPayload
): WorkflowSnapshot<TStepId, TPayload> {
  const stepState = ensureWorkflowStepState(snapshot, stepId, createEmptyPayload);

  stepState.status = "failed";
  stepState.error = error;

  snapshot.machineState = "editing";
  snapshot.activeStepId = stepId;
  snapshot.frontierStepId = stepId;

  return snapshot;
}

export function invalidateWorkflowStepsAfter<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepIds: readonly TStepId[],
  stepId: TStepId
): WorkflowSnapshot<TStepId, TPayload> {
  const currentIndex = stepIndex(stepIds, stepId);

  for (const candidateStepId of stepIds.slice(currentIndex + 1)) {
    const stepState = snapshot.stepStates[candidateStepId];

    if (stepState && shouldInvalidateWorkflowStep(stepState)) {
      stepState.status = "invalidated";
      stepState.error = undefined;
    }
  }

  snapshot.frontierStepId = stepId;
  snapshot.activeStepId = stepId;

  return snapshot;
}

function shouldInvalidateWorkflowStep<TPayload>(
  stepState: WorkflowStepState<TPayload>
): boolean {
  return (
    stepState.status === "candidate" ||
    stepState.status === "validated" ||
    stepState.status === "failed" ||
    stepState.status === "generating"
  );
}
