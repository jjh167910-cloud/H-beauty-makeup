import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import aiPieces from "./scripts/vite-ai-pieces";
import chatApi from "./scripts/vite-chat-api";

export default defineConfig({
  // aiPieces: the big AI files in 1 MiB pieces (a dropped download costs one piece; scripts/vite-ai-pieces.ts).
  // chatApi: the salon's chat API on the dev server (the Worker's code over node:sqlite; scripts/vite-chat-api.ts).
  plugins: [react(), tailwindcss(), aiPieces(), chatApi()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // ONNX Runtime Web without its bundled wasm: the try-on loads the runtime
      // files from /tryon/ort/ (kept in the offline AI cache, not per release).
      "onnxruntime-web/wasm-extern": fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs", import.meta.url)),
      // The same with its WebGPU build (the HD face): its files are in /tryon/ort/ too.
      "onnxruntime-web/webgpu-extern": fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs", import.meta.url)),
    },
  },
  // Pre-bundle the try-on's lazily imported libraries up front so the dev server
  // doesn't discover them mid-session and reload the page.
  optimizeDeps: { include: ["@mediapipe/tasks-vision"], exclude: ["onnxruntime-web"] },
  build: { outDir: "dist", assetsDir: "assets", sourcemap: false },
});
