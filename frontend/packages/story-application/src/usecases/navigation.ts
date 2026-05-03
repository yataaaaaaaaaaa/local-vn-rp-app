import {
  getChildIds,
  getParentId,
  getSiblingIds
} from "@local-vn/story-domain";

import type { StorySessionState } from "../session/storySessionState";

export interface NavigationResult {
  state: StorySessionState;
  changed: boolean;
}

export function selectNode(
  state: StorySessionState,
  nodeId: string
): NavigationResult {
  if (!state.tree || state.selectedNodeId === nodeId) {
    return {
      state,
      changed: false
    };
  }

  return {
    state: {
      ...state,
      selectedNodeId: nodeId,
      historyBack: state.selectedNodeId
        ? [...state.historyBack, state.selectedNodeId]
        : state.historyBack,
      historyForward: [],
      message: null
    },
    changed: true
  };
}

export function goBack(state: StorySessionState): NavigationResult {
  const previousNodeId = state.historyBack.at(-1);

  if (!previousNodeId) {
    return {
      state,
      changed: false
    };
  }

  return {
    state: {
      ...state,
      selectedNodeId: previousNodeId,
      historyBack: state.historyBack.slice(0, -1),
      historyForward: state.selectedNodeId
        ? [state.selectedNodeId, ...state.historyForward]
        : state.historyForward,
      message: null
    },
    changed: true
  };
}

export function goForward(state: StorySessionState): NavigationResult {
  const nextNodeId = state.historyForward[0];

  if (!nextNodeId) {
    return {
      state,
      changed: false
    };
  }

  return {
    state: {
      ...state,
      selectedNodeId: nextNodeId,
      historyBack: state.selectedNodeId
        ? [...state.historyBack, state.selectedNodeId]
        : state.historyBack,
      historyForward: state.historyForward.slice(1),
      message: null
    },
    changed: true
  };
}

export function goToParent(state: StorySessionState): NavigationResult {
  if (!state.tree || !state.selectedNodeId) {
    return {
      state,
      changed: false
    };
  }

  const parentId = getParentId(state.tree, state.selectedNodeId);

  return parentId
    ? selectNode(state, parentId)
    : {
        state,
        changed: false
      };
}

export function goToFirstChild(state: StorySessionState): NavigationResult {
  if (!state.tree || !state.selectedNodeId) {
    return {
      state,
      changed: false
    };
  }

  const firstChildId = getChildIds(state.tree, state.selectedNodeId)[0];

  return firstChildId
    ? selectNode(state, firstChildId)
    : {
        state,
        changed: false
      };
}

export function goToChild(
  state: StorySessionState,
  nodeId: string
): NavigationResult {
  if (!state.tree || !state.selectedNodeId) {
    return {
      state,
      changed: false
    };
  }

  const childIds = getChildIds(state.tree, state.selectedNodeId);

  if (!childIds.includes(nodeId)) {
    return {
      state: {
        ...state,
        message: `Node is not a child of the current scene: ${nodeId}`
      },
      changed: false
    };
  }

  return selectNode(state, nodeId);
}

export function goToPreviousSibling(
  state: StorySessionState
): NavigationResult {
  if (!state.tree || !state.selectedNodeId) {
    return {
      state,
      changed: false
    };
  }

  const siblingIds = getSiblingIds(state.tree, state.selectedNodeId);
  const currentIndex = siblingIds.indexOf(state.selectedNodeId);
  const previousSiblingId =
    currentIndex > 0 ? siblingIds[currentIndex - 1] : null;

  return previousSiblingId
    ? selectNode(state, previousSiblingId)
    : {
        state,
        changed: false
      };
}

export function goToNextSibling(
  state: StorySessionState
): NavigationResult {
  if (!state.tree || !state.selectedNodeId) {
    return {
      state,
      changed: false
    };
  }

  const siblingIds = getSiblingIds(state.tree, state.selectedNodeId);
  const currentIndex = siblingIds.indexOf(state.selectedNodeId);
  const nextSiblingId =
    currentIndex >= 0 && currentIndex < siblingIds.length - 1
      ? siblingIds[currentIndex + 1]
      : null;

  return nextSiblingId
    ? selectNode(state, nextSiblingId)
    : {
        state,
        changed: false
      };
}
