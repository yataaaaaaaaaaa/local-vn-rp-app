import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SceneTreeReactNode } from "./types";

export function SceneTreeNode({ data }: NodeProps<SceneTreeReactNode>) {
  const hasChildren = data.childCount > 0;

  return (
    <div className={["scene-tree-node", data.isCurrent ? "scene-tree-node-current" : ""].filter(Boolean).join(" ")}>
      <Handle type="target" position={Position.Left} />

      <div className="scene-tree-node-content">
        {hasChildren ? (
          <button
            type="button"
            className="scene-tree-collapse-button nodrag nopan"
            title={data.collapsed ? "Expand children" : "Hide children"}
            onClick={(event) => {
              event.stopPropagation();
              data.toggleCollapsed(data.sceneId);
            }}
          >
            {data.collapsed ? "+" : "-"}
          </button>
        ) : (
          <span className="scene-tree-collapse-placeholder" />
        )}

        <span className="scene-tree-node-label" title={data.label}>{data.label}</span>

        {data.hiddenDescendantCount > 0 ? (
          <span className="scene-tree-hidden-count" title={`${data.hiddenDescendantCount} hidden descendants`}>
            {data.hiddenDescendantCount}
          </span>
        ) : null}

        {data.canDelete ? (
          <button
            type="button"
            className="scene-tree-delete-button nodrag nopan"
            title={hasChildren ? "Delete branch" : "Delete scene"}
            onClick={(event) => {
              event.stopPropagation();
              data.deleteNode(data.sceneId);
            }}
          >
            X
          </button>
        ) : null}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
