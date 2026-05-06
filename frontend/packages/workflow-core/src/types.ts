export type WorkflowMachineState = "editing" | "running";

export type WorkflowStepMode = "auto" | "manual";

export type WorkflowStepStatus =
  | "empty"
  | "generating"
  | "candidate"
  | "validated"
  | "deferred"
  | "invalidated"
  | "failed";

export interface WorkflowStepState<TPayload> {
  status: WorkflowStepStatus;
  generated: TPayload | null;
  edited: TPayload | null;
  error?: string;
  warnings?: string[];
  deferredInputFingerprint?: string;
  deferredAt?: string;
}

export type WorkflowStepsState<TStepId extends string, TPayload> = Partial<
  Record<TStepId, WorkflowStepState<TPayload>>
>;

export interface WorkflowSnapshot<TStepId extends string, TPayload> {
  machineState: WorkflowMachineState;
  frontierStepId: TStepId;
  activeStepId: TStepId;
  stepStates: WorkflowStepsState<TStepId, TPayload>;
}

export interface WorkflowGenerationResult<TPayload> {
  value: TPayload;
  warnings?: string[];
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
