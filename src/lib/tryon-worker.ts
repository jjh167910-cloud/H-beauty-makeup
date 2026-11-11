/// <reference lib="webworker" />
/*
 * Runs the looks' tiny makeup networks (ONNX Runtime Web, WebAssembly) off the main
 * thread. Each look's network is loaded once from the offline AI cache and kept.
 */
import type { InferenceSession } from "onnxruntime-web";

type Ort = typeof import("onnxruntime-web");
type Request =
  | { id: number; type: "warm"; look?: string }
  | { id: number; type: "run"; look: string; data: Float32Array };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const AI_CACHE = "hb-ai-models-v2";
const model = (look: string) => `/tryon/tiny/${look}.onnx`;
let runtime: Promise<Ort> | null = null;
const sessions = new Map<string, Promise<InferenceSession>>();

function loadRuntime(): Promise<Ort> {
  if (!runtime) {
    runtime = (async () => {
      const ort = (await import("onnxruntime-web/wasm-extern")) as unknown as Ort;
      // Absolute URL: keeps the dev server from rewriting ORT's dynamic import.
      ort.env.wasm.wasmPaths = new URL("/tryon/ort/", scope.location.origin).href;
      ort.env.wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      return ort;
    })();
    runtime.catch(() => { runtime = null; });
  }
  return runtime;
}

function session(look: string): Promise<InferenceSession> {
  let s = sessions.get(look);
  if (!s) {
    s = (async () => {
      const ort = await loadRuntime();
      const cache = await caches.open(AI_CACHE);
      const response = (await cache.match(model(look))) ?? (await fetch(model(look)));
      if (!response.ok) throw new Error("model missing");
      const bytes = new Uint8Array(await response.arrayBuffer());
      return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })();
    s.catch(() => sessions.delete(look));
    sessions.set(look, s);
  }
  return s;
}

scope.onmessage = async (event: MessageEvent<Request>) => {
  const message = event.data;
  try {
    if (message.type === "warm") {
      await loadRuntime();
      if (message.look) await session(message.look);
      scope.postMessage({ id: message.id, ok: true });
      return;
    }
    const ort = await loadRuntime();
    const s = await session(message.look);
    const started = performance.now();
    const result = await s.run({ rgb: new ort.Tensor("float32", message.data, [1, 3, 256, 256]) });
    const out = result.out.data as Float32Array;
    scope.postMessage({ id: message.id, ok: true, out, ms: Math.round(performance.now() - started) }, [out.buffer]);
  } catch (error) {
    scope.postMessage({ id: message.id, ok: false, error: String(error instanceof Error ? error.message : error) });
  }
};
