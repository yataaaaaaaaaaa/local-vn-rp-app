import type { TextTree } from "@replayable-text-tree/core";

type UnknownNode = Record<string, unknown>;

export function getNodeRecord(tree: TextTree | null, nodeId: string | null): UnknownNode | null {
  if (!tree || !nodeId) return null;
  const rawTree = tree as Record<string, unknown>;
  const nodes = rawTree.nodes;
  if (nodes && typeof nodes === "object" && nodeId in nodes) {
    const node = (nodes as Record<string, unknown>)[nodeId];
    return isObject(node) ? node : null;
  }
  return null;
}

export function getChildIds(tree: TextTree | null, nodeId: string | null): string[] {
  const node = getNodeRecord(tree, nodeId);
  if (!node) return [];
  const raw = node.childIds ?? node.children ?? node.child_ids;
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.keys(raw);
  return [];
}

export function getParentId(tree: TextTree | null, nodeId: string | null): string | null {
  const node = getNodeRecord(tree, nodeId);
  if (node) {
    const parent = node.parentId ?? node.parent_id ?? node.parent;
    if (typeof parent === "string") return parent;
  }
  if (!tree || !nodeId) return null;
  const rawTree = tree as Record<string, unknown>;
  const nodes = rawTree.nodes;
  if (!nodes || typeof nodes !== "object") return null;
  for (const [candidateId, candidateNode] of Object.entries(nodes as Record<string, unknown>)) {
    if (isObject(candidateNode) && getChildIds(tree, candidateId).includes(nodeId)) return candidateId;
  }
  return null;
}

export function getSiblingIds(tree: TextTree | null, nodeId: string | null): string[] {
  const parentId = getParentId(tree, nodeId);
  return parentId ? getChildIds(tree, parentId) : [];
}

function isObject(value: unknown): value is UnknownNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
