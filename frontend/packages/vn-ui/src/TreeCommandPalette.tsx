import { useState } from "react";
import { useStorySessionStore } from "@local-vn/stores";

export function TreeCommandPalette() {
  const [title, setTitle] = useState("");
  const [userText, setUserText] = useState("");

  const busy = useStorySessionStore((state) => state.busy);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const createStory = useStorySessionStore((state) => state.createStory);
  const saveStory = useStorySessionStore((state) => state.saveStory);
  const createChildFromCurrent = useStorySessionStore(
    (state) => state.createChildFromCurrent
  );
  const createAlternateBranch = useStorySessionStore(
    (state) => state.createAlternateBranch
  );
  const duplicateCurrentBranch = useStorySessionStore(
    (state) => state.duplicateCurrentBranch
  );
  const deleteCurrentLeaf = useStorySessionStore(
    (state) => state.deleteCurrentLeaf
  );
  const submitUserText = useStorySessionStore((state) => state.submitUserText);
  const continueFrom = useStorySessionStore((state) => state.continueFrom);
  const activeStepId = useStorySessionStore((state) => state.activeStepId);

  async function createNewStory() {
    const nextTitle = title.trim() || "Untitled Story";
    await createStory(nextTitle);
    setTitle("");
  }

  async function submitText() {
    const nextUserText = userText.trim();

    if (!nextUserText) {
      return;
    }

    await submitUserText(nextUserText);
    setUserText("");
  }

  return (
    <section className="panel tree-command-palette">
      <div className="panel-header">
        <div>
          <h2>Story Commands</h2>
          <div className="small">
            Create stories, branch the current leaf, and resume the workflow.
          </div>
        </div>
      </div>

      <div className="grid two">
        <label>
          <span>New story title</span>
          <input
            value={title}
            disabled={busy}
            placeholder="Untitled Story"
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </label>

        <div className="button-row align-end">
          <button disabled={busy} onClick={() => void createNewStory()}>
            New story
          </button>
          <button disabled={busy} onClick={() => void saveStory()}>
            Save story
          </button>
        </div>
      </div>

      <div className="grid two">
        <label>
          <span>User text</span>
          <textarea
            value={userText}
            disabled={busy || !selectedNodeId}
            placeholder="Describe the player action or spoken line..."
            onChange={(event) => setUserText(event.currentTarget.value)}
          />
        </label>

        <div className="grid">
          <button
            disabled={busy || !selectedNodeId || !userText.trim()}
            onClick={() => void submitText()}
          >
            Submit user text
          </button>
          <button
            disabled={busy || !selectedNodeId}
            onClick={() => void createChildFromCurrent(userText.trim())}
          >
            Create child
          </button>
          <button
            disabled={busy || !selectedNodeId}
            onClick={() => void createAlternateBranch(userText.trim())}
          >
            Create alternate branch
          </button>
        </div>
      </div>

      <div className="button-row">
        <button
          disabled={busy || !selectedNodeId}
          onClick={() => void duplicateCurrentBranch()}
        >
          Duplicate branch
        </button>
        <button
          disabled={busy || !selectedNodeId}
          onClick={() => void deleteCurrentLeaf()}
        >
          Delete current leaf
        </button>
        <button
          disabled={busy || !selectedNodeId}
          onClick={() => void continueFrom(activeStepId, selectedNodeId)}
        >
          Continue workflow
        </button>
      </div>
    </section>
  );
}
