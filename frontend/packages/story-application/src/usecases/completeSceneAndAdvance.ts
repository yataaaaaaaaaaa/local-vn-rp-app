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

  const nextSceneContext = buildNextSceneContext(currentFields);
  const childInitialFields: Partial<StoryNodeFields> = {
    context: nextSceneContext,
    negativePrompt: currentFields.negativePrompt,
    ...(input.initialChildFields ?? {})
  };

  const child = addStoryChildNode(
    input.tree,
    input.nodeId,
    childInitialFields,
    input.childNodeId ? { nodeId: input.childNodeId } : {}
  );

  const workflowByNodeId = cloneWorkflowByNodeId(input.workflowByNodeId);
  const childWorkflow = createStoryWorkflowSnapshot("userText");

  childWorkflow.stepStates.context = {
    status: "validated",
    generated: { context: nextSceneContext },
    edited: { context: nextSceneContext }
  };
  childWorkflow.frontierStepId = "userText";
  childWorkflow.activeStepId = "userText";
  workflowByNodeId[child.nodeId] = childWorkflow;

  return {
    tree: child.tree,
    workflowByNodeId,
    previousNodeId: input.nodeId,
    nextNodeId: child.nodeId,
    nextFields: resolveStoryNodeFields(child.tree, child.nodeId)
  };
}

function buildNextSceneContext(fields: StoryNodeFields): string {
  const previousTurn = [
    "PREVIOUS_TURN:",
    fields.userText ? `{{user.name}}: ${fields.userText}` : "",
    fields.dialogue ? `{{npc.name}}: ${fields.dialogue}` : "",
    fields.visualDescription ? `visual description: ${fields.visualDescription}` : ""
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");

  return [fields.context, previousTurn]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}