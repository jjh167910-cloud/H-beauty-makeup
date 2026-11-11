/*
 * Makeup try-on that runs entirely on the phone (works offline).
 *
 * MediaPipe Face Landmarker finds the face (478 points with depth). Then one of two engines
 * paints the look:
 *
 * "gpu" (phones with WebGL2, i.e. nearly all): the makeup engine on the graphics chip
 *   (makeup-gl.ts) - the catalog layer warped along the face mesh, real lipstick matched to her
 *   light and skin, crisp liner and lashes, soft / natural / bold - at full photo resolution in
 *   a fraction of a second, and on every camera frame of the live mirror. A soft or small photo
 *   is first sharpened by a small network on the graphics chip (enhance-gl.ts).
 *
 * "tiny" (fallback): TinyBeauty-style (Jin et al., ECCV 2024) tiny network per look
 *   (~87K parameters, ONNX Runtime Web in a worker) on the face aligned to 256x256; only its
 *   change is mapped back onto her photo, plus the eye detail.
 *
 * Both engines paint only where her face can be seen: MediaPipe's multi-class segmentation marks
 * her face skin, so nothing goes over hair, hands, glasses frames or sunglasses (visibility()).
 *
 * All files are downloaded once into Cache Storage and served from there by the service
 * worker, so everything keeps working offline.
 */
import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { Enhancer } from "./enhance-gl";
import { hdBackend, hdFace, hdNeeded, hdRunning, hdSession, joinParts } from "./face-hd";
import { STUDIO_CRISP, Studio, studioParams } from "./studio-gl";
import { styleById } from "@/data/makeup-styles";
import {
  LIP_GRID, LIPS_IN, LIPS_OUT, MakeupGL, STEP_KEYS, linHex, VIS_SEG, eyeWidth, linerColour, lipChoice, measureFace, mineLight, pigment, productLight, visCrop,
  type Canon, type EyeFiles, type FaceStats, type Finish, type Level, type LipChoice, type LipGrid, type LipInfo, type LookFiles,
  type Mine, type MineZone, type Products, type StepKey, type StepState, type Swatch, type Visibility,
} from "./makeup-gl";

export type { Finish, LipGrid, Level, LipChoice, Mine, MineZone, StepKey, StepState, Visibility } from "./makeup-gl";
export { STEP_KEYS, stepGeometry } from "./makeup-gl";

export type Pt = [number, number, number];
/** Canvas transform (a, b, c, d, e, f) from photo pixels to the 256x256 aligned face. */
export type Affine = [number, number, number, number, number, number];
/**
 * A photo ready for painting: the picture, her landmarks, the aligned face (tiny engine), her light
 * references, and where her face can be seen (null: unknown, everything is painted).
 */
export type Shot = {
  photo: HTMLCanvasElement; points: Pt[]; align: Affine; input: Float32Array; face?: FaceStats; vis?: Visibility | null;
  /** Her lips refined (null: the detected shape is used). */
  lips?: LipGrid | null;
};
/**
 * Her photo as taken (`plain`) and, when it was soft or small, sharpened on the graphics chip
 * (`sharp`); `blur` is how soft it was (Gaussian sigma in pixels around the eyes).
 */
export type Prepared = {
  plain: Shot; sharp: Shot | null; blur: number; sharpMs: number; skipped?: "slow" | "failed";
  /** Her face redrawn in HD (face-hd.ts) on `sharp` (ms it took), or why not (her face didn't need it: neither). */
  hdMs?: number; hdSkipped?: "slow" | "failed";
  /** The same photos retouched in studio light (studio-gl.ts); null where the phone can't. */
  studio: { plain: Shot; sharp: Shot | null } | null;
};
export type TryOnError = "no-face" | "no-model" | "no-camera" | "failed";

const BASE = "/tryon/";
export const AI_CACHE = "hb-ai-models-v2";
const ORT_DIR = `${BASE}ort/`;
const ORT_WASM = `${ORT_DIR}ort-wasm-simd-threaded.wasm`;
const ORT_GLUE = `${ORT_DIR}ort-wasm-simd-threaded.mjs`;
const FACE_FILES = [`${BASE}wasm/vision_wasm_internal.js`, `${BASE}wasm/vision_wasm_internal.wasm`, `${BASE}face_landmarker.task`];
/** MediaPipe's multi-class selfie segmentation (Apache-2.0), weights in float16: where her face can be seen. */
const SEGMENT = `${BASE}segment.tflite`;
/** The eye detail's version: bumped when the eye maps are made again (so phones fetch them instead of the cached ones). */
const EYES_V = "?v=3";
const EYES_META = `${BASE}eyes.json${EYES_V}`;
/**
 * The look data's version: bumped when the layers, coverage maps and looks.json are made again, so phones that
 * downloaded the earlier files fetch these (a few MB) instead of using the cached ones; the old ones are dropped.
 */
const DATA_V = "?v=6";
const LOOKS_META = `${BASE}looks.json${DATA_V}`;
const ENHANCE = `${BASE}enhance-x4.bin`;
/**
 * HD face (face-hd.ts): the network in four parts, and ONNX Runtime's WebGPU build (its glue script, its WebAssembly in two
 * parts). Cloudflare Workers serve no file over 25 MiB: the network is 82 MiB, the WebAssembly 25.5.
 */
const HD_PARTS = [0, 1, 2, 3].map((i) => `${BASE}face-hd/gfpgan-1.4-q8.${i}-of-4.bin`);
const ORT_GPU_GLUE = `${ORT_DIR}ort-wasm-simd-threaded.asyncify.mjs`;
const ORT_GPU_WASM = [0, 1].map((i) => `${ORT_DIR}ort-wasm-simd-threaded.asyncify.${i}-of-2.bin`);
const ORT_GPU = [ORT_GPU_GLUE, ...ORT_GPU_WASM];
const HD_FILES = [...HD_PARTS, ...ORT_GPU];
export const lookModel = (id: string) => `${BASE}tiny/${id}.onnx`;
const lookLayer = (id: string) => `${BASE}layers/${id}.webp${DATA_V}`;
const lookEyes = (id: string) => `${BASE}eyes/${id}.png${EYES_V}`;
const lookCov = (id: string) => `${BASE}cov/${id}.webp${DATA_V}`;
/** The same files as downloaded before this DATA_V (dropped from the cache). */
const OLD_DATA = (ids: string[]) => [
  ...["", "?v=2", "?v=3", "?v=4", "?v=5"].flatMap((v) => [`${BASE}looks.json${v}`, ...ids.flatMap((id) => [`${BASE}layers/${id}.webp${v}`, `${BASE}cov/${id}.webp${v}`])]),
  ...["", "?v=2"].flatMap((v) => [`${BASE}eyes.json${v}`, ...ids.map((id) => `${BASE}eyes/${id}.png${v}`)]),
  // (the HD face's files as they were, whole or in two parts)
  `${BASE}face-hd/gfpgan-1.4-q8.0.bin`, `${BASE}face-hd/gfpgan-1.4-q8.1.bin`, `${ORT_DIR}ort-wasm-simd-threaded.asyncify.wasm`,
];
const SIZE = 256;
const MAX_SIDE = 1600;
/** How much of the full-resolution catalog lash/liner detail to add on top of the tiny network. */
const EYE_DETAIL = 0.6;

const EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
const EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];

/* --------------------------------------------------------------- engine */

let renderer: MakeupGL | null | undefined;

/** The makeup engine on the graphics chip, or null on phones without WebGL2. */
export function gpu(): MakeupGL | null {
  if (renderer?.lost) renderer = undefined;
  if (renderer === undefined) renderer = MakeupGL.create();
  return renderer;
}

export type Engine = "gpu" | "tiny";
export const engine = (): Engine => (gpu() ? "gpu" : "tiny");

/** This phone gets the HD face (WebGPU; known once `files` has asked). */
let hdOn: boolean | undefined;
async function hdWanted(): Promise<boolean> {
  if (engine() !== "gpu") return false;
  hdOn ??= !!(await hdBackend());
  return hdOn;
}

/** About how many MB the one-time download is for this phone's engine (the HD face adds 112 MB where it runs). */
export const downloadMB = () => (engine() === "gpu" ? 36 + (hdOn ? 112 : 0) : 53);

/* ---------------------------------------------------------------- files */

/** Every file the try-on needs on this phone. */
async function files(lookIds: string[]) {
  const shared = [...FACE_FILES, SEGMENT, EYES_META, ...lookIds.map(lookEyes)];
  const hd = await hdWanted();
  return engine() === "gpu"
    ? { need: [...shared, LOOKS_META, ENHANCE, ...(hd ? HD_FILES : []), ...lookIds.map(lookLayer), ...lookIds.map(lookCov)], drop: [ORT_WASM, ORT_GLUE, ...lookIds.map(lookModel), ...OLD_DATA(lookIds)] }
    : { need: [...shared, ORT_WASM, ORT_GLUE, ...lookIds.map(lookModel)], drop: [ENHANCE, ...HD_FILES, ...OLD_DATA(lookIds)] };
}

export async function modelsReady(lookIds: string[] = []): Promise<boolean> {
  try {
    const cache = await caches.open(AI_CACHE);
    for (const url of (await files(lookIds)).need) if (!(await cache.match(url))) return false;
    return true;
  } catch {
    return false;
  }
}

/** Remove the files of earlier try-on engines (e.g. the 52 MB EleGANt download). */
async function dropOldCaches() {
  for (const key of await caches.keys().catch(() => [] as string[])) {
    if (key.startsWith("hb-ai-models-") && key !== AI_CACHE) await caches.delete(key).catch(() => false);
  }
}

/**
 * Download every file the try-on needs (about 36 MB with the graphics-chip engine, 53 MB with
 * the tiny networks; once), reporting 0..1 progress. `thumbs` (the look rail's photos) are kept
 * in the same cache so the rail works offline too; the service worker finds them there.
 */
