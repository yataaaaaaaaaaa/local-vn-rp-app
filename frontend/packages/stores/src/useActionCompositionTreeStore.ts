import { create } from "zustand";
import { actionCompositionTreeConfigFile } from "@local-vn/config";
import {
  cloneActionCompositionTree,
  defaultActionCompositionTree,
  validateActionCompositionNode,
  type ActionCompositionNode
} from "@local-vn/story-application";
import { persistenceApi } from "@local-vn/story-infrastructure";

interface ActionCompositionTreeState {
  tree: ActionCompositionNode;
  jsonText: string;
  dirty: boolean;
  error: string | null;
  load(): Promise<void>;
  save(): Promise<void>;
  setTree(tree: ActionCompositionNode): void;
  setJsonText(jsonText: string): void;
  applyJsonText(): void;
  addChildAtPath(path: string[], child: ActionCompositionNode): void;
}

export const useActionCompositionTreeStore = create<ActionCompositionTreeState>((set, get) => ({
  tree: cloneActionCompositionTree(defaultActionCompositionTree),
  jsonText: formatJson(defaultActionCompositionTree),
  dirty: false,
  error: null,
  load: async () => {
    try {
      const tree = await persistenceApi().readJson<ActionCompositionNode>(
        actionCompositionTreeConfigFile(),
        defaultActionCompositionTree
      );
      validateActionCompositionNode(tree);
      set({
        tree,
        jsonText: formatJson(tree),
        dirty: false,
        error: null
      });
    } catch (error) {
      set({
        tree: cloneActionCompositionTree(defaultActionCompositionTree),
        jsonText: formatJson(defaultActionCompositionTree),
        dirty: false,
        error: errorToMessage(error)
      });
    }
  },
  save: async () => {
    const tree = get().tree;
    validateActionCompositionNode(tree);
    await persistenceApi().writeJson(actionCompositionTreeConfigFile(), tree);
    set({
      jsonText: formatJson(tree),
      dirty: false,
      error: null
    });
  },
  setTree: (tree) => {
    validateActionCompositionNode(tree);
    set({
      tree,
      jsonText: formatJson(tree),
      dirty: true,
      error: null
    });
  },
  setJsonText: (jsonText) => set({ jsonText, dirty: true, error: null }),
  applyJsonText: () => {
    try {
      const tree = JSON.parse(get().jsonText) as ActionCompositionNode;
      validateActionCompositionNode(tree);
      set({
        tree,
        jsonText: formatJson(tree),
        dirty: true,
        error: null
      });
    } catch (error) {
      set({ error: errorToMessage(error) });
    }
  },
  addChildAtPath: (path, child) => {
    validateActionCompositionNode(child);
    set((state) => {
      const tree = cloneActionCompositionTree(state.tree);
      const parent = findNodeByPath(tree, path);

      if (!parent) {
        throw new Error(`Cannot find action composition tree path: ${path.join(" > ")}`);
      }

      parent.child = [...(parent.child ?? []), child];

      return {
        tree,
        jsonText: formatJson(tree),
        dirty: true,
        error: null
      };
    });
  }
}));

function findNodeByPath(
  tree: ActionCompositionNode,
  path: string[]
): ActionCompositionNode | null {
  if (!path.length || path[0] !== tree.name) {
    return null;
  }

  let current = tree;

  for (const segment of path.slice(1)) {
    if (!current.child?.length) {
      return null;
    }

    const next = current.child.find((child) => child.name === segment);

    if (!next) {
      return null;
    }

    current = next;
  }

  return current;
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
