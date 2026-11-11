/*
 * HD face, on the phone: a soft or small face redrawn in HD before the makeup.
 *
 * GFPGAN v1.4 (Tencent ARC, Apache-2.0) restores a face aligned to FFHQ's five points at 512 x 512 (her iris centres,
 * nose tip and mouth corners from the face model). Its weights are stored as int8 (scripts/tinybeauty/face_hd.py
 * builds them; 85 MB in two parts) and it runs in ONNX Runtime Web on the graphics chip (WebGPU).
 *
 * A face network can change who she is (a nose, a jaw, the colour of her eyes). Only its fine detail is kept: eyes,
 * lashes, brows, lips, skin texture (finer than DETAIL pixels of the 512 face). Her face's shape, tones and colours stay
 * her photo's own (a detail transfer: her photo + the network's fine detail − her photo's fine detail), only on her face
 * where it can be seen (the segmenter's face; not a hand, hair or glasses in front of it), feathered into the rest.
 * scripts/tinybeauty/face_hd.py is the reference.
 */
import type { InferenceSession } from "onnxruntime-web";
import { VIS_SEG, type Visibility } from "./makeup-gl";

type Pt = [number, number, number];
type Ort = typeof import("onnxruntime-web");

/** The network's face size; FFHQ's five points there (eye centres, nose tip, mouth corners), as GFPGAN aligns faces. */
const SIZE = 512;
const TEMPLATE = [[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935], [201.26117, 371.41043], [313.08905, 371.15118]];
/** The detail kept: finer than this Gaussian sigma (pixels of the 512 face); coarser stays hers. */
const DETAIL = 4;
/** The restored square's inset and feather (pixels of the 512 face); her outline grown this share, feathered (eye widths). */
const EDGE = [40, 20], OVAL_GROW = 0.12, FEATHER = 0.15;
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
/**
 * Her face is redrawn when its detail is under the network's (iris centres TEMPLATE's 126 px apart) by this share: the
 * detail it can hold is her irises' distance over the photo's softness (blur sigma, crisp ~0.7 px). A crisp, large face
 * is left as it is. A face in profile (her nose tip this far off her eyes' middle along them, in iris distances) is left
 * as it is.
 */
const NEED = 1.25, CRISP = 0.7, TURNED = 0.6;

export type Backend = "webgpu" | "wasm";
/** 2x3 affine (a, b, c, d, e, f): x' = a x + c y + e, y' = b x + d y + f (the canvas order). */
type Affine = [number, number, number, number, number, number];

/**
 * A phone whose page stopped while the HD face was running (out of memory: the browser reloads it) doesn't try it again
 * for a week: her next photo goes on without it instead of stopping again.
 */
const RUN_KEY = "hb-face-hd-run", OFF_KEY = "hb-face-hd-off", OFF_MS = 7 * 86_400_000;
const storage = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const stoppedBefore = (() => {
  try {
    const s = storage();
    if (!s) return false;
    if (s.getItem(RUN_KEY)) { s.removeItem(RUN_KEY); s.setItem(OFF_KEY, String(Date.now())); }
    const off = Number(s.getItem(OFF_KEY) || 0);
    return off > 0 && Date.now() - off < OFF_MS;
  } catch {
    return false;
  }
})();
/** Mark the HD face running / done (see RUN_KEY). */
export function hdRunning(on: boolean) {
  try { if (on) storage()?.setItem(RUN_KEY, String(Date.now())); else storage()?.removeItem(RUN_KEY); } catch { /* private mode */ }
}

let ort: Promise<Ort> | null = null;
let session: Promise<InferenceSession> | null = null;
let adapter: Promise<boolean> | null = null;

/**
 * How this phone runs it: on the graphics chip (WebGPU), or on four or more processor cores at once (WebAssembly
 * threads, where the app is cross-origin isolated); else not at all. A test can choose with hbFaceHd.
 */
