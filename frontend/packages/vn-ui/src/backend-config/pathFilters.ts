import type { NativePathFilters } from "./pathPickerTypes";

export const GGUF_FILTERS: NativePathFilters = [
  {
    name: "GGUF models",
    extensions: ["gguf"]
  },
  {
    name: "All files",
    extensions: ["*"]
  }
];

export const IMAGE_MODEL_FILTERS: NativePathFilters = [
  {
    name: "Image models",
    extensions: ["safetensors", "ckpt", "bin", "pt", "pth"]
  },
  {
    name: "All files",
    extensions: ["*"]
  }
];

export const LORA_FILTERS: NativePathFilters = [
  {
    name: "LoRA weights",
    extensions: ["safetensors", "pt", "bin"]
  },
  {
    name: "All files",
    extensions: ["*"]
  }
];

export const DANBOT_MODEL_FILTERS: NativePathFilters = [
  {
    name: "DanBotNL models",
    extensions: ["safetensors", "bin", "pt", "pth", "onnx"]
  },
  {
    name: "All files",
    extensions: ["*"]
  }
];
