# Local VN/RP App Scaffold

Windows-targeted V1 scaffold for a local visual-novel/RP app with TypeScript-owned story logic and a thin Python model backend.

## Current architecture

- TypeScript core logic owns story graph mutation, branching, switchers, scene-to-Danbooru resolution, prompt assembly, image-mode decisions, serialization, and metadata/snapshot creation.
- Zustand remains the intended frontend source of truth. UI/store code should call core logic instead of embedding deterministic story logic in UI components.
- Python backend is now a Python subproject wrapper around `anything-backend-runtime` and delegates runtime ownership, queueing, generation, abort, unload, and close operations to that package.
- Python backend does not own story state, branch decisions, switcher decisions, semantic scene resolution, Danbooru tag recipes, config persistence, or model adapter implementations.

## uv launch command

From the project root:

```bat
uv run python -m launcher
```

The default backend launched by this command uses the Python standard library for its HTTP compatibility server and still does **not** install `fastapi`, `uvicorn`, `uvicorn[standard]`, or `colorama`. The backend subproject depends on `anything-backend-runtime` from `D:/Anything/libs/anything-backend-runtime` at tag `0.1.0`; LLM, DanbotNL, diffusion generation, queueing, abort, unload, and close behavior are delegated to that library. Llama-server process ownership now stays inside the backend runtime; the launcher no longer starts or configures a separate llama-server service.

The default frontend command starts a real Electron shell (`frontend/scripts/electron-start.mjs` -> `frontend/app/electron/main.cjs`) instead of only logging a startup message.

On Windows, the launcher resolves `.cmd` shims such as `npm.cmd` before calling `subprocess.Popen`, so `uv run python -m launcher` does not fail with a raw `WinError 2` when npm is installed through Node.js. Launcher arguments are passed to npm scripts after npm's `--` separator, which prevents `npm warn Unknown cli config` messages for flags such as `--backend`. The launcher runs npm from `frontend/`, where `package.json`, `package-lock.json`, `tsconfig*.json`, scripts, app code, and packages all live. If `frontend/node_modules/electron` is missing, install frontend dependencies with:

```bat
cd frontend
npm install --no-audit --no-fund
```

To run only the backend while the Electron frontend is not installed, use:

```bat
uv run python -m launcher --backend-only
```

## Windows storage root

Persisted app data is derived from the launcher-owned storage root instead of being stored inside the config file:

```text
D:/Anything/storage/local-vn-rp-app-storage/
├── config
│   ├── scene_library.global.json
│   ├── switchers.global.json
│   └── ui_state.json
├── stories
└── outputs
```

The launcher is the source of truth for `PROJECT_NAME`, `APP_ROOT`, `STORY_ROOT`, and `OUTPUT_ROOT`. It forwards those values to both the backend and frontend through command-line arguments. The backend stores the launcher-provided values in:

```text
backend/local_vn_rp_backend/storage_paths.py
```

The TypeScript storage helpers derive paths from launcher-provided roots in:

```text
frontend/packages/config/src/storagePaths.ts
```

Runtime/model settings are story-local. Legacy shared config/root fields are ignored during migration into story settings.

## Scene-to-Danbooru workflow

The previous keyword-to-weighted-tag expansion workflow has been replaced by this pipeline:

```text
raw LLM scene prose
-> phrase spans
-> editable concept chips
-> story profile and character state
-> slot conflict resolution
-> concept tag recipes
-> seeded optional and weighted Danbooru tags
-> final prompt with provenance
-> immutable generation snapshot
```

Implemented TypeScript entry points:

```text
compileSceneToDanbooru(...)
createGenerationSnapshot(...)
```

Important data objects are defined in:

```text
frontend/packages/shared-types/src/sceneToDanbooru.ts
```

## Image generation disable policy

`StoryRuntimeSettings.image.generation_policy` supports these intentional modes:

```text
enabled
  Normal behavior.

disabled_before_scene_text
  Fully disables the image workflow before the LLM scene-description step.

disabled_before_backend_generation
  Allows scene text, concept chips, recipes, and prompt preview, but skips the backend image call.
```

