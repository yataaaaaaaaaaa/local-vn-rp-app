import type { ImageRef } from "@local-vn/shared-types";

export function parseImageRef(value: string | null | undefined): ImageRef | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ImageRef>;
    if (!parsed.image_id || !parsed.image_path) return null;
    return {
      image_id: String(parsed.image_id),
      image_path: String(parsed.image_path),
      metadata_path: String(parsed.metadata_path ?? ""),
      seed: Number(parsed.seed ?? 0),
      created_at: String(parsed.created_at ?? "")
    };
  } catch {
    return null;
  }
}

export function stringifyImageRef(ref: ImageRef | null): string {
  return ref ? JSON.stringify(ref) : "";
}

export function toFileUrl(path: string): string {
  if (!path) return "";
  if (/^file:\/\//i.test(path)) return path;
  const normalized = path.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${normalized}`;
  return `file://${normalized}`;
}
