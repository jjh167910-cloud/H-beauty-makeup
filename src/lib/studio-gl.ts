/*
 * Studio retouch, on the phone's graphics chip, before the makeup: the catalog photos are studio portraits (rich,
 * glowing skin, crisp eyes), her photo is usually a selfie in flat light; side by side the makeup was right but her
 * picture looked poor. Every step follows her face (the face model's 478 points) and keeps who she is:
 *
 * - colour: her skin's hue moved part of the way to a warm studio hue as a white balance (her skin's brightness kept,
 *   so no skin is lightened or darkened), and flat, washed-out colour made richer (her skin up to a healthy chroma,
 *   never past it; the rest of the photo a little);
 * - skin: faint unevenness between pores and broad shading (blotches, dull patches) softened in log light, the edges
 *   of her nose, lids and jaw kept (an edge-aware shrinkage, as in wavelet denoising), her fine texture kept, so it
 *   never looks like plastic or blurred; not on her eyes, brows, lips or nostrils;
 * - light: a beauty dish's soft fall-off over her face (the middle of her face a little brighter, its edges a little
 *   darker: the shape a studio key light gives a face; a selfie's flat light has none), a gentle contrast about her
 *   own skin's brightness (which stays), a soft shoulder (no clipped highlights), a
 *   soft vignette away from her face, and a glow: her face's own highlights bloom softly, in her skin's warmth and in
 *   proportion to her own light (so deep skin isn't lightened);
 * - under her eyes: the shadow (dark circles) lifted part of the way to her skin's brightness, and its grey or
 *   violet cast moved towards her skin's colour, as a concealer would;
 * - blemishes: a small dark blob on her skin (a spot, a mark: her skin's light curving up all round, unlike the edge of
 *   her nose or a fold, which curve one way) lifted to the skin around it, its red or brown cast taken away, her texture
 *   over it kept, as a retoucher's healing brush would (round marks only: a crease is long); a mole, much darker, is
 *   part of her and stays;
 * - eyes and features: the whites of her eyes a little brighter and clearer, her eyes, lashes, brows and lips
 *   crisper; her skin is left soft.
 *
 * Applied to her photo before and after alike (the makeup's comparison stays honest); «نور و پوست استودیویی»
 * switches it off. In the live mirror it runs on every frame. scripts/tinybeauty/studio.py is the reference.
 */
import type { Pt } from "./tryon";

/** The retouch's strengths (scripts/tinybeauty/studio.py has the same). */
export const STUDIO = {
  /** Her skin's hue moved this share of the way to STUDIO_HUE, at most this many degrees. */
  warm: 0.3, hueMax: 4,
  /** Her skin's colour richer by up to this share, never past this chroma (CIELAB); the rest of the photo by this share. */
  skinSat: 0.25, chromaMax: 30, sat: 0.08,
  /**
   * Skin: unevenness between FINE and BLOTCH eye widths softened by this share where it is faint (EDGE: its size in log
   * light at which the softening has fallen to a third, so the edges of her nose, lids and jaw stay); finer texture by this share.
   */
  fine: 0.01, blotch: 0.06, smooth: 0.9, edge: 0.12, pore: 0.15,
  /**
   * Contrast (a power about her skin's brightness), vignette (away from her face), glow; face light: a beauty dish's
   * fall-off over her face (log light, from +half at the bridge of her nose to −half at its edges).
   */
  contrast: 0.07, vignette: 0.18, glow: 0.35, faceLight: 0.35,
  /** Under her eyes: the shadow lifted this share of the way to her skin's brightness, its cast this share towards her skin's colour. */
  underEye: 0.65, underEyeTint: 0.35,
  /** Blemishes healed by this share (a dark blob on her skin lifted to the skin around it; a mole stays). */
  spots: 0.9,
  /** Eye whites brightened towards 1.12x their brightness by this share; features sharpened by this share. */
  eyes: 0.6, sharp: 0.8,
} as const;
/** A warm studio skin hue (CIELAB degrees); hers moves only part of the way. */
const STUDIO_HUE = 44;
/** The glow counts her highlights up to this far above her skin's brightness (a share): shine doesn't become a lamp. */
const GLOW_TOP = 0.5;
/** Her brightest colours kept in colour: a channel past this (linear) is brought in towards her brightness (no clipped red). */
const GAMUT_KNEE = 0.85;
/** Her under-eye: from this far below her lower lid to this far (eye widths, down her face); lifted at most UNDER_EYE_MAX. */
const UNDER_EYE = [0.07, 0.42], UNDER_EYE_MAX = 1.35;
/**
 * Blemishes: a dark blob (her skin's light curving up all round, measured SPOT_STEP eye widths apart on the blotch-scale
 * light) lifted to the ring around it (SPOT_RING eye widths away) from its own level (her fine light averaged SPOT_MID
 * around: finer texture stays); a curvature (log light) from SPOT_BLOB[0] to [1] counts; a mole (darker than
 * SPOT_MOLE[0] to [1], log light) is part of her and stays.
 */
