import { create } from "zustand";
import type { ProgressConnection } from "@local-vn/backend-client";
import type { GenerationKind, ProgressEvent } from "@local-vn/shared-types";
import { backendClientOrThrow } from "./useBackendClientStore";

type ActiveJobMap = Partial<Record<GenerationKind, string>>;

type ImageProgress = Extract<ProgressEvent, { type: "generation_progress" }>;

interface RuntimeEventsState {
  connected: boolean;
  events: ProgressEvent[];
  latestByJobId: Record<string, ProgressEvent>;
  activeJobIdsByKind: ActiveJobMap;
  latestJobIdsByKind: ActiveJobMap;
  textByJobId: Record<string, string>;
  imageProgressByJobId: Record<string, ImageProgress>;
  connection: ProgressConnection | null;
  connect(): void;
  disconnect(): void;
  clear(): void;
}

export const useRuntimeEventsStore = create<RuntimeEventsState>((set, get) => ({
  connected: false,
  events: [],
  latestByJobId: {},
  activeJobIdsByKind: {},
  latestJobIdsByKind: {},
  textByJobId: {},
  imageProgressByJobId: {},
  connection: null,
  connect: () => {
    if (get().connection) return;
    const connection = backendClientOrThrow().connectProgress((event) => {
      set((state) => reduceRuntimeEventState(state, event));
    });
    set({ connection, connected: true });
  },
  disconnect: () => {
    get().connection?.close();
    set({ connection: null, connected: false });
  },
  clear: () => set({
    events: [],
    latestByJobId: {},
    activeJobIdsByKind: {},
    latestJobIdsByKind: {},
    textByJobId: {},
    imageProgressByJobId: {}
  })
}));

function reduceRuntimeEventState(state: RuntimeEventsState, event: ProgressEvent): Partial<RuntimeEventsState> {
  const events = [...state.events.slice(-199), event];
  const latestByJobId = { ...state.latestByJobId, [event.job_id]: event };
  const activeJobIdsByKind = { ...state.activeJobIdsByKind };
  const latestJobIdsByKind = { ...state.latestJobIdsByKind };
  const textByJobId = { ...state.textByJobId };
  const imageProgressByJobId = { ...state.imageProgressByJobId };

  if (event.type === "generation_started") {
    activeJobIdsByKind[event.kind] = event.job_id;
    latestJobIdsByKind[event.kind] = event.job_id;
    if (event.kind === "llm" || event.kind === "danbot") textByJobId[event.job_id] = "";
  } else if (event.type === "text_delta") {
    latestJobIdsByKind[event.kind] = event.job_id;
    textByJobId[event.job_id] = `${textByJobId[event.job_id] ?? ""}${event.text}`;
  } else if (event.type === "generation_progress") {
    latestJobIdsByKind.image = event.job_id;
    imageProgressByJobId[event.job_id] = event;
  } else if (event.type === "generation_completed" || event.type === "generation_failed" || event.type === "generation_cancelled") {
    latestJobIdsByKind[event.kind] = event.job_id;
    if (activeJobIdsByKind[event.kind] === event.job_id) delete activeJobIdsByKind[event.kind];
  }

  return { events, latestByJobId, activeJobIdsByKind, latestJobIdsByKind, textByJobId, imageProgressByJobId };
}
