import type { TextTree } from "@replayable-text-tree/core";
import {
  editStoryNodeField,
  resolveStoryNodeFields,
  type StoryNodeFields,
  type StoryWorkflowByNodeId,
  type StoryWorkflowSnapshot
} from "@local-vn/story-domain";

import { editStepField } from "./editStepField";
import { commitStep } from "./commitStep";

export interface ApplyPresetContextInput {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  context: string;
  commit?: boolean;
}

export interface ApplyPresetContextResult {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  workflow?: StoryWorkflowSnapshot;
  fields: StoryNodeFields;
}

export function applyPresetContext(
  input: ApplyPresetContextInput
): ApplyPresetContextResult {
  const fields = resolveStoryNodeFields(input.tree, input.nodeId);

  const edited = editStepField({
    workflowByNodeId: input.workflowByNodeId,
    nodeId: input.nodeId,
    fields,
    stepId: "context",
    field: "context",
    value: input.context
  });

  if (input.commit !== false) {
    const committed = commitStep({
      tree: input.tree,
      workflowByNodeId: edited.workflowByNodeId,
      nodeId: input.nodeId,
      fields,
      stepId: "context"
    });

    return {
      tree: committed.tree,
      workflowByNodeId: committed.workflowByNodeId,
      workflow: committed.workflow,
      fields: resolveStoryNodeFields(committed.tree, input.nodeId)
    };
  }

  const tree = editStoryNodeField(
    input.tree,
    input.nodeId,
    "context",
    input.context
  );

  return {
    tree,
    workflowByNodeId: edited.workflowByNodeId,
    workflow: edited.workflow,
    fields: resolveStoryNodeFields(tree, input.nodeId)
  };
}
