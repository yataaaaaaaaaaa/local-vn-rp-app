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
      "@local-vn/workflow-core": fileURLToPath(new URL("./packages/workflow-core/src/index.ts", import.meta.url)),
      "@local-vn/story-domain": fileURLToPath(new URL("./packages/story-domain/src/index.ts", import.meta.url)),
      "@local-vn/story-application": fileURLToPath(new URL("./packages/story-application/src/index.ts", import.meta.url)),
      "@local-vn/story-infrastructure": fileURLToPath(new URL("./packages/story-infrastructure/src/index.ts", import.meta.url)),
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
    sourcemap: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: "vendor-flow",
              test: /node_modules[\\/](@xyflow|d3-|d3)[\\/]/,
              priority: 30,
            },
            {
              name: "vendor-resolver",
              test: /node_modules[\\/]danbooru-tag-resolver[\\/]/,
              priority: 30,
            },
            {
              name: "vendor-state",
              test: /node_modules[\\/]zustand[\\/]/,
              priority: 20,
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              priority: 10,
              maxSize: 420 * 1024,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
