import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import { migrateBackendRuntimeConfig } from "./migration";

export interface FilePersistenceApi {
  readJson<T>(path: string, fallback: T): Promise<T>;
  writeJson(path: string, value: unknown): Promise<void>;
  readText(path: string, fallback?: string | null): Promise<string | null>;
  writeText(path: string, value: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
}

export async function readJsonFile<T>(api: FilePersistenceApi, path: string, fallback: T): Promise<T> {
  return api.readJson(path, fallback);
}

export async function writeJsonFile(api: FilePersistenceApi, path: string, value: unknown): Promise<void> {
  await api.writeJson(path, value);
}

export async function readBackendRuntimeConfig(api: FilePersistenceApi, path: string, launcher?: Parameters<typeof migrateBackendRuntimeConfig>[1]): Promise<BackendRuntimeConfig> {
  return migrateBackendRuntimeConfig(await api.readJson<unknown>(path, null), launcher);
}

export async function writeBackendRuntimeConfig(api: FilePersistenceApi, path: string, config: BackendRuntimeConfig): Promise<void> {
  await api.writeJson(path, config);
}