export async function downloadModels(lookIds: string[], onProgress: (done: number) => void, thumbs: string[] = []): Promise<void> {
  const cache = await caches.open(AI_CACHE);
  const { need, drop } = await files(lookIds);
  const big = need.filter((url) => url === ORT_WASM || url === ENHANCE || url === SEGMENT || FACE_FILES.includes(url) || HD_FILES.includes(url));
  const small = [...need.filter((url) => !big.includes(url)), ...thumbs];
  // Byte weights so the bar moves smoothly even without content-length.
  const weights = new Map<string, number>([[ORT_WASM, 14_300_000], [FACE_FILES[1], 13_600_000], [FACE_FILES[2], 3_800_000], [SEGMENT, 8_300_000], [LOOKS_META, 330_000], [ENHANCE, 2_430_000],
    ...HD_PARTS.map((url): [string, number] => [url, 21_400_000]), [ORT_GPU_GLUE, 53_000], ...ORT_GPU_WASM.map((url): [string, number] => [url, 13_400_000])]);
  for (const id of lookIds) { weights.set(lookModel(id), 230_000); weights.set(lookLayer(id), 130_000); weights.set(lookCov(id), 25_000); }
  const total = [...big, ...small].reduce((sum, url) => sum + (weights.get(url) ?? 30_000), 0);
  let done = 0;
  const bump = (n: number) => { done += n; onProgress(Math.min(1, done / total)); };
  for (const url of big) {
    const expected = weights.get(url) ?? 30_000;
    if (await cache.match(url)) { bump(expected); continue; }
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok || !response.body) throw "no-model" satisfies TryOnError;
    const length = Number(response.headers.get("content-length")) || expected;
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      parts.push(value);
      bump((value.length / length) * expected);
    }
    const type = response.headers.get("content-type") ?? "application/octet-stream";
    await cache.put(url, new Response(new Blob(parts as BlobPart[], { type }), { headers: { "content-type": type } }));
  }
  for (let i = 0; i < small.length; i += 8) {
    await Promise.all(small.slice(i, i + 8).map(async (url) => {
      if (!(await cache.match(url))) {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) throw "no-model" satisfies TryOnError;
        await cache.put(url, response);
      }
      bump(weights.get(url) ?? 30_000);
    }));
  }
  await dropOldCaches();
  // Files of the other engine (e.g. the tiny networks from before the graphics-chip engine).
  await Promise.all(drop.map((url) => cache.delete(url).catch(() => false)));
  // Ask the browser not to evict the offline AI files under storage pressure.
  await navigator.storage?.persist?.().catch(() => false);
  onProgress(1);
}

async function cached(url: string): Promise<Response> {
  const hit = await caches.open(AI_CACHE).then((cache) => cache.match(url)).catch(() => undefined);
  if (hit) return hit;
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) throw "no-model" satisfies TryOnError;
  return response;
}

/* --------------------------------------------------------------- models */

const faceModels = new Map<"IMAGE" | "VIDEO", Promise<FaceLandmarker>>();
const TELEMETRY = "https://odml.pa.googleapis.com/";

/**
 * MediaPipe Tasks reports usage statistics to Google once a minute. This app promises that
 * nothing leaves the phone, so that one address is refused before any request is made
 * (MediaPipe then stops trying). Everything else goes through untouched.
 */
function blockTelemetry() {
  const original = globalThis.fetch as typeof fetch & { hbGuard?: true };
  if (original.hbGuard) return;
  const guarded = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(TELEMETRY)) return Promise.reject(new TypeError("blocked: usage statistics"));
    return original(input, init);
  }) as typeof fetch & { hbGuard?: true };
  guarded.hbGuard = true;
  globalThis.fetch = guarded;
}

/** MediaPipe Face Landmarker for photos ("IMAGE") or camera frames ("VIDEO"). */
export function loadFaceModel(mode: "IMAGE" | "VIDEO" = "IMAGE"): Promise<FaceLandmarker> {
  let model = faceModels.get(mode);
  if (!model) {
    model = (async () => {
      blockTelemetry();
      const { FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const task = new Uint8Array(await (await cached(FACE_FILES[2])).arrayBuffer());
      return FaceLandmarker.createFromOptions(
        { wasmLoaderPath: FACE_FILES[0], wasmBinaryPath: FACE_FILES[1] },
        { baseOptions: { modelAssetBuffer: task, delegate: "CPU" }, runningMode: mode, numFaces: 1 },
      );
    })();
    model.catch(() => faceModels.delete(mode));
    faceModels.set(mode, model);
  }
  return model;
}

const segmenters = new Map<"IMAGE" | "VIDEO", Promise<ImageSegmenter>>();

/** MediaPipe's multi-class segmentation for photos ("IMAGE") or camera frames ("VIDEO"). */
export function loadSegmenter(mode: "IMAGE" | "VIDEO" = "IMAGE"): Promise<ImageSegmenter> {
  let model = segmenters.get(mode);
  if (!model) {
    model = (async () => {
      blockTelemetry();
      const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const task = new Uint8Array(await (await cached(SEGMENT)).arrayBuffer());
      return ImageSegmenter.createFromOptions(
        { wasmLoaderPath: FACE_FILES[0], wasmBinaryPath: FACE_FILES[1] },
        { baseOptions: { modelAssetBuffer: task, delegate: "CPU" }, runningMode: mode, outputConfidenceMasks: true, outputCategoryMask: false },
      );
    })();
    model.catch(() => segmenters.delete(mode));
    segmenters.set(mode, model);
  }
  return model;
}

const FACE_SKIN = 3, BODY_SKIN = 2;   // the segmenter's classes: background, hair, body skin, face skin, clothes, other

/**
 * Where her face can be seen (classes() in occlusion.py): the segmenter on a square crop around her
 * face, its face-skin and body-skin probabilities. `scratch` is a 256x256 canvas to reuse; `time`
 * (ms) is a camera frame's time in the live mirror. Null when the segmenter isn't available (then
 * everything is painted, as before).
 */
export async function visibility(source: CanvasImageSource, points: Pt[], scratch?: HTMLCanvasElement, time?: number): Promise<Visibility | null> {
  try {
    const seg = await loadSegmenter(time === undefined ? "IMAGE" : "VIDEO");
    const box = visCrop(points);
    const c = scratch ?? canvas(VIS_SEG, VIS_SEG);
    const g = ctx2d(c);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.clearRect(0, 0, VIS_SEG, VIS_SEG);
    // outside the photo: its edge pixels, stretched (as the reference's crop)
    const k = VIS_SEG / box[2];
    g.drawImage(source, -box[0] * k, -box[1] * k, (source as HTMLCanvasElement).width * k, (source as HTMLCanvasElement).height * k);
    padEdges(g, VIS_SEG, -box[0] * k, -box[1] * k, (source as HTMLCanvasElement).width * k, (source as HTMLCanvasElement).height * k);
    const result = time === undefined ? seg.segment(c) : seg.segmentForVideo(c, time);
    const masks = result.confidenceMasks;
    if (!masks || masks.length < 4) { result.close(); return null; }
    const face = masks[FACE_SKIN].getAsFloat32Array(), body = masks[BODY_SKIN].getAsFloat32Array();
    const probs = new Uint8Array(VIS_SEG * VIS_SEG * 2);
    for (let i = 0; i < VIS_SEG * VIS_SEG; i++) {
      probs[i * 2] = Math.round(Math.min(1, Math.max(0, face[i])) * 255);
      probs[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, body[i])) * 255);
    }
    result.close();
    return { probs, box };
  } catch (error) {
    console.warn("face visibility unavailable", error);
    return null;
  }
}

/** Fill the crop outside the photo's rectangle (x, y, w, h on the crop) with the photo's edge pixels. */
function padEdges(g: CanvasRenderingContext2D, n: number, x: number, y: number, w: number, h: number) {
  const x0 = Math.max(0, Math.ceil(x)), y0 = Math.max(0, Math.ceil(y));
  const x1 = Math.min(n, Math.floor(x + w)), y1 = Math.min(n, Math.floor(y + h));
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  if (y0 > 0) g.drawImage(g.canvas, x0, y0, x1 - x0, 1, x0, 0, x1 - x0, y0);
  if (y1 < n) g.drawImage(g.canvas, x0, y1 - 1, x1 - x0, 1, x0, y1, x1 - x0, n - y1);
  if (x0 > 0) g.drawImage(g.canvas, x0, 0, 1, n, 0, 0, x0, n);
  if (x1 < n) g.drawImage(g.canvas, x1 - 1, 0, 1, n, x1, 0, n - x1, n);
}

/* ------------------------------------------------------------- her lip line */

/**
 * As in teacher.py: the lips' crop (this many times their larger side), where her lips' colour decides (eye widths):
 * out to LIP_BAND past the detected outline (her lips may be fuller than it), but only LIP_BAND_IN inside it: the
 * border of her lips (lighter, often catching the light) looks like skin to the colours, and left bare it showed as
 * a pale line along the lipstick.
 */
const LIP_CROP = 1.6, LIP_BAND = 0.14, LIP_BAND_IN = 0.015;
/**
 * How much her lips' brightness counts against their colour in telling them from her skin: the light rim along her
 * upper lip (its border catches the light) is brighter than her lips but as red, and is lip.
 */
const LIP_LUMA = 0.4;

/** Signed distance from (x, y) to a closed polygon (flat x, y list): positive inside. */
function polyDist(poly: number[], x: number, y: number): number {
  let best = Infinity, inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = poly[j * 2], ay = poly[j * 2 + 1], bx = poly[i * 2], by = poly[i * 2 + 1];
    const abx = bx - ax, aby = by - ay, t = Math.min(1, Math.max(0, ((x - ax) * abx + (y - ay) * aby) / Math.max(abx * abx + aby * aby, 1e-12)));
    best = Math.min(best, Math.hypot(x - ax - abx * t, y - ay - aby * t));
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by === ay ? 1e-12 : by - ay) + ax) inside = !inside;
  }
  return inside ? best : -best;
}

/** Mean and inverse covariance (+9 on the diagonal) of 3-vectors, with the log-determinant. */
function gaussFit(f: Float32Array, sel: Uint8Array) {
  let n = 0; const m = [0, 0, 0], c = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < sel.length; i++) if (sel[i]) { n++; for (let k = 0; k < 3; k++) m[k] += f[i * 3 + k]; }
  if (n < 20) return null;
  for (let k = 0; k < 3; k++) m[k] /= n;
  for (let i = 0; i < sel.length; i++) if (sel[i]) {
    const a = f[i * 3] - m[0], b = f[i * 3 + 1] - m[1], d = f[i * 3 + 2] - m[2];
    c[0] += a * a; c[1] += a * b; c[2] += a * d; c[3] += b * b; c[4] += b * d; c[5] += d * d;
  }
  const [xx, xy, xz, yy, yz, zz] = c.map((v, k) => v / n + (k === 0 || k === 3 || k === 5 ? 9 : 0));
  const A = yy * zz - yz * yz, B = xz * yz - xy * zz, C = xy * yz - xz * yy;
  const det = xx * A + xy * B + xz * C;
  const inv = [A, B, C, xx * zz - xz * xz, xy * xz - xx * yz, xx * yy - xy * xy].map((v) => v / det);
  return { m, inv, logdet: Math.log(det) };
}

