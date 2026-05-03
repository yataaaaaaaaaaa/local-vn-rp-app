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
  ProgressEvent,
  RuntimeStatus
} from "@local-vn/shared-types";

export interface BackendClientOptions { baseUrl: string; }
export type ProgressTransport = "sse" | "websocket";
export interface ProgressConnection { close(): void; }
export interface BackendRequestOptions { signal?: AbortSignal; }

export class BackendClient {
  private readonly baseUrl: string;

  public constructor(options: BackendClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  public health(): Promise<{ ok: boolean; storage_paths?: unknown }> { return this.getJson("/health"); }
  public runtimeStatus(): Promise<RuntimeStatus> { return this.getJson("/runtime/status"); }
  public cancel(): Promise<{ cancelled: boolean; current_aborted?: boolean; queued_aborted?: number }> { return this.postJson("/runtime/cancel", {}); }
  public shutdown(): Promise<{ shutting_down: boolean }> { return this.postJson("/runtime/shutdown", {}); }
  public loadLlm(request: LlmLoadRequest): Promise<RuntimeStatus> { return this.postJson("/llm/load", request); }
  public unloadLlm(): Promise<RuntimeStatus> { return this.postJson("/llm/unload", {}); }
  public generateLlm(request: LlmGenerateRequest, options: BackendRequestOptions = {}): Promise<LlmGenerateResponse> { return this.postJson("/llm/generate", request, options); }
  public loadImageModel(request: ImageModelLoadRequest): Promise<RuntimeStatus> { return this.postJson("/image-model/load", request); }
  public unloadImageModel(): Promise<RuntimeStatus> { return this.postJson("/image-model/unload", {}); }
  public generateImage(request: ImageGenerateRequest, options: BackendRequestOptions = {}): Promise<ImageGenerateResponse> { return this.postJson("/image/generate", request, options); }
  public loadDanbot(request: DanbotLoadRequest): Promise<RuntimeStatus> { return this.postJson("/danbot/load", request); }
  public unloadDanbot(): Promise<RuntimeStatus> { return this.postJson("/danbot/unload", {}); }
  public generateDanbotTags(request: DanbotGenerateRequest, options: BackendRequestOptions = {}): Promise<DanbotGenerateResponse> { return this.postJson("/danbot/generate-tags", request, options); }
  public resolveAssets(request: AssetResolveRequest): Promise<AssetResolveResponse> { return this.postJson("/assets/resolve", request); }

  public connectProgress(onEvent: (event: ProgressEvent) => void, transport: ProgressTransport = "sse"): ProgressConnection {
    if (transport === "websocket") {
      const socket = new WebSocket(this.baseUrl.replace(/^http/, "ws") + "/events");
      socket.addEventListener("message", (event) => onEvent(JSON.parse(String(event.data)) as ProgressEvent));
      return socket;
    }
    const source = new EventSource(`${this.baseUrl}/events`);
    source.addEventListener("message", (event) => onEvent(JSON.parse(String(event.data)) as ProgressEvent));
    return source;
  }

  private async getJson<T>(path: string, options: BackendRequestOptions = {}): Promise<T> {
    return parseJsonResponse<T>(await fetch(`${this.baseUrl}${path}`, {
      signal: options.signal
    }));
  }

  private async postJson<T>(path: string, body: unknown, options: BackendRequestOptions = {}): Promise<T> {
    return parseJsonResponse<T>(await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal
    }));
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Backend request failed (${response.status}): ${extractErrorMessage(text)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

function extractErrorMessage(text: string): string {
  if (!text) return "empty response";
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    // Fall back to the raw response text below.
  }
  return text;
}
