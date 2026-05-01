export type WorkflowMachineState = "editing" | "running";
export type WorkflowStepMode = "auto" | "manual";
export type WorkflowStepStatus = "empty" | "generating" | "candidate" | "validated" | "invalidated" | "failed";

export interface WorkflowStepState<TPayload> {
  status: WorkflowStepStatus;
  generated: TPayload | null;
  edited: TPayload | null;
  error?: string;
  warnings?: string[];
}

export type WorkflowStepsState<TStepId extends string, TPayload> = Partial<Record<TStepId, WorkflowStepState<TPayload>>>;

export interface WorkflowSnapshot<TStepId extends string, TPayload> {
  machineState: WorkflowMachineState;
  frontierStepId: TStepId;
  activeStepId: TStepId;
  stepStates: WorkflowStepsState<TStepId, TPayload>;
}

export interface WorkflowStepDefinition<TStepId extends string, TDocument, TContext, TPayload> {
  id: TStepId;
  label: string;
  mode: WorkflowStepMode;
  generate?: (input: {
    document: TDocument;
    context: TContext;
  }) => Promise<WorkflowGenerationResult<TPayload>> | WorkflowGenerationResult<TPayload>;
  read(document: TDocument): TPayload;
  write(document: TDocument, payload: TPayload): TDocument;
  empty(): TPayload;
  merge(base: TPayload, patch: Partial<TPayload>): TPayload;
  normalize?(payload: TPayload): TPayload;
}

export interface WorkflowGenerationResult<TPayload> {
  value: TPayload;
  warnings?: string[];
}

export function createWorkflowSnapshot<TStepId extends string, TPayload>(
  stepIds: readonly TStepId[],
  firstStepId: TStepId = stepIds[0]
): WorkflowSnapshot<TStepId, TPayload> {
  return {
    machineState: "editing",
    frontierStepId: firstStepId,
    activeStepId: firstStepId,
    stepStates: {}
  };
}

export function stepIndex<TStepId extends string>(stepIds: readonly TStepId[], stepId: TStepId): number {
  return stepIds.indexOf(stepId);
}

export function nextStepId<TStepId extends string>(stepIds: readonly TStepId[], stepId: TStepId): TStepId | null {
  const index = stepIndex(stepIds, stepId);
  if (index < 0 || index >= stepIds.length - 1) return null;
  return stepIds[index + 1];
}

export function ensureWorkflowStepState<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  fallback: () => TPayload
): WorkflowStepState<TPayload> {
  const existing = snapshot.stepStates[stepId];
  if (existing) return existing;

  const edited = fallback();
  const created: WorkflowStepState<TPayload> = {
    status: "empty",
    generated: null,
    edited
  };
  snapshot.stepStates[stepId] = created;
  return created;
}

export function isFutureWorkflowStep<TStepId extends string, TPayload>(
  stepIds: readonly TStepId[],
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId
): boolean {
  return stepIndex(stepIds, stepId) > stepIndex(stepIds, snapshot.frontierStepId);
}

export function canEditWorkflowStep<TStepId extends string, TPayload>(
  stepIds: readonly TStepId[],
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId
): boolean {
  return snapshot.machineState === "editing" && !isFutureWorkflowStep(stepIds, snapshot, stepId);
}

export function markWorkflowStepGenerating<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  previousEdited: TPayload
): void {
  snapshot.stepStates[stepId] = {
    status: "generating",
    generated: null,
    edited: previousEdited
  };
}

export function setWorkflowStepCandidate<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  generated: TPayload,
  warnings: string[] = []
): void {
  snapshot.stepStates[stepId] = {
    status: "candidate",
    generated,
    edited: generated,
    warnings
  };
}

export function setWorkflowStepEdited<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  edited: TPayload
): void {
  const current = snapshot.stepStates[stepId] ?? {
    status: "empty" as const,
    generated: null,
    edited: null
  };
  snapshot.stepStates[stepId] = {
    ...current,
    status: current.status === "validated" ? "candidate" : current.status,
    edited
  };
}

export function markWorkflowStepValidated<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  edited: TPayload
): void {
  const current = snapshot.stepStates[stepId] ?? { generated: null, warnings: [] };
  snapshot.stepStates[stepId] = {
    status: "validated",
    generated: current.generated ?? edited,
    edited,
    warnings: current.warnings
  };
}

export function markWorkflowStepFailed<TStepId extends string, TPayload>(
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId,
  error: string,
  previousEdited: TPayload
): void {
  const current = snapshot.stepStates[stepId];
  snapshot.stepStates[stepId] = {
    status: "failed",
    generated: current?.generated ?? null,
    edited: current?.edited ?? previousEdited,
    error,
    warnings: current?.warnings
  };
}

export function invalidateWorkflowStepsAfter<TStepId extends string, TPayload>(
  stepIds: readonly TStepId[],
  snapshot: WorkflowSnapshot<TStepId, TPayload>,
  stepId: TStepId
): void {
  const index = stepIndex(stepIds, stepId);
  if (index < 0) return;

  for (const downstreamStepId of stepIds.slice(index + 1)) {
    const current = snapshot.stepStates[downstreamStepId];
    if (!current) continue;
    snapshot.stepStates[downstreamStepId] = {
      ...current,
      status: "invalidated"
    };
  }
}
