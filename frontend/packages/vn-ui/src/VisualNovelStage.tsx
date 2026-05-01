import { useMemo, useState } from "react";
import { parseImageRef, toFileUrl } from "@local-vn/story-tree";
import { useRuntimeEventsStore, useStorySessionStore } from "@local-vn/stores";
import { useResolvedCurrentNode, useResolvedParentNode } from "./useResolvedCurrentNode";

export function VisualNovelStage() {
  const manifest = useStorySessionStore((state) => state.manifest);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const node = useResolvedCurrentNode();
  const parentNode = useResolvedParentNode();
  const submitUserTextToStory = useStorySessionStore((state) => state.submitUserText);
  const storyBusy = useStorySessionStore((state) => state.busy);
  const runningJob = useStorySessionStore((state) => state.runningJob);
  const activeJobIdsByKind = useRuntimeEventsStore((state) => state.activeJobIdsByKind);
  const latestJobIdsByKind = useRuntimeEventsStore((state) => state.latestJobIdsByKind);
  const textByJobId = useRuntimeEventsStore((state) => state.textByJobId);
  const [userText, setUserText] = useState("");
  const image = useMemo(() => parseImageRef(node.imageRef), [node.imageRef]);
  const parentImage = useMemo(() => parseImageRef(parentNode.imageRef), [parentNode.imageRef]);
  const displayImage = image ?? parentImage;
  const llmStreamJobId = activeJobIdsByKind.llm ?? (storyBusy ? latestJobIdsByKind.llm : undefined);
  const streamedDialogue = llmStreamJobId ? textByJobId[llmStreamJobId] ?? "" : "";
  const activeDialogueStream = runningJob?.stepId === "dialogue" ? streamedDialogue : "";
  const imageIsGenerating = storyBusy && runningJob?.stepId === "image" && !image;

  async function submitUserText(generateDialogue: boolean) {
    const text = userText.trim();
    if (!text) return;
    await submitUserTextToStory(text, generateDialogue);
    setUserText("");
  }

  const fallbackDialogue = parentNode.dialogue || parentNode.context;
  const dialogueText = activeDialogueStream || node.dialogue || node.context || fallbackDialogue || "The story is ready. Enter a user action below to create the next leaf.";

  return (
    <section className="vn-stage" aria-label="Visual novel stage">
      <div className="vn-image-pane">
        <div className="vn-image-box">
          {displayImage ? <img src={toFileUrl(displayImage.image_path)} alt={`Generated scene ${displayImage.image_id}`} /> : <span className="small">No image linked to this node yet.</span>}
          {imageIsGenerating ? <span className="vn-image-loading">Generating image...</span> : null}
        </div>
      </div>

      <div className="vn-dialogue-pane">
        <div className="vn-meta">
          <span><strong>{manifest?.title ?? "Untitled Story"}</strong></span>
          <span>Node: <code>{selectedNodeId}</code></span>
          {displayImage ? <span>Image seed: <code>{displayImage.seed}</code>{image ? null : " (previous scene)"}</span> : null}
        </div>
        <div className="vn-dialogue-scroll">
          {dialogueText}{storyBusy && activeDialogueStream ? <span className="stream-caret" aria-hidden="true">|</span> : null}
        </div>
      </div>

      <div className="vn-user-input-pane">
        <label>
          <span>User text for the next leaf</span>
          <textarea value={userText} onChange={(event) => setUserText(event.target.value)} placeholder="Describe the player action or spoken line..." />
        </label>
        <div className="vn-actions">
          <button disabled={storyBusy || !userText.trim()} onClick={() => void submitUserText(false)}>Send user text</button>
          <button disabled={storyBusy || !userText.trim()} onClick={() => void submitUserText(true)}>{storyBusy ? "Streaming..." : "Send and generate dialogue"}</button>
        </div>
      </div>
    </section>
  );
}
