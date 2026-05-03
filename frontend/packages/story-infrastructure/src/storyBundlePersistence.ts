import {
  parseTextTree,
  serializeTextTree
} from "@replayable-text-tree/core";
import type { FilePersistenceApi } from "@local-vn/config";
import {
  storyFile,
  storyNodeFile,
  storyNodesDirectory,
  storyStateFile,
  storyTreeFile
} from "@local-vn/config";
import type {
  ImageRef,
  StoryManifest,
  StoryTreeBundle
} from "@local-vn/story-domain";
import { resolveStoryNodeFields } from "@local-vn/story-domain";

export type { StoryTreeBundle } from "@local-vn/story-domain";

export interface PersistedStoryState {
  selected_story_id?: string;
  selected_node_id?: string;
  image_refs?: Record<string, ImageRef>;
  history_back?: string[];
  history_forward?: string[];
  workflow_by_node_id?: unknown;
  active_workflow_step_id?: string;
}

export async function loadStoryBundle(
  api: FilePersistenceApi,
  storyId: string
): Promise<StoryTreeBundle | null> {
  const manifest = await api.readJson<StoryManifest | null>(
    storyFile(storyId),
    null
  );
  const treeJson = await api.readJson<unknown | null>(
    storyTreeFile(storyId),
    null
  );
  const state = await api.readJson<PersistedStoryState | null>(
    storyStateFile(storyId),
    null
  );

  if (!manifest || !treeJson) {
    return null;
  }

  return {
    manifest,
    tree: parseTextTree(treeJson),
    selectedNodeId: state?.selected_node_id ?? manifest.root_node_id,
    imageRefs: state?.image_refs ?? {},
    historyBack: state?.history_back ?? [],
    historyForward: state?.history_forward ?? [],
    workflowByNodeId: state?.workflow_by_node_id ?? {},
    activeWorkflowStepId: state?.active_workflow_step_id
  };
}

export async function saveStoryBundle(
  api: FilePersistenceApi,
  bundle: StoryTreeBundle
): Promise<void> {
  const storyId = bundle.manifest.story_id;
  const updatedManifest: StoryManifest = {
    ...bundle.manifest,
    updated_at: new Date().toISOString()
  };

  await api.writeJson(storyFile(storyId), updatedManifest);
  await api.writeJson(storyTreeFile(storyId), serializeTextTree(bundle.tree));
  await api.writeJson(storyStateFile(storyId), {
    selected_story_id: storyId,
    selected_node_id: bundle.selectedNodeId,
    image_refs: bundle.imageRefs,
    history_back: bundle.historyBack ?? [],
    history_forward: bundle.historyForward ?? [],
    workflow_by_node_id: bundle.workflowByNodeId ?? {},
    active_workflow_step_id: bundle.activeWorkflowStepId
  });

  await api.ensureDir(storyNodesDirectory(storyId));
  await api.writeJson(
    storyNodeFile(storyId, bundle.selectedNodeId),
    resolveStoryNodeFields(bundle.tree, bundle.selectedNodeId)
  );
}
