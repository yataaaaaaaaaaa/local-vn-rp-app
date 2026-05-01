import { useMemo } from "react";
import { resolveStoryNodeFields } from "@local-vn/story-tree";
import { getParentId, useStorySessionStore } from "@local-vn/stores";

export function useResolvedCurrentNode() {
  const tree = useStorySessionStore((state) => state.tree);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);

  return useMemo(() => resolveStoryNodeFields(tree, selectedNodeId), [tree, selectedNodeId]);
}

export function useResolvedParentNode() {
  const tree = useStorySessionStore((state) => state.tree);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);

  return useMemo(() => resolveStoryNodeFields(tree, getParentId(tree, selectedNodeId)), [tree, selectedNodeId]);
}
