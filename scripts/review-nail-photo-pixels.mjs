#!/usr/bin/env node
/**
 * H-Beauty pixel-level nail candidate quality gate.
 * Run AFTER structural audit and AFTER "npm run build" installs the nine
 * SHA-pinned approved WebPs. No file is installed, approved or published here.
 *
 *   npm run review:nail-photo-pixels -- ./candidate-single-images
 *   npm run review:nail-photo-pixels -- --baseline
 *
 * A passed result is PIXEL_PREFLIGHT_ONLY, never commercial approval.
 * Browser decoding, full-resolution sharpness, perceptual difference and
 * transparency checks cannot verify anatomy, identity, correct finish, rights
 * or whether a panel was AI-upscaled with synthetic sharpening.
 */
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {auditPhotoCandidates} from "./audit-nail-photo-candidates.mjs";
import {inspectPanelGrid} from "./detect-nail-contact-sheet.mjs";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const expectedLock=resolve(ROOT,"assets/hbeauty-nail-editorial-v4.sha256");
const MAX_IMAGE_BYTES=2_000_000;
const MIN_SHARPNESS=60;
const MIN_PIXEL_DISTANCE=.045;

export function rgbPixelDifference(a,b) {
  if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)
    throw Error("RGB vectors must have the same nonempty length");
  let sum=0;
  for(let i=0;i<a.length;i++) {
    if(!Number.isFinite(a[i])||!Number.isFinite(b[i])||a[i]<0||a[i]>255||b[i]<0||b[i]>255)
      throw Error("RGB vector contains invalid channel values");
    sum+=Math.abs(a[i]-b[i]);
  }
  return sum/(255*a.length);
}
export function edgeHashDifference(a,b) {
  if(!/^[a-f0-9]{16}$/i.test(a)||!/^[a-f0-9]{16}$/i.test(b))
    throw Error("Edge hashes must be 16 hexadecimal characters");
  let bits=BigInt("0x"+a)^BigInt("0x"+b);
  let different=0;
  while(bits){different++;bits&=bits-1n;}
  return different;
}
function sha(buffer){return createHash("sha256").update(buffer).digest("hex")}

function approvedReferences() {
  const entries=readFileSync(expectedLock,"utf8").trim().split(/\r?\n/);
  if(entries.length!==9)throw Error("Approved V4 reference list must contain nine sources");
  return entries.map(line=>{
    const m=line.match(/^([a-f0-9]{64})\s+(public\/nails\/photos\/((?:nail|pedi)-[a-z0-9-]+)\.webp)$/);
    if(!m)throw Error("Invalid V4 photo lock entry");
    const path=resolve(ROOT,m[2]);
    if(!existsSync(path))
      throw Error("Approved photo missing: "+m[2]+" (run npm run build first)");
    const bytes=readFileSync(path);
    if(sha(bytes)!==m[1])throw Error("Approved photo hash mismatch: "+m[2]);
    if(bytes.length>MAX_IMAGE_BYTES)throw Error("Approved photo exceeds analysis size");
    return {id:m[3],bytes};
  });
}

