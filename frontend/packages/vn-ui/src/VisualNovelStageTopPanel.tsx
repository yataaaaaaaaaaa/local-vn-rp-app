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
      <header className="panel-header">
        <div>
          <h1>{manifest?.title ?? "Local VN/RP"}</h1>
          <div className="small">
            Story: <code>{storyId ?? "none"}</code>
            {" · "}
            Node: <code>{selectedNodeId ?? "none"}</code>
            {" · "}
            {dirty ? "Unsaved changes" : "Saved"}
          </div>
        </div>

        <div className="button-row">
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
            First child
          </button>
          <button disabled={busy} onClick={() => goToPreviousSibling()}>
            Previous sibling
          </button>
          <button disabled={busy} onClick={() => goToNextSibling()}>
            Next sibling
          </button>
          <button disabled={!dirty || busy} onClick={() => void saveStory()}>
            Save
          </button>
          <button disabled={!busy} onClick={() => cancelAll()}>
            Cancel
          </button>
          <button onClick={() => void refreshStatus()}>Refresh runtime</button>
        </div>
      </header>

      <div className="status-row">
        <span>
          Session:{" "}
          <strong className={busy ? "status-warn" : "status-ok"}>
            {busy ? "busy" : "idle"}
          </strong>
        </span>
        <span>
          Runtime:{" "}
          <strong className={status?.busy ? "status-warn" : "status-ok"}>
            {status?.busy ? "busy" : "idle"}
          </strong>
        </span>
        <span>
          LLM: <code>{status?.loaded_llm ?? "none"}</code>
        </span>
        <span>
          Image: <code>{status?.loaded_image_model ?? "none"}</code>
        </span>
        <span>
          DanBot: <code>{status?.loaded_danbot_model ?? "none"}</code>
        </span>
      </div>

      {message ? <p className="small">{message}</p> : null}

      <VisualNovelStage />
    </section>
  );
}