const SPOT_STEP = 0.05, SPOT_RING = 0.13, SPOT_MID = 0.025, SPOT_BLOB = [0.008, 0.02], SPOT_MOLE = [0.5, 0.8];
/** A blemish is round: its curvatures within this ratio (weaker over stronger) counts; a crease (the wing of her nose) doesn't. */
const SPOT_ROUND = [0.3, 0.55];
/** No blemish is healed on the base of her nose (its wings, nostrils and the shadow under them: her shape): grown, feathered (eye widths). */
const NOSE_BASE = [129, 49, 64, 98, 167, 164, 393, 327, 294, 279, 358, 4], SPOT_NOSE = [0.1, 0.06];
/** On a photo already sharpened (the network, the HD face), the features are sharpened only this share more. */
export const STUDIO_CRISP = 0.3;
const LOWER_LIDS = [[33, 7, 163, 144, 145, 153, 154, 155, 133], [263, 249, 390, 373, 374, 380, 381, 382, 362]];

const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
const EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const NOSTRILS = [[79, 166, 59, 75, 60, 20, 238, 239], [309, 392, 289, 305, 290, 250, 458, 459]];
const SKIN_PTS = [50, 101, 118, 280, 330, 347, 205, 425, 36, 266];

/* ------------------------------------------------------------------ colour (CPU) */

const lin8 = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LIN = Array.from({ length: 256 }, (_, i) => lin8(i));
const lumaOf = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const WP = [0.95047, 1, 1.08883];
const fLab = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fInv = (t: number) => (t > 0.2069 ? t ** 3 : (t - 16 / 116) / 7.787);
function toLab([r, g, b]: number[]): number[] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / WP[0], y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / WP[2];
  return [116 * fLab(y) - 16, 500 * (fLab(x) - fLab(y)), 200 * (fLab(y) - fLab(z))];
}
function fromLab([L, a, b]: number[]): number[] {
  const fy = (L + 16) / 116, x = fInv(fy + a / 500) * WP[0], y = fInv(fy), z = fInv(fy - b / 200) * WP[2];
  return [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z];
}

/** What the retouch needs to know about her photo (from a few small samples). */
export type StudioParams = {
  /** White balance gains (linear), her skin's brightness kept. */
  wb: [number, number, number];
  /** Her skin's colour richer by this share (her face), the rest by STUDIO.sat. */
  vs: number;
  /** Her skin's brightness after the white balance (the contrast's pivot and the glow's threshold). */
  pivot: number;
  /** Her skin's colour at unit brightness (the glow's tint). */
  tint: [number, number, number];
  /** Her skin's colourfulness (linear light, relative to its brightness): no colour is made richer past hers made richer. */
  cs: number;
  /** The features' sharpening times this (STUDIO_CRISP on a photo already sharpened: more would ring). */
  sharpK?: number;
};

