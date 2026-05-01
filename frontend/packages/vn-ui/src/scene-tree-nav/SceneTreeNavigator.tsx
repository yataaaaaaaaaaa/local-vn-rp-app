import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Background,
    Controls,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type Edge,
    type Node,
    type NodeMouseHandler,
} from "@xyflow/react";

import { SceneTreeNode } from "./SceneTreeNode";
import { buildVisibleSceneGraph } from "./sceneTreeUtils";
import { layoutSceneTree } from "./layoutSceneTree";
import type {
    SceneTreeInputNode,
    SceneTreeNodeData,
    SceneTreeReactNode,
} from "./types";

import "./scene-tree-nav.css";

const nodeTypes = {
    sceneTreeNode: SceneTreeNode,
};

type CursorPreview = {
    imageUrl: string;
    label: string;
    x: number;
    y: number;
};

export type SceneTreeNavigatorProps = {
    tree: SceneTreeInputNode[];
    currentSceneId?: string;
    onTeleportToScene: (sceneId: string) => void;
    height?: number | string;
    className?: string;
};

export function SceneTreeNavigator(props: SceneTreeNavigatorProps) {
    return (
        <ReactFlowProvider>
            <SceneTreeNavigatorInner {...props} />
        </ReactFlowProvider>
    );
}

function SceneTreeNavigatorInner({
    tree,
    currentSceneId,
    onTeleportToScene,
    height = 240,
    className,
}: SceneTreeNavigatorProps) {
    const { fitView } = useReactFlow();

    const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [nodes, setNodes] = useState<SceneTreeReactNode[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [preview, setPreview] = useState<CursorPreview | null>(null);

    const toggleCollapsed = useCallback((sceneId: string) => {
        setCollapsedNodeIds((previous) => {
            const next = new Set(previous);

            if (next.has(sceneId)) {
                next.delete(sceneId);
            } else {
                next.add(sceneId);
            }

            return next;
        });
    }, []);

    const visibleGraph = useMemo(() => {
        return buildVisibleSceneGraph({
            tree,
            collapsedNodeIds,
            currentSceneId,
            toggleCollapsed,
        });
    }, [tree, collapsedNodeIds, currentSceneId, toggleCollapsed]);

    useEffect(() => {
        let cancelled = false;

        async function runLayout() {
            const layouted = await layoutSceneTree(
                visibleGraph.nodes,
                visibleGraph.edges,
            );

            if (cancelled) return;

            setNodes(layouted.nodes);
            setEdges(layouted.edges);

            window.requestAnimationFrame(() => {
                fitView({
                    padding: 0.18,
                    duration: 250,
                });
            });
        }

        runLayout().catch((error) => {
            console.error("Failed to layout scene tree", error);
            setNodes(visibleGraph.nodes);
            setEdges(visibleGraph.edges);
        });

        return () => {
            cancelled = true;
        };
    }, [visibleGraph, fitView]);

    const handleNodeClick: NodeMouseHandler<Node<SceneTreeNodeData>> =
        useCallback(
            (_event, node) => {
                onTeleportToScene(node.data.sceneId);
            },
            [onTeleportToScene],
        );

    const handleNodeMouseEnter: NodeMouseHandler<Node<SceneTreeNodeData>> =
        useCallback((event, node) => {
            if (!node.data.imageUrl) return;

            setPreview({
                imageUrl: node.data.imageUrl,
                label: node.data.label,
                x: event.clientX,
                y: event.clientY,
            });
        }, []);

    const handleNodeMouseMove: NodeMouseHandler<Node<SceneTreeNodeData>> =
        useCallback((event, node) => {
            if (!node.data.imageUrl) return;

            setPreview((previous) => {
                if (!previous) return previous;

                return {
                    ...previous,
                    x: event.clientX,
                    y: event.clientY,
                };
            });
        }, []);

    const handleNodeMouseLeave = useCallback(() => {
        setPreview(null);
    }, []);

    return (
        <div
            className={["scene-tree-nav", className].filter(Boolean).join(" ")}
            style={{ height }}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.08}
                maxZoom={2}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                onNodeClick={handleNodeClick}
                onNodeMouseEnter={handleNodeMouseEnter}
                onNodeMouseMove={handleNodeMouseMove}
                onNodeMouseLeave={handleNodeMouseLeave}
            >
                <Background />
                <Controls
                    orientation="horizontal"
                    position="bottom-left"
                    showInteractive={false}
                />
            </ReactFlow>

            {preview && (
                <div
                    className="scene-tree-cursor-preview"
                    style={{
                        transform: `translate(${preview.x + 14}px, ${preview.y + 14}px)`,
                    }}
                >
                    <img src={preview.imageUrl} alt={preview.label} />
                </div>
            )}
        </div>
    );
}