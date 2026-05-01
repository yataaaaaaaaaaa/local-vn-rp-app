import type { Edge, Node } from "@xyflow/react";

export type SceneTreeInputNode = {
    id: string;
    label: string;
    imageUrl?: string | null;
    children?: SceneTreeInputNode[];
};

export type SceneTreeNodeData = {
    sceneId: string;
    label: string;
    imageUrl?: string;
    childCount: number;
    collapsed: boolean;
    hiddenDescendantCount: number;
    isCurrent: boolean;
    toggleCollapsed: (sceneId: string) => void;
};

export type SceneTreeReactNode = Node<SceneTreeNodeData, "sceneTreeNode">;

export type SceneTreeGraph = {
    nodes: SceneTreeReactNode[];
    edges: Edge[];
};