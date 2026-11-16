import { test, expect } from "playwright/test";

test("three eye-compositing modes preserve identity on two skin depths and in an occluded strip", async ({ page }) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { applyMaterialEyeV2 } = await import("/src/lib/material-eye-v2.ts");
    const W = 380, H = 280;
    const pts = Array.from({ length: 478 }, () => [180, 140, 0]);
    [33, 246, 161, 160, 159, 158, 157, 173, 133].forEach((id, i) =>
      { pts[id] = [105 + 16 * i, 153 - Math.sin(i * Math.PI / 8) * 12, 0]; });
    [70, 63, 105, 66, 107].forEach((id, i) =>
      { pts[id] = [110 + 32 * i, 96 + Math.abs(2 - i) * 3, 0]; });
    pts[145] = [169, 175, 0];
    // The other eye has zero eye width, so it must not be hallucinated.
    const make = (depth: "light" | "deep") => {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const context = c.getContext("2d")!, data = context.createImageData(W,H);
      const base = depth === "light" ? [190, 148, 126] : [75, 48, 39];
      for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
        const i=(y*W+x)*4, texture=((x*11+y*7)%17)-8;
        for(let channel=0;channel<3;channel++)
          data.data[i+channel]=base[channel]+Math.round(texture*(channel===0?1:0.7));
        data.data[i+3]=255;
      }
      context.putImageData(data,0,0);
      return c;
    };
    const probs = new Uint8Array(256*256*2);
    for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
      const photoX=x*W/256, photoY=y*W/256;
      const hidden=photoX>=150 && photoX<=185 && photoY>=110 && photoY<=170;
      probs[(y*256+x)*2]=hidden?0:255;
    }
    const vis={probs,box:[0,0,W] as [number,number,number]};
    const all: Array<Record<string,number|string>>=[];
    for (const depth of ["light","deep"] as const) {
      const source=make(depth), photo=source.getContext("2d")!.getImageData(0,0,W,H).data;
      const outputs:Record<string,Uint8ClampedArray>={};
      const observed:Record<string,string|undefined>={};
      for(const mode of ["cpu","gpu","canvas"]) {
        history.replaceState({}, "", mode==="cpu"?"/":"/?eyeCompute="+mode);
        const rendered=make(depth);
        const result=applyMaterialEyeV2(rendered,source,pts,"electric-blue","natural",vis,0.8);
        outputs[mode]=rendered.getContext("2d")!.getImageData(0,0,W,H).data;
        observed[mode]=result.compute;
      }
      let protectedChanges=0, hiddenChanges=0, modified=0;
      let totalDifference=0, totalGpuDifference=0, maxDifference=0;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
        const p=(y*W+x)*4;
        const outside=x<65||x>295||y<45||y>233;
        const behindOcclusion=x>=159&&x<=175&&y>=120&&y<=155;
        for(let c=0;c<3;c++) {
          if(outputs.canvas[p+c]!==photo[p+c]) {
            modified++;
            if(outside) protectedChanges++;
            if(behindOcclusion) hiddenChanges++;
          }
          const delta=Math.abs(outputs.canvas[p+c]-outputs.cpu[p+c]);
          const gpuDelta=Math.abs(outputs.canvas[p+c]-outputs.gpu[p+c]);
          maxDifference=Math.max(maxDifference,delta);
          totalDifference+=delta;
          totalGpuDifference+=gpuDelta;
        }
      }
      all.push({
        depth, protectedChanges, hiddenChanges, modified,
        meanVsCpu:totalDifference/(W*H*3),
        meanVsReadback:totalGpuDifference/(W*H*3),
        maxDifference, cpuPath:observed.cpu||"",
        gpuPath:observed.gpu||"", canvasPath:observed.canvas||"",
      });
    }
    return all;
  });
  expect(results).toHaveLength(2);
  for(const result of results) {
    expect(result.cpuPath).toBe("cpu");
    expect(result.gpuPath).toBe("gpu-readback");
    expect(result.canvasPath).toBe("gpu-canvas");
    expect(result.modified).toBeGreaterThan(100);
    expect(result.protectedChanges).toBe(0);
    expect(result.hiddenChanges).toBe(0);
    expect(result.meanVsCpu).toBeLessThan(2);
    expect(result.meanVsReadback).toBeLessThan(1);
    expect(result.maxDifference).toBeLessThan(18);
  }
});
