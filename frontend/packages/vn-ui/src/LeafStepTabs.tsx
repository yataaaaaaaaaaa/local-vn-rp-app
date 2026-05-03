import { useMemo } from "react";
import type { StoryNodeFieldKey } from "@local-vn/shared-types";
import { parseImageRef } from "@local-vn/story-tree";
import {
  createStoryWorkflowSteps,
  fieldsForStoryWorkflowStep,
  selectCurrentWorkflowSnapshot,
  storyWorkflowStepIds,
  type StoryWorkflowPayload,
  type StoryWorkflowStepId
} from "@local-vn/story-mechanism";
import {
  selectCanEditStep,
  selectCanGenerateStep,
  selectCanValidateStep,
  useRuntimeEventsStore,
  useStorySessionStore
} from "@local-vn/stores";
import { useResolvedCurrentNode } from "./useResolvedCurrentNode";

const steps = createStoryWorkflowSteps();
const stepById = Object.fromEntries(steps.map((step) => [step.id, step])) as Record<StoryWorkflowStepId, typeof steps[number]>;

export function LeafStepTabs() {
  const node = useResolvedCurrentNode();
  const snapshot = useStorySessionStore(selectCurrentWorkflowSnapshot);
  const activeStepId = useStorySessionStore((state) => state.activeStepId);
  const busy = useStorySessionStore((state) => state.busy);
  const message = useStorySessionStore((state) => state.message);
  const selectWorkflowStep = useStorySessionStore((state) => state.selectWorkflowStep);
  const editStepField = useStorySessionStore((state) => state.editStepField);
  const validateStep = useStorySessionStore((state) => state.validateStep);
  const regenerateStep = useStorySessionStore((state) => state.regenerateStep);
  const autoValidateGeneratedCandidate = useStorySessionStore((state) => state.autoValidateGeneratedCandidateByStepId[activeStepId]);
  const setAutoValidateGeneratedCandidate = useStorySessionStore((state) => state.setAutoValidateGeneratedCandidate);
  const canEdit = useStorySessionStore((state) => selectCanEditStep(state, activeStepId));
  const canGenerate = useStorySessionStore((state) => selectCanGenerateStep(state, activeStepId));
  const canValidate = useStorySessionStore((state) => selectCanValidateStep(state, activeStepId));
  const imageProgressByJobId = useRuntimeEventsStore((state) => state.imageProgressByJobId);
  const latestJobIdsByKind = useRuntimeEventsStore((state) => state.latestJobIdsByKind);
  const imageProgress = latestJobIdsByKind.image ? imageProgressByJobId[latestJobIdsByKind.image] : undefined;

  const activeStep = stepById[activeStepId];
  const fields = useMemo(() => fieldsForStoryWorkflowStep(activeStepId), [activeStepId]);
  const stepState = snapshot?.stepStates[activeStepId];
  const generated = stepState?.generated ?? null;
  const edited = stepState?.edited ?? null;

  function valueFor(payload: StoryWorkflowPayload | null | undefined, field: StoryNodeFieldKey): string {
    return payload?.[field] ?? "";
  }

  function editedValueFor(field: StoryNodeFieldKey): string {
    return valueFor(edited, field) || node[field] || "";
  }

  return (
    <section className="panel leaf-step-tabs">
      <div className="panel-header">
        <div>
          <h2>Current Workflow Step</h2>
          <div className="small">
            State: <code>{snapshot?.machineState ?? "editing"}</code> · Frontier: <code>{snapshot?.frontierStepId ?? "context"}</code> · Active: <code>{activeStep.label}</code>
          </div>
        </div>
        <div className="button-row">
          <label className="inline-checkbox">
            <span>Auto-validate generated</span>
            <input
              type="checkbox"
              checked={autoValidateGeneratedCandidate}
              onChange={(event) => setAutoValidateGeneratedCandidate(activeStepId, event.currentTarget.checked)}
            />
          </label>
          <button disabled={!canGenerate} onClick={() => void regenerateStep(activeStepId)}>
            {busy ? "Generating..." : "Generate/regenerate"}
          </button>
          <button disabled={!canValidate} onClick={() => void validateStep(activeStepId)}>
            Validate edited
          </button>
        </div>
      </div>

      <div className="tabs">
        {storyWorkflowStepIds.map((stepId) => {
          const step = stepById[stepId];
          const state = snapshot?.stepStates[stepId];
          const isFuture = snapshot ? storyWorkflowStepIds.indexOf(stepId) > storyWorkflowStepIds.indexOf(snapshot.frontierStepId) : false;
          return (
            <button
              key={stepId}
              className={[stepId === activeStepId ? "active current-tab" : "", isFuture ? "future-tab" : ""].filter(Boolean).join(" ")}
              aria-current={stepId === activeStepId ? "page" : undefined}
              title={isFuture ? "Future step: view-only until the workflow reaches it." : `${step.mode} step, ${state?.status ?? "empty"}`}
              onClick={() => selectWorkflowStep(stepId)}
            >
              {step.label}
              {state?.status ? <span className="small"> · {state.status}</span> : null}
            </button>
          );
        })}
      </div>

      {activeStepId === "image" && busy ? <KSamplerProgress progress={imageProgress} /> : null}

      <div className="editor-grid">
        <div>
          <h3>Accepted value sent to later steps</h3>
          {fields.map((field) => <ResolvedField key={field} field={field} value={node[field]} />)}
        </div>
        <div>
          <h3>Generated proposal</h3>
          {fields.map((field) => <ResolvedField key={field} field={field} value={valueFor(generated, field)} />)}
        </div>
        <div>
          <h3>Edited candidate</h3>
          {fields.map((field) => (
            <EditableField
              key={field}
              field={field}
              value={editedValueFor(field)}
              disabled={!canEdit || busy}
              onChange={(value) => editStepField(activeStepId, field, value)}
            />
          ))}
        </div>
      </div>

      {activeStepId === "image" ? <ImageSummary imageRef={node.imageRef} /> : null}
      {stepState?.warnings?.length ? <p className="small">Warnings: {stepState.warnings.join("; ")}</p> : null}
      {stepState?.error ? <p className="status-error">{stepState.error}</p> : null}
      {message ? <p className={message.toLowerCase().includes("error") || message.toLowerCase().includes("failed") ? "status-error" : "small"}>{message}</p> : null}
    </section>
  );
}

