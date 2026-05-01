import type { BackendClient } from "@local-vn/backend-client";
import {
  buildAutomaticUserAnswerPrompt,
  buildRpAnswerPrompt,
  buildVisualRepresentationPrompt,
  outputImageFile,
  rpNovelLlmRequestConfig,
  type FilePersistenceApi
} from "@local-vn/config";
import type { BackendRuntimeConfig, ImageRef, StoryNodeFields, StoryNodeFieldKey } from "@local-vn/shared-types";
import {
  addStoryChildNode,
  attachImageRefToNode,
  createStoryTreeBundle,
  editStoryNodeField,
  loadStoryBundle,
  resolveStoryNodeFields,
  saveStoryBundle,
  type StoryTreeBundle
} from "@local-vn/story-tree";

export * from "./workflowCore";
export * from "./backendWorkflow";

export type StoryMechanismBackend = Pick<
  BackendClient,
  "generateLlm" | "generateDanbotTags" | "generateImage" | "loadLlm" | "loadDanbot" | "loadImageModel"
>;

export interface StoryNodeGenerationInput {
  backend: StoryMechanismBackend;
  config: BackendRuntimeConfig;
  node: StoryNodeFields;
  storyId: string | null | undefined;
  selectedNodeId: string | null | undefined;
}

export interface ImageGenerationInput extends StoryNodeGenerationInput {
  imageId?: string;
  outputPath?: string;
  seed?: number;
  createdAt?: string;
}

export interface StoryStepOptions {
  childNodeId?: string;
  imageId?: string;
  imageSeed?: number;
  createdAt?: string;
}

export interface StoryStepResult {
  nodeId: string;
  userText: string;
  dialogue: string;
  visualDescription: string;
  danbotTags: string;
  positivePrompt: string;
  imageRef: ImageRef;
  warnings: string[];
}

export async function loadStoryMechanismModels(backend: StoryMechanismBackend, config: BackendRuntimeConfig) {
  const llmStatus = await backend.loadLlm({
    backend: "llama_server",
    model_path: config.llm.model_path,
    context_size: config.llm.context_size,
    gpu_layers: config.llm.gpu_layers,
    prompt_format: config.llm.prompt_format,
    startup_timeout_seconds: config.llm.startup_timeout_seconds,
    timeout_seconds: config.llm.timeout_seconds
  });
  const danbotStatus = await backend.loadDanbot({
    backend: "danbot_nl",
    model_path: config.danbot.model_path,
    device: config.danbot.device,
    dtype: config.danbot.dtype
  });
  const imageStatus = await backend.loadImageModel({
    backend: "diffusers",
    model_path: config.image.model_path,
    model_type: config.image.model_type,
    dtype: config.image.dtype,
    device: config.image.device,
    lora_root: config.image.lora_root,
    embedding_root: config.image.embedding_root,
    manual_lora_paths: config.image.manual_lora_paths
  });

  return { llmStatus, danbotStatus, imageStatus };
}

export async function generateAutomaticUserAnswerForNode(input: StoryNodeGenerationInput): Promise<{ userText: string }> {
  const result = await input.backend.generateLlm({
    prompt: buildAutomaticUserAnswerPrompt(input),
    ...rpNovelLlmRequestConfig(input.config),
    max_tokens: Math.min(input.config.llm.max_tokens, 180)
  });
  return { userText: result.text.trim() };
}

export async function generateDialogueForNode(input: StoryNodeGenerationInput): Promise<{ dialogue: string }> {
  const result = await input.backend.generateLlm({
    prompt: buildRpAnswerPrompt(input),
    ...rpNovelLlmRequestConfig(input.config)
  });
  return { dialogue: result.text.trim() };
}

export async function generateVisualDescriptionForNode(input: StoryNodeGenerationInput): Promise<{ visualDescription: string }> {
  const result = await input.backend.generateLlm({
    prompt: buildVisualRepresentationPrompt(input),
    ...rpNovelLlmRequestConfig(input.config)
  });
  return { visualDescription: result.text.trim() };
}

export async function generateDanbotPromptForNode(input: StoryNodeGenerationInput): Promise<{ danbotTags: string; positivePrompt: string; warnings: string[] }> {
  const result = await input.backend.generateDanbotTags({
    scene_text: input.node.visualDescription || input.node.dialogue || input.node.context,
    max_tags: input.config.danbot.max_tags,
    model_path: input.config.danbot.model_path || undefined
  });

  return {
    danbotTags: result.tags.join(", "),
    positivePrompt: result.prompt,
    warnings: result.warnings
  };
}

export async function generateImageForNode(input: ImageGenerationInput): Promise<{ imageRef: ImageRef; warnings: string[] }> {
  if (!input.storyId || !input.selectedNodeId) throw new Error("No selected story/node for image output path.");

  const imageId = input.imageId ?? `node_${input.selectedNodeId}_${Date.now()}`;
  const result = await input.backend.generateImage({
    positive_prompt: input.node.positivePrompt || input.node.selectedTags || input.node.danbotTags,
    negative_prompt: input.node.negativePrompt,
    model_path: input.config.image.model_path || undefined,
    width: input.config.image.default_width,
    height: input.config.image.default_height,
    steps: input.config.image.default_steps,
    cfg_scale: input.config.image.default_cfg_scale,
    sampler: input.config.image.sampler,
    scheduler: input.config.image.scheduler,
    seed: input.seed ?? Date.now() % 2147483647,
    timeout_seconds: input.config.image.timeout_seconds,
    output_path: input.outputPath ?? outputImageFile(input.storyId, imageId),
    metadata: { story_id: input.storyId, node_id: input.selectedNodeId, image_id: imageId }
  });

  return {
    imageRef: {
      image_id: imageId,
      image_path: result.image_path,
      metadata_path: result.metadata_path,
      seed: result.seed,
      created_at: input.createdAt ?? new Date().toISOString()
    },
    warnings: result.warnings
  };
}