/**
 * Her lip line (lip_prob in teacher.py): on a LIP_GRID x LIP_GRID crop around her lips, the detected lip shape,
 * and within LIP_BAND of its outline a colour model of her lips against the skin around them, so the lipstick
 * reaches her own lip line and stays off her skin. The graphics chip then fits it to her photo (a guided filter).
 * Null when there are too few pixels to tell lips from skin.
 */
export function lipProb(photo: HTMLCanvasElement, P: Pt[], scratch?: HTMLCanvasElement): LipGrid | null {
  const n = LIP_GRID;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of LIPS_OUT) { x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); y0 = Math.min(y0, P[i][1]); y1 = Math.max(y1, P[i][1]); }
  const side = Math.max(x1 - x0, y1 - y0) * LIP_CROP;
  const box: [number, number, number] = [(x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - side / 2, side];
  const k = n / side;
  const c = scratch && scratch.width === n ? scratch : canvas(n, n);
  const g = ctx2d(c);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.clearRect(0, 0, n, n);
  g.drawImage(photo, -box[0] * k, -box[1] * k, photo.width * k, photo.height * k);
  padEdges(g, n, -box[0] * k, -box[1] * k, photo.width * k, photo.height * k);
  const px = g.getImageData(0, 0, n, n).data;
  const ew = eyeWidth(P) * k;
  const out = LIPS_OUT.flatMap((i) => [(P[i][0] - box[0]) * k, (P[i][1] - box[1]) * k]);
  const inn = LIPS_IN.flatMap((i) => [(P[i][0] - box[0]) * k, (P[i][1] - box[1]) * k]);
  const f = new Float32Array(n * n * 3), so = new Float32Array(n * n), si = new Float32Array(n * n);
  const core = new Uint8Array(n * n), ring = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
    f[i * 3] = LIP_LUMA * (0.299 * r + 0.587 * gg + 0.114 * b); f[i * 3 + 1] = r - gg; f[i * 3 + 2] = gg - b;
    so[i] = polyDist(out, x + 0.5, y + 0.5); si[i] = polyDist(inn, x + 0.5, y + 0.5);
    core[i] = so[i] > 0.06 * ew && si[i] < -0.03 * ew ? 1 : 0;
    ring[i] = so[i] < -0.05 * ew && so[i] > -0.14 * ew ? 1 : 0;
  }
  const lip = gaussFit(f, core), skin = gaussFit(f, ring);
  if (!lip || !skin) return null;
  const ll = (G: NonNullable<typeof lip>, i: number) => {
    const a = f[i * 3] - G.m[0], b = f[i * 3 + 1] - G.m[1], d = f[i * 3 + 2] - G.m[2], [xx, xy, xz, yy, yz, zz] = G.inv;
    return -0.5 * (a * (xx * a + xy * b + xz * d) + b * (xy * a + yy * b + yz * d) + d * (xz * a + yz * b + zz * d)) - 0.5 * G.logdet;
  };
  const p = new Uint8Array(n * n);
  let coreN = 0, coreHit = 0, ringN = 0, ringHit = 0;   // how well the colours tell her lips from her skin
  for (let i = 0; i < n * n; i++) {
    if (si[i] > 0) continue;
    const post = 1 / (1 + Math.exp(-Math.min(8, Math.max(-8, ll(lip, i) - ll(skin, i)))));
    if (core[i]) { coreN++; if (post > 0.5) coreHit++; }
    if (ring[i]) { ringN++; if (post < 0.5) ringHit++; }
    const w = Math.min(1, Math.max(0, 1 - Math.abs(so[i]) / ((so[i] > 0 ? LIP_BAND_IN : LIP_BAND) * ew)));
    p[i] = Math.round(((so[i] > 0 ? 1 : 0) * (1 - w) + post * w) * 255);
  }
  return { p, box, clarity: 0.5 * (coreHit / Math.max(coreN, 1) + ringHit / Math.max(ringN, 1)) };
}

/* The tiny networks run in a worker (see tryon-worker.ts) so the screen stays responsive. */
type Reply = { id: number; ok: boolean; out?: Float32Array; error?: string; ms?: number };
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (reply: Reply) => void>();

function ask(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
  if (!worker) {
    worker = new Worker(new URL("./tryon-worker.ts", import.meta.url), { type: "module", name: "tryon" });
    worker.onmessage = (event: MessageEvent<Reply>) => { pending.get(event.data.id)?.(event.data); pending.delete(event.data.id); };
    worker.onerror = () => {
      for (const resolve of pending.values()) resolve({ id: -1, ok: false, error: "worker" });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = ++nextId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ ...message, id }, transfer);
  });
}

/** Start loading the face model and (optionally) one look's files or network. */
export function warmUp(look?: string) {
  loadFaceModel().catch(() => undefined);
  if (engine() === "gpu") { if (look) loadLook(look).catch(() => undefined); }
  else ask({ type: "warm", look }).catch(() => undefined);
}

/* ------------------------------------------------- look files (gpu engine) */

type LooksMeta = {
  tris: number[]; swatch: Swatch; canon: Canon;
  looks: Record<string, { uv: number[]; lip: LipInfo; tint?: number[]; cov?: { shadow: number } }>;
  /** Her products: a look's own eyeshadow is followed when it is at least this strong; else a style's template look. */
  products?: { shadowMin: number; shadowFrom: Record<string, string> };
};
let looksMeta: Promise<LooksMeta> | null = null;
const lookFiles = new Map<string, Promise<LookFiles>>();

function meta(): Promise<LooksMeta> {
  looksMeta ??= cached(LOOKS_META).then((r) => r.json());
  looksMeta.catch(() => { looksMeta = null; });
  return looksMeta;
}

/** Mesh triangles shared by all looks. */
export async function meshTriangles(): Promise<number[]> {
  return (await meta()).tris;
}

/** What the lipstick picker needs: the swatch calibration and the bare face's coordinates. */
export async function lipstickData(): Promise<{ swatch: Swatch; canon: Canon }> {
  const { swatch, canon } = await meta();
  return { swatch, canon };
}

