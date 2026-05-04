import { useEffect, useMemo, useState } from "react";
import { DanbooruTagResolverEditor } from "danbooru-tag-resolver";
import { useResolverStore, useStorySessionStore } from "@local-vn/stores";

import { useResolvedCurrentNode } from "../useResolvedCurrentNode";
import { buildInputSegments } from "./resolverTextSegments";
import { buildTagAssociations } from "./resolverTagAssociations";

export function DanbooruResolverPanel() {
  const currentNode = useResolvedCurrentNode();
  const applyResolverResultToWorkflow = useStorySessionStore(
    (state) => state.applyResolverResult
  );
  const config = useResolverStore((state) => state.config);
  const seed = useResolverStore((state) => state.seed);
  const result = useResolverStore((state) => state.result);
  const setConfig = useResolverStore((state) => state.setConfig);
  const setRawText = useResolverStore((state) => state.setRawText);
  const setSeed = useResolverStore((state) => state.setSeed);
  const resolve = useResolverStore((state) => state.resolve);

  const [message, setMessage] = useState<string | null>(null);
  const [activeMatchKey, setActiveMatchKey] = useState<string | null>(null);

  const rawText = useMemo(
    () =>
      currentNode.resolverText || currentNode.visualDescription,
    [currentNode.resolverText, currentNode.visualDescription]
  );

  const inputSegments = useMemo(
    () => buildInputSegments(rawText, result.matches),
    [rawText, result.matches]
  );

  const tagAssociations = useMemo(
    () => buildTagAssociations(result.tags, result.matches),
    [result.tags, result.matches]
  );

  useEffect(() => {
    setRawText(rawText);
    resolve(rawText);
  }, [rawText, seed, config, setRawText, resolve]);

  function applyResolverResult() {
    const resolved = resolve(rawText);

    void applyResolverResultToWorkflow({
      rawText,
      tags: resolved.tags,
      prompt: resolved.prompt
    }).then(() => {
      setMessage("Resolver output accepted through the workflow.");
    });
  }

  return (
    <section className="panel danbooru-resolver-panel">
      <div className="panel-header">
        <div>
          <h2>Danbooru Tag Resolver UI</h2>
          <div className="small">
            The resolver writes through the workflow command layer; it no longer
            edits story fields directly.
          </div>
        </div>

        <div className="button-row">
          <label>
            <span>Seed</span>
            <input
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
            />
          </label>

          <button
            onClick={() => {
              resolve(rawText);
              setMessage("Resolver preview refreshed.");
            }}
          >
            Preview tags
          </button>

          <button onClick={applyResolverResult}>Apply to workflow</button>
        </div>
      </div>

      <div className="resolver-top-grid">
        <div className="resolver-input-panel">
          <h3>Resolver input</h3>
          <div className="readonly-box resolver-highlight-text">
            {rawText
              ? inputSegments.map((segment) =>
                  segment.matchKey ? (
                    <span
                      key={segment.key}
                      className={[
                        "resolver-source-highlight",
                        activeMatchKey === segment.matchKey ? "active" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => setActiveMatchKey(segment.matchKey)}
                      onMouseLeave={() => setActiveMatchKey(null)}
                      title={segment.label}
                    >
                      {segment.text}
                    </span>
                  ) : (
                    <span key={segment.key}>{segment.text}</span>
                  )
                )
              : "No tagger-safe visual cue available."}
          </div>
        </div>

        <div className="resolver-preview-panel">
          <h3>Resolver preview</h3>
          <div className="readonly-box resolver-tag-preview">
            {tagAssociations.length
              ? tagAssociations.map((tag) => (
                  <span
                    key={tag.tag}
                    className={[
                      "resolver-tag-chip",
                      tag.matchKeys.includes(activeMatchKey ?? "")
                        ? "active"
                        : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseEnter={() =>
                      setActiveMatchKey(tag.matchKeys[0] ?? null)
                    }
                    onMouseLeave={() => setActiveMatchKey(null)}
                    title={tag.labels.join(", ")}
                  >
                    {tag.tag}
                  </span>
                ))
              : "No tags resolved yet."}
          </div>

          {result.warnings.length ? (
            <ul className="warning-list">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="resolver-editor-row">
        <h3>Danbooru tag resolver</h3>
        <DanbooruTagResolverEditor
          value={config}
          rawText={rawText}
          seed={seed}
          onChange={setConfig}
        />
      </div>

      {message ? <p className="small">{message}</p> : null}
    </section>
  );
}
