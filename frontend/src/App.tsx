import { useEffect, useState } from "react";
import { AppLayout } from "@local-vn/vn-ui";
import { bootstrapFrontend } from "@local-vn/stores";

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void bootstrapFrontend()
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="app-shell">
        <section className="panel">
          <h1>Startup failed</h1>
          <pre>{error}</pre>
        </section>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="app-shell">
        <section className="panel">
          <h1>Loading Local VN/RP...</h1>
        </section>
      </main>
    );
  }

  return <AppLayout />;
}
