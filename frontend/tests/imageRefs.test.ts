import { describe, expect, it } from "vitest";
import { parseImageRef, stringifyImageRef, toFileUrl } from "@local-vn/story-tree";

describe("image references", () => {
  it("serializes image refs as text-tree-compatible JSON strings", () => {
    const encoded = stringifyImageRef({ image_id: "img_1", image_path: "D:/out/img_1.png", metadata_path: "D:/out/img_1.json", seed: 123, created_at: "2026-04-29T00:00:00.000Z" });
    expect(parseImageRef(encoded)?.image_id).toBe("img_1");
    expect(toFileUrl("D:/out/img_1.png")).toBe("file:///D:/out/img_1.png");
  });
});
