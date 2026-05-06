from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
import subprocess
import sys
import time

POLL_SECONDS = 0.75
WATCH_ROOT = Path(__file__).resolve().parent


def _source_files() -> Iterable[Path]:
    for path in WATCH_ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        if path.name == "dev_server.py":
            continue
        yield path


def _snapshot() -> dict[Path, tuple[int, int]]:
    snapshot: dict[Path, tuple[int, int]] = {}
    for path in _source_files():
        try:
            stat = path.stat()
        except FileNotFoundError:
            continue
        snapshot[path] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def _changed(before: dict[Path, tuple[int, int]], after: dict[Path, tuple[int, int]]) -> bool:
    return before != after


def _start_server(argv: list[str]) -> subprocess.Popen[bytes]:
    cmd = [sys.executable, "-m", "local_vn_rp_backend.simple_server", *argv]
    print("[backend-dev] starting backend server", flush=True)
    return subprocess.Popen(cmd)


def _stop_server(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    print("[backend-dev] stopping backend server", flush=True)
    process.terminate()
    try:
        process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        print("[backend-dev] backend did not stop after terminate; killing", flush=True)
        process.kill()
        process.wait(timeout=10)


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    last_snapshot = _snapshot()
    process = _start_server(args)

    try:
        while True:
            time.sleep(POLL_SECONDS)
            current_snapshot = _snapshot()
            if _changed(last_snapshot, current_snapshot):
                print("[backend-dev] backend source changed; restarting", flush=True)
                _stop_server(process)
                last_snapshot = current_snapshot
                process = _start_server(args)
                continue

            exit_code = process.poll()
            if exit_code is None:
                continue

            if exit_code == 0:
                print("[backend-dev] backend exited cleanly", flush=True)
                return 0

            print(f"[backend-dev] backend exited with code {exit_code}; waiting for source changes", flush=True)
            while True:
                time.sleep(POLL_SECONDS)
                current_snapshot = _snapshot()
                if _changed(last_snapshot, current_snapshot):
                    print("[backend-dev] backend source changed; restarting", flush=True)
                    last_snapshot = current_snapshot
                    process = _start_server(args)
                    break
    except KeyboardInterrupt:
        return 130
    finally:
        _stop_server(process)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
