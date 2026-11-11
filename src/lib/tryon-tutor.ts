/*
 * The step-by-step tutorial's player: the look goes onto her photo one step at a time, in a makeup
 * artist's order. Each step shows its zone and the tool moving the way it is used, while the engine
 * reveals that part of the real look along the tool's path (makeup-gl's step mode). Plain canvas
 * code. The app plays her own makeup with it (`mine`: her recipe instead of a look, her own shapes as the guides) in
 * «میکاپ من» (tryon-mine.tsx); it can still play a catalog look (paintSteps), which the engine tests use.
 */
import type { Step, Tool } from "@/data/makeup-steps";
import { mineZones } from "./makeup-gl";
import {
  STEP_KEYS, paintMine, paintSteps, stepGeometry, type Level, type LipChoice, type MinePicks, type ProductPicks, type Shot, type StepKey, type StepState,
} from "./tryon";

type V = [number, number];
type Geo = ReturnType<typeof stepGeometry>;

const FADE_IN = 450, SWEEP = 1700, FADE_OUT = 500;
/** How long a finished step stays on screen when the tutorial plays by itself. */
export const READ = 2600;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const unit = (a: V): V => { const n = Math.hypot(a[0], a[1]) || 1; return [a[0] / n, a[1] / n]; };

/** The point a fraction f along a polyline. */
function along(line: V[], f: number): V {
  const lens = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]));
  let left = f * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? clamp(left / lens[i]) : 0;
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * k, line[i][1] + (line[i + 1][1] - line[i][1]) * k];
    }
    left -= lens[i];
  }
  return line[0];
}

/** A closed, rounded path through a polygon's edge midpoints. */
function smooth(g: CanvasRenderingContext2D, poly: V[]) {
  const n = poly.length;
  if (n < 3) return;
  const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m = mid(poly[n - 1], poly[0]);
  g.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const q = mid(poly[i], poly[(i + 1) % n]);
    g.quadraticCurveTo(poly[i][0], poly[i][1], q[0], q[1]);
  }
  g.closePath();
}

