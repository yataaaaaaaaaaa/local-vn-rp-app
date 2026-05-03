import { useMemo } from "react";
import { useStorySessionStore } from "@local-vn/stores";
import { SceneTreeNavigator } from "./SceneTreeNavigator";
import { storyTextTreeToSceneTree } from "./storyTreeAdapter";

export function StoryTreeSceneNavigator() {
  const manifest = useStorySessionStore((state) => state.manifest);
  const tree = useStorySessionStore((state) => state.tree);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const imageRefs = useStorySessionStore((state) => state.imageRefs);
  const selectNode = useStorySessionStore((state) => state.selectNode);

  const sceneTree = useMemo(
    () => storyTextTreeToSceneTree({
      tree,
      rootNodeId: manifest?.root_node_id,
      title: manifest?.title,
      imageRefs,
    }),
    [tree, manifest?.root_node_id, manifest?.title, imageRefs],
  );

  if (!tree || sceneTree.length === 0) {
    return null;
  }

  return (
    <SceneTreeNavigator
      tree={sceneTree}
      currentSceneId={selectedNodeId}
      onTeleportToScene={selectNode}
      height={280}
    />
  );
}