/** A look's catalog layer, lipstick and eye detail, for the graphics-chip engine. */
export function loadLook(id: string): Promise<LookFiles> {
  let files = lookFiles.get(id);
  if (!files) {
    files = (async () => {
      await meshTriangles();
      const [all, layer, eyes] = await Promise.all([
        looksMeta!,
        cached(lookLayer(id)).then((r) => r.blob()).then((b) => createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" })),
        loadEyes(id).catch(() => null),
      ]);
      const meta = all.looks[id];
      if (!meta) throw "no-model" satisfies TryOnError;
      const eyeFiles: EyeFiles | null = eyes ? { ids: eyes.ids, pts: eyes.pts, tris: eyes.tris, w: eyes.w, h: eyes.h, map: eyes.map } : null;
      return { id, uv: meta.uv, lip: meta.lip, layer, eyes: eyeFiles, tint: meta.tint };
    })();
    files.catch(() => lookFiles.delete(id));
    lookFiles.set(id, files);
  }
  return files;
}

/* ------------------------------------------------------- her own products */

/** Her own products in colours (the screen's picks resolved, see customPicks in data/products.ts). */
export type ProductPicks = {
  shadow?: { hex: string; finish: string; style?: string; lookStyle: string };
  liner?: { hex: string };
  blush?: { hex: string; style: string };
  glow?: { hex: string };
  contour?: { hex: string };
  gain?: Partial<Record<StepKey, number>>;
};

/** How much deeper an eyeshadow gets where it's packed on, per placement (smoky most). */
const SHADOW_DEEP: Record<string, number> = { smoky: 0.6, crease: 0.4, cutcrease: 0.4, halo: 0.3, gradient: 0.3, wash: 0 };

const covFiles = new Map<string, Promise<ImageBitmap>>();
function loadCov(id: string): Promise<ImageBitmap> {
  let f = covFiles.get(id);
  if (!f) {
    f = cached(lookCov(id)).then((r) => r.blob()).then((b) => createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" }));
    f.catch(() => covFiles.delete(id));
    covFiles.set(id, f);
  }
  return f;
}

/**
 * Each look's recipe (its FaceLook in makeup-styles.ts): what its catalog photo can't carry as a change of colour, laid
 * over the look as products: its skin's finish, a highlighter's sheen, its eyeshadow's shimmer or glitter (in the
 * eyeshadow's own colour) and its liner's colour. As recipe() in products.py.
 */
const SKIN_FINISH: Record<string, number> = { matte: -0.6, sheer: 0, dewy: 0.7, glow: 0.5, bronzed: 0.3 };
/** The highlighter for a glowing, bronzed or dewy skin, and its sheen; a shimmer look's on a matte or sheer skin. */
const RECIPE_GLOW: Record<string, [string, number]> = { glow: ["#f3dcb8", 1.6], bronzed: ["#e8c27a", 1.4], dewy: ["#f4ece6", 1.0] };
const SHIMMER_GLOW: [string, number] = ["#f3dcb8", 1.0];
/** The look's eyeshadow finish: how much it catches the light. */
const RECIPE_SHEEN: Record<string, number> = { shimmer: 1.5, metallic: 0.55, glitter: 1.6 };
/** A gold shade (its shimmer is a soft foil): an orange to yellow hue (20-55 degrees), saturated (over 0.5). */
function metalTone(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d === 0 || d / mx <= 0.5) return false;
  const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return h >= 20 && h <= 55;
}

type Recipe = { finish: number; glow?: [string, number]; shadow?: { hex: string; finish: string; style: string }; liner?: string };
function lookRecipe(look: string): Recipe | null {
  const fl = styleById.get(look)?.look;
  if (!fl) return null;
  const acc = new Set(fl.accents ?? []);
  const out: Recipe = { finish: SKIN_FINISH[fl.skin] ?? 0 };
  out.glow = RECIPE_GLOW[fl.skin] ?? (acc.has("shimmer") ? SHIMMER_GLOW : undefined);
  let fin = acc.has("glitter") || acc.has("rhinestones") ? "glitter" : acc.has("shimmer") ? "shimmer" : null;
  if (fin === "shimmer" && metalTone(fl.lid[0])) fin = "metallic";
  if (fin && fl.shadow !== "none") out.shadow = { hex: fl.lid[0], finish: fin, style: fl.shadow };
  if (fl.linerColor) out.liner = fl.linerColor;
  return out;
}

/** The catalog look whose coverage map places an eyeshadow: a style's template, or the look's own when it has one. */
function shadowSource(look: string, style: string | undefined, lookStyle: string, all: LooksMeta) {
  const { shadowMin = 0.3, shadowFrom = {} } = all.products ?? {};
  const own = lookStyle !== "none" && (all.looks[look]?.cov?.shadow ?? 0) >= shadowMin;
  const s = style ?? (lookStyle === "none" ? "wash" : lookStyle);
  return { style: s, src: style ? shadowFrom[s] ?? look : own ? look : shadowFrom[s] ?? shadowFrom.wash ?? look };
}

/**
 * The look's recipe and her picks in the engine's terms: pigments, her light, the eyeshadow's placement map (placement()
 * in products.py). Her picks replace the recipe's products of the same kind.
 */
async function resolveProducts(look: string, picks: ProductPicks | null | undefined, face: FaceStats, all: LooksMeta): Promise<Products | undefined> {
  const rec = lookRecipe(look);
  const has = picks && (picks.shadow || picks.liner || picks.blush || picks.glow || picks.contour);
  const gains = Object.values(picks?.gain ?? {}).some((g) => g !== undefined && g !== 1);
  if (!rec && !has && !gains) return undefined;
  const out: Products = { white: productLight(face, all.swatch), gain: picks?.gain, finish: rec?.finish };
  if (picks?.shadow) {
    const { style, src } = shadowSource(look, picks.shadow.style, picks.shadow.lookStyle, all);
    const [image, files] = await Promise.all([loadCov(src), loadLook(src)]);
    out.shadow = { ...pigment("shadow", picks.shadow.hex, picks.shadow.finish, SHADOW_DEEP[style] ?? 0), cov: { id: src, image, uv: files.uv } };
  } else if (rec?.shadow) {      // the look's own eyeshadow, with its finish
    const { src } = shadowSource(look, undefined, rec.shadow.style, all);
    const [image, files] = await Promise.all([loadCov(src), loadLook(src)]);
    const pig = pigment("shadow", rec.shadow.hex, rec.shadow.finish);
    out.shadow = { ...pig, sheen: pig.sheen * (RECIPE_SHEEN[rec.shadow.finish] ?? 1), own: true, over: true, cov: { id: src, image, uv: files.uv } };
  }
  if (picks?.blush) out.blush = { ...pigment("blush", picks.blush.hex), style: picks.blush.style };
  if (picks?.contour) out.contour = pigment("contour", picks.contour.hex);
  if (picks?.glow) out.glow = pigment("glow", picks.glow.hex, "glow");
  else if (rec?.glow) {
    const pig = pigment("glow", rec.glow[0], "glow");
    out.glow = { ...pig, sheen: pig.sheen * rec.glow[1], over: true };
  }
  if (picks?.liner) out.liner = linerColour(picks.liner.hex);
  else if (rec?.liner) out.liner = linerColour(rec.liner);
  return out;
}

/* ------------------------------------------------- her own makeup (my-makeup) */

/**
 * Her own makeup in the engine's terms (my-makeup.ts resolves her recipe to this): each step's amount (0 or missing:
 * not used), its shape, and the products' colours and finishes.
 */
export type MinePicks = {
  gain: Partial<Record<StepKey, number>>;
  base?: Mine["base"];
  conceal?: Mine["conceal"];
  /** Contour: her own skin's reflectance times this (deeper, cool / neutral / warm, or a bronzer). */
  contour?: MineZone & { tint: number[] };
  blush?: MineZone & { hex: string; finish: string };
  glow?: MineZone & { hex: string; finish: string };
  brows?: MineZone & { hex: string; thick: number };
  /**
   * Eyeshadow in a placement (a catalog look's coverage map, see shadowFrom); a second shade for her crease and outer
   * corner (hex2), and a light for her inner corners.
   */
  shadow?: { hex: string; finish: string; place: string; pack: number; hex2?: string; finish2?: string; inner?: string };
  liner?: NonNullable<Mine["liner"]> & { hex: string };
  /** natural, volume or dramatic: the lashes of a catalog look (LASHES_FROM). */
  lashes?: { place: string };
  lips?: { hex: string; finish: Finish };
  /** Coloured lenses: their colour, covering her iris (opaque) or tinting it. */
  lenses?: { hex: string; opaque: boolean };
};

/**
 * Lashes for her own makeup: catalog looks whose eye detail is lashes and at most a thin line at their roots (no wing),
 * their eye detail kept only around her eyes (mineZones in makeup-gl.ts).
 */
export const LASHES_FROM: Record<string, string> = { natural: "no-makeup", volume: "monochrome", dramatic: "bronzed-goddess" };

/** Her recipe in the engine's terms: products (no catalog layer), the look that lends its lashes, her lipstick. */
export type MineReady = { products: Products; look: string; lip: LipChoice | null };
/**
 * Her eyeshadow's optical thickness where its powder lies (a catalog look's own shadow, swapped, is a sheerer film: 0.6);
 * how much of her skin the powder covers comes from her coverage (pigments() in makeup-gl.ts).
 */
const MINE_SHADOW_THICK = 6;
/** How much of her eyeshadow's placement under her eye is taken away. */
const MINE_SHADOW_LOW: Record<string, number> = { smoky: 0.45, halo: 0.5 };

/** Her recipe resolved for the engine (the live mirror keeps this and refreshes her light each frame). */
export async function resolveMine(picks: MinePicks, face: FaceStats): Promise<MineReady> {
  return mineProducts(picks, face, await meta());
}

async function mineProducts(picks: MinePicks, face: FaceStats, all: LooksMeta): Promise<MineReady> {
  const gain = Object.fromEntries(STEP_KEYS.map((k) => [k, Math.max(0, picks.gain[k] ?? 0)])) as Record<StepKey, number>;
  const mine: Mine = {};
  const out: Products = { white: mineLight(face, all.swatch), gain, mine };
  const zone = (z: MineZone): MineZone => ({ place: z.place, soft: z.soft, size: z.size });
  if (picks.base) mine.base = picks.base;
  if (picks.conceal) mine.conceal = picks.conceal;
  if (picks.contour) { out.contour = { ...pigment("contour", "#000000"), color: picks.contour.tint }; mine.contour = zone(picks.contour); }
  if (picks.blush) {
    out.blush = { ...pigment("blush", picks.blush.hex, picks.blush.finish), style: picks.blush.place };
    mine.blush = zone(picks.blush);
  }
  if (picks.glow) {        // a highlighter's shimmer is a fine pearl over her skin, never a sheet of metal
    const glow = pigment("glow", picks.glow.hex, picks.glow.finish === "glow" ? "glow" : picks.glow.finish === "glitter" ? "glitter" : "shimmer");
    out.glow = picks.glow.finish === "glow" ? glow : { ...glow, sheen: 0.35 };
    mine.glow = zone(picks.glow);
  }
  if (picks.brows) { out.brows = { ...pigment("brows", picks.brows.hex), thick: picks.brows.thick }; mine.brows = zone(picks.brows); }
  if (picks.shadow) {
    const { shadowFrom = {} } = all.products ?? {};
    const src = shadowFrom[picks.shadow.place] ?? shadowFrom.wash ?? null;
    const cov = src ? await Promise.all([loadCov(src), loadLook(src)]).then(([image, files]) => ({ id: src, image, uv: files.uv })) : undefined;
    // (her shimmer a sheen over the colour, not a coat of foil: a whole lid of it reads as metal)
    const deep = SHADOW_DEEP[picks.shadow.place] ?? 0, sheen = (finish: string) => (finish === "metallic" ? 0.8 : 0.6);
    // (and laid as thick as a pressed shadow packed on: at full coverage its own colour shows, not a grey veil of powder)
    out.shadow = { ...pigment("shadow", picks.shadow.hex, picks.shadow.finish, deep), thick: MINE_SHADOW_THICK, sheen: sheen(picks.shadow.finish), cov };
    if (picks.shadow.hex2) {
      const finish = picks.shadow.finish2 ?? picks.shadow.finish;
      out.shadow2 = { ...pigment("shadow", picks.shadow.hex2, finish, Math.max(deep, 0.3)), thick: MINE_SHADOW_THICK, sheen: sheen(finish) };
    }
    if (picks.shadow.inner) out.inner = { ...pigment("glow", picks.shadow.inner, "shimmer"), thick: 0.13, sheen: 0.6 };
    // (under her eye: smoky and halo wrap her lower lash line, the others barely touch it)
    mine.shadow = { pack: picks.shadow.pack, low: MINE_SHADOW_LOW[picks.shadow.place] ?? 0.8 };
  }
  if (picks.liner) {
    out.liner = linerColour(picks.liner.hex);
    mine.liner = { place: picks.liner.place, lower: picks.liner.lower, soft: picks.liner.soft, opacity: picks.liner.opacity };
  }
  const look = LASHES_FROM[picks.lashes?.place ?? "natural"] ?? LASHES_FROM.natural;
  if (picks.lenses) out.lenses = { color: linHex(picks.lenses.hex), opaque: picks.lenses.opaque };
  return { products: out, look, lip: picks.lips ? { shade: picks.lips.hex, finish: picks.lips.finish } : null };
}

/**
 * Paint her own makeup (no catalog look) on a photo with the graphics-chip engine; `steps` shows only part of it (the
 * tutorial). The result is the engine's own canvas (draw it before the next frame).
 */
export function paintMine(shot: Shot, picks: MinePicks, steps?: StepState): Promise<HTMLCanvasElement> {
  return myTurn(() => paintMineNow(shot, picks, steps));
}

async function paintMineNow(shot: Shot, picks: MinePicks, steps?: StepState): Promise<HTMLCanvasElement> {
  const r = gpu();
  if (!r) throw "failed" satisfies TryOnError;
  shot.face ??= measureFace(shot.photo, shot.points);
  if (shot.face.blur == null) shot.face.blur = photoBlur(shot.photo, shot.points);
  if (shot.vis === undefined) shot.vis = await visibility(shot.photo, shot.points);
  if (shot.lips === undefined) shot.lips = lipProb(shot.photo, shot.points);
  const all = await meta();
  const { products, look, lip } = await mineProducts(picks, shot.face, all);
  const files = await loadLook(look);
  r.render(shot.photo, shot.photo.width, shot.photo.height, shot.points, files, shot.face, "natural", all.tris,
    lipChoice(files.lip, lip, all.swatch), all.canon, steps, products, shot.vis, shot.lips);
  return r.canvas;
}

/** Her own makeup at full resolution, on a canvas of its own (to save or share). */
export async function paintMineFull(shot: Shot, picks: MinePicks): Promise<HTMLCanvasElement> {
  const out = canvas(shot.photo.width, shot.photo.height);
  ctx2d(out).drawImage(await paintMine(shot, picks), 0, 0);
  return out;
}

/** Her picks resolved for a look (the live mirror keeps this and refreshes its light each frame). */
export async function productsFor(look: string, picks: ProductPicks | null | undefined, face: FaceStats): Promise<Products | undefined> {
  return resolveProducts(look, picks, face, await meta());
}

/**
 * Paint a look with the graphics-chip engine onto `source` (w x h) with her landmarks.
 * `face` are her light references (measureFace); measured here when not given. `lip` is her
 * lipstick pick (null: the look's own); `vis` where her face can be seen (see visibility()). The result
 * is on the engine's canvas.
 */
export function paintGpu(source: HTMLCanvasElement, points: Pt[], look: string, level: Level, face?: FaceStats, lip?: LipChoice | null,
  steps?: StepState, picks?: ProductPicks | null, vis?: Visibility | null, lips?: LipGrid | null): Promise<HTMLCanvasElement> {
  return myTurn(() => paintGpuNow(source, points, look, level, face, lip, steps, picks, vis, lips));
}

/**
 * The graphics chip's canvas is shared: the look rail's pictures (paintThumb) are made only while nothing else is
 * painting, and a painting waits for the rail's picture being made. (Whoever asked for a painting draws the engine's
 * canvas right after it, before the rail's next timer can start one.)
 */
let thumbRun: Promise<unknown> | null = null;
let painting = 0;

async function myTurn<T>(work: () => Promise<T>): Promise<T> {
  painting++;
  try {
    while (thumbRun) await thumbRun.catch(() => undefined);
    return await work();
  } finally {
    painting--;
  }
}

async function paintGpuNow(source: HTMLCanvasElement, points: Pt[], look: string, level: Level, face?: FaceStats, lip?: LipChoice | null,
  steps?: StepState, picks?: ProductPicks | null, vis?: Visibility | null, lips?: LipGrid | null): Promise<HTMLCanvasElement> {
  const r = gpu();
  if (!r) throw "failed" satisfies TryOnError;
  const stats = face ?? measureFace(source, points);
  if (stats.blur == null) stats.blur = photoBlur(source, points);
  const [files, all] = await Promise.all([loadLook(look), meta()]);
  const products = await resolveProducts(look, picks, stats, all);
  r.render(source, source.width, source.height, points, files, stats, level, all.tris, lipChoice(files.lip, lip, all.swatch), all.canon, steps, products, vis, lips);
  return r.canvas;
}

/** The step-by-step tutorial's own copy of a photo: at most `side` pixels, so each animation frame is quick. */
export function tutorialShot(shot: Shot, side = 1100): Shot {
  const k = Math.min(1, side / Math.max(shot.photo.width, shot.photo.height));
  if (k === 1) return shot;
  const photo = canvas(shot.photo.width * k, shot.photo.height * k);
  const g = ctx2d(photo);
  g.imageSmoothingQuality = "high";
  g.drawImage(shot.photo, 0, 0, photo.width, photo.height);
  const sx = photo.width / shot.photo.width, sy = photo.height / shot.photo.height;
  const points = shot.points.map(([x, y, z]) => [x * sx, y * sy, z * sx] as Pt);
  const vis = shot.vis ? { probs: shot.vis.probs, box: [shot.vis.box[0] * sx, shot.vis.box[1] * sy, shot.vis.box[2] * sx] as [number, number, number] } : shot.vis;
  // (her eye whites as the shot had them: a studio shot keeps her own, studioFace)
  const face = measureFace(photo, points);
  return { photo, points, align: shot.align, input: shot.input, face: shot.face?.sclera ? { ...face, sclera: shot.face.sclera } : face, vis, lips: lipProb(photo, points) };
}

/** Her face for the look rail: THUMB_BOX of her face's width around it, from above her brows to below her chin. */
const THUMB_BOX = { side: 1.3, up: 0.12, down: 0.06 };

/** A small copy of her photo around her face, `side` pixels wide (the look rail's pictures of her in each look). */
export function faceShot(shot: Shot, side = 240): Shot {
  const pts = shot.points.slice(0, 468), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), h = y1 - y0;
  const top = y0 - h * THUMB_BOX.up, bottom = y1 + h * THUMB_BOX.down, cx = (x0 + x1) / 2;
  const width = Math.max((x1 - x0) * THUMB_BOX.side, (bottom - top) / 1.2);
  const bx = Math.max(0, cx - width / 2), by = Math.max(0, top);
  const bw = Math.min(shot.photo.width - bx, width), bh = Math.min(shot.photo.height - by, bottom - top);
  const k = side / bw;
  const photo = canvas(side, bh * k);
  const g = ctx2d(photo);
  g.imageSmoothingQuality = "high";
  g.drawImage(shot.photo, bx, by, bw, bh, 0, 0, photo.width, photo.height);
  const points = shot.points.map(([x, y, z]) => [(x - bx) * k, (y - by) * k, z * k] as Pt);
  const vis = shot.vis ? { probs: shot.vis.probs, box: [(shot.vis.box[0] - bx) * k, (shot.vis.box[1] - by) * k, shot.vis.box[2] * k] as [number, number, number] } : shot.vis;
  // (her eye whites as the shot had them: a studio shot keeps her own, studioFace)
  const face = measureFace(photo, points);
  return { photo, points, align: shot.align, input: shot.input, face: shot.face?.sclera ? { ...face, sclera: shot.face.sclera } : face, vis, lips: lipProb(photo, points) };
}