Core helpers:

```text
shouldGenerateImageSceneText(policy)
shouldCallImageBackend(policy)
imageGenerationPolicyLabel(policy)
```

## Validation

## Opt-in local product smoke test

A high-level product smoke test is available for the Windows machine that owns the real local models. It is intentionally skipped by default because it starts the launcher, verifies large local model files, exercises LLM/DanBotNL/diffusion generation, and writes temporary outputs.

Run it from the repository root:

```bat
set LOCAL_VN_RP_RUN_PRODUCT_TEST=1
python -m unittest product_tests.test_local_product_smoke
```

The test validates these default files exist before launching anything:

```text
D:\Anything\llm\DanbotNL-2408-260M.safetensors
D:\Anything\llm\Forgotten-Safeword-12B-v4.0.Q5_K_M.gguf
D:\Anything\ComfyUI\ComfyUI\models\checkpoints\JANKUV5NSFWTrainedNoobai_v50.safetensors
D:\Anything\ComfyUI\ComfyUI\models\loras\illustrous\Dramatic Lighting Slider.safetensors
D:\Anything\ComfyUI\ComfyUI\models\embeddings\il\lazyneg.safetensors
```

The Q5 GGUF is used for smoke-test LLM generation by default. Override paths with `LOCAL_VN_RP_DANBOT_MODEL`, `LOCAL_VN_RP_LLM_MODEL_Q5`, `LOCAL_VN_RP_DIFFUSION_MODEL`, `LOCAL_VN_RP_DRAMATIC_LIGHTING_LORA`, and `LOCAL_VN_RP_LAZYNEG_EMBEDDING` when needed. Override the loaded LLM with `LOCAL_VN_RP_PRODUCT_LLM_MODEL`.

The launcher supports an opt-in frontend product-test mode through `LOCAL_VN_RP_FRONTEND_MODE=product-test`. In this mode the frontend service runs a lightweight long-lived Node process that validates launcher arguments and writes `LOCAL_VN_RP_FRONTEND_READY_FILE` instead of opening Electron. The smoke test uses this mode, starts the real launcher/backend stack, lets the backend-owned runtime manage llama-server internally, waits for backend and frontend readiness, runs two story-generation steps, persists story nodes, generates tags and two-step diffusion images, verifies the generated images and metadata sidecars, and shuts the launcher down in test cleanup.

```bat
set LOCAL_VN_RP_RUN_PRODUCT_TEST=1
python -m unittest product_tests.test_story_mechanism_product
```

Python validation uses uv and no runtime downloads:

```bat
uv run python -u scripts/run_python_tests.py
uv run python -u scripts/check_python_annotations.py
uv run python -u -m compileall -q backend/local_vn_rp_backend launcher scripts/check_python_annotations.py scripts/run_python_tests.py
```

TypeScript is configured with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. The scaffold keeps the deterministic resolver logic in `frontend/packages/core` and shared contracts in `frontend/packages/shared-types`.

## LLM prompt workflow

The frontend now uses a two-call prompt chain for each RP action:

```text
user action + curated RP context
-> LLM dialogue continuation
-> dialogue output + curated visual state/context
-> LLM visible scene description
-> local scene-to-Danbooru resolver
```

The first LLM request is explicitly scoped to dialogue/narrative continuation only. It receives story context, character voice notes, recent dialogue, the previous visual state for continuity, and the user's new action. It is instructed not to produce image prompts, Danbooru tags, JSON, LoRA syntax, or a standalone scene description.

The second LLM request is explicitly scoped to visible scene prose only. It receives the same high-signal story/character context, the user action, recent dialogue, the previous visual state, and the exact dialogue output from the first call. It asks for one or two compact visual-cue sentences and keeps character-specific details bound to the right character. It is instructed not to write dialogue, analysis, Danbooru tags, comma-tag prompts, Stable Diffusion syntax, LoRA syntax, JSON, or markdown headings.

