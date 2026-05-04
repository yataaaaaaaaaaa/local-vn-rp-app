from __future__ import annotations

import argparse
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from queue import Empty
from threading import Event
import time
from typing import Any, ClassVar
from urllib.parse import urlparse

from .runtime_wrapper import BackendRuntimeWrapper, JsonBody
from .storage_paths import StoragePaths, configure_storage_paths, require_storage_paths


@dataclass(frozen=True)
class ServerSentEvent:
    data: object | None = None
    comment: str | None = None

    def encode(self) -> bytes:
        if self.comment is not None:
            return f": {self.comment}\n\n".encode("utf-8")
        data = json.dumps(self.data, ensure_ascii=False, separators=(",", ":"))
        return f"data: {data}\n\n".encode("utf-8")


class BackendHttpServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False
    wrapper: BackendRuntimeWrapper
    storage_paths: StoragePaths

    def __init__(self, server_address: tuple[str, int], request_handler_class: type[BaseHTTPRequestHandler]) -> None:
        self.stopping = Event()
        super().__init__(server_address, request_handler_class)

    def shutdown(self) -> None:
        self.stopping.set()
        super().shutdown()


class BackendRequestHandler(BaseHTTPRequestHandler):
    server: BackendHttpServer
    routes_get: ClassVar[set[str]] = {"/health", "/events", "/runtime/status", "/assets/loras", "/assets/embeddings"}

    def do_GET(self) -> None:  # noqa: N802 - stdlib API name
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json(self.server.wrapper.health())
        elif path == "/events":
            self._stream_events()
        elif path == "/runtime/status":
            self._send_json(self.server.wrapper.snapshot())
        elif path == "/assets/loras":
            self._send_json(self.server.wrapper.list_loras())
        elif path == "/assets/embeddings":
            self._send_json(self.server.wrapper.list_embeddings())
        else:
            self._send_json({"error": f"unknown endpoint {path}"}, status=404)

    def do_POST(self) -> None:  # noqa: N802 - stdlib API name
        path = urlparse(self.path).path
        body = self._read_json_body()
        try:
            if path == "/runtime/shutdown":
                self._send_json(self.server.wrapper.shutdown())
                self.server.shutdown()
            elif path == "/runtime/cancel":
                self._send_json(self.server.wrapper.cancel())
            elif path == "/llm/load":
                self._send_json(self.server.wrapper.load_llm(body))
            elif path == "/llm/unload":
                self._send_json(self.server.wrapper.unload_llm())
            elif path == "/llm/generate":
                self._send_json(self.server.wrapper.generate_llm(body))
            elif path == "/llm/tokenize":
                self._send_json({"tokens": self.server.wrapper.tokenize_llm(str(body.get("text", "")))})
            elif path == "/image-model/load":
                self._send_json(self.server.wrapper.load_image_model(body))
            elif path == "/image-model/unload":
                self._send_json(self.server.wrapper.unload_image_model())
            elif path == "/danbot/load":
                self._send_json(self.server.wrapper.load_danbooru_tagger(body))
            elif path == "/danbot/unload":
                self._send_json(self.server.wrapper.unload_danbooru_tagger())
            elif path == "/danbot/generate-tags":
                self._send_json(self.server.wrapper.generate_danbooru_tags(body))
            elif path == "/image/generate":
                self._send_json(self.server.wrapper.generate_image(body))
            elif path == "/image/interrogate-assets":
                self._send_json(self.server.wrapper.rescan_assets(body))
            elif path == "/assets/rescan":
                self._send_json(self.server.wrapper.rescan_assets(body))
            elif path == "/assets/resolve":
                self._send_json(self.server.wrapper.resolve_assets(body))
            else:
                self._send_json({"error": f"unknown endpoint {path}"}, status=404)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=400)
        except Exception as exc:  # pragma: no cover - integration safety net.
            self._send_json({"error": str(exc)}, status=500)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - stdlib signature
        return

    def _stream_events(self) -> None:
        queue, unsubscribe = self.server.wrapper.event_bus.subscribe_queue()
        self.send_response(200)
        self.send_header("content-type", "text/event-stream; charset=utf-8")
        self.send_header("cache-control", "no-cache")
        self.send_header("connection", "keep-alive")
        self.send_header("x-accel-buffering", "no")
        self.end_headers()
        try:
            self._write_sse(ServerSentEvent(comment="connected"))
            last_heartbeat = time.monotonic()
            while not self.server.stopping.is_set():
                try:
                    payload = queue.get(timeout=0.25)
                except Empty:
                    if time.monotonic() - last_heartbeat >= 15.0:
                        self._write_sse(ServerSentEvent(comment="heartbeat"))
                        last_heartbeat = time.monotonic()
                    continue
                self._write_sse(ServerSentEvent(data=payload))
        except (BrokenPipeError, ConnectionResetError, OSError):
            return
        finally:
            unsubscribe()

    def _write_sse(self, event: ServerSentEvent) -> None:
        self.wfile.write(event.encode())
        self.wfile.flush()

    def _read_json_body(self) -> JsonBody:
        length = int(self.headers.get("content-length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}

    def _send_json(self, payload: object, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def create_server(
    host: str,
    port: int,
    storage_paths: StoragePaths | None = None,
    wrapper: BackendRuntimeWrapper | None = None,
    prompt_log_path: str | None = None,
) -> BackendHttpServer:
    paths = storage_paths or require_storage_paths()
    server = BackendHttpServer((host, port), BackendRequestHandler)
    server.storage_paths = paths
    server.wrapper = wrapper or BackendRuntimeWrapper(
        storage_paths=paths,
        prompt_log_path=prompt_log_path,
    )
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the local VN/RP backend wrapper")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--project-name", required=True)
    parser.add_argument("--app-root", required=True)
    parser.add_argument("--story-root", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument(
        "--prompt-log-path",
        default="",
        help="Optional text file path where exact LLM and diffusion prompts are appended.",
    )
    args = parser.parse_args(argv)
    paths = configure_storage_paths(str(args.project_name), str(args.app_root), str(args.story_root), str(args.output_root))
    server = create_server(
        str(args.host),
        int(args.port),
        storage_paths=paths,
        prompt_log_path=str(args.prompt_log_path) or None,
    )
    try:
        server.serve_forever()
    finally:
        server.wrapper.close()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
