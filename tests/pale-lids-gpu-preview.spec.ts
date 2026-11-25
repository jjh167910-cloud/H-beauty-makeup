import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { test, expect } from "playwright/test";

// Actual GPU A/B with PUBLIC catalog pixels only. Runs via dedicated CI opt-in.
const ALL_LOOKS = process.env.EYE_CAP_ALL_GPU_TEST === "1";
const PUBLIC_ATLAS = process.env.EYE_CAP_PREVIEW_DIR || join(process.cwd(), "public/tryon/eye-cap-preview");
const LOOKS: string[] = ALL_LOOKS
  ? JSON.parse(readFileSync(join(PUBLIC_ATLAS, "manifest.json"), "utf8")).looks.map((r: { look: string }) => r.look)
  : ["icy", "mod-60s", "cut-crease"];
if (ALL_LOOKS && (LOOKS.length < 40 || new Set(LOOKS).size !== LOOKS.length))
  throw new Error("Full public GPU audit requires the complete distinct catalog atlas set");
test.skip(process.env.EYE_CAP_PREVIEW_GPU_TEST !== "1", "Requires generated public eye-cap candidate textures.");

test("paired GPU renders improve eyelids without modifying non-eye pixels", async ({ browser }, testInfo) => {
  test.setTimeout(ALL_LOOKS ? 1_500_000 : 540_000);
  const render = async (candidate: boolean) => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const requested: string[] = [];
    try {
      if (candidate) await context.route("**/tryon/layers/*.webp*", async route => {
        const id = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.webp$/, "");
        if (LOOKS.some(x => x === id)) {
          requested.push(id);
          await route.fulfill({ path: join(PUBLIC_ATLAS, id + ".webp"), contentType: "image/webp" });
        } else await route.continue();
      });
      const page = await context.newPage();
      await page.goto("/?engine=v1");
      const values = await page.evaluate(async styles => {
        const m = await import("/src/lib/tryon.ts");
        if (m.engine() !== "gpu") throw new Error("GPU not available in public catalog A/B");
        await m.downloadModels(styles, () => {});
        const photo = await fetch("/makeup/looks/no-makeup.webp").then(r => r.blob());
        const shot = (await m.preparePhoto(photo)).plain;
        const w = shot.photo.width, h = shot.photo.height, P = shot.points;
        const eyes = [
          [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,70,63,105,66,107,55,65,52,53,46],
          [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249,300,293,334,296,336,285,295,282,283,276],
        ];
        const faceIds = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
        const lipIds = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
        const facePoly = faceIds.map(i => P[i]);
        const lipPoly = lipIds.map(i => P[i]);
        const boxes = eyes.map(ids => {
          const xs = ids.map(i => P[i][0]), ys = ids.map(i => P[i][1]);
          const span = Math.max(...xs) - Math.min(...xs);
          const pad = Math.max(8, span * 0.22);
          return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
        });
        const upper = [
          [33,246,161,160,159,158,157,173,133],
          [263,466,388,387,386,385,384,398,362],
        ];
        const brows = [
          [70,63,105,66,107,55,65,52,53,46],
          [300,293,334,296,336,285,295,282,283,276],
        ];
        const sample: [number,number][] = [];
        const interp = (points: number[][], x: number) => {
          for (let i = 1; i < points.length; i++) if (x <= points[i][0]) {
            const a = points[i-1], b = points[i];
            return a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1e-3, b[0] - a[0]);
          }
          return points.at(-1)![1];
        };
        for (let eye=0; eye<2; eye++) {
          const a = upper[eye].map(i => P[i]).sort((p,q)=>p[0]-q[0]);
          const b = brows[eye].map(i => P[i]).sort((p,q)=>p[0]-q[0]);
          for (const f of [0.27,0.36,0.45,0.54,0.63,0.72]) {
            const x = a[0][0] + (a.at(-1)![0] - a[0][0]) * f;
            const y = interp(a,x), brow = interp(b,x);
            for (const t of [0.28,0.4,0.52]) sample.push([x, y + (brow-y)*t]);
          }
        }
        const linear = (v: number) => {
          const t = v/255;
          return t <= 0.04045 ? t/12.92 : ((t+0.055)/1.055)**2.4;
        };
        const getL = (data: Uint8ClampedArray, x: number, y: number) => {
          const i = 4 * (Math.min(h-1, Math.max(0,Math.round(y))) * w + Math.min(w-1,Math.max(0,Math.round(x))));
          const L = 0.2126*linear(data[i]) + 0.7152*linear(data[i+1]) + 0.0722*linear(data[i+2]);
          return L>0.008856 ? 116*Math.cbrt(L)-16 : 903.296*L;
        };
        const results = [];
        for (const look of styles) {
          const rendered = await m.paintLook(shot,look,"natural");
          const c = document.createElement("canvas"); c.width=w;c.height=h;
          const g = c.getContext("2d",{willReadFrequently:true})!;
          g.drawImage(rendered,0,0,w,h);
          const d=g.getImageData(0,0,w,h).data;
          // Safe-zone SHA tests every RGB byte outside generous eye/brow windows.
          const masked=new Uint8Array(w*h*3);
          let k=0;
          for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            if(boxes.some(b=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]))continue;
            const i=(y*w+x)*4;
            masked[k++]=d[i];masked[k++]=d[i+1];masked[k++]=d[i+2];
          }
          const sha=await crypto.subtle.digest("SHA-256",masked.subarray(0,k));
          results.push({look,engine:m.engine(),w,h,lidLstar:sample.reduce((sum,[x,y])=>sum+getL(d,x,y),0)/sample.length,
            safeHash:Array.from(new Uint8Array(sha)).map(b=>b.toString(16).padStart(2,"0")).join(""),
            // Public-catalog PNG is attached only to isolated research CI, not
            // uploaded from customer devices or from real-person benchmarks.
            png:c.toDataURL("image/png"), boxes, facePoly, lipPoly});
        }
        return results;
      }, [...LOOKS]);
      return { values, requested };
    } finally { await context.close(); }
  };
  // Negative control: a second independent default session must hash
  // identically before we attribute ANY changed byte to the candidate atlas.
  const baseline=await render(false), sameCodeRepeat=await render(false), candidate=await render(true);
  expect(candidate.requested.sort()).toEqual([...LOOKS].sort());
  // Compare the exact public GPU frames directly, not just cryptographic
  // hashes: if a safety check fails, show WHERE and HOW MANY pixels differ.
  const measure = async (b: (typeof baseline.values)[number], c: (typeof candidate.values)[number]) => {
    const page = await browser.newPage();
    try {
      return await page.evaluate(async ({ left,right,boxes,face,lip }) => {
        const decode = async (uri:string) => {
          const im=new Image();im.src=uri;await im.decode();
          const cv=document.createElement("canvas");cv.width=im.width;cv.height=im.height;
          const g=cv.getContext("2d",{willReadFrequently:true})!;
          g.drawImage(im,0,0);return {w:cv.width,h:cv.height,data:g.getImageData(0,0,cv.width,cv.height).data};
        };
        const a=await decode(left),b=await decode(right);
        if(a.w!==b.w||a.h!==b.h)throw new Error("Reference image dimensions changed");
        const inside=(poly:number[][],x:number,y:number)=>{
          let included=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
            const p=poly[i],q=poly[j];
            if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])included=!included;
          }return included;
        };
        const contourDistance=(poly:number[][],x:number,y:number)=>{
          let best=Infinity;
          for(let i=0,j=poly.length-1;i<poly.length;j=i++){
            const p=poly[i],q=poly[j],dx=q[0]-p[0],dy=q[1]-p[1];
            const t=Math.max(0,Math.min(1,((x-p[0])*dx+(y-p[1])*dy)/Math.max(1e-9,dx*dx+dy*dy)));
            best=Math.min(best,Math.hypot(x-p[0]-t*dx,y-p[1]-t*dy));
          }
          return best;
        };
        let changed=0,outsideBoxes=0,outsideFace=0,lipPixels=0,maxDelta=0;
        let maxOutsideFaceDistance=0, farOutsideFaceOverOne=0;
        let outsideBoxOverOne=0,outsideFaceOverOne=0,maxOutsideFaceDelta=0,maxLipDelta=0;
        const outsideFaceExamples:{x:number,y:number,d:number}[]=[];
        let x0=a.w,y0=a.h,x1=0,y1=0;
        for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){
          const k=4*(y*a.w+x);
          const d=Math.max(Math.abs(a.data[k]-b.data[k]),
            Math.abs(a.data[k+1]-b.data[k+1]),Math.abs(a.data[k+2]-b.data[k+2]));
          if(d===0)continue;
          changed++;
          if(!boxes.some(box=>x>=box[0]&&x<=box[2]&&y>=box[1]&&y<=box[3])){
            outsideBoxes++;maxDelta=Math.max(maxDelta,d);
            if(d>1)outsideBoxOverOne++;
            x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
          }
          if(!inside(face,x,y)){
            outsideFace++;maxOutsideFaceDelta=Math.max(maxOutsideFaceDelta,d);
            const dist=contourDistance(face,x,y);
            maxOutsideFaceDistance=Math.max(maxOutsideFaceDistance,dist);
            if(d>1){
              outsideFaceOverOne++;
              if(dist>2)farOutsideFaceOverOne++;
              if(outsideFaceExamples.length<24)outsideFaceExamples.push({x,y,d,distanceFromFacePx:+dist.toFixed(3)});
            }
          }
          if(inside(lip,x,y)){lipPixels++;maxLipDelta=Math.max(maxLipDelta,d);}
        }
        return {changed,outsideBoxes,outsideFace,lipPixels,maxOutsideDelta:maxDelta,
          outsideBoxOverOne,outsideFaceOverOne,maxOutsideFaceDelta,maxLipDelta,outsideFaceExamples,
          maxOutsideFaceDistance:+maxOutsideFaceDistance.toFixed(3),farOutsideFaceOverOne,
          outsideBoxBounds:outsideBoxes?[x0,y0,x1,y1]:null};
      }, {left:b.png,right:c.png,boxes:b.boxes,face:b.facePoly,lip:b.lipPoly});
    } finally { await page.close(); }
  };
  let brighter=0;
  const summary=[];
  for(const id of LOOKS){
    const b=baseline.values.find(v=>v.look===id)!;
    const repeat=sameCodeRepeat.values.find(v=>v.look===id)!;
    const c=candidate.values.find(v=>v.look===id)!;
    const pixels=await measure(b,c);
    summary.push({look:id,baselineLstar:b.lidLstar,repeatLstar:repeat.lidLstar,
      candidateLstar:c.lidLstar,baselineRepeatedSafeHash:b.safeHash===repeat.safeHash,
      candidateSafeHashMatches:c.safeHash===b.safeHash,pixels});
    // Attach the three representative public photos, not 96 near-duplicates
    // during the all-48 regression. Full results still have numeric evidence.
    if (!ALL_LOOKS || ["icy", "mod-60s", "cut-crease"].includes(id)) {
      await testInfo.attach(id+"-baseline-public.png",{body:Buffer.from(b.png.split(",")[1],"base64"),contentType:"image/png"});
      await testInfo.attach(id+"-candidate-public.png",{body:Buffer.from(c.png.split(",")[1],"base64"),contentType:"image/png"});
    }
  }
  console.log("EYE_CAP_GPU_PAIRED_AB",JSON.stringify({
    sampleCount:36,fullCatalog:ALL_LOOKS,looks:LOOKS.length,summary}));
  await testInfo.attach("public-eye-cap-GPU-aggregate.json",{
    body:Buffer.from(JSON.stringify({sampleCount:36,summary},null,2)),contentType:"application/json",
  });
  for(const id of LOOKS){
    const b=baseline.values.find(v=>v.look===id)!;
    const repeat=sameCodeRepeat.values.find(v=>v.look===id)!;
    const c=candidate.values.find(v=>v.look===id)!;
    expect(b.safeHash,`${id}: two unchanged engine runs diverged; GPU comparison invalid`).toBe(repeat.safeHash);
    expect(Math.abs(b.lidLstar-repeat.lidLstar),`${id}: unstable unchanged GPU lid L*`).toBeLessThan(0.01);
    expect(c.w).toBe(b.w);expect(c.h).toBe(b.h);
    const region=summary.find(x=>x.look===id)!.pixels;
    // Lossless source atlas plus GPU bilinear interpolation can move a few
    // single-code-value RGB pixels at a subpixel mask edge. Treat those as a
    // measured quantization budget, not permission for material changes.
    // We previously observed 22 such pixels on Icy, each <= 1/255.
    expect(region.outsideBoxes,`${id}: excessive 1-LSB halo beyond eye boxes`).toBeLessThanOrEqual(32);
    expect(region.outsideBoxOverOne,`${id}: material change beyond eye boxes`).toBe(0);
    expect(region.outsideFace,`${id}: excessive 1-LSB change outside face`).toBeLessThanOrEqual(64);
    expect(region.outsideFaceOverOne,`${id}: material change outside face contour`).toBe(0);
    expect(region.lipPixels,`${id}: lipstick changed`).toBe(0);
    expect(c.lidLstar,`${id}: eyelid rendered darker`).toBeGreaterThanOrEqual(b.lidLstar-0.2);
    if(c.lidLstar-b.lidLstar>0.1)brighter++;
  }
  expect(brighter,"At least two looks must show improved measured GPU eyelid lightness").toBeGreaterThanOrEqual(2);
  // Emit public comparison files ONLY after every actual GPU protection and
  // brightness assertion has passed. A failing test must not publish frames
  // as though they were validated evidence.
  // A human-reviewable, OFFLINE gallery of the same real GPU frames. PUBLIC
  // catalog reference only: no private user/client photos ever enter artifacts.
  const visualDir = join(process.cwd(), "test-results", "public-eye-cap-visual");
  mkdirSync(visualDir, { recursive: true });
  for (const id of LOOKS) {
    if (ALL_LOOKS && !["icy", "mod-60s", "cut-crease"].includes(id)) continue;
    const baselineFrame = baseline.values.find(v => v.look === id)!;
    const candidateFrame = candidate.values.find(v => v.look === id)!;
    writeFileSync(join(visualDir, id + "-before.png"), Buffer.from(baselineFrame.png.split(",")[1], "base64"));
    writeFileSync(join(visualDir, id + "-after.png"), Buffer.from(candidateFrame.png.split(",")[1], "base64"));
  }
  writeFileSync(join(visualDir, "metrics.json"), JSON.stringify({ fullCatalog: ALL_LOOKS,
    source: "public catalog only", sampleCount: 36, summary }, null, 2));
  const { makeVisualReport } = await import("../scripts/bench/make_visual_report.mjs");
  makeVisualReport(visualDir);
});
