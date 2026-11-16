/**
 * Material-eye v2 experimental PHOTO renderer (behind ?eyePilot=v2).
 *
 * Replaces the old catalog-ratio pixels INSIDE each eyelid with an authored,
 * face-fitted pigment layer derived from the user's own photograph. Draws
 * deterministic vector liner and individually anchored lash strands. No
 * generative-model texture, face changing, remote requests or external assets.
 *
 * This is deliberately isolated from live video and public production. The
 * optional pilot must win blind tests before replacing the original eye engine.
 */
import type { Pt } from "./tryon";
import { compositeEyeGPU } from "./material-eye-gpu";
import { styleById } from "../data/makeup-styles";
import type { FaceLook } from "../data/makeup-styles";
import type { Level, Visibility } from "./makeup-gl";
import { VIS_SEG } from "./makeup-gl";

type XY = readonly [number, number];
type Eye = {
  upper: XY[];
  brow: XY[];
  outside: XY;
  inside: XY;
  along: XY;
  upward: XY;
  span: number;
  opening: number;
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / Math.max(1e-8, b - a));
  return t * t * (3 - 2 * t);
};
const srgbToLin = (n: number) => {
  const v = n / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const linToSrgb = (v: number) => {
  const c = clamp(v, 0.001, 0.997);
  // Quantization can round an almost-white linear value back to 255.
  // Reserve one code value at either end for headroom, including shiny stones.
  return Math.max(1, Math.min(254, Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055))));
};
const hexLinear = (s: string): [number, number, number] => {
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error("Invalid cosmetic shade");
  return [1, 3, 5].map((i) => srgbToLin(parseInt(s.slice(i, i + 2), 16))) as [number, number, number];
};
const rgbLuma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix = (a: XY, b: XY, t: number): XY => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const norm = (a: XY): XY => { const s = Math.hypot(...a) || 1; return [a[0] / s, a[1] / s]; };
const point = (P: Pt[], index: number): XY => [P[index][0], P[index][1]];
const VALID = new Set(["no-makeup", "hollywood", "electric-blue", "rhinestone"]);

/** Does not activate automatically, including when opening a look share link. */
export function materialEyePilotEnabled(look: string, params = new URLSearchParams(location.search)): boolean {
  return params.get("eyePilot") === "v2" && VALID.has(look);
}

/** Public for geometry tests; do not infer eyes by reflection of the source model. */
export function eyeGeometry(P: Pt[], side: "left" | "right"): Eye | null {
  if (!P || P.length < 468) return null;
  const outer = side === "left" ? 33 : 263;
  const inner = side === "left" ? 133 : 362;
  const upperIds = side === "left" ? [33, 246, 161, 160, 159, 158, 157, 173, 133]
                                    : [263, 466, 388, 387, 386, 385, 384, 398, 362];
  const browIds = side === "left" ? [70, 63, 105, 66, 107] : [300, 293, 334, 296, 336];
  const outside = point(P, outer), inside = point(P, inner);
  const along = norm(sub(inside, outside)), span = Math.hypot(...sub(inside, outside));
  if (!Number.isFinite(span) || span < 14) return null;
  const upper = upperIds.map((i) => point(P, i));
  const brow = browIds.map((i) => point(P, i));
  if ([...upper, ...brow].some((q) => !q.every(Number.isFinite))) return null;
  const averageUp = mix(upper[0], upper[upper.length - 1], 0.5);
  const averageBrow: XY = [brow.reduce((a, p) => a + p[0], 0) / brow.length,
                            brow.reduce((a, p) => a + p[1], 0) / brow.length];
  // MediaPipe sometimes collapses brows onto lashes on small, extreme-pose or
  // occluded photographs. Never manufacture a plausible-looking lid from a
  // degenerate landmark set; retain the proven baseline renderer instead.
  const browVector = sub(averageBrow, averageUp);
  const gap = Math.hypot(...browVector);
  if (!Number.isFinite(gap) || gap < span * 0.08 || gap > span * 1.25) return null;
  const upward = norm(browVector);
  const lowerId = side === "left" ? 145 : 374;
  const upperId = side === "left" ? 159 : 386;
  const opening = Math.abs(dot(sub(point(P, upperId), point(P, lowerId)), upward)) / span;
  if (!Number.isFinite(opening) || opening > 0.68) return null;
  return { upper, brow, outside, inside, along, upward, span, opening };
}

const at = (q: readonly XY[], t: number): XY => {
  const u = clamp(t) * (q.length - 1), i = Math.min(q.length - 2, Math.floor(u));
  return mix(q[i], q[i + 1], u - i);
};

