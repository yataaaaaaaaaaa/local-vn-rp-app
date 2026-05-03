import type { StorySessionRunningJob } from "@local-vn/story-application";

export interface KSamplerProgressProps {
  runningJob: StorySessionRunningJob | null;
}

export function KSamplerProgress({ runningJob }: KSamplerProgressProps) {
  if (!runningJob) {
    return null;
  }

  return (
    <div className="workflow-progress">
      <div className="workflow-progress-header">
        <span>Generating {runningJob.stepId}...</span>
        <span>{runningJob.nodeId}</span>
      </div>

      <div className="workflow-progress-track">
        <div className="workflow-progress-fill" />
      </div>
    </div>
  );
}