/**
 * `look` on a small shot (faceShot), as she would get it, for the look rail (graphics-chip engine only): a canvas of
 * its own, or null when the phone is painting something else (ask again later). The look's files are let go
 * afterwards unless `keep` (only a few looks stay in memory).
 */
export async function paintThumb(shot: Shot, look: string, level: Level, keep = false): Promise<HTMLCanvasElement | null> {
  if (painting > 0 || thumbRun) return null;
  const run = (async () => {
    shot.face ??= measureFace(shot.photo, shot.points);
    const made = await paintGpuNow(shot.photo, shot.points, look, level, shot.face, null, undefined, null, shot.vis, shot.lips);
    const out = canvas(made.width, made.height);
    ctx2d(out).drawImage(made, 0, 0);
    return out;
  })();
  thumbRun = run;
  try {
    return await run;
  } finally {
    thumbRun = null;
    if (!keep) releaseLook(look);
  }
}

/**
 * Let a look's files go: read again from the phone's cache when needed. (Not closed here: a painting may still hold
 * them; the browser frees them once nothing does.)
 */
export function releaseLook(id: string) {
  lookFiles.delete(id);
  covFiles.delete(id);
}

/**
 * One frame of the guided tutorial: the look with only some steps on her face (and the step being
 * applied, part way). The result is the engine's own canvas (draw it before the next frame).
 */
export async function paintSteps(shot: Shot, look: string, level: Level, lip: LipChoice | null, steps: StepState, picks?: ProductPicks | null): Promise<HTMLCanvasElement> {
  shot.face ??= measureFace(shot.photo, shot.points);
  if (shot.vis === undefined) shot.vis = await visibility(shot.photo, shot.points);
  if (shot.lips === undefined) shot.lips = lipProb(shot.photo, shot.points);
  return paintGpu(shot.photo, shot.points, look, level, shot.face, lip, steps, picks, shot.vis, shot.lips);
}

/** Run a look's network on an aligned face (RGB 0..255, 3x256x256). Returns the made-up face. */
export async function runLook(look: string, input: Float32Array): Promise<Float32Array> {
  const data = input.slice();
  const reply = await ask({ type: "run", look, data }, [data.buffer]);
  if (!reply.ok || !reply.out) {
    console.error("makeup model failed", reply.error);
    throw (reply.error === "model missing" ? "no-model" : "failed") satisfies TryOnError;
  }
  return reply.out;
}

export function toPoints(face: { x: number; y: number; z: number }[], width: number, height: number): Pt[] {
  return face.map((p) => [p.x * width, p.y * height, p.z * width] as Pt);
}

/* --------------------------------------------------------------- helpers */

export function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = c.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas");
  return context;
}

/**
 * FFHQ alignment (NVIDIA's recipe for the FFHQ dataset) from MediaPipe points: a square
 * around the face set by the eye centres and mouth corners, rotated with the eyes.
 * Returns the canvas transform from photo pixels to the 256x256 aligned face.
 */
export function alignment(p: Pt[]): Affine {
  const mean = (ids: number[]) => ids.reduce<[number, number]>((acc, i) => [acc[0] + p[i][0] / ids.length, acc[1] + p[i][1] / ids.length], [0, 0]);
  const el = mean(EYE_R), er = mean(EYE_L);                 // eye on the image's left / right
  const eye: [number, number] = [(el[0] + er[0]) / 2, (el[1] + er[1]) / 2];
  const e2e = [er[0] - el[0], er[1] - el[1]];
  const e2m = [(p[61][0] + p[291][0]) / 2 - eye[0], (p[61][1] + p[291][1]) / 2 - eye[1]];
  let x = [e2e[0] + e2m[1], e2e[1] - e2m[0]];
  const len = Math.hypot(x[0], x[1]) || 1;
  const s = Math.max(Math.hypot(e2e[0], e2e[1]) * 2, Math.hypot(e2m[0], e2m[1]) * 1.8);
  x = [(x[0] / len) * s, (x[1] / len) * s];
  const y = [-x[1], x[0]];
  const c = [eye[0] + e2m[0] * 0.1, eye[1] + e2m[1] * 0.1];
  const q0 = [c[0] - x[0] - y[0], c[1] - x[1] - y[1]];
  const u = [2 * x[0], 2 * x[1]], v = [2 * y[0], 2 * y[1]];   // aligned x and y axes in the photo
  const det = u[0] * v[1] - v[0] * u[1];
  const a = (SIZE * v[1]) / det, cc = (-SIZE * v[0]) / det, b = (-SIZE * u[1]) / det, d = (SIZE * u[0]) / det;
  return [a, b, cc, d, -(a * q0[0] + cc * q0[1]), -(b * q0[0] + d * q0[1])];
}

