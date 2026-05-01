import ELK from "elkjs/lib/elk.bundled.js";
import { Position, type Edge } from "@xyflow/react";
import type { SceneTreeReactNode } from "./types";

const elk = new ELK();

const NODE_WIDTH = 180;
const NODE_HEIGHT = 54;

export async function layoutSceneTree(
    nodes: SceneTreeReactNode[],
    edges: Edge[],
): Promise<{ nodes: SceneTreeReactNode[]; edges: Edge[] }> {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    const graph = {
        id: "root",
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.spacing.nodeNode": "40",
            "elk.layered.spacing.nodeNodeBetweenLayers": "80",
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

    const layoutedNodes: SceneTreeReactNode[] = (layoutedGraph.children ?? [])
        .map((layoutedNode) => {
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
        .filter(Boolean) as SceneTreeReactNode[];

    return {
        nodes: layoutedNodes,
        edges,
    };
}