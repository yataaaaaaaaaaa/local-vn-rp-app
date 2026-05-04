from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from threading import Lock
from typing import Any

SCHEMA_VERSION = "local_vn_rp.generation_log.v1"

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class GenerationLogEntry:
    event: str
    kind: str
    job_id: str
    model_path: str | None
    parameters: JsonObject = field(default_factory=dict)
    input: JsonObject = field(default_factory=dict)
    output: JsonObject | None = None
    timing: JsonObject = field(default_factory=dict)
    error: JsonObject | None = None
    level: str = "info"

    def to_record(self) -> JsonObject:
        return {
            "schema_version": SCHEMA_VERSION,
            "timestamp_utc": _utc_timestamp(),
            "level": self.level,
            "event": self.event,
            "kind": self.kind,
            "job_id": self.job_id,
            "model": {"path": self.model_path},
            "parameters": dict(self.parameters),
            "input": dict(self.input),
            "output": None if self.output is None else dict(self.output),
            "timing": dict(self.timing),
            "error": None if self.error is None else dict(self.error),
        }


class GenerationLogger:
    """Append-only JSON Lines logger for backend generation records."""

    def __init__(self, path: str | Path | None) -> None:
        self.path = Path(path) if path else None
        self._lock = Lock()
        if self.path is not None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.touch(exist_ok=True)

    @property
    def enabled(self) -> bool:
        return self.path is not None

    def log(self, entry: GenerationLogEntry) -> None:
        if self.path is None:
            return
        record = entry.to_record()
        line = json.dumps(
            record,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        with self._lock:
            with self.path.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(line)
                handle.write("\n")


def error_record(exc: BaseException) -> JsonObject:
    return {
        "type": type(exc).__name__,
        "message": str(exc),
    }


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00",
        "Z",
    )