Prompt builders live in:

```text
frontend/packages/core/src/prompt.ts
```

The Electron renderer mirrors that flow in:

```text
frontend/app/electron/renderer-flow.js
```

## Latest Electron UI additions

The Electron renderer now uses a single Backend menu for model and asset selection. All values are picker-backed instead of raw freeform path entry:

```text
LLM model file -> native file picker for .gguf
Diffusion image model file -> native file picker for .safetensors/.ckpt/.pt/.bin
LoRA root -> native folder picker
Embedding root -> native folder picker
Single manual LoRA -> native file picker for .safetensors/.ckpt/.pt
```

Manual LoRAs are listed in the Backend menu, can be removed, are persisted with the story backend settings, are passed to backend asset rescans and image-model load as `manual_lora_paths`, and are appended to compiled positive prompts with prompt provenance. The manually selected file has first-found priority over same-named LoRAs discovered under the LoRA folder.

Story character profiles are editable from the character roster. Use `+ Add character` to create a new profile, then edit the display name, aliases, dialogue style, base concepts, default outfit concept, LoRA tags, and whether the character is the user character. The `Visible in current scene` checkbox can force a character into the current resolver run and updates the scene board/prompt preview for that node.

Each story also has editable prompt defaults:

```text
Default positive prompt
Default negative prompt
```

These comma-separated prompt fragments are appended to every scene-to-Danbooru compilation for that story. Positive defaults appear in tag provenance as `story.prompt_defaults`; negative defaults are appended to the compiled negative prompt.

The main Electron layout now uses the full window width instead of a capped centered container. Side panels are clamped to narrower responsive widths, outer padding is reduced, and the main image scene stage scales with viewport height so the scene occupies more of the screen.

## V1 foundations added in this build

This build adds a broader V1 foundation pass:

- real lazy Diffusers/SDXL image adapter path behind `DiffusersSdxlImageAdapter`;
- default `pyproject.toml` dependencies for PyTorch CUDA, torchvision, Diffusers, Transformers, Accelerate, SafeTensors, Pillow, and PEFT;
- image-step progress callback plumbing from adapters into the existing SSE event stream;
- story graph navigation controls: previous, next active branch, and branch menu;
- backend generation-parameter UI for LLM context/GPU layers/temperature/timeouts and image width/height/steps/CFG/sampler/scheduler/policy;
- story-local library/rules JSON editor for phrase mappings, concepts, recipes, tag blacklist, resolver limits, and exclusion rules;
- all phrase occurrences are now detected instead of just the first matching phrase;
- resolver guard warnings for active concepts, recipe expansion count, total tag count, and prompt length;
- richer image inspector details for LLM prompts, resolver details, selected/rejected concepts, final tags, and config snapshot;
- story persistence now writes story sidecars closer to the target tree, including `scene_library.story.json`, `switchers.story.json`, and `characters/*.json`.

The Diffusers adapter and backend-owned llama-server adapter must be validated on the target Windows/CUDA machine with the selected SDXL/Illustrious checkpoint and GGUF model. `llama-server.exe` must be available to the backend runtime and should come from a CUDA-enabled llama.cpp build.

## Backend-owned llama-server LLM runtime

Story-local backend settings now include the GGUF model and generation defaults, but not the llama-server process address:

```json
{
  "model_path": "D:/Anything/llm/Forgotten-Safeword-12B-v4.0.Q6_K.gguf",
  "context_size": 8192,
  "gpu_layers": "auto"
}
```

Python backend responsibilities:

- delegate LLM generation to `anything-backend-runtime`;
- let that package create, reuse, restart, and stop its owned `llama-server` process through `llama-server-runtime`;
- pass the model path per request and translate context/GPU-layer settings into backend-owned server args;
- forward streamed token deltas through the existing `/events` progress flow;
- release the owned runtime on unload, abort, shutdown, or backend close.

The frontend still owns story config and sends the current story-local model/generation settings to Python. It no longer stores or sends llama-server host, port, or executable path.