export function hdBackend(): Promise<Backend | null> {
  const hook = (globalThis as { hbFaceHd?: "off" | "wasm" | "any" }).hbFaceHd;
  if (hook === "off") return Promise.resolve(null);
  if (hook === "wasm") return Promise.resolve("wasm");
  if (stoppedBefore) return Promise.resolve(null);
  adapter ??= (async () => {
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      return !!gpu && !!(await gpu.requestAdapter());
    } catch {
      return false;
    }
  })();
  // (hbFaceHd = "any": a page that would rather wait than go without it, e.g. a test page that can't be isolated)
  const cores = hook === "any" || (globalThis.crossOriginIsolated && (navigator.hardwareConcurrency || 0) >= 4);
  return adapter.then((ok) => (ok ? "webgpu" : cores ? "wasm" : null));
}

/** Her face needs redrawing (see NEED, TURNED): `blur` the photo's softness, P her points in it. */
export function hdNeeded(P: Pt[], blur: number): boolean {
  const iris = Math.hypot(P[468][0] - P[473][0], P[468][1] - P[473][1]);
  const mid = [(P[468][0] + P[473][0]) / 2, (P[468][1] + P[473][1]) / 2];
  const turned = Math.abs((P[1][0] - mid[0]) * (P[473][0] - P[468][0]) + (P[1][1] - mid[1]) * (P[473][1] - P[468][1])) / (iris * iris);
  const tmpl = Math.hypot(TEMPLATE[1][0] - TEMPLATE[0][0], TEMPLATE[1][1] - TEMPLATE[0][1]);
  return turned < TURNED && iris / Math.max(1, blur / CRISP) < tmpl * NEED;
}

/** Where ONNX Runtime's WebGPU build is: a folder, or its glue script's URL and its WebAssembly's bytes. */
export type HdRuntime = string | { mjs: string; wasm: () => Promise<Uint8Array> };

/** One buffer from parts. */
export function joinParts(parts: ArrayBuffer[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.byteLength, 0));
  let at = 0;
  for (const b of parts) { out.set(new Uint8Array(b), at); at += b.byteLength; }
  return out;
}

/** The network (its bytes, already downloaded), on the graphics chip (or the processor). */
export function hdSession(model: () => Promise<Uint8Array>, runtime: HdRuntime, backend: Backend): Promise<InferenceSession> {
  session ??= (async () => {
    ort ??= import("onnxruntime-web/webgpu-extern").then(async (m) => {
      const o = m as unknown as Ort;
      if (typeof runtime === "string") o.env.wasm.wasmPaths = runtime;
      else { o.env.wasm.wasmPaths = { mjs: runtime.mjs }; o.env.wasm.wasmBinary = await runtime.wasm(); }
      o.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      return o;
    });
    const o = await ort;
    return o.InferenceSession.create(await model(), { executionProviders: [backend], graphOptimizationLevel: "all" });
  })();
  session.catch(() => { session = null; });
  return session;
}

/** Her five points (iris centres, nose tip, mouth corners; left to right in the photo). */
function five(P: Pt[]): number[][] {
  const e = [P[468], P[473]].sort((a, b) => a[0] - b[0]), m = [P[61], P[291]].sort((a, b) => a[0] - b[0]);
  return [e[0], e[1], P[1], m[0], m[1]].map((q) => [q[0], q[1]]);
}

/** The rotation, scale and shift carrying `src` onto `dst` (least squares, Umeyama). */
function similarity(src: number[][], dst: number[][]): Affine {
  const n = src.length, ms = [0, 0], md = [0, 0];
  for (let i = 0; i < n; i++) { ms[0] += src[i][0] / n; ms[1] += src[i][1] / n; md[0] += dst[i][0] / n; md[1] += dst[i][1] / n; }
  let va = 0, c = 0, s = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - ms[0], ay = src[i][1] - ms[1], bx = dst[i][0] - md[0], by = dst[i][1] - md[1];
    va += ax * ax + ay * ay; c += ax * bx + ay * by; s += ax * by - ay * bx;
  }
  c /= va; s /= va;
  return [c, s, -s, c, md[0] - (c * ms[0] - s * ms[1]), md[1] - (s * ms[0] + c * ms[1])];
}

const invert = ([a, b, c, d, e, f]: Affine): Affine => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
const ctx = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;

