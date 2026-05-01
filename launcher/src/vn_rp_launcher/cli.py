from __future__ import annotations

import os
from pathlib import Path

from devlauncher import LauncherApp, http_post, http_ready, repo_root, require, service

PROJECT_NAME: str = "local-vn-rp-app"

BACKEND_HOST: str = os.environ.get("LOCAL_VN_RP_BACKEND_HOST", "127.0.0.1")
BACKEND_PORT: int = int(os.environ.get("LOCAL_VN_RP_BACKEND_PORT", "17860"))

APP_ROOT: str = os.environ.get("LOCAL_VN_RP_APP_ROOT", "D:/Anything/storage/local-vn-rp-app-storage")
STORY_ROOT: str = os.environ.get("LOCAL_VN_RP_STORY_ROOT", f"{APP_ROOT}/stories")
OUTPUT_ROOT: str = os.environ.get("LOCAL_VN_RP_OUTPUT_ROOT", f"{APP_ROOT}/outputs")

FRONTEND_MODE: str = os.environ.get("LOCAL_VN_RP_FRONTEND_MODE", "electron").strip().lower()


def _ensure_storage_dirs() -> None:
    for path in (APP_ROOT, STORY_ROOT, OUTPUT_ROOT):
        Path(path).mkdir(parents=True, exist_ok=True)


def _frontend_command() -> list[str]:
    launcher_args = [
        "--backend=http://{host}:{backend_port}",
        "--backend-host={host}",
        "--backend-port={backend_port}",
        "--app-root={app_root}",
        "--story-root={story_root}",
        "--output-root={output_root}",
    ]
    script = "product-test:frontend" if FRONTEND_MODE in {"product-test", "test", "smoke-test"} else "electron:start"
    return ["npm", "run", script, "--", *launcher_args]


def _frontend_requirements() -> tuple[object, ...]:
    requirements: list[object] = [
        require.tool("npm"),
        require.file("frontend/package.json"),
    ]
    if FRONTEND_MODE not in {"product-test", "test", "smoke-test"}:
        requirements.append(require.dir("frontend/node_modules/electron", hint="Run: cd frontend && npm install --no-audit --no-fund"))
    return tuple(requirements)


_ensure_storage_dirs()

app = LauncherApp(
    name=PROJECT_NAME,
    root=repo_root(markers=["frontend/package.json", "backend/pyproject.toml"]),
    defaults={
        "host": BACKEND_HOST,
        "backend_port": BACKEND_PORT,
        "project_name": PROJECT_NAME,
        "app_root": APP_ROOT,
        "story_root": STORY_ROOT,
        "output_root": OUTPUT_ROOT,
    },
    services=(
        service(
            "backend",
            cmd=[
                "uv",
                "run",
                "python",
                "-m",
                "local_vn_rp_backend.simple_server",
                "--host",
                "{host}",
                "--port",
                "{backend_port}",
                "--project-name",
                "{project_name}",
                "--app-root",
                "{app_root}",
                "--story-root",
                "{story_root}",
                "--output-root",
                "{output_root}",
            ],
            cwd="backend",
            requires=(
                require.tool("uv"),
                require.file("backend/pyproject.toml"),
                require.port_free("{host}", "{backend_port}"),
            ),
            ready=http_ready("http://{host}:{backend_port}/health"),
        ),
        service(
            "frontend",
            cmd=_frontend_command(),
            cwd="frontend",
            requires=_frontend_requirements(),
            depends_on=("backend",),
            optional=True,
            enabled_by_default=True,
        ),
    ),
    on_shutdown=(http_post("http://{host}:{backend_port}/runtime/shutdown"),),
)


def main() -> int:
    return app.run()


if __name__ == "__main__":
    raise SystemExit(main())
