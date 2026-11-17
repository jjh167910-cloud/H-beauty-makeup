/**
 * Phase-2 native WebGL2 pigment pilot.
 *
 * Shader-native face-space eyelid coverage and cosmetic pigment on the SAME
 * MakeupGL context and its framebuffer chain. No CPU per-pixel mask, second
 * WebGL context, 2D eye blits, or gl.readPixels. This pass intentionally
 * adds eyelid pigment and individually positioned vector-like liner/lashes.
 * Legacy makeup remains beneath this experimental pass pending blind review.
 * Experimental still-photo look flag only; never automatically live/production.
 */
import type { Pt } from "./tryon";
import type { Level } from "./makeup-gl";
import { styleById } from "../data/makeup-styles";

export type NativeEyeMaterial = {
  upper: Float32Array; // 2 eyes x 9 points x 2
  brows: Float32Array; // 2 eyes x 5 points x 2
  frame: Float32Array; // 2 eyes x (outside x/y + direction x/y)
  span: Float32Array;
  enabled: Int32Array;
  pigmentA: Float32Array;
  pigmentB: Float32Array;
  amount: number;
  mode: number; // 0 wash; 1 blue gradient
  lift: Float32Array;
  opening: Float32Array;
  linerColor: Float32Array;
  linerWidth: number;
  wingLength: number;
  lashLength: number;
  lashCount: number;
  inkSoft: number;
  highlightRecovery: number; // bound original eyelid specular detail, per finish
  shimmer: number; // photo-light-matched sparse micro-powder; zero disables
  rhinestones: number; // faceted gems anchored on this customer's lid
};

const upperIds = [
  [33, 246, 161, 160, 159, 158, 157, 173, 133],
  [263, 466, 388, 387, 386, 385, 384, 398, 362],
];
const browIds = [
  [70, 63, 105, 66, 107],
  [300, 293, 334, 296, 336],
];
const sRGBLinear = (x: number) => {
  const c = x / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const colour = (s: string) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error("Invalid eye pigment shade");
  return new Float32Array([1, 3, 5].map(i => sRGBLinear(parseInt(s.slice(i, i+2), 16))));
};

/**
 * Input may contain missing, stale or occluded landmark points. This check
 * is rotation-invariant and deliberately permissive toward natural eyelid
 * curvature, but rejects sudden flipped/crossed curves which would put ink
 * onto the eyeball or the surrounding skin.
 */
export function nativeEyeGeometryValid(P: Pt[], u: number[], b: number[]): boolean {
  const finite = (id: number) => P[id] != null &&
    Number.isFinite(P[id][0]) && Number.isFinite(P[id][1]);
  if (![...u, ...b].every(finite)) return false;
  const [x0, y0] = P[u[0]], [x1, y1] = P[u[8]];
  const span = Math.hypot(x1 - x0, y1 - y0);
  if (!Number.isFinite(span) || span < 14) return false;
  const dx = (x1 - x0) / span, dy = (y1 - y0) / span;
  const project = (id: number) => ((P[id][0] - x0) * dx +
    (P[id][1] - y0) * dy) / span;
  let prev = -1;
  for (let i = 0; i < u.length; i++) {
    const t = project(u[i]);
    if (t < -0.30 || t > 1.30 || t < prev - 0.14) return false;
    if (i > 0 && Math.hypot(P[u[i]][0] - P[u[i - 1]][0],
      P[u[i]][1] - P[u[i - 1]][1]) > span * 0.44) return false;
    prev = t;
  }
  // Sparse eyebrow landmarks may be irregular, but cannot jump across
  // half the eye width backwards or invert the overall brow arc.
  prev = -1;
  for (const id of b) {
    const t = project(id);
    if (t < -0.60 || t > 1.60 || t < prev - 0.45) return false;
    prev = t;
  }
  const bx = b.reduce((sum, id) => sum + P[id][0] / b.length, 0);
  const by = b.reduce((sum, id) => sum + P[id][1] / b.length, 0);
  // Reject a "brow" on the eye chord itself. A lateral displacement
  // alone must not be mistaken for genuine eyelid-to-brow separation.
  const signedBrowOffset = (bx - x0) * -dy + (by - y0) * dx;
  if (Math.abs(signedBrowOffset) < span * 0.06) return false;
  // An individual erroneous brow point can cross the lid while its mean
  // stays plausible. Reject that eye instead of painting the sclera/cheek.
  const side = Math.sign(signedBrowOffset);
  if (!b.every(id =>
    ((P[id][0] - x0) * -dy + (P[id][1] - y0) * dx) * side >= span * 0.02))
    return false;
  // Each eyelid point must remain within a plausible lid arc, and BELOW
  // the brow at approximately the same along-eye position. A single stale
  // mesh point can be close enough to its neighbours to pass the jump test,
  // yet place shadow/liner on the eyebrow or forehead. Both comparisons
  // use the local eye chord, so rotated selfies are handled identically.
  for (let i = 1; i < u.length - 1; i++) {
    const point = P[u[i]];
    const excursion = (point[0] - x0) * -dy +
      (point[1] - y0) * dx;
    if (Math.abs(excursion) > span * 0.32) return false;
    const f = i * (b.length - 1) / (u.length - 1);
    const j = Math.min(b.length - 2, Math.floor(f));
    const blend = f - j;
    const bxLocal = P[b[j]][0] * (1 - blend) + P[b[j + 1]][0] * blend;
    const byLocal = P[b[j]][1] * (1 - blend) + P[b[j + 1]][1] * blend;
    const separation = ((bxLocal - point[0]) * -dy +
      (byLocal - point[1]) * dx) * side;
    if (separation < span * 0.025) return false;
  }
  return true;
}

