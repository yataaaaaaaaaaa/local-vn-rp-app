import ELK, { type ElkNode } from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import { Position, type Edge } from "@xyflow/react";
import type { SceneTreeReactNode } from "./types";

const elk = new ELK({
  algorithms: ["layered"],
  workerUrl: elkWorkerUrl,
});

const NODE_WIDTH = 190;
const NODE_HEIGHT = 58;

export async function layoutSceneTree(
  nodes: SceneTreeReactNode[],
  edges: Edge[],
): Promise<{ nodes: SceneTreeReactNode[]; edges: Edge[] }> {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const graph: ElkNode = {
    id: "scene-tree-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "42",
      "elk.layered.spacing.nodeNodeBetweenLayers": "92",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutedGraph = await elk.layout(graph);

  const layoutedNodes = (layoutedGraph.children ?? [])
    .map<SceneTreeReactNode | null>((layoutedNode) => {
      const originalNode = nodesById.get(layoutedNode.id);
      if (!originalNode) return null;

      return {
        ...originalNode,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        position: {
          x: layoutedNode.x ?? 0,
          y: layoutedNode.y ?? 0,
        },
      };
    })
    .filter((node): node is SceneTreeReactNode => Boolean(node));

  return {
    nodes: layoutedNodes,
    edges,
  };
}
