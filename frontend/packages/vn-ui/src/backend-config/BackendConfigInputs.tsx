import type { ChangeEvent } from "react";
import type { PathPickerKind, NativePathFilters } from "./pathPickerTypes";

export type NumberKey<T> = {
  [K in keyof T]-?: Exclude<T[K], undefined> extends number ? K : never;
}[keyof T] & string;

export interface PathLikeTextProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange(value: string): void;
}

export function PathLikeText({
  label,
  value,
  placeholder,
  onChange
}: PathLikeTextProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export interface NumberInputProps {
  label: string;
  value: number | string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  onChange(value: string): void;
}

export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  placeholder,
  onChange
}: NumberInputProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export interface SelectInputProps<TValue extends string = string> {
  label: string;
  value: TValue;
  options: readonly TValue[];
  onChange(value: TValue): void;
}

export function SelectInput<TValue extends string = string>({
  label,
  value,
  options,
  onChange
}: SelectInputProps<TValue>) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as TValue)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface GpuLayersInputProps {
  value: number | "auto" | null | undefined;
  onChange(value: number | "auto"): void;
}

export function GpuLayersInput({ value, onChange }: GpuLayersInputProps) {
  return (
    <label className="field">
      <span>GPU layers</span>
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        placeholder="auto"
        onChange={(event) => {
          const nextValue = event.currentTarget.value.trim();
          onChange(nextValue ? Number(nextValue) : "auto");
        }}
      />
    </label>
  );
}

export interface PathInputProps {
  label: string;
  value: string;
  picker: PathPickerKind;
  filters?: NativePathFilters;
  placeholder?: string;
  onChange(value: string): void;
}

export function PathInput({
  label,
  value,
  picker,
  filters,
  placeholder,
  onChange
}: PathInputProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="path-input-row">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <button
          type="button"
          onClick={() => void pickPath({ picker, filters, onChange })}
        >
          Browse
        </button>
      </div>
    </label>
  );
}

export interface MultiPathInputProps {
  label: string;
  value: string[];
  picker?: PathPickerKind;
  filters?: NativePathFilters;
  placeholder?: string;
  onChange(value: string[]): void;
}

export function MultiPathInput({
  label,
  value,
  picker = "file",
  filters,
  placeholder,
  onChange
}: MultiPathInputProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        value={value.join("\n")}
        placeholder={placeholder ?? "One path per line"}
        rows={4}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(linesToPaths(event.currentTarget.value))
        }
      />
      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            void pickPath({
              picker,
              filters,
              onChange: (path) => onChange([...value, path])
            })
          }
        >
          Add path
        </button>
        <button type="button" onClick={() => onChange([])}>
          Clear
        </button>
      </div>
    </label>
  );
}

export function linesToPaths(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function pickPath(input: {
  picker: PathPickerKind;
  filters?: NativePathFilters;
  onChange(value: string): void;
}): Promise<void> {
  const nativeDialogs = window.nativeDialogs;

  if (!nativeDialogs) {
    return;
  }

  const picked = await pickWithNativeDialogs(nativeDialogs, input.picker, input.filters);

  if (picked) {
    input.onChange(picked);
  }
}


async function pickWithNativeDialogs(
  nativeDialogs: Window["nativeDialogs"],
  picker: PathPickerKind,
  filters?: NativePathFilters
): Promise<string | null> {
  switch (picker) {
    case "folder":
      return nativeDialogs.pickFolder();
    case "fileOrFolder": {
      const file = await nativeDialogs.pickFile({ filters });
      return file ?? nativeDialogs.pickFolder();
    }
    case "file":
    default:
      return nativeDialogs.pickFile({ filters });
  }
}
