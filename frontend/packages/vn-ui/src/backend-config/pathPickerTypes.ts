export type PathPickerKind = "file" | "folder" | "fileOrFolder";

export interface NativePathFilter {
  name: string;
  extensions: string[];
}

export type NativePathFilters = NativePathFilter[];
