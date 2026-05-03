import type { TextTree } from "@replayable-text-tree/core";
import {
  resolveStoryNodeFields,
  type StoryNodeFields,
  type StoryWorkflowByNodeId,
  type StoryWorkflowSnapshot
} from "@local-vn/story-domain";

import { commitStep } from "./commitStep";
import { editStepField } from "./editStepField";

export interface ApplyResolverResultInput {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  resolverText?: string;
  selectedTags?: string | string[];
  commit?: boolean;
}

export interface ApplyResolverResultResult {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  workflow?: StoryWorkflowSnapshot;
  fields: StoryNodeFields;
}

export function applyResolverResult(
  input: ApplyResolverResultInput
): ApplyResolverResultResult {
  const fields = resolveStoryNodeFields(input.tree, input.nodeId);
  let tree = input.tree;
  let workflowByNodeId = input.workflowByNodeId;
  let workflow: StoryWorkflowSnapshot | undefined;

  if (typeof input.resolverText === "string") {
    const edited = editStepField({
      workflowByNodeId,
      nodeId: input.nodeId,
      fields,
      stepId: "resolverText",
      field: "resolverText",
      value: input.resolverText
    });

    workflowByNodeId = edited.workflowByNodeId;
    workflow = edited.workflow;

    if (input.commit !== false) {
      const committed = commitStep({
        tree,
        workflowByNodeId,
        nodeId: input.nodeId,
        fields,
        stepId: "resolverText"
      });

      tree = committed.tree;
      workflowByNodeId = committed.workflowByNodeId;
      workflow = committed.workflow;
    }
  }

  if (input.selectedTags !== undefined) {
    const selectedTags = normalizeSelectedTags(input.selectedTags);
    const currentFields = resolveStoryNodeFields(tree, input.nodeId);

    const edited = editStepField({
      workflowByNodeId,
      nodeId: input.nodeId,
      fields: currentFields,
      stepId: "selectedTags",
      field: "selectedTags",
      value: selectedTags
    });

    workflowByNodeId = edited.workflowByNodeId;
    workflow = edited.workflow;

    if (input.commit !== false) {
      const committed = commitStep({
        tree,
        workflowByNodeId,
        nodeId: input.nodeId,
        fields: currentFields,
        stepId: "selectedTags"
      });

      tree = committed.tree;
      workflowByNodeId = committed.workflowByNodeId;
      workflow = committed.workflow;
    }
  }

  return {
    tree,
    workflowByNodeId,
    workflow,
    fields: resolveStoryNodeFields(tree, input.nodeId)
  };
}

function normalizeSelectedTags(tags: string | string[]): string {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .join(", ");
  }

  return tags.trim();
}
