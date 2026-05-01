from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable
from urllib.error import HTTPError
from urllib.error import URLError
from urllib.request import Request, urlopen
import unittest

REPO_ROOT = Path(__file__).resolve().parents[1]
ENABLE_ENV = "LOCAL_VN_RP_RUN_PRODUCT_TEST"

REQUESTED_FILES = {
    "danbot_nl": Path(
        os.environ.get(
            "LOCAL_VN_RP_DANBOT_MODEL",
            r"D:\Anything\llm\DanbotNL-2408-260M.safetensors",
        )
    ),
    "llm_q6": Path(
        os.environ.get(
            "LOCAL_VN_RP_LLM_MODEL_Q6",
            r"D:\Anything\llm\Forgotten-Safeword-12B-v4.0.Q6_K.gguf",
        )
    ),
    "llm_q5": Path(
        os.environ.get(
            "LOCAL_VN_RP_LLM_MODEL_Q5",
            r"D:\Anything\llm\Forgotten-Safeword-12B-v4.0.Q5_K_M.gguf",
        )
    ),
    "diffusion_checkpoint": Path(
        os.environ.get(
            "LOCAL_VN_RP_DIFFUSION_MODEL",
            r"D:\Anything\ComfyUI\ComfyUI\models\checkpoints\JANKUV5NSFWTrainedNoobai_v50.safetensors",
        )
    ),
    "dramatic_lighting_lora": Path(
        os.environ.get(
            "LOCAL_VN_RP_DRAMATIC_LIGHTING_LORA",
            r"D:\Anything\ComfyUI\ComfyUI\models\loras\illustrous\Dramatic Lighting Slider.safetensors",
        )
    ),
    "lazyneg_embedding": Path(
        os.environ.get(
            "LOCAL_VN_RP_LAZYNEG_EMBEDDING",
            r"D:\Anything\ComfyUI\ComfyUI\models\embeddings\il\lazyneg.safetensors",
        )
    ),
}
STORY_ID = "product-smoke-story"
STORY_TITLE = "Product Smoke Story"
STORY_NODE_FIELD_KEYS = [
    "context",
    "userText",
    "dialogue",
    "visualDescription",
    "resolverText",
    "selectedTags",
    "danbotTags",
    "positivePrompt",
    "negativePrompt",
    "imageRef",
]
STORY_SCHEMA = {
    "fields": {
        "context": {"storage": "diff"},
        "userText": {"storage": "diff"},
        "dialogue": {"storage": "diff"},
        "visualDescription": {"storage": "diff"},
        "resolverText": {"storage": "raw"},
        "selectedTags": {"storage": "raw"},
        "danbotTags": {"storage": "raw"},
        "positivePrompt": {"storage": "raw"},
        "negativePrompt": {"storage": "raw"},
        "imageRef": {"storage": "raw"},
    }
}
DEFAULT_NEGATIVE_PROMPT = "lowres, bad anatomy"


