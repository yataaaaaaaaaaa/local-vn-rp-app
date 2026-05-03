# Local AI Visual Novel Frontend Implementation

This frontend implements the corrected architecture:

- Electron owns launcher argument ingestion and filesystem IPC.
- React renders a vertically stacked visual novel UI.
- Zustand stores are split by concern.
- `@replayable-text-tree/core` owns the replayable story tree.
- `danbooru-tag-resolver` is embedded as the resolver editor UI.
- Backend access is isolated in `packages/backend-client`.
- Backend configuration is separate from story/tree/leaf state.
- Story state is persisted under launcher-provided `story_root`.
- Generated image references are stored on tree nodes and image files are written under `output_root`.

## Expected launcher command

The existing `cli.py` starts Electron with:

```text
--backend
--backend-host
--backend-port
--app-root
--story-root
--output-root
```

The Electron main process parses these arguments, validates file accesses against the launcher-provided storage roots, and exposes a preload bridge:

```ts
window.launcher.getArgs();
window.appPersistence.readJson /
  writeJson /
  readText /
  writeText /
  exists /
  remove /
  ensureDir /
  showItem;
```

## Storage layout used

```text
<app_root>/config/backend.runtime.json
<app_root>/config/frontend.layout.json
<app_root>/config/resolver.config.json
<story_root>/<story_id>/story.json
<story_root>/<story_id>/tree.json
<story_root>/<story_id>/zustand.story-state.json
<story_root>/<story_id>/nodes/<node_id>.json
<output_root>/<story_id>/<image_id>.png
<output_root>/<story_id>/<image_id>.json
```

## Main packages

```text
packages/backend-client   Thin HTTP/SSE client only
packages/config           Defaults, migration, storage path helpers, persistence interfaces
packages/shared-types     Cross-package runtime/story/config types
packages/stores           Zustand stores split by concern
packages/vn-ui            React UI panels
```

## Notes

The command palette includes a guarded `deleteCurrentLeaf` action, but it intentionally does not mutate replayable-tree internals because the minimal README for `@replayable-text-tree/core` does not expose a deletion primitive. Once the library exposes a public delete API, wire that action there.
