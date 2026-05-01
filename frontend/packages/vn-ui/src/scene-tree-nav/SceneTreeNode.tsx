import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SceneTreeNodeData } from "./types";

export function SceneTreeNode({ data }: NodeProps) {
    const nodeData = data as SceneTreeNodeData;
    const hasChildren = nodeData.childCount > 0;

    return (
        <div
            className={[
                "scene-tree-node",
                nodeData.isCurrent ? "scene-tree-node-current" : "",
            ].join(" ")}
        >
            <Handle type="target" position={Position.Left} />

            <div className="scene-tree-node-content">
                {hasChildren ? (
                    <button
                        type="button"
                        className="scene-tree-collapse-button nodrag nopan"
                        title={nodeData.collapsed ? "Expand children" : "Hide children"}
                        onClick={(event) => {
                            event.stopPropagation();
                            nodeData.toggleCollapsed(nodeData.sceneId);
                        }}
                    >
                        {nodeData.collapsed ? "+" : "−"}
                    </button>
                ) : (
                    <span className="scene-tree-collapse-placeholder" />
                )}

                <span className="scene-tree-node-label">{nodeData.label}</span>

                {nodeData.hiddenDescendantCount > 0 && (
                    <span
                        className="scene-tree-hidden-count"
                        title={`${nodeData.hiddenDescendantCount} hidden descendants`}
                    >
                        {nodeData.hiddenDescendantCount}
                    </span>
                )}
            </div>

            <Handle type="source" position={Position.Right} />
        </div>
    );
}