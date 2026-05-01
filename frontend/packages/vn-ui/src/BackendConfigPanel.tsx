import { useEffect, useState } from "react";
import { backendClientOrThrow, useBackendClientStore, useBackendConfigStore, useRuntimeEventsStore } from "@local-vn/stores";
import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import { presetForPickedLlmModelPath } from "./llmModelPresetSelection";

type PathPickerKind = "file" | "files" | "folder" | "fileOrFolder";

type NativePathFilters = { name: string; extensions: string[] }[];

const GGUF_FILTERS: NativePathFilters = [
  { name: "GGUF models", extensions: ["gguf"] },
  { name: "All files", extensions: ["*"] }
];
const IMAGE_MODEL_FILTERS: NativePathFilters = [
  { name: "Diffusion models", extensions: ["safetensors", "ckpt", "bin", "pt"] },
  { name: "All files", extensions: ["*"] }
];
const LORA_FILTERS: NativePathFilters = [
  { name: "LoRA files", extensions: ["safetensors", "pt", "ckpt"] },
  { name: "All files", extensions: ["*"] }
];
const DANBOT_MODEL_FILTERS: NativePathFilters = [
  { name: "DanBotNL weights", extensions: ["safetensors"] },
  { name: "All files", extensions: ["*"] }
];

export function BackendConfigPanel() {
  const config = useBackendConfigStore((state) => state.config);
  const dirty = useBackendConfigStore((state) => state.dirty);
  const patchSection = useBackendConfigStore((state) => state.patchSection);
  const save = useBackendConfigStore((state) => state.save);
  const setBaseUrl = useBackendClientStore((state) => state.setBaseUrl);
  const status = useBackendClientStore((state) => state.status);
  const refreshStatus = useBackendClientStore((state) => state.refreshStatus);
  const events = useRuntimeEventsStore((state) => state.events);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setBaseUrl(config.backend.baseUrl);
  }, [config.backend.baseUrl, setBaseUrl]);

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      await refreshStatus();
      setMessage(`${label} completed.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(explainBackendError(text));
    }
  }

  function applyPickedLlmModelPath(modelPath: string) {
    const pickedPreset = presetForPickedLlmModelPath(modelPath);

    if (pickedPreset) {
      patchSection("llm", pickedPreset.patch);
      setMessage(`Selected ${pickedPreset.label} for ${modelPath}`);
      return;
    }

    patchSection("llm", { model_path: modelPath });
    setMessage(`Selected LLM model: ${modelPath}`);
  }

  function patchLlmNumber<K extends NumberKey<BackendRuntimeConfig["llm"]>>(key: K, value: string) {
    patchSection("llm", { [key]: Number(value) } as Partial<BackendRuntimeConfig["llm"]>);
  }

  function patchImageNumber<K extends NumberKey<BackendRuntimeConfig["image"]>>(key: K, value: string) {
    patchSection("image", { [key]: Number(value) } as Partial<BackendRuntimeConfig["image"]>);
  }

  return (
    <section className="panel backend-config-panel">
      <div className="panel-header">
        <div>
          <h2>Backend Configuration</h2>
          <div className="small">Runtime services, model paths, generation defaults, and backend connection settings.</div>
        </div>
        <div className="button-row">
          <button disabled={!dirty} onClick={() => void save()}>Save config</button>
          <button onClick={() => void refreshStatus()}>Refresh status</button>
        </div>
      </div>

      <div className="grid two">
        <section className="grid config-card">
          <h3>Backend Connection</h3>
          <PathLikeText label="Base URL" value={config.backend.baseUrl} onChange={(value) => patchSection("backend", { baseUrl: value })} />
          <div className="grid three">
            <PathLikeText label="Host" value={config.backend.host} onChange={(value) => patchSection("backend", { host: value })} />
            <NumberInput label="Port" value={config.backend.port} onChange={(value) => patchSection("backend", { port: Number(value) })} />
            <NumberInput label="Startup timeout (s)" value={config.backend.startup_timeout_seconds} onChange={(value) => patchSection("backend", { startup_timeout_seconds: Number(value) })} />
          </div>

          <h3>LLM / llama-server</h3>
          <PathInput
            label="LLM model path"
            value={config.llm.model_path}
            picker="file"
            filters={GGUF_FILTERS}
            onChange={(value) => {
              patchSection("llm", { model_path: value });
              applyPickedLlmModelPath(value);
            }}
          />
          <PathLikeText label="Prompt format" value={config.llm.prompt_format ?? ""} onChange={(value) => patchSection("llm", { prompt_format: value })} />
          <div className="grid three">
            <NumberInput label="Context size" value={config.llm.context_size} onChange={(value) => patchLlmNumber("context_size", value)} />
            <GpuLayersInput value={config.llm.gpu_layers} onChange={(value) => patchSection("llm", { gpu_layers: value })} />
            <NumberInput label="Startup timeout (s)" value={config.llm.startup_timeout_seconds} onChange={(value) => patchLlmNumber("startup_timeout_seconds", value)} />
          </div>
          <div className="grid three">
            <NumberInput label="Request timeout (s)" value={config.llm.timeout_seconds} onChange={(value) => patchLlmNumber("timeout_seconds", value)} />
            <NumberInput label="Max tokens" value={config.llm.max_tokens} onChange={(value) => patchLlmNumber("max_tokens", value)} />
            <NumberInput label="Temperature" value={config.llm.temperature} step="0.05" onChange={(value) => patchLlmNumber("temperature", value)} />
          </div>
          <div className="grid four">
            <NumberInput label="Top p" value={config.llm.top_p ?? ""} step="0.01" onChange={(value) => patchLlmNumber("top_p", value)} />
            <NumberInput label="Top k" value={config.llm.top_k ?? ""} onChange={(value) => patchLlmNumber("top_k", value)} />
            <NumberInput label="Min p" value={config.llm.min_p ?? ""} step="0.01" onChange={(value) => patchLlmNumber("min_p", value)} />
            <NumberInput label="Repeat penalty" value={config.llm.repeat_penalty ?? ""} step="0.05" onChange={(value) => patchLlmNumber("repeat_penalty", value)} />
          </div>
          <div className="button-row">
            <button onClick={() => void run("Load LLM", () => backendClientOrThrow().loadLlm({
              backend: "llama_server",
              model_path: config.llm.model_path,
              context_size: config.llm.context_size,
              gpu_layers: config.llm.gpu_layers,
              prompt_format: config.llm.prompt_format,
              llm_startup_timeout_seconds: config.llm.startup_timeout_seconds,
              startup_timeout_seconds: config.llm.startup_timeout_seconds,
              timeout_seconds: config.llm.timeout_seconds
            }))}>Load LLM</button>
            <button onClick={() => void run("Unload LLM", () => backendClientOrThrow().unloadLlm())}>Unload LLM</button>
          </div>
        </section>

        <section className="grid config-card">
          <h3>Image Model</h3>
          <PathInput label="Model path" value={config.image.model_path} picker="file" filters={IMAGE_MODEL_FILTERS} onChange={(value) => patchSection("image", { model_path: value })} />
          <div className="grid three">
            <PathLikeText label="Model type" value={config.image.model_type ?? ""} onChange={(value) => patchSection("image", { model_type: value })} />
            <PathLikeText label="Dtype" value={config.image.dtype ?? ""} onChange={(value) => patchSection("image", { dtype: value })} />
            <SelectInput label="Device" value={config.image.device ?? "auto"} options={["auto", "cuda", "cpu"]} onChange={(value) => patchSection("image", { device: value as BackendRuntimeConfig["image"]["device"] })} />
          </div>
          <PathInput label="LoRA root" value={config.image.lora_root} picker="folder" onChange={(value) => patchSection("image", { lora_root: value })} />
          <PathInput label="Embedding root" value={config.image.embedding_root} picker="folder" onChange={(value) => patchSection("image", { embedding_root: value })} />
          <MultiPathInput
            label="Manual LoRA paths"
            value={config.image.manual_lora_paths}
            filters={LORA_FILTERS}
            onChange={(value) => patchSection("image", { manual_lora_paths: value })}
          />
          <div className="grid three">
            <NumberInput label="Width" value={config.image.default_width} onChange={(value) => patchImageNumber("default_width", value)} />
            <NumberInput label="Height" value={config.image.default_height} onChange={(value) => patchImageNumber("default_height", value)} />
            <NumberInput label="Steps" value={config.image.default_steps} onChange={(value) => patchImageNumber("default_steps", value)} />
          </div>
          <div className="grid three">
            <NumberInput label="CFG scale" value={config.image.default_cfg_scale} step="0.1" onChange={(value) => patchImageNumber("default_cfg_scale", value)} />
            <PathLikeText label="Sampler" value={config.image.sampler} onChange={(value) => patchSection("image", { sampler: value })} />
            <PathLikeText label="Scheduler" value={config.image.scheduler} onChange={(value) => patchSection("image", { scheduler: value })} />
          </div>
          <NumberInput label="Image timeout (s)" value={config.image.timeout_seconds} onChange={(value) => patchImageNumber("timeout_seconds", value)} />
          <div className="button-row">
            <button onClick={() => void run("Load image model", () => backendClientOrThrow().loadImageModel({
              backend: "diffusers",
              model_type: config.image.model_type,
              model_path: config.image.model_path,
              dtype: config.image.dtype,
              device: config.image.device,
              lora_root: config.image.lora_root,
              embedding_root: config.image.embedding_root,
              manual_lora_paths: config.image.manual_lora_paths
            }))}>Load Image Model</button>
            <button onClick={() => void run("Unload image model", () => backendClientOrThrow().unloadImageModel())}>Unload Image Model</button>
          </div>

          <h3>DanBotNL</h3>
          <PathInput label="Model path" value={config.danbot.model_path} picker="fileOrFolder" filters={DANBOT_MODEL_FILTERS} onChange={(value) => patchSection("danbot", { model_path: value })} />
          <div className="grid three">
            <SelectInput label="Device" value={config.danbot.device} options={["auto", "cuda", "cpu"]} onChange={(value) => patchSection("danbot", { device: value as BackendRuntimeConfig["danbot"]["device"] })} />
            <PathLikeText label="Dtype" value={config.danbot.dtype} onChange={(value) => patchSection("danbot", { dtype: value })} />
            <NumberInput label="Max tags" value={config.danbot.max_tags} onChange={(value) => patchSection("danbot", { max_tags: Number(value) })} />
          </div>
          <div className="button-row">
            <button onClick={() => void run("Load DanBot", () => backendClientOrThrow().loadDanbot(config.danbot))}>Load DanBot</button>
            <button onClick={() => void run("Unload DanBot", () => backendClientOrThrow().unloadDanbot())}>Unload DanBot</button>
            <button onClick={() => void run("Cancel runtime", () => backendClientOrThrow().cancel())}>Cancel</button>
            <button onClick={() => void run("Shutdown runtime", () => backendClientOrThrow().shutdown())}>Shutdown</button>
          </div>
        </section>
      </div>

      <div className="status-row">
        <span>Busy: <strong className={status?.busy ? "status-error" : "status-ok"}>{String(status?.busy ?? false)}</strong></span>
        <span>Active: <code>{status?.active_model_type ?? "unknown"}</code></span>
        <span>LLM: <code>{status?.loaded_llm ?? "none"}</code></span>
        <span>Image: <code>{status?.loaded_image_model ?? "none"}</code></span>
        <span>DanBot: <code>{status?.loaded_danbot_model ?? "none"}</code></span>
      </div>

      {events.length ? <details><summary>Recent progress events ({events.length})</summary><pre>{JSON.stringify(events.slice(-10), null, 2)}</pre></details> : null}
      {message ? <p className={message.toLowerCase().includes("error") || message.toLowerCase().includes("failed") ? "status-error" : "small"}>{message}</p> : null}
    </section>
  );
}

type NumberKey<T> = { [K in keyof T]-?: T[K] extends number | undefined ? K : never }[keyof T];

function PathLikeText({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

function NumberInput({ label, value, step, onChange }: { label: string; value: number | string; step?: string; onChange(value: string): void }) {
  return <label><span>{label}</span><input type="number" step={step} value={value} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange(value: string): void }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function GpuLayersInput({ value, onChange }: { value: "auto" | number; onChange(value: "auto" | number): void }) {
  return (
    <label>
      <span>GPU layers</span>
      <input
        value={String(value)}
        placeholder="auto or number"
        onChange={(event) => {
          const next = event.currentTarget.value.trim();
          onChange(next === "" || next.toLowerCase() === "auto" ? "auto" : Number(next));
        }}
      />
    </label>
  );
}

function PathInput({ label, value, picker, filters, onChange }: { label: string; value: string; picker: PathPickerKind; filters?: NativePathFilters; onChange(value: string): void }) {
  async function pickFile() {
    const selected = await window.nativeDialogs.pickFile({ title: `Select ${label}`, defaultPath: value || undefined, filters });
    if (selected) onChange(selected);
  }

  async function pickFolder() {
    const selected = await window.nativeDialogs.pickFolder({ title: `Select ${label}`, defaultPath: value || undefined });
    if (selected) onChange(selected);
  }

  function pick() {
    return picker === "folder" ? pickFolder() : pickFile();
  }

  return (
    <label>
      <span>{label}</span>
      <div className="path-input-row">
        <input value={value} onChange={(event) => onChange(event.currentTarget.value)} />
        {picker === "fileOrFolder" ? (
          <>
            <button type="button" onClick={() => void pickFile()}>File...</button>
            <button type="button" onClick={() => void pickFolder()}>Folder...</button>
          </>
        ) : (
          <button type="button" onClick={() => void pick()}>Browse...</button>
        )}
      </div>
    </label>
  );
}

function MultiPathInput({ label, value, filters, onChange }: { label: string; value: string[]; filters?: NativePathFilters; onChange(value: string[]): void }) {
  async function pick() {
    const selected = await window.nativeDialogs.pickFiles({ title: `Select ${label}`, filters });
    if (!selected?.length) return;
    onChange(Array.from(new Set([...value, ...selected])));
  }

  return (
    <label>
      <span>{label}</span>
      <textarea
        value={value.join("\n")}
        placeholder="One path per line"
        onChange={(event) => onChange(linesToPaths(event.currentTarget.value))}
      />
      <div className="button-row">
        <button type="button" onClick={() => void pick()}>Add files...</button>
        <button type="button" disabled={!value.length} onClick={() => onChange([])}>Clear</button>
      </div>
    </label>
  );
}

function linesToPaths(text: string): string[] {
  return text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
}

function explainBackendError(text: string): string {
  if (text.toLowerCase().includes("llama")) {
    return `${text}\n\nThe backend now owns the llama-server process through anything-backend-runtime. Check that llama-server is available on PATH, or configure it in the backend package/runtime environment.`;
  }
  return text;
}
