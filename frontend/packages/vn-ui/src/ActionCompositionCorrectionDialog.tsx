import { useEffect, useMemo, useState } from "react";
import {
  useActionCompositionCorrectionStore,
  useActionCompositionTreeStore,
  useStorySessionStore
} from "@local-vn/stores";
import type { ActionCompositionNode } from "@local-vn/story-application";

export function ActionCompositionCorrectionDialog() {
  const issue = useActionCompositionCorrectionStore((state) => state.issue);
  const close = useActionCompositionCorrectionStore((state) => state.close);
  const addChildAtPath = useActionCompositionTreeStore((state) => state.addChildAtPath);
  const saveTree = useActionCompositionTreeStore((state) => state.save);
  const regenerateStep = useStorySessionStore((state) => state.regenerateStep);
  const busy = useStorySessionStore((state) => state.busy);

  const suggestedJson = useMemo(() => {
    if (!issue) {
      return "";
    }

    return formatJson({
      name: "new action composition branch",
      content: [
        {
          name: "variant 001",
          weight: 50,
          content: ["standing", "straight-on", "upper body"]
        }
      ]
    });
  }, [issue]);

  const [nodeJson, setNodeJson] = useState(suggestedJson);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setNodeJson(suggestedJson);
    setMessage(null);
  }, [suggestedJson]);

  if (!issue) {
    return null;
  }

  async function submitCorrection(): Promise<void> {
    if (!issue) {
      return;
    }

    try {
      const node = JSON.parse(nodeJson) as ActionCompositionNode;
      addChildAtPath(issue.nodePath, node);
      await saveTree();
      close();
      await regenerateStep("resolverText");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="action-tree-dialog-backdrop" role="presentation">
      <section
        className="action-tree-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-tree-dialog-title"
      >
        <header className="action-tree-dialog-header">
          <div>
            <h2 id="action-tree-dialog-title">Action composition branch needed</h2>
            <p>
              The LLM did not find a matching choice in the configured tree.
            </p>
          </div>
          <button disabled={busy} onClick={close}>
            Close
          </button>
        </header>

        <div className="action-tree-dialog-grid">
          <section>
            <h3>Story context</h3>
            <pre>{issue.storyContext || "(empty)"}</pre>
          </section>

          <section>
            <h3>Visual context</h3>
            <pre>{issue.visualContext || "(empty)"}</pre>
          </section>

          <section>
            <h3>Tree position</h3>
            <pre>{issue.nodePath.join(" > ")}</pre>
          </section>

          <section>
            <h3>Rejected choices</h3>
            <pre>{issue.availableChoices.join("\n") || "(none)"}</pre>
          </section>

          <section>
            <h3>Known visual decisions</h3>
            <pre>{formatKnownFacts(issue.knownVisualDecisions)}</pre>
          </section>
        </div>

        <label className="action-tree-json-editor">
          <span>Node JSON to add under this tree position</span>
          <textarea
            value={nodeJson}
            onChange={(event) => setNodeJson(event.currentTarget.value)}
            spellCheck={false}
          />
        </label>

        {message ? <p className="action-tree-dialog-error">{message}</p> : null}

        <footer className="action-tree-dialog-actions">
          <button disabled={busy} onClick={close}>
            Close
          </button>
          <button disabled={busy || !nodeJson.trim()} onClick={() => void submitCorrection()}>
            Validate and retry
          </button>
        </footer>
      </section>
    </div>
  );
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatKnownFacts(facts: Record<string, string | boolean | string[]>): string {
  const lines = Object.entries(facts).map(([key, value]) => {
    const rendered = Array.isArray(value) ? value.join(", ") : String(value);
    return `${key}: ${rendered}`;
  });

  return lines.length ? lines.join("\n") : "(none)";
}
