import {
  useFrontendPreferencesStore,
  useRuntimeEventsStore,
  useStorySessionStore
} from "@local-vn/stores";
import type { StorySessionRunningJob } from "@local-vn/story-application";

import { KSamplerProgress } from "./KSamplerProgress";

export function DeferredGenerationPanel() {
  const deferDanbotGeneration = useFrontendPreferencesStore(
    (state) => state.deferDanbotGeneration
  );
  const deferImageGeneration = useFrontendPreferencesStore(
    (state) => state.deferImageGeneration
  );
  const setDeferDanbotGeneration = useFrontendPreferencesStore(
    (state) => state.setDeferDanbotGeneration
  );
  const setDeferImageGeneration = useFrontendPreferencesStore(
    (state) => state.setDeferImageGeneration
  );

  const workflowByNodeId = useStorySessionStore((state) => state.workflowByNodeId);
  const storyBusy = useStorySessionStore((state) => state.busy);
  const backendConfig = useStorySessionStore((state) => state.backendConfig);
  const deferredBatchJob = useStorySessionStore((state) => state.deferredBatchJob);
  const generateDeferredDanbot = useStorySessionStore(
    (state) => state.generateDeferredDanbot
  );
  const generateDeferredImages = useStorySessionStore(
    (state) => state.generateDeferredImages
  );
  const cancelDeferredGeneration = useStorySessionStore(
    (state) => state.cancelDeferredGeneration
  );

  const activeJobIdsByKind = useRuntimeEventsStore(
    (state) => state.activeJobIdsByKind
  );
  const latestJobIdsByKind = useRuntimeEventsStore(
    (state) => state.latestJobIdsByKind
  );
  const imageProgressByJobId = useRuntimeEventsStore(
    (state) => state.imageProgressByJobId
  );

  const deferredDanbotCount = countDeferredSteps(workflowByNodeId, "danbot");
  const deferredImageCount = countDeferredSteps(workflowByNodeId, "image");
  const batchRunning = deferredBatchJob?.status === "running";
  const sceneProgress =
    deferredBatchJob && deferredBatchJob.total > 0
      ? Math.max(
          0,
          Math.min(1, deferredBatchJob.currentIndex / deferredBatchJob.total)
        )
      : 0;
  const scenePercent = Math.round(sceneProgress * 100);

  const imageJobId =
    activeJobIdsByKind.image ??
    (batchRunning ? latestJobIdsByKind.image : undefined);
  const imageProgress = imageJobId
    ? imageProgressByJobId[imageJobId] ?? null
    : null;
  const batchImageRunningJob: StorySessionRunningJob | null =
    batchRunning && deferredBatchJob?.kind === "image" && deferredBatchJob.currentNodeId
      ? {
          id: deferredBatchJob.id,
          runId: deferredBatchJob.id,
          nodeId: deferredBatchJob.currentNodeId,
          stepId: "image"
        }
      : null;

  return (
    <section className="panel deferred-generation-panel" aria-label="Deferred generation">
      <div className="panel-header">
        <div>
          <h2>Deferred Generation</h2>
          <p className="small">
            {deferredDanbotCount} DanBot · {deferredImageCount} image
          </p>
        </div>

        {batchRunning ? (
          <button
            type="button"
            className="danger-button"
            onClick={() => void cancelDeferredGeneration()}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="deferred-generation-controls">
        <label className="workflow-auto-toggle">
          <input
            type="checkbox"
            checked={deferDanbotGeneration}
            onChange={(event) =>
              setDeferDanbotGeneration(event.currentTarget.checked)
            }
          />
          <span>Skip DanBot</span>
        </label>

        <label className="workflow-auto-toggle">
          <input
            type="checkbox"
            checked={deferImageGeneration}
            onChange={(event) =>
              setDeferImageGeneration(event.currentTarget.checked)
            }
          />
          <span>Skip Image</span>
        </label>

        <button
          type="button"
          disabled={
            storyBusy ||
            batchRunning ||
            !backendConfig ||
            deferredDanbotCount === 0
          }
          onClick={() => void generateDeferredDanbot()}
        >
          Generate DanBot
        </button>

        <button
          type="button"
          disabled={
            storyBusy ||
            batchRunning ||
            !backendConfig ||
            deferredImageCount === 0
          }
          onClick={() => void generateDeferredImages()}
        >
          Generate Images
        </button>
      </div>

      {deferredBatchJob ? (
        <div className="deferred-generation-progress">
          <div className="workflow-progress">
            <div className="workflow-progress-header">
              <span>
                {deferredBatchJob.kind === "danbot"
                  ? "DanBot scenes"
                  : "Image scenes"}
              </span>
              <span>
                {deferredBatchJob.currentIndex}/{deferredBatchJob.total} ·{" "}
                {scenePercent}%
              </span>
            </div>
            <div className="workflow-progress-track">
              <div
                className="workflow-progress-fill"
                style={{
                  width: `${Math.max(scenePercent, batchRunning ? 4 : 0)}%`,
                  animation: "none"
                }}
              />
            </div>
          </div>

          {deferredBatchJob.kind === "image" ? (
            <KSamplerProgress
              runningJob={batchImageRunningJob}
              progressEvent={imageProgress}
            />
          ) : batchRunning ? (
            <div className="workflow-progress">
              <div className="workflow-progress-header">
                <span>Generating DanBot tags...</span>
                <span>{deferredBatchJob.currentNodeId ?? ""}</span>
              </div>
              <div className="workflow-progress-track">
                <div className="workflow-progress-fill" />
              </div>
            </div>
          ) : null}

          {deferredBatchJob.message ? (
            <div className="workflow-message">{deferredBatchJob.message}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function countDeferredSteps(
  workflowByNodeId: ReturnType<typeof useStorySessionStore.getState>["workflowByNodeId"],
  stepId: "danbot" | "image"
): number {
  return Object.values(workflowByNodeId).filter(
    (workflow) => workflow.stepStates[stepId]?.status === "deferred"
  ).length;
}
