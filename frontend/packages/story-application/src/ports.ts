import type {
  AssetResolveRequest,
  AssetResolveResponse,
  DanbotGenerateRequest,
  DanbotGenerateResponse,
  DanbotLoadRequest,
  ImageGenerateRequest,
  ImageGenerateResponse,
  ImageModelLoadRequest,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmLoadRequest,
  RuntimeStatus
} from "@local-vn/shared-types";
import type {
  StoryManifest,
  StoryNodeFields,
  StoryTreeBundle,
  StoryWorkflowPayload,
  StoryWorkflowStepId
} from "@local-vn/story-domain";

export interface StoryBackendRequestOptions {
  signal?: AbortSignal;
}

export interface StoryGenerationBackend {
  generateLlm(
    request: LlmGenerateRequest,
    options?: StoryBackendRequestOptions
  ): Promise<LlmGenerateResponse>;
  generateDanbotTags(
    request: DanbotGenerateRequest,
    options?: StoryBackendRequestOptions
  ): Promise<DanbotGenerateResponse>;
  generateImage(
    request: ImageGenerateRequest,
    options?: StoryBackendRequestOptions
  ): Promise<ImageGenerateResponse>;
  resolveAssets?(request: AssetResolveRequest): Promise<AssetResolveResponse>;
  getRuntimeStatus?(): Promise<RuntimeStatus>;
}

export interface StoryModelLoadingBackend {
  loadLlmModel(request: LlmLoadRequest): Promise<void>;
  loadImageModel(request: ImageModelLoadRequest): Promise<void>;
  loadDanbotModel(request: DanbotLoadRequest): Promise<void>;
  getRuntimeStatus?(): Promise<RuntimeStatus>;
}

export interface StoryRuntimeControlBackend {
  cancelAll?(): Promise<void>;
}

export interface StoryUserInputPolicy {
  shouldAutoGenerateUserText(): boolean;
}

export interface StoryPersistencePort {
  loadStory(storyId: string): Promise<StoryTreeBundle | null>;
  saveStory(bundle: StoryTreeBundle): Promise<void>;
  listStories?(): Promise<StoryManifest[]>;
}

export interface StorySessionServices {
  backend: StoryGenerationBackend & StoryModelLoadingBackend & StoryRuntimeControlBackend;
  persistence: StoryPersistencePort;
  userInputPolicy?: StoryUserInputPolicy;
  autosave?: boolean;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export interface StoryWorkflowContext {
  nodeId: string;
  fields: StoryNodeFields;
  parentFields?: StoryNodeFields | null;
  stepId: StoryWorkflowStepId;
  payload: StoryWorkflowPayload;
  backend: StoryGenerationBackend;
  outputImageFile?: (imageId: string) => string;
}
