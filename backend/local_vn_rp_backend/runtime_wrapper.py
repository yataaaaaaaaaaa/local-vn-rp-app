from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
import importlib
import json
from pathlib import Path
from threading import Lock
import time
from typing import Any
from uuid import uuid4
import re

from .events import EventBus
from .storage_paths import StoragePaths

JsonBody = dict[str, Any]
TERMINAL_EVENTS = {"done", "text_done", "image_done", "failed", "aborted"}
_PROMPT_TOKEN_RE = re.compile(r"<[^>\s]+>|\([^)\s]+(?:\:[^)]*)?\)|[^\s]+")


@dataclass(frozen=True)
class RuntimeApi:
    AnythingBackend: type[Any]
    BackendConfig: type[Any]
    LlamaRequest: type[Any]
    DanbotNLRequest: type[Any]
    DiffusionRequest: type[Any]


def load_runtime_api() -> RuntimeApi:
    """Import anything-backend-runtime lazily so health checks stay lightweight."""

    module = importlib.import_module("anything_backend_runtime")
    return RuntimeApi(
        AnythingBackend=getattr(module, "AnythingBackend"),
        BackendConfig=getattr(module, "BackendConfig"),
        LlamaRequest=getattr(module, "LlamaRequest"),
        DanbotNLRequest=getattr(module, "DanbotNLRequest"),
        DiffusionRequest=getattr(module, "DiffusionRequest"),
    )


@dataclass
class RuntimeStatus:
    busy: bool = False
    active_model_type: str = "none"
    loaded_llm: str | None = None
    loaded_image_model: str | None = None
    loaded_danbot_model: str | None = None
    gpu_owner: str = "none"
    last_error: str | None = None

    def to_dict(self) -> JsonBody:
        return {
            "busy": self.busy,
            "active_model_type": self.active_model_type,
            "loaded_llm": self.loaded_llm,
            "loaded_image_model": self.loaded_image_model,
            "loaded_danbot_model": self.loaded_danbot_model,
            "gpu_owner": self.gpu_owner,
            "last_error": self.last_error,
        }


