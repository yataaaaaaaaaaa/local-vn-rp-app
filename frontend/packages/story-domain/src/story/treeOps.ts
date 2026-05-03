import {
  addChildNode,
  createTextTree,
  editNodeField,
  resolveNode,
  serializeTextTree,
  validateTextTree
} from "@replayable-text-tree/core";
import type { TextTree } from "@replayable-text-tree/core";

import type {
  ImageRef,
  StoryManifest,
  StoryNodeFieldKey,
  StoryNodeFields,
  StorySnapshot
} from "./types";
import {
  createEmptyStoryNodeFields,
  normalizeStoryNodeFields,
  storyNodeFieldKeys
} from "./nodeFields";
import { storyTreeSchema } from "./treeSchema";
import { stringifyImageRef } from "./imageRefs";

export interface StoryTreeBundle {
  manifest: StoryManifest;
  tree: TextTree;
  selectedNodeId: string;
  imageRefs: Record<string, ImageRef>;
  historyBack?: string[];
  historyForward?: string[];
  workflowByNodeId?: unknown;
  activeWorkflowStepId?: string;
}

export function createStoryTreeBundle(
  title: string,
  storyId = createStoryId(title),
  initialFields: Partial<StoryNodeFields> = {}
): StoryTreeBundle {
  const createdAt = new Date().toISOString();
  const rootFields = createEmptyStoryNodeFields({
    context: title ? `Story: ${title}` : "",
    ...initialFields
  });
  const tree = createTextTree(
    storyTreeSchema,
    rootFields as unknown as Record<string, string>
  );
  const rootId = tree.rootId;

  return {
    manifest: {
      story_id: storyId,
      title: title || "Untitled Story",
      created_at: createdAt,
      updated_at: createdAt,
      root_node_id: rootId
    },
    tree,
    selectedNodeId: rootId,
    imageRefs: {},
    historyBack: [],
    historyForward: [],
    workflowByNodeId: {},
    activeWorkflowStepId: undefined
  };
}

export function createStoryId(title: string): string {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "story";

  return `${stem}_${Date.now().toString(36)}`;
}

export function resolveStoryNodeFields(
  tree: TextTree | null,
  nodeId: string | null
): StoryNodeFields {
  if (!tree || !nodeId) {
    return createEmptyStoryNodeFields();
  }

  const resolved = resolveNode(tree, nodeId).fields;
  return normalizeStoryNodeFields(
    resolved as Partial<Record<StoryNodeFieldKey, string>>
  );
}

export function editStoryNodeField(
  tree: TextTree,
  nodeId: string,
  field: StoryNodeFieldKey,
  value: string
): TextTree {
  return editNodeField(tree, nodeId, field, value);
}

export function editStoryNodeFields(
  tree: TextTree,
  nodeId: string,
  fields: Partial<Record<StoryNodeFieldKey, string>>
): TextTree {
  let nextTree = tree;

  for (const [field, value] of Object.entries(fields) as Array<
    [StoryNodeFieldKey, string]
  >) {
    nextTree = editStoryNodeField(nextTree, nodeId, field, value);
  }

  return nextTree;
}

export function addStoryChildNode(
  tree: TextTree,
  parentId: string,
  initialFields: Partial<StoryNodeFields>,
  options: { nodeId?: string } = {}
): { tree: TextTree; nodeId: string } {
  return addChildNode(
    tree,
    parentId,
    createEmptyStoryNodeFields(initialFields) as unknown as Record<string, string>,
    options
  );
}

export function deleteStorySubtree(
  tree: TextTree,
  nodeId: string
): { tree: TextTree; parentId: string; deletedNodeIds: string[] } {
  const sourceTree = tree as TextTreeWithNodes;
  const sourceNode = sourceTree.nodes?.[nodeId];

  if (!sourceNode) {
    throw new Error(`Story node does not exist: ${nodeId}`);
  }

  if (nodeId === sourceTree.rootId) {
    throw new Error("The root scene cannot be deleted.");
  }

  if (!sourceNode.parentId) {
    throw new Error(`Story node has no parent: ${nodeId}`);
  }

  const nextTree = JSON.parse(JSON.stringify(tree)) as TextTreeWithNodes;
  const deletedNodeIds: string[] = [];

  function collectDeleted(currentNodeId: string): void {
    const currentNode = nextTree.nodes[currentNodeId];

    if (!currentNode) {
      return;
    }

    deletedNodeIds.push(currentNodeId);

    for (const childId of currentNode.childIds) {
      collectDeleted(childId);
    }
  }

  collectDeleted(nodeId);

  const parentId = sourceNode.parentId;
  const parent = nextTree.nodes[parentId];

  if (!parent) {
    throw new Error(`Parent story node does not exist: ${parentId}`);
  }

  const now = new Date().toISOString();
  parent.childIds = parent.childIds.filter((childId) => childId !== nodeId);
  parent.updatedAt = now;

  for (const deletedNodeId of deletedNodeIds) {
    delete nextTree.nodes[deletedNodeId];
  }

  nextTree.updatedAt = now;
  validateTextTree(nextTree);

  return { tree: nextTree, parentId, deletedNodeIds };
}

export function attachImageRefToNode(
  tree: TextTree,
  nodeId: string,
  ref: ImageRef
): TextTree {
  return editStoryNodeField(tree, nodeId, "imageRef", stringifyImageRef(ref));
}

export function toStorySnapshot(bundle: StoryTreeBundle): StorySnapshot {
  return {
    manifest: bundle.manifest,
    tree: serializeTextTree(bundle.tree),
    selected_node_id: bundle.selectedNodeId,
    image_refs: bundle.imageRefs
  };
}

export function fieldListForTab(tab: string): StoryNodeFieldKey[] {
  switch (tab) {
    case "Context":
      return ["context"];
    case "User Text":
      return ["userText"];
    case "Dialogue":
      return ["dialogue"];
    case "Visual Description":
      return ["visualDescription"];
    case "Resolver Text":
      return ["resolverText"];
    case "Tags":
      return ["selectedTags"];
    case "DanBot":
      return ["danbotTags"];
    case "Prompt":
      return ["positivePrompt", "negativePrompt"];
    case "Image":
      return ["imageRef"];
    default:
      return [...storyNodeFieldKeys];
  }
}

type TextTreeWithNodes = TextTree & {
  rootId: string;
  updatedAt: string;
  nodes: Record<
    string,
    {
      parentId: string | null;
      childIds: string[];
      updatedAt: string;
    }
  >;
};
