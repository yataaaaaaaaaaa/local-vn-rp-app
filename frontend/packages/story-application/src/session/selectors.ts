import {
  getParentId,
  parseImageRef,
  resolveStoryNodeFields,
  selectCanEditStep as selectDomainCanEditStep,
  selectCanGenerateStep as selectDomainCanGenerateStep,
  selectCanValidateStep as selectDomainCanValidateStep,
  selectActiveWorkflowStep as selectDomainActiveWorkflowStep,
  type ImageRef,
  type StoryNodeFields,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";

import type { StorySessionState } from "./storySessionState";

export function selectResolvedCurrent(
  state: Pick<StorySessionState, "tree" | "selectedNodeId">
): StoryNodeFields {
  return resolveStoryNodeFields(state.tree, state.selectedNodeId);
}

export function selectActiveWorkflowStep(
  state: Pick<
    StorySessionState,
    "workflowByNodeId" | "selectedNodeId" | "activeStepId"
  >
): StoryWorkflowStepId {
  return selectDomainActiveWorkflowStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    activeWorkflowStepId: state.activeStepId
  });
}

export function selectCanEditStep(
  state: Pick<StorySessionState, "workflowByNodeId" | "selectedNodeId">,
  stepId: StoryWorkflowStepId
): boolean {
  return selectDomainCanEditStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    stepId
  });
}

export function selectCanGenerateStep(
  state: Pick<
    StorySessionState,
    "workflowByNodeId" | "selectedNodeId" | "backendConfig"
  >,
  stepId: StoryWorkflowStepId
): boolean {
  return selectDomainCanGenerateStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    stepId,
    isBackendReady: Boolean(state.backendConfig)
  });
}

export function selectCanValidateStep(
  state: Pick<StorySessionState, "workflowByNodeId" | "selectedNodeId">,
  stepId: StoryWorkflowStepId
): boolean {
  return selectDomainCanValidateStep({
    workflowByNodeId: state.workflowByNodeId,
    currentNodeId: state.selectedNodeId,
    stepId
  });
}

export function selectCurrentNodeImageRef(
  state: Pick<
    StorySessionState,
    "tree" | "selectedNodeId" | "imageRefs" | "workflowByNodeId"
  >
): ImageRef | null {
  return findNodeImageRef({
    tree: state.tree,
    nodeId: state.selectedNodeId,
    imageRefs: state.imageRefs,
    workflowByNodeId: state.workflowByNodeId
  });
}

export function selectParentNodeImageRef(
  state: Pick<
    StorySessionState,
    "tree" | "selectedNodeId" | "imageRefs" | "workflowByNodeId"
  >
): ImageRef | null {
  return findNodeImageRef({
    tree: state.tree,
    nodeId: getParentId(state.tree, state.selectedNodeId),
    imageRefs: state.imageRefs,
    workflowByNodeId: state.workflowByNodeId
  });
}

export function selectDisplayedImageRef(
  state: Pick<
    StorySessionState,
    "tree" | "selectedNodeId" | "imageRefs" | "workflowByNodeId"
  >
): ImageRef | null {
  const selectedImage = findNearestImageRef({
    tree: state.tree,
    selectedNodeId: state.selectedNodeId,
    imageRefs: state.imageRefs,
    workflowByNodeId: state.workflowByNodeId
  });

  return selectedImage ?? selectLatestStoredImageRef(state.imageRefs);
}

function findNodeImageRef(input: {
  tree: StorySessionState["tree"];
  nodeId: string | null;
  imageRefs: StorySessionState["imageRefs"];
  workflowByNodeId: StorySessionState["workflowByNodeId"];
}): ImageRef | null {
  if (!input.nodeId) {
    return null;
  }

  return (
    parseWorkflowImageRef(input.workflowByNodeId[input.nodeId]) ??
    input.imageRefs[input.nodeId] ??
    parseStableImageRef(resolveStoryNodeFields(input.tree, input.nodeId).imageRef)
  );
}

function findNearestImageRef(input: {
  tree: StorySessionState["tree"];
  selectedNodeId: string | null;
  imageRefs: StorySessionState["imageRefs"];
  workflowByNodeId: StorySessionState["workflowByNodeId"];
}): ImageRef | null {
  let nodeId = input.selectedNodeId;

  while (nodeId) {
    const imageRef = findNodeImageRef({
      tree: input.tree,
      nodeId,
      imageRefs: input.imageRefs,
      workflowByNodeId: input.workflowByNodeId
    });

    if (imageRef) {
      return imageRef;
    }

    nodeId = getParentId(input.tree, nodeId);
  }

  return null;
}

function parseWorkflowImageRef(
  workflow: StorySessionState["workflowByNodeId"][string] | undefined
): ImageRef | null {
  const imageStep = workflow?.stepStates.image;

  if (!imageStep || imageStep.status === "generating") {
    return null;
  }

  const imageRefValue = imageStep.edited?.imageRef ?? imageStep.generated?.imageRef;
  return typeof imageRefValue === "string"
    ? parseStableImageRef(imageRefValue)
    : null;
}

function selectLatestStoredImageRef(
  imageRefs: StorySessionState["imageRefs"]
): ImageRef | null {
  let latest: ImageRef | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const imageRef of Object.values(imageRefs)) {
    const createdAt = Date.parse(imageRef.created_at);
    const sortKey = Number.isFinite(createdAt) ? createdAt : latestTime + 1;

    if (!latest || sortKey >= latestTime) {
      latest = imageRef;
      latestTime = sortKey;
    }
  }

  return latest;
}

const stableParsedImageRefs = new Map<string, ImageRef | null>();

function parseStableImageRef(value: string): ImageRef | null {
  if (!value.trim()) {
    return null;
  }

  if (!stableParsedImageRefs.has(value)) {
    stableParsedImageRefs.set(value, parseImageRef(value));
  }

  return stableParsedImageRefs.get(value) ?? null;
}
