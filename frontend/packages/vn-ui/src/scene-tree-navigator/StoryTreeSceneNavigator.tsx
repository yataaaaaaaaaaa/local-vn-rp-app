import { useMemo } from "react";
import { useStorySessionStore } from "@local-vn/stores";

import { SceneTreeNavigator } from "./SceneTreeNavigator";
import { storyTextTreeToSceneTree } from "./storyTreeAdapter";

export interface StoryTreeSceneNavigatorProps {
  className?: string;
}

export function StoryTreeSceneNavigator({
  className
}: StoryTreeSceneNavigatorProps) {
  const tree = useStorySessionStore((state) => state.tree);
  const manifest = useStorySessionStore((state) => state.manifest);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const imageRefs = useStorySessionStore((state) => state.imageRefs);
  const selectNode = useStorySessionStore((state) => state.selectNode);
  const createChildFromCurrent = useStorySessionStore(
    (state) => state.createChildFromCurrent
  );
  const createAlternateBranch = useStorySessionStore(
    (state) => state.createAlternateBranch
  );
  const duplicateCurrentBranch = useStorySessionStore(
    (state) => state.duplicateCurrentBranch
  );
  const deleteCurrentLeaf = useStorySessionStore(
    (state) => state.deleteCurrentLeaf
  );

  const nodes = useMemo(
    () =>
      storyTextTreeToSceneTree({
        tree,
        rootNodeId: manifest?.root_node_id,
        title: manifest?.title,
        imageRefs
      }),
    [tree, manifest?.root_node_id, manifest?.title, imageRefs]
  );

  return (
    <div className={className}>
      <div className="scene-tree-toolbar">
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => void createChildFromCurrent()}
        >
          Add child
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => void createAlternateBranch()}
        >
          Add branch
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => void duplicateCurrentBranch()}
        >
          Duplicate
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => void deleteCurrentLeaf()}
        >
          Delete leaf
        </button>
      </div>

      <SceneTreeNavigator
        tree={nodes}
        currentSceneId={selectedNodeId}
        onTeleportToScene={selectNode}
        onDeleteScene={(nodeId) => {
          selectNode(nodeId);
          void deleteCurrentLeaf();
        }}
      />
    </div>
  );
}
