/*
 * Her own outlines. The face model's points for her lips, eyes, brows and the edge of her face can be off on some
 * photos (a face in profile, lips the colour of her skin, a small face), so she can move them herself.
 *
 * Each part has a few handles (one face point, or the middle of a few). Moving handles bends the part smoothly:
 * a Gaussian radial-basis field through the handles' moves (exact at each handle), applied fully to the part's
 * own points and fading out over the face around it, so the mesh never folds; the other parts stay where they are.
 * Moves are kept as shares of the photo's width, so the same edit fits the photo as taken and the sharpened one.
 * The makeup is then painted with her points as usual.
 */
import type { LipGrid } from "./makeup-gl";
import { EYE_L, EYE_R, LIPS_IN, LIPS_OUT, eyeShown } from "./makeup-gl";
import type { Pt } from "./tryon";

export type Part = "lips" | "eyes" | "brows" | "face";
export const PARTS: Array<{ id: Part; name: string; hint: string }> = [
  { id: "lips", name: "لب‌ها", hint: "نقطه‌ها را روی لبهٔ لب‌ها بکشید." },
  { id: "eyes", name: "چشم‌ها", hint: "نقطه‌ها را روی لبهٔ پلک‌ها و گوشهٔ چشم‌ها بکشید." },
  { id: "brows", name: "ابروها", hint: "نقطه‌ها را روی سر، قوس و انتهای ابروها بکشید." },
  { id: "face", name: "دور صورت", hint: "نقطه‌ها را روی لبهٔ صورت، خط مو و فک بکشید." },
];
/** Her moves per part: for each handle, how far it moved (x, y) as a share of the photo's width (missing: not moved). */
export type Offsets = Partial<Record<Part, Array<[number, number] | null | undefined>>>;

/** Whether any handle of a part moved (entries may be missing: a handle she never touched). */
export function moved(list: Offsets[Part]): boolean {
  return !!list && list.some((m) => !!m && (m[0] !== 0 || m[1] !== 0));
}

/** Her moves with this handle at (dx, dy): a full list, every handle she didn't touch at (0, 0). */
export function withMove(list: Offsets[Part], k: number, dx: number, dy: number): Array<[number, number]> {
  const out = Array.from({ length: Math.max(list?.length ?? 0, k + 1) }, (_, i) => (list?.[i] ? [list[i]![0], list[i]![1]] : [0, 0]) as [number, number]);
  out[k] = [dx, dy];
  return out;
}

/* The face mesh's lip rings (MediaPipe's lipsUpper/Lower Outer, SemiOuter, SemiInner, Inner). */
const LIPS_SEMI = [76, 184, 74, 73, 72, 11, 302, 303, 304, 408, 306, 307, 320, 404, 315, 16, 85, 180, 90, 77,
  62, 183, 42, 41, 38, 12, 268, 271, 272, 407, 292, 325, 319, 403, 316, 15, 86, 179, 89, 96];
const LIPS_ALL = [...LIPS_OUT, ...LIPS_IN, ...LIPS_SEMI];
const BROW_R = { up: [70, 63, 105, 66, 107], low: [46, 53, 52, 65, 55] };   // brow on the image's left
const BROW_L = { up: [300, 293, 334, 296, 336], low: [276, 283, 282, 295, 285] };
const BROWS = [...BROW_R.up, ...BROW_R.low, ...BROW_L.up, ...BROW_L.low];
const IRISES = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
const EYES = [...EYE_R, ...EYE_L, ...IRISES];
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

type Def = {
  /** Handles: the face points each one stands for (it sits at their middle). */
  handles: number[][];
  /** Outlines drawn for her (closed loops of face points). */
  lines: number[][];
  /** The part's own points (moved fully), and points that never move with it. */
  points: number[]; fixed: number[];
  /** Field width and how far around the part the face follows (shares of the part's size). */
  sigma: number; around: number;
  size: (P: Pt[]) => number;
};
const dist = (P: Pt[], a: number, b: number) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
const eyeSize = (P: Pt[]) => (dist(P, 33, 133) + dist(P, 263, 362)) / 2;

