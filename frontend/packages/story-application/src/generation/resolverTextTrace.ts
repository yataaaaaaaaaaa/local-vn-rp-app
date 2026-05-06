export type ResolverTextTraceEntryKind =
  | "tag_question"
  | "numbered_choice"
  | "named_child_choice"
  | "yes_no"
  | "raw_description"
  | "tree_branch";

export interface ResolverTextTraceEntry {
  key: string;
  nodeId: string;
  kind: ResolverTextTraceEntryKind;
  fullPrompt: string;
  rawAnswer: string;
  answer: string;
  associatedTags: string[];
}

export interface ResolverTextTraceRecorder {
  recordQuestion(input: {
    key: string;
    kind: ResolverTextTraceEntryKind;
    fullPrompt: string;
    rawAnswer: string;
    answer: string;
    associatedTags?: readonly string[];
  }): void;
  recordBranchSelection(input: {
    key?: string;
    question?: string;
    selectedBranch: string;
    selectedPath: readonly string[];
    associatedTags?: readonly string[];
  }): void;
  entries(): ResolverTextTraceEntry[];
}

export function createResolverTextTraceRecorder(input: {
  nodeId: string | null;
}): ResolverTextTraceRecorder {
  return new DefaultResolverTextTraceRecorder(input.nodeId?.trim() || "unknown");
}

class DefaultResolverTextTraceRecorder implements ResolverTextTraceRecorder {
  private readonly records: ResolverTextTraceEntry[] = [];

  public constructor(private readonly nodeId: string) {}

  public recordQuestion(input: {
    key: string;
    kind: ResolverTextTraceEntryKind;
    fullPrompt: string;
    rawAnswer: string;
    answer: string;
    associatedTags?: readonly string[];
  }): void {
    this.records.push({
      key: input.key,
      nodeId: this.nodeId,
      kind: input.kind,
      fullPrompt: input.fullPrompt,
      rawAnswer: input.rawAnswer,
      answer: input.answer,
      associatedTags: cleanTags(input.associatedTags ?? [])
    });
  }

  public recordBranchSelection(input: {
    key?: string;
    question?: string;
    selectedBranch: string;
    selectedPath: readonly string[];
    associatedTags?: readonly string[];
  }): void {
    this.recordQuestion({
      key: input.key ?? "action_composition_tree",
      kind: "tree_branch",
      fullPrompt: input.question?.trim() ?? "",
      rawAnswer: input.selectedBranch,
      answer: input.selectedPath.join(" > "),
      associatedTags: input.associatedTags
    });
  }

  public entries(): ResolverTextTraceEntry[] {
    return this.records.map((record) => ({
      ...record,
      associatedTags: [...record.associatedTags]
    }));
  }
}

function cleanTags(tags: readonly string[]): string[] {
  return tags.map((tag) => tag.trim()).filter(Boolean);
}
