from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from product_tests.test_local_product_smoke import (
    ENABLE_ENV,
    REPO_ROOT,
    REQUESTED_FILES,
    _free_tcp_port,
    _http_get_json,
    _product_temp_dir,
    _read_log_tail,
    _selected_product_llm_model,
    _started_launcher,
    _wait_for,
)


class StoryMechanismProductTest(unittest.TestCase):
    """Product test for the non-React story mechanism package.

    This test intentionally starts the real launcher/backend stack,
    then delegates the story-generation workflow to a Vitest product test that
    imports `@local-vn/story-mechanism`. The Python side owns process lifetime;
    the TypeScript side owns story behavior.
    """

    @unittest.skipUnless(os.environ.get(ENABLE_ENV) == "1", f"Set {ENABLE_ENV}=1 to run the story mechanism product test.")
    def test_story_mechanism_package_drives_real_backend(self) -> None:
        self._assert_requested_files_exist()

        with tempfile.TemporaryDirectory(prefix="local-vn-rp-story-mechanism-", dir=_product_temp_dir()) as temp_dir:
            workspace = Path(temp_dir)
            backend_port = _free_tcp_port()
            ready_file = workspace / "frontend-ready.json"
            launcher_log = workspace / "launcher.log"
            app_root = workspace / "app-root"
            story_root = app_root / "stories"
            output_root = app_root / "outputs"

            env = os.environ.copy()
            env.update(
                {
                    "LOCAL_VN_RP_FRONTEND_MODE": "product-test",
                    "LOCAL_VN_RP_FRONTEND_READY_FILE": str(ready_file),
                    "LOCAL_VN_RP_BACKEND_PORT": str(backend_port),
                    "LOCAL_VN_RP_APP_ROOT": str(app_root),
                    "LOCAL_VN_RP_STORY_ROOT": str(story_root),
                    "LOCAL_VN_RP_OUTPUT_ROOT": str(output_root),
                    "LOCAL_VN_RP_PRODUCT_BACKEND_URL": f"http://127.0.0.1:{backend_port}",
                    "LOCAL_VN_RP_PRODUCT_LLM_MODEL": str(_selected_product_llm_model()),
                    "LOCAL_VN_RP_DANBOT_MODEL": str(REQUESTED_FILES["danbot_nl"]),
                    "LOCAL_VN_RP_DIFFUSION_MODEL": str(REQUESTED_FILES["diffusion_checkpoint"]),
                    "LOCAL_VN_RP_DRAMATIC_LIGHTING_LORA": str(REQUESTED_FILES["dramatic_lighting_lora"]),
                    "LOCAL_VN_RP_LAZYNEG_EMBEDDING": str(REQUESTED_FILES["lazyneg_embedding"]),
                    "LOCAL_VN_RP_RUN_STORY_MECHANISM_PRODUCT_TEST": "1",
                    "LOCAL_VN_RP_PRODUCT_IMAGE_WIDTH": os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_WIDTH", "512"),
                    "LOCAL_VN_RP_PRODUCT_IMAGE_HEIGHT": os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_HEIGHT", "512"),
                    "LOCAL_VN_RP_PRODUCT_IMAGE_STEPS": os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_STEPS", "2"),
                    "PYTHONIOENCODING": "utf-8",
                }
            )

            base_url = f"http://127.0.0.1:{backend_port}"
            with _started_launcher(env=env, log_path=launcher_log, base_url=base_url):
                _wait_for(lambda: _http_get_json(f"{base_url}/health").get("ok") is True, "backend health", launcher_log)
                _wait_for(lambda: ready_file.exists(), "frontend product-test readiness file", launcher_log)

                completed = subprocess.run(
                    [
                        _required_tool("npm"),
                        "exec",
                        "--",
                        "vitest",
                        "run",
                        "tests/productStoryMechanism.product.test.ts",
                    ],
                    cwd=REPO_ROOT / "frontend",
                    env=env,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    timeout=int(os.environ.get("LOCAL_VN_RP_STORY_MECHANISM_PRODUCT_TIMEOUT_SECONDS", "2400")),
                )
                if completed.returncode != 0:
                    self.fail(
                        "Story mechanism product Vitest failed.\n"
                        f"Vitest output:\n{completed.stdout[-20_000:]}\n"
                        f"Launcher log tail:\n{_read_log_tail(launcher_log)}"
                    )

    def _assert_requested_files_exist(self) -> None:
        required_files = {
            "danbot_nl": REQUESTED_FILES["danbot_nl"],
            "llm": _selected_product_llm_model(),
            "diffusion_checkpoint": REQUESTED_FILES["diffusion_checkpoint"],
            "dramatic_lighting_lora": REQUESTED_FILES["dramatic_lighting_lora"],
            "lazyneg_embedding": REQUESTED_FILES["lazyneg_embedding"],
        }
        missing = {name: str(path) for name, path in required_files.items() if not path.exists()}
        if missing:
            details = "\n".join(f"- {name}: {path}" for name, path in missing.items())
            self.fail(f"The story mechanism product test requires every requested local model/asset file to exist. Missing:\n{details}")


def _required_tool(name: str) -> str:
    resolved = shutil.which(name)
    if resolved is None:
        raise AssertionError(f"Required executable not found on PATH: {name}")
    return resolved


if __name__ == "__main__":
    unittest.main()
