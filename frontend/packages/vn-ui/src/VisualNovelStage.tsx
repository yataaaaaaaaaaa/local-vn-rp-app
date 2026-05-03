import { useState } from "react";
import {
  getParentId,
  storyWorkflowStepIds,
  toFileUrl
} from "@local-vn/story-domain";
import {
  selectActiveWorkflowStep,
  selectCurrentNodeImageRef,
  selectParentNodeImageRef,
  useFrontendPreferencesStore,
  useRuntimeEventsStore,
  useStorySessionStore
} from "@local-vn/stores";

import {
  useResolvedCurrentNode,
  useResolvedParentNode
} from "./useResolvedCurrentNode";
import { KSamplerProgress } from "./workflow-tabs/KSamplerProgress";

const dialogueStepIndex = storyWorkflowStepIds.indexOf("dialogue");
const imageStepIndex = storyWorkflowStepIds.indexOf("image");

export function VisualNovelStage() {
  const node = useResolvedCurrentNode();
  const parentNode = useResolvedParentNode();
  const submitUserTextToStory = useStorySessionStore(
    (state) => state.submitUserText
  );
  const createChildFromCurrent = useStorySessionStore(
    (state) => state.createChildFromCurrent
  );
  const storyBusy = useStorySessionStore((state) => state.busy);
  const runningJob = useStorySessionStore((state) => state.runningJob);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const tree = useStorySessionStore((state) => state.tree);
  const activeStepId = useStorySessionStore(selectActiveWorkflowStep);
  const currentSceneImage = useStorySessionStore(selectCurrentNodeImageRef);
  const previousSceneImage = useStorySessionStore(selectParentNodeImageRef);
  const generateUserAnswerFromLlm = useFrontendPreferencesStore(
    (state) => state.generateUserAnswerFromLlm
  );
  const setGenerateUserAnswerFromLlm = useFrontendPreferencesStore(
    (state) => state.setGenerateUserAnswerFromLlm
  );

  const activeJobIdsByKind = useRuntimeEventsStore(
    (state) => state.activeJobIdsByKind
  );
  const latestJobIdsByKind = useRuntimeEventsStore(
    (state) => state.latestJobIdsByKind
  );
  const textByJobId = useRuntimeEventsStore((state) => state.textByJobId);
  const imageProgressByJobId = useRuntimeEventsStore(
    (state) => state.imageProgressByJobId
  );

  const [userText, setUserText] = useState("");

  const currentStepIndex = storyWorkflowStepIds.indexOf(activeStepId);
  const hasParentScene = Boolean(getParentId(tree, selectedNodeId));

  const llmStreamJobId =
    activeJobIdsByKind.llm ?? (storyBusy ? latestJobIdsByKind.llm : undefined);
  const streamedDialogue = llmStreamJobId
    ? textByJobId[llmStreamJobId] ?? ""
    : "";
  const isGeneratingCurrentDialogue =
    storyBusy &&
    runningJob?.nodeId === selectedNodeId &&
    runningJob?.stepId === "dialogue";
  const isGeneratingImage =
    storyBusy &&
    runningJob?.nodeId === selectedNodeId &&
    runningJob?.stepId === "image";

  const imageJobId =
    activeJobIdsByKind.image ?? (storyBusy ? latestJobIdsByKind.image : undefined);
  const imageProgress = imageJobId
    ? imageProgressByJobId[imageJobId] ?? null
    : null;

  const hasReachedDialogue =
    currentStepIndex >= dialogueStepIndex && Boolean(node.dialogue.trim());
  const isBeforeDialogue = currentStepIndex < dialogueStepIndex;
  const dialogueText = hasReachedDialogue
    ? node.dialogue
    : isGeneratingCurrentDialogue
      ? streamedDialogue || node.dialogue || parentNode.dialogue || "..."
      : isBeforeDialogue && hasParentScene
        ? parentNode.dialogue || parentNode.context || "..."
        : "...";

  const hasReachedImage =
    currentStepIndex >= imageStepIndex && Boolean(currentSceneImage);
  const displayImage = hasReachedImage
    ? currentSceneImage
    : isGeneratingImage || (isBeforeDialogue && hasParentScene)
      ? previousSceneImage
      : null;

  async function submitUserText() {
    const text = userText.trim();

    if (!text) {
      return;
    }

    if (generateUserAnswerFromLlm) {
      await submitUserTextToStory(text);
    } else {
      await createChildFromCurrent(text);
    }

    setUserText("");
  }

  return (
    <section className="vn-stage" aria-label="Visual novel stage">
      <div className="vn-image-pane">
        <div className="vn-image-box">
          {isGeneratingImage ? (
            <div className="vn-image-progress">
              <KSamplerProgress
                runningJob={runningJob}
                progressEvent={imageProgress}
                compact
              />
            </div>
          ) : null}

          {displayImage ? (
            <img
              src={toFileUrl(displayImage.image_path)}
              alt={`Generated scene ${displayImage.image_id}`}
            />
          ) : null}

          {!displayImage && !isGeneratingImage ? (
            <span className="small">No image linked to this node yet.</span>
          ) : null}
        </div>
      </div>

      <div className="vn-dialogue-pane">
        <div className="vn-dialogue-scroll">
          {dialogueText}
          {isGeneratingCurrentDialogue ? (
            <span className="stream-caret" aria-hidden="true">
              |
            </span>
          ) : null}
        </div>
      </div>

      <div className="vn-user-input-pane">
        <label className="vn-user-textarea">
          <span className="sr-only">User text for the next leaf</span>
          <textarea
            value={userText}
            onChange={(event) => setUserText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submitUserText();
              }
            }}
            placeholder="Player action or spoken line..."
          />
        </label>

        <div className="vn-actions vn-input-actions">
          <label
            className="vn-auto-generate-toggle"
            title="Continue the workflow with the LLM after adding this user text"
          >
            <input
              type="checkbox"
              checked={generateUserAnswerFromLlm}
              onChange={(event) =>
                setGenerateUserAnswerFromLlm(event.currentTarget.checked)
              }
            />
            <span>LLM</span>
          </label>

          <button
            disabled={storyBusy || !userText.trim()}
            onClick={() => void submitUserText()}
          >
            {storyBusy
              ? "Streaming..."
              : generateUserAnswerFromLlm
                ? "Send + Generate"
                : "Add Text"}
          </button>
        </div>
      </div>
    </section>
  );
}