class BackendRuntimeWrapper:
    """Compatibility layer over the queue API from anything-backend-runtime.

    The Electron frontend still speaks the historical JSON/SSE HTTP shape. This
    class keeps that transport stable while delegating runtime ownership,
    queuing, generation, abort, unload, and close operations to
    `AnythingBackend` from `anything-backend-runtime`.
    """

    def __init__(
        self,
        api_loader: Callable[[], RuntimeApi] = load_runtime_api,
        storage_paths: StoragePaths | None = None,
    ) -> None:
        self.event_bus = EventBus()
        self.storage_paths = storage_paths
        self.status = RuntimeStatus()
        self._api_loader = api_loader
        self._api: RuntimeApi | None = None
        self._backend: Any | None = None
        self._backend_signature: (
            tuple[tuple[str, ...], float | None, float, bool, bool] | None
        ) = None
        self._llm_settings: JsonBody = {}
        self._image_settings: JsonBody = {}
        self._danbot_settings: JsonBody = {}
        self._lock = Lock()

    def snapshot(self) -> JsonBody:
        with self._lock:
            return self.status.to_dict()

    def health(self) -> JsonBody:
        payload: JsonBody = {"ok": True, "backend": "anything-backend-runtime-wrapper"}
        if self.storage_paths is not None:
            payload["storage_paths"] = self.storage_paths.to_dict()
        return payload

    def load_llm(self, request: JsonBody) -> JsonBody:
        with self._lock:
            self._llm_settings = dict(request)
            self.status.loaded_llm = _optional_str(request.get("model_path"))
            self.status.active_model_type = (
                "llm" if self.status.loaded_llm else self.status.active_model_type
            )
            self.status.gpu_owner = (
                "llm" if self.status.loaded_llm else self.status.gpu_owner
            )
            self.status.last_error = None
        return self.snapshot()

    def unload_llm(self) -> JsonBody:
        with self._lock:
            self._llm_settings = {}
            self.status.loaded_llm = None
            if self.status.active_model_type == "llm":
                self.status.active_model_type = "none"
            if self.status.gpu_owner == "llm":
                self.status.gpu_owner = "none"
        self._call_runtime_unload()
        return self.snapshot()

    def load_image_model(self, request: JsonBody) -> JsonBody:
        with self._lock:
            self._image_settings = dict(request)
            self.status.loaded_image_model = _optional_str(request.get("model_path"))
            self.status.active_model_type = (
                "image"
                if self.status.loaded_image_model
                else self.status.active_model_type
            )
            self.status.gpu_owner = (
                "image" if self.status.loaded_image_model else self.status.gpu_owner
            )
            self.status.last_error = None
        return self.snapshot()

    def unload_image_model(self) -> JsonBody:
        with self._lock:
            self._image_settings = {}
            self.status.loaded_image_model = None
            if self.status.active_model_type == "image":
                self.status.active_model_type = "none"
            if self.status.gpu_owner == "image":
                self.status.gpu_owner = "none"
        self._call_runtime_unload()
        return self.snapshot()

    def load_danbooru_tagger(self, request: JsonBody) -> JsonBody:
        with self._lock:
            self._danbot_settings = dict(request)
            self.status.loaded_danbot_model = _optional_str(
                request.get("model_path") or request.get("path")
            )
            self.status.last_error = None
        return self.snapshot()

    def unload_danbooru_tagger(self) -> JsonBody:
        with self._lock:
            self._danbot_settings = {}
            self.status.loaded_danbot_model = None
        self._call_runtime_unload()
        return self.snapshot()

    def generate_llm(self, request: JsonBody) -> JsonBody:
        job_id = _job_id("llm")
        started = time.monotonic()
        with self._lock:
            settings = dict(self._llm_settings)
        model_path = _required_str(
            settings.get("model_path") or request.get("model_path"), "llm model_path"
        )
        api = self._get_api()
        backend = self._ensure_backend()
        llama_request = api.LlamaRequest(
            prompt=str(request.get("prompt", "")),
            model_path=model_path,
            max_tokens=int(request.get("max_tokens", 256)),
            temperature=float(request.get("temperature", 0.7)),
            extra=_llm_extra(request),
        )
        self._mark_started(job_id, "llm")
        text_parts: list[str] = []
        try:
            job = backend.submit_llm(llama_request)
            terminal_event = self._consume_text_job(
                job.stream(), job_id, "llm", text_parts
            )
            generation_ms = int((time.monotonic() - started) * 1000)
            if terminal_event == "aborted":
                return {
                    "text": "".join(text_parts),
                    "finish_reason": "cancelled",
                    "seed": int(request.get("seed", 0)),
                    "timing": {"prompt_ms": 0, "generation_ms": generation_ms},
                }
            result = {
                "text": "".join(text_parts),
                "finish_reason": "stop",
                "seed": int(request.get("seed", 0)),
                "timing": {"prompt_ms": 0, "generation_ms": generation_ms},
            }
            self.event_bus.publish(
                {
                    "type": "generation_completed",
                    "job_id": job_id,
                    "kind": "llm",
                    "result": result,
                }
            )
            return result
        except Exception as exc:
            self._mark_failed(job_id, "llm", exc)
            raise
        finally:
            self._mark_idle()

    def tokenize_llm(self, text: str) -> list[str]:
        # The delegated runtime README exposes generation, not tokenization. Keep
        # the legacy endpoint harmless for UI callers that only need a count-ish
        # preview.
        return text.split()

    def generate_danbooru_tags(self, request: JsonBody) -> JsonBody:
        job_id = _job_id("danbot")
        with self._lock:
            settings = dict(self._danbot_settings)
        path = _required_str(
            settings.get("model_path")
            or settings.get("path")
            or request.get("model_path")
            or request.get("path"),
            "danbot path",
        )
        api = self._get_api()
        backend = self._ensure_backend()
        danbot_request = api.DanbotNLRequest(
            text=str(request.get("scene_text") or request.get("text") or ""),
            path=path,
            aspect_ratio=str(request.get("aspect_ratio", "square")),
            rating=str(request.get("rating", "general")),
            length=str(
                request.get("length") or request.get("translate_length") or "short"
            ),
            translate_mode=str(request.get("translate_mode", "exact")),
        )
        self._mark_started(job_id, "danbot")
        text_parts: list[str] = []
        try:
            job = backend.submit_danbotnl(danbot_request)
            terminal_event = self._consume_text_job(
                job.stream(), job_id, "danbot", text_parts
            )
            prompt = _join_danbot_text_parts(text_parts)
            tags = _split_prompt_tags(prompt, int(request.get("max_tags", 80)))
            result = {
                "tags": tags,
                "prompt": ", ".join(tags) if tags else prompt,
                "model_path": path,
                "warnings": (
                    [] if terminal_event != "aborted" else ["DanBot job was aborted."]
                ),
            }
            self.event_bus.publish(
                {
                    "type": "generation_completed",
                    "job_id": job_id,
                    "kind": "danbot",
                    "result": result,
                }
            )
            return result
        except Exception as exc:
            self._mark_failed(job_id, "danbot", exc)
            raise
        finally:
            self._mark_idle()

    def generate_image(self, request: JsonBody) -> JsonBody:
        job_id = _job_id("image")
        with self._lock:
            settings = dict(self._image_settings)
        model_path = _required_str(
            settings.get("model_path") or request.get("model_path"),
            "diffusion model_path",
        )
        output_path = _required_str(request.get("output_path"), "output_path")
        api = self._get_api()
        backend = self._ensure_backend()
        diffusion_request = api.DiffusionRequest(
            model_path=model_path,
            prompt=str(request.get("positive_prompt", "")),
            negative_prompt=str(request.get("negative_prompt", "")),
            prompt_lora_dir=str(
                request.get("lora_root") or settings.get("lora_root", "")
            ),
            prompt_embedding_dir=str(
                request.get("embedding_root") or settings.get("embedding_root", "")
            ),
            output_path=output_path,
            width=int(request.get("width", 1024)),
            height=int(request.get("height", 1024)),
            steps=int(request.get("steps", 28)),
            cfg=float(request.get("cfg_scale", request.get("cfg", 5.5))),
            seed=int(request.get("seed", 0)),
            sampler_name=_normalize_sampler_name(
                request.get("sampler", request.get("sampler_name", "euler_ancestral"))
            ),
            scheduler=str(request.get("scheduler", "simple")),
        )
        self._mark_started(job_id, "image")
        image_path = output_path
        seed = int(request.get("seed", 0))
        warnings: list[str] = []
        try:
            job = backend.submit_diffusion(diffusion_request)
            for event in job.stream():
                event_name = _event_name(event)
                if event_name == "ksample_step":
                    step = int(getattr(event, "step", 0))
                    total_steps = int(
                        getattr(event, "total_steps", request.get("steps", 0))
                    )
                    raw_fraction = getattr(event, "fraction", None)
                    progress = (
                        float(raw_fraction)
                        if raw_fraction is not None
                        else (step / total_steps if total_steps > 0 else 0.0)
                    )
                    self.event_bus.publish(
                        {
                            "type": "generation_progress",
                            "job_id": job_id,
                            "kind": "image",
                            "stage": "ksampler",
                            "progress": max(0.0, min(1.0, progress)),
                            "step": step,
                            "total_steps": total_steps,
                        }
                    )
                elif event_name == "image_done":
                    image_path = str(getattr(event, "output_path", image_path))
                    seed = int(getattr(event, "seed", seed))
                elif event_name == "failed":
                    raise RuntimeError(_event_error(event))
                elif event_name == "aborted":
                    warnings.append("Diffusion job was aborted.")
                    break
            metadata_path = _write_metadata_sidecar(request, image_path, model_path)
            result = {
                "image_path": image_path,
                "metadata_path": metadata_path,
                "seed": seed,
                "resolved_loras": [],
                "resolved_embeddings": [],
                "warnings": warnings,
            }
            self.event_bus.publish(
                {
                    "type": "generation_completed",
                    "job_id": job_id,
                    "kind": "image",
                    "result": result,
                }
            )
            return result
        except Exception as exc:
            self._mark_failed(job_id, "image", exc)
            raise
        finally:
            self._mark_idle()

    def cancel(self) -> JsonBody:
        backend = self._backend
        if backend is None:
            return {"cancelled": False, "current_aborted": False, "queued_aborted": 0}
        result = backend.abort_all()
        return {
            "cancelled": bool(
                getattr(result, "current_aborted", False)
                or getattr(result, "queued_aborted", 0)
            ),
            "current_aborted": bool(getattr(result, "current_aborted", False)),
            "queued_aborted": int(getattr(result, "queued_aborted", 0)),
        }

    def shutdown(self) -> JsonBody:
        self.close()
        return {"shutting_down": True}

    def close(self) -> None:
        backend = self._backend
        self._backend = None
        self._backend_signature = None
        if backend is not None:
            backend.close()

    def resolve_assets(self, request: JsonBody) -> JsonBody:
        # Prompt asset parsing/resolution now belongs to anything-backend-runtime's
        # diffusion request handling. The legacy endpoint remains a no-op preview.
        return {
            "resolved_prompt": str(request.get("positive_prompt", "")),
            "loras": [],
            "embeddings": [],
            "missing": [],
            "duplicates_ignored": [],
        }

    def rescan_assets(self, _request: JsonBody) -> JsonBody:
        return {"loras": [], "embeddings": []}

    def list_loras(self) -> list[JsonBody]:
        return []

    def list_embeddings(self) -> list[JsonBody]:
        return []

    def _get_api(self) -> RuntimeApi:
        if self._api is None:
            self._api = self._api_loader()
        return self._api

    def _ensure_backend(self) -> Any:
        api = self._get_api()
        signature = self._current_backend_signature()
        if self._backend is not None and self._backend_signature == signature:
            return self._backend
        if self._backend is not None:
            self._backend.close()
        (
            llama_server_args,
            llama_timeout,
            llama_startup_timeout,
            diffusion_allow_cpu,
            keep_runtime_warm,
        ) = signature
        config = api.BackendConfig(
            llama_server_args=llama_server_args,
            llama_timeout=llama_timeout,
            llama_startup_timeout=llama_startup_timeout,
            diffusion_allow_cpu=diffusion_allow_cpu,
            keep_runtime_warm=keep_runtime_warm,
        )
        self._backend = api.AnythingBackend(config)
        self._backend_signature = signature
        return self._backend

    def _current_backend_signature(
        self,
    ) -> tuple[tuple[str, ...], float | None, float, bool, bool]:
        with self._lock:
            llm = dict(self._llm_settings)
            image = dict(self._image_settings)
        device = str(image.get("device", "cuda")).lower()
        return (
            _llm_server_args(llm),
            _optional_float(llm.get("timeout_seconds")),
            float(llm.get("startup_timeout_seconds") or 900.0),
            device == "cpu",
            True,
        )

    def _mark_started(self, job_id: str, kind: str) -> None:
        with self._lock:
            self.status.busy = True
            self.status.active_model_type = (
                "image"
                if kind == "image"
                else "llm" if kind == "llm" else self.status.active_model_type
            )
            self.status.gpu_owner = (
                "image"
                if kind == "image"
                else "llm" if kind == "llm" else self.status.gpu_owner
            )
            self.status.last_error = None
        self.event_bus.publish(
            {"type": "generation_started", "job_id": job_id, "kind": kind}
        )

    def _mark_failed(self, job_id: str, kind: str, exc: Exception) -> None:
        with self._lock:
            self.status.last_error = str(exc)
        self.event_bus.publish(
            {
                "type": "generation_failed",
                "job_id": job_id,
                "kind": kind,
                "error": str(exc),
            }
        )

    def _mark_idle(self) -> None:
        with self._lock:
            self.status.busy = False

    def _consume_text_job(
        self, events: Iterable[Any], job_id: str, kind: str, text_parts: list[str]
    ) -> str:
        terminal_event = "done"
        for event in events:
            event_name = _event_name(event)
            if event_name == "text_delta":
                text = str(getattr(event, "text", ""))
                text_parts.append(text)
                if text:
                    self.event_bus.publish(
                        {
                            "type": "text_delta",
                            "job_id": job_id,
                            "kind": kind,
                            "text": text,
                        }
                    )
            elif event_name == "failed":
                raise RuntimeError(_event_error(event))
            elif event_name == "aborted":
                terminal_event = "aborted"
                self.event_bus.publish(
                    {"type": "generation_cancelled", "job_id": job_id, "kind": kind}
                )
                break
            elif event_name in TERMINAL_EVENTS:
                terminal_event = event_name
        return terminal_event

    def _call_runtime_unload(self) -> None:
        backend = self._backend
        if backend is not None:
            backend.unload()


