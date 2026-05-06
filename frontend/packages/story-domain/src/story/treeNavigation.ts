import type { TextTree } from "@replayable-text-tree/core";

export interface TreeNodeRecord {
  parentId: string | null;
  childIds: string[];
}

export interface TreeWithNodeRecords extends TextTree {
  nodes?: Record<string, TreeNodeRecord>;
}

export function getNodeRecord(
  tree: TextTree | null | undefined,
  nodeId: string | null | undefined
): TreeNodeRecord | null {
  if (!tree || !nodeId) {
    return null;
  }

  const nodes = (tree as TreeWithNodeRecords).nodes;
  return nodes?.[nodeId] ?? null;
}

export function getChildIds(
  tree: TextTree | null | undefined,
  nodeId: string | null | undefined
): string[] {
  return getNodeRecord(tree, nodeId)?.childIds ?? [];
}

export function getParentId(
  tree: TextTree | null | undefined,
  nodeId: string | null | undefined
): string | null {
  return getNodeRecord(tree, nodeId)?.parentId ?? null;
}

export function getSiblingIds(
  tree: TextTree | null | undefined,
  nodeId: string | null | undefined
): string[] {
  const parentId = getParentId(tree, nodeId);

  if (!parentId) {
    return [];
  }

  return getChildIds(tree, parentId);
}

export function getStoryNodeIds(
  tree: TextTree | null | undefined
): string[] {
  const nodes = (tree as TreeWithNodeRecords | null | undefined)?.nodes;

  return nodes ? Object.keys(nodes) : [];
}