/** The 256x256 aligned face as network input (RGB 0..255, channels first). */
export function alignedInput(source: CanvasImageSource, width: number, height: number, m: Affine, scratch?: HTMLCanvasElement): Float32Array {
  const c = scratch ?? canvas(SIZE, SIZE);
  const g = ctx2d(c);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // Outside the photo: a neutral fill rather than black (training crops were padded with the photo itself).
  g.fillStyle = "#8a7468";
  g.fillRect(0, 0, SIZE, SIZE);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.setTransform(...m);
  g.drawImage(source, 0, 0, width, height);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const rgba = g.getImageData(0, 0, SIZE, SIZE).data;
  const n = SIZE * SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { out[i] = rgba[i * 4]; out[n + i] = rgba[i * 4 + 1]; out[2 * n + i] = rgba[i * 4 + 2]; }
  return out;
}

/** The network's change to the aligned face (made-up minus input), channels first. */
export function changeOf(input: Float32Array, out: Float32Array): Float32Array {
  const delta = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) delta[i] = out[i] - input[i];
  return delta;
}

/**
 * Add a change (in the aligned 256 frame) to `img`, an ImageData covering photo pixels
 * from (ox, oy), placed with alignment `m`. Fades out near the aligned square's edge.
 * Because the change lives in face-aligned coordinates, a change computed on one camera
 * frame can be placed on the next frames with their own alignment.
 */
export function addDelta(img: ImageData, ox: number, oy: number, m: Affine, delta: Float32Array, amount = 1) {
  const n = SIZE * SIZE;
  const [a, b, c, d, e, f] = m;
  const { width, height, data } = img;
  const fade = SIZE * 0.05;
  for (let y = 0; y < height; y++) {
    const py = oy + y + 0.5;
    for (let x = 0; x < width; x++) {
      const px = ox + x + 0.5;
      const sx = a * px + c * py + e - 0.5, sy = b * px + d * py + f - 0.5;
      if (sx < 0 || sy < 0 || sx > SIZE - 1 || sy > SIZE - 1) continue;
      const w = Math.min(1, Math.min(sx, sy, SIZE - 1 - sx, SIZE - 1 - sy) / fade) * amount;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(SIZE - 1, x0 + 1), y1 = Math.min(SIZE - 1, y0 + 1);
      const tx = sx - x0, ty = sy - y0;
      const i00 = y0 * SIZE + x0, i01 = y0 * SIZE + x1, i10 = y1 * SIZE + x0, i11 = y1 * SIZE + x1;
      const o = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const k = ch * n;
        const v = (delta[k + i00] * (1 - tx) + delta[k + i01] * tx) * (1 - ty) + (delta[k + i10] * (1 - tx) + delta[k + i11] * tx) * ty;
        data[o + ch] = data[o + ch] + v * w;
      }
    }
  }
}

/** Photo-pixel box covered by the aligned square (clamped to the photo). */
export function alignedBox(m: Affine, width: number, height: number) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  const inv = (X: number, Y: number) => [(d * (X - e) - c * (Y - f)) / det, (-b * (X - e) + a * (Y - f)) / det];
  const corners = [inv(0, 0), inv(SIZE, 0), inv(0, SIZE), inv(SIZE, SIZE)];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])))), x1 = Math.min(width, Math.ceil(Math.max(...corners.map((p) => p[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])))), y1 = Math.min(height, Math.ceil(Math.max(...corners.map((p) => p[1]))));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/* ------------------------------------------------------------ prepare */

/**
 * Decode (honouring EXIF orientation), downscale, find the face and align it. A soft or small
 * photo is also sharpened (`onStep("sharp", 0..1)` reports it); without the graphics chip, or if
 * sharpening fails or would take too long on this phone, only the photo as taken is returned.
 */
export async function preparePhoto(file: Blob, onStep?: (step: "sharp" | "hd", done: number) => void): Promise<Prepared> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const photo = canvas(bitmap.width * scale, bitmap.height * scale);
  const c = ctx2d(photo);
  c.imageSmoothingQuality = "high";
  c.drawImage(bitmap, 0, 0, photo.width, photo.height);
  bitmap.close();

  const landmarker = await loadFaceModel("IMAGE");
  const plain = shotOf(photo, await detectFace(landmarker, photo));
  if (!plain) throw "no-face" satisfies TryOnError;
  const blur = photoBlur(photo, plain.points);
  const prepared: Prepared = { plain, sharp: null, blur, sharpMs: 0, studio: null };
  const retouch = () => relight(prepared);
  const plan = sharpPlan(photo.width, photo.height, blur, eyeWidth(plain.points));
  if (!plan || engine() !== "gpu") {
    await faceHd(prepared, onStep);
    return retouch();
  }
  onStep?.("sharp", 0);
  const started = performance.now();
  try {
    const big = await sharpen(photo, plan, blur, (done) => onStep?.("sharp", done));
    if (big) {
      const points = plain.points.map(([x, y, z]) => [x * big.width / photo.width, y * big.height / photo.height, z * big.width / photo.width] as Pt);
      prepared.sharp = shotOf(big, await detectFace(landmarker, big)) ?? { photo: big, points, align: alignment(points), input: alignedInput(big, big.width, big.height, alignment(points)) };
      prepared.sharpMs = Math.round(performance.now() - started);
    }
  } catch (error) {
    prepared.skipped = error === "slow" ? "slow" : "failed";
    if (error !== "slow") console.warn("photo sharpening failed", error);
  }
  await faceHd(prepared, onStep);
  return retouch();
}

/** A phone that would take longer than this (ms) for the HD face goes on without it. */
const hdBudget = () => (globalThis as { hbHdBudgetMs?: number }).hbHdBudgetMs ?? 30_000;
let lastHdMs = 6_000;

/**
 * Her face redrawn in HD (face-hd.ts) on the sharpened photo (or a copy of the photo as taken), when her face is soft or
 * small and the phone has its files and WebGPU; `onStep("hd", 0..1)` reports it (an estimate: the network can't).
 */
async function faceHd(prepared: Prepared, onStep?: (step: "sharp" | "hd", done: number) => void) {
  if (engine() !== "gpu") return;
  const backend = await hdBackend();
  const plain = prepared.plain;
  if (!backend || !hdNeeded(plain.points, prepared.blur)) return;
  const cache = await caches.open(AI_CACHE).catch(() => null);
  for (const url of HD_FILES) if (!(await cache?.match(url))) return;
  onStep?.("hd", 0);
  const started = performance.now();
  const timer = setInterval(() => onStep?.("hd", Math.min(0.95, 1 - Math.exp(-2.2 * (performance.now() - started) / lastHdMs))), 250);
  let late: ReturnType<typeof setTimeout> | undefined;
  hdRunning(true);
  try {
    const run = (async () => {
      const join = async (urls: string[]) => joinParts(await Promise.all(urls.map((url) => cached(url).then((r) => r.arrayBuffer()))));
      const s = await hdSession(() => join(HD_PARTS), { mjs: new URL(ORT_GPU_GLUE, location.href).href, wasm: () => join(ORT_GPU_WASM) }, backend);
      if (plain.vis === undefined) plain.vis = await visibility(plain.photo, plain.points);
      const target = prepared.sharp ?? plain;
      const photo = await hdFace(s, plain.photo, plain.points, target.photo, target.points, plain.vis ?? null);
      return withPoints({ ...target, photo }, target.points, target.lips === null);
    })();
    const slow = new Promise<never>((_, reject) => { late = setTimeout(() => reject("slow"), hdBudget()); });
    prepared.sharp = await Promise.race([run, slow]);
    prepared.hdMs = Math.round(performance.now() - started);
    lastHdMs = Math.max(1_000, prepared.hdMs);
    onStep?.("hd", 1);
  } catch (error) {
    prepared.hdSkipped = error === "slow" ? "slow" : "failed";
    if (error !== "slow") console.warn("HD face failed", error);
  } finally {
    hdRunning(false);
    clearInterval(timer);
    clearTimeout(late);
  }
}

/** How much grey is added around a photo before looking for the face (a share of its longer side). */
const FACE_PAD = 0.3;
/** A face too small to be found in the whole picture is looked for in overlapping squares of these sizes (share of the longer side). */
const FACE_TILES = [0.5, 0.3];

/** The face model's confidence for a face (detection and presence; MediaPipe's default 0.5), and when nothing is found. */
const FACE_SURE = 0.5, FACE_UNSURE = 0.25;

/**
 * Her face's points on a photo. The face model finds faces best when they fill a fair part of the picture: a
 * close-up selfie (forehead or chin cut off) is looked at with a grey margin around it, then as it is; a small face
 * (a full-length photo, a group) is looked for in overlapping squares of the picture, the largest face found wins.
 * Where it finds none (a heavily retouched or stylised face, odd light), it looks once more, less strictly, with
 * margins of three sizes. The points are moved back onto the photo.
 */
async function detectFace(landmarker: FaceLandmarker, photo: HTMLCanvasElement): Promise<Pt[] | undefined> {
  const sure = findFace(landmarker, photo, [FACE_PAD, 0]);
  if (sure) return sure;
  await landmarker.setOptions({ minFaceDetectionConfidence: FACE_UNSURE, minFacePresenceConfidence: FACE_UNSURE });
  try {
    return findFace(landmarker, photo, [FACE_PAD, 0, FACE_PAD * 2]);
  } finally {
    await landmarker.setOptions({ minFaceDetectionConfidence: FACE_SURE, minFacePresenceConfidence: FACE_SURE });
  }
}

function findFace(landmarker: FaceLandmarker, photo: HTMLCanvasElement, pads: number[]): Pt[] | undefined {
  const W = photo.width, H = photo.height, long = Math.max(W, H);
  const look = (x: number, y: number, w: number, h: number, pad: number): Pt[] | undefined => {
    const c = canvas(w + pad * 2, h + pad * 2);
    const g = ctx2d(c);
    g.fillStyle = "#808080"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(photo, x, y, w, h, pad, pad, w, h);
    const face = landmarker.detect(c).faceLandmarks[0];
    return face?.map((q) => [q.x * c.width - pad + x, q.y * c.height - pad + y, q.z * c.width] as Pt);
  };
  for (const pad of pads) {
    const whole = look(0, 0, W, H, Math.round(long * pad));
    if (whole) return whole;
  }
  let best: Pt[] | undefined, bestSize = 0;
  for (const share of FACE_TILES) {
    const side = Math.min(Math.round(long * share), W, H);
    const xs = steps(W, side), ys = steps(H, side);
    for (const y of ys) for (const x of xs) {
      const face = look(x, y, side, side, Math.round(side * 0.1));
      if (!face) continue;
      const size = Math.hypot(face[33][0] - face[263][0], face[33][1] - face[263][1]);
      if (size > bestSize) { best = face; bestSize = size; }
    }
    if (best) return best;
  }
  return undefined;
}

