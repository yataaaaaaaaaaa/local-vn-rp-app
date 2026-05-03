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
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        <span className="text-xs text-zinc-500">{field}</span>
      </div>

      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          rows={field === "positivePrompt" || field === "negativePrompt" ? 6 : 8}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="min-h-28 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
      ) : (
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
      )}

      {isChangedFromGenerated ? (
        <details className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
          <summary className="cursor-pointer text-xs text-zinc-400">
            Show generated candidate
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-300">
            {generatedValue}
          </pre>
        </details>
      ) : null}
    </label>
  );
}
