declare module "@replayable-text-tree/core" {
  export type TextTree = Record<string, unknown> & { rootId: string };
  export type TextTreeSchema = { fields: Record<string, { storage: "raw" | "diff" }> };
  export type TextTreeCursor = { currentNodeId?: string; backStack?: string[]; forwardStack?: string[] } & Record<string, unknown>;
  export function createTextTree(schema: TextTreeSchema, rootFields: Record<string, string>): TextTree;
  export function addChildNode(tree: TextTree, parentId: string, fields: Record<string, string>, options?: { nodeId?: string }): { tree: TextTree; nodeId: string };
  export function resolveField(tree: TextTree, nodeId: string, field: string): string;
  export function resolveNode(tree: TextTree, nodeId: string): { id?: string; fields: Record<string, string> };
  export function editNodeField(tree: TextTree, nodeId: string, field: string, value: string): TextTree;
  export function createTreeCursor(tree: TextTree): TextTreeCursor;
  export function getCurrentNode(tree: TextTree, cursor: TextTreeCursor): { id?: string; fields: Record<string, string> };
  export function goToChild(tree: TextTree, cursor: TextTreeCursor, childId: string): TextTreeCursor;
  export function goToParent(tree: TextTree, cursor: TextTreeCursor): TextTreeCursor;
  export function goBack(cursor: TextTreeCursor): TextTreeCursor;
  export function goForward(cursor: TextTreeCursor): TextTreeCursor;
  export function serializeTextTree(tree: TextTree): unknown;
  export function parseTextTree(saved: unknown): TextTree;
}

declare module "danbooru-tag-resolver" {
  import type { ComponentType } from "react";
  export type DanbooruResolverConfig = { schemaVersion: number; categories: unknown[]; [key: string]: unknown };
  export interface DanbooruTagResult { tags: string[]; prompt?: string; warnings?: string[] }
  export function extractDanbooruTags(config: DanbooruResolverConfig, rawText: string, seed: number): DanbooruTagResult;
  export const DanbooruTagResolver: {
    create(): { toJSON(): DanbooruResolverConfig; extractTags(text: string, seed: number): DanbooruTagResult };
    fromJSON(json: DanbooruResolverConfig): { toJSON(): DanbooruResolverConfig; extractTags(text: string, seed: number): DanbooruTagResult };
  };
  export const DanbooruTagResolverEditor: ComponentType<{
    value: DanbooruResolverConfig;
    rawText: string;
    seed: number;
    onChange(value: DanbooruResolverConfig): void;
  }>;
}

declare module "danbooru-tag-resolver/style.css";
