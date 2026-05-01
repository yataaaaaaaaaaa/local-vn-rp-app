import { describe, expect, it } from "vitest";
import { BackendClient } from "@local-vn/backend-client";
import { configureStoragePaths, createDefaultBackendRuntimeConfig, type FilePersistenceApi } from "@local-vn/config";
import type { StoryNodeFields } from "@local-vn/shared-types";
import { StoryMechanismSession, generateDanbotPromptForNode, generateImageForNode } from "@local-vn/story-mechanism";

class FakeBackend implements Pick<BackendClient, "generateLlm" | "generateDanbotTags" | "generateImage" | "loadLlm" | "loadDanbot" | "loadImageModel"> {
  public llmPrompts: string[] = [];

  public async loadLlm() {
    return status({ loaded_llm: "fake.gguf" });
  }

  public async loadDanbot() {
    return status({ loaded_danbot_model: "fake-danbot" });
  }

  public async loadImageModel() {
    return status({ loaded_image_model: "fake-image.safetensors" });
  }

  public async generateLlm(request: { prompt: string }) {
    this.llmPrompts.push(request.prompt);
    const text = request.prompt.includes("player/user") ? "I check the silver door." : request.prompt.includes("visual information") ? "A silver door glows under rain-streaked glass." : "The archivist nods and unlocks the way forward.";
    return { text, finish_reason: "stop", seed: 1 };
  }

  public async generateDanbotTags() {
    return { tags: ["silver door", "rain", "glowing"], prompt: "silver door, rain, glowing", model_path: "fake-danbot", warnings: [] };
  }

  public async generateImage(request: { output_path: string; seed: number }) {
    return { image_path: request.output_path, metadata_path: request.output_path.replace(/\.png$/, ".json"), seed: request.seed, resolved_loras: [], resolved_embeddings: [], warnings: [] };
  }
}

describe("story mechanism", () => {
  it("runs a complete story step through the package API without React stores", async () => {
    configureStoragePaths({
      project_name: "local-vn-rp-app",
      app_root: "D:/tmp/story-mechanism",
      story_root: "D:/tmp/story-mechanism/stories",
      output_root: "D:/tmp/story-mechanism/outputs"
    });
    const api = new MemoryPersistenceApi();
    const backend = new FakeBackend();
    const config = createDefaultBackendRuntimeConfig({
      backend: { baseUrl: "http://127.0.0.1:1" },
      llm: { model_path: "fake.gguf" },
      danbot: { model_path: "fake-danbot" },
      image: { model_path: "fake-image.safetensors", default_steps: 2, sampler: "euler_ancestral" }
    });
    const session = await StoryMechanismSession.create({
      api,
      backend,
      config,
      title: "Mechanism Test",
      storyId: "mechanism-test",
      initialFields: { context: "A quiet archive waits." }
    });

    const result = await session.runFullStoryStep({
      childNodeId: "step-1",
      imageId: "image-1",
      imageSeed: 42,
      createdAt: "2026-04-30T00:00:00.000Z"
    });

    expect(result.nodeId).toBe("step-1");
    expect(result.userText).toContain("silver door");
    expect(result.dialogue).toContain("archivist");
    expect(result.visualDescription).toContain("silver door");
    expect(result.positivePrompt).toBe("silver door, rain, glowing");
    expect(result.imageRef.image_path).toBe("D:/tmp/story-mechanism/outputs/mechanism-test/image-1.png");
    expect(await api.readJson<StoryNodeFields>("D:/tmp/story-mechanism/stories/mechanism-test/nodes/step-1.json", {} as StoryNodeFields)).toMatchObject({
      userText: result.userText,
      dialogue: result.dialogue,
      visualDescription: result.visualDescription,
      positivePrompt: result.positivePrompt
    });
    expect(backend.llmPrompts).toHaveLength(3);
  });

  it("keeps individual tab actions available as direct API calls", async () => {
    configureStoragePaths({
      project_name: "local-vn-rp-app",
      app_root: "D:/tmp/story-mechanism",
      story_root: "D:/tmp/story-mechanism/stories",
      output_root: "D:/tmp/story-mechanism/outputs"
    });
    const backend = new FakeBackend();
    const config = createDefaultBackendRuntimeConfig({
      danbot: { model_path: "fake-danbot" },
      image: { model_path: "fake-image.safetensors" }
    });
    const node = emptyNode({ context: "Archive", danbotTags: "rain", positivePrompt: "rain", negativePrompt: "lowres" });

    await expect(generateDanbotPromptForNode({ backend, config, node, storyId: "s", selectedNodeId: "n" })).resolves.toMatchObject({
      danbotTags: "silver door, rain, glowing"
    });
    await expect(generateImageForNode({ backend, config, node, storyId: "s", selectedNodeId: "n", imageId: "img", seed: 7 })).resolves.toMatchObject({
      imageRef: { image_id: "img", seed: 7 }
    });
  });
});

function status(overrides: Record<string, unknown>) {
  return {
    busy: false,
    active_model_type: "none",
    loaded_llm: null,
    loaded_image_model: null,
    loaded_danbot_model: null,
    gpu_owner: "none",
    last_error: null,
    ...overrides
  };
}

function emptyNode(overrides: Partial<StoryNodeFields> = {}): StoryNodeFields {
  return {
    context: "",
    userText: "",
    dialogue: "",
    visualDescription: "",
    resolverText: "",
    selectedTags: "",
    danbotTags: "",
    positivePrompt: "",
    negativePrompt: "lowres, bad anatomy",
    imageRef: "",
    ...overrides
  };
}

class MemoryPersistenceApi implements FilePersistenceApi {
  private readonly files = new Map<string, string>();

  public async readJson<T>(path: string, fallback: T): Promise<T> {
    const value = this.files.get(path);
    return value === undefined ? fallback : JSON.parse(value) as T;
  }

  public async writeJson(path: string, value: unknown): Promise<void> {
    this.files.set(path, JSON.stringify(value));
  }

  public async readText(path: string, fallback: string | null = null): Promise<string | null> {
    return this.files.get(path) ?? fallback;
  }

  public async writeText(path: string, value: string): Promise<void> {
    this.files.set(path, value);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  public async ensureDir(): Promise<void> {
    return;
  }
}