/** Starts of overlapping windows of this size across a length (half a window apart, the last flush with the end). */
function steps(length: number, side: number) {
  const out: number[] = [];
  for (let x = 0; x + side < length; x += Math.round(side / 2)) out.push(x);
  out.push(Math.max(0, length - side));
  return out;
}

/**
 * The same photo with her own points (her outline edits): where her face can be seen is kept (it doesn't depend
 * on them); her light is measured again, and her lip line too unless she drew it herself (then it is used as drawn).
 */
export function withPoints(shot: Shot, points: Pt[], ownLips: boolean): Shot {
  const align = alignment(points);
  return { photo: shot.photo, points, align, input: alignedInput(shot.photo, shot.photo.width, shot.photo.height, align), vis: shot.vis,
    ...(ownLips ? { lips: null } : {}) };
}

let studioGl: Studio | null | undefined;

/** The studio retouch on the graphics chip (null where the phone can't run it). */
export function studio(): Studio | null {
  if (studioGl === undefined) studioGl = engine() === "gpu" ? Studio.create() : null;
  return studioGl;
}

/** Her photo, and the sharpened one, retouched in studio light again (after her points moved). */
export function relight(prep: Prepared): Prepared {
  const plain = studioShot(prep.plain);
  prep.studio = plain ? { plain, sharp: prep.sharp ? studioShot(prep.sharp, true) : null } : null;
  return prep;
}

/**
 * Her light references in the studio shot: measured on it, but her eye whites as in her own photo, in the studio's light
 * on her skin. The retouch brightens and clears her eye whites; that is not more light on her face (every lipstick
 * would turn paler).
 */
function studioFace(shot: Shot, photo: HTMLCanvasElement): FaceStats {
  const plain = shot.face ?? measureFace(shot.photo, shot.points), lit = measureFace(photo, shot.points);
  if (!plain.sclera || !plain.skin || !lit.skin) return lit;
  const k = lit.skin / plain.skin;
  return { ...lit, sclera: plain.sclera.map((v) => v * k) };
}

/** Her photo retouched in studio light (studio-gl.ts): the same points; null where the phone can't. `crisp`: already sharpened. */
export function studioShot(shot: Shot, crisp = false): Shot | null {
  const s = studio();
  if (!s) return null;
  try {
    const out = s.apply(shot.photo, shot.points, { ...studioParams(shot.photo, shot.points), ...(crisp ? { sharpK: STUDIO_CRISP } : {}) });
    const photo = canvas(out.width, out.height);
    ctx2d(photo).drawImage(out, 0, 0);
    return { photo, points: shot.points, align: shot.align, input: shot.input, face: studioFace(shot, photo), ...(shot.lips === null ? { lips: null } : {}) };
  } catch (error) {
    console.warn("studio retouch failed", error);
    return null;
  }
}

function shotOf(photo: HTMLCanvasElement, points: Pt[] | undefined): Shot | null {
  if (!points) return null;
  const align = alignment(points);
  return { photo, points, align, input: alignedInput(photo, photo.width, photo.height, align) };
}

/* ------------------------------------------------------------ sharpening */

/** Largest small picture the sharpening network runs on (pixels): a few seconds on a phone. */
const SHARP_PIXELS = 160_000;
/** How soft (blur, px) the shrunk photo the network sharpens may stay. */
const SHARP_TARGET = 1.15;
/** Fine grain (8-bit levels) added to a sharpened photo: its skin otherwise looks like plastic. */
const SHARP_GRAIN = 1.6;
/**
 * How much of the network's sharpening is kept, by the photo's blur (photoBlur: SHARP_MIX[0] at SHARP_MIX_BLUR[0] or
 * less, SHARP_MIX[1] at SHARP_MIX_BLUR[1] or more): the rest is the photo enlarged smoothly. On a small but sharp photo
 * the network alone paints hair and skin like oil; mixed, its edges stay crisp and the photo stays a photo. A blurred
 * photo keeps more of it: there it brings back what the blur took.
 */
const SHARP_MIX = [0.55, 0.85], SHARP_MIX_BLUR = [0.8, 1.8];
/** Longest the sharpening may take; slower phones use the photo as it is (tests may raise it). */
const sharpBudget = () => (globalThis as { hbSharpBudgetMs?: number }).hbSharpBudgetMs ?? 15_000;

/**
 * How soft the photo is around her eye: the sigma (pixels) of the Gaussian blur that explains how
 * little a further small blur (sigma 1.5) changes its edges. A crisp phone photo is ~0.5-1.
 */
export function photoBlur(photo: HTMLCanvasElement, P: Pt[]): number {
  const ew = eyeWidth(P);
  let cx = 0, cy = 0;
  for (const i of EYE_R) { cx += P[i][0] / EYE_R.length; cy += P[i][1] / EYE_R.length; }
  const x0 = Math.max(0, Math.floor(cx - ew * 0.7)), y0 = Math.max(0, Math.floor(cy - ew * 0.5));
  const x1 = Math.min(photo.width, Math.floor(cx + ew * 0.7)), y1 = Math.min(photo.height, Math.floor(cy + ew * 0.4));
  const w = x1 - x0, h = y1 - y0;
  if (w < 10 || h < 10) return 1;
  const px = ctx2d(photo).getImageData(x0, y0, w, h).data;
  const grey = new Float32Array(w * h);
  for (let i = 0; i < grey.length; i++) grey[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  const energy = (g: Float32Array) => {
    let sum = 0;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const v = g[y * w + x], dx = g[y * w + x + 1] - v, dy = g[(y + 1) * w + x] - v;
      sum += dx * dx + dy * dy;
    }
    return sum / ((w - 1) * (h - 1));
  };
  const r = Math.sqrt(energy(blur(grey, w, h, 1.5)) / Math.max(energy(grey), 1e-12));
  return Math.min(4, Math.max(0.4, (1.5 * r) / Math.sqrt(Math.max(1 - r * r, 1e-3))));
}

/**
 * Whether to sharpen, and at what size: the photo is shrunk until it is crisp (blur ~0.85 px),
 * at most SHARP_PIXELS, and the network draws it 4x larger. Skipped for crisp photos, and when
 * the size limit would throw away detail the photo really has.
 */
export function sharpPlan(w: number, h: number, blur: number, eye: number): { w: number; h: number } | null {
  const soft = blur > 1.3, small = eye < 60;
  if (!soft && !small) return null;
  // shrunk only until slightly soft (blur ~1.15 px): the network then sharpens what is there rather than inventing it
  const ideal = Math.min(1, SHARP_TARGET / blur), cap = Math.sqrt(SHARP_PIXELS / (w * h));
  const k = Math.min(ideal, cap);
  if (k < ideal * 0.6) return null;
  return { w: Math.max(16, Math.round(w * k)), h: Math.max(16, Math.round(h * k)) };
}

let sharpener: Promise<Enhancer | null> | null = null;

/** The sharpening network on the graphics chip (null if this phone can't run it). */
function enhancer(): Promise<Enhancer | null> {
  sharpener ??= cached(ENHANCE).then((r) => r.arrayBuffer()).then((buffer) => Enhancer.create(buffer));
  sharpener.then((e) => { if (!e) sharpener = null; }, () => { sharpener = null; });
  return sharpener;
}

/** The photo shrunk to `plan`, sharpened 4x and fitted to MAX_SIDE; null when it can't run here. */
async function sharpen(photo: HTMLCanvasElement, plan: { w: number; h: number }, blur: number, onProgress?: (done: number) => void): Promise<HTMLCanvasElement | null> {
  const e = await enhancer();
  if (!e) return null;
  const small = canvas(plan.w, plan.h);
  const g = ctx2d(small);
  g.imageSmoothingQuality = "high";
  g.drawImage(photo, 0, 0, plan.w, plan.h);
  let big: HTMLCanvasElement;
  try {
    big = await e.run(small, plan.w, plan.h, onProgress, sharpBudget());
  } catch (error) {
    if (error !== "slow") { sharpener = null; e.dispose(); }
    throw error;
  }
  const fit = Math.min(1, MAX_SIDE / Math.max(big.width, big.height));
  const out = canvas(big.width * fit, big.height * fit);
  const o = ctx2d(out);
  o.imageSmoothingQuality = "high";
  o.drawImage(big, 0, 0, out.width, out.height);
  const t = Math.min(1, Math.max(0, (blur - SHARP_MIX_BLUR[0]) / (SHARP_MIX_BLUR[1] - SHARP_MIX_BLUR[0])));
  o.globalAlpha = 1 - (SHARP_MIX[0] + (SHARP_MIX[1] - SHARP_MIX[0]) * t);
  o.drawImage(photo, 0, 0, out.width, out.height);
  o.globalAlpha = 1;
  addGrain(out, SHARP_GRAIN);
  return out;
}