def _llm_extra(request: JsonBody) -> JsonBody:
    extra: JsonBody = {}
    for key in ("top_p", "top_k", "min_p", "repeat_penalty", "seed", "stop"):
        if key in request:
            extra[key] = request[key]
    return extra


def _llm_server_args(settings: JsonBody) -> tuple[str, ...]:
    args: list[str] = []
    if "context_size" in settings:
        args.extend(("--ctx-size", str(int(settings["context_size"]))))
    gpu_layers = settings.get("gpu_layers")
    if gpu_layers == "auto":
        args.extend(("--n-gpu-layers", "-1"))
    elif gpu_layers is not None:
        args.extend(("--n-gpu-layers", str(int(gpu_layers))))
    extra_args = settings.get("llama_server_args")
    if isinstance(extra_args, (list, tuple)):
        args.extend(str(arg) for arg in extra_args)
    elif isinstance(extra_args, str) and extra_args.strip():
        args.extend(extra_args.split())
    return tuple(args)


def _optional_float(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("value must be a number") from exc


def _event_name(event: Any) -> str:
    return str(getattr(event, "event", ""))


def _event_error(event: Any) -> str:
    if hasattr(event, "error"):
        return str(getattr(event, "error"))
    if hasattr(event, "message"):
        return str(getattr(event, "message"))
    to_dict = getattr(event, "to_dict", None)
    if callable(to_dict):
        return json.dumps(to_dict())
    return f"runtime event failed: {event!r}"


def _optional_str(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _required_str(value: object, name: str) -> str:
    text = _optional_str(value)
    if text is None:
        raise ValueError(f"{name} is required")
    return text


def _required_port(value: object, name: str) -> int:
    if value is None or value == "":
        raise ValueError(f"{name} is required")
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if port <= 0 or port > 65535:
        raise ValueError(f"{name} must be between 1 and 65535")
    return port


def _normalize_sampler_name(value: object) -> str:
    sampler = str(value or "euler_ancestral")
    if sampler == "euler_a":
        return "euler_ancestral"
    return sampler


def _split_prompt_tags(prompt: str, max_tags: int) -> list[str]:
    if not prompt or max_tags <= 0:
        return []

    cleaned = prompt.strip()
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")

    # Tolerate model outputs like:
    # "tags: 1girl solo smile"
    # "positive prompt: 1girl, solo, smile"
    cleaned = re.sub(
        r"(?is)^\s*(?:tags?|danbooru tags?|prompt|positive prompt|positive_prompt)\s*[:=-]\s*",
        "",
        cleaned,
    )

    # Remove simple markdown fences if the model emits them.
    cleaned = cleaned.replace("```text", "").replace("```", "").strip()

    raw_tags: list[str] = []

    # First split on explicit prompt separators.
    for chunk in re.split(r"[,\n;]+", cleaned):
        chunk = chunk.strip().strip("[]{}\"'`")
        if not chunk:
            continue

        # Then split whitespace-separated Danbooru-style output:
        # "1girl solo looking_at_viewer smile"
        #
        # The regex preserves common grouped prompt atoms like:
        # "(masterpiece:1.2)" or "<lora:name:1>"
        raw_tags.extend(match.group(0) for match in _PROMPT_TOKEN_RE.finditer(chunk))

    unique: list[str] = []
    seen: set[str] = set()

    for raw_tag in raw_tags:
        tag = raw_tag.strip().strip("[]{}\"'`")
        if not tag or tag in seen:
            continue

        seen.add(tag)
        unique.append(tag)

        if len(unique) >= max_tags:
            break

    return unique


def _join_danbot_text_parts(parts: list[str]) -> str:
    text = " ".join(part.strip() for part in parts if part.strip())
    text = re.sub(r"\s+([,;])", r"\1", text)
    text = re.sub(r"([,;])(?=\S)", r"\1 ", text)
    return text.strip()


def _write_metadata_sidecar(request: JsonBody, image_path: str, model_path: str) -> str:
    metadata_path = str(Path(image_path).with_suffix(".json"))
    payload = {
        "request": request,
        "image_path": image_path,
        "model_path": model_path,
        "metadata": request.get("metadata", {}),
    }
    path = Path(metadata_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return metadata_path


def _job_id(kind: str) -> str:
    return f"{kind}_{uuid4().hex}"