export class StoryMechanismSession {
  private bundle: StoryTreeBundle;

  private constructor(
    private readonly api: FilePersistenceApi,
    private readonly backend: StoryMechanismBackend,
    private readonly config: BackendRuntimeConfig,
    bundle: StoryTreeBundle
  ) {
    this.bundle = bundle;
  }

  public static async create(input: {
    api: FilePersistenceApi;
    backend: StoryMechanismBackend;
    config: BackendRuntimeConfig;
    title: string;
    storyId?: string;
    initialFields?: Partial<StoryNodeFields>;
  }): Promise<StoryMechanismSession> {
    const bundle = createStoryTreeBundle(input.title, input.storyId, input.initialFields);
    const session = new StoryMechanismSession(input.api, input.backend, input.config, bundle);
    await session.save();
    return session;
  }

  public static async load(input: {
    api: FilePersistenceApi;
    backend: StoryMechanismBackend;
    config: BackendRuntimeConfig;
    storyId: string;
  }): Promise<StoryMechanismSession | null> {
    const bundle = await loadStoryBundle(input.api, input.storyId);
    return bundle ? new StoryMechanismSession(input.api, input.backend, input.config, bundle) : null;
  }

  public get storyId(): string {
    return this.bundle.manifest.story_id;
  }

  public get selectedNodeId(): string {
    return this.bundle.selectedNodeId;
  }

  public get currentNode(): StoryNodeFields {
    return resolveStoryNodeFields(this.bundle.tree, this.bundle.selectedNodeId);
  }

  public get imageRefs(): Record<string, ImageRef> {
    return this.bundle.imageRefs;
  }

  public async save(): Promise<void> {
    await saveStoryBundle(this.api, this.bundle);
  }

  public async addChildFromCurrent(initialFields: Partial<StoryNodeFields> = {}, options: { nodeId?: string } = {}): Promise<string> {
    const added = addStoryChildNode(this.bundle.tree, this.bundle.selectedNodeId, initialFields, options);
    this.bundle = { ...this.bundle, tree: added.tree, selectedNodeId: added.nodeId };
    await this.save();
    return added.nodeId;
  }

  public async updateCurrentFields(fields: Partial<Record<StoryNodeFieldKey, string>>): Promise<void> {
    let tree = this.bundle.tree;
    for (const [field, value] of Object.entries(fields) as [StoryNodeFieldKey, string][]) {
      tree = editStoryNodeField(tree, this.bundle.selectedNodeId, field, value);
    }
    this.bundle = { ...this.bundle, tree };
    await this.save();
  }

  public async attachImageToCurrentNode(ref: ImageRef): Promise<void> {
    const tree = attachImageRefToNode(this.bundle.tree, this.bundle.selectedNodeId, ref);
    this.bundle = {
      ...this.bundle,
      tree,
      imageRefs: { ...this.bundle.imageRefs, [this.bundle.selectedNodeId]: ref }
    };
    await this.save();
  }

  public async runFullStoryStep(options: StoryStepOptions = {}): Promise<StoryStepResult> {
    const context = this.currentNode.dialogue || this.currentNode.context;
    const nodeId = await this.addChildFromCurrent({ context }, { nodeId: options.childNodeId });

    const user = await generateAutomaticUserAnswerForNode(this.inputForCurrentNode());
    await this.updateCurrentFields({ userText: user.userText });

    const dialogue = await generateDialogueForNode(this.inputForCurrentNode());
    await this.updateCurrentFields({ dialogue: dialogue.dialogue });

    const visual = await generateVisualDescriptionForNode(this.inputForCurrentNode());
    await this.updateCurrentFields({ visualDescription: visual.visualDescription, resolverText: visual.visualDescription });

    const danbot = await generateDanbotPromptForNode(this.inputForCurrentNode());
    await this.updateCurrentFields({
      danbotTags: danbot.danbotTags,
      positivePrompt: danbot.positivePrompt
    });

    const image = await generateImageForNode({
      ...this.inputForCurrentNode(),
      imageId: options.imageId,
      seed: options.imageSeed,
      createdAt: options.createdAt
    });
    await this.attachImageToCurrentNode(image.imageRef);

    return {
      nodeId,
      userText: user.userText,
      dialogue: dialogue.dialogue,
      visualDescription: visual.visualDescription,
      danbotTags: danbot.danbotTags,
      positivePrompt: danbot.positivePrompt,
      imageRef: image.imageRef,
      warnings: [...danbot.warnings, ...image.warnings]
    };
  }

  private inputForCurrentNode(): StoryNodeGenerationInput {
    return {
      backend: this.backend,
      config: this.config,
      node: this.currentNode,
      storyId: this.storyId,
      selectedNodeId: this.selectedNodeId
    };
  }
}
