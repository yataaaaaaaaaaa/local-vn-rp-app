import type { Edge } from "@xyflow/react";
import type { SceneTreeGraph, SceneTreeInputNode, SceneTreeReactNode } from "./types";

type FlatSceneNode = {
  id: string;
  label: string;
  imageUrl?: string;
  parentId?: string;
  childIds: string[];
};

function flattenSceneTree(tree: SceneTreeInputNode[]) {
  const nodesById = new Map<string, FlatSceneNode>();

  function visit(node: SceneTreeInputNode, parentId?: string) {
    if (nodesById.has(node.id)) {
      throw new Error(`Duplicate scene id in tree: ${node.id}`);
    }

    const children = node.children ?? [];
    const childIds = children.map((child) => child.id);

    nodesById.set(node.id, {
      id: node.id,
      label: node.label,
      imageUrl: node.imageUrl ?? undefined,
      parentId,
      childIds,
    });

    for (const child of children) {
      visit(child, node.id);
    }
  }

  for (const root of tree) {
    visit(root);
  }

  return nodesById;
}

function countDescendants(sceneId: string, nodesById: Map<string, FlatSceneNode>): number {
  const node = nodesById.get(sceneId);
  if (!node) return 0;

  let count = 0;

  for (const childId of node.childIds) {
    count += 1;
    count += countDescendants(childId, nodesById);
  }

  return count;
}

function collectHiddenNodeIds(collapsedNodeIds: Set<string>, nodesById: Map<string, FlatSceneNode>) {
  const hiddenNodeIds = new Set<string>();

  function hideDescendants(sceneId: string) {
    const node = nodesById.get(sceneId);
    if (!node) return;

    for (const childId of node.childIds) {
      hiddenNodeIds.add(childId);
      hideDescendants(childId);
    }
  }

  for (const sceneId of collapsedNodeIds) {
    hideDescendants(sceneId);
  }

  return hiddenNodeIds;
}

export function buildVisibleSceneGraph(params: {
  tree: SceneTreeInputNode[];
  collapsedNodeIds: Set<string>;
  toggleCollapsed: (sceneId: string) => void;
}): SceneTreeGraph {
  const { tree, collapsedNodeIds, toggleCollapsed } = params;
  const nodesById = flattenSceneTree(tree);
  const hiddenNodeIds = collectHiddenNodeIds(collapsedNodeIds, nodesById);
  const visibleNodes: SceneTreeReactNode[] = [];
  const visibleEdges: Edge[] = [];

  for (const sceneNode of nodesById.values()) {
    if (hiddenNodeIds.has(sceneNode.id)) continue;

    const collapsed = collapsedNodeIds.has(sceneNode.id);

    visibleNodes.push({
      id: sceneNode.id,
      type: "sceneTreeNode",
      position: { x: 0, y: 0 },
      data: {
        sceneId: sceneNode.id,
        label: sceneNode.label,
        imageUrl: sceneNode.imageUrl,
        childCount: sceneNode.childIds.length,
        collapsed,
        hiddenDescendantCount: collapsed ? countDescendants(sceneNode.id, nodesById) : 0,
        isCurrent: false,
        toggleCollapsed,
      },
    });

    for (const childId of sceneNode.childIds) {
      if (hiddenNodeIds.has(childId)) continue;

      visibleEdges.push({
        id: `${sceneNode.id}->${childId}`,
        source: sceneNode.id,
        target: childId,
        type: "smoothstep",
      });
    }
  }

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
  };
}

export function applyCurrentSceneToNodes(nodes: SceneTreeReactNode[], currentSceneId: string | null | undefined): SceneTreeReactNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isCurrent: Boolean(currentSceneId) && node.data.sceneId === currentSceneId,
    },
  }));
}
