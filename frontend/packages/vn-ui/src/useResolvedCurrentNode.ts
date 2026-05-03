import { useMemo } from "react";
import {
  getParentId,
  resolveStoryNodeFields
} from "@local-vn/story-domain";
import { useStorySessionStore } from "@local-vn/stores";

export function useResolvedCurrentNode() {
  const tree = useStorySessionStore((state) => state.tree);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);

  return useMemo(
    () => resolveStoryNodeFields(tree, selectedNodeId),
    [tree, selectedNodeId]
  );
}

export function useResolvedParentNode() {
  const tree = useStorySessionStore((state) => state.tree);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);

  return useMemo(
    () => resolveStoryNodeFields(tree, getParentId(tree, selectedNodeId)),
    [tree, selectedNodeId]
  );
}
