import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { BackendClient } from "@local-vn/backend-client";
import { configureStoragePaths, createDefaultBackendRuntimeConfig, type FilePersistenceApi } from "@local-vn/config";
import { StorySessionController, loadStoryMechanismModels } from "@local-vn/story-mechanism";
import { parseImageRef, resolveStoryNodeFields } from "@local-vn/story-tree";

const runProductTest = process.env.LOCAL_VN_RP_RUN_STORY_MECHANISM_PRODUCT_TEST === "1";
const describeProduct = runProductTest ? describe : describe.skip;

describeProduct("story mechanism product smoke", () => {
  it("drives the real backend through the extracted story mechanism package", async () => {
    const env = requiredProductEnv();
    await assertExternalFilesExist([
      env.llmModel,
      env.danbotModel,
      env.diffusionModel,
      env.loraPath,
      env.embeddingPath
    ]);

    configureStoragePaths({
      project_name: "local-vn-rp-app",
      app_root: env.appRoot,
      story_root: env.storyRoot,
      output_root: env.outputRoot
    });

    const backend = new BackendClient({ baseUrl: env.backendUrl });
    const config = createDefaultBackendRuntimeConfig({
      backend: { baseUrl: env.backendUrl },
      llm: {
        model_path: env.llmModel,
        timeout_seconds: Number(process.env.LOCAL_VN_RP_PRODUCT_REQUEST_TIMEOUT_SECONDS ?? "900"),
        max_tokens: 128,
        temperature: 0.45
      },
      danbot: {
        model_path: env.danbotModel,
        max_tags: 40
      },
      image: {
        model_path: env.diffusionModel,
        lora_root: dirname(env.loraPath),
        embedding_root: dirname(env.embeddingPath),
        default_width: Number(process.env.LOCAL_VN_RP_PRODUCT_IMAGE_WIDTH ?? "512"),
        default_height: Number(process.env.LOCAL_VN_RP_PRODUCT_IMAGE_HEIGHT ?? "512"),
        default_steps: Number(process.env.LOCAL_VN_RP_PRODUCT_IMAGE_STEPS ?? "2"),
        default_cfg_scale: Number(process.env.LOCAL_VN_RP_PRODUCT_IMAGE_CFG ?? "4.5"),
        sampler: process.env.LOCAL_VN_RP_PRODUCT_IMAGE_SAMPLER ?? "euler_ancestral",
        scheduler: process.env.LOCAL_VN_RP_PRODUCT_IMAGE_SCHEDULER ?? "normal",
        timeout_seconds: Number(process.env.LOCAL_VN_RP_PRODUCT_IMAGE_TIMEOUT_SECONDS ?? "900")
      }
    });

    await loadStoryMechanismModels(backend, config);
    const api = new NodeFilePersistenceApi();
    const session = new StorySessionController({
      persistence: () => api,
      backend: () => backend,
      getConfig: () => config
    });
    await session.createStory("Product Story Mechanism Smoke", "product-story-mechanism-smoke", {
      context: "A safe-for-work visual novel scene begins in a moonlit archive. Keep the scene concise, concrete, and visual."
    });

    const sceneNodeId = session.createChildFromCurrent({}, "userText", { autoContinue: false });
    await session.regenerateStep("userText");
    await session.regenerateStep("dialogue");

    const step = resolveStoryNodeFields(session.getState().tree, sceneNodeId);
    const imageRef = parseImageRef(step.imageRef);
    expect(imageRef).not.toBeNull();

    expect(step.userText.length).toBeGreaterThan(5);
    expect(step.dialogue.length).toBeGreaterThan(10);
    expect(step.visualDescription.length).toBeGreaterThan(10);
    expect(step.danbotTags.length).toBeGreaterThan(5);
    expect(step.positivePrompt.length).toBeGreaterThan(5);

    const imageBytes = await readFile(imageRef!.image_path);
    expect([...imageBytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const metadata = JSON.parse(await readFile(imageRef!.metadata_path, "utf8")) as { metadata: Record<string, unknown>; request: Record<string, unknown> };
    expect(metadata.metadata).toMatchObject({
      story_id: "product-story-mechanism-smoke",
      node_id: sceneNodeId,
      image_id: imageRef!.image_id
    });
    expect(metadata.request.steps).toBe(config.image.default_steps);

    const persistedNode = JSON.parse(await readFile(`${env.storyRoot}/product-story-mechanism-smoke/nodes/${sceneNodeId}.json`, "utf8")) as Record<string, string>;
    expect(persistedNode).toMatchObject({
      userText: step.userText,
      dialogue: step.dialogue,
      visualDescription: step.visualDescription,
      danbotTags: step.danbotTags,
      positivePrompt: step.positivePrompt
    });
  }, 1_800_000);
});

function requiredProductEnv() {
  return {
    backendUrl: requiredEnv("LOCAL_VN_RP_PRODUCT_BACKEND_URL"),
    appRoot: requiredEnv("LOCAL_VN_RP_APP_ROOT"),
    storyRoot: requiredEnv("LOCAL_VN_RP_STORY_ROOT"),
    outputRoot: requiredEnv("LOCAL_VN_RP_OUTPUT_ROOT"),
    llmModel: requiredEnv("LOCAL_VN_RP_PRODUCT_LLM_MODEL"),
    danbotModel: requiredEnv("LOCAL_VN_RP_DANBOT_MODEL"),
    diffusionModel: requiredEnv("LOCAL_VN_RP_DIFFUSION_MODEL"),
    loraPath: requiredEnv("LOCAL_VN_RP_DRAMATIC_LIGHTING_LORA"),
    embeddingPath: requiredEnv("LOCAL_VN_RP_LAZYNEG_EMBEDDING")
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required product test env var: ${name}`);
  return value;
}

async function assertExternalFilesExist(paths: string[]): Promise<void> {
  for (const path of paths) {
    const info = await stat(path);
    expect(info.isFile(), `expected external file to exist: ${path}`).toBe(true);
  }
}

class NodeFilePersistenceApi implements FilePersistenceApi {
  public async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as T;
    } catch (error) {
      if (isMissingFileError(error)) return fallback;
      throw error;
    }
  }

  public async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  public async readText(path: string, fallback: string | null = null): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) return fallback;
      throw error;
    }
  }

  public async writeText(path: string, value: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value, "utf8");
  }

  public async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if (isMissingFileError(error)) return false;
      throw error;
    }
  }

  public async remove(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  public async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}
