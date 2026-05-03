import type { TextTree } from "@replayable-text-tree/core";
import {
  getChildIds,
  parseImageRef,
  resolveStoryNodeFields,
  toFileUrl,
  type ImageRef
} from "@local-vn/story-domain";
import type { SceneTreeInputNode } from "./types";

export function storyTextTreeToSceneTree(params: {
  tree: TextTree | null;
  rootNodeId?: string | null;
  title?: string | null;
  imageRefs?: Record<string, ImageRef>;
}): SceneTreeInputNode[] {
  const { tree, title, imageRefs = {} } = params;
  const rootNodeId = params.rootNodeId ?? rootIdFromTree(tree);

  if (!tree || !rootNodeId) {
    return [];
  }

  const visited = new Set<string>();

  function buildNode(nodeId: string, depth: number): SceneTreeInputNode {
    if (visited.has(nodeId)) {
      return {
        id: `${nodeId}__cycle_${depth}`,
        label: `${nodeId} loop`,
        children: []
      };
    }

    visited.add(nodeId);

    const fields = resolveStoryNodeFields(tree, nodeId);
    const parsedImageRef = parseImageRef(fields.imageRef) ?? imageRefs[nodeId] ?? null;
    const childIds = getChildIds(tree, nodeId);

    const sceneNode: SceneTreeInputNode = {
      id: nodeId,
      label: labelForNode({ nodeId, fields, title, isRoot: nodeId === rootNodeId }),
      imageUrl: parsedImageRef ? toFileUrl(parsedImageRef.image_path) : undefined,
      children: childIds.map((childId) => buildNode(childId, depth + 1))
    };

    visited.delete(nodeId);
    return sceneNode;
  }

  return [buildNode(rootNodeId, 0)];
}

function rootIdFromTree(tree: TextTree | null): string | null {
  if (!tree) return null;
  const raw = tree as Record<string, unknown>;
  return typeof raw.rootId === "string" ? raw.rootId : null;
}

function labelForNode(params: {
  nodeId: string;
  fields: { context: string; userText: string; dialogue: string };
  title?: string | null;
  isRoot: boolean;
}): string {
  const { nodeId, fields, title, isRoot } = params;

  if (isRoot && title?.trim()) return compactLabel(title);

  return (
    compactLabel(fields.userText) ||
    compactLabel(fields.dialogue) ||
    compactLabel(fields.context) ||
    nodeId
  );
}

function compactLabel(value: string | null | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "";
  return normalized.length > 54 ? `${normalized.slice(0, 51)}...` : normalized;
}
