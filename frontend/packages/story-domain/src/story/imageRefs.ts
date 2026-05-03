import type { ImageRef } from "./types";

export function parseImageRef(value: string): ImageRef | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<ImageRef>;

    if (
      typeof parsed.image_id !== "string" ||
      typeof parsed.image_path !== "string" ||
      typeof parsed.metadata_path !== "string" ||
      typeof parsed.seed !== "number" ||
      typeof parsed.created_at !== "string"
    ) {
      return null;
    }

    return {
      image_id: parsed.image_id,
      image_path: parsed.image_path,
      metadata_path: parsed.metadata_path,
      seed: parsed.seed,
      created_at: parsed.created_at
    };
  } catch {
    return null;
  }
}

export function stringifyImageRef(imageRef: ImageRef | null): string {
  return imageRef ? JSON.stringify(imageRef) : "";
}

export function toFileUrl(path: string): string {
  if (!path) {
    return "";
  }

  if (path.startsWith("file://")) {
    return path;
  }

  const normalizedPath = path.replace(/\\/g, "/");

  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    return `file:///${normalizedPath}`;
  }

  if (normalizedPath.startsWith("/")) {
    return `file://${normalizedPath}`;
  }

  return `file://${normalizedPath}`;
}
