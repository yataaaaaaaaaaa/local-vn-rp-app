import { ActionCompositionCorrectionDialog } from "./ActionCompositionCorrectionDialog";
import { BackendConfigPanel } from "./backend-config/BackendConfigPanel";
import { DanbooruResolverPanel } from "./danbooru-resolver/DanbooruResolverPanel";
import { DeferredGenerationPanel } from "./workflow-tabs/DeferredGenerationPanel";
import { LeafStepTabs } from "./workflow-tabs/LeafStepTabs";
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
      <DeferredGenerationPanel />
      <DanbooruResolverPanel />
      <BackendConfigPanel />
      <ActionCompositionCorrectionDialog />
    </main>
  );
}
