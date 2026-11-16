/**
 * Where a look's tiny network is (the fallback engine on phones without WebGL2: tryon.ts downloads it, tryon-worker.ts
 * runs it). The version is bumped when the networks are trained again, so phones fetch the new ones instead of using
 * the cached ones.
 */
export const TINY_V = "?v=3";
export const tinyModel = (look: string) => `/tryon/tiny/${look}.onnx${TINY_V}`;
/** The same network as downloaded before this TINY_V (dropped from the cache). */
export const oldTinyModels = (look: string) => [`/tryon/tiny/${look}.onnx`, `/tryon/tiny/${look}.onnx?v=2`];
