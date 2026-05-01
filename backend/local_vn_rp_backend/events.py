from __future__ import annotations

from collections.abc import Callable
from queue import Queue
from threading import Lock
from typing import Any

ProgressPayload = dict[str, Any]
ProgressCallback = Callable[[ProgressPayload], None]


class EventBus:
    """Small in-process fan-out bus used by the compatibility SSE endpoint."""

    def __init__(self) -> None:
        self._callbacks: list[ProgressCallback] = []
        self._lock = Lock()

    def subscribe(self, callback: ProgressCallback) -> Callable[[], None]:
        with self._lock:
            self._callbacks.append(callback)

        def unsubscribe() -> None:
            with self._lock:
                if callback in self._callbacks:
                    self._callbacks.remove(callback)

        return unsubscribe

    def subscribe_queue(self) -> tuple[Queue[ProgressPayload], Callable[[], None]]:
        queue: Queue[ProgressPayload] = Queue()
        return queue, self.subscribe(queue.put)

    def publish(self, payload: ProgressPayload) -> None:
        with self._lock:
            callbacks = tuple(self._callbacks)
        for callback in callbacks:
            callback(dict(payload))