/** Rejects geometrically impossible eyelids. Never generates a mirrored eye. */
export function nativeEyeMaterial(P: Pt[], lookId: string, level: Level, photoBlurPx = 0): NativeEyeMaterial | null {
  if (!P || P.length < 468 || !["hollywood", "electric-blue", "rhinestone"].includes(lookId)) return null;
  const look = styleById.get(lookId)?.look;
  if (!look) return null;
  const upper = new Float32Array(36), brows = new Float32Array(20);
  const frame = new Float32Array(8), span = new Float32Array(2);
  const enabled = new Int32Array(2), lift = new Float32Array(4);
  const opening = new Float32Array(2);
  for (let e = 0; e < 2; e++) {
    const u = upperIds[e], b = browIds[e];
    if (!nativeEyeGeometryValid(P, u, b)) continue;
    const [x0,y0] = P[u[0]], [x1,y1] = P[u[8]];
    const length = Math.hypot(x1-x0,y1-y0);
    if (!Number.isFinite(length) || length < 14) continue;
    const bx = b.reduce((sum, id) => sum + P[id][0] / b.length, 0);
    const by = b.reduce((sum, id) => sum + P[id][1] / b.length, 0);
    const gap = Math.hypot(bx-(x0+x1)/2, by-(y0+y1)/2);
    if (gap < length * 0.08 || gap > length * 1.25) continue;
    const upId = e === 0 ? 159 : 386, downId = e === 0 ? 145 : 374;
    const up = P[upId], down = P[downId];
    if (!up || !down ||
        !Number.isFinite(up[0]) || !Number.isFinite(up[1]) ||
        !Number.isFinite(down[0]) || !Number.isFinite(down[1])) continue;
    const aperture = Math.hypot(up[0]-down[0], up[1]-down[1])/length;
    if (!Number.isFinite(aperture) || aperture > 0.68) continue;
    const xMid=(x0+x1)/2, yMid=(y0+y1)/2;
    const browGap=Math.hypot(bx-xMid, by-yMid);
    if (!Number.isFinite(browGap) || browGap < length*0.08) continue;
    const liftX = (bx - xMid) / browGap, liftY = (by - yMid) / browGap;
    // The lower-lid landmark must not jump up into the brow region.
    // A closed eye (zero aperture) is valid; the lash shader suppresses
    // strands in that case.
    if ((down[0] - up[0]) * liftX + (down[1] - up[1]) * liftY >
        length * 0.10) continue;
    lift.set([liftX, liftY], e*2);
    opening[e]=aperture;
    for(let j=0;j<9;j++) upper.set([P[u[j]][0], P[u[j]][1]], (e*9+j)*2);
    for(let j=0;j<5;j++) brows.set([P[b[j]][0], P[b[j]][1]], (e*5+j)*2);
    frame.set([x0, y0, (x1-x0)/length, (y1-y0)/length],e*4);
    span[e]=length; enabled[e]=1;
  }
  if (!enabled[0] && !enabled[1]) return null;
  // A profile eye that collapses into the nose must be suppressed,
  // not replaced with the source catalog model's eye.
  if (enabled[0] && enabled[1]) {
    const ratio=Math.min(span[0],span[1])/Math.max(span[0],span[1]);
    if(ratio < 0.60) enabled[span[0] < span[1] ? 0 : 1]=0;
  }
  // Reject duplicate/mis-associated eye landmarks, a tracking failure
  // that otherwise superposes opaque makeup onto the same patch of skin.
  if (enabled[0] && enabled[1]) {
    const center = (eye: number): [number, number] => {
      const i = eye * 18;
      return [(upper[i] + upper[i+16]) / 2,
        (upper[i+1] + upper[i+17]) / 2];
    };
    const a = center(0), b = center(1);
    if (Math.hypot(a[0]-b[0], a[1]-b[1]) <
        Math.max(span[0], span[1]) * 0.65) return null;
  }
  const strength = level === "soft" ? 0.7 : level === "bold" ? 1.12 : 1;
  return {
    upper, brows, frame, span, enabled,
    pigmentA: colour(look.lid[0]), pigmentB: colour(look.lid[1]),
    amount: (lookId==="electric-blue" ? 0.78 : lookId==="rhinestone" ? 0.43 : 0.39)*strength,
    mode: lookId==="electric-blue" ? 1 : 0,
    lift, opening,
    linerColor: colour(look.linerColor ?? "#21151a"),
    linerWidth: look.liner==="none" ? 0 : (look.liner==="thin" ? 0.011 : 0.021)*strength,
    wingLength: ["wing","fox","graphic","siren"].includes(look.liner)
      ? (look.liner==="graphic" ? 0.30 : 0.22)*strength : 0,
    lashLength: (look.lashes==="dramatic" ? 0.15 : look.lashes==="volume" ? 0.115 : 0.075)*strength,
    lashCount: look.lashes==="dramatic" ? 26 : look.lashes==="volume" ? 22 : 18,
    // A soft camera photo must not acquire unnaturally sharp cosmetic ink.
    // Sharp photos retain the established 0.7 px edge, and noisy/invalid
    // lens measurements are bounded for stable low-end WebGL2 rendering.
    inkSoft: Math.max(0.7, Math.min(3.5,
      Number.isFinite(photoBlurPx) ? Math.max(0, photoBlurPx) * 0.80 : 0.7)),
    // Matte looks preserve fewer source highlights than reflective/shimmering
    // finishes. Never recreate detail that was not present in the selfie.
    highlightRecovery: lookId === "hollywood" ? 0.16 :
      lookId === "electric-blue" ? 0.30 : 0.36,
    shimmer: look.accents?.includes("shimmer") ? 0.11*strength : 0,
    rhinestones: look.accents?.includes("rhinestones") ? 0.90*strength : 0,
  };
}

