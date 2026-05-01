from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from local_vn_rp_backend.storage_paths import configure_storage_paths, require_storage_paths, storage_paths


class StoragePathsTest(unittest.TestCase):
    def test_storage_paths_are_configured_from_launcher_payload(self) -> None:
        configured = configure_storage_paths(
            "test-project",
            "D:/Anything/storage/test-project-storage",
            "D:/Anything/storage/test-project-storage/stories",
            "D:/Anything/storage/test-project-storage/outputs",
        )
        self.assertEqual(require_storage_paths(), configured)
        self.assertEqual(
            storage_paths(),
            {
                "project_name": "test-project",
                "app_root": "D:/Anything/storage/test-project-storage",
                "story_root": "D:/Anything/storage/test-project-storage/stories",
                "output_root": "D:/Anything/storage/test-project-storage/outputs",
            },
        )


if __name__ == "__main__":
    unittest.main()
