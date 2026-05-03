import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { SceneTreeNode } from "./SceneTreeNode";
import { applyCurrentSceneToNodes, buildVisibleSceneGraph } from "./sceneTreeUtils";
import { layoutSceneTree } from "./layoutSceneTree";
import type { SceneTreeInputNode, SceneTreeReactNode } from "./types";
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
  currentSceneId?: string | null;
  onTeleportToScene: (sceneId: string) => void;
  onDeleteScene?: (sceneId: string) => void;
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
  onDeleteScene,
  height = 260,
  className,
}: SceneTreeNavigatorProps) {
  const { fitView } = useReactFlow();
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const [nodes, setNodes] = useState<SceneTreeReactNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [preview, setPreview] = useState<CursorPreview | null>(null);

  const toggleCollapsed = useCallback((sceneId: string) => {
    setCollapsedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }, []);

  const deleteNode = useCallback((sceneId: string) => {
    onDeleteScene?.(sceneId);
  }, [onDeleteScene]);

  const visibleGraph = useMemo(() => {
    return buildVisibleSceneGraph({
      tree,
      collapsedNodeIds,
      toggleCollapsed,
      deleteNode,
    });
  }, [tree, collapsedNodeIds, toggleCollapsed, deleteNode]);

  useEffect(() => {
    let cancelled = false;

    async function runLayout() {
      const layouted = await layoutSceneTree(visibleGraph.nodes, visibleGraph.edges);
      if (cancelled) return;

      setNodes(applyCurrentSceneToNodes(layouted.nodes, currentSceneId));
      setEdges(layouted.edges);

      window.requestAnimationFrame(() => {
        fitView({ padding: 0.18, duration: 220 });
      });
    }

    runLayout().catch((error) => {
      console.error("Failed to layout scene tree", error);
      setNodes(applyCurrentSceneToNodes(visibleGraph.nodes, currentSceneId));
      setEdges(visibleGraph.edges);
    });

    return () => {
      cancelled = true;
    };
  }, [visibleGraph, fitView]);

  useEffect(() => {
    setNodes((previous) => applyCurrentSceneToNodes(previous, currentSceneId));
  }, [currentSceneId]);

  const handleNodeClick: NodeMouseHandler<SceneTreeReactNode> = useCallback(
    (_event, node) => {
      onTeleportToScene(node.data.sceneId);
    },
    [onTeleportToScene],
  );

  const handleNodeMouseEnter: NodeMouseHandler<SceneTreeReactNode> = useCallback((event, node) => {
    if (!node.data.imageUrl) return;

    setPreview({
      imageUrl: node.data.imageUrl,
      label: node.data.label,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const handleNodeMouseMove: NodeMouseHandler<SceneTreeReactNode> = useCallback((event, node) => {
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

  if (tree.length === 0) {
    return null;
  }

  return (
    <section
      className={["scene-tree-nav", className].filter(Boolean).join(" ")}
      style={{ height }}
      aria-label="Scene tree map"
    >
      <div className="scene-tree-nav-header">
        <div>
          <h2>Scene Tree Map</h2>
          <div className="small">Drag the map to pan, scroll to zoom, click a node to teleport to that scene.</div>
        </div>
      </div>

      <div className="scene-tree-flow-shell">
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
          <Controls orientation="horizontal" position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>

      {preview ? (
        <div
          className="scene-tree-cursor-preview"
          style={{ transform: `translate(${preview.x + 14}px, ${preview.y + 14}px)` }}
        >
          <img src={preview.imageUrl} alt={preview.label} />
        </div>
      ) : null}
    </section>
  );
}
