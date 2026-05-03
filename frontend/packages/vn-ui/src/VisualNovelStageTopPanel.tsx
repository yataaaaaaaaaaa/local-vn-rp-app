import { useBackendClientStore, useStorySessionStore } from "@local-vn/stores";
import { VisualNovelStage } from "./VisualNovelStage";

export function VisualNovelStageTopPanel() {
  const manifest = useStorySessionStore((state) => state.manifest);
  const storyId = useStorySessionStore((state) => state.storyId);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const busy = useStorySessionStore((state) => state.busy);
  const dirty = useStorySessionStore((state) => state.dirty);
  const message = useStorySessionStore((state) => state.message);
  const saveStory = useStorySessionStore((state) => state.saveStory);
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
          <button disabled={!busy} onClick={() => cancelAll()}>
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

      <VisualNovelStage />
    </section>
  );
}
