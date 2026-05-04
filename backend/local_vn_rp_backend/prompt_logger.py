from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


@dataclass(frozen=True)
class PromptLogEntry:
    kind: str
    job_id: str
    model_path: str
    prompt: str
    negative_prompt: str | None = None
    extra: dict[str, Any] | None = None


class PromptLogger:
    """Append-only prompt logger for requests sent to the backend runtime."""

    def __init__(self, path: str | Path | None) -> None:
        self.path = Path(path) if path else None
        self._lock = Lock()
        if self.path is not None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.touch(exist_ok=True)

    @property
    def enabled(self) -> bool:
        return self.path is not None

    def log(self, entry: PromptLogEntry) -> None:
        if self.path is None:
            return
        timestamp = datetime.now(timezone.utc).isoformat()
        extra = entry.extra or {}
        lines = [
            "=" * 80,
            f"timestamp_utc: {timestamp}",
            f"kind: {entry.kind}",
            f"job_id: {entry.job_id}",
            f"model_path: {entry.model_path}",
        ]
        for key in sorted(extra):
            value = extra[key]
            lines.append(f"{key}: {value}")
        lines.extend([
            "prompt:",
            "-----BEGIN PROMPT-----",
            entry.prompt,
            "-----END PROMPT-----",
        ])
        if entry.negative_prompt is not None:
            lines.extend([
                "negative_prompt:",
                "-----BEGIN NEGATIVE PROMPT-----",
                entry.negative_prompt,
                "-----END NEGATIVE PROMPT-----",
            ])
        lines.append("")
        with self._lock:
            with self.path.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write("\n".join(lines))
