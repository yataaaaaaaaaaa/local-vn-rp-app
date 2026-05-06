import {
  storyResolverTextTraceFile,
  type FilePersistenceApi
} from "@local-vn/config";

export async function appendResolverTextTraceEntries(
  api: FilePersistenceApi,
  storyId: string,
  entries: readonly unknown[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  await api.appendText(
    storyResolverTextTraceFile(storyId),
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`
  );
}
