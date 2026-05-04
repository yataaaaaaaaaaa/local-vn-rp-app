import {
  addStoryChildNode,
  createStoryWorkflowSnapshot,
  deleteStorySubtree,
  editStoryNodeFields,
  getChildIds,
  getParentId,
  resolveStoryNodeFields,
  type StoryNodeFields,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";

import type { StorySessionState } from "../session/storySessionState";

export interface BranchCommandResult {
  state: StorySessionState;
  changed: boolean;
  selectedNodeId?: string;
  createdNodeId?: string;
  deletedNodeIds?: string[];
}

export function createChildFromCurrent(
  state: StorySessionState,
  initialUserText = ""
): BranchCommandResult {
  if (!state.tree || !state.selectedNodeId) {
    return unchanged(state);
  }

  const parentFields = resolveStoryNodeFields(state.tree, state.selectedNodeId);

  const child = addStoryChildNode(state.tree, state.selectedNodeId, {
    context: buildChildContext(parentFields),
    userText: initialUserText,
    negativePrompt: parentFields.negativePrompt
  });

  const workflowByNodeId = {
    ...state.workflowByNodeId,
    [child.nodeId]: createWorkflowForNewNode(
      initialUserText ? "dialogue" : "userText",
      {
        context: buildChildContext(parentFields),
        userText: initialUserText
      }
    )
  };

  return {
    state: {
      ...state,
      tree: child.tree,
      selectedNodeId: child.nodeId,
      historyBack: state.selectedNodeId
        ? [...state.historyBack, state.selectedNodeId]
        : state.historyBack,
      historyForward: [],
      workflowByNodeId,
      activeStepId: initialUserText ? "dialogue" : "userText",
      dirty: true,
      message: initialUserText
        ? "New scene created with user text."
        : "New child scene created."
    },
    changed: true,
    selectedNodeId: child.nodeId,
    createdNodeId: child.nodeId
  };
}

export function submitUserText(
  state: StorySessionState,
  userText: string
): BranchCommandResult {
  if (!state.tree || !state.selectedNodeId) {
    return unchanged(state);
  }

  const tree = editStoryNodeFields(state.tree, state.selectedNodeId, {
    userText
  });

  const workflow = createWorkflowForExistingNode(
    state.workflowByNodeId[state.selectedNodeId],
    {
      userText
    },
    "dialogue"
  );

  return {
    state: {
      ...state,
      tree,
      workflowByNodeId: {
        ...state.workflowByNodeId,
        [state.selectedNodeId]: workflow
      },
      activeStepId: "dialogue",
      dirty: true,
      message: "User text submitted."
    },
    changed: true,
    selectedNodeId: state.selectedNodeId
  };
}

export function createAlternateBranch(
  state: StorySessionState,
  userText = ""
): BranchCommandResult {
  if (!state.tree || !state.selectedNodeId) {
    return unchanged(state);
  }

  const parentId = getParentId(state.tree, state.selectedNodeId);

  if (!parentId) {
    return {
      state: {
        ...state,
        message: "Cannot create an alternate branch for the root scene."
      },
      changed: false
    };
  }

  const currentFields = resolveStoryNodeFields(state.tree, state.selectedNodeId);
  const parentFields = resolveStoryNodeFields(state.tree, parentId);

  const child = addStoryChildNode(state.tree, parentId, {
    context: currentFields.context || buildChildContext(parentFields),
    userText,
    negativePrompt: currentFields.negativePrompt || parentFields.negativePrompt
  });

  const workflowByNodeId = {
    ...state.workflowByNodeId,
    [child.nodeId]: createWorkflowForNewNode(
      userText ? "dialogue" : "userText",
      {
        context: currentFields.context || buildChildContext(parentFields),
        userText
      }
    )
  };

  return {
    state: {
      ...state,
      tree: child.tree,
      selectedNodeId: child.nodeId,
      historyBack: state.selectedNodeId
        ? [...state.historyBack, state.selectedNodeId]
        : state.historyBack,
      historyForward: [],
      workflowByNodeId,
      activeStepId: userText ? "dialogue" : "userText",
      dirty: true,
      message: "Alternate branch created."
    },
    changed: true,
    selectedNodeId: child.nodeId,
    createdNodeId: child.nodeId
  };
}

export function duplicateCurrentBranch(
  state: StorySessionState
): BranchCommandResult {
  if (!state.tree || !state.selectedNodeId) {
    return unchanged(state);
  }

  const parentId = getParentId(state.tree, state.selectedNodeId);

  if (!parentId) {
    return {
      state: {
        ...state,
        message: "Cannot duplicate the root scene."
      },
      changed: false
    };
  }

  const currentFields = resolveStoryNodeFields(state.tree, state.selectedNodeId);
  const child = addStoryChildNode(state.tree, parentId, currentFields);

  return {
    state: {
      ...state,
      tree: child.tree,
      selectedNodeId: child.nodeId,
      historyBack: [...state.historyBack, state.selectedNodeId],
      historyForward: [],
      workflowByNodeId: {
        ...state.workflowByNodeId,
        [child.nodeId]: cloneWorkflowForDuplicate(
          state.workflowByNodeId[state.selectedNodeId]
        )
      },
      imageRefs: state.imageRefs[state.selectedNodeId]
        ? {
            ...state.imageRefs,
            [child.nodeId]: state.imageRefs[state.selectedNodeId]
          }
        : state.imageRefs,
      dirty: true,
      message: "Branch duplicated."
    },
    changed: true,
    selectedNodeId: child.nodeId,
    createdNodeId: child.nodeId
  };
}

export function deleteNode(
  state: StorySessionState,
  nodeId: string
): BranchCommandResult {
  if (!state.tree) {
    return unchanged(state);
  }

  try {
    const deleted = deleteStorySubtree(state.tree, nodeId);
    const nextSelectedNodeId =
      state.selectedNodeId && deleted.deletedNodeIds.includes(state.selectedNodeId)
        ? deleted.parentId
        : state.selectedNodeId;

    return {
      state: {
        ...state,
        tree: deleted.tree,
        selectedNodeId: nextSelectedNodeId,
        historyBack: state.historyBack.filter(
          (historyNodeId) => !deleted.deletedNodeIds.includes(historyNodeId)
        ),
        historyForward: state.historyForward.filter(
          (historyNodeId) => !deleted.deletedNodeIds.includes(historyNodeId)
        ),
        workflowByNodeId: removeKeys(
          state.workflowByNodeId,
          deleted.deletedNodeIds
        ),
        imageRefs: removeKeys(state.imageRefs, deleted.deletedNodeIds),
        activeStepId:
          nextSelectedNodeId === state.selectedNodeId
            ? state.activeStepId
            : "userText",
        dirty: true,
        message: "Scene deleted."
      },
      changed: true,
      selectedNodeId: nextSelectedNodeId ?? undefined,
      deletedNodeIds: deleted.deletedNodeIds
    };
  } catch (error) {
    return {
      state: {
        ...state,
        message: error instanceof Error ? error.message : String(error)
      },
      changed: false
    };
  }
}

export function deleteCurrentLeaf(
  state: StorySessionState
): BranchCommandResult {
  if (!state.tree || !state.selectedNodeId) {
    return unchanged(state);
  }

  const childIds = getChildIds(state.tree, state.selectedNodeId);

  if (childIds.length > 0) {
    return {
      state: {
        ...state,
        message: "Only leaf scenes can be deleted with this command."
      },
      changed: false
    };
  }

  return deleteNode(state, state.selectedNodeId);
}

function unchanged(state: StorySessionState): BranchCommandResult {
  return {
    state,
    changed: false
  };
}

function buildChildContext(fields: StoryNodeFields): string {
  const previousTurn = [
    "PREVIOUS_TURN:",
    fields.userText ? `USER: ${fields.userText}` : "",
    fields.dialogue ? `NPC: ${fields.dialogue}` : "",
    fields.visualDescription ? `VISUAL_CUE: ${fields.visualDescription}` : ""
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");

  return [fields.context, previousTurn]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

function createWorkflowForNewNode(
  activeStepId: StoryWorkflowStepId,
  fields: Partial<StoryNodeFields>
): ReturnType<typeof createStoryWorkflowSnapshot> {
  const workflow = createStoryWorkflowSnapshot(activeStepId);

  if (fields.context !== undefined) {
    workflow.stepStates.context = {
      status: "validated",
      generated: { context: fields.context },
      edited: { context: fields.context }
    };
  }

  if (fields.userText !== undefined && fields.userText.trim()) {
    workflow.stepStates.userText = {
      status: "validated",
      generated: { userText: fields.userText },
      edited: { userText: fields.userText }
    };
  }

  workflow.frontierStepId = activeStepId;
  workflow.activeStepId = activeStepId;
  return workflow;
}

function createWorkflowForExistingNode(
  existingWorkflow: ReturnType<typeof createStoryWorkflowSnapshot> | undefined,
  fields: Partial<StoryNodeFields>,
  activeStepId: StoryWorkflowStepId
): ReturnType<typeof createStoryWorkflowSnapshot> {
  const workflow = existingWorkflow
    ? structuredClone(existingWorkflow)
    : createStoryWorkflowSnapshot(activeStepId);

  if (fields.userText !== undefined) {
    workflow.stepStates.userText = {
      status: "validated",
      generated: { userText: fields.userText },
      edited: { userText: fields.userText }
    };
  }

  workflow.frontierStepId = activeStepId;
  workflow.activeStepId = activeStepId;
  workflow.machineState = "editing";

  return workflow;
}

function cloneWorkflowForDuplicate(
  workflow: ReturnType<typeof createStoryWorkflowSnapshot> | undefined
): ReturnType<typeof createStoryWorkflowSnapshot> {
  return workflow
    ? structuredClone(workflow)
    : createStoryWorkflowSnapshot("userText");
}

function removeKeys<T>(
  record: Record<string, T>,
  keys: readonly string[]
): Record<string, T> {
  const next = { ...record };

  for (const key of keys) {
    delete next[key];
  }

  return next;
}
