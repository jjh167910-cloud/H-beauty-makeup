/**
 * Phase-2 native WebGL2 pigment pilot.
 *
 * Shader-native face-space eyelid coverage and cosmetic pigment on the SAME
 * MakeupGL context and its framebuffer chain. No CPU per-pixel mask, second
 * WebGL context, 2D eye blits, or gl.readPixels. This pass intentionally
 * replaces eyeshadow only: the existing renderer still supplies liner/lashes.
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

/** Rejects geometrically impossible eyelids. Never generates a mirrored eye. */
export function nativeEyeMaterial(P: Pt[], lookId: string, level: Level): NativeEyeMaterial | null {
  if (!P || P.length < 468 || !["hollywood", "electric-blue", "rhinestone"].includes(lookId)) return null;
  const look = styleById.get(lookId)?.look;
  if (!look) return null;
  const upper = new Float32Array(36), brows = new Float32Array(20);
  const frame = new Float32Array(8), span = new Float32Array(2);
  const enabled = new Int32Array(2);
  for (let e = 0; e < 2; e++) {
    const u = upperIds[e], b = browIds[e];
    if ([...u,...b].some(id => !P[id] || !Number.isFinite(P[id][0]) || !Number.isFinite(P[id][1]))) continue;
    const [x0,y0] = P[u[0]], [x1,y1] = P[u[8]];
    const length = Math.hypot(x1-x0,y1-y0);
    if (!Number.isFinite(length) || length < 14) continue;
    const bx = b.reduce((sum, id) => sum + P[id][0] / b.length, 0);
    const by = b.reduce((sum, id) => sum + P[id][1] / b.length, 0);
    const gap = Math.hypot(bx-(x0+x1)/2, by-(y0+y1)/2);
    if (gap < length * 0.08 || gap > length * 1.25) continue;
    const up = e === 0 ? P[159] : P[386], down = e === 0 ? P[145] : P[374];
    const opening = Math.hypot(up[0]-down[0], up[1]-down[1])/length;
    if (!Number.isFinite(opening) || opening > 0.68) continue;
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
  const strength = level === "soft" ? 0.7 : level === "bold" ? 1.12 : 1;
  return {
    upper, brows, frame, span, enabled,
    pigmentA: colour(look.lid[0]), pigmentB: colour(look.lid[1]),
    amount: (lookId==="electric-blue" ? 0.78 : lookId==="rhinestone" ? 0.43 : 0.39)*strength,
    mode: lookId==="electric-blue" ? 1 : 0,
  };
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
  "float visible(vec2 photo) {",
  "  if(uVisOn==0) return 0.0;",
  "  vec2 q=(photo-uVisBox.xy)/max(uVisBox.z,0.001);",
  "  if(any(lessThan(q,vec2(0.0)))||any(greaterThan(q,vec2(1.0)))) return 0.0;",
  "  return ramp(0.17,0.72,texture(uVis,q).r);",
  "}",
  "void main() {",
  "  ivec2 pixel=ivec2(gl_FragCoord.xy);",
  "  vec4 prior=texelFetch(uPrevious,pixel,0);",
  "  // The GL drawingBuffer's bottom-up pixel row must map to selfie top-down.",
  "  vec2 photo=vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y);",
  "  float eyeMask=0.0, shadeMix=0.0, mixWeight=0.0;",
  "  float refLight=0.24;",
  "  for(int eye=0;eye<2;eye++){",
  "    if(uEnabled[eye]==0) continue;",
  "    vec4 frame=uFrame[eye];",
  "    float t=dot(photo-frame.xy,frame.zw)/max(uSpan[eye],1.0);",
  "    if(t < -0.04 || t>1.04) continue;",
  "    vec2 lid=onUpper(eye,t), brow=onBrow(eye,t);",
  "    vec2 axis=brow-lid;",
  "    float v=dot(photo-lid,axis)/max(dot(axis,axis),4.0);",
  "    float edge=ramp(-0.03,0.09,t)*(1.0-ramp(0.89,1.03,t));",
  "    float extent=ramp(-0.035,0.06,v)*(1.0-ramp(0.42,0.74,v));",
  "    float grad = uMode==1 ? mix(1.0,0.7,clamp(t,0.0,1.0)) : 1.0;",
  "    float coverage=clamp(edge*extent*grad,0.0,1.0);",
  "    if(coverage <= eyeMask) continue;",
  "    eyeMask=coverage;",
  "    mixWeight=0.45*(1.0-t)+0.55*ramp(0.12,0.65,v);",
  "    vec2 refPt=mix(onUpper(eye,0.5),onBrow(eye,0.5),0.24);",
  "    ivec2 refPixel=ivec2(clamp(floor(refPt),vec2(0.0),uSize-vec2(1.0)));",
  "    vec3 refRGB=linearRGB(texelFetch(uOriginal,refPixel,0).rgb);",
  "    refLight=max(0.012,dot(refRGB,vec3(0.2126,0.7152,0.0722)));",
  "  }",
  "  float visibility=visible(photo);",
  "  float opacity=clamp(eyeMask*uAmount*visibility,0.0,0.87);",
  "  float replace=ramp(0.005,0.04,eyeMask)*visibility;",
  "  if(opacity < 0.5/255.0 || replace < 0.5/255.0){",
  "    o=prior; return;",
  "  }",
  "  // Original selfie uOriginal was uploaded as TexImageSource (its first",
  "  // source row is GL texel row zero); uPrevious is an FBO texture.",
  "  ivec2 srcPixel=ivec2(floor(photo));",
  "  vec3 base=linearRGB(texelFetch(uOriginal,srcPixel,0).rgb);",
  "  vec3 old=linearRGB(prior.rgb);",
  "  float illumination=clamp(dot(base,vec3(0.2126,0.7152,0.0722))/refLight,0.45,1.28);",
  "  vec3 pigment=mix(uPigmentA,uPigmentB,clamp(mixWeight,0.0,1.0))*illumination;",
  "  vec3 filled=mix(base,pigment,opacity);",
  "  vec3 result=mix(old,filled,replace);",
  "  o=vec4(toSRGB(result),prior.a);",
  "}",
].join("\n");
