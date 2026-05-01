import { create } from "zustand";
import { BackendClient } from "@local-vn/backend-client";
import type { RuntimeStatus } from "@local-vn/shared-types";

interface BackendClientState {
  client: BackendClient | null;
  baseUrl: string;
  status: RuntimeStatus | null;
  error: string | null;
  setBaseUrl(baseUrl: string): void;
  refreshStatus(): Promise<void>;
}

export const useBackendClientStore = create<BackendClientState>((set, get) => ({
  client: null,
  baseUrl: "",
  status: null,
  error: null,
  setBaseUrl: (baseUrl) => set({ baseUrl, client: new BackendClient({ baseUrl }), error: null }),
  refreshStatus: async () => {
    const client = get().client;
    if (!client) return;
    try {
      const status = await client.runtimeStatus();
      set({ status, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  }
}));

export function backendClientOrThrow(): BackendClient {
  const client = useBackendClientStore.getState().client;
  if (!client) throw new Error("Backend client is not initialized.");
  return client;
}