const DEFS: Record<Part, Def> = {
  lips: {
    handles: [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91, 81, 13, 311, 178, 14, 402].map((i) => [i]),
    lines: [LIPS_OUT, LIPS_IN], points: LIPS_ALL, fixed: [...EYES, ...BROWS, ...OVAL],
    sigma: 0.32, around: 0.35, size: (P) => dist(P, 61, 291),
  },
  eyes: {
    handles: [33, 160, 158, 133, 153, 144, 263, 387, 385, 362, 380, 373].map((i) => [i]),
    lines: [EYE_R, EYE_L], points: EYES, fixed: [...BROWS, ...LIPS_ALL, ...OVAL],
    sigma: 0.45, around: 0.6, size: eyeSize,
  },
  brows: {
    handles: [[70, 46], [105, 52], [107, 55], [300, 276], [334, 282], [336, 285]],
    lines: [[...BROW_R.up, ...[...BROW_R.low].reverse()], [...BROW_L.up, ...[...BROW_L.low].reverse()]],
    points: BROWS, fixed: [...EYES, ...LIPS_ALL, ...OVAL],
    sigma: 0.45, around: 0.4, size: eyeSize,
  },
  face: {
    handles: OVAL.filter((_, k) => k % 3 === 0).map((i) => [i]),
    lines: [OVAL], points: OVAL, fixed: [...EYES, ...BROWS, ...LIPS_ALL],
    sigma: 0.22, around: 0.18, size: (P) => dist(P, 234, 454),
  },
};

/** Lip handles on the inner lip line are shown only when her mouth is open (they'd sit on the outer ones). */
const INNER = new Set([81, 13, 311, 178, 14, 402]);
function mouthOpen(P: Pt[]) { return dist(P, 13, 14) > 0.12 * dist(P, 61, 291); }

/** The handles she can move on this part: index into the part's handles, and where it sits on the points given. */
export function handlesOf(part: Part, P: Pt[]): Array<{ k: number; x: number; y: number }> {
  const open = part !== "lips" || mouthOpen(P);
  return DEFS[part].handles.flatMap((ids, k) => (!open && INNER.has(ids[0]) ? [] : [{ k, x: mean(P, ids, 0), y: mean(P, ids, 1) }]));
}

/** The part's outlines (closed loops) on the points given. */
export function linesOf(part: Part, P: Pt[]): Array<Array<[number, number]>> {
  return DEFS[part].lines.map((ids) => ids.map((i) => [P[i][0], P[i][1]] as [number, number]));
}

/** The square (x, y, side) to show for a part: around its points, with room to move them. */
export function viewOf(part: Part, P: Pt[]): [number, number, number] {
  const ids = part === "eyes" ? [...EYE_R, ...EYE_L] : DEFS[part].points;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of ids) { x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); y0 = Math.min(y0, P[i][1]); y1 = Math.max(y1, P[i][1]); }
  const pad = part === "face" ? 0.12 : part === "lips" ? 0.45 : part === "eyes" ? 0.2 : 0.25;
  const s = Math.max(x1 - x0, y1 - y0, 8) * (1 + pad * 2);
  return [(x0 + x1) / 2 - s / 2, (y0 + y1) / 2 - s / 2, s];
}

function mean(P: Pt[], ids: number[], c: 0 | 1) { return ids.reduce((s, i) => s + P[i][c], 0) / ids.length; }

