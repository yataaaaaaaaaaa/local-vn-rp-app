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
  const hasGeneratedValue = generatedValue.trim().length > 0;
  const isChangedFromGenerated =
    hasGeneratedValue && generatedValue !== value;

  return (
    <label className="workflow-field">
      <div className="workflow-field-header">
        <span className="workflow-field-label">{label}</span>
        <span className="workflow-field-key">{field}</span>
      </div>

      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          rows={field === "positivePrompt" || field === "negativePrompt" ? 6 : 8}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}

      {isChangedFromGenerated ? (
        <details className="workflow-generated-candidate">
          <summary>Show generated candidate</summary>
          <pre>{generatedValue}</pre>
        </details>
      ) : null}
    </label>
  );
}
