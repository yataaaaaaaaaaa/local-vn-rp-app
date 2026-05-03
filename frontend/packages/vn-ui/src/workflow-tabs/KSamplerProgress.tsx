import type { ProgressEvent } from "@local-vn/shared-types";
import type { StorySessionRunningJob } from "@local-vn/story-application";

export interface KSamplerProgressProps {
  runningJob: StorySessionRunningJob | null;
  progressEvent?: Extract<ProgressEvent, { type: "generation_progress" }> | null;
  compact?: boolean;
}

export function KSamplerProgress({
  runningJob,
  progressEvent,
  compact = false
}: KSamplerProgressProps) {
  if (!runningJob) {
    return null;
  }

  const clampedProgress = Math.max(
    0,
    Math.min(1, progressEvent?.progress ?? 0)
  );
  const progressPercent = Math.round(clampedProgress * 100);
  const progressLabel = progressEvent
    ? `${progressEvent.step}/${progressEvent.total_steps} · ${progressPercent}%`
    : runningJob.nodeId;

  return (
    <div className="workflow-progress">
      <div className="workflow-progress-header">
        <span>
          {compact ? "Generating image..." : `Generating ${runningJob.stepId}...`}
        </span>
        <span>{progressLabel}</span>
      </div>

      <div className="workflow-progress-track">
        <div
          className="workflow-progress-fill"
          style={{
            width: `${Math.max(progressPercent, progressEvent ? 4 : 48)}%`,
            animation: progressEvent ? "none" : undefined
          }}
        />
      </div>
    </div>
  );
}
