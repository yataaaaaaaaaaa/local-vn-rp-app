# Local VN/RP App

A local-first visual novel and roleplay workstation for Windows. The app combines an Electron/React frontend, a Python HTTP backend, local LLM generation, Danbooru-style visual prompt planning, image generation, replayable story trees, and story-local runtime settings.

The project is designed for private local use with models and assets hosted under `D:/Anything`. It keeps story state, model choices, resolver data, prompt traces, generated images, and metadata on the local machine.

## Highlights

- **Local roleplay loop**: user action, dialogue continuation, visible scene description, resolver text, tag selection, final image prompt, and generated image output.
- **Replayable story tree**: branching story nodes stored through `@replayable-text-tree/core` with per-node workflow fields.
- **Prompt stack for RP**: structured prompt sections for rules, story memory, character state, romance/intimacy context, recent conversation, novelty planning, and post-history instruction.
- **Novelty-aware scene direction**: beat selection helps avoid repeated emotional rhythms while preserving continuity.
- **NPC personna seeding**: if the story does not define a counterpart personality, a deterministic context-hash seed assigns a dere archetype, deeper personality dimensions, speech style, flaws, tells, and optional novelty levers.
- **Facet-based intimacy planning**: adult-only intimacy state is represented as independent facets such as phase, position, contact, clothing, pacing, camera, privacy, and aftercare. Each facet has its own lifetime.
- **Visual prompt planning**: visible facts are separated from narrative intent so image prompts stay anchored to observable scene details.
- **Resolver editor**: the Danbooru resolver can be inspected and edited from the frontend.
- **Local backend ownership**: model loading, generation, abort, unload, and shutdown flow through `anything-backend-runtime`.
- **Traceable outputs**: generated images are paired with metadata sidecars for prompts, model settings, seed, resolver details, and provenance.

## Repository layout

```text
local-vn-rp-app/
├── backend/                    Python HTTP backend and tests
├── frontend/                   Electron + Vite + React app
│   ├── electron/               Main/preload process code
│   ├── packages/               Frontend application packages
│   ├── scripts/                Dev, Electron, product-test, and static-check scripts
│   ├── src/                    Renderer entrypoint
│   └── tests/                  Frontend tests
├── launcher/                   `uv run python -m launcher` entrypoint
├── product_tests/              Opt-in local model smoke tests
└── README.md
```

## Runtime stack

```text
Electron shell
  -> React renderer
  -> Zustand stores
  -> TypeScript story/application packages
  -> Python backend HTTP/SSE endpoints
  -> anything-backend-runtime
  -> local LLM, DanBotNL, and diffusion/image backends
```

The frontend owns deterministic story logic, workflow state, prompt assembly, resolver interaction, and persistence paths. The backend owns runtime calls, model lifecycle, progress events, cancellation, and local generation handoff.

## Launch

From the repository root:

```bat
uv run python -m launcher
```

The launcher provides backend URL, storage roots, and output roots to Electron. It starts the backend and then starts the frontend from `frontend/`.

Install frontend packages from `frontend/` when Electron or frontend dependencies are absent:

```bat
cd frontend
npm install --no-audit --no-fund
```

Run only the backend:

```bat
uv run python -m launcher --backend-only
```

## Local dependency paths

The project expects these local libraries on the Windows workstation:

```text
D:/Anything/libs/anything-backend-runtime
D:/Anything/libs/replayable-text-tree
D:/Anything/libs/danbooru-tag-resolver
```

Model paths are selected in the app UI or through story-local settings. Typical assets live under:

```text
D:/Anything/llm/
D:/Anything/ComfyUI/ComfyUI/models/checkpoints/
D:/Anything/ComfyUI/ComfyUI/models/loras/
D:/Anything/ComfyUI/ComfyUI/models/embeddings/
```

## Storage

Launcher-provided roots define all local persistence:

```text
D:/Anything/storage/local-vn-rp-app-storage/
├── config/
│   ├── backend.runtime.json
│   ├── frontend.layout.json
│   └── resolver.config.json
├── stories/
│   └── <story_id>/
│       ├── story.json
│       ├── tree.json
│       ├── zustand.story-state.json
│       ├── nodes/
│       ├── scene_library.story.json
│       ├── switchers.story.json
│       └── characters/
└── outputs/
    └── <story_id>/
        ├── <image_id>.png
        └── <image_id>.json
```

Storage helpers live in:

```text
frontend/packages/config/src/storagePaths.ts
backend/local_vn_rp_backend/storage_paths.py
```

## Frontend package map

```text
packages/backend-client        HTTP/SSE client for the Python backend
packages/config                Defaults, persistence helpers, path helpers, character presets
packages/shared-types          Cross-package TypeScript contracts
packages/workflow-core         Generic workflow selectors and transitions
packages/story-domain          Story tree types, node fields, selectors, and workflow descriptors
packages/story-application     Generation, prompt, resolver, session, and use-case logic
packages/story-infrastructure  Persistence implementations for story bundles and traces
packages/stores                Zustand stores split by concern
packages/vn-ui                 React panels, stage, tree navigator, backend config, resolver UI
```

## Story workflow

Each story node moves through a visible pipeline:

```text
context
-> user action
-> dialogue continuation
-> visible scene description
-> resolver text
-> selected tags
-> DanBot tags
-> positive prompt
-> negative prompt
-> image reference
```

The UI exposes every step so a user can inspect, edit, regenerate, or validate a candidate before moving forward.

## RP prompt pipeline

