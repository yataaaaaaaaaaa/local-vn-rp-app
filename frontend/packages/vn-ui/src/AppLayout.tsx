import { BackendConfigPanel } from "./BackendConfigPanel";
import { DanbooruResolverPanel } from "./DanbooruResolverPanel";
import { LeafStepTabs } from "./LeafStepTabs";
import { TreeCommandPalette } from "./TreeCommandPalette";
import { VisualNovelStage } from "./VisualNovelStage";

export function AppLayout() {
  return (
    <main className="app-shell">
      <VisualNovelStage />
      <TreeCommandPalette />
      <LeafStepTabs />
      <DanbooruResolverPanel />
      <BackendConfigPanel />
    </main>
  );
}
