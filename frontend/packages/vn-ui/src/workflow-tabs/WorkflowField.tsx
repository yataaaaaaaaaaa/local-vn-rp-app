import type { StoryNodeFieldKey } from "@local-vn/story-domain";

export interface WorkflowFieldProps {
  field: StoryNodeFieldKey;
  label: string;
  value: string;
  generatedValue?: string;
  disabled?: boolean;
  multiline?: boolean;
  onChange(value: string): void;
}

export function WorkflowField({
  field,
  label,
  value,
  generatedValue = "",
  disabled = false,
  multiline = true,
  onChange
}: WorkflowFieldProps) {
  const rows = field === "positivePrompt" || field === "negativePrompt" ? 6 : 8;

  return (
    <div className="workflow-field">
      <div className="workflow-field-header">
        <span className="workflow-field-label">{label}</span>
        <span className="workflow-field-key">{field}</span>
      </div>

      <label className="workflow-field-copy">
        <span className="workflow-field-copy-label">Generated</span>
        {multiline ? (
          <textarea
            value={generatedValue}
            readOnly
            rows={rows}
            className="workflow-generated-textarea"
          />
        ) : (
          <input
            value={generatedValue}
            readOnly
            className="workflow-generated-textarea"
          />
        )}
      </label>

      <label className="workflow-field-copy">
        <span className="workflow-field-copy-label">Editable</span>
        {multiline ? (
          <textarea
            value={value}
            disabled={disabled}
            rows={rows}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        ) : (
          <input
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        )}
      </label>
    </div>
  );
}
