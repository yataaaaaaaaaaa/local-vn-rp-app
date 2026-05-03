import { useEffect, useState } from "react";
import {
  useBackendClientStore,
  useStoryLibraryStore,
  useStorySessionStore
} from "@local-vn/stores";
import { VisualNovelStage } from "./VisualNovelStage";

export function VisualNovelStageTopPanel() {
  const manifest = useStorySessionStore((state) => state.manifest);
  const storyId = useStorySessionStore((state) => state.storyId);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const busy = useStorySessionStore((state) => state.busy);
  const dirty = useStorySessionStore((state) => state.dirty);
  const message = useStorySessionStore((state) => state.message);
  const saveStory = useStorySessionStore((state) => state.saveStory);
  const loadStory = useStorySessionStore((state) => state.loadStory);
  const renameStory = useStorySessionStore((state) => state.renameStory);
  const goBack = useStorySessionStore((state) => state.goBack);
  const goForward = useStorySessionStore((state) => state.goForward);
  const goToParent = useStorySessionStore((state) => state.goToParent);
  const goToFirstChild = useStorySessionStore((state) => state.goToFirstChild);
  const goToPreviousSibling = useStorySessionStore(
    (state) => state.goToPreviousSibling
  );
  const goToNextSibling = useStorySessionStore(
    (state) => state.goToNextSibling
  );
  const cancelAll = useStorySessionStore((state) => state.cancelAll);

  const status = useBackendClientStore((state) => state.status);
  const refreshStatus = useBackendClientStore((state) => state.refreshStatus);

  const stories = useStoryLibraryStore((state) => state.stories);
  const storiesLoading = useStoryLibraryStore((state) => state.loading);
  const storiesError = useStoryLibraryStore((state) => state.error);
  const refreshStories = useStoryLibraryStore((state) => state.refresh);

  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(manifest?.title ?? "");

  useEffect(() => {
    setRenameValue(manifest?.title ?? "");
  }, [manifest?.title]);

  async function openStoryPicker(): Promise<void> {
    setStoryPickerOpen((open) => !open);
    setRenameOpen(false);
    await refreshStories();
  }

  async function selectStory(nextStoryId: string): Promise<void> {
    if (nextStoryId === storyId) {
      setStoryPickerOpen(false);
      return;
    }

    if (dirty) {
      await saveStory();
    }

    await loadStory(nextStoryId);
    setStoryPickerOpen(false);
  }

  async function submitRename(): Promise<void> {
    const title = renameValue.trim();

    if (!title || title === manifest?.title) {
      setRenameOpen(false);
      return;
    }

    await renameStory(title);
    setRenameOpen(false);
    await refreshStories();
  }

  return (
    <section className="visual-novel-stage-panel">
      <header className="vn-menu-bar" aria-label="Game controls and session info">
        <nav className="vn-menu-actions" aria-label="Story navigation">
          <button disabled={busy} onClick={() => goBack()}>
            Back
          </button>
          <button disabled={busy} onClick={() => goForward()}>
            Forward
          </button>
          <button disabled={busy} onClick={() => goToParent()}>
            Parent
          </button>
          <button disabled={busy} onClick={() => goToFirstChild()}>
            Child
          </button>
          <button disabled={busy} onClick={() => goToPreviousSibling()}>
            Prev
          </button>
          <button disabled={busy} onClick={() => goToNextSibling()}>
            Next
          </button>
          <button disabled={!dirty || busy} onClick={() => void saveStory()}>
            Save
          </button>
          <button disabled={busy} onClick={() => void openStoryPicker()}>
            Load
          </button>
          <button
            disabled={!manifest || busy}
            onClick={() => {
              setRenameOpen((open) => !open);
              setStoryPickerOpen(false);
            }}
          >
            Rename
          </button>
          <button disabled={!busy} onClick={() => void cancelAll()}>
            Cancel
          </button>
          <button onClick={() => void refreshStatus()}>Runtime</button>
        </nav>

        <div className="vn-session-info" title={message ?? undefined}>
          <strong>{manifest?.title ?? "Local VN/RP"}</strong>
          <span>
            Story <code>{storyId ?? "none"}</code>
          </span>
          <span>
            Node <code>{selectedNodeId ?? "none"}</code>
          </span>
          <span className={busy ? "status-warn" : "status-ok"}>
            {busy ? "busy" : "idle"}
          </span>
          <span className={dirty ? "status-warn" : "status-ok"}>
            {dirty ? "unsaved" : "saved"}
          </span>
          <span>
            LLM <code>{status?.loaded_llm ? "on" : "none"}</code>
          </span>
          <span>
            Img <code>{status?.loaded_image_model ? "on" : "none"}</code>
          </span>
          {message ? <em>{message}</em> : null}
        </div>
      </header>

      {storyPickerOpen ? (
        <section className="story-inline-panel" aria-label="Load story">
          <div className="story-inline-panel-header">
            <strong>Load story</strong>
            <button onClick={() => void refreshStories()} disabled={storiesLoading}>
              Refresh
            </button>
          </div>
          {storiesLoading ? <span className="small">Loading stories...</span> : null}
          {storiesError ? <span className="status-warn">{storiesError}</span> : null}
          {!storiesLoading && stories.length === 0 ? (
            <span className="small">No saved stories found.</span>
          ) : null}
          <div className="story-list">
            {stories.map((story) => (
              <button
                key={story.story_id}
                className="story-list-item"
                disabled={busy || story.story_id === storyId}
                onClick={() => void selectStory(story.story_id)}
                title={story.story_id}
              >
                <strong>{story.title}</strong>
                <span>{new Date(story.updated_at).toLocaleString()}</span>
                <code>{story.story_id}</code>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {renameOpen ? (
        <section className="story-inline-panel" aria-label="Rename story">
          <div className="story-inline-panel-header">
            <strong>Rename story</strong>
          </div>
          <div className="story-rename-row">
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitRename();
                }
              }}
              placeholder="Story title"
            />
            <button disabled={busy || !renameValue.trim()} onClick={() => void submitRename()}>
              Save name
            </button>
          </div>
        </section>
      ) : null}

      <VisualNovelStage />
    </section>
  );
}
