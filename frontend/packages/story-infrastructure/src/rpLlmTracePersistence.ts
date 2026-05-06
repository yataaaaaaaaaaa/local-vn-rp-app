import {
  storyRpLlmTraceFile,
  type FilePersistenceApi
} from "@local-vn/config";

export async function appendRpLlmTraceEntries(
  api: FilePersistenceApi,
  storyId: string,
  entries: readonly unknown[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  await api.appendText(
    storyRpLlmTraceFile(storyId),
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`
  );
}