The RP generator builds a modular prompt stack:

```text
core behavior rules
-> story and character memory
-> NPC personna, romance, intimacy, and cliche agent state
-> novelty beat plan
-> recent conversation and visible state
-> user action
-> post-history instruction
```

Important files:

```text
frontend/packages/story-application/src/generation/rpNovelPrompts.ts
frontend/packages/story-application/src/generation/rp-engine/novelty/novelty-planner.ts
frontend/packages/story-application/src/generation/rp-engine/agents/npc-personna-agent.ts
frontend/packages/story-application/src/generation/rp-engine/agents/sex-scene-agent.ts
frontend/packages/story-application/src/generation/rp-engine/types.ts
```

The novelty planner selects a beat, explains its relationship delta, anchors it in continuity, and places the actionable instruction near the end of the prompt. NPC personna, romance-cliche, and intimacy agents contribute scoped state to the planner. A single novelty arbiter chooses the primary source for the next detail delta, while every non-primary agent stays continuity-only for that turn. This keeps a clumsy personna quirk, a romantic trope, and an intimacy facet from all firing at once.

Novelty orchestration is configurable from the global backend panel. The saved backend config contains scalar controls for overall novelty level, detail budget, repetition guard, global agent influence, romantic-cliche influence, NPC-personna influence, and sex-scene influence. These values let the app keep continuity steady, allow one clean micro-shift, or lean harder into one selected agent-specific novelty source.

## Visual prompt pipeline

The visual side keeps image prompts grounded in visible facts:

```text
dialogue output and recent state
-> compact visible scene description
-> visual prompt planner
-> resolver text
-> Danbooru resolver
-> final positive and negative prompts
-> image backend call
```

Important files:

```text
frontend/packages/story-application/src/generation/visualPromptPlanner.ts
frontend/packages/story-application/src/generation/visualPromptProtocol.ts
frontend/packages/story-application/src/generation/visualPromptTagHelpers.ts
frontend/packages/story-application/src/generation/promptComposition.ts
frontend/packages/story-application/src/generation/imageOutput.ts
```

## Backend API shape

The frontend talks to the backend through JSON HTTP calls and SSE progress events. The client code lives in:

```text
frontend/packages/backend-client/src/client.ts
```

The backend server code lives in:

```text
backend/local_vn_rp_backend/simple_server.py
backend/local_vn_rp_backend/runtime_wrapper.py
backend/local_vn_rp_backend/events.py
```

Typical operations include runtime health, model status, model loading, generation requests, abort, unload, output metadata logging, and event streaming.

## Frontend development

From `frontend/`:

```bat
npm install --no-audit --no-fund
npm run dev
npm run electron:dev
npm run electron:start
```

Useful quality gates:

```bat
npm run static-check
npm run typecheck
npm test
npm run build
```

`npm run static-check` performs a dependency-light source audit:

- TypeScript/TSX syntax pass through the TypeScript compiler API.
- Relative import resolution across `src/`, `packages/`, `electron/`, and `tests/`.
- `@local-vn/*` package alias target verification.

`npm run typecheck`, `npm test`, and `npm run build` require frontend dependencies to be installed.

## Python validation

From the repository root:

```bat
uv run python -m unittest discover backend/tests
uv run python -m compileall -q backend/local_vn_rp_backend launcher
```

## Local product smoke test

The product smoke test is opt-in because it starts local services, uses large model files, performs generation, writes outputs, and shuts services down during cleanup.

```bat
set LOCAL_VN_RP_RUN_PRODUCT_TEST=1
python -m unittest product_tests.test_local_product_smoke
```

Default smoke-test assets:

```text
D:\Anything\llm\DanbotNL-2408-260M.safetensors
D:\Anything\llm\Forgotten-Safeword-12B-v4.0.Q5_K_M.gguf
D:\Anything\ComfyUI\ComfyUI\models\checkpoints\JANKUV5NSFWTrainedNoobai_v50.safetensors
D:\Anything\ComfyUI\ComfyUI\models\loras\illustrous\Dramatic Lighting Slider.safetensors
D:\Anything\ComfyUI\ComfyUI\models\embeddings\il\lazyneg.safetensors
```

Override paths with:

```text
LOCAL_VN_RP_DANBOT_MODEL
LOCAL_VN_RP_LLM_MODEL_Q5
LOCAL_VN_RP_DIFFUSION_MODEL
LOCAL_VN_RP_DRAMATIC_LIGHTING_LORA
LOCAL_VN_RP_LAZYNEG_EMBEDDING
LOCAL_VN_RP_PRODUCT_LLM_MODEL
```

The frontend product-test mode uses `LOCAL_VN_RP_FRONTEND_MODE=product-test` and writes `LOCAL_VN_RP_FRONTEND_READY_FILE` after launcher arguments are verified.

## Adult-content handling

The app is designed for lawful adult-only private roleplay. Prompt agents track consent, boundaries, privacy, pacing, and aftercare as structured story state. The frontend prompt stack uses that state for continuity and local generation guidance; any deployment-facing content rules should sit at the product boundary that owns user input and final output review.

## Contributor notes

- Keep deterministic story logic in TypeScript packages rather than React components.
- Keep backend code focused on local runtime calls and progress events.
- Keep prompt builders modular so sections can be inspected in the Prompt Debug panel.
- Keep generated outputs paired with metadata sidecars.
- Keep local paths launcher-owned and story settings story-local.
- Prefer small, testable functions for prompt planning, resolver preparation, and workflow transitions.
