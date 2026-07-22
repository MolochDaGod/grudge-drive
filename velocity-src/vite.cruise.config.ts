/**
 * Minimal Houston Cruise production build — no Tailwind, no radix UI kit.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const basePath = process.env.BASE_PATH ?? "/arcade/";

export default defineConfig({
  base: basePath,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      "@workspace/assets": path.resolve(import.meta.dirname, "../../lib/assets/src/index.ts"),
      "@workspace/animator": path.resolve(import.meta.dirname, "../../lib/animator/src/index.ts"),
    },
    dedupe: ["react", "react-dom", "three"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "cruise.html"),
      // Bundle three + examples (GLTFLoader / Meshopt) — CDN external broke
      // the live Three scene for many browsers (blank #root / failed imports).
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three-vendor";
          if (id.includes("three-mesh-bvh")) return "bvh-vendor";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 3000,
    target: "es2022",
    sourcemap: false,
    minify: "esbuild",
    cssCodeSplit: false,
  },
  esbuild: {
    legalComments: "none",
  },
});