async function decodePixels(page,id,bytes){
  return page.evaluate(async ({name,base64})=>{
    // A syntactically plausible RIFF container may still have undecodable pixels.
    // The browser's decoder is the second source of truth.
    const img=new Image();
    img.decoding="async";
    img.src="data:image/webp;base64,"+base64;
    try{await img.decode();}catch{throw Error(name+": Chromium could not decode pixels");}
    if(img.naturalWidth<600||img.naturalHeight<600)
      throw Error(name+": decoded image is undersized");
    const canvas=document.createElement("canvas");
    const w=img.naturalWidth,h=img.naturalHeight;
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw Error("Chromium 2D canvas unavailable");
    ctx.drawImage(img,0,0);
    const rgba=ctx.getImageData(0,0,w,h).data;
    // Scan for bright, neutral gutters that persist across most of an
    // image. A repeated grid is evidence of a multi-image contact sheet,
    // even if exported as a sharp 1024px WebP.
    const lightNeutral=(k)=>{
      const r=rgba[k],g=rgba[k+1],b=rgba[k+2];
      return Math.min(r,g,b)>190 && Math.max(r,g,b)-Math.min(r,g,b)<55;
    };
    const verticalLines=[], horizontalLines=[];
    const yStep=Math.max(1,Math.floor(h/360));
    const xStep=Math.max(1,Math.floor(w/360));
    for(let x=Math.ceil(w*.05);x<Math.floor(w*.95);x++){
      let hits=0,total=0;
      for(let y=0;y<h;y+=yStep){hits+=Number(lightNeutral((y*w+x)*4));total++;}
      if(hits/total>.62)verticalLines.push(x);
    }
    for(let y=Math.ceil(h*.05);y<Math.floor(h*.95);y++){
      let hits=0,total=0;
      for(let x=0;x<w;x+=xStep){hits+=Number(lightNeutral((y*w+x)*4));total++;}
      if(hits/total>.91)horizontalLines.push(y);
    }
    const gray=new Float32Array(w*h);
    let transparent=0;
    for(let p=0;p<gray.length;p++){
      const k=p*4;
      gray[p]=.299*rgba[k]+.587*rgba[k+1]+.114*rgba[k+2];
      if(rgba[k+3]<250)transparent++;
    }
    // Same four-neighbour Laplacian kernel and threshold as the
    // original nine-source native-detail acceptance test.
    let sum=0,sumsq=0,n=0;
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const p=y*w+x;
        const v=gray[p-1]+gray[p+1]+gray[p-w]+gray[p+w]-4*gray[p];
        sum+=v;sumsq+=v*v;n++;
      }
    }
    const sharpness=sumsq/n-(sum/n)**2;
    const thumbnail=document.createElement("canvas");
    thumbnail.width=32;thumbnail.height=32;
    const tc=thumbnail.getContext("2d",{willReadFrequently:true});
    if(!tc)throw Error("Thumbnail canvas unavailable");
    tc.drawImage(img,0,0,32,32);
    const pixels=tc.getImageData(0,0,32,32).data;
    const rgb=[];
    for(let k=0;k<pixels.length;k+=4)rgb.push(pixels[k],pixels[k+1],pixels[k+2]);
    // Grayscale horizontal dHash flags potential composition reuse after
    // recolouring; it is advisory, not conclusive evidence of plagiarism.
    const edges=document.createElement("canvas");
    edges.width=9;edges.height=8;
    const ec=edges.getContext("2d",{willReadFrequently:true});
    if(!ec)throw Error("Edge canvas unavailable");
    ec.drawImage(img,0,0,9,8);
    const ep=ec.getImageData(0,0,9,8).data;
    const lum=(p)=>.299*ep[p]+.587*ep[p+1]+.114*ep[p+2];
    let pattern=0n;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const k=(y*9+x)*4;
      pattern=(pattern<<1n)|(lum(k)>lum(k+4)?1n:0n);
    }
    return {id:name,width:w,height:h,sharpness,
      transparencyFraction:transparent/(w*h),rgb,edgeHash:pattern.toString(16).padStart(16,"0"),
      seamPositions:{vertical:verticalLines,horizontal:horizontalLines}};
  },{name:id,base64:bytes.toString("base64")});
}

