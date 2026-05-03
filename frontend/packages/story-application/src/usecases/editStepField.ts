import {
  cloneWorkflowByNodeId,
  ensureWorkflowRecord,
  fieldsForStoryWorkflowStep,
  readFields,
  storyWorkflowStepIds,
  type StoryNodeFieldKey,
  type StoryNodeFields,
  type StoryWorkflowByNodeId,
  type StoryWorkflowPayload,
  type StoryWorkflowSnapshot,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import {
  invalidateWorkflowStepsAfter,
  setWorkflowStepEdited
} from "@local-vn/workflow-core";

export interface EditStepFieldInput {
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  fields: StoryNodeFields;
  stepId: StoryWorkflowStepId;
  field: StoryNodeFieldKey;
  value: string;
}

export interface EditStepFieldResult {
  workflowByNodeId: StoryWorkflowByNodeId;
  workflow: StoryWorkflowSnapshot;
  payload: StoryWorkflowPayload;
}

export function editStepField(input: EditStepFieldInput): EditStepFieldResult {
  assertFieldBelongsToStep(input.stepId, input.field);

  const workflowByNodeId = cloneWorkflowByNodeId(input.workflowByNodeId);
  const workflow = ensureWorkflowRecord(
    workflowByNodeId,
    input.nodeId,
    input.fields
  );

  const existingPayload =
    workflow.stepStates[input.stepId]?.edited ??
    workflow.stepStates[input.stepId]?.generated ??
    readFields(input.fields, input.stepId);

  const payload: StoryWorkflowPayload = {
    ...existingPayload,
    [input.field]: input.value
  };

  setWorkflowStepEdited(
    workflow,
    input.stepId,
    payload,
    () => readFields(input.fields, input.stepId)
  );

  invalidateWorkflowStepsAfter(
    workflow,
    storyWorkflowStepIds,
    input.stepId
  );

  return {
    workflowByNodeId,
    workflow,
    payload
  };
}

function assertFieldBelongsToStep(
  stepId: StoryWorkflowStepId,
  field: StoryNodeFieldKey
): void {
  const fields = fieldsForStoryWorkflowStep(stepId);

  if (!fields.includes(field)) {
    throw new Error(
      `Field "${field}" does not belong to workflow step "${stepId}".`
    );
  }
}
