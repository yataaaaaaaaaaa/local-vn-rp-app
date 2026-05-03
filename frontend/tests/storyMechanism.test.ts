import { describe, expect, it } from "vitest";
import { BackendClient } from "@local-vn/backend-client";
import { configureStoragePaths, createDefaultBackendRuntimeConfig, type FilePersistenceApi } from "@local-vn/config";
import type { StoryNodeFields } from "@local-vn/shared-types";
import { StorySessionController, storyWorkflowStepById } from "@local-vn/story-mechanism";

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
  it("runs a complete story step through the story-session controller without React stores", async () => {
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
    const session = new StorySessionController({
      persistence: () => api,
      backend: () => backend,
      getConfig: () => config
    });

    await session.createStory("Mechanism Test", "mechanism-test", { context: "A quiet archive waits." });
    const sceneNodeId = session.createChildFromCurrent({}, "userText", { autoContinue: false });

    await session.regenerateStep("userText");
    expect(session.getState().activeStepId).toBe("dialogue");

    await session.regenerateStep("dialogue");

    const persistedNode = await api.readJson<StoryNodeFields>(`D:/tmp/story-mechanism/stories/mechanism-test/nodes/${sceneNodeId}.json`, {} as StoryNodeFields);
    expect(persistedNode).toMatchObject({
      userText: "I check the silver door.",
      dialogue: "The archivist nods and unlocks the way forward.",
      visualDescription: "A silver door glows under rain-streaked glass.",
      danbotTags: "silver door, rain, glowing",
      positivePrompt: "silver door, rain, glowing"
    });
    expect(persistedNode.imageRef).toContain(`node_${sceneNodeId}_`);
    expect(backend.llmPrompts).toHaveLength(3);
  });

  it("keeps individual workflow steps available as direct package definitions", async () => {
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
    const document = emptyNode({ context: "Archive", danbotTags: "rain", positivePrompt: "rain", negativePrompt: "lowres" });
    const context = { backend, config, storyId: "s", selectedNodeId: "n" };

    await expect(storyWorkflowStepById.danbot.generate?.({ document, context })).resolves.toMatchObject({
      value: { danbotTags: "silver door, rain, glowing" }
    });
    await expect(storyWorkflowStepById.image.generate?.({ document, context })).resolves.toMatchObject({
      value: { imageRef: expect.stringContaining("node_n_") }
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
