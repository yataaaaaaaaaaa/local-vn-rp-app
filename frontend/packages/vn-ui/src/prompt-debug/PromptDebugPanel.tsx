import { useEffect, useMemo, useRef, useState } from "react";

import {
  RP_DIALOGUE_STOP,
  RP_NOVEL_STOP,
  buildAutomaticUserAnswerPromptWithActorNameCache,
  buildRpAnswerPromptWithActorNameCache,
  buildVisualRepresentationPromptWithActorNameCache,
  rpNovelLlmRequestConfig,
  type AdvancementCard,
  type NoveltyPlan,
  type RpActorNames
} from "@local-vn/story-application";
import type { LlmGenerateRequest } from "@local-vn/shared-types";
import {
  backendClientOrThrow,
  useBackendConfigStore,
  useBackendClientStore,
  useRuntimeEventsStore,
  useStorySessionStore
} from "@local-vn/stores";

import { useResolvedCurrentNode } from "../useResolvedCurrentNode";

type DebugPromptKind = "dialogue" | "visualDescription" | "userText";
type DebugStatus =
  | "idle"
  | "building-prompt"
  | "prompt-ready"
  | "streaming"
  | "done"
  | "error"
  | "cancelled";

type PromptDebugMetadata = {
  advancementCard?: AdvancementCard;
  noveltyPlan?: NoveltyPlan;
  actorNames?: RpActorNames | null;
};

const promptOptions: Array<{
  id: DebugPromptKind;
  label: string;
  help: string;
}> = [
  {
    id: "dialogue",
    label: "NPC dialogue continuation",
    help: "Uses the same dialogue prompt builder as the normal dialogue step."
  },
  {
    id: "visualDescription",
    label: "Visible scene cue",
    help: "Uses the same visual cue prompt builder as the normal visual-description step."
  },
  {
    id: "userText",
    label: "Automatic user reply",
    help: "Uses the same prompt builder as the optional LLM player-text step."
  }
];

