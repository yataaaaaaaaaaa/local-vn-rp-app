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
  StoryNodeFields,
  StoryTreeBundle,
  StoryWorkflowPayload,
  StoryWorkflowStepId
} from "@local-vn/story-domain";

export interface StoryGenerationBackend {
  generateLlm(request: LlmGenerateRequest): Promise<LlmGenerateResponse>;
  generateDanbotTags(request: DanbotGenerateRequest): Promise<DanbotGenerateResponse>;
  generateImage(request: ImageGenerateRequest): Promise<ImageGenerateResponse>;
  resolveAssets?(request: AssetResolveRequest): Promise<AssetResolveResponse>;
  getRuntimeStatus?(): Promise<RuntimeStatus>;
}

export interface StoryModelLoadingBackend {
  loadLlmModel(request: LlmLoadRequest): Promise<void>;
  loadImageModel(request: ImageModelLoadRequest): Promise<void>;
  loadDanbotModel(request: DanbotLoadRequest): Promise<void>;
  getRuntimeStatus?(): Promise<RuntimeStatus>;
}

export interface StoryPersistencePort {
  loadStory(storyId: string): Promise<StoryTreeBundle | null>;
  saveStory(bundle: StoryTreeBundle): Promise<void>;
}

export interface StorySessionServices {
  backend: StoryGenerationBackend & StoryModelLoadingBackend;
  persistence: StoryPersistencePort;
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
