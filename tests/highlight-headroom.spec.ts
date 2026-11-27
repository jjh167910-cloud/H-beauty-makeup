import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("highlight headroom pilot protects newly saturated pixels in actual GPU renders", async ({page}) => {
  test.setTimeout(420_000);
  await page.goto("/?engine=v2");
  const fixture=readFileSync(join(process.cwd(),"tests/fixtures/lit-cheek.jpg")).toString("base64");
  const report=await page.evaluate(async b64=>{
    const m=await import("/src/lib/tryon.ts");
    if(m.engine()!=="gpu")throw new Error("WebGL2 required");
    await m.downloadModels(["no-makeup"],()=>{});
    const source=await createImageBitmap(await (await fetch("data:image/jpeg;base64,"+b64)).blob());
    const pixels=(c:HTMLCanvasElement)=>{
      const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
      const g=t.getContext("2d")!;g.drawImage(c,0,0);return g.getImageData(0,0,t.width,t.height);
    };
    const rows=[];
    for(const exposure of [1,1.35]){
      const t=document.createElement("canvas");t.width=source.width;t.height=source.height;
      const g=t.getContext("2d")!;g.filter="brightness("+exposure+")";g.drawImage(source,0,0);
      const blob=await new Promise<Blob>((resolve,reject)=>t.toBlob(v=>v?resolve(v):reject(new Error("PNG encoding failed")),"image/png"));
      const shot=(await m.preparePhoto(blob)).plain;
      const bare=pixels(shot.photo);
      const picks={gain:{base:1,glow:1.5},base:{tint:[1,1,1],finish:1},glow:{place:"cheek",soft:.17,size:1.25,hex:"#fff2e2",finish:"glow"}};
      history.replaceState(null,"","/?engine=v2");
      const old=pixels(await m.paintMine(shot,picks));
      history.replaceState(null,"","/?engine=v2&highlightPilot=1");
      const next=pixels(await m.paintMine(shot,picks));
      let oldClipped=0,newClipped=0,changed=0,newRegressions=0,unmodifiedChanged=0,maxDelta=0;
      for(let i=0;i<bare.data.length;i+=4){
        const b=Math.max(bare.data[i],bare.data[i+1],bare.data[i+2]);
        const a=Math.max(old.data[i],old.data[i+1],old.data[i+2]);
        const c=Math.max(next.data[i],next.data[i+1],next.data[i+2]);
        if(b<254&&a>=254)oldClipped++;
        if(b<254&&c>=254)newClipped++;
        if(b<254&&a<254&&c>=254)newRegressions++;
        const d=Math.max(...[0,1,2].map(k=>Math.abs(old.data[i+k]-next.data[i+k])));
        if(d){
          changed++;maxDelta=Math.max(maxDelta,d);
          if([0,1,2].every(k=>old.data[i+k]===bare.data[i+k]))unmodifiedChanged++;
        }
      }
      rows.push({exposure,oldClipped,newClipped,changed,newRegressions,unmodifiedChanged,maxDelta});
    }
    source.close();
    return rows;
  },fixture);
  console.log("HIGHLIGHT_HEADROOM_GPU_AB",JSON.stringify(report));
  for(const row of report){
    expect(row.newClipped).toBeLessThanOrEqual(row.oldClipped);
    expect(row.newRegressions).toBe(0);
    expect(row.unmodifiedChanged).toBe(0);
    expect(row.maxDelta).toBeLessThanOrEqual(8);
  }
  // This public fixture previously exhibited 206 newly saturated pixels at 1.35x.
  // Fail closed if the stress test stops exercising the actual defect.
  const stress=report.find(r=>r.exposure===1.35)!;
  expect(stress.oldClipped).toBeGreaterThan(0);
  expect(stress.newClipped).toBe(0);
  // Full multi-look clipping stress set and private acceptance still required.
});
