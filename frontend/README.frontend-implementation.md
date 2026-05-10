# Frontend Implementation Guide

The frontend is an Electron, Vite, React, and TypeScript application for local visual novel and roleplay generation. It owns the interactive story workflow, prompt assembly, resolver UI, tree navigation, frontend persistence, and backend client calls.

## Process split

```text
Electron main process
  -> receives launcher arguments
  -> exposes filesystem and native dialog IPC
  -> starts the renderer

React renderer
  -> renders the visual novel stage and panels
  -> reads and writes Zustand stores
  -> calls story/application use cases
  -> sends runtime requests through the backend client
```

## Launcher arguments

The launcher provides:

```text
--backend
--backend-host
--backend-port
--app-root
--story-root
--output-root
```

The preload bridge exposes:

```ts
window.launcher.getArgs();
window.appPersistence.readJson(...);
window.appPersistence.writeJson(...);
window.appPersistence.readText(...);
window.appPersistence.writeText(...);
window.appPersistence.exists(...);
window.appPersistence.remove(...);
window.appPersistence.ensureDir(...);
window.appPersistence.showItem(...);
window.nativeDialogs.pickFile(...);
window.nativeDialogs.pickFiles(...);
window.nativeDialogs.pickFolder(...);
```

## Package roles

```text
packages/backend-client        Backend HTTP/SSE access
packages/config                Defaults, storage helpers, persistence helpers, presets
packages/shared-types          Shared runtime, story, generation, and config types
packages/workflow-core         Generic workflow state primitives
packages/story-domain          Story node fields, workflow descriptors, tree utilities
packages/story-application     Use cases, generation, prompt stacks, resolver orchestration
packages/story-infrastructure  Story and trace persistence adapters
packages/stores                Zustand stores split by concern
packages/vn-ui                 React UI components and panels
```

## Story screen flow

```text
story tree navigator
-> workflow tabs
-> generation/debug panels
-> visual novel stage
-> backend configuration panel
-> Danbooru resolver panel
```

The renderer keeps generation steps explicit so each node can be inspected at the level of user action, dialogue, visual cue, resolver text, selected tags, final prompt, and generated image.

The backend configuration panel also owns global novelty orchestration controls. These values are stored in the Zustand-backed runtime config and drive the prompt planner's novelty level, detail budget, repetition guard, per-agent influence, candidate pool size, and hidden RP-LLM coherence retry count. The RP prompt path runs the configured agents in sequence, appends their compact notes, appends their redirect candidates to a shared buffer, and asks the RP LLM a YES/NO coherence question for one sampled candidate at a time. The final prompt receives only the accepted `TURN_REDIRECT`, or a stabilization redirect when the sampled candidates fail.

## Static checks

From `frontend/`:

```bat
npm run static-check
npm run typecheck
npm test
npm run build
```

`npm run static-check` verifies TypeScript syntax, relative imports, and package alias targets. The other commands require installed frontend dependencies.
