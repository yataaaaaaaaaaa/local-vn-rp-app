import { useMemo, useState } from "react";
import { parseImageRef, toFileUrl } from "@local-vn/story-domain";
import { useRuntimeEventsStore, useStorySessionStore } from "@local-vn/stores";

import {
  useResolvedCurrentNode,
  useResolvedParentNode
} from "./useResolvedCurrentNode";

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
  const activeJobIdsByKind = useRuntimeEventsStore(
    (state) => state.activeJobIdsByKind
  );
  const latestJobIdsByKind = useRuntimeEventsStore(
    (state) => state.latestJobIdsByKind
  );
  const textByJobId = useRuntimeEventsStore((state) => state.textByJobId);

  const [userText, setUserText] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);

  const image = useMemo(() => parseImageRef(node.imageRef), [node.imageRef]);
  const parentImage = useMemo(
    () => parseImageRef(parentNode.imageRef),
    [parentNode.imageRef]
  );
  const displayImage = image ?? parentImage;

  const llmStreamJobId =
    activeJobIdsByKind.llm ?? (storyBusy ? latestJobIdsByKind.llm : undefined);
  const streamedDialogue = llmStreamJobId
    ? textByJobId[llmStreamJobId] ?? ""
    : "";
  const activeDialogueStream =
    runningJob?.stepId === "dialogue" ? streamedDialogue : "";
  const imageIsGenerating =
    storyBusy && runningJob?.stepId === "image" && !image;

  async function submitUserText() {
    const text = userText.trim();

    if (!text) {
      return;
    }

    if (autoGenerate) {
      await submitUserTextToStory(text);
    } else {
      await createChildFromCurrent(text);
    }

    setUserText("");
  }

  const fallbackDialogue = parentNode.dialogue || parentNode.context;
  const dialogueText =
    activeDialogueStream ||
    node.dialogue ||
    node.context ||
    fallbackDialogue ||
    "The story is ready. Enter the player action or line below.";

  return (
    <section className="vn-stage" aria-label="Visual novel stage">
      <div className="vn-image-pane">
        <div className="vn-image-box">
          {displayImage ? (
            <img
              src={toFileUrl(displayImage.image_path)}
              alt={`Generated scene ${displayImage.image_id}`}
            />
          ) : (
            <span className="small">No image linked to this node yet.</span>
          )}
          {imageIsGenerating ? (
            <span className="vn-image-loading">Generating image...</span>
          ) : null}
        </div>
      </div>

      <div className="vn-dialogue-pane">
        <div className="vn-dialogue-scroll">
          {dialogueText}
          {storyBusy && activeDialogueStream ? (
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
          <label className="vn-auto-generate-toggle" title="Continue the workflow with the LLM after adding this user text">
            <input
              type="checkbox"
              checked={autoGenerate}
              onChange={(event) => setAutoGenerate(event.currentTarget.checked)}
            />
            <span>LLM</span>
          </label>

          <button
            disabled={storyBusy || !userText.trim()}
            onClick={() => void submitUserText()}
          >
            {storyBusy ? "Streaming..." : autoGenerate ? "Send + Generate" : "Add Text"}
          </button>
        </div>
      </div>
    </section>
  );
}
