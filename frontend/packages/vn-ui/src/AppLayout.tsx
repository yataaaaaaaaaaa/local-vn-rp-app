import { BackendConfigPanel } from "./BackendConfigPanel";
import { DanbooruResolverPanel } from "./DanbooruResolverPanel";
import { LeafStepTabs } from "./LeafStepTabs";
import { StoryTreeSceneNavigator } from "./scene-tree-navigator";
import { TreeCommandPalette } from "./TreeCommandPalette";
import { VisualNovelStage } from "./VisualNovelStage";

export function AppLayout() {
  return (
    <main className="app-shell">
      <VisualNovelStage />
      <TreeCommandPalette />
      <StoryTreeSceneNavigator />
      <LeafStepTabs />
      <DanbooruResolverPanel />
      <BackendConfigPanel />
    </main>
  );
}