/** Her points with her moves applied (`offsets` as shares of the photo's width `w`), from the face model's points. */
export function withOffsets(auto: Pt[], offsets: Offsets, w: number): Pt[] {
  const out = auto.map((p) => [p[0], p[1], p[2]] as Pt);
  for (const part of Object.keys(offsets) as Part[]) {
    const moves = offsets[part];
    if (!moved(moves)) continue;
    const def = DEFS[part], size = Math.max(def.size(auto), 1), sigma = def.sigma * size;
    const centres = def.handles.map((ids) => [mean(auto, ids, 0), mean(auto, ids, 1)]);
    const d = def.handles.map((_, k) => [(moves?.[k]?.[0] ?? 0) * w, (moves?.[k]?.[1] ?? 0) * w]);
    const [ax, ay] = rbf(centres, d, sigma);
    const share = shares(auto, part);
    for (let i = 0; i < auto.length; i++) {
      const m = share[i];
      if (m <= 0) continue;
      let ux = 0, uy = 0;
      centres.forEach(([cx, cy], k) => {
        const g = Math.exp(-((auto[i][0] - cx) ** 2 + (auto[i][1] - cy) ** 2) / (sigma * sigma));
        ux += g * ax[k]; uy += g * ay[k];
      });
      out[i][0] += m * ux; out[i][1] += m * uy;
    }
  }
  return out;
}

const shareCache = new WeakMap<Pt[], Partial<Record<Part, Float32Array>>>();
/** How much each face point moves with a part: its own points fully, the face around it less with distance, the others not. */
function shares(auto: Pt[], part: Part): Float32Array {
  const cached = shareCache.get(auto)?.[part];
  if (cached) return cached;
  const def = DEFS[part], size = Math.max(def.size(auto), 1), own = new Set(def.points), fixed = new Set(def.fixed);
  const out = new Float32Array(auto.length);
  for (let i = 0; i < auto.length; i++) {
    if (own.has(i)) { out[i] = 1; continue; }
    if (fixed.has(i)) continue;
    let best = Infinity;
    for (const j of def.points) best = Math.min(best, Math.hypot(auto[i][0] - auto[j][0], auto[i][1] - auto[j][1]));
    const t = Math.min(1, best / (def.around * size));
    out[i] = 1 - t * t * (3 - 2 * t);
  }
  shareCache.set(auto, { ...shareCache.get(auto), [part]: out });
  return out;
}

/** Weights of a Gaussian radial-basis field that moves each centre by its own move (solved, Gaussian elimination). */
function rbf(c: number[][], d: number[][], sigma: number): [number[], number[]] {
  const n = c.length;
  const K = c.map((a) => c.map((b) => Math.exp(-((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) / (sigma * sigma))));
  K.forEach((row, i) => { row[i] += 1e-6; });
  const solve = (rhs: number[]) => {
    const A = K.map((row, i) => [...row, rhs[i]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      const p = A[col][col] || 1e-12;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col] / p;
        if (f) for (let k = col; k <= n; k++) A[r][k] -= f * A[col][k];
      }
    }
    return A.map((row, i) => row[n] / (row[i] || 1e-12));
  };
  return [solve(d.map((v) => v[0])), solve(d.map((v) => v[1]))];
}

/** The parts she moved. */
export function editedParts(offsets: Offsets | null | undefined): Part[] {
  if (!offsets) return [];
  return (Object.keys(offsets) as Part[]).filter((part) => moved(offsets[part]));
}

/** How clearly her lips stand out from her skin (lipProb's colour model), below which her lip line is in doubt. */
const LIP_CLEAR = 0.8;
/** Eye width (px) below which the face is small in the photo. */
const SMALL_EYE = 20;

export type Doubt = { part: Part; reason: "profile" | "lips" | "small" };

/** Whether the face model's points may be off on this photo (and which part to look at first); null: they look fine. */
export function outlineDoubt(P: Pt[], lips: LipGrid | null | undefined): Doubt | null {
  if (Math.min(...eyeShown(P)) < 0.999) return { part: "eyes", reason: "profile" };
  if (lips === null || (lips && (lips.clarity ?? 1) < LIP_CLEAR)) return { part: "lips", reason: "lips" };
  if (eyeSize(P) < SMALL_EYE) return { part: "lips", reason: "small" };
  return null;
}