/** The tool, tip at (0, 0), handle up; s = its scale (her eye width). */
function drawTool(g: CanvasRenderingContext2D, kind: Tool, s: number, color: string) {
  const rect = (x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) => {
    g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill();
  };
  const metal = (y: number, h: number, w: number) => {
    const m = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    m.addColorStop(0, "#9b8f86"); m.addColorStop(0.45, "#f4ece4"); m.addColorStop(1, "#8a7e76");
    rect(-w / 2, y, w, h, w * 0.12, m);
  };
  const handle = (y: number, len: number, w: number, fill = "#2a1a20") => {
    g.beginPath();
    g.moveTo(-w / 2, y); g.lineTo(w / 2, y); g.lineTo(w * 0.32, y - len); g.quadraticCurveTo(0, y - len - w * 0.4, -w * 0.32, y - len); g.closePath();
    const h = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    h.addColorStop(0, fill); h.addColorStop(0.4, "#5a4048"); h.addColorStop(1, fill);
    g.fillStyle = h; g.fill();
    rect(-w * 0.45, y - len * 0.08, w * 0.9, s * 0.025, 1, "#c9a45c");
  };
  switch (kind) {
    case "sponge": {
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(s * 0.2, -s * 0.12, s * 0.27, -s * 0.36, 0, -s * 0.56);
      g.bezierCurveTo(-s * 0.27, -s * 0.36, -s * 0.2, -s * 0.12, 0, 0);
      const f = g.createRadialGradient(-s * 0.06, -s * 0.36, s * 0.02, 0, -s * 0.3, s * 0.32);
      f.addColorStop(0, "#ffd3dc"); f.addColorStop(1, "#e7859e");
      g.fillStyle = f; g.fill();
      g.save(); g.clip();
      g.globalAlpha = 0.85; g.fillStyle = color; g.beginPath(); g.ellipse(0, -s * 0.02, s * 0.16, s * 0.1, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      return;
    }
    case "finger": {
      g.beginPath(); g.arc(0, 0, s * 0.13, 0, Math.PI * 2);
      g.fillStyle = "rgb(255 255 255 / .28)"; g.fill();
      g.lineWidth = Math.max(1.5, s * 0.02); g.strokeStyle = "rgb(255 255 255 / .9)"; g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.05, 0, Math.PI * 2); g.fillStyle = color; g.fill();
      return;
    }
    case "pencil": {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.025, -s * 0.07); g.lineTo(-s * 0.025, -s * 0.07); g.closePath(); g.fillStyle = color; g.fill();
      g.beginPath(); g.moveTo(-s * 0.025, -s * 0.07); g.lineTo(s * 0.025, -s * 0.07); g.lineTo(s * 0.05, -s * 0.26); g.lineTo(-s * 0.05, -s * 0.26); g.closePath();
      g.fillStyle = "#e9c7a0"; g.fill();
      rect(-s * 0.05, -s * 1.55, s * 0.1, s * 1.3, s * 0.02, color);
      rect(-s * 0.05, -s * 1.55, s * 0.035, s * 1.3, s * 0.02, "rgb(255 255 255 / .18)");
      return;
    }
    case "liner": {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.022, -s * 0.12); g.lineTo(-s * 0.022, -s * 0.12); g.closePath(); g.fillStyle = color; g.fill();
      metal(-s * 0.2, s * 0.08, s * 0.07);
      rect(-s * 0.055, -s * 1.45, s * 0.11, s * 1.25, s * 0.04, "#1d1418");
      rect(-s * 0.045, -s * 1.4, s * 0.025, s * 1.1, s * 0.02, "rgb(255 255 255 / .22)");
      rect(-s * 0.06, -s * 0.5, s * 0.12, s * 0.03, 1, "#c9a45c");
      return;
    }
    case "wand": {
      g.fillStyle = "#3b3035"; g.fillRect(-s * 0.018, -s * 0.7, s * 0.036, s * 0.42);
      g.beginPath(); g.ellipse(0, -s * 0.16, s * 0.065, s * 0.17, 0, 0, Math.PI * 2); g.fillStyle = "#151012"; g.fill();
      g.strokeStyle = "#3d3438"; g.lineWidth = Math.max(1, s * 0.012);
      for (let k = -6; k <= 6; k++) { const y = -s * 0.16 + (k * s * 0.025); g.beginPath(); g.moveTo(-s * 0.08, y); g.lineTo(s * 0.08, y - s * 0.012); g.stroke(); }
      rect(-s * 0.07, -s * 1.5, s * 0.14, s * 0.8, s * 0.05, "#2a1a20");
      rect(-s * 0.075, -s * 0.78, s * 0.15, s * 0.05, 2, "#c9a45c");
      return;
    }
    case "lipstick": {
      g.beginPath(); g.moveTo(-s * 0.1, s * 0.04); g.quadraticCurveTo(0, -s * 0.08, s * 0.1, -s * 0.1); g.lineTo(s * 0.1, -s * 0.4); g.lineTo(-s * 0.1, -s * 0.4); g.closePath();
      const c = g.createLinearGradient(-s * 0.1, 0, s * 0.1, 0);
      c.addColorStop(0, color); c.addColorStop(0.35, "rgb(255 255 255 / .35)"); c.addColorStop(0.5, color); c.addColorStop(1, color);
      g.fillStyle = color; g.fill(); g.fillStyle = c; g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1;
      metal(-s * 0.68, s * 0.28, s * 0.27);
      rect(-s * 0.15, -s * 1.25, s * 0.3, s * 0.58, s * 0.03, "#1d1418");
      return;
    }
    case "gloss": {
      g.beginPath(); g.ellipse(0, -s * 0.1, s * 0.045, s * 0.11, 0, 0, Math.PI * 2); g.fillStyle = color; g.fill();
      g.beginPath(); g.ellipse(-s * 0.015, -s * 0.12, s * 0.012, s * 0.05, 0, 0, Math.PI * 2); g.fillStyle = "rgb(255 255 255 / .7)"; g.fill();
      g.fillStyle = "rgb(230 225 225 / .85)"; g.fillRect(-s * 0.015, -s * 0.7, s * 0.03, s * 0.5);
      rect(-s * 0.09, -s * 1.35, s * 0.18, s * 0.67, s * 0.06, "#d8c3b5");
      return;
    }
    default: {
      // Brushes: bristles, metal ferrule and a lacquered handle.
      const b = g.createLinearGradient(0, 0, 0, -s * 0.42);
      b.addColorStop(0, color); b.addColorStop(0.45, color); b.addColorStop(1, "#f1e3d6");
      g.beginPath();
      if (kind === "fan") {
        g.moveTo(0, -s * 0.48); g.arc(0, -s * 0.48, s * 0.46, Math.PI * 0.3, Math.PI * 0.7); g.closePath();
      } else if (kind === "angled") {
        g.moveTo(-s * 0.07, -s * 0.02); g.lineTo(s * 0.07, -s * 0.13); g.lineTo(s * 0.07, -s * 0.42); g.lineTo(-s * 0.07, -s * 0.42); g.closePath();
      } else if (kind === "brush") {
        g.moveTo(-s * 0.15, -s * 0.42); g.lineTo(-s * 0.15, -s * 0.1); g.quadraticCurveTo(0, s * 0.04, s * 0.15, -s * 0.1); g.lineTo(s * 0.15, -s * 0.42); g.closePath();
      } else {
        g.ellipse(0, -s * 0.24, s * 0.15, s * 0.25, 0, 0, Math.PI * 2);
      }
      g.fillStyle = b; g.fill();
      const w = kind === "angled" ? s * 0.14 : kind === "fan" ? s * 0.1 : s * 0.2;
      metal(-s * 0.68, s * 0.24, w);
      handle(-s * 0.68, s * 0.85, w * 0.8);
    }
  }
}

