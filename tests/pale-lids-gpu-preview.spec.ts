import { join } from "node:path";
import { test, expect } from "playwright/test";

// Actual GPU A/B with PUBLIC catalog pixels only. Runs via dedicated CI opt-in.
const LOOKS = ["icy", "mod-60s", "cut-crease"] as const;
const PUBLIC_ATLAS = join(process.cwd(), "public/tryon/eye-cap-preview");
test.skip(process.env.EYE_CAP_PREVIEW_GPU_TEST !== "1", "Requires generated public eye-cap candidate textures.");

test("paired GPU renders improve eyelids without modifying non-eye pixels", async ({ browser }, testInfo) => {
  test.setTimeout(540_000);
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
            safeHash:Array.from(new Uint8Array(sha)).map(b=>b.toString(16).padStart(2,"0")).join("")});
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
  let brighter=0;
  const summary=[];
  for(const id of LOOKS){
    const b=baseline.values.find(v=>v.look===id)!;
    const repeat=sameCodeRepeat.values.find(v=>v.look===id)!;
    const c=candidate.values.find(v=>v.look===id)!;
    summary.push({look:id,baselineLstar:b.lidLstar,repeatLstar:repeat.lidLstar,
      candidateLstar:c.lidLstar,baselineRepeatedSafeHash:b.safeHash===repeat.safeHash,
      candidateSafeHashMatches:c.safeHash===b.safeHash});
  }
  console.log("EYE_CAP_GPU_PAIRED_AB",JSON.stringify({sampleCount:36,summary}));
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
    expect(c.safeHash,`${id}: non-eye/background pixels moved`).toBe(b.safeHash);
    expect(c.lidLstar,`${id}: eyelid rendered darker`).toBeGreaterThanOrEqual(b.lidLstar-0.2);
    if(c.lidLstar-b.lidLstar>0.1)brighter++;
  }
  expect(brighter,"At least two of three looks must show better actual-GPU eyelid lightness").toBeGreaterThanOrEqual(2);
});
