import { useMemo, useState, type KeyboardEvent } from "react";

import { useRuntimeEventsStore, useStorySessionStore } from "@local-vn/stores";
import { parseImageRef, toFileUrl } from "@local-vn/story-tree";

import { useResolvedCurrentNode, useResolvedParentNode } from "./useResolvedCurrentNode";

export function VisualNovelStageTopPanel() {
 const node = useResolvedCurrentNode();
 const parentNode = useResolvedParentNode();

 const submitUserTextToStory = useStorySessionStore((state) => state.submitUserText);
 const regenerateWorkflowStep = useStorySessionStore((state) => state.regenerateStep);
 const storyBusy = useStorySessionStore((state) => state.busy);
 const dirty = useStorySessionStore((state) => state.dirty);
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

 async function submitUserText(generateDialogue = true) {
  const text = userText.trim();

  if (!text || storyBusy) return;

  await submitUserTextToStory(text, generateDialogue);
  setUserText("");
 }

 async function autoAnswer() {
  if (storyBusy) return;

  await regenerateWorkflowStep("userText");
 }

 function handleUserTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return;

  event.preventDefault();
  void submitUserText(true);
 }

 function scrollToLegacyTools() {
  const panel = document.querySelector(".vn-player-panel");

  panel?.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "start" });
 }

 const fallbackDialogue = parentNode.dialogue || parentNode.context;
 const dialogueText =
  activeDialogueStream ||
  node.dialogue ||
  node.context ||
  fallbackDialogue ||
  "The story is ready. Type a player action below, then press Enter.";

 const speakerMatch = dialogueText.match(/^([^:\n]{1,40}):\s+/);
 const speakerName = speakerMatch?.[1]?.trim() || "Narrator";
 const dialogueBody = speakerMatch ? dialogueText.slice(speakerMatch[0].length) : dialogueText;

 return (
  <section className="vn-player-panel" aria-label="Visual novel game panel">
   <header className="vn-player-topbar" aria-label="Game controls">
    <span className={dirty ? "vn-player-autosave is-saving" : "vn-player-autosave"}>
     {dirty ? "Autosaving..." : "Autosaved ✓"}
    </span>

    <div className="vn-player-topbar-actions">
     <button type="button" className="vn-player-control" onClick={scrollToLegacyTools}>
      Log
     </button>
     <button type="button" className="vn-player-control" disabled={storyBusy} onClick={() => void autoAnswer()}>
      {storyBusy && runningJob?.stepId === "userText" ? "Auto answering..." : "Auto Answer"}
     </button>
    </div>
   </header>

   <div className="vn-player-image-frame">
    <div className="vn-player-image-box">
     {displayImage ? (
      <img src={toFileUrl(displayImage.image_path)} alt={`Generated scene ${displayImage.image_id}`} />
     ) : (
      <span className="small">No image linked to this node yet.</span>
     )}

     {imageIsGenerating ? <span className="vn-player-image-loading">Generating image...</span> : null}
    </div>
   </div>

   <section className="vn-player-dialogue" aria-label="Current dialogue">
    <div className="vn-player-nameplate">{speakerName}</div>
    <div className="vn-player-dialogue-text">
     {dialogueBody}
     {storyBusy && activeDialogueStream ? <span className="stream-caret" aria-hidden="true">|</span> : null}
    </div>
    <span className="vn-player-continue" aria-hidden="true">▶</span>
   </section>

   <label className="vn-player-input">
    <span className="sr-only">Type your answer, then press Enter to validate. Use Shift+Enter for a newline.</span>
    <textarea
     value={userText}
     disabled={storyBusy}
     onChange={(event) => setUserText(event.target.value)}
    onKeyDown={handleUserTextKeyDown}
    placeholder="Type your answer here..."
   />
    <span className="vn-player-enter-hint" aria-hidden="true">↵</span>
   </label>
  </section>
 );
}
