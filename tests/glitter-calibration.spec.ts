import { test, expect } from "playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir=process.env.HB_GLITTER_CALIBRATION_DIR;
test("public glitter pilot paired GPU renders and finish controls", async ({page})=>{
  test.skip(!dir,"Explicit calibration run only");
  test.setTimeout(420_000);
  mkdirSync(dir!,{recursive:true});
  await page.goto("/?engine=v2");
  const data=await page.evaluate(async()=>{
    const m=await import("/src/lib/tryon.ts");
    if(m.engine()!=="gpu")throw new Error("Actual WebGL2 required");
    await m.downloadModels(["no-makeup"],()=>{});
    const response=await fetch("/makeup/looks/no-makeup.webp");
    if(!response.ok)throw new Error("Missing catalog bare photo");
    const shot=(await m.preparePhoto(await response.blob())).plain;
    const capture=(c:HTMLCanvasElement)=>{
      const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
      t.getContext("2d")!.drawImage(c,0,0);
      return t.toDataURL("image/png").split(",")[1];
    };
    const base=m.v2Picks("glitter-party","natural")!;
    if(!base.shadow||base.shadow.finish!=="glitter")throw new Error("Expected glitter recipe");
    const rows=[];
    for(const finish of ["glitter","shimmer","matte"]){
      const picks={...base,shadow:{...base.shadow,finish,finish2:finish}};
      for(const pilot of [false,true]){
        history.replaceState(null,"",pilot?"/?engine=v2&glitterPilot=1":"/?engine=v2");
        const canvas=await m.paintMine(shot,picks);
        rows.push({finish,pilot,image:capture(canvas)});
      }
    }
    return {bare:capture(shot.photo),points:shot.points,rows};
  });
  expect(data.rows).toHaveLength(6);
  writeFileSync(join(dir!,"bare.png"),Buffer.from(data.bare,"base64"));
  const rows=data.rows.map(({image,...row})=>{
    const file=row.finish+(row.pilot?"-pilot":"-baseline")+".png";
    writeFileSync(join(dir!,file),Buffer.from(image,"base64"));
    return {...row,file};
  });
  writeFileSync(join(dir!,"manifest.json"),JSON.stringify({points:data.points,rows},null,2));
});