/** Her face aligned at 512 (bilinear), the photo mirrored past its edges. */
function aligned(photo: HTMLCanvasElement, M: Affine): ImageData {
  const c = canvas(SIZE, SIZE), g = ctx(c), W = photo.width, H = photo.height;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "low";
  for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
    g.setTransform(...M);
    g.transform(i === 0 ? 1 : -1, 0, 0, j === 0 ? 1 : -1, i === 1 ? 2 * W : 0, j === 1 ? 2 * H : 0);
    g.drawImage(photo, 0, 0);
  }
  return g.getImageData(0, 0, SIZE, SIZE);
}

/** Box widths whose three passes approximate a Gaussian of this sigma (as the reference). */
function boxes(sigma: number): number[] {
  let w = Math.floor(Math.sqrt((12 * sigma * sigma) / 3 + 1));
  if (w % 2 === 0) w--;
  const m = Math.round((12 * sigma * sigma - 3 * w * w - 12 * w - 9) / (-4 * w - 4));
  return [0, 1, 2].map((i) => (i < m ? w : w + 2));
}

/** Three box blurs of a w x h plane (edges clamped), in place: about a Gaussian. */
function blur(x: Float32Array, w: number, h: number, sigma: number) {
  const tmp = new Float32Array(Math.max(w, h));
  for (const size of boxes(sigma)) {
    const r = size >> 1;
    for (const [n, m, stride, step] of [[w, h, 1, w], [h, w, w, 1]] as const) {
      for (let k = 0; k < m; k++) {
        const base = k * step;
        let sum = 0;
        for (let i = -r - 1; i < r; i++) sum += x[base + Math.min(n - 1, Math.max(0, i)) * stride];
        for (let i = 0; i < n; i++) {
          sum += x[base + Math.min(n - 1, i + r) * stride] - x[base + Math.min(n - 1, Math.max(0, i - r - 1)) * stride];
          tmp[i] = sum / size;
        }
        for (let i = 0; i < n; i++) x[base + i * stride] = tmp[i];
      }
    }
  }
}

/**
 * Her photo (`target`, with her points `P` in its pixels) with the network's fine detail on her face. `source` (her
 * photo as taken, points `Ps`) is what the network sees. `vis`: where her face can be seen (on `source`), or null.
 * Returns a new canvas, or null when her face doesn't need it.
 */
