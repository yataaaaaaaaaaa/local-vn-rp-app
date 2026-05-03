import {
  createStoryTreeBundle,
  createStoryWorkflowSnapshot,
  resolveStoryNodeFields,
  type StoryTreeBundle,
  type StoryWorkflowByNodeId
} from "@local-vn/story-domain";

import type { StoryPersistencePort } from "../ports";
import {
  createStorySessionStateFromBundle,
  type StorySessionState
} from "../session/storySessionState";

export interface CreateStoryInput {
  title: string;
  persistence: StoryPersistencePort;
  initialContext?: string;
}

export interface CreateStoryResult {
  bundle: StoryTreeBundle;
  state: StorySessionState;
}

export interface LoadStoryInput {
  storyId: string;
  persistence: StoryPersistencePort;
  previousState?: StorySessionState;
}

export interface LoadStoryResult {
  bundle: StoryTreeBundle | null;
  state: StorySessionState | null;
}

export interface SaveStoryInput {
  state: StorySessionState;
  persistence: StoryPersistencePort;
}

export interface SaveStoryResult {
  saved: boolean;
  bundle: StoryTreeBundle | null;
}

export async function createStory(
  input: CreateStoryInput
): Promise<CreateStoryResult> {
  const bundle = createStoryTreeBundle(input.title, undefined, {
    context: input.initialContext ?? ""
  });

  const rootFields = resolveStoryNodeFields(
    bundle.tree,
    bundle.manifest.root_node_id
  );

  const workflowByNodeId: StoryWorkflowByNodeId = {
    [bundle.manifest.root_node_id]: createStoryWorkflowSnapshot("context")
  };

  workflowByNodeId[bundle.manifest.root_node_id].stepStates.context = {
    status: "validated",
    generated: { context: rootFields.context },
    edited: { context: rootFields.context }
  };

  bundle.workflowByNodeId = workflowByNodeId;
  bundle.activeWorkflowStepId = "userText";

  await input.persistence.saveStory(bundle);

  return {
    bundle,
    state: createStorySessionStateFromBundle(bundle, {
      activeStepId: "userText",
      message: "Story created.",
      dirty: false
    })
  };
}

export async function loadStory(
  input: LoadStoryInput
): Promise<LoadStoryResult> {
  const bundle = await input.persistence.loadStory(input.storyId);

  if (!bundle) {
    return {
      bundle: null,
      state: input.previousState
        ? {
            ...input.previousState,
            busy: false,
            message: `Story not found: ${input.storyId}`
          }
        : null
    };
  }

  return {
    bundle,
    state: createStorySessionStateFromBundle(bundle, {
      backendConfig: input.previousState?.backendConfig ?? null,
      message: "Story loaded.",
      dirty: false,
      busy: false
    })
  };
}

export async function saveStory(
  input: SaveStoryInput
): Promise<SaveStoryResult> {
  if (!input.state.storyId || !input.state.manifest || !input.state.tree) {
    return {
      saved: false,
      bundle: null
    };
  }

  const bundle: StoryTreeBundle = {
    manifest: {
      ...input.state.manifest,
      updated_at: new Date().toISOString()
    },
    tree: input.state.tree,
    selectedNodeId:
      input.state.selectedNodeId ?? input.state.manifest.root_node_id,
    imageRefs: input.state.imageRefs,
    historyBack: input.state.historyBack,
    historyForward: input.state.historyForward,
    workflowByNodeId: input.state.workflowByNodeId,
    activeWorkflowStepId: input.state.activeStepId
  };

  await input.persistence.saveStory(bundle);

  return {
    saved: true,
    bundle
  };
}
