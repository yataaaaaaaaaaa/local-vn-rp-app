import type { FilePersistenceApi } from "@local-vn/config";

export function persistenceApi(): FilePersistenceApi {
  if (!window.appPersistence) {
    throw new Error(
      "Electron persistence bridge is unavailable. The frontend must run through Electron preload."
    );
  }

  return window.appPersistence;
}
