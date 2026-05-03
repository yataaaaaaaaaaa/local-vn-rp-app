import { BackendConfigPanel } from "./BackendConfigPanel";
import { DanbooruResolverPanel } from "./DanbooruResolverPanel";
import { LeafStepTabs } from "./LeafStepTabs";
import { StoryTreeSceneNavigator } from "./scene-tree-navigator";
import { TreeCommandPalette } from "./TreeCommandPalette";
import { VisualNovelStageTopPanel } from "./VisualNovelStageTopPanel";

export function AppLayout() {
  return (
    <main className="app-shell">
      <VisualNovelStageTopPanel />
      <TreeCommandPalette />
      <StoryTreeSceneNavigator />
      <LeafStepTabs />
      <DanbooruResolverPanel />
      <BackendConfigPanel />
    </main>
  );
}