/**
 * The legacy CPU eye overlay has a less strict geometric validator.
 * It must never be allowed to "rescue" an opt-in native render rejected
 * because one of the customer's eyes is distorted or occluded. On native
 * shader/driver failure, the already-composed baseline photo is safer than
 * guessing new eyeliner/eyelashes for a rejected eye.
 */
export function nativeEyeLegacyFallbackAllowed(P: Pt[], lookId: string, level: Level): boolean {
  const material = nativeEyeMaterial(P, lookId, level);
  return Boolean(material && material.enabled[0] === 1 && material.enabled[1] === 1);
}

/**
 * Conservative output-space scissor for an opt-in same-context fast GPU pass.
 * Shader can never affect pixels outside each eye's upper lid / brow envelope,
 * except wing tips, curled lashes and their subpixel antialiasing. This helper
 * deliberately adds extra padding; too large is only slower, too small would
 * clip makeup. Coordinates returned are WebGL bottom-left, not selfie top-left.
 *
 * Two eyes share one rectangle to avoid extra fullscreen shader draw calls.
 * Null means draw the complete frame rather than risk clipping.
 */
export function nativeEyeScissor(m: NativeEyeMaterial, w: number, h: number):
    [number, number, number, number] | null {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let eye = 0; eye < 2; eye++) {
    if (!m.enabled[eye]) continue;
    const span = m.span[eye];
    if (!Number.isFinite(span) || span < 14) return null;
    // The wing reaches up to 0.30 eye widths; lashes also extend outward.
    // Add a full 0.15 span for uncertain brow/curve/optical edge behavior.
    const radius = Math.max(12, span * (
      Math.max(m.wingLength, m.lashLength) + 0.15) + 3 * m.inkSoft);
    for (const [points, n] of [[m.upper, 9], [m.brows, 5]] as const) {
      for (let j = 0; j < n; j++) {
        const i = (eye * n + j) * 2, x = points[i], y = points[i + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        x0 = Math.min(x0, x - radius);
        y0 = Math.min(y0, y - radius);
        x1 = Math.max(x1, x + radius);
        y1 = Math.max(y1, y + radius);
      }
    }
  }
  if (!Number.isFinite(x0)) return null;
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(w, Math.ceil(x1));
  const bottom = Math.min(h, Math.ceil(y1));
  if (right <= left || bottom <= top) return null;
  return [left, h - bottom, right - left, bottom - top];
}