/** Her skin tone in the photo: the average colour on both cheeks. */
export function skinTone(shot: Shot): string {
  const c = document.createElement("canvas");
  c.width = shot.photo.width; c.height = shot.photo.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(shot.photo, 0, 0);
  const sum = [0, 0, 0];
  let n = 0;
  for (const i of [50, 101, 118, 280, 330, 347]) {
    const [x, y] = shot.points[i];
    const d = g.getImageData(Math.round(x) - 3, Math.round(y) - 3, 7, 7).data;
    for (let k = 0; k < d.length; k += 4) { sum[0] += d[k]; sum[1] += d[k + 1]; sum[2] += d[k + 2]; n++; }
  }
  const hex = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, "0");
  return `#${hex(sum[0])}${hex(sum[1])}${hex(sum[2])}`;
}

/** Plays the tutorial on a canvas (outside React: one frame per screen refresh while a step goes on). */
export class Tutor {
  private g: CanvasRenderingContext2D;
  /** The engine's latest frame, and the photo before the current step (shown while she holds it). */
  private frame: HTMLCanvasElement;
  private prev: HTMLCanvasElement;
  private geo: Geo;
  private ew: number;
  private run = 0;
  private raf = 0;
  peek = false;
  private overlay: ((now: number) => void) | null = null;

