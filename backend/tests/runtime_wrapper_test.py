from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import tempfile
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from local_vn_rp_backend.runtime_wrapper import BackendRuntimeWrapper, RuntimeApi


@dataclass
class FakeEvent:
    event: str
    text: str = ""
    step: int = 0
    total_steps: int = 0
    fraction: float = 0.0
    output_path: str = ""
    seed: int = 0


class FakeJob:
    def __init__(self, events: list[FakeEvent]) -> None:
        self._events = events

    def stream(self) -> list[FakeEvent]:
        return self._events


class FakeRequest:
    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs


class FakeBackendConfig(FakeRequest):
    pass


class FakeAnythingBackend:
    instances: list["FakeAnythingBackend"] = []

    def __init__(self, config: FakeBackendConfig) -> None:
        self.config = config
        self.requests: list[FakeRequest] = []
        self.closed = False
        self.unloaded = False
        FakeAnythingBackend.instances.append(self)

    def submit_llm(self, request: FakeRequest) -> FakeJob:
        self.requests.append(request)
        return FakeJob([FakeEvent("queued"), FakeEvent("started"), FakeEvent("text_delta", text="hello"), FakeEvent("text_done")])

    def submit_danbotnl(self, request: FakeRequest) -> FakeJob:
        self.requests.append(request)
        return FakeJob([
            FakeEvent("started"),
            FakeEvent("text_delta", text="cat"),
            FakeEvent("text_delta", text="smile"),
            FakeEvent("text_delta", text=","),
            FakeEvent("text_delta", text="cat"),
            FakeEvent("text_done")
        ])

    def submit_diffusion(self, request: FakeRequest) -> FakeJob:
        self.requests.append(request)
        return FakeJob([FakeEvent("started"), FakeEvent("ksample_step", step=1, total_steps=2, fraction=0.5), FakeEvent("image_done", output_path=str(request.kwargs["output_path"]), seed=int(request.kwargs["seed"]))])

    def abort_all(self) -> object:
        return type("AbortResult", (), {"current_aborted": True, "queued_aborted": 2})()

    def unload(self) -> None:
        self.unloaded = True

    def close(self) -> None:
        self.closed = True


def fake_api_loader() -> RuntimeApi:
    return RuntimeApi(
        AnythingBackend=FakeAnythingBackend,
        BackendConfig=FakeBackendConfig,
        LlamaRequest=FakeRequest,
        DanbotNLRequest=FakeRequest,
        DiffusionRequest=FakeRequest,
    )


class RuntimeWrapperTest(unittest.TestCase):
    def setUp(self) -> None:
        FakeAnythingBackend.instances.clear()

    def test_llm_generation_delegates_to_anything_backend_runtime_request(self) -> None:
        wrapper = BackendRuntimeWrapper(api_loader=fake_api_loader)
        wrapper.load_llm({"model_path": "D:/models/test.gguf", "gpu_layers": "auto", "context_size": 4096})
        result = wrapper.generate_llm({"prompt": "hi", "max_tokens": 8, "temperature": 0.2, "stop": ["</s>"], "seed": 7})
        self.assertEqual(result["text"], "hello")
        backend = FakeAnythingBackend.instances[-1]
        self.assertEqual(backend.config.kwargs["llama_server_args"], ("--ctx-size", "4096", "--n-gpu-layers", "-1"))
        self.assertEqual(backend.requests[-1].kwargs["model_path"], "D:/models/test.gguf")

    def test_danbot_generation_delegates_and_deduplicates_tags(self) -> None:
        wrapper = BackendRuntimeWrapper(api_loader=fake_api_loader)
        wrapper.load_danbooru_tagger({"model_path": "D:/models/DanbotNL"})
        result = wrapper.generate_danbooru_tags({"scene_text": "cat", "max_tags": 5})
        self.assertEqual(result["tags"], ["cat", "smile"])
        self.assertEqual(FakeAnythingBackend.instances[-1].requests[-1].kwargs["path"], "D:/models/DanbotNL")

    def test_image_generation_delegates_and_writes_metadata_sidecar(self) -> None:
        wrapper = BackendRuntimeWrapper(api_loader=fake_api_loader)
        wrapper.load_image_model({"model_path": "D:/models/image.safetensors", "lora_root": "D:/loras", "embedding_root": "D:/embeddings"})
        with tempfile.TemporaryDirectory() as tmp:
            output_path = str(Path(tmp) / "image.png")
            result = wrapper.generate_image({"positive_prompt": "best", "negative_prompt": "bad", "output_path": output_path, "seed": 123, "steps": 2, "sampler": "euler_a"})
            self.assertEqual(result["image_path"], output_path)
            self.assertTrue(Path(str(result["metadata_path"])).exists())
            request = FakeAnythingBackend.instances[-1].requests[-1].kwargs
            self.assertEqual(request["model_path"], "D:/models/image.safetensors")
            self.assertEqual(request["prompt_lora_dir"], "D:/loras")
            self.assertEqual(request["sampler_name"], "euler_ancestral")

    def test_cancel_delegates_to_abort_all(self) -> None:
        wrapper = BackendRuntimeWrapper(api_loader=fake_api_loader)
        wrapper.load_llm({"model_path": "D:/models/test.gguf"})
        wrapper.generate_llm({"prompt": "hi"})
        self.assertEqual(wrapper.cancel(), {"cancelled": True, "current_aborted": True, "queued_aborted": 2})


if __name__ == "__main__":
    unittest.main()