/** Fullscreen postpass: RGBA source input + base renderer output + existing
 * raw visibility map, all as textures in one WebGL2 context. Rendered canvas
 * orientation matches the base renderer's final flip=-1. The untouched
 * regions take texelFetch(uPrevious) exactly with no gamma round trip.
 */
export const NATIVE_EYE_FS = [
  "#version 300 es",
  "precision highp float; precision highp int;",
  "uniform sampler2D uPrevious, uOriginal, uVis;",
  "uniform vec2 uSize;",
  "uniform vec3 uVisBox;",
  "uniform int uVisOn;",
  "uniform vec2 uUpper[18], uBrows[10];",
  "uniform vec4 uFrame[2];",
  "uniform float uSpan[2];",
  "uniform int uEnabled[2];",
  "uniform vec3 uPigmentA, uPigmentB;",
  "uniform float uAmount;",
  "uniform int uMode;",
  "uniform vec2 uLift[2];",
  "uniform float uOpening[2];",
  "uniform vec3 uLinerColor;",
  "uniform float uLinerWidth, uWingLength, uLashLength;",
  "uniform int uLashCount;",
  "uniform float uInkSoft;",
  "uniform float uHighlightRecovery;",
  "uniform int uCleanLegacy;",
  "uniform float uShimmer, uRhinestones;",
  "out vec4 o;",
  "float ramp(float a, float b, float x) {",
  "  float t = clamp((x-a)/max(b-a,1e-6),0.0,1.0);",
  "  return t*t*(3.0-2.0*t);",
  "}",
  "vec3 linearRGB(vec3 x) {",
  "  return mix(pow((x+0.055)/1.055,vec3(2.4)),x/12.92,lessThanEqual(x,vec3(0.04045)));",
  "}",
  "vec3 toSRGB(vec3 x) {",
  "  x = max(x,vec3(0.0));",
  "  return clamp(mix(1.055*pow(x,vec3(1.0/2.4))-0.055,x*12.92,",
  "    lessThanEqual(x,vec3(0.0031308))),vec3(1.0/255.0),vec3(254.0/255.0));",
  "}",
  "vec2 onUpper(int eye,float t) {",
  "  float f=clamp(t,0.0,1.0)*8.0;",
  "  int i=min(int(floor(f)),7);",
  "  return mix(uUpper[eye*9+i],uUpper[eye*9+i+1],f-float(i));",
  "}",
  "vec2 onBrow(int eye,float t) {",
  "  float f=clamp(t,0.0,1.0)*4.0;",
  "  int i=min(int(floor(f)),3);",
  "  return mix(uBrows[eye*5+i],uBrows[eye*5+i+1],f-float(i));",
  "}",
  "float segmentDistance(vec2 pt, vec2 a, vec2 b) {",
  "  vec2 d=b-a;",
  "  return length(pt-a-d*clamp(dot(pt-a,d)/max(dot(d,d),1e-5),0.0,1.0));",
  "}",
  "// An eyeliner wing is a tapered wedge, not a constant-width marker line.",
  "// Use the camera-matched anti-alias radius but fade width toward the tip.",
  "// Raw (unclamped) progress prevents a rounded smear beyond the endpoint.",
  "float taperedWing(vec2 p,vec2 root,vec2 tip,float rootRadius){",
  "  vec2 segment=tip-root;",
  "  float progress=dot(p-root,segment)/max(dot(segment,segment),1e-5);",
  "  float along=clamp(progress,0.0,1.0);",
  "  vec2 nearest=root+segment*along;",
  "  float width=rootRadius*pow(max(0.0,1.0-along),0.88);",
  "  float edge=1.0-ramp(width,width+uInkSoft,length(p-nearest));",
  "  return edge*(1.0-ramp(0.96,1.01,progress));",
  "}",
  "float fiber(vec2 photo, vec2 root, vec2 lift, vec2 outward, float len, float widthPx) {",
  "  vec2 mid=root+lift*len*0.57+outward*len*0.11;",
  "  vec2 tip=root+lift*len+outward*len*0.3;",
  "  float d=min(segmentDistance(photo,root,mid),segmentDistance(photo,mid,tip));",
  "  // Taper by progression along the strand instead of radial distance",
  "  // from its follicle, which thickened curved lashes unintentionally.",
  "  vec2 direction=tip-root;",
  "  float progress=dot(photo-root,direction)/max(dot(direction,direction),1e-5);",
  "  float taper=mix(widthPx,0.10,pow(clamp(progress,0.0,1.0),0.80));",
  "  float tipFade=1.0-ramp(0.92,1.03,progress);",
  "  return (1.0-ramp(taper,taper+uInkSoft,d))*tipFade;",
  "}",
  "// A deterministic screen-space powder sparkle, anchored to each selfie",
  "// pixel. Sparse grains keep skin pores visible; no learned texture transfer.",
  "float grain(vec2 px) {",
  "  vec2 cell=floor(px * 0.75);",
  "  return fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453123);",
  "}",
  "float stoneCoverage(vec2 p,vec2 q,float radius) {",
  "  float d=length((p-q)/max(radius,0.3));",
  "  // Preserve the old sharp-photo facets; broaden on blurred selfies.",
  "  float feather=max(0.0,(uInkSoft-0.7)/max(radius,0.3));",
  "  return 1.0-ramp(0.80-0.55*feather,1.13+0.55*feather,d);",
  "}",
  "float visible(vec2 photo) {",
  "  if(uVisOn==0) return 0.0;",
  "  vec2 q=(photo-uVisBox.xy)/max(uVisBox.z,0.001);",
  "  if(any(lessThan(q,vec2(0.0)))||any(greaterThan(q,vec2(1.0)))) return 0.0;",
  "  return ramp(0.17,0.72,texture(uVis,q).r);",
  "}",
  "// Sample three ORIGINAL skin-adjacent positions belonging to this eye.",
  "// A single bright specular pixel / dark hair / sensor defect must not",
  "// control the pigment light adaptation across the entire eyelid.",
  "float median3(float a,float b,float c){",
  "  return max(min(a,b),min(max(a,b),c));",
  "}",
  "float eyeReferenceLight(int eye,float along,float height){",
  "  vec2 pt=mix(onUpper(eye,along),onBrow(eye,along),height);",
  "  // A hair strand or glasses arm is not a skin-light reference.",
  "  // Use the existing visibility texture; -1 denotes unusable skin.",
  "  if(visible(pt)<0.65) return -1.0;",
  "  ivec2 at=ivec2(clamp(floor(pt),vec2(0.0),uSize-vec2(1.0)));",
  "  vec3 rgb=linearRGB(texelFetch(uOriginal,at,0).rgb);",
  "  return max(0.012,dot(rgb,vec3(0.2126,0.7152,0.0722)));",
  "}",
  "float robustEyeReference(int eye){",
  "  float a=eyeReferenceLight(eye,0.33,0.24);",
  "  float b=eyeReferenceLight(eye,0.50,0.24);",
  "  float c=eyeReferenceLight(eye,0.67,0.24);",
  "  // A one-pixel glint on the middle reference must not switch the",
  "  // global eye-light estimate. Robustly sample above and below it",
  "  // along the person's own lid-to-brow axis, then take two medians.",
  "  float up=eyeReferenceLight(eye,0.50,0.16);",
  "  float down=eyeReferenceLight(eye,0.50,0.32);",
  "  // Keep the validated nested five-site median on fully visible skin.",
  "  if(a>=0.0 && b>=0.0 && c>=0.0 && up>=0.0 && down>=0.0)",
  "    return median3(a,median3(up,b,down),c);",
  "  // When one or more references are hidden, never let their hair/glass",
  "  // luminance enter the pigment. Robustly combine only valid samples.",
  "  float count=0.0,total=0.0,low=2.0,high=0.0;",
  "  for(int i=0;i<5;i++){",
  "    float v=i==0?a:(i==1?b:(i==2?c:(i==3?up:down)));",
  "    if(v<0.0) continue;",
  "    count+=1.0; total+=v; low=min(low,v); high=max(high,v);",
  "  }",
  "  // Fewer than two independent photo sites cannot establish lighting.",
  "  if(count<2.0) return -1.0;",
  "  // Two widely discrepant samples may contain missed occlusion.",
  "  if(count<3.0) return high-low>0.25 ? -1.0 : total*0.5;",
  "  return count<4.0 ? total-low-high : (total-low-high)*0.5;",
  "}",
  "void main() {",
  "  ivec2 pixel=ivec2(gl_FragCoord.xy);",
  "  vec4 prior=texelFetch(uPrevious,pixel,0);",
  "  // The GL drawingBuffer's bottom-up pixel row must map to selfie top-down.",
  "  vec2 photo=vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y);",
  "  // Occluded/hair-covered pixels must remain byte-identical to the base.",
  "  // Reject them BEFORE 26 lash loops and five photo-light texture taps.",
  "  float visibility=visible(photo);",
  "  if(visibility<=0.0){o=prior;return;}",
  "  float eyeMask=0.0, mixWeight=0.0;",
  "  float inkStrength=0.0;",
  "  float legacySeam=0.0;",
  "  float gems=0.0, facetGlint=0.0;",
  "  float refLight=0.24, validReference=1.0, dominantEyeContribution=0.0;",
  "  for(int eye=0;eye<2;eye++){",
  "    if(uEnabled[eye]==0) continue;",
  "    vec4 frame=uFrame[eye];",
  "    float t=dot(photo-frame.xy,frame.zw)/max(uSpan[eye],1.0);",
  "    if(t < -0.34 || t>1.06) continue;",
  "    vec2 lid=onUpper(eye,t), brow=onBrow(eye,t);",
  "    vec2 axis=brow-lid;",
  "    float v=dot(photo-lid,axis)/max(dot(axis,axis),4.0);",
  "    // Restore source photograph along the upper-lid seam before applying",
  "    // the fitted native eye material. Old catalog mascara can otherwise",
  "    // survive between new ink strokes. This narrow strip is strictly",
  "    // ABOVE the lid and fades away before brow/iris/sclera.", 
  "    float seamAlong=ramp(-0.03,0.05,t)*(1.0-ramp(0.92,1.025,t));",
  "    // Express the restoration band in photo pixels, not a fraction of",
  "    // brow height. Otherwise large faces lose an unnaturally wide strip",
  "    // of their real eyelid texture beneath inherited catalog mascara.",
  "    float seamReach=min(0.16,(1.6+uInkSoft)/max(length(axis),4.0));",
  "    float seamAbove=ramp(-0.006,0.012,v)*",
  "      (1.0-ramp(0.60*seamReach,seamReach,v));",
  "    legacySeam=max(legacySeam,seamAlong*seamAbove);",
  "    float edge=ramp(-0.03,0.09,t)*(1.0-ramp(0.89,1.03,t));",
  "    float extent=ramp(-0.035,0.06,v)*(1.0-ramp(0.42,0.74,v));",
  "    float grad = uMode==1 ? mix(1.0,0.7,clamp(t,0.0,1.0)) : 1.0;",
  "    float coverage=clamp(edge*extent*grad,0.0,1.0);",
  "    float eyeInk=0.0, eyeGems=0.0;",
  "    if(coverage>eyeMask){",
  "      eyeMask=coverage;",
  "      mixWeight=0.45*(1.0-t)+0.55*ramp(0.12,0.65,v);",
  "    }",
  "    // Eyeball and sclera are below the upper lid. Only draw fibers above it.",
  "    if(v>=-0.012 && v<0.60){",
  "      float ew=uSpan[eye];",
  "      vec2 lift=normalize(uLift[eye]);",
  "      vec2 outward=-frame.zw;",
  "      float ink=0.0;",
  "      if(uLinerWidth>0.0 && t>=0.0 && t<=1.0){",
  "        float d=distance(photo,lid);",
  "        float radius=max(0.50,ew*uLinerWidth*",
  "          (0.42+0.58*pow(max(0.0,sin(3.14159265*clamp(t,0.0,1.0))),0.6)));",
  "        ink=max(ink,1.0-ramp(radius,radius+uInkSoft,d));",
  "      }",
  "      if(uWingLength>0.0 && t>=-0.34 && t<0.24){",
  "        vec2 tip=frame.xy+outward*(ew*uWingLength)+lift*(ew*0.11);",
  "        float r=max(0.45,ew*uLinerWidth*0.85);",
  "        ink=max(ink,taperedWing(photo,onUpper(eye,0.14),tip,r));",
  "      }",
  "      if(uLashLength>0.0 && uOpening[eye]>=0.045 && t>=-0.04 && t<=1.04){",
  "        // Fixed upper bound for WebGL2 mobile shader compilation.",
  "        for(int i=1;i<27;i++){",
  "          if(i>=uLashCount) break;",
  "          float f=float(i)/float(uLashCount);",
  "          if(abs(t-f)>0.11) continue;",
  "          float variation=0.87+0.13*sin(float(i)*23.7);",
  "          // Both eyes use outer-to-inner landmark order: outer lashes",
  "          // fan toward the temple; central lashes lift; inner fan inward.",
  "          float fan=clamp(0.80-1.60*f,-0.80,0.80);",
  "          float len=ew*uLashLength*variation*(0.45+0.55*(1.0-f));",
  "          float strand=fiber(photo,onUpper(eye,f),lift,outward*fan,len,",
  "            max(0.34,ew*0.0048));",
  "          ink=max(ink,strand*(0.55+0.25*abs(sin(float(i)*13.3))));",
  "        }",
  "      }",
  "      inkStrength=max(inkStrength,ink);",
  "      eyeInk=ink;",
  "    }",
  "    // Gemstone centers are in THIS eye's lid/brow coordinate system.",
  "    // Avoid material on iris, cheek or eyebrow, and keep the stones",
  "    // independent of the source catalog model's photograph.",
  "    if(uRhinestones>0.0 && t>0.03 && t<0.96 && v>0.08 && v<0.61){",
  "      for(int i=0;i<7;i++){",
  "        float f=(float(i)+0.75)/7.65;",
  "        float h=0.24 + 0.08*sin(float(i)*2.2);",
  "        vec2 center=mix(onUpper(eye,f),onBrow(eye,f),h);",
  "        float radius=max(1.1, uSpan[eye]*(0.010+0.002*sin(float(i)*2.7)));",
  "        float coverage=stoneCoverage(photo,center,radius);",
  "        if(coverage<=0.0) continue;",
  "        vec2 q=(photo-center)/radius;",
  "        // An off-center facet simulates a small specular glint, not a",
  "        // flat pure-white dot. The final encoder reserves clipping room.",
  "        float glint=exp(-dot(q-vec2(-0.25,-0.34),q-vec2(-0.25,-0.34))*",
  "          8.0/max(1.0,uInkSoft/0.7));",
  "        gems=max(gems,coverage);",
  "        eyeGems=max(eyeGems,coverage);",
  "        facetGlint=max(facetGlint,glint*coverage);",
  "      }",
  "    }",
  "    // Lighting must belong to the eye that actually contributes THIS",
  "    // fragment. Never let the second eye's skin sample overwrite the",
  "    // first eye's pigment adaptation, particularly under side lighting.",
  "    float eyeContribution=max(coverage,max(eyeInk,eyeGems));",
  "    if(eyeContribution>dominantEyeContribution){",
  "      dominantEyeContribution=eyeContribution;",
  "      float sampledLight=robustEyeReference(eye);",
  "      validReference=step(0.0,sampledLight);",
  "      refLight=sampledLight>=0.0 ? sampledLight : 0.24;",
  "    }",
  "  }",
  "  float opacity=clamp(eyeMask*uAmount*visibility*validReference,0.0,0.87);",
  "  // A zero-strength pigment must not silently erase the previous",
  "  // broad eyelid layer. Underlay restoration is permitted only when",
  "  // genuine new pigment is present; the separate seam remains opt-in.",
  "  float replace=ramp(0.005,0.04,eyeMask)*visibility*",
  "    step(0.0001,uAmount)*validReference;",
  "  float lineAlpha=clamp(inkStrength*visibility*0.88,0.0,0.93);",
  "  // Cleanup only in the experimental native pass. Respect partial hair",
  "  // / eyeglass visibility as strictly as all other cosmetic materials.",
  "  float seamAlpha=uCleanLegacy==1 ?",
  "    clamp(legacySeam*visibility,0.0,1.0) : 0.0;",
  "  float gemAlpha=clamp(gems*visibility*uRhinestones,0.0,0.94);",
  "  float fineGrain=grain(photo);",
  "  float powder=step(0.983,fineGrain)*eyeMask*visibility*uShimmer*validReference;",
  "  if((opacity < 0.5/255.0 || replace < 0.5/255.0) &&",
  "     lineAlpha < 0.5/255.0 && gemAlpha < 0.5/255.0 &&",
  "     seamAlpha < 0.5/255.0 && powder < 0.5/255.0){",
  "    o=prior; return;",
  "  }",
  "  // Original selfie uOriginal was uploaded as TexImageSource (its first",
  "  // source row is GL texel row zero); uPrevious is an FBO texture.",
  "  ivec2 srcPixel=ivec2(floor(photo));",
  "  vec3 base=linearRGB(texelFetch(uOriginal,srcPixel,0).rgb);",
  "  vec3 old=linearRGB(prior.rgb);",
  "  float illumination=validReference>0.0 ?",
  "    clamp(dot(base,vec3(0.2126,0.7152,0.0722))/refLight,0.45,1.28) : 1.0;",
  "  vec3 pigment=mix(uPigmentA,uPigmentB,clamp(mixWeight,0.0,1.0))*illumination;",
  "  vec3 filled=mix(base,pigment,opacity);",
  "  // Keep REAL high-frequency skin detail (pores and fine surface texture)",
  "  // from this customer's photograph. Four adjacent original texels form",
  "  // a local low-pass; its bounded residual is returned after pigment mixing.",
  "  // No source-model texture, procedural pore noise or learned skin smoothing.",
  "  if(opacity>0.015){",
  "    ivec2 hi=ivec2(uSize)-ivec2(1);",
  "    vec3 left=linearRGB(texelFetch(uOriginal,",
  "      clamp(srcPixel+ivec2(-1,0),ivec2(0),hi),0).rgb);",
  "    vec3 right=linearRGB(texelFetch(uOriginal,",
  "      clamp(srcPixel+ivec2(1,0),ivec2(0),hi),0).rgb);",
  "    vec3 above=linearRGB(texelFetch(uOriginal,",
  "      clamp(srcPixel+ivec2(0,-1),ivec2(0),hi),0).rgb);",
  "    vec3 below=linearRGB(texelFetch(uOriginal,",
  "      clamp(srcPixel+ivec2(0,1),ivec2(0),hi),0).rgb);",
  "    vec3 smoothAlbedo=(base*2.0+left+right+above+below)/6.0;",
  "    vec3 microtexture=clamp(base-smoothAlbedo,vec3(-0.045),vec3(0.045));",
  "    filled=clamp(filled+microtexture*(0.60*opacity),",
  "      vec3(1.0/255.0),vec3(254.0/255.0));",
  "    // A bright REAL photo highlight is reflected light, not a pigment",
  "    // defect: avoid smearing it into a flat painted patch. Reintroduce",
  "    // only the customer pixel, only for positive local luminance relief.",
  "    // Skin pores, freckles and shadows are never fabricated by this pass.",
  "    float positiveLight=max(0.0,dot(base-smoothAlbedo,",
  "      vec3(0.2126,0.7152,0.0722)));",
  "    float specular=ramp(0.025,0.12,positiveLight);",
  "    float recovery=clamp(uHighlightRecovery,0.0,0.45)*specular*opacity;",
  "    filled=mix(filled,base,recovery);",
  "  }",
  "  // In the opt-in native photo pilot, a catalog-model eyelash/wing",
  "  // must not ghost through this customer-fitted ink. Restore only the",
  "  // source underneath active liner coverage outside the eyelid wash.",
  "  // Both cleanup weights are already visibility/geometry-masked.",
  "  float legacyCleanup=uCleanLegacy==1 ?",
  "    clamp(max(seamAlpha,lineAlpha*(1.0-replace)),0.0,1.0) : 0.0;",
  "  vec3 cleanedOld=mix(old,base,legacyCleanup);",
  "  vec3 result=mix(cleanedOld,filled,replace);",
  "  result=mix(result,uLinerColor,lineAlpha);",
  "  // Film-grain-like mica only catches a small amount of the local light.",
  "  // Blend in linear light to preserve the underlying skin's texture.",
  "  float lightAdapt=clamp(illumination,0.35,1.15);",
  "  result=mix(result,vec3(0.58,0.54,0.50)*lightAdapt,clamp(powder,0.0,0.22));",
  "  // Glass/foil gemstones: shadowed mauve rim and a restrained silver",
  "  // facet. No full-white pixels or cross-face baked highlights.",
  "  vec3 facet=mix(vec3(0.22,0.20,0.28),",
  "    vec3(0.75,0.79,0.82)*lightAdapt,clamp(0.24+facetGlint*0.65,0.0,1.0));",
  "  result=mix(result,facet,gemAlpha);",
  "  o=vec4(toSRGB(result),prior.a);",
  "}",
].join("\n");
