/// <reference types="vitest/config" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@local-vn/backend-client": fileURLToPath(new URL("./packages/backend-client/src/index.ts", import.meta.url)),
      "@local-vn/config": fileURLToPath(new URL("./packages/config/src/index.ts", import.meta.url)),
      "@local-vn/shared-types": fileURLToPath(new URL("./packages/shared-types/src/index.ts", import.meta.url)),
      "@local-vn/story-tree": fileURLToPath(new URL("./packages/story-tree/src/index.ts", import.meta.url)),
      "@local-vn/story-mechanism": fileURLToPath(new URL("./packages/story-mechanism/src/index.ts", import.meta.url)),
      "@local-vn/stores": fileURLToPath(new URL("./packages/stores/src/index.ts", import.meta.url)),
      "@local-vn/vn-ui": fileURLToPath(new URL("./packages/vn-ui/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    sourcemap: true
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