/** Her skin's colour (patches on her cheeks, forehead and chin), and from it the retouch's settings. */
export function studioParams(photo: HTMLCanvasElement, P: Pt[]): StudioParams {
  const ew = eyeW(P), r = Math.max(2, Math.round(ew * 0.1));
  const g = photo.getContext("2d", { willReadFrequently: true })!;
  const px: number[][] = [];
  for (const i of SKIN_PTS) {
    const x = Math.round(P[i][0]) - r, y = Math.round(P[i][1]) - r;
    if (x < 0 || y < 0 || x + 2 * r > photo.width || y + 2 * r > photo.height) continue;
    const d = g.getImageData(x, y, 2 * r, 2 * r).data;
    for (let k = 0; k < d.length; k += 4) px.push([LIN[d[k]], LIN[d[k + 1]], LIN[d[k + 2]]]);
  }
  // the middle of her skin's brightness (not her shadows nor shine)
  px.sort((a, b) => lumaOf(a) - lumaOf(b));
  const mid = px.slice(Math.floor(px.length * 0.25), Math.ceil(px.length * 0.9));
  const skin = [0, 1, 2].map((c) => { const v = mid.map((p) => p[c]).sort((a, b) => a - b); return v[v.length >> 1] ?? 0.3; });
  // white balance: her skin's hue part of the way to the studio hue, at the same CIELAB brightness and chroma
  const lab = toLab(skin), h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI, C = Math.hypot(lab[1], lab[2]);
  const dh = Math.max(-STUDIO.hueMax, Math.min(STUDIO.hueMax, STUDIO.warm * (STUDIO_HUE - h)));
  const to = fromLab([lab[0], C * Math.cos((h + dh) * Math.PI / 180), C * Math.sin((h + dh) * Math.PI / 180)]).map((v) => Math.max(1e-4, v));
  let wb = skin.map((v, c) => to[c] / Math.max(v, 1e-4));
  const keep = lumaOf(skin) / Math.max(lumaOf(skin.map((v, c) => v * wb[c])), 1e-4);
  wb = wb.map((v) => Math.min(1.08, Math.max(0.92, v * keep)));
  const balanced = skin.map((v, c) => v * wb[c]);
  const C0 = Math.hypot(...toLab(balanced).slice(1));
  const vs = Math.max(0, Math.min(STUDIO.skinSat, STUDIO.chromaMax / Math.max(C0, 1e-3) - 1));
  const pivot = lumaOf(balanced);
  const tint = balanced.map((v) => v / Math.max(pivot, 1e-4)) as [number, number, number];
  const cs = Math.hypot(...balanced.map((v) => v - pivot)) / Math.max(pivot, 1e-4);
  return { wb: wb as [number, number, number], vs, pivot, tint, cs };
}