export async function auditNailPixels(directory,{baselineOnly=false}={}){
  const refs=approvedReferences();
  let sources=[];
  if(!baselineOnly){
    const preflight=auditPhotoCandidates(directory);
    if(preflight.failures.length)
      return {status:"REJECTED",stage:"structural",failures:preflight.failures};
    sources=preflight.accepted.map(x=>({
      id:x.id,bytes:readFileSync(resolve(directory,x.filename)),
      sha256:x.sha256
    }));
  }
  // Dynamic import keeps dependency-free Node structural tests functional
  // before "npm ci" in the CI workflow.
  const {chromium}=await import("playwright");
  const browser=await chromium.launch({headless:true,
    ...(process.env.CI?{channel:"chrome"}:{})});
  try{
    const page=await browser.newPage();
    const decodedRefs=[];
    for(const {id,bytes} of refs)decodedRefs.push(await decodePixels(page,id,bytes));
    const decodedCandidates=[];
    for(const {id,bytes} of sources)decodedCandidates.push(await decodePixels(page,id,bytes));
    await page.close();
    const failures=[],warnings=[];
    for(const photo of [...decodedRefs,...decodedCandidates]){
      const grid=inspectPanelGrid({vertical:photo.seamPositions.vertical,
        horizontal:photo.seamPositions.horizontal,width:photo.width,height:photo.height});
      if(grid.likelyContactSheet)
        failures.push(photo.id+": multi-panel contact sheet detected ("+
          grid.regularVerticalCount+" vertical and "+grid.regularHorizontalCount+" horizontal separators)");
      if(photo.sharpness<=MIN_SHARPNESS)
        failures.push(photo.id+": insufficient fine detail (Laplacian variance "+photo.sharpness.toFixed(1)+")");
      if(photo.transparencyFraction>.01)
        failures.push(photo.id+": unexpected transparent regions for a studio photo");
    }
    for(const candidate of decodedCandidates){
      for(const other of [...decodedRefs,...decodedCandidates]){
        if(candidate===other||candidate.id===other.id)continue;
        const diff=rgbPixelDifference(candidate.rgb,other.rgb);
        // Reject image twins even when lossy WebP compression changes hashes.
        if(diff<=MIN_PIXEL_DISTANCE)
          failures.push(candidate.id+" / "+other.id+": near-identical pixels ("+diff.toFixed(4)+")");
        const edgeDistance=edgeHashDifference(candidate.edgeHash,other.edgeHash);
        if(edgeDistance<=6)
          warnings.push(candidate.id+" / "+other.id+": potentially reused composition; anatomy review required (dHash distance "+edgeDistance+")");
      }
    }
    // Never report entire 3072-channel thumbnails or source media in logs.
    const compact=photos=>photos.map(({id,width,height,sharpness,transparencyFraction,edgeHash,seamPositions})=>({
      id,width,height,sharpness:Number(sharpness.toFixed(2)),
      transparencyFraction:Number(transparencyFraction.toFixed(5)),edgeHash,
      panelGrid:inspectPanelGrid({vertical:seamPositions.vertical,
        horizontal:seamPositions.horizontal,width,height})
    }));
    return {status:failures.length?"REJECTED":baselineOnly?"BASELINE_VERIFIED":"PIXEL_PREFLIGHT_ONLY",
      thresholds:{minSharpnessExclusive:MIN_SHARPNESS,minNormalizedRgbDiffExclusive:MIN_PIXEL_DISTANCE},
      approvedReferenceCount:decodedRefs.length,candidateCount:decodedCandidates.length,
      candidates:compact(decodedCandidates),approved:baselineOnly?compact(decodedRefs):undefined,
      failures:[...new Set(failures)],warnings:[...new Set(warnings)],
      nextStep:baselineOnly?null:"Human review of toe/finger anatomy, style/finish, source resolution, rights and honest AI labeling is mandatory; this is not approval."};
  }finally{await browser.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const target=process.argv[2],baselineOnly=target==="--baseline";
  if(!target){console.error("Usage: npm run review:nail-photo-pixels -- <folder|--baseline>");process.exit(2);}
  try{
    const result=await auditNailPixels(baselineOnly?undefined:target,{baselineOnly});
    console.log(JSON.stringify(result,null,2));
    if(result.failures?.length)process.exitCode=1;
  }catch(error){console.error("Nail photo pixel audit failed:",error.message);process.exitCode=1;}
}
