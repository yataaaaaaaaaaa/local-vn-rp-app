import {
  fieldsForStoryWorkflowStep,
  labelForStoryWorkflowStep,
  readFields,
  storyWorkflowStepIds,
  type StoryNodeFieldKey,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId
} from "@local-vn/story-domain";
import {
  selectCanEditStep,
  selectCanGenerateStep,
  selectCanValidateStep,
  useStorySessionStore
} from "@local-vn/stores";

import { useResolvedCurrentNode } from "../useResolvedCurrentNode";
import { ImageSummary } from "./ImageSummary";
import { KSamplerProgress } from "./KSamplerProgress";
import { WorkflowField } from "./WorkflowField";

const fieldLabels: Record<StoryNodeFieldKey, string> = {
  context: "Context",
  userText: "User Text",
  dialogue: "Dialogue",
  visualDescription: "Visual Description",
  resolverText: "Resolver Text",
  selectedTags: "Selected Tags",
  danbotTags: "DanBot Tags",
  positivePrompt: "Positive Prompt",
  negativePrompt: "Negative Prompt",
  imageRef: "Image"
};

export function LeafStepTabs() {
  const currentFields = useResolvedCurrentNode();

  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const activeStepId = useStorySessionStore((state) => state.activeStepId);
  const workflowByNodeId = useStorySessionStore((state) => state.workflowByNodeId);
  const runningJob = useStorySessionStore((state) => state.runningJob);
  const busy = useStorySessionStore((state) => state.busy);
  const message = useStorySessionStore((state) => state.message);

  const selectWorkflowStep = useStorySessionStore((state) => state.selectWorkflowStep);
  const editStepField = useStorySessionStore((state) => state.editStepField);
  const validateStep = useStorySessionStore((state) => state.validateStep);
  const regenerateStep = useStorySessionStore((state) => state.regenerateStep);
  const cancelNode = useStorySessionStore((state) => state.cancelNode);

  const canEdit = useStorySessionStore((state) =>
    selectCanEditStep(state, activeStepId)
  );
  const canGenerate = useStorySessionStore((state) =>
    selectCanGenerateStep(state, activeStepId)
  );
  const canValidate = useStorySessionStore((state) =>
    selectCanValidateStep(state, activeStepId)
  );

  const workflow = selectedNodeId ? workflowByNodeId[selectedNodeId] : null;
  const stepState = workflow?.stepStates[activeStepId] ?? null;
  const payload = resolveStepPayload(
    currentFields,
    activeStepId,
    stepState?.edited ?? stepState?.generated ?? null
  );
  const isGenerating =
    runningJob?.nodeId === selectedNodeId && runningJob.stepId === activeStepId;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-800 bg-zinc-950/70 shadow-xl">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800 p-2">
        {storyWorkflowStepIds.map((stepId) => {
          const status = workflow?.stepStates[stepId]?.status ?? "empty";
          const selected = stepId === activeStepId;

          return (
            <button
              key={stepId}
              type="button"
              onClick={() => selectWorkflowStep(stepId)}
              className={[
                "whitespace-nowrap rounded-xl px-3 py-2 text-sm transition",
                selected
                  ? "bg-zinc-100 text-zinc-950"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
                status === "validated" ? "ring-1 ring-emerald-500/60" : "",
                status === "failed" ? "ring-1 ring-red-500/60" : "",
                status === "generating" ? "animate-pulse ring-1 ring-sky-500/60" : ""
              ].join(" ")}
            >
              <span>{labelForStoryWorkflowStep(stepId)}</span>
              <span className="ml-2 text-xs opacity-70">{status}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {labelForStoryWorkflowStep(activeStepId)}
            </h2>
            <p className="text-sm text-zinc-400">
              {stepState?.status ?? "empty"}
              {stepState?.error ? ` — ${stepState.error}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isGenerating && selectedNodeId ? (
              <button
                type="button"
                onClick={() => cancelNode(selectedNodeId)}
                className="rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
              >
                Cancel
              </button>
            ) : null}

            <button
              type="button"
              disabled={!canGenerate || busy}
              onClick={() => void regenerateStep(activeStepId)}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate
            </button>

            <button
              type="button"
              disabled={!canValidate || busy}
              onClick={() => void validateStep(activeStepId)}
              className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Validate
            </button>
          </div>
        </div>

        {isGenerating ? <KSamplerProgress runningJob={runningJob} /> : null}

        {message ? (
          <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
            {message}
          </div>
        ) : null}

        <div className="space-y-4">
          {fieldsForStoryWorkflowStep(activeStepId).map((field) => (
            <WorkflowField
              key={field}
              field={field}
              label={fieldLabels[field]}
              value={payload[field] ?? ""}
              generatedValue={stepState?.generated?.[field] ?? ""}
              disabled={!canEdit || busy}
              multiline={field !== "imageRef"}
              onChange={(value) => editStepField(activeStepId, field, value)}
            />
          ))}
        </div>

        {activeStepId === "image" ? (
          <div className="mt-4">
            <ImageSummary imageRef={payload.imageRef ?? currentFields.imageRef} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function resolveStepPayload(
  fields: Parameters<typeof readFields>[0],
  stepId: StoryWorkflowStepId,
  workflowPayload: StoryWorkflowPayload | null
): StoryWorkflowPayload {
  return {
    ...readFields(fields, stepId),
    ...(workflowPayload ?? {})
  };
}
