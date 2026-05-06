import {
  cloneWorkflowSnapshot as cloneGenericWorkflowSnapshot,
  createWorkflowSnapshot
} from "@local-vn/workflow-core";
import type {
  WorkflowSnapshot,
  WorkflowStepState,
  WorkflowStepStatus
} from "@local-vn/workflow-core";

import type { StoryNodeFields } from "../story/types";
import {
  storyWorkflowStepIds,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId
} from "./stepIds";
import {
  emptyFields,
  readFields
} from "./stepFields";

export type StoryWorkflowSnapshot = WorkflowSnapshot<
  StoryWorkflowStepId,
  StoryWorkflowPayload
>;

export type StoryWorkflowByNodeId = Record<string, StoryWorkflowSnapshot>;

export function createStoryWorkflowSnapshot(
  initialStepId: StoryWorkflowStepId = storyWorkflowStepIds[0]
): StoryWorkflowSnapshot {
  return createWorkflowSnapshot<StoryWorkflowStepId, StoryWorkflowPayload>({
    stepIds: storyWorkflowStepIds,
    initialStepId
  });
}

export function ensureWorkflowRecord(
  workflowByNodeId: StoryWorkflowByNodeId,
  nodeId: string,
  fields?: StoryNodeFields
): StoryWorkflowSnapshot {
  const existing = workflowByNodeId[nodeId];

  if (existing) {
    return existing;
  }

  const created = createStoryWorkflowSnapshot();

  workflowByNodeId[nodeId] = fields
    ? markInitialFieldStepsValidated(created, fields)
    : created;

  return workflowByNodeId[nodeId];
}

export function workflowForNode(
  workflowByNodeId: StoryWorkflowByNodeId,
  nodeId: string | null | undefined
): StoryWorkflowSnapshot | null {
  if (!nodeId) {
    return null;
  }

  return workflowByNodeId[nodeId] ?? null;
}

export function cloneWorkflowSnapshot(
  snapshot: StoryWorkflowSnapshot
): StoryWorkflowSnapshot {
  return cloneGenericWorkflowSnapshot(snapshot);
}

export function cloneWorkflowByNodeId(
  workflowByNodeId: StoryWorkflowByNodeId
): StoryWorkflowByNodeId {
  return Object.fromEntries(
    Object.entries(workflowByNodeId).map(([nodeId, snapshot]) => [
      nodeId,
      cloneWorkflowSnapshot(snapshot)
    ])
  );
}

export function coerceWorkflowByNodeId(value: unknown): StoryWorkflowByNodeId {
  if (!isRecord(value)) {
    return {};
  }

  const result: StoryWorkflowByNodeId = {};

  for (const [nodeId, snapshotValue] of Object.entries(value)) {
    const snapshot = coerceWorkflowSnapshot(snapshotValue);

    if (snapshot) {
      result[nodeId] = snapshot;
    }
  }

  return result;
}

export function asStoryWorkflowStepId(
  value: unknown,
  fallback: StoryWorkflowStepId = storyWorkflowStepIds[0]
): StoryWorkflowStepId {
  return typeof value === "string" && isStoryWorkflowStepId(value)
    ? value
    : fallback;
}

export function markInitialFieldStepsValidated(
  snapshot: StoryWorkflowSnapshot,
  fields: StoryNodeFields
): StoryWorkflowSnapshot {
  const nextSnapshot = cloneWorkflowSnapshot(snapshot);

  for (const stepId of storyWorkflowStepIds) {
    const payload = readFields(fields, stepId);
    const hasValue = Object.values(payload).some(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    if (!hasValue) {
      continue;
    }

    nextSnapshot.stepStates[stepId] = {
      status: "validated",
      generated: payload,
      edited: payload
    };

    nextSnapshot.frontierStepId = stepId;
    nextSnapshot.activeStepId = stepId;
  }

  return nextSnapshot;
}

function coerceWorkflowSnapshot(value: unknown): StoryWorkflowSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const activeStepId = asStoryWorkflowStepId(value.activeStepId);
  const frontierStepId = asStoryWorkflowStepId(value.frontierStepId);
  const stepStates = coerceStepStates(value.stepStates);

  return {
    machineState: value.machineState === "running" ? "running" : "editing",
    activeStepId,
    frontierStepId,
    stepStates
  };
}

function coerceStepStates(value: unknown): StoryWorkflowSnapshot["stepStates"] {
  if (!isRecord(value)) {
    return {};
  }

  const result: StoryWorkflowSnapshot["stepStates"] = {};

  for (const stepId of storyWorkflowStepIds) {
    const state = coerceStepState(value[stepId], stepId);

    if (state) {
      result[stepId] = state;
    }
  }

  return result;
}

function coerceStepState(
  value: unknown,
  stepId: StoryWorkflowStepId
): WorkflowStepState<StoryWorkflowPayload> | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    status: coerceWorkflowStepStatus(value.status),
    generated: coercePayload(value.generated, stepId, null),
    edited: coercePayload(value.edited, stepId, emptyFields(stepId)),
    error: typeof value.error === "string" ? value.error : undefined,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === "string")
      : undefined,
    deferredInputFingerprint:
      typeof value.deferredInputFingerprint === "string"
        ? value.deferredInputFingerprint
        : undefined,
    deferredAt: typeof value.deferredAt === "string" ? value.deferredAt : undefined
  };
}

function coercePayload(
  value: unknown,
  stepId: StoryWorkflowStepId,
  fallback: StoryWorkflowPayload | null
): StoryWorkflowPayload | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return fallback;
  }

  const payload = emptyFields(stepId);

  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === "string") {
      payload[key as keyof StoryWorkflowPayload] = fieldValue;
    }
  }

  return payload;
}

function coerceWorkflowStepStatus(value: unknown): WorkflowStepStatus {
  return isWorkflowStepStatus(value) ? value : "empty";
}

function isStoryWorkflowStepId(value: string): value is StoryWorkflowStepId {
  return (storyWorkflowStepIds as readonly string[]).includes(value);
}

function isWorkflowStepStatus(value: unknown): value is WorkflowStepStatus {
  return (
    value === "empty" ||
    value === "generating" ||
    value === "candidate" ||
    value === "validated" ||
    value === "deferred" ||
    value === "invalidated" ||
    value === "failed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
