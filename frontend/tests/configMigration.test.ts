import { describe, expect, it } from "vitest";
import { migrateBackendRuntimeConfig } from "@local-vn/config";

describe("backend runtime config migration", () => {
  it("keeps backend config separate and applies launcher runtime overrides", () => {
    const config = migrateBackendRuntimeConfig(
      { image: { model_path: "D:/models/image.safetensors", default_steps: 32 }, danbot: { max_tags: 40 } },
      { baseUrl: "http://127.0.0.1:17860", host: "127.0.0.1", port: 17860 }
    );

    expect(config.backend.baseUrl).toBe("http://127.0.0.1:17860");
    expect(config.llm.backend).toBe("llama_server");
    expect(config.image.backend).toBe("diffusers");
    expect(config.image.model_path).toBe("D:/models/image.safetensors");
    expect(config.image.default_steps).toBe(32);
    expect(config.danbot.backend).toBe("danbot_nl");
    expect(config.danbot.max_tags).toBe(40);
  });
});