function ResolvedField({ field, value }: { field: StoryNodeFieldKey; value: string }) {
  return <div className="grid"><label><span>{field}</span><div className="readonly-box">{value || "(empty)"}</div></label></div>;
}

function EditableField({ field, value, disabled, onChange }: { field: StoryNodeFieldKey; value: string; disabled: boolean; onChange(value: string): void }) {
  return <label><span>{field}</span><textarea disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ImageSummary({ imageRef }: { imageRef: string }) {
  const image = parseImageRef(imageRef);
  if (!image) return <p className="small">No image reference is stored on this leaf.</p>;
  return <p className="small">Linked image: <code>{image.image_path}</code> Metadata: <code>{image.metadata_path}</code></p>;
}

function KSamplerProgress({ progress }: { progress?: { progress: number; step: number; total_steps: number; stage?: string } }) {
  const fraction = Math.max(0, Math.min(1, progress?.progress ?? 0));
  const percent = Math.round(fraction * 100);
  const label = progress ? `KSampler ${progress.step}/${progress.total_steps || "?"} (${percent}%)` : "Waiting for KSampler steps...";
  return (
    <div className="ksampler-progress" role="status" aria-label={label}>
      <div className="ksampler-progress-header">
        <strong>{label}</strong>
        <span className="small">{progress?.stage ?? "ksampler"}</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