export function PromptDebugPanel() {
  const node = useResolvedCurrentNode();
  const config = useBackendConfigStore((state) => state.config);
  const runtimeStatus = useBackendClientStore((state) => state.status);
  const storyId = useStorySessionStore((state) => state.storyId);
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const storyBusy = useStorySessionStore((state) => state.busy);

  const connected = useRuntimeEventsStore((state) => state.connected);
  const connectRuntimeEvents = useRuntimeEventsStore((state) => state.connect);
  const latestByJobId = useRuntimeEventsStore((state) => state.latestByJobId);
  const latestJobIdsByKind = useRuntimeEventsStore((state) => state.latestJobIdsByKind);
  const textByJobId = useRuntimeEventsStore((state) => state.textByJobId);

  const [promptKind, setPromptKind] = useState<DebugPromptKind>("dialogue");
  const [promptText, setPromptText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [status, setStatus] = useState<DebugStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<PromptDebugMetadata | null>(null);
  const [debugJobId, setDebugJobId] = useState<string | null>(null);
  const [baselineLlmJobId, setBaselineLlmJobId] = useState<string | undefined>();
  const [waitingForJob, setWaitingForJob] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeOption = useMemo(
    () => promptOptions.find((option) => option.id === promptKind) ?? promptOptions[0]!,
    [promptKind]
  );

  const debugEvent = debugJobId ? latestByJobId[debugJobId] : null;
  const streamedAnswer = debugJobId ? textByJobId[debugJobId] ?? "" : "";
  const displayedAnswer = streamedAnswer || answerText;
  const canSend =
    Boolean(promptText.trim()) && status !== "streaming" && status !== "building-prompt";
  const busyElsewhere = Boolean(storyBusy);
  const runtimeBusyHint = Boolean(runtimeStatus?.busy);

  useEffect(() => {
    if (connected) return;

    try {
      connectRuntimeEvents();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [connected, connectRuntimeEvents]);

  useEffect(() => {
    const latestLlmJobId = latestJobIdsByKind.llm;

    if (
      !waitingForJob ||
      debugJobId ||
      !latestLlmJobId ||
      latestLlmJobId === baselineLlmJobId
    ) {
      return;
    }

    setDebugJobId(latestLlmJobId);
    setWaitingForJob(false);
  }, [baselineLlmJobId, debugJobId, latestJobIdsByKind.llm, waitingForJob]);

  useEffect(() => {
    if (!debugEvent) return;

    if (debugEvent.type === "generation_failed") {
      setStatus("error");
      setError(debugEvent.error);
      setWaitingForJob(false);
      return;
    }

    if (debugEvent.type === "generation_cancelled") {
      setStatus("cancelled");
      setWaitingForJob(false);
      return;
    }

    if (debugEvent.type === "generation_completed") {
      setStatus("done");
      setWaitingForJob(false);
    }
  }, [debugEvent]);

  async function generatePrompt(): Promise<void> {
    setAnswerText("");
    setDebugJobId(null);
    setBaselineLlmJobId(undefined);
    setWaitingForJob(false);
    setError(null);
    setStatus("building-prompt");

    try {
      const result = await buildPromptForCurrentScene(promptKind);
      setPromptText(result.prompt);
      setMetadata(result.metadata);
      setStatus("prompt-ready");
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function sendPromptToLlm(): Promise<void> {
    const prompt = promptText.trim();

    if (!prompt) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setAnswerText("");
    setError(null);
    setDebugJobId(null);
    setBaselineLlmJobId(latestJobIdsByKind.llm);
    setWaitingForJob(true);
    setStatus("streaming");

    try {
      const result = await backendClientOrThrow().generateLlm(
        rpNovelLlmRequestConfig(
          config,
          prompt,
          llmOverridesForPromptKind(
            promptKind,
            config.llm.max_tokens,
            config.llm.temperature
          )
        ),
        { signal: controller.signal }
      );

      setAnswerText((current) => current || result.text);
      setStatus("done");
    } catch (reason) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
      } else {
        setStatus("error");
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      abortRef.current = null;
      setWaitingForJob(false);
    }
  }

  async function cancelDebugGeneration(): Promise<void> {
    abortRef.current?.abort();

    try {
      await backendClientOrThrow().cancel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }

    setStatus("cancelled");
    setWaitingForJob(false);
  }

  async function buildPromptForCurrentScene(kind: DebugPromptKind): Promise<{
    prompt: string;
    metadata: PromptDebugMetadata | null;
  }> {
    const input = {
      node,
      storyId,
      selectedNodeId
    };
    const runHiddenActorNameExtraction = createHiddenActorNameExtractionRunner();

    if (kind === "dialogue") {
      const result = await buildRpAnswerPromptWithActorNameCache(
        input,
        runHiddenActorNameExtraction
      );
      return {
        prompt: result.prompt,
        metadata: metadataFromPromptBuildResult(result)
      };
    }

    if (kind === "userText") {
      const result = await buildAutomaticUserAnswerPromptWithActorNameCache(
        input,
        runHiddenActorNameExtraction
      );
      return {
        prompt: result.prompt,
        metadata: metadataFromPromptBuildResult(result)
      };
    }

    return {
      prompt: await buildVisualRepresentationPromptWithActorNameCache(
        input,
        runHiddenActorNameExtraction
      ),
      metadata: null
    };
  }

  function createHiddenActorNameExtractionRunner(): (prompt: string) => Promise<string> {
    return async (prompt: string): Promise<string> => {
      const result = await backendClientOrThrow().generateLlm(
        rpNovelLlmRequestConfig(config, prompt, {
          max_tokens: Math.min(config.llm.max_tokens, 80),
          temperature: 0,
          stop: RP_NOVEL_STOP,
          debug_no_log: true
        })
      );

      return result.text;
    };
  }

  return (
    <section className="panel prompt-debug-panel" aria-label="Prompt generation debug panel">
      <details open>
        <summary className="prompt-debug-summary">
          <span>
            <strong>Prompt debug</strong>
            <em>local scratchpad only; nothing here is saved</em>
          </span>
          <code>{statusLabel(status, waitingForJob)}</code>
        </summary>

        <div className="prompt-debug-body">
          <div className="prompt-debug-controls">
            <label>
              <span>Prompt to generate</span>
              <select
                value={promptKind}
                onChange={(event) =>
                  setPromptKind(event.currentTarget.value as DebugPromptKind)
                }
                disabled={status === "streaming" || status === "building-prompt"}
              >
                {promptOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="prompt-debug-actions">
              <button
                type="button"
                onClick={() => void generatePrompt()}
                disabled={status === "streaming" || status === "building-prompt"}
              >
                Generate prompt
              </button>
              {status === "streaming" ? (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void cancelDebugGeneration()}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void sendPromptToLlm()}
                  disabled={!canSend || busyElsewhere}
                  title={
                    busyElsewhere
                      ? "The story workflow is currently busy; try when it is idle."
                      : runtimeBusyHint
                        ? "The backend runtime currently reports busy, so this may wait or fail."
                        : undefined
                  }
                >
                  Send to LLM
                </button>
              )}
            </div>

            <p className="small prompt-debug-help">{activeOption.help}</p>
          </div>

          {metadata ? (
            <div className="prompt-debug-metadata small">
              {metadata.advancementCard ? (
                <span>
                  Advancement: <code>{metadata.advancementCard.id}</code>
                </span>
              ) : null}
              {metadata.noveltyPlan ? (
                <span>
                  Novelty: <code>{metadata.noveltyPlan.axis}</code>
                </span>
              ) : null}
              {metadata.actorNames?.playerName || metadata.actorNames?.npcName ? (
                <span>
                  Actors:{" "}
                  <code>
                    {[metadata.actorNames.playerName, metadata.actorNames.npcName]
                      .filter(Boolean)
                      .join(" / ")}
                  </code>
                </span>
              ) : null}
            </div>
          ) : null}

          {error ? <div className="workflow-message status-error">{error}</div> : null}

          <div className="prompt-debug-grid">
            <label className="prompt-debug-editor">
              <span>Generated prompt, editable before sending</span>
              <textarea
                value={promptText}
                onChange={(event) => setPromptText(event.currentTarget.value)}
                placeholder="Generate one of the current-scene prompts here, edit it, then send it to the LLM."
                spellCheck={false}
                disabled={status === "streaming" || status === "building-prompt"}
              />
            </label>

            <label className="prompt-debug-editor">
              <span>Streaming LLM answer</span>
              <div className="prompt-debug-answer" aria-live="polite">
                {displayedAnswer || "The debug answer will stream here and is not stored."}
                {status === "streaming" ? (
                  <span className="stream-caret" aria-hidden="true">
                    |
                  </span>
                ) : null}
              </div>
            </label>
          </div>
        </div>
      </details>
    </section>
  );
}

function metadataFromPromptBuildResult(result: {
  advancementCard?: AdvancementCard;
  noveltyPlan?: NoveltyPlan;
  actorNames?: RpActorNames | null;
}): PromptDebugMetadata {
  return {
    ...(result.advancementCard ? { advancementCard: result.advancementCard } : {}),
    ...(result.noveltyPlan ? { noveltyPlan: result.noveltyPlan } : {}),
    ...(result.actorNames ? { actorNames: result.actorNames } : {})
  };
}

function llmOverridesForPromptKind(
  kind: DebugPromptKind,
  configuredMaxTokens: number,
  configuredTemperature: number
): Partial<LlmGenerateRequest> {
  if (kind === "visualDescription") {
    return {
      max_tokens: Math.min(configuredMaxTokens, 64),
      temperature: Math.min(configuredTemperature, 0.35),
      stop: RP_NOVEL_STOP,
      debug_no_log: true
    };
  }

  if (kind === "userText") {
    return {
      max_tokens: Math.min(configuredMaxTokens, 40),
      stop: RP_DIALOGUE_STOP,
      debug_no_log: true
    };
  }

  return {
    max_tokens: Math.min(configuredMaxTokens, 96),
    stop: RP_DIALOGUE_STOP,
    debug_no_log: true
  };
}

function statusLabel(status: DebugStatus, waitingForJob: boolean): string {
  if (waitingForJob) return "waiting for stream";

  switch (status) {
    case "building-prompt":
      return "building prompt";
    case "prompt-ready":
      return "prompt ready";
    case "streaming":
      return "streaming";
    case "done":
      return "done";
    case "error":
      return "error";
    case "cancelled":
      return "cancelled";
    case "idle":
    default:
      return "idle";
  }
}
