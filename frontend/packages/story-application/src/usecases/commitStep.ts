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
import type { TextTree } from "@replayable-text-tree/core";
import { markWorkflowStepValidated } from "@local-vn/workflow-core";

export interface CommitStepInput {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  fields: StoryNodeFields;
  stepId: StoryWorkflowStepId;
}

export interface CommitStepResult {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  workflow: StoryWorkflowSnapshot;
  payload: StoryWorkflowPayload;
}

export function commitStep(input: CommitStepInput): CommitStepResult {
  const workflowByNodeId = cloneWorkflowByNodeId(input.workflowByNodeId);
  const workflow = ensureWorkflowRecord(
    workflowByNodeId,
    input.nodeId,
    input.fields
  );

  const stepState = workflow.stepStates[input.stepId];

  const payload =
    stepState?.edited ??
    stepState?.generated ??
    readFields(input.fields, input.stepId);

  const tree = editStoryNodeFields(
    input.tree,
    input.nodeId,
    filterStringPayload(payload)
  );

  markWorkflowStepValidated(
    workflow,
    input.stepId,
    () => readFields(input.fields, input.stepId)
  );

  workflow.stepStates[input.stepId] = {
    ...workflow.stepStates[input.stepId],
    status: "validated",
    generated: stepState?.generated ?? payload,
    edited: payload,
    error: undefined
  };

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
