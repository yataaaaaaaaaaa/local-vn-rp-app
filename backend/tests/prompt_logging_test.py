from __future__ import annotations

from pathlib import Path
import tempfile
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from local_vn_rp_backend.runtime_wrapper import BackendRuntimeWrapper
from runtime_wrapper_test import FakeAnythingBackend, fake_api_loader


class PromptLoggingTest(unittest.TestCase):
    def setUp(self) -> None:
        FakeAnythingBackend.instances.clear()

    def test_llm_prompt_is_appended_to_configured_log_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "log_1.txt"
            wrapper = BackendRuntimeWrapper(
                api_loader=fake_api_loader,
                prompt_log_path=log_path,
            )
            wrapper.load_llm({"model_path": "D:/models/test.gguf"})
            wrapper.generate_llm({"prompt": "line 1\nline 2", "max_tokens": 8})

            log_text = log_path.read_text(encoding="utf-8")
            self.assertIn("kind: llm", log_text)
            self.assertIn("model_path: D:/models/test.gguf", log_text)
            self.assertIn("-----BEGIN PROMPT-----\nline 1\nline 2\n-----END PROMPT-----", log_text)

    def test_diffusion_prompts_are_appended_to_configured_log_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "log_1.txt"
            output_path = str(Path(tmp) / "image.png")
            wrapper = BackendRuntimeWrapper(
                api_loader=fake_api_loader,
                prompt_log_path=log_path,
            )
            wrapper.load_image_model({"model_path": "D:/models/image.safetensors"})
            wrapper.generate_image(
                {
                    "positive_prompt": "best quality, exact positive",
                    "negative_prompt": "lowres, exact negative",
                    "output_path": output_path,
                    "seed": 123,
                }
            )

            log_text = log_path.read_text(encoding="utf-8")
            self.assertIn("kind: diffusion", log_text)
            self.assertIn("model_path: D:/models/image.safetensors", log_text)
            self.assertIn("-----BEGIN PROMPT-----\nbest quality, exact positive\n-----END PROMPT-----", log_text)
            self.assertIn("-----BEGIN NEGATIVE PROMPT-----\nlowres, exact negative\n-----END NEGATIVE PROMPT-----", log_text)


if __name__ == "__main__":
    unittest.main()
