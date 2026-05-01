import { useEffect, useMemo, useState } from "react";
import { DanbooruTagResolverEditor } from "danbooru-tag-resolver";
import { useResolverStore, useStorySessionStore } from "@local-vn/stores";
import { useResolvedCurrentNode } from "./useResolvedCurrentNode";

export function DanbooruResolverPanel() {
  const currentNode = useResolvedCurrentNode();
  const applyResolverResultToWorkflow = useStorySessionStore((state) => state.applyResolverResult);
  const config = useResolverStore((state) => state.config);
  const seed = useResolverStore((state) => state.seed);
  const result = useResolverStore((state) => state.result);
  const setConfig = useResolverStore((state) => state.setConfig);
  const setRawText = useResolverStore((state) => state.setRawText);
  const setSeed = useResolverStore((state) => state.setSeed);
  const resolve = useResolverStore((state) => state.resolve);
  const [message, setMessage] = useState<string | null>(null);

  const rawText = useMemo(() => currentNode.visualDescription || currentNode.dialogue || currentNode.context, [currentNode.context, currentNode.dialogue, currentNode.visualDescription]);

  useEffect(() => {
    setRawText(rawText);
  }, [rawText, setRawText]);

  function applyResolverResult() {
    const resolved = resolve(rawText);
    void applyResolverResultToWorkflow({ rawText, tags: resolved.tags, prompt: resolved.prompt })
      .then(() => setMessage("Resolver output accepted through the workflow."));
  }

  return (
    <section className="panel danbooru-resolver-panel">
      <div className="panel-header">
        <div>
          <h2>Danbooru Tag Resolver UI</h2>
          <div className="small">The resolver writes through the workflow command layer; it no longer edits story fields directly.</div>
        </div>
        <div className="button-row">
          <label><span>Seed</span><input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
          <button onClick={() => { resolve(rawText); setMessage("Resolver preview refreshed."); }}>Preview tags</button>
          <button onClick={applyResolverResult}>Apply to workflow</button>
        </div>
      </div>

      <div className="grid two">
        <div>
          <h3>Resolver input</h3>
          <div className="readonly-box">{rawText || "No visual description/dialogue/context available."}</div>
          <h3>Resolver preview</h3>
          <div className="readonly-box">{result.prompt || result.tags.join(", ") || "No tags resolved yet."}</div>
          {result.warnings.length ? <ul className="warning-list">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
        </div>
        <div>
          <DanbooruTagResolverEditor value={config} rawText={rawText} seed={seed} onChange={setConfig} />
        </div>
      </div>
      {message ? <p className="small">{message}</p> : null}
    </section>
  );
}
