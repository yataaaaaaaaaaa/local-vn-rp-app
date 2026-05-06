import type { TextTree } from "@replayable-text-tree/core";
import {
  cloneWorkflowByNodeId,
  editStoryNodeFields,
  ensureWorkflowRecord,
  readFields,
  type StoryNodeFields,
  type StoryWorkflowByNodeId,
  type StoryWorkflowPayload,
  type StoryWorkflowSnapshot,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import { markWorkflowStepDeferred } from "@local-vn/workflow-core";

export interface DeferStepInput {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  fields: StoryNodeFields;
  stepId: StoryWorkflowStepId;
  payload: StoryWorkflowPayload;
  inputFingerprint?: string;
}

export interface DeferStepResult {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  workflow: StoryWorkflowSnapshot;
  payload: StoryWorkflowPayload;
}

export function deferStep(input: DeferStepInput): DeferStepResult {
  const workflowByNodeId = cloneWorkflowByNodeId(input.workflowByNodeId);
  const workflow = ensureWorkflowRecord(
    workflowByNodeId,
    input.nodeId,
    input.fields
  );
  const payload = input.payload;
  const tree = editStoryNodeFields(
    input.tree,
    input.nodeId,
    filterStringPayload(payload)
  );

  markWorkflowStepDeferred(
    workflow,
    input.stepId,
    payload,
    input.inputFingerprint
  );

  return {
    tree,
    workflowByNodeId,
    workflow,
    payload
  };
}

function filterStringPayload(
  payload: StoryWorkflowPayload
): Partial<Record<keyof StoryNodeFields, string>> {
  const fields: Partial<Record<keyof StoryNodeFields, string>> = {};

  for (const [key, value] of Object.entries(payload) as Array<
    [keyof StoryNodeFields, string | undefined]
  >) {
    if (typeof value === "string") {
      fields[key] = value;
    }
  }

  return fields;
}
