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
    <section className="workflow-panel">
      <div className="workflow-step-tabs" role="tablist" aria-label="Generation steps">
        {storyWorkflowStepIds.map((stepId) => {
          const status = workflow?.stepStates[stepId]?.status ?? "empty";
          const selected = stepId === activeStepId;

          return (
            <button
              key={stepId}
              type="button"
              onClick={() => selectWorkflowStep(stepId)}
              className={[
                "workflow-step-tab",
                selected ? "is-selected" : "",
                `status-${status}`
              ].join(" ")}
              aria-selected={selected}
              role="tab"
            >
              <span className="workflow-step-label">
                {labelForStoryWorkflowStep(stepId)}
              </span>
              <span className="workflow-step-status">{status}</span>
            </button>
          );
        })}
      </div>

      <div className="workflow-body">
        <div className="workflow-toolbar">
          <div>
            <h2>{labelForStoryWorkflowStep(activeStepId)}</h2>
            <p>
              {stepState?.status ?? "empty"}
              {stepState?.error ? ` — ${stepState.error}` : ""}
            </p>
          </div>

          <div className="workflow-actions">
            {isGenerating && selectedNodeId ? (
              <button
                type="button"
                onClick={() => cancelNode(selectedNodeId)}
                className="danger-button"
              >
                Cancel
              </button>
            ) : null}

            <button
              type="button"
              disabled={!canGenerate || busy}
              onClick={() => void regenerateStep(activeStepId)}
            >
              Generate
            </button>

            <button
              type="button"
              disabled={!canValidate || busy}
              onClick={() => void validateStep(activeStepId)}
              className="primary-button"
            >
              Validate
            </button>
          </div>
        </div>

        {isGenerating ? <KSamplerProgress runningJob={runningJob} /> : null}

        {message ? <div className="workflow-message">{message}</div> : null}

        <div className="workflow-fields">
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
          <div className="workflow-image-summary">
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
