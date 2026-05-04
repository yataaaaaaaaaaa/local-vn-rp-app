from __future__ import annotations

from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
LAUNCHER_CLI = REPO_ROOT / "launcher" / "src" / "vn_rp_launcher" / "cli.py"


class LauncherConfigTest(unittest.TestCase):
    def test_repo_root_marker_uses_frontend_package_file(self) -> None:
        source = LAUNCHER_CLI.read_text(encoding="utf-8")
        self.assertIn('repo_root(markers=["frontend/package.json", "backend/pyproject.toml"])', source)

    def test_backend_command_receives_launcher_storage_paths(self) -> None:
        source = LAUNCHER_CLI.read_text(encoding="utf-8")
        self.assertIn('"--project-name",', source)
        self.assertIn('"{project_name}",', source)
        self.assertIn('"--app-root",', source)
        self.assertIn('"{app_root}",', source)
        self.assertIn('"--story-root",', source)
        self.assertIn('"{story_root}",', source)
        self.assertIn('"--output-root",', source)
        self.assertIn('"{output_root}",', source)

    def test_backend_command_receives_prompt_log_path(self) -> None:
        source = LAUNCHER_CLI.read_text(encoding="utf-8")
        self.assertIn('LOCAL_VN_RP_PROMPT_LOG_PATH', source)
        self.assertIn('f"log_{index}.txt"', source)
        self.assertIn('"--prompt-log-path",', source)
        self.assertIn('"{prompt_log_path}",', source)


    def test_launcher_no_longer_starts_or_configures_llama_server(self) -> None:
        source = LAUNCHER_CLI.read_text(encoding="utf-8")
        self.assertNotIn('"llama_server"', source)
        self.assertNotIn("--llama-server-host", source)
        self.assertNotIn("--llama-server-port", source)
        self.assertNotIn("--llama-server-path", source)


    def test_frontend_service_runs_inside_frontend_project(self) -> None:
        source = LAUNCHER_CLI.read_text(encoding="utf-8")
        self.assertIn('cwd="frontend"', source)
        self.assertIn('require.file("frontend/package.json")', source)
        self.assertIn('require.dir("frontend/node_modules/electron"', source)


if __name__ == "__main__":
    unittest.main()