class LocalProductSmokeTest(unittest.TestCase):
    """End-to-end product smoke test for the local Windows model stack.

    The test is intentionally opt-in because it starts the real launcher and can
    load local LLM, DanBotNL, and diffusion models. It is meant for the product
    machine, not normal unit-test or CI runs.
    """

    @unittest.skipUnless(
        os.environ.get(ENABLE_ENV) == "1",
        f"Set {ENABLE_ENV}=1 to run the local product smoke test.",
    )
    def test_story_dialog_tag_and_image_pipeline_with_real_launcher(self) -> None:
        self._assert_requested_files_exist()

        with tempfile.TemporaryDirectory(
            prefix="local-vn-rp-product-", dir=_product_temp_dir()
        ) as temp_dir:
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
                    "PYTHONIOENCODING": "utf-8",
                }
            )

            base_url = f"http://127.0.0.1:{backend_port}"
            with _started_launcher(env=env, log_path=launcher_log, base_url=base_url):
                _wait_for(
                    lambda: _http_get_json(f"{base_url}/health").get("ok") is True,
                    "backend health",
                    launcher_log,
                )
                _wait_for(
                    lambda: ready_file.exists(),
                    "frontend product-test readiness file",
                    launcher_log,
                )

                health = _http_get_json(f"{base_url}/health")
                self.assertTrue(health["ok"])
                self.assertEqual(
                    health["storage_paths"]["output_root"], str(output_root)
                )
                ready_payload = _read_json_file(ready_file)
                self.assertEqual(ready_payload["mode"], "product-test")
                self.assertEqual(ready_payload["args"]["backend"], base_url)
                self.assertEqual(ready_payload["args"]["story-root"], str(story_root))
                self.assertEqual(ready_payload["args"]["output-root"], str(output_root))

                self._load_runtime_models(base_url)
                selection = self._generate_story_selection(base_url)
                self.assertGreater(len(selection), 10)

                story = ProductStoryRun(
                    story_root=story_root, story_id=STORY_ID, title=STORY_TITLE
                )
                story.update_current(context=selection)
                story.save()
                story.assert_persisted(self)

                previous_answer = selection
                for step_index in range(1, 3):
                    node_id = f"step-{step_index}"
                    story.add_child(node_id, context=previous_answer)
                    story.save()

                    user_dialog = self._generate_automatic_user_dialog(
                        base_url, step_index, previous_answer
                    )
                    self.assertGreater(
                        len(user_dialog),
                        5,
                        f"step {step_index} automatic user dialog should not be empty",
                    )
                    story.update_current(userText=user_dialog)
                    story.save()

                    answer = self._generate_story_answer(
                        base_url, step_index, previous_answer, user_dialog
                    )
                    self.assertGreater(
                        len(answer),
                        10,
                        f"step {step_index} story answer should not be empty",
                    )
                    story.update_current(dialogue=answer)
                    story.save()

                    visual_description = self._generate_visual_description(
                        base_url, step_index, previous_answer, user_dialog, answer
                    )
                    self.assertGreater(
                        len(visual_description),
                        10,
                        f"step {step_index} visual description should not be empty",
                    )
                    story.update_current(
                        visualDescription=visual_description,
                        resolverText=visual_description,
                    )
                    story.save()

                    tag_result = self._generate_tags(base_url, visual_description)
                    self.assertTrue(
                        tag_result["tags"],
                        f"step {step_index} DanBotNL tags should not be empty",
                    )
                    self.assertIn("prompt", tag_result)
                    tag_text = ", ".join(str(tag) for tag in tag_result["tags"])
                    positive_prompt = str(tag_result["prompt"]).strip()
                    self.assertGreater(
                        len(positive_prompt),
                        5,
                        f"step {step_index} positive prompt should not be empty",
                    )
                    story.update_current(
                        selectedTags=tag_text,
                        danbotTags=tag_text,
                        positivePrompt=positive_prompt,
                    )
                    story.save()

                    image_result = self._generate_image(
                        base_url=base_url,
                        output_root=output_root,
                        step_index=step_index,
                        node_id=node_id,
                        positive_prompt=positive_prompt,
                    )
                    image_path = Path(image_result["image_path"])
                    metadata_path = Path(image_result["metadata_path"])
                    self.assertTrue(
                        image_path.exists(),
                        f"step {step_index} generated image does not exist: {image_path}",
                    )
                    self.assertTrue(
                        metadata_path.exists(),
                        f"step {step_index} metadata sidecar does not exist: {metadata_path}",
                    )
                    self.assertGreater(
                        image_path.stat().st_size,
                        0,
                        f"step {step_index} generated image is empty: {image_path}",
                    )
                    self.assertEqual(image_path.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                    self.assertEqual(
                        metadata["model_path"],
                        str(REQUESTED_FILES["diffusion_checkpoint"]),
                    )
                    self.assertEqual(metadata["request"]["steps"], 2)
                    self.assertEqual(metadata["metadata"]["story_id"], STORY_ID)
                    self.assertEqual(metadata["metadata"]["node_id"], node_id)

                    image_ref = {
                        "image_id": f"product-smoke-step-{step_index}",
                        "image_path": str(image_path),
                        "metadata_path": str(metadata_path),
                        "seed": int(image_result["seed"]),
                        "created_at": _iso_now(),
                    }
                    story.image_refs[node_id] = image_ref
                    story.update_current(
                        imageRef=json.dumps(image_ref, separators=(",", ":"))
                    )
                    story.save()
                    story.assert_persisted(self, expected_node_id=node_id)

                    persisted_node = _read_json_file(story.node_file(node_id))
                    self.assertEqual(persisted_node["context"], previous_answer)
                    self.assertEqual(persisted_node["userText"], user_dialog)
                    self.assertEqual(persisted_node["dialogue"], answer)
                    self.assertEqual(
                        persisted_node["visualDescription"], visual_description
                    )
                    self.assertEqual(persisted_node["danbotTags"], tag_text)
                    self.assertEqual(persisted_node["positivePrompt"], positive_prompt)
                    self.assertEqual(json.loads(persisted_node["imageRef"]), image_ref)

                    previous_answer = f"{answer}\n\nVisual state: {visual_description}"

    def _assert_requested_files_exist(self) -> None:
        required_files = {
            "danbot_nl": REQUESTED_FILES["danbot_nl"],
            "llm": _selected_product_llm_model(),
            "diffusion_checkpoint": REQUESTED_FILES["diffusion_checkpoint"],
            "dramatic_lighting_lora": REQUESTED_FILES["dramatic_lighting_lora"],
            "lazyneg_embedding": REQUESTED_FILES["lazyneg_embedding"],
        }
        missing = {
            name: str(path)
            for name, path in required_files.items()
            if not path.exists()
        }
        if missing:
            details = "\n".join(f"- {name}: {path}" for name, path in missing.items())
            self.fail(
                f"The product smoke test requires every requested local model/asset file to exist. Missing:\n{details}"
            )

    def _load_runtime_models(self, base_url: str) -> None:
        llm_model = _selected_product_llm_model()
        self.assertTrue(
            llm_model.exists(),
            f"Selected product-test LLM model does not exist: {llm_model}",
        )

        llm_status = _http_post_json(
            f"{base_url}/llm/load",
            {
                "model_path": str(llm_model),
                "context_size": int(
                    os.environ.get("LOCAL_VN_RP_PRODUCT_LLM_CONTEXT", "8192")
                ),
                "gpu_layers": os.environ.get(
                    "LOCAL_VN_RP_PRODUCT_LLM_GPU_LAYERS", "auto"
                ),
                "prompt_format": "mistral_inst",
                "timeout_seconds": _request_timeout_seconds(),
            },
        )
        self.assertEqual(llm_status["loaded_llm"], str(llm_model))

        danbot_status = _http_post_json(
            f"{base_url}/danbot/load",
            {
                "model_path": str(REQUESTED_FILES["danbot_nl"]),
                "device": os.environ.get("LOCAL_VN_RP_PRODUCT_DANBOT_DEVICE", "cpu"),
                "dtype": os.environ.get("LOCAL_VN_RP_PRODUCT_DANBOT_DTYPE", "auto"),
            },
        )
        self.assertEqual(
            danbot_status["loaded_danbot_model"], str(REQUESTED_FILES["danbot_nl"])
        )

        image_status = _http_post_json(
            f"{base_url}/image-model/load",
            {
                "model_path": str(REQUESTED_FILES["diffusion_checkpoint"]),
                "model_type": "sdxl",
                "dtype": os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_DTYPE", "fp16"),
                "device": os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_DEVICE", "cuda"),
                "lora_root": str(REQUESTED_FILES["dramatic_lighting_lora"].parent),
                "embedding_root": str(REQUESTED_FILES["lazyneg_embedding"].parent),
            },
        )
        self.assertEqual(
            image_status["loaded_image_model"],
            str(REQUESTED_FILES["diffusion_checkpoint"]),
        )

    def _generate_story_selection(self, base_url: str) -> str:
        result = self._generate_llm(
            base_url,
            (
                "[INST] You are executing a deterministic smoke test for a local visual novel app. "
                "Choose one concise, non-explicit fantasy mystery premise from: moonlit library, rain station, or glass garden. "
                "Return the selected premise and one opening sentence only. [/INST]"
            ),
            max_tokens=96,
        )
        return str(result["text"]).strip()

    def _generate_visual_description(
        self,
        base_url: str,
        step_index: int,
        previous_answer: str,
        user_dialog: str,
        answer: str,
    ) -> str:
        result = self._generate_llm(
            base_url,
            (
                "[INST] Describe the current visual-novel scene for image generation in two compact visual sentences. "
                "Include subject, environment, lighting, composition, and mood. "
                "Do not write dialogue, Danbooru tags, comma prompts, JSON, or Stable Diffusion syntax. "
                f"Step: {step_index}. Previous scene: {previous_answer}. Player says: {user_dialog}. Narrator says: {answer} [/INST]"
            ),
            max_tokens=128,
        )
        return str(result["text"]).strip()

    def _generate_automatic_user_dialog(
        self, base_url: str, step_index: int, previous_answer: str
    ) -> str:
        result = self._generate_llm(
            base_url,
            (
                "[INST] Generate the player character's next line for a visual novel smoke test. "
                "Return only one short line of dialogue, no narration. "
                f"Step: {step_index}. Previous scene: {previous_answer} [/INST]"
            ),
            max_tokens=64,
        )
        return str(result["text"]).strip().strip('"')

    def _generate_story_answer(
        self, base_url: str, step_index: int, previous_answer: str, user_dialog: str
    ) -> str:
        result = self._generate_llm(
            base_url,
            (
                "[INST] Continue this local visual novel smoke test in two compact sentences. "
                "Keep the scene safe-for-work, visual, and concrete. "
                f"Step: {step_index}. Previous scene: {previous_answer}. Player says: {user_dialog} [/INST]"
            ),
            max_tokens=128,
        )
        return str(result["text"]).strip()

    def _generate_tags(self, base_url: str, scene_text: str) -> dict[str, Any]:
        return _http_post_json(
            f"{base_url}/danbot/generate-tags",
            {
                "scene_text": scene_text,
                "model_path": str(REQUESTED_FILES["danbot_nl"]),
                "max_tags": 40,
                "rating": "general",
                "length": "short",
                "translate_mode": "exact",
            },
            timeout_seconds=_request_timeout_seconds(),
        )

    def _generate_image(
        self,
        base_url: str,
        output_root: Path,
        step_index: int,
        node_id: str,
        positive_prompt: str,
    ) -> dict[str, Any]:
        output_path = output_root / STORY_ID / f"step-{step_index}.png"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        prompt = f"<lora:Dramatic Lighting Slider:0.55>, {positive_prompt}, dramatic lighting, visual novel background"
        return _http_post_json(
            f"{base_url}/image/generate",
            {
                "positive_prompt": prompt,
                "negative_prompt": "lazyneg, lowres, blurry, text, watermark",
                "model_path": str(REQUESTED_FILES["diffusion_checkpoint"]),
                "width": int(os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_WIDTH", "768")),
                "height": int(
                    os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_HEIGHT", "768")
                ),
                "steps": 2,
                "cfg_scale": float(
                    os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_CFG", "4.5")
                ),
                "sampler": os.environ.get(
                    "LOCAL_VN_RP_PRODUCT_IMAGE_SAMPLER", "euler_ancestral"
                ),
                "scheduler": os.environ.get(
                    "LOCAL_VN_RP_PRODUCT_IMAGE_SCHEDULER", "normal"
                ),
                "seed": 10_000 + step_index,
                "timeout_seconds": int(
                    os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_TIMEOUT_SECONDS", "900")
                ),
                "output_path": str(output_path),
                "metadata": {
                    "story_id": STORY_ID,
                    "node_id": node_id,
                    "image_id": f"product-smoke-step-{step_index}",
                    "test_kind": "local_product_smoke",
                },
            },
            timeout_seconds=int(
                os.environ.get("LOCAL_VN_RP_PRODUCT_IMAGE_HTTP_TIMEOUT_SECONDS", "1200")
            ),
        )

    def _generate_llm(
        self, base_url: str, prompt: str, max_tokens: int
    ) -> dict[str, Any]:
        llm_model = _selected_product_llm_model()
        return _http_post_json(
            f"{base_url}/llm/generate",
            {
                "prompt": prompt,
                "model_path": str(llm_model),
                "max_tokens": max_tokens,
                "temperature": 0.45,
                "top_p": 0.9,
                "top_k": 40,
                "min_p": 0.05,
                "repeat_penalty": 1.08,
                "timeout_seconds": _request_timeout_seconds(),
            },
            timeout_seconds=_request_timeout_seconds(),
        )


class ProductStoryRun:
    def __init__(self, story_root: Path, story_id: str, title: str) -> None:
        now = _iso_now()
        self.story_root = story_root
        self.story_id = story_id
        self.title = title
        self.root_node_id = "node-0"
        self.selected_node_id = self.root_node_id
        self.manifest = {
            "story_id": story_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "root_node_id": self.root_node_id,
        }
        self.parent_by_node: dict[str, str | None] = {self.root_node_id: None}
        self.child_ids_by_node: dict[str, list[str]] = {self.root_node_id: []}
        self.fields_by_node: dict[str, dict[str, str]] = {
            self.root_node_id: _empty_story_fields(context=f"Story: {title}")
        }
        self.created_at_by_node: dict[str, str] = {self.root_node_id: now}
        self.updated_at_by_node: dict[str, str] = {self.root_node_id: now}
        self.image_refs: dict[str, dict[str, Any]] = {}

    def add_child(self, node_id: str, **fields: str) -> None:
        if node_id in self.fields_by_node:
            raise AssertionError(f"Duplicate test node id: {node_id}")
        parent_id = self.selected_node_id
        now = _iso_now()
        self.parent_by_node[node_id] = parent_id
        self.child_ids_by_node[node_id] = []
        self.child_ids_by_node[parent_id].append(node_id)
        self.fields_by_node[node_id] = _empty_story_fields(**fields)
        self.created_at_by_node[node_id] = now
        self.updated_at_by_node[node_id] = now
        self.updated_at_by_node[parent_id] = now
        self.selected_node_id = node_id

    def update_current(self, **fields: str) -> None:
        current = self.fields_by_node[self.selected_node_id]
        for key, value in fields.items():
            if key not in current:
                raise AssertionError(
                    f"Unknown story node field in product smoke test: {key}"
                )
            current[key] = value
        self.updated_at_by_node[self.selected_node_id] = _iso_now()

    def save(self) -> None:
        self.manifest["updated_at"] = _iso_now()
        directory = self.story_root / self.story_id
        nodes_directory = directory / "nodes"
        nodes_directory.mkdir(parents=True, exist_ok=True)
        _write_json_file(directory / "story.json", self.manifest)
        _write_json_file(
            directory / "tree.json",
            json.dumps(self._tree_payload(), ensure_ascii=False),
        )
        _write_json_file(
            directory / "zustand.story-state.json",
            {
                "selected_story_id": self.story_id,
                "selected_node_id": self.selected_node_id,
                "image_refs": self.image_refs,
            },
        )
        _write_json_file(
            self.node_file(self.selected_node_id),
            self.fields_by_node[self.selected_node_id],
        )

    def assert_persisted(
        self, test_case: unittest.TestCase, expected_node_id: str | None = None
    ) -> None:
        directory = self.story_root / self.story_id
        expected_node = expected_node_id or self.selected_node_id
        manifest = _read_json_file(directory / "story.json")
        state = _read_json_file(directory / "zustand.story-state.json")
        serialized_tree = _read_json_file(directory / "tree.json")
        tree = (
            json.loads(serialized_tree)
            if isinstance(serialized_tree, str)
            else serialized_tree
        )
        node_sidecar = _read_json_file(self.node_file(expected_node))

        test_case.assertEqual(manifest["story_id"], self.story_id)
        test_case.assertEqual(manifest["root_node_id"], self.root_node_id)
        test_case.assertEqual(state["selected_story_id"], self.story_id)
        test_case.assertEqual(state["selected_node_id"], self.selected_node_id)
        test_case.assertIn(expected_node, tree["nodes"])
        test_case.assertEqual(tree["rootId"], self.root_node_id)
        test_case.assertEqual(node_sidecar, self.fields_by_node[expected_node])

    def node_file(self, node_id: str) -> Path:
        return self.story_root / self.story_id / "nodes" / f"{node_id}.json"

    def _tree_payload(self) -> dict[str, Any]:
        nodes: dict[str, Any] = {}
        for node_id, fields in self.fields_by_node.items():
            parent_id = self.parent_by_node[node_id]
            nodes[node_id] = {
                "id": node_id,
                "parentId": parent_id,
                "childIds": self.child_ids_by_node[node_id],
                "fields": self._stored_fields_for_node(node_id, fields, parent_id),
                "createdAt": self.created_at_by_node[node_id],
                "updatedAt": self.updated_at_by_node[node_id],
            }
        return {
            "version": 1,
            "schema": STORY_SCHEMA,
            "rootId": self.root_node_id,
            "nodes": nodes,
            "createdAt": self.created_at_by_node[self.root_node_id],
            "updatedAt": self.manifest["updated_at"],
        }

    def _stored_fields_for_node(
        self, node_id: str, fields: dict[str, str], parent_id: str | None
    ) -> dict[str, Any]:
        stored: dict[str, Any] = {}
        parent_fields = (
            self.fields_by_node[parent_id] if parent_id is not None else None
        )
        for field_name in STORY_NODE_FIELD_KEYS:
            storage = STORY_SCHEMA["fields"][field_name]["storage"]
            text = fields[field_name]
            if parent_fields is None or storage == "raw":
                stored[field_name] = {"kind": "raw", "text": text}
            else:
                stored[field_name] = {
                    "kind": "diff",
                    "patch": _create_line_patch(parent_fields[field_name], text),
                }
        return stored


@contextmanager
def _started_launcher(env: dict[str, str], log_path: Path, base_url: str):
    creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    with log_path.open("w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [sys.executable, "-m", "launcher"],
            cwd=REPO_ROOT,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=creationflags,
        )
        try:
            yield process
        finally:
            try:
                _http_post_json(f"{base_url}/runtime/shutdown", {}, timeout_seconds=5)
            except Exception:
                pass
            _terminate_process(process)
            log_file.flush()


def _terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt" and hasattr(signal, "CTRL_BREAK_EVENT"):
            process.send_signal(signal.CTRL_BREAK_EVENT)  # type: ignore[arg-type]
        else:
            process.terminate()
        process.wait(timeout=20)
    except Exception:
        try:
            process.kill()
            process.wait(timeout=10)
        except Exception:
            pass


def _wait_for(predicate: Callable[[], bool], description: str, log_path: Path) -> None:
    deadline = time.monotonic() + int(
        os.environ.get("LOCAL_VN_RP_PRODUCT_STARTUP_TIMEOUT_SECONDS", "180")
    )
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except (
            Exception
        ) as exc:  # Polling readiness normally sees transient connection errors.
            last_error = exc
        time.sleep(0.5)
    log_tail = _read_log_tail(log_path)
    detail = f" Last error: {last_error!r}." if last_error is not None else ""
    raise AssertionError(
        f"Timed out waiting for {description}.{detail}\nLauncher log tail:\n{log_tail}"
    )


def _http_get_json(url: str, timeout_seconds: int = 5) -> dict[str, Any]:
    with urlopen(url, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def _http_post_json(
    url: str, body: dict[str, Any], timeout_seconds: int = 30
) -> dict[str, Any]:
    request = Request(
        url,
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except HTTPError as exc:
        try:
            payload = exc.read().decode("utf-8", errors="replace")
        except Exception:
            payload = "<response body unavailable>"
        raise AssertionError(
            f"HTTP request failed: {url}: HTTP {exc.code}: {payload}"
        ) from exc
    except URLError as exc:
        raise AssertionError(f"HTTP request failed: {url}: {exc}") from exc


def _free_tcp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _request_timeout_seconds() -> int:
    return int(os.environ.get("LOCAL_VN_RP_PRODUCT_REQUEST_TIMEOUT_SECONDS", "900"))


def _selected_product_llm_model() -> Path:
    return Path(
        os.environ.get("LOCAL_VN_RP_PRODUCT_LLM_MODEL", str(REQUESTED_FILES["llm_q5"]))
    )


def _product_temp_dir() -> str | None:
    configured = os.environ.get("LOCAL_VN_RP_PRODUCT_TEMP_DIR")
    if configured:
        Path(configured).mkdir(parents=True, exist_ok=True)
        return configured
    if os.name == "nt":
        path = Path(r"C:\tmp")
        path.mkdir(parents=True, exist_ok=True)
        return str(path)
    return None


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _empty_story_fields(**overrides: str) -> dict[str, str]:
    fields = {key: "" for key in STORY_NODE_FIELD_KEYS}
    fields["negativePrompt"] = DEFAULT_NEGATIVE_PROMPT
    fields.update(overrides)
    return fields


def _tokenize_lines(text: str) -> list[str]:
    if not text:
        return []
    lines: list[str] = []
    start = 0
    for index, char in enumerate(text):
        if char == "\n":
            lines.append(text[start : index + 1])
            start = index + 1
    if start < len(text):
        lines.append(text[start:])
    return lines


def _create_line_patch(old_text: str, new_text: str) -> dict[str, Any]:
    old_lines = _tokenize_lines(old_text)
    new_lines = _tokenize_lines(new_text)
    rows = len(old_lines) + 1
    cols = len(new_lines) + 1
    table = [[0] * cols for _ in range(rows)]
    for old_index in range(len(old_lines) - 1, -1, -1):
        for new_index in range(len(new_lines) - 1, -1, -1):
            if old_lines[old_index] == new_lines[new_index]:
                table[old_index][new_index] = table[old_index + 1][new_index + 1] + 1
            else:
                table[old_index][new_index] = max(
                    table[old_index + 1][new_index], table[old_index][new_index + 1]
                )

    ops: list[dict[str, Any]] = []

    def push_op(operation_type: str, line: str) -> None:
        if ops and ops[-1]["type"] == operation_type:
            ops[-1]["lines"].append(line)
        else:
            ops.append({"type": operation_type, "lines": [line]})

    old_index = 0
    new_index = 0
    while old_index < len(old_lines) and new_index < len(new_lines):
        if old_lines[old_index] == new_lines[new_index]:
            push_op("equal", old_lines[old_index])
            old_index += 1
            new_index += 1
        elif table[old_index + 1][new_index] >= table[old_index][new_index + 1]:
            push_op("delete", old_lines[old_index])
            old_index += 1
        else:
            push_op("insert", new_lines[new_index])
            new_index += 1
    while old_index < len(old_lines):
        push_op("delete", old_lines[old_index])
        old_index += 1
    while new_index < len(new_lines):
        push_op("insert", new_lines[new_index])
        new_index += 1
    return {"format": "rtt-line-patch-v1", "ops": ops}


def _read_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json_file(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _read_log_tail(path: Path, max_chars: int = 12_000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return "<launcher log unavailable>"
    return text[-max_chars:] if len(text) > max_chars else text


if __name__ == "__main__":
    unittest.main()