export async function hdFace(s: InferenceSession, source: HTMLCanvasElement, Ps: Pt[], target: HTMLCanvasElement, P: Pt[], vis: Visibility | null): Promise<HTMLCanvasElement> {
  const o = await ort!;
  // 1. the network, on her face aligned at 512
  const input = aligned(source, similarity(five(Ps), TEMPLATE)).data, x = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let k = 0; k < 3; k++) x[k * SIZE * SIZE + i] = input[i * 4 + k] / 127.5 - 1;
  const feeds = { [s.inputNames[0]]: new o.Tensor("float32", x, [1, 3, SIZE, SIZE]) };
  const result = await s.run(feeds, [s.outputNames[0]]);
  const y = result[s.outputNames[0]].data as Float32Array;
  const face = new ImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let k = 0; k < 3; k++) face.data[i * 4 + k] = Math.round((Math.max(-1, Math.min(1, y[k * SIZE * SIZE + i])) + 1) * 127.5);
    face.data[i * 4 + 3] = 255;
  }
  for (const t of Object.values(result)) t.dispose?.();
  // 2. back onto her photo, where the restored square lands
  const M = similarity(five(P), TEMPLATE), Mi = invert(M), scale = Math.sqrt(Math.abs(Mi[0] * Mi[3] - Mi[1] * Mi[2]));
  const corners = [[0, 0], [SIZE, 0], [0, SIZE], [SIZE, SIZE]].map(([u, v]) => [Mi[0] * u + Mi[2] * v + Mi[4], Mi[1] * u + Mi[3] * v + Mi[5]]);
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((q) => q[0])))), y0 = Math.max(0, Math.floor(Math.min(...corners.map((q) => q[1]))));
  const x1 = Math.min(target.width, Math.ceil(Math.max(...corners.map((q) => q[0])))), y1 = Math.min(target.height, Math.ceil(Math.max(...corners.map((q) => q[1]))));
  const out = canvas(target.width, target.height), go = ctx(out);
  go.drawImage(target, 0, 0);
  const w = x1 - x0, h = y1 - y0;
  if (w < 8 || h < 8) return out;
  const place = (img: HTMLCanvasElement, mirror: boolean) => {
    const c = canvas(w, h), g = ctx(c);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "low";
    for (const i of mirror ? [-1, 0, 1] : [0]) for (const j of mirror ? [-1, 0, 1] : [0]) {
      g.setTransform(Mi[0], Mi[1], Mi[2], Mi[3], Mi[4] - x0, Mi[5] - y0);
      g.transform(i === 0 ? 1 : -1, 0, 0, j === 0 ? 1 : -1, i === 1 ? 2 * SIZE : 0, j === 1 ? 2 * SIZE : 0);
      g.drawImage(img, 0, 0);
    }
    return g.getImageData(0, 0, w, h).data;
  };
  const fc = canvas(SIZE, SIZE);
  ctx(fc).putImageData(face, 0, 0);
  const back = place(fc, true);
  // the square's mask (inset, feathered) and her outline's (grown, feathered), and where her face can be seen
  const sq = new Float32Array(SIZE * SIZE);
  for (let v = EDGE[0]; v < SIZE - EDGE[0]; v++) for (let u = EDGE[0]; u < SIZE - EDGE[0]; u++) sq[v * SIZE + u] = 1;
  blur(sq, SIZE, SIZE, EDGE[1]);
  const sqImg = new ImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) { const a = Math.round(sq[i] * 255); sqImg.data[i * 4] = sqImg.data[i * 4 + 1] = sqImg.data[i * 4 + 2] = a; sqImg.data[i * 4 + 3] = 255; }
  const sc = canvas(SIZE, SIZE);
  ctx(sc).putImageData(sqImg, 0, 0);
  const sqBack = place(sc, false);
  const ew = (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;
  const oc = canvas(w, h), og = ctx(oc);
  const pts = OVAL.map((i) => [P[i][0] - x0, P[i][1] - y0]);
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  og.fillStyle = "#fff";
  og.beginPath();
  pts.forEach(([px, py], i) => { const qx = cx + (px - cx) * (1 + OVAL_GROW), qy = cy + (py - cy) * (1 + OVAL_GROW); if (i) og.lineTo(qx, qy); else og.moveTo(qx, qy); });
  og.closePath(); og.fill();
  const ovalPx = og.getImageData(0, 0, w, h).data, oval = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) oval[i] = ovalPx[i * 4] / 255;
  blur(oval, w, h, FEATHER * ew);
  // where her face can be seen: the segmenter's face on her photo as taken (its pixels scaled to this one's)
  const k = source.width / target.width, seen = (px: number, py: number) => {
    if (!vis) return 1;
    const [bx, by, side] = vis.box, n = VIS_SEG, gx = ((px + 0.5) * k - bx) / side * n - 0.5, gy = ((py + 0.5) * k - by) / side * n - 0.5;
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const at = (a: number, b: number) => (a < 0 || b < 0 || a >= n || b >= n ? 0 : vis.probs[(b * n + a) * 2] / 255);
    const p = at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
    return Math.min(1, Math.max(0, (p - 0.2) / 0.4));
  };
  // 3. her photo + the network's fine detail − her photo's fine detail
  const img = go.getImageData(x0, y0, w, h), f = img.data, sigma = DETAIL * scale;
  const planes = [0, 1, 2].map((c) => {
    const a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { a[i] = f[i * 4 + c]; b[i] = back[i * 4 + c]; }
    const la = a.slice(), lb = b.slice();
    blur(la, w, h, sigma); blur(lb, w, h, sigma);
    return { a, la, b, lb };
  });
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx, m = (sqBack[i * 4] / 255) * oval[i] * seen(xx + x0, yy + y0);
    if (m <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const p = planes[c], det = p.a[i] + (p.b[i] - p.lb[i]) - (p.a[i] - p.la[i]);
      f[i * 4 + c] = Math.max(0, Math.min(255, Math.round(p.a[i] + m * (det - p.a[i]))));
    }
  }
  go.putImageData(img, x0, y0);
  return out;
}
