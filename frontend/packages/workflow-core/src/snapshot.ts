import type {
  WorkflowMachineState,
  WorkflowSnapshot,
  WorkflowStepState,
  WorkflowStepsState
} from "./types";

export function createWorkflowStepState<TPayload>(
  generated: TPayload | null = null,
  edited: TPayload | null = null
): WorkflowStepState<TPayload> {
  return {
    status: generated === null && edited === null ? "empty" : "candidate",
    generated,
    edited
  };
}

export function createWorkflowSnapshot<TStepId extends string, TPayload>(input: {
  stepIds: readonly TStepId[];
  initialStepId?: TStepId;
  machineState?: WorkflowMachineState;
  stepStates?: WorkflowStepsState<TStepId, TPayload>;
}): WorkflowSnapshot<TStepId, TPayload> {
  const initialStepId = input.initialStepId ?? input.stepIds[0];

  if (!initialStepId) {
    throw new Error("Cannot create workflow snapshot without at least one step id.");
  }

  return {
    machineState: input.machineState ?? "editing",
    frontierStepId: initialStepId,
    activeStepId: initialStepId,
    stepStates: cloneWorkflowStepsState(input.stepStates ?? {})
  };
}

export function ensureWorkflowStepState<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  createEmptyPayload: () => TPayload
): WorkflowStepState<TPayload> {
  const existing = snapshot.stepStates[stepId];

  if (existing) {
    return existing;
  }

  const created: WorkflowStepState<TPayload> = {
    status: "empty",
    generated: null,
    edited: createEmptyPayload()
  };

  snapshot.stepStates[stepId] = created;
  return created;
}

export function cloneWorkflowSnapshot<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>
): WorkflowSnapshot<TStepId, TPayload> {
  return {
    machineState: snapshot.machineState,
    frontierStepId: snapshot.frontierStepId,
    activeStepId: snapshot.activeStepId,
    stepStates: cloneWorkflowStepsState(snapshot.stepStates)
  };
}

export function cloneWorkflowStepsState<TStepId extends string, TPayload>(
  stepStates: WorkflowStepsState<TStepId, TPayload>
): WorkflowStepsState<TStepId, TPayload> {
  const cloned: WorkflowStepsState<TStepId, TPayload> = {};

  for (const [stepId, state] of Object.entries(stepStates) as Array<
    [TStepId, WorkflowStepState<TPayload> | undefined]
  >) {
    if (state) {
      cloned[stepId] = cloneWorkflowStepState(state);
    }
  }

  return cloned;
}

export function cloneWorkflowStepState<TPayload>(
  state: WorkflowStepState<TPayload>
): WorkflowStepState<TPayload> {
  return {
    status: state.status,
    generated: clonePayload(state.generated),
    edited: clonePayload(state.edited),
    error: state.error,
    warnings: state.warnings ? [...state.warnings] : undefined,
    deferredInputFingerprint: state.deferredInputFingerprint,
    deferredAt: state.deferredAt
  };
}

function clonePayload<TPayload>(payload: TPayload): TPayload;
function clonePayload<TPayload>(payload: TPayload | null): TPayload | null;
function clonePayload<TPayload>(payload: TPayload | null): TPayload | null {
  if (payload === null) {
    return null;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(payload);
  }

  return JSON.parse(JSON.stringify(payload)) as TPayload;
}
