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

const userTextStepIndex = storyWorkflowStepIds.indexOf("userText");
const dialogueStepIndex = storyWorkflowStepIds.indexOf("dialogue");
const imageStepIndex = storyWorkflowStepIds.indexOf("image");

export function VisualNovelStage() {
  const node = useResolvedCurrentNode();
  const parentNode = useResolvedParentNode();
  const submitUserTextToStory = useStorySessionStore(
    (state) => state.submitUserText
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
  const streamedUserText = llmStreamJobId
    ? textByJobId[llmStreamJobId] ?? ""
    : "";
  const isGeneratingUserText =
    storyBusy &&
    runningJob?.nodeId === selectedNodeId &&
    runningJob?.stepId === "userText";
  const isGeneratingCurrentDialogue =
    storyBusy &&
    runningJob?.nodeId === selectedNodeId &&
    runningJob?.stepId === "dialogue";
  const isGeneratingCurrentScene =
    storyBusy && runningJob?.nodeId === selectedNodeId;
  const runningStepIndex = isGeneratingCurrentScene
    ? storyWorkflowStepIds.indexOf(runningJob.stepId)
    : -1;
  const isGeneratingImage =
    storyBusy &&
    runningJob?.nodeId === selectedNodeId &&
    runningJob?.stepId === "image";
  const isGeneratingAfterImage = runningStepIndex > imageStepIndex;
  const isGeneratingBeforeImage =
    isGeneratingCurrentScene &&
    runningStepIndex >= 0 &&
    runningStepIndex < imageStepIndex;
  const isGeneratingAfterUserText = runningStepIndex > userTextStepIndex;

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

  const isCurrentStepUserText = currentStepIndex === userTextStepIndex;
  const isAfterUserTextStep =
    currentStepIndex > userTextStepIndex || isGeneratingAfterUserText;
  const isBeforeUserTextStep =
    currentStepIndex < userTextStepIndex && !isGeneratingUserText;
  const displayedAutoUserText = isBeforeUserTextStep
    ? parentNode.userText
    : isAfterUserTextStep
    ? node.userText
    : generateUserAnswerFromLlm && (isCurrentStepUserText || isGeneratingUserText)
      ? streamedUserText || node.userText
      : "";
  const userTextAreaLocked = generateUserAnswerFromLlm || isGeneratingUserText;
  const userTextAreaValue = userTextAreaLocked
    ? displayedAutoUserText
    : userText;

  const hasReachedImage =
    currentStepIndex >= imageStepIndex && Boolean(currentSceneImage);
  const displayImage = isGeneratingAfterImage
    ? currentSceneImage
    : isGeneratingImage
      ? previousSceneImage
      : isGeneratingBeforeImage
        ? hasParentScene
          ? previousSceneImage
          : null
        : hasReachedImage
          ? currentSceneImage
          : hasParentScene
            ? previousSceneImage
            : null;

  async function submitUserText() {
    const text = userText.trim();

    if (!text) {
      return;
    }

    await submitUserTextToStory(text);
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
            value={userTextAreaValue}
            onChange={(event) => {
              if (!userTextAreaLocked) {
                setUserText(event.target.value);
              }
            }}
            onKeyDown={(event) => {
              if (userTextAreaLocked) {
                event.preventDefault();
                return;
              }

              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submitUserText();
              }
            }}
            readOnly={userTextAreaLocked}
            placeholder={
              isGeneratingUserText
                ? "Generating player text..."
                : generateUserAnswerFromLlm
                  ? "LLM player text enabled"
                : "Player action or spoken line..."
            }
          />
        </label>

        <div className="vn-actions vn-input-actions">
          <label
            className="vn-auto-generate-toggle"
            title="When the workflow reaches player text, let the LLM generate it instead of pausing for manual input"
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
            disabled={storyBusy || generateUserAnswerFromLlm || !userText.trim()}
            onClick={() => void submitUserText()}
          >
            {storyBusy ? "Streaming..." : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
