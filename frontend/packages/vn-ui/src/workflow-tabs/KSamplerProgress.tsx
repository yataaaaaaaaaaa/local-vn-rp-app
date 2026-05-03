import type { StorySessionRunningJob } from "@local-vn/story-application";

export interface KSamplerProgressProps {
  runningJob: StorySessionRunningJob | null;
}

export function KSamplerProgress({ runningJob }: KSamplerProgressProps) {
  if (!runningJob) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
      <div className="flex items-center justify-between gap-3">
        <span>Generating {runningJob.stepId}...</span>
        <span className="text-xs text-sky-200/70">{runningJob.nodeId}</span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-950">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-300" />
      </div>
    </div>
  );
}
