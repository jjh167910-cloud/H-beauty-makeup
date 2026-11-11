/*
 * Her landmarks steadied from one camera frame to the next, for the live mirror. The tracker's points shimmer by a pixel
 * or two from frame to frame even on a still face, which makes a liner or a lip line crawl. Her face's motion is split
 * in two, as face-tracking pipelines do:
 * - the rigid part (her head turning, nodding, coming closer: a rotation, scale and shift of the whole face), fitted to
 *   all 478 points at once by least squares (Umeyama 1991): its noise averages out over the points, so it is taken as
 *   it is, with no smoothing and so no lag however fast she moves;
 * - what is left (a blink, a smile, the tracker's shimmer), per point, through the One Euro filter (Casiez, Roussel and
 *   Vogel, CHI 2012): a low-pass whose cut-off rises with speed, above a dead zone the size of the shimmer. Still, a
 *   point is smoothed hard; when her lid or lips really move, it follows at once.
 * Speeds are in eye widths per second, the same on a near or far face and at any frame size.
 */
/** A landmark: x, y in pixels, z (depth). */
export type Pt = [number, number, number];

/**
 * At rest: cut-off (Hz); per eye width per second of real movement: how much it rises; the speed's own smoothing (Hz);
 * the dead zone (eye widths per second: slower than this is the tracker's shimmer, not her).
 */
export const STEADY = { minCut: 0.5, beta: 30, dCut: 2.5, dead: 0.8 } as const;
/** A pause longer than this (s), or a jump of more than this many eye widths, starts afresh (no smoothing across it). */
const GAP_S = 0.4, JUMP_EW = 1.5;

const alpha = (cut: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));

/** The rotation, scale and shift that best carry points `a` onto `b` (2D, least squares). */
function similarity(a: Float32Array, b: Pt[]): { c: number; s: number; tx: number; ty: number } {
  const n = b.length;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let i = 0; i < n; i++) { ax += a[i * 3]; ay += a[i * 3 + 1]; bx += b[i][0]; by += b[i][1]; }
  ax /= n; ay /= n; bx /= n; by /= n;
  let sxx = 0, sxy = 0, va = 0;
  for (let i = 0; i < n; i++) {
    const px = a[i * 3] - ax, py = a[i * 3 + 1] - ay, qx = b[i][0] - bx, qy = b[i][1] - by;
    sxx += px * qx + py * qy; sxy += px * qy - py * qx; va += px * px + py * py;
  }
  const c = sxx / Math.max(va, 1e-9), s = sxy / Math.max(va, 1e-9);     // (scale × cos, scale × sin)
  return { c, s, tx: bx - (c * ax - s * ay), ty: by - (s * ax + c * ay) };
}

export class Steady {
  private prev: Float32Array | null = null;
  private speed: Float32Array | null = null;
  private at = 0;

  constructor(private k: { minCut: number; beta: number; dCut: number; dead: number } = STEADY) {}

  reset() { this.prev = null; this.speed = null; }

  /** This frame's points (x, y in pixels, z), steadied; `ew` her eye width in pixels, `now` in ms. */
  apply(points: Pt[], ew: number, now: number): Pt[] {
    const n = points.length, dt = (now - this.at) / 1000, unit = Math.max(1, ew);
    this.at = now;
    const prev = this.prev;
    let T = prev && prev.length === n * 3 ? similarity(prev, points) : null;
    if (T && prev) {           // (a jump: a new face, or a frame dropped mid-turn)
      let jx = 0, jy = 0;
      for (let i = 0; i < n; i++) { jx += points[i][0] - prev[i * 3]; jy += points[i][1] - prev[i * 3 + 1]; }
      if (Math.hypot(jx / n, jy / n) / unit > JUMP_EW) T = null;
    }
    if (!T || !prev || !(dt > 0) || dt > GAP_S) {
      this.prev = new Float32Array(n * 3);
      this.speed = new Float32Array(n);
      points.forEach((p, i) => { this.prev![i * 3] = p[0]; this.prev![i * 3 + 1] = p[1]; this.prev![i * 3 + 2] = p[2]; });
      return points;
    }
    const speed = this.speed!, ad = alpha(this.k.dCut, dt), scale = Math.hypot(T.c, T.s), out: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = points[i], j = i * 3;
      // where her last steadied point is carried by her head's motion; what the frame adds to that is hers or shimmer
      const qx = T.c * prev[j] - T.s * prev[j + 1] + T.tx, qy = T.s * prev[j] + T.c * prev[j + 1] + T.ty, qz = prev[j + 2] * scale;
      const dx = p[0] - qx, dy = p[1] - qy;
      const v = Math.hypot(dx, dy) / unit / dt;
      speed[i] += ad * (v - speed[i]);
      const a = alpha(this.k.minCut + this.k.beta * Math.max(0, Math.max(speed[i], v * 0.5) - this.k.dead), dt);
      const x = qx + a * dx, y = qy + a * dy, z = qz + a * (p[2] - qz);
      prev[j] = x; prev[j + 1] = y; prev[j + 2] = z;
      out[i] = [x, y, z];
    }
    return out;
  }
}
