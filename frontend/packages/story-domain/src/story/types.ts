export interface StoryNodeFields {
  context: string;
  userText: string;
  dialogue: string;
  visualDescription: string;
  resolverText: string;
  selectedTags: string;
  danbotTags: string;
  positivePrompt: string;
  negativePrompt: string;
  imageRef: string;
}

export type StoryNodeFieldKey = keyof StoryNodeFields;

export interface ImageRef {
  image_id: string;
  image_path: string;
  metadata_path: string;
  seed: number;
  created_at: string;
}

export interface StoryManifest {
  story_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  root_node_id: string;
}

export interface StorySnapshot {
  manifest: StoryManifest;
  tree: unknown;
  selected_node_id: string;
  image_refs: Record<string, ImageRef>;
}
