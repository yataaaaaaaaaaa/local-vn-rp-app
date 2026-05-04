from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from local_vn_rp_backend.runtime_wrapper import BackendRuntimeWrapper, RuntimeApi
from runtime_wrapper_test import (
    FakeAnythingBackend,
    FakeBackendConfig,
    FakeEvent,
    FakeJob,
    FakeRequest,
    fake_api_loader,
)


class QuotedOutputBackend(FakeAnythingBackend):
    def submit_llm(self, request: FakeRequest) -> FakeJob:
        self.requests.append(request)
        return FakeJob([
            FakeEvent("started"),
            FakeEvent("text_delta", text='hello "quoted" output\nnext line'),
            FakeEvent("text_done"),
        ])


def quoted_output_api_loader() -> RuntimeApi:
    return RuntimeApi(
        AnythingBackend=QuotedOutputBackend,
        BackendConfig=FakeBackendConfig,
        LlamaRequest=FakeRequest,
        DanbotNLRequest=FakeRequest,
        DiffusionRequest=FakeRequest,
    )


class PromptLoggingTest(unittest.TestCase):
    def setUp(self) -> None:
        FakeAnythingBackend.instances.clear()
        QuotedOutputBackend.instances.clear()

    def test_llm_generation_is_appended_as_jsonl_with_output_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "generation.log.jsonl"
            wrapper = BackendRuntimeWrapper(
                api_loader=quoted_output_api_loader,
                prompt_log_path=log_path,
            )
            wrapper.load_llm({"model_path": "D:/models/test.gguf"})
            wrapper.generate_llm(
                {"prompt": 'line 1\nline "2"', "max_tokens": 8, "seed": 7}
            )

            lines = log_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["schema_version"], "local_vn_rp.generation_log.v1")
            self.assertEqual(record["event"], "generation.completed")
            self.assertEqual(record["kind"], "llm")
            self.assertEqual(record["model"]["path"], "D:/models/test.gguf")
            self.assertEqual(record["parameters"]["max_tokens"], 8)
            self.assertEqual(record["parameters"]["seed"], 7)
            self.assertEqual(record["input"]["prompt"], 'line 1\nline "2"')
            self.assertEqual(
                record["output"]["text"], 'hello "quoted" output\nnext line'
            )
            self.assertEqual(record["output"]["finish_reason"], "stop")
            self.assertIsNone(record["error"])

    def test_diffusion_generation_is_appended_as_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "generation.log.jsonl"
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

            lines = log_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["event"], "generation.completed")
            self.assertEqual(record["kind"], "diffusion")
            self.assertEqual(record["model"]["path"], "D:/models/image.safetensors")
            self.assertEqual(record["input"]["prompt"], "best quality, exact positive")
            self.assertEqual(record["input"]["negative_prompt"], "lowres, exact negative")
            self.assertEqual(record["output"]["image_path"], output_path)
            self.assertEqual(record["output"]["seed"], 123)
            self.assertIsNone(record["error"])


if __name__ == "__main__":
    unittest.main()
