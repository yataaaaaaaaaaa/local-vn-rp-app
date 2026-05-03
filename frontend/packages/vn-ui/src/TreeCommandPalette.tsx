import { useState } from "react";
import { STORY_CHARACTER_PRESETS, storyCharacterPresetById } from "@local-vn/config";
import { parseImageRef } from "@local-vn/story-tree";
import { useStorySessionStore } from "@local-vn/stores";
import { useResolvedCurrentNode } from "./useResolvedCurrentNode";

export function TreeCommandPalette() {
  const selectedNodeId = useStorySessionStore((state) => state.selectedNodeId);
  const node = useResolvedCurrentNode();
  const saveStory = useStorySessionStore((state) => state.saveStory);
  const goToParent = useStorySessionStore((state) => state.goToParent);
  const goToFirstChild = useStorySessionStore((state) => state.goToFirstChild);
  const goToPreviousSibling = useStorySessionStore((state) => state.goToPreviousSibling);
  const goToNextSibling = useStorySessionStore((state) => state.goToNextSibling);
  const goBack = useStorySessionStore((state) => state.goBack);
  const goForward = useStorySessionStore((state) => state.goForward);
  const createChildFromCurrent = useStorySessionStore((state) => state.createChildFromCurrent);
  const createAlternateBranch = useStorySessionStore((state) => state.createAlternateBranch);
  const duplicateCurrentBranch = useStorySessionStore((state) => state.duplicateCurrentBranch);
  const deleteCurrentNode = useStorySessionStore((state) => state.deleteCurrentLeaf);
  const applyPresetContext = useStorySessionStore((state) => state.applyPresetContext);
  const [message, setMessage] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(STORY_CHARACTER_PRESETS[0]?.id ?? "");
  const image = parseImageRef(node.imageRef);
  const selectedPreset = storyCharacterPresetById(presetId);

  function run(label: string, command: () => void | Promise<void>) {
    try {
      const result = command();
      if (result instanceof Promise) void result.then(() => setMessage(`${label} completed.`));
      else setMessage(`${label} completed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function applyPresetContextToCurrentLeaf(nextPresetId = presetId) {
    const preset = storyCharacterPresetById(nextPresetId);
    const context = preset?.initialFields.context;
    if (!preset || !context) return;
    void applyPresetContext(context).then(() => setMessage(`Applied preset context to current leaf: ${preset.title}. Workflow restarted from context.`));
  }

  return (
    <section className="panel tree-command-palette">
      <div className="panel-header">
        <div>
          <h2>Command Palette / Tree Navigation</h2>
          <div className="small">Selected leaf: <code>{selectedNodeId}</code></div>
        </div>
        <button onClick={() => void saveStory()}>Save story</button>
      </div>

      <div className="preset-picker">
        <label>
          <span>Starter story preset</span>
          <select
            value={presetId}
            onChange={(event) => {
              const nextPresetId = event.currentTarget.value;
              setPresetId(nextPresetId);
              applyPresetContextToCurrentLeaf(nextPresetId);
            }}
          >
            {STORY_CHARACTER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.title}</option>
            ))}
          </select>
        </label>
        <button disabled={!selectedPreset} onClick={() => applyPresetContextToCurrentLeaf()}>Apply preset to current context</button>
        <div className="small">{selectedPreset?.summary ?? "Select a woman/man duo preset. The man is always the user character."}</div>
      </div>

      <div className="commands">
        <button onClick={() => run("Go to parent", goToParent)}>Go to parent</button>
        <button onClick={() => run("Go to child", goToFirstChild)}>Go to child</button>
        <button onClick={() => run("Previous sibling", goToPreviousSibling)}>Previous sibling</button>
        <button onClick={() => run("Next sibling", goToNextSibling)}>Next sibling</button>
        <button onClick={() => run("Back", goBack)}>Go back</button>
        <button onClick={() => run("Forward", goForward)}>Go forward</button>
        <button onClick={() => run("Create child", () => { createChildFromCurrent({}, "context"); })}>Create child from current node</button>
        <button onClick={() => run("Alternate branch", () => { createAlternateBranch(); })}>Create alternate branch</button>
        <button onClick={() => run("Duplicate branch", () => { duplicateCurrentBranch(); })}>Duplicate current branch</button>
        <button onClick={() => run("Delete scene", deleteCurrentNode)}>Delete current scene</button>
        <button disabled={!image} onClick={() => image && window.appPersistence.showItem(image.image_path)}>Set/open current node image</button>
        <button disabled={!image?.metadata_path} onClick={() => image?.metadata_path && window.appPersistence.showItem(image.metadata_path)}>Open current image metadata</button>
      </div>
      {message ? <p className="small">{message}</p> : null}
    </section>
  );
}