  constructor(view: HTMLCanvasElement, private shot: Shot, private steps: Step[], private look: string, private level: Level,
    private lip: LipChoice | null, private blush: string, private colors: Record<StepKey, string>, private quick: boolean,
    private picks: ProductPicks | null = null, private mine: MinePicks | null = null) {
    view.width = shot.photo.width; view.height = shot.photo.height;
    this.g = view.getContext("2d")!;
    const make = () => { const c = document.createElement("canvas"); c.width = view.width; c.height = view.height; return c; };
    this.frame = make(); this.prev = make();
    this.geo = mine ? Tutor.mineGeo(shot, mine) : stepGeometry(shot.points, blush);
    const P = shot.points;
    this.ew = (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;
  }

  /** Her own makeup's guides: her steps' own shapes (none where she only painted), the brush moving as in a look's steps. */
  private static mineGeo(shot: Shot, mine: MinePicks): Geo {
    const geo = stepGeometry(shot.points, mine.blush?.place ?? "apples");
    const z = mineZones(shot.points, mine);
    const own: Array<[StepKey, (typeof z.A)[number]]> = [["conceal", z.A[0]], ["contour", z.A[1]], ["blush", z.A[2]], ["glow", z.A[3]], ["brows", z.B[2]]];
    for (const [k, g] of own) geo[k] = { ...geo[k], polys: g.polys, outline: g.outline ?? g.polys, paths: k === "brows" ? geo.brows.paths : undefined };
    return geo;
  }

  /** The engine's state with the first `count` steps on her face and maybe one being applied. */
  private state(count: number, active?: { key: StepKey; t: number }): StepState {
    const have = new Set(this.steps.map((s) => s.key));
    const done = Object.fromEntries(STEP_KEYS.map((k) => [k, 0])) as Record<StepKey, number>;
    this.steps.forEach((s, i) => { done[s.key] = i < count ? 1 : 0; });
    const follow = STEP_KEYS.filter((k) => !have.has(k));
    for (const k of follow) done[k] = done.base;
    return { done, active, blush: this.blush, follow };
  }

  private async paint(into: HTMLCanvasElement, state: StepState) {
    const out = this.mine ? await paintMine(this.shot, this.mine, state) : await paintSteps(this.shot, this.look, this.level, this.lip, state, this.picks);
    into.getContext("2d")!.drawImage(out, 0, 0, into.width, into.height);
  }

  private draw(now: number) {
    this.g.drawImage(this.peek ? this.prev : this.frame, 0, 0);
    if (!this.peek) this.overlay?.(now);
  }

  stop() { this.run++; cancelAnimationFrame(this.raf); this.overlay = null; }

  /** Redraw (after `peek` changed). */
  redraw() { this.draw(performance.now()); }

  /** Her products, lipstick and the tools' colours changed: the next frames use them (call show() to see them now). */
  update(lip: LipChoice | null, picks: ProductPicks | null, colors: Record<StepKey, string>, steps: Step[], mine?: MinePicks | null) {
    this.lip = lip; this.picks = picks; this.colors = colors; this.steps = steps;
    if (mine !== undefined) { this.mine = mine; if (mine) this.geo = Tutor.mineGeo(this.shot, mine); }
  }

  /**
   * Show her photo with the first `count` steps done (no animation); holding it shows the first
   * `before` steps (her bare photo by default).
   */
  async show(count: number, before = 0) {
    const run = ++this.run;
    cancelAnimationFrame(this.raf);
    this.overlay = null;
    await this.paint(this.prev, this.state(before));
    if (run !== this.run) return;
    await this.paint(this.frame, this.state(count));
    if (run !== this.run) return;
    this.draw(performance.now());
  }

  /** Apply step i: guide in, the tool sweeps while that part of the look appears, guide out. Resolves when done. */
  async play(i: number): Promise<boolean> {
    const run = ++this.run;
    cancelAnimationFrame(this.raf);
    const step = this.steps[i];
    await this.paint(this.prev, this.state(i));
    if (run !== this.run) return false;
    this.frame.getContext("2d")!.drawImage(this.prev, 0, 0);
    const fadeIn = this.quick ? 0 : FADE_IN, sweep = this.quick ? 500 : SWEEP, fadeOut = this.quick ? 0 : FADE_OUT;
    const geo = this.geo[step.key];
    const color = this.colors[step.key];
    let t = 0, busy = false, last = -1;
    const t0 = performance.now();
    this.overlay = (now) => this.guide(geo, step, color, now - t0, fadeIn, sweep, fadeOut);
    return new Promise<boolean>((resolve) => {
      const tick = (now: number) => {
        if (run !== this.run) return resolve(false);
        const e = now - t0;
        t = step.guideOnly ? 0 : ease(clamp((e - fadeIn) / sweep));
        if (!busy && t > 0 && t !== last) {
          busy = true;
          const want = t;
          this.paint(this.frame, t >= 1 ? this.state(i + 1) : this.state(i, { key: step.key, t: want }))
            .then(() => { last = want; busy = false; if (run === this.run) this.draw(performance.now()); })
            .catch(() => { busy = false; });
        }
        this.draw(now);
        const over = e >= fadeIn + sweep + fadeOut && (step.guideOnly || last >= 1);
        if (over) { this.overlay = null; this.draw(now); return resolve(true); }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  /** The zone outline (marching dashes) and the tool moving along its path. */
  private guide(geo: Geo[StepKey], step: Step, color: string, e: number, fadeIn: number, sweep: number, fadeOut: number) {
    const g = this.g, ew = this.ew;
    const alpha = e < fadeIn ? e / fadeIn : e < fadeIn + sweep ? 1 : 1 - (e - fadeIn - sweep) / Math.max(1, fadeOut);
    if (alpha <= 0) return;
    const p = ease(clamp((e - fadeIn) / sweep));
    const f = clamp(p * 1.3 - 0.15);                    // where the reveal's edge is (see sweepT in makeup-gl)
    g.save();
    g.globalAlpha = clamp(alpha);
    g.lineWidth = Math.max(1.5, ew * 0.016);
    g.setLineDash([ew * 0.07, ew * 0.05]);
    g.lineDashOffset = -e * ew * 0.00012 * 60;
    g.strokeStyle = "rgb(255 255 255 / .92)";
    g.shadowColor = "rgb(0 0 0 / .35)"; g.shadowBlur = Math.max(2, ew * 0.03);
    g.beginPath();
    for (const poly of geo.outline ?? geo.polys) smooth(g, poly as V[]);
    g.stroke();
    if (geo.paths && step.key !== "liner") {          // brows / lashes: the line to follow
      g.setLineDash([]); g.lineWidth = Math.max(1, ew * 0.01); g.strokeStyle = "rgb(255 255 255 / .55)";
      g.beginPath();
      for (const line of geo.paths) { g.moveTo(line[0][0], line[0][1]); for (const q of line.slice(1)) g.lineTo(q[0], q[1]); }
      g.stroke();
    }
    g.restore();

    // Tool positions: along a curve, along the sweep axis (with a blending wobble) or spiralling out.
    const tips: V[] = [];
    const move = step.guideOnly ? ease(clamp((e - fadeIn) / sweep)) : f;
    const P = this.shot.points;
    const centre: V = [P[1][0], P[1][1]];
    const blend = step.draw === "fluffy" || step.draw === "brush" || step.draw === "sponge" || step.draw === "fan";
    if (geo.paths) for (const line of geo.paths) tips.push(along(line as V[], move));
    else for (const [A, B] of geo.sweep.axes) {
      const d: V = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(d[0], d[1]);
      if (geo.sweep.mode === 0) {
        const a = move * Math.PI * 4 + (A[0] < centre[0] ? Math.PI : 0), r = L * Math.min(1, move * 1.1);
        tips.push([A[0] + Math.cos(a) * r, A[1] + Math.sin(a) * r * 0.8]);
      } else {
        const n = unit([-d[1], d[0]]), w = blend ? Math.sin(move * Math.PI * 6) * L * 0.08 : 0;
        tips.push([A[0] + d[0] * move + n[0] * w, A[1] + d[1] * move + n[1] * w]);
      }
    }
    g.save();
    g.globalAlpha = clamp(alpha * 1.2);
    g.shadowColor = "rgb(0 0 0 / .3)"; g.shadowBlur = ew * 0.08; g.shadowOffsetY = ew * 0.03;
    for (const [x, y] of tips) {
      const dir = unit([clamp((x - centre[0]) / ew, -1, 1) * 0.6, -0.85]);
      g.save();
      g.translate(x, y);
      if (step.draw !== "finger") g.rotate(Math.atan2(dir[0], -dir[1]));
      drawTool(g, step.draw, ew * 1.2, color);
      g.restore();
    }
    g.restore();
  }
}