/** Pixel position projected onto her individual lid: not the catalog model's eyelid. */
export function lidCoordinates(eye: Eye, x: number, y: number) {
  const relative = sub([x, y], eye.outside);
  const t = dot(relative, eye.along) / eye.span;
  const lid = at(eye.upper, t);
  const brow = at(eye.brow, t);
  const axis = sub(brow, lid);
  const v = dot(sub([x, y], lid), axis) / Math.max(4, dot(axis, axis));
  return { t, v };
}

/** Bilinear visibility sampling matches the existing 2-byte face/body segmentation layout. */
export function faceVisible(vis: Visibility, x: number, y: number): number {
  const [x0, y0, side] = vis.box;
  if (side <= 0 || vis.probs.length !== VIS_SEG * VIS_SEG * 2) return 0;
  const gx = (x + 0.5 - x0) * VIS_SEG / side - 0.5;
  const gy = (y + 0.5 - y0) * VIS_SEG / side - 0.5;
  if (gx < -0.5 || gy < -0.5 || gx > VIS_SEG - 0.5 || gy > VIS_SEG - 0.5) return 0;
  const fx = clamp(gx, 0, VIS_SEG - 1), fy = clamp(gy, 0, VIS_SEG - 1);
  const ix = Math.min(VIS_SEG - 2, Math.floor(fx)), iy = Math.min(VIS_SEG - 2, Math.floor(fy));
  const u = fx - ix, v = fy - iy;
  const pix = (a: number, b: number) => vis.probs[(b * VIS_SEG + a) * 2] / 255;
  return lerp(lerp(pix(ix, iy), pix(ix + 1, iy), u), lerp(pix(ix, iy + 1), pix(ix + 1, iy + 1), u), v);
}

/** True cosmetic coverage. Top of shadow fades below the eyebrow; eyeball remains untouched. */
export function shadowCoverage(eye: Eye, x: number, y: number, shadow: FaceLook["shadow"]): number {
  if (shadow === "none") return 0;
  const { t, v } = lidCoordinates(eye, x, y);
  const edges = smooth(-0.03, 0.09, t) * (1 - smooth(0.89, 1.03, t));
  const lower = smooth(-0.035, 0.06, v);
  const upper = 1 - smooth(shadow === "smoky" ? 0.55 : 0.42, shadow === "smoky" ? 0.94 : 0.74, v);
  const form = shadow === "cutcrease" ? (1 - smooth(0.28, 0.48, v))
    : shadow === "crease" ? Math.max(0.45, smooth(0.15, 0.33, v))
    : shadow === "gradient" ? lerp(1, 0.7, clamp(t)) : 1;
  return clamp(edges * lower * upper * form);
}

/** Hard mask for vector liner and lash strokes; never allows the overlay across arbitrary parts of the face. */
export function strokeRegion(eye: Eye, x: number, y: number): number {
  const { t, v } = lidCoordinates(eye, x, y);
  // A 0.27-eye-width allowance keeps wing tips while stopping stray lashes
  // from spilling into the cheek/background on narrow and rotated eyes.
  // Upper-lid boundary protects the sclera from blurred liner pixels.
  // Only a 2% brow/lid gap is allowed below the lash-root curve; do not turn
  // the existing eyeball, iris or contact lenses into cosmetic pigment.
  return t >= -0.27 && t <= 1.04 && v >= -0.02 && v <= 0.88 ? 1 : 0;
}

/** Individually face-anchored rhinestones with a tiny contact shadow, glass facet and
 * a restrained specular point. Their placement depends on this eye, never the catalog model.
 * This is a deterministic materials pilot, not a claim of physically accurate gemstone BRDF.
 */