/** Fine, even luminance grain (a fixed pattern, so the same photo always looks the same). */
function addGrain(c: HTMLCanvasElement, amount: number) {
  const g = ctx2d(c), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    const n = ((h >>> 0) / 4294967296 + ((Math.imul(h, 2654435761) >>> 0) / 4294967296) - 1) * amount * 1.7;   // ~triangular, sd ~amount
    const i = (y * c.width + x) * 4;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/* ------------------------------------------------------- eye detail */

/**
 * Crisp liner, wing and lash detail of each catalog look, pre-computed from the full-size
 * catalog photo: relative darkening around the eyes (255 = black), the MediaPipe points it
 * sits on and the face-mesh triangles that cover it, so it can be warped onto her eyes.
 */
type EyeMeta = { w: number; h: number; ids: number[]; pts: number[]; tris: number[] };
export type EyeDetail = EyeMeta & { map: Uint8Array };
let eyeMeta: Promise<Record<string, EyeMeta>> | null = null;
const eyeDetails = new Map<string, Promise<EyeDetail>>();

export function loadEyes(id: string): Promise<EyeDetail> {
  let detail = eyeDetails.get(id);
  if (!detail) {
    detail = (async () => {
      eyeMeta ??= cached(EYES_META).then((r) => r.json());
      eyeMeta.catch(() => { eyeMeta = null; });
      const [all, bitmap] = await Promise.all([
        eyeMeta,
        cached(lookEyes(id)).then((r) => r.blob()).then((b) => createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" })),
      ]);
      const meta = all[id];
      if (!meta) throw "no-model" satisfies TryOnError;
      const c = canvas(meta.w, meta.h);
      const g = ctx2d(c);
      g.drawImage(bitmap, 0, 0);
      bitmap.close();
      const rgba = g.getImageData(0, 0, meta.w, meta.h).data;
      const map = new Uint8Array(meta.w * meta.h);
      for (let i = 0; i < map.length; i++) map[i] = rgba[i * 4];
      return { ...meta, map };
    })();
    detail.catch(() => eyeDetails.delete(id));
    eyeDetails.set(id, detail);
  }
  return detail;
}

/**
 * Piecewise-affine warp of the look's eye detail onto her landmarks, nearer triangles drawn
 * last (depth from MediaPipe). Returns darkening 0..1 for the box (x0, y0, width, height).
 */
export function warpEyes(detail: EyeDetail, points: Pt[], x0: number, y0: number, width: number, height: number): Float32Array {
  const { map, w: mw, h: mh, ids, pts, tris } = detail;
  const out = new Float32Array(width * height);
  const order: number[] = [];
  for (let t = 0; t < tris.length; t += 3) order.push(t);
  const depth = (t: number) => points[ids[tris[t]]][2] + points[ids[tris[t + 1]]][2] + points[ids[tris[t + 2]]][2];
  order.sort((p, q) => depth(q) - depth(p));                  // far first
  for (const t of order) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const ax = points[ids[a]][0] - x0, ay = points[ids[a]][1] - y0;
    const bx = points[ids[b]][0] - x0, by = points[ids[b]][1] - y0;
    const cx = points[ids[c]][0] - x0, cy = points[ids[c]][1] - y0;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-6) continue;
    const sax = pts[a * 2], say = pts[a * 2 + 1], sbx = pts[b * 2], sby = pts[b * 2 + 1], scx = pts[c * 2], scy = pts[c * 2 + 1];
    const left = Math.max(0, Math.floor(Math.min(ax, bx, cx))), right = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const top = Math.max(0, Math.floor(Math.min(ay, by, cy))), bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
        const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        const sx = l1 * sax + l2 * sbx + l3 * scx, sy = l1 * say + l2 * sby + l3 * scy;
        const fx = Math.floor(sx), fy = Math.floor(sy), tx = sx - fx, ty = sy - fy;
        const at = (u: number, v: number) => (u < 0 || v < 0 || u >= mw || v >= mh ? 0 : map[v * mw + u]);
        out[y * width + x] = ((at(fx, fy) * (1 - tx) + at(fx + 1, fy) * tx) * (1 - ty) + (at(fx, fy + 1) * (1 - tx) + at(fx + 1, fy + 1) * tx) * ty) / 255;
      }
    }
  }
  return out;
}

/** Separable Gaussian blur of a width x height float image (edges clamped). */
function blur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += kernel[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[row + Math.min(width - 1, Math.max(0, x + k))] * kernel[k + r];
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[Math.min(height - 1, Math.max(0, y + k)) * width + x] * kernel[k + r];
      out[y * width + x] = acc;
    }
  }
  return out;
}

/**
 * Darken `result` with the look's liner and lashes, minus what her own lashes (in `photo`)
 * already give, so the eye makeup is as sharp as in the catalog photo.
 */
function applyEyes(result: HTMLCanvasElement, photo: HTMLCanvasElement, P: Pt[], detail: EyeDetail, strength: number) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const id of detail.ids) {
    left = Math.min(left, P[id][0]); right = Math.max(right, P[id][0]);
    top = Math.min(top, P[id][1]); bottom = Math.max(bottom, P[id][1]);
  }
  const x0 = Math.max(0, Math.floor(left) - 2), y0 = Math.max(0, Math.floor(top) - 2);
  const x1 = Math.min(result.width, Math.ceil(right) + 3), y1 = Math.min(result.height, Math.ceil(bottom) + 3);
  const width = x1 - x0, height = y1 - y0;
  if (width < 4 || height < 4) return;
  const dark = warpEyes(detail, P, x0, y0, width, height);

  const eye = (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;
  const own = ctx2d(photo).getImageData(x0, y0, width, height).data;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * own[i * 4] + 0.587 * own[i * 4 + 1] + 0.114 * own[i * 4 + 2];
  const fine = blur(lum, width, height, Math.max(0.8, eye * 0.028));
  const local = blur(lum, width, height, Math.max(1.2, eye * 0.042));

  const o = ctx2d(result);
  const img = o.getImageData(x0, y0, width, height);
  const d = img.data;
  for (let i = 0; i < dark.length; i++) {
    if (dark[i] <= 0) continue;
    const ownDark = Math.min(0, lum[i] - fine[i]) / Math.max(local[i], 20);
    const add = Math.min(0, -dark[i] - ownDark * 0.6);
    const f = Math.min(1, Math.max(0.15, 1 + strength * add));
    if (f >= 1) continue;
    d[i * 4] *= f; d[i * 4 + 1] *= f; d[i * 4 + 2] *= f;
  }
  o.putImageData(img, x0, y0);
}

/* ---------------------------------------------------------------- run */

/** How strongly the tiny-network fallback is shown at each intensity (it has one strength). */
const TINY_AMOUNT: Record<Level, number> = { soft: 0.6, natural: 1, bold: 1 };

/**
 * Paint `look` onto a prepared photo at an intensity, with her lipstick pick (graphics-chip engine
 * only). Returns the full-resolution result canvas.
 */
export async function paintLook(prepared: Shot, look: string, level: Level = "natural", lip: LipChoice | null = null,
  picks: ProductPicks | null = null): Promise<HTMLCanvasElement> {
  const { photo, align, points } = prepared;
  const result = canvas(photo.width, photo.height);
  const g = ctx2d(result);
  if (prepared.vis === undefined) prepared.vis = await visibility(photo, points);
  if (engine() === "gpu") {
    prepared.face ??= measureFace(photo, points);
    if (prepared.lips === undefined) prepared.lips = lipProb(photo, points);
    g.drawImage(await paintGpu(photo, points, look, level, prepared.face, lip, undefined, picks, prepared.vis, prepared.lips), 0, 0);
    return result;
  }
  // Eye detail is an extra layer: if its file is missing the look still paints.
  const eyes = loadEyes(look).catch(() => null);
  const out = await runLook(look, prepared.input);
  g.drawImage(photo, 0, 0);
  const box = alignedBox(align, photo.width, photo.height);
  if (box.w > 0 && box.h > 0) {
    const img = g.getImageData(box.x, box.y, box.w, box.h);
    addDelta(img, box.x, box.y, align, changeOf(prepared.input, out), TINY_AMOUNT[level]);
    g.putImageData(img, box.x, box.y);
  }
  const detail = await eyes;
  if (detail) applyEyes(result, photo, points, detail, EYE_DETAIL * TINY_AMOUNT[level]);
  if (prepared.vis) keepVisible(result, photo, points, prepared.vis);
  return result;
}

/**
 * The fallback engine's result only where her face can be seen (the coarse map of occlusion.py, without
 * the guided refinement): her own photo over hair, hands and glasses.
 */
function keepVisible(result: HTMLCanvasElement, photo: HTMLCanvasElement, P: Pt[], vis: Visibility) {
  const n = VIS_SEG, [bx, by, side] = vis.box, k = n / side;
  // her face oval on the crop, softened: body skin inside it is a hand over her face
  const oval = canvas(n, n), og = ctx2d(oval);
  og.filter = `blur(${(eyeWidth(P) * k * 0.12).toFixed(2)}px)`;
  og.fillStyle = "#fff";
  og.beginPath();
  OVAL_IDS.forEach((i, j) => (j ? og.lineTo : og.moveTo).call(og, (P[i][0] - bx) * k, (P[i][1] - by) * k));
  og.closePath(); og.fill();
  const inside = og.getImageData(0, 0, n, n).data;
  const v = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const p = (vis.probs[i * 2] + vis.probs[i * 2 + 1] * (1 - inside[i * 4] / 255)) / 255;
    v[i] = Math.min(1, Math.max(0, (p - 0.1) / 0.7));
  }
  const x0 = Math.max(0, Math.floor(bx)), y0 = Math.max(0, Math.floor(by));
  const x1 = Math.min(photo.width, Math.ceil(bx + side)), y1 = Math.min(photo.height, Math.ceil(by + side));
  if (x1 <= x0 || y1 <= y0) return;
  const out = ctx2d(result).getImageData(x0, y0, x1 - x0, y1 - y0), own = ctx2d(photo).getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const d = out.data;
  for (let y = y0; y < y1; y++) {
    const gy = Math.min(n - 1, Math.max(0, (y + 0.5 - by) * k - 0.5)), fy = Math.floor(gy), ty = gy - fy, fy1 = Math.min(n - 1, fy + 1);
    for (let x = x0; x < x1; x++) {
      const gx = Math.min(n - 1, Math.max(0, (x + 0.5 - bx) * k - 0.5)), fx = Math.floor(gx), tx = gx - fx, fx1 = Math.min(n - 1, fx + 1);
      const a = (v[fy * n + fx] * (1 - tx) + v[fy * n + fx1] * tx) * (1 - ty) + (v[fy1 * n + fx] * (1 - tx) + v[fy1 * n + fx1] * tx) * ty;
      if (a >= 0.999) continue;
      const o = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = own[o + c] + (d[o + c] - own[o + c]) * a;
    }
  }
  ctx2d(result).putImageData(out, x0, y0);
}

/** Her face's outline (MediaPipe face-oval points, as OVAL in teacher.py). */
const OVAL_IDS = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

export function errorText(error: unknown): string {
  switch (error) {
    case "no-face": return "چهره‌ای پیدا نشد. یک عکس روبه‌رو، واضح و با نور کافی انتخاب کنید.";
    case "no-model": return "فایل‌های هوش مصنوعی کامل دانلود نشده‌اند. یک بار با اینترنت دوباره امتحان کنید.";
    case "no-camera": return "دوربین در دسترس نیست. اجازه دسترسی به دوربین را بدهید یا از عکس استفاده کنید.";
    default: return "ساخت تصویر انجام نشد. دوباره امتحان کنید.";
  }
}
