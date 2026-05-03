import type { TextTree } from "@replayable-text-tree/core";
import {
  addStoryChildNode,
  cloneWorkflowByNodeId,
  createStoryWorkflowSnapshot,
  resolveStoryNodeFields,
  type StoryNodeFields,
  type StoryWorkflowByNodeId
} from "@local-vn/story-domain";

export interface CompleteSceneAndAdvanceInput {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  nodeId: string;
  currentFields?: StoryNodeFields;
  initialChildFields?: Partial<StoryNodeFields>;
  childNodeId?: string;
}

export interface CompleteSceneAndAdvanceResult {
  tree: TextTree;
  workflowByNodeId: StoryWorkflowByNodeId;
  previousNodeId: string;
  nextNodeId: string;
  nextFields: StoryNodeFields;
}

export function completeSceneAndAdvance(
  input: CompleteSceneAndAdvanceInput
): CompleteSceneAndAdvanceResult {
  const currentFields =
    input.currentFields ?? resolveStoryNodeFields(input.tree, input.nodeId);

  const childInitialFields: Partial<StoryNodeFields> = {
    context: buildNextSceneContext(currentFields),
    ...(input.initialChildFields ?? {})
  };

  const child = addStoryChildNode(
    input.tree,
    input.nodeId,
    childInitialFields,
    input.childNodeId ? { nodeId: input.childNodeId } : {}
  );

  const workflowByNodeId = cloneWorkflowByNodeId(input.workflowByNodeId);
  workflowByNodeId[child.nodeId] = createStoryWorkflowSnapshot();

  return {
    tree: child.tree,
    workflowByNodeId,
    previousNodeId: input.nodeId,
    nextNodeId: child.nodeId,
    nextFields: resolveStoryNodeFields(child.tree, child.nodeId)
  };
}

function buildNextSceneContext(fields: StoryNodeFields): string {
  return [
    fields.context,
    fields.userText ? `Player: ${fields.userText}` : "",
    fields.dialogue,
    fields.visualDescription ? `Visible scene: ${fields.visualDescription}` : ""
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}