function paintRhinestones(ctx: CanvasRenderingContext2D, eye: Eye, strength: number) {
  const positions: ReadonlyArray<XY> = [
    [0.19, 0.24], [0.36, 0.32], [0.56, 0.29], [0.73, 0.23],
    [0.29, 0.45], [0.49, 0.47], [0.67, 0.40],
  ];
  const alpha = clamp(strength, 0, 1);
  for (const [t, v] of positions) {
    const origin = at(eye.upper, t), brow = at(eye.brow, t);
    const [x, y] = mix(origin, brow, v);
    const r = Math.max(0.8, eye.span * (0.010 + 0.002 * Math.sin(t * 57)));
    // Drop shadow on the pigment keeps a foil element from looking like a pasted white dot.
    ctx.globalAlpha = 0.29 * alpha;
    ctx.fillStyle = "#302638";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.22, y + r * 0.26, r * 1.17, r * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small radial glass body; use the selfie blur downstream for optical consistency.
    const glass = ctx.createRadialGradient(x - r * 0.25, y - r * 0.33, 0, x, y, r);
    glass.addColorStop(0, "#ffffff");
    glass.addColorStop(0.27, "#e8f3fb");
    glass.addColorStop(0.61, "#b4a3cb");
    glass.addColorStop(0.86, "#696275");
    glass.addColorStop(1, "#383241");
    ctx.globalAlpha = 0.9 * alpha;
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // An offset, high-frequency specular core that reads as a faceted stone.
    ctx.globalAlpha = 0.95 * alpha;
    ctx.fillStyle = "#fffcf8";
    ctx.beginPath();
    ctx.arc(x - r * 0.29, y - r * 0.36, Math.max(0.34, r * 0.24), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Deterministic vector path, not a sampled texture or mirrored eyelashes. */
function paintStrokes(ctx: CanvasRenderingContext2D, eye: Eye, look: FaceLook, strength: number) {
  const outerDir = norm(sub(eye.outside, eye.inside));
  const lifted = eye.upward, ew = eye.span;
  const opacity = clamp(strength);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const linerHex = look.linerColor ?? "#21151a";
  const liner = look.liner !== "none";
  if (liner) {
    ctx.strokeStyle = linerHex;
    ctx.globalAlpha = 0.86 * opacity;
    // Multiple sub-pixel ribbons yield a tapered pencil edge, rather than a solid stamp.
    for (let i = 0; i < 24; i++) {
      const t0 = i / 24, t1 = (i + 1) / 24;
      const p = at(eye.upper, t0), q = at(eye.upper, t1);
      const bell = Math.sin(Math.PI * (t0 * 0.75 + 0.15)) ** 0.6;
      ctx.lineWidth = Math.max(0.55, ew * 0.019 * bell);
      ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
    }
    if (["wing", "fox", "graphic", "siren"].includes(look.liner)) {
      const wing = look.liner === "graphic" ? 0.32 : 0.24;
      const tip: XY = [eye.outside[0] + outerDir[0] * ew * wing + lifted[0] * ew * 0.11,
                       eye.outside[1] + outerDir[1] * ew * wing + lifted[1] * ew * 0.11];
      const root = at(eye.upper, 0.15);
      ctx.beginPath();
      ctx.moveTo(...root);
      ctx.quadraticCurveTo(eye.outside[0], eye.outside[1], ...tip);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.55, ew * 0.009);
      ctx.beginPath(); ctx.moveTo(...eye.outside); ctx.lineTo(...tip); ctx.stroke();
    }
  }
  if (eye.opening < 0.05) { ctx.globalAlpha = 1; return; }
  const density = look.lashes === "dramatic" ? 44 : look.lashes === "volume" ? 36 : 25;
  const length = look.lashes === "dramatic" ? 0.16 : look.lashes === "volume" ? 0.13 : 0.09;
  ctx.strokeStyle = "#20161b";
  for (let i = 1; i < density; i++) {
    const t = i / density;
    // Shorter at the tear duct; a small, repeatable variation prevents comb-like lashes.
    const irregular = 0.85 + 0.15 * Math.sin(i * 23.7);
    const fan = 0.42 - 0.3 * t;
    const dist = ew * length * irregular * (0.45 + 0.55 * (1 - t));
    const root = at(eye.upper, t);
    const tip: XY = [root[0] + lifted[0] * dist + outerDir[0] * fan * dist,
                     root[1] + lifted[1] * dist + outerDir[1] * fan * dist];
    const elbow: XY = [root[0] + lifted[0] * dist * 0.7, root[1] + lifted[1] * dist * 0.65];
    // A hair-fine fiber; never a block of black at the lash line.
    ctx.lineWidth = Math.max(0.45, ew * 0.0043 * (look.lashes === "dramatic" ? 1.1 : 1));
    ctx.globalAlpha = (0.45 + 0.27 * Math.abs(Math.sin(i * 13.3))) * opacity;
    ctx.beginPath();
    ctx.moveTo(...root); ctx.quadraticCurveTo(...elbow, ...tip); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (look.accents?.includes("rhinestones")) paintRhinestones(ctx, eye, strength);
}

type Region = { x: number; y: number; w: number; h: number };
function eyeRegion(eye: Eye, width: number, height: number): Region | null {
  const p = [...eye.upper, ...eye.brow], margin = eye.span * 0.4;
  const x0 = clamp(Math.floor(Math.min(...p.map((q) => q[0])) - margin), 0, width);
  const x1 = clamp(Math.ceil(Math.max(...p.map((q) => q[0])) + margin), 0, width);
  const y0 = clamp(Math.floor(Math.min(...p.map((q) => q[1])) - margin), 0, height);
  const y1 = clamp(Math.ceil(Math.max(...p.map((q) => q[1])) + margin), 0, height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * GPU failure must not erase a photo: reproduce the kernel's quantized
 * optical-material shading on the CPU when WebGL readback is unavailable.
 * This only runs for explicitly requested experimental GPU comparisons.
 */
function shadeGpuFallback(before: ImageData, changed: ImageData, ink: Uint8ClampedArray,
  weights: Uint8ClampedArray, a: readonly number[], b: readonly number[], referenceLight: number) {
  for (let i = 0; i < weights.length; i += 4) {
    const m = weights[i] / 255, mixT = weights[i + 1] / 255;
    const replace = weights[i + 2] / 255, stroke = weights[i + 3] / 255;
    if (replace === 0 && stroke === 0) continue;
    const base = [0, 1, 2].map(c => srgbToLin(before.data[i + c]));
    const old = [0, 1, 2].map(c => srgbToLin(changed.data[i + c]));
    const light = clamp(rgbLuma(base) / Math.max(referenceLight, 0.012), 0.45, 1.28);
    for (let c = 0; c < 3; c++) {
      const pigment = lerp(a[c], b[c], mixT) * light;
      const material = lerp(old[c], lerp(base[c], pigment, Math.min(m, 0.87)), replace);
      changed.data[i + c] = linToSrgb(lerp(material, srgbToLin(ink[i + c]), stroke));
    }
  }
}

/** Paint on a 2D result only. Called AFTER the GPU renderer, NEVER on the WebGL canvas. */
export function applyMaterialEyeV2(
  result: HTMLCanvasElement, source: HTMLCanvasElement, P: Pt[], lookId: string, level: Level,
  vis: Visibility | null | undefined, cameraBlurPx = 0.7,
): { touched: number; eyes: number; skipped?: string } {
  if (!vis) return { touched: 0, eyes: 0, skipped: "no-occlusion-mask" };
  if (result.width !== source.width || result.height !== source.height)
    return { touched: 0, eyes: 0, skipped: "size-mismatch" };
  if (!VALID.has(lookId) || lookId === "no-makeup")
    return { touched: 0, eyes: 0, skipped: "no-material-pilot-for-look" };
  const look = styleById.get(lookId)?.look;
  if (!look) return { touched: 0, eyes: 0, skipped: "unknown-look" };
  const out = result.getContext("2d", { willReadFrequently: true });
  const original = source.getContext("2d", { willReadFrequently: true });
  if (!out || !original) return { touched: 0, eyes: 0, skipped: "2d-unavailable" };
  const linearA = hexLinear(look.lid[0]), linearB = hexLinear(look.lid[1]);
  const strength = (level === "soft" ? 0.7 : level === "bold" ? 1.12 : 1);
  const amount = lookId === "electric-blue" ? 0.78 : lookId === "rhinestone" ? 0.43 : 0.39;
  let touched = 0, eyes = 0;
  const gpuPilot = new URLSearchParams(location.search).get("eyeCompute") === "gpu";
  for (const side of ["left", "right"] as const) {
    const eye = eyeGeometry(P, side);
    if (!eye) continue;
    // Profile eyes collapse onto the nose: do not synthesize an incorrect second eye.
    const left = eyeGeometry(P, "left"), right = eyeGeometry(P, "right");
    const otherSpan = side === "left" ? right?.span : left?.span;
    if (otherSpan && eye.span / Math.max(eye.span, otherSpan) < 0.6) continue;
    const roi = eyeRegion(eye, result.width, result.height);
    if (!roi) continue;
    const before = original.getImageData(roi.x, roi.y, roi.w, roi.h);
    const changed = out.getImageData(roi.x, roi.y, roi.w, roi.h);
    // Estimate this eye's local illumination from the actual eyelid skin,
    // not a fixed assumed complexion. A fixed light divisor made vivid
    // pigments glow unnaturally on fair skin and turn dull on deep skin.
    // The upper quantile avoids natural crease shadows and lash hairs.
    const referenceSamples: number[] = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 16; col++) {
      const tt = (col + 0.5) / 16, vv = 0.18 + row * 0.1;
      const lash = at(eye.upper, tt), brow = at(eye.brow, tt);
      const px = Math.round(lerp(lash[0], brow[0], vv)) - roi.x;
      const py = Math.round(lerp(lash[1], brow[1], vv)) - roi.y;
      if (px < 0 || py < 0 || px >= roi.w || py >= roi.h) continue;
      const i = (py * roi.w + px) * 4;
      const val = [0, 1, 2].map((c) => srgbToLin(before.data[i + c]));
      referenceSamples.push(rgbLuma(val));
    }
    referenceSamples.sort((a, b) => a - b);
    const referenceLight = Math.max(0.012, referenceSamples[Math.floor(referenceSamples.length * 0.65)] ?? 0.25);
    const strokeCanvas = document.createElement("canvas");
    strokeCanvas.width = roi.w; strokeCanvas.height = roi.h;
    const g = strokeCanvas.getContext("2d");
    if (!g) continue;
    g.translate(-roi.x, -roi.y);
    paintStrokes(g, eye, look, strength);
    // Apply the selfie lens only to the newly drawn vectors. The catalog map's
    // fixed softness must not decide how sharp a customer's eyelashes look.
    const extraBlur = Math.min(2.8, Math.sqrt(Math.max(0, cameraBlurPx ** 2 - 0.5 ** 2)));
    let ink = g.getImageData(0, 0, roi.w, roi.h).data;
    if (extraBlur >= 0.3) {
      const blurred = document.createElement("canvas");
      blurred.width = roi.w; blurred.height = roi.h;
      const bg = blurred.getContext("2d");
      if (bg) {
        bg.filter = `blur(${extraBlur.toFixed(2)}px)`;
        bg.drawImage(strokeCanvas, 0, 0);
        ink = bg.getImageData(0, 0, roi.w, roi.h).data;
      }
    }
    const weights = gpuPilot ? new Uint8ClampedArray(roi.w * roi.h * 4) : null;
    let eyeTouched = 0;
    for (let iy = 0; iy < roi.h; iy++) {
      for (let ix = 0; ix < roi.w; ix++) {
        const idx = (iy * roi.w + ix) * 4, x = ix + roi.x, y = iy + roi.y;
        const visFactor = smooth(0.17, 0.72, faceVisible(vis, x, y));
        if (visFactor < 0.02) continue;
        const coverage = shadowCoverage(eye, x + 0.5, y + 0.5, look.shadow);
        const inkA = (ink[idx + 3] / 255) * strokeRegion(eye, x + 0.5, y + 0.5);
        const m = clamp(coverage * amount * strength * visFactor, 0, 0.87);
        const strokeAlpha = clamp(inkA * visFactor);
        if (m < 1 / 255 && strokeAlpha < 1 / 255) continue;
        const { t, v } = lidCoordinates(eye, x + 0.5, y + 0.5);
        const colourT = clamp(0.45 * (1 - t) + 0.55 * smooth(0.12, 0.65, v));
        if (weights) {
          // Quantized, face-fitted maps for the isolated WebGL2 ROI kernel.
          // Touched pixels retain the original background and alpha exactly
          // if either material or vector mask is zero.
          weights[idx] = Math.round(m * 255);
          weights[idx + 1] = Math.round(colourT * 255);
          weights[idx + 2] = Math.round(smooth(0.005, 0.04, coverage) * visFactor * 255);
          weights[idx + 3] = Math.round(strokeAlpha * 255);
          eyeTouched++;
          continue;
        }
        const base = [0, 1, 2].map((c) => srgbToLin(before.data[idx + c]));
        const old = [0, 1, 2].map((c) => srgbToLin(changed.data[idx + c]));
        // Relative lighting uses her own photograph. Keep natural creases, shading and pore contrast.
        const light = clamp(rgbLuma(base) / referenceLight, 0.45, 1.28);
        for (let c = 0; c < 3; c++) {
          const pigment = lerp(linearA[c], linearB[c], colourT) * light;
          const eyeColour = lerp(base[c], pigment, m);
          // Current result remains intact outside the cosmetic coverage. Vector fibers are composited last.
          const material = lerp(old[c], eyeColour, smooth(0.005, 0.04, coverage) * visFactor);
          const lineColour = srgbToLin(ink[idx + c]);
          changed.data[idx + c] = linToSrgb(lerp(material, lineColour, strokeAlpha));
        }
        eyeTouched++;
      }
    }
    if (eyeTouched) {
      if (weights) {
        const gpuResult = compositeEyeGPU({
          width: roi.w, height: roi.h, original: before.data, previous: changed.data, ink, weights,
          pigmentA: linearA, pigmentB: linearB, referenceLight,
        });
        if (gpuResult) changed.data.set(gpuResult);
        else shadeGpuFallback(before, changed, ink, weights, linearA, linearB, referenceLight);
      }
      out.putImageData(changed, roi.x, roi.y);
      touched += eyeTouched; eyes++;
    }
  }
  return { touched, eyes };
}
