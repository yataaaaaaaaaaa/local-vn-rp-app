from __future__ import annotations

from .generation_logger import GenerationLogEntry, GenerationLogger

PromptLogEntry = GenerationLogEntry
PromptLogger = GenerationLogger

__all__ = [
    "GenerationLogEntry",
    "GenerationLogger",
    "PromptLogEntry",
    "PromptLogger",
]