const eyeW = (P: Pt[]) => (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;

/* ------------------------------------------------------------------ the passes (GPU) */

const VS = `#version 300 es
in vec2 aXy; uniform vec2 uSize; void main() { gl_Position = vec4(aXy / uSize * 2.0 - 1.0, 0.0, 1.0); }`;
const QUAD_VS = `#version 300 es
in vec2 aXy; void main() { gl_Position = vec4(aXy, 0.0, 1.0); }`;
// a shape of her face (filled, the union of several: blended with MAX) into one channel
const FILL_FS = `#version 300 es
precision mediump float; uniform vec4 uColor; out vec4 o; void main() { o = uColor; }`;
// log of her brightness (twice: for the fine and the blotch blurs), her face's highlights (how far above her skin's
// brightness, at most GLOW_TOP), her brightness
const PREP_FS = `#version 300 es
precision highp float; uniform sampler2D uSrc, uMask; uniform float uPivot; uniform vec3 uWb; out vec4 o;
float lin(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
void main() {
  vec3 s = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb, x = vec3(lin(s.r), lin(s.g), lin(s.b)) * uWb;
  float y = dot(x, vec3(0.2126, 0.7152, 0.0722)), lg = log(max(y, 1e-4));
  o = vec4(lg, lg, clamp(y / max(uPivot, 1e-4) - 1.05, 0.0, ${GLOW_TOP.toFixed(2)}) * texelFetch(uMask, ivec2(gl_FragCoord.xy), 0).r, y);
}`;
// a separable Gaussian with one sigma per channel (strided taps for wide ones)
const BLUR_FS = `#version 300 es
precision highp float; uniform sampler2D uIn; uniform vec4 uSigma; uniform vec2 uDir; uniform int uR; uniform float uStride; out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), size = textureSize(uIn, 0);
  vec4 sum = vec4(0.0), wsum = vec4(0.0);
  for (int i = -64; i <= 64; i++) {
    if (i < -uR || i > uR) continue;
    float d = float(i) * uStride;
    ivec2 q = clamp(p + ivec2(uDir * d), ivec2(0), size - 1);
    vec4 w = exp(-0.5 * d * d / (uSigma * uSigma));
    sum += texelFetch(uIn, q, 0) * w; wsum += w;
  }
  o = sum / wsum;
}`;
// everything together, onto the canvas (her photo's top row at the top)
const COMPOSE_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc, uMask, uBlur, uMask2;
uniform vec3 uWb, uTint; uniform float uVs, uCs, uSat, uPivot, uSmooth, uEdge, uPore, uContrast, uVignette, uGlow, uUnder, uUnderTint, uEyes, uSharp;
uniform vec4 uFace;        // her face's centre (px), the vignette's scale (px), the colour region's scale (px)
uniform vec4 uLight;       // the face light's centre (px, the bridge of her nose) and her face's up direction
uniform vec2 uLightSize;   // the face light's reach across and along her face (px)
uniform float uFaceLight;
uniform vec4 uIris[2];     // centre (px), radius (px)
uniform vec4 uSpot;        // blemishes: the curvature's step, the ring's radius, her own level's radius (px), strength
uniform int uFlip;
out vec4 o;
float lin(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float enc(float c) { c = clamp(c, 0.0, 1.0); return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
ivec2 at(ivec2 q) { return clamp(q, ivec2(0), textureSize(uSrc, 0) - 1); }
float G(ivec2 q) { return texelFetch(uBlur, at(q), 0).g; }
float F(ivec2 q) { return texelFetch(uBlur, at(q), 0).r; }
vec3 X(ivec2 q) { vec3 s = texelFetch(uSrc, at(q), 0).rgb; return vec3(lin(s.r), lin(s.g), lin(s.b)) * uWb; }
void main() {
  ivec2 size = textureSize(uSrc, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (uFlip == 1) p.y = size.y - 1 - p.y;
  vec2 xy = vec2(p) + 0.5;
  vec3 s = texelFetch(uSrc, p, 0).rgb;
  vec3 x = vec3(lin(s.r), lin(s.g), lin(s.b)) * uWb;
  vec4 m = texelFetch(uMask, p, 0), b = texelFetch(uBlur, p, 0);
  float face = m.r, skin = face * (1.0 - clamp(m.g * 1.6, 0.0, 1.0)), feat = clamp(m.b * 1.5, 0.0, 1.0);
  // richer colour: her face's region (soft) to her skin's own share, the rest a little
  float region = 1.0 - smoothstep(0.6, 1.6, length(xy - uFace.xy) / uFace.w);
  float y0 = luma(x), v = mix(uSat, uVs, region);
  // (a vibrance: no colour past its own or past her skin's own made richer by her skin's share)
  float c = length(x - vec3(y0)) / max(y0, 1e-4), c2 = min(c * (1.0 + v), max(c, uCs * (1.0 + uVs)));
  x = vec3(y0) + (x - vec3(y0)) * (c2 / max(c, 1e-6));
  // skin: faint blotches softened (not the edges of her nose, lids or jaw), fine texture kept (log light)
  float band = b.r - b.g, lg = log(max(y0, 1e-4));
  float lg2 = lg - uSmooth * skin * band * exp(-(band * band) / (uEdge * uEdge)) - uPore * skin * (lg - b.r);
  // blemishes: a dark blob on her skin lifted to the skin around it (her texture over it kept; a mole stays)
  float lift = 0.0, sure = 0.0; vec3 around = vec3(1.0);
  if (uSpot.w > 0.0 && skin > 0.0) {
    int si = int(uSpot.x + 0.5);
    float lxx = G(p + ivec2(si, 0)) + G(p - ivec2(si, 0)) - 2.0 * b.g, lyy = G(p + ivec2(0, si)) + G(p - ivec2(0, si)) - 2.0 * b.g;
    float lxy = (G(p + ivec2(si, si)) + G(p - ivec2(si, si)) - G(p + ivec2(si, -si)) - G(p + ivec2(-si, si))) / 4.0;
    float rad = sqrt(0.25 * (lxx - lyy) * (lxx - lyy) + lxy * lxy);
    float kappa = 0.5 * (lxx + lyy) - rad, kmax = 0.5 * (lxx + lyy) + rad;
    float ring = 0.0, mid = 0.0, g8[8]; around = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      vec2 dir = vec2(cos(float(k) * 0.78539816), sin(float(k) * 0.78539816));
      ivec2 o = ivec2(round(uSpot.y * dir)), m = ivec2(round(uSpot.z * dir));
      g8[k] = G(p + o); ring += g8[k] / 8.0; around += X(p + o) / 8.0; mid += F(p + m) / 8.0;
    }
    // (lifted no lighter than her skin around it on any side: the darkest of the 4 opposite pairs, her skin's slope cancelled)
    float low = min(min(g8[0] + g8[4], g8[1] + g8[5]), min(g8[2] + g8[6], g8[3] + g8[7])) / 2.0;
    mid = (b.r + 8.0 * mid) / 9.0;
    float deficit = max(0.0, ring - mid);
    sure = smoothstep(${SPOT_BLOB[0]}, ${SPOT_BLOB[1]}, kappa) * smoothstep(${SPOT_ROUND[0]}, ${SPOT_ROUND[1]}, kappa / max(kmax, 1e-6))
      * (1.0 - smoothstep(${SPOT_MOLE[0].toFixed(2)}, ${SPOT_MOLE[1].toFixed(2)}, deficit)) * (1.0 - texelFetch(uMask2, p, 0).g);
    lift = sure * max(0.0, low - mid);
    lg2 += uSpot.w * skin * lift;
  }
  x *= exp(lg2 - lg);
  if (lift > 0.0) {             // (and its red or brown cast, towards the colour of the skin around it)
    vec3 tone = around / max(luma(around), 1e-4);
    x += uSpot.w * skin * sure * clamp(lift / 0.15, 0.0, 1.0) * (vec3(luma(x)) * tone - x);
  }
  // light: contrast about her skin's brightness, a soft shoulder, a soft vignette away from her face
  float y = max(luma(x), 1e-5), yc = uPivot * pow(y / uPivot, 1.0 + uContrast);
  yc = yc < 0.8 ? yc : 0.8 + 0.2 * tanh((yc - 0.8) / 0.2);
  float rr = length(xy - uFace.xy) / uFace.z;
  yc *= 1.0 - uVignette * pow(clamp((rr - 0.8) / 1.2, 0.0, 1.0), 1.5) * (1.0 - face);
  x *= yc / y;
  // face light: a beauty dish's fall-off, along her face's own axes
  vec2 d = xy - uLight.xy, up = uLight.zw;
  vec2 q = vec2(dot(d, vec2(-up.y, up.x)), dot(d, up)) / uLightSize;
  x *= exp(uFaceLight * (exp(-0.5 * dot(q, q)) - 0.5) * face);
  // under her eyes: shadows lifted part of the way to her skin's brightness, their cast towards her skin's colour
  float under = texelFetch(uMask2, p, 0).r;
  x *= min(1.0 + uUnder * under * max(0.0, uPivot / max(exp(b.g), 1e-4) - 1.0), ${UNDER_EYE_MAX.toFixed(2)});
  x += uUnderTint * under * (vec3(luma(x)) * uTint - x);
  // glow: her face's highlights blooming softly, in her skin's warmth, in proportion to her own light
  x *= 1.0 + uGlow * b.b * face * (0.5 + 0.5 * uTint);
  // eyes: the whites a little brighter and clearer (not her irises)
  float iris = 0.0;
  for (int k = 0; k < 2; k++) iris = max(iris, clamp((uIris[k].z * 1.1 - length(xy - uIris[k].xy)) / 1.5 + 0.5, 0.0, 1.0));
  float sclera = m.a * (1.0 - iris);
  x += uEyes * sclera * (vec3(luma(x) * 1.12) - x);
  // her eyes, lashes, brows and lips crisper; her skin left soft
  x *= 1.0 + uSharp * feat * (b.a > 0.0 ? (y0 - b.a) / max(y0, 1e-3) : 0.0);
  // her brightest colours kept in colour: no channel clipped (a clipped red turns lit skin flat and pale), her brightness kept
  float yg = luma(x), mx = max(x.r, max(x.g, x.b));
  if (mx > ${GAMUT_KNEE.toFixed(2)} && mx > yg + 1e-4) {
    float m2 = ${GAMUT_KNEE.toFixed(2)} + ${(1 - GAMUT_KNEE).toFixed(2)} * tanh((mx - ${GAMUT_KNEE.toFixed(2)}) / ${(1 - GAMUT_KNEE).toFixed(2)});
    x = vec3(yg) + (x - vec3(yg)) * max(0.0, (m2 - yg) / max(mx - yg, 1e-4));
  }
  o = vec4(enc(x.r), enc(x.g), enc(x.b), 1.0);
}`;

type Target = { fb: WebGLFramebuffer; tex: WebGLTexture };

export class Studio {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private progs: Record<string, WebGLProgram> = {};
  private buf: WebGLBuffer;
  private src: WebGLTexture;
  private size = [0, 0];
  private t: Record<"prep" | "tmp" | "blur" | "mask" | "mtmp" | "mblur" | "mask2" | "m2blur", Target> | null = null;

  /** null where the phone can't render to floating-point targets (then her photo is used as it is). */
  static create(): Studio | null {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
      if (!gl || !(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"))) return null;
      return new Studio(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const make = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, "aXy");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
      return p;
    };
    this.progs = { fill: make(VS, FILL_FS), prep: make(QUAD_VS, PREP_FS), blur: make(QUAD_VS, BLUR_FS), compose: make(QUAD_VS, COMPOSE_FS) };
    this.buf = gl.createBuffer()!;
    this.src = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  }

  private target(w: number, h: number, float: boolean): Target {
    const gl = this.gl, tex = gl.createTexture()!, fb = gl.createFramebuffer()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex };
  }

  private targets(w: number, h: number) {
    if (this.t && this.size[0] === w && this.size[1] === h) return this.t;
    const gl = this.gl;
    if (this.t) for (const x of Object.values(this.t)) { gl.deleteTexture(x.tex); gl.deleteFramebuffer(x.fb); }
    this.size = [w, h];
    this.t = { prep: this.target(w, h, true), tmp: this.target(w, h, true), blur: this.target(w, h, true), mask: this.target(w, h, false), mtmp: this.target(w, h, false),
      mblur: this.target(w, h, false), mask2: this.target(w, h, false), m2blur: this.target(w, h, false) };
    return this.t;
  }

  private quad(p: WebGLProgram) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(p);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private tex(p: WebGLProgram, name: string, tex: WebGLTexture, unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(p, name), unit);
  }

  /** A separable blur of `from` into `to` (through `tmp`), one sigma (pixels) per channel. */
  private blur(from: Target, tmp: Target, to: Target, sigma: number[]) {
    const gl = this.gl, p = this.progs.blur, s = sigma.map((x) => Math.max(0.5, x));
    const reach = Math.ceil(3 * Math.max(...s)), stride = Math.max(1, Math.ceil(reach / 48));
    gl.useProgram(p);
    gl.uniform4f(gl.getUniformLocation(p, "uSigma"), s[0], s[1], s[2], s[3]);
    gl.uniform1i(gl.getUniformLocation(p, "uR"), Math.min(64, Math.ceil(reach / stride)));
    gl.uniform1f(gl.getUniformLocation(p, "uStride"), stride);
    for (const [src, dst, dir] of [[from, tmp, [1, 0]], [tmp, to, [0, 1]]] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      this.tex(p, "uIn", src.tex, 0);
      gl.uniform2f(gl.getUniformLocation(p, "uDir"), dir[0], dir[1]);
      this.quad(p);
    }
  }

  /**
   * Her photo retouched, at its own size; `P` her face's points in its pixels, `params` from studioParams (measured on
   * this photo, or a recent frame of the live mirror). Returns this.canvas.
   */
  apply(photo: TexImageSource & { width: number; height: number }, P: Pt[], params: StudioParams): HTMLCanvasElement {
    const gl = this.gl, w = photo.width, h = photo.height, T = this.targets(w, h), ew = eyeW(P);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, photo);

    // 1. her face's shapes: r her face, g what isn't skin (eyes, brows, lips, nostrils), b her features, a her eyes' openings
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.mask.fb);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    let p = this.progs.fill;
    gl.useProgram(p);
    gl.uniform2f(gl.getUniformLocation(p, "uSize"), w, h);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX);
    const fill = (ids: number[], grow: number, color: number[]) => {
      const pts = ids.map((i) => [P[i][0], P[i][1]]);
      const c = pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]);
      const at = pts.map((q) => [c[0] + (q[0] - c[0]) * (1 + grow), c[1] + (q[1] - c[1]) * (1 + grow)]);
      const data: number[] = [];
      for (let i = 0; i < at.length; i++) data.push(c[0], c[1], at[i][0], at[i][1], at[(i + 1) % at.length][0], at[(i + 1) % at.length][1]);
      gl.uniform4f(gl.getUniformLocation(p, "uColor"), color[0], color[1], color[2], color[3]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 2);
    };
    fill(OVAL, 0, [1, 0, 0, 0]);
    for (const [ids, g] of [[EYE_R, 0.45], [EYE_L, 0.45], [BROW_R, 0.3], [BROW_L, 0.3], [LIPS, 0.12], ...NOSTRILS.map((n) => [n, 0.3])] as Array<[number[], number]>) fill(ids, g, [0, 1, 0, 0]);
    for (const [ids, g] of [[EYE_R, 0.7], [EYE_L, 0.7], [BROW_R, 0.35], [BROW_L, 0.35], [LIPS, 0.1]] as Array<[number[], number]>) fill(ids, g, [0, 0, 1, 0]);
    fill(EYE_R, -0.05, [0, 0, 0, 1]); fill(EYE_L, -0.05, [0, 0, 0, 1]);
    // r: under her eyes (her lower lid's line moved down her face, as a strip of quads)
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.mask2.fb);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const dx = P[152][0] - P[10][0], dy = P[152][1] - P[10][1], dn = Math.max(1e-6, Math.hypot(dx, dy));
    const strip: number[] = [];
    for (const lid of LOWER_LIDS) {
      const at = (i: number, k: number) => [P[lid[i]][0] + (dx / dn) * ew * UNDER_EYE[k], P[lid[i]][1] + (dy / dn) * ew * UNDER_EYE[k]];
      for (let i = 0; i + 1 < lid.length; i++) {
        const [a, b, c, d] = [at(i, 0), at(i + 1, 0), at(i, 1), at(i + 1, 1)];
        strip.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    }
    gl.uniform4f(gl.getUniformLocation(p, "uColor"), 1, 0, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strip), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, strip.length / 2);
    // g: the base of her nose (no blemish healed there)
    fill(NOSE_BASE, SPOT_NOSE[0], [0, 1, 0, 0]);
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
    this.blur(T.mask, T.mtmp, T.mblur, [ew * 0.12, ew * 0.04, ew * 0.05, 0.7]);
    this.blur(T.mask2, T.mtmp, T.m2blur, [ew * 0.08, ew * SPOT_NOSE[1], 0.5, 0.5]);

    // 2. her brightness (log), her face's highlights (only her face's)
    p = this.progs.prep;
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.prep.fb);
    gl.useProgram(p);
    this.tex(p, "uSrc", this.src, 0);
    this.tex(p, "uMask", T.mblur.tex, 1);
    gl.uniform1f(gl.getUniformLocation(p, "uPivot"), params.pivot);
    gl.uniform3f(gl.getUniformLocation(p, "uWb"), ...params.wb);
    this.quad(p);
    this.blur(T.prep, T.tmp, T.blur, [ew * STUDIO.fine, ew * STUDIO.blotch, ew * 0.18, Math.max(0.7, ew * 0.012)]);

    // 3. together, onto the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    p = this.progs.compose;
    gl.useProgram(p);
    this.tex(p, "uSrc", this.src, 0);
    this.tex(p, "uMask", T.mblur.tex, 1);
    this.tex(p, "uBlur", T.blur.tex, 2);
    this.tex(p, "uMask2", T.m2blur.tex, 3);
    const u = (n: string) => gl.getUniformLocation(p, n);
    gl.uniform3f(u("uWb"), ...params.wb);
    gl.uniform3f(u("uTint"), ...params.tint);
    gl.uniform1f(u("uVs"), params.vs);
    gl.uniform1f(u("uCs"), params.cs);
    gl.uniform1f(u("uUnder"), STUDIO.underEye);
    gl.uniform1f(u("uUnderTint"), STUDIO.underEyeTint);
    gl.uniform4f(u("uSpot"), SPOT_STEP * ew, SPOT_RING * ew, SPOT_MID * ew, STUDIO.spots);
    gl.uniform1f(u("uSat"), STUDIO.sat);
    gl.uniform1f(u("uPivot"), params.pivot);
    gl.uniform1f(u("uSmooth"), STUDIO.smooth);
    gl.uniform1f(u("uEdge"), STUDIO.edge);
    gl.uniform1f(u("uPore"), STUDIO.pore);
    gl.uniform1f(u("uContrast"), STUDIO.contrast);
    gl.uniform1f(u("uVignette"), STUDIO.vignette);
    gl.uniform1f(u("uGlow"), STUDIO.glow);
    gl.uniform1f(u("uEyes"), STUDIO.eyes);
    gl.uniform1f(u("uSharp"), STUDIO.sharp * (params.sharpK ?? 1));
    let cx = 0, cy = 0;
    for (let i = 0; i < 468; i++) { cx += P[i][0] / 468; cy += P[i][1] / 468; }
    gl.uniform4f(u("uFace"), cx, cy, ew * 5.5, ew * 3);
    const lx = (P[168][0] + P[6][0] + P[195][0]) / 3, ly = (P[168][1] + P[6][1] + P[195][1]) / 3;
    const ux = P[10][0] - P[152][0], uy = P[10][1] - P[152][1], un = Math.max(1e-6, Math.hypot(ux, uy));
    gl.uniform4f(u("uLight"), lx, ly, ux / un, uy / un);
    gl.uniform2f(u("uLightSize"), ew * 1.5, ew * 2);
    gl.uniform1f(u("uFaceLight"), STUDIO.faceLight);
    const iris = [[468, 469, 470, 471, 472], [473, 474, 475, 476, 477]].map(([c, ...ring]) => [P[c]?.[0] ?? -1e4, P[c]?.[1] ?? -1e4,
      P[c] ? ring.reduce((a, j) => a + Math.hypot(P[j][0] - P[c][0], P[j][1] - P[c][1]), 0) / ring.length : 0, 0]);
    gl.uniform4fv(u("uIris"), new Float32Array(iris.flat()));
    gl.uniform1i(u("uFlip"), 1);
    this.quad(p);
    return this.canvas;
  }
}
