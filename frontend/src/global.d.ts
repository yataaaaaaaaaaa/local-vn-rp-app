import type { LauncherArgs } from "@local-vn/shared-types";

export {};

declare global {
  interface Window {
    launcher: {
      getArgs(): Promise<LauncherArgs>;
    };
    appPersistence: {
      readText(path: string, fallback?: string | null): Promise<string | null>;
      writeText(path: string, value: string): Promise<void>;
      readJson<T>(path: string, fallback: T): Promise<T>;
      writeJson(path: string, value: unknown): Promise<void>;
      exists(path: string): Promise<boolean>;
      remove(path: string): Promise<void>;
      ensureDir(path: string): Promise<void>;
      showItem(path: string): Promise<void>;
    };
    nativeDialogs: {
      pickFile(options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
      pickFiles(options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string[] | null>;
      pickFolder(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
    };
  }
}
