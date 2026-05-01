import { useEffect, useState } from "react";
import { AppLayout } from "@local-vn/vn-ui";
import { bootstrapFrontend, useLauncherStore, useStorySessionStore } from "@local-vn/stores";

export function App() {
  const [ready, setReady] = useState(false);
  const launcherReady = useLauncherStore((state) => state.ready);
  const storyId = useStorySessionStore((state) => state.storyId);

  useEffect(() => {
    bootstrapFrontend().then(() => setReady(true)).catch((error) => {
      console.error(error);
      setReady(true);
    });
  }, []);

  if (!ready || !launcherReady || !storyId) return <main className="app-shell"><section className="panel">Loading local VN/RP app...</section></main>;
  return <AppLayout />;
}
