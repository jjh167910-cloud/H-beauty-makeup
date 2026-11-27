import { test, expect } from "playwright/test";
import { mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
const dir=process.env.HB_BROW_SHAPES_DIR;
test("public Korean and Hollywood brow geometry paired GPU calibration",async({page})=>{
  test.skip(!dir,"Explicit public calibration only");
  test.setTimeout(420_000);
  mkdirSync(dir!,{recursive:true});
  await page.goto("/?engine=v2");
  const data=await page.evaluate(async()=>{
    const m=await import("/src/lib/tryon.ts");
    if(m.engine()!=="gpu")throw Error("Actual GPU required");
    await m.downloadModels(["no-makeup"],()=>{});
    const response=await fetch("/makeup/looks/no-makeup.webp");
    if(!response.ok)throw Error("Missing public face");
    const shot=(await m.preparePhoto(await response.blob())).plain;
    const capture=(c:HTMLCanvasElement)=>{
      const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
      t.getContext("2d")!.drawImage(c,0,0);return t.toDataURL("image/png").split(",")[1];
    };
    const rows=[];
    for(const id of ["k-beauty","hollywood","soft-glam","nineties"]){
      for(const pilot of [false,true]){
        history.replaceState(null,"",pilot?"/?engine=v2&browShapePilot=1":"/?engine=v2");
        const picks=m.v2Picks(id,"natural")!;
        if(!picks.brows)throw Error("Missing brows");
        rows.push({id,pilot,place:picks.brows.place,image:capture(await m.paintMine(shot,picks))});
        if(id==="hollywood"&&pilot){
          for(const place of ["sculptedFull","sculptedBody"]){
            const variant={...picks,brows:{...picks.brows,place}};
            rows.push({id,pilot,place,image:capture(await m.paintMine(shot,variant))});
          }
        }
      }
    }
    return {bare:capture(shot.photo),points:shot.points,rows};
  });
  expect(data.rows).toHaveLength(10);
  expect(data.rows.find(r=>r.id==="k-beauty"&&r.pilot)?.place).toBe("straight");
  expect(data.rows.find(r=>r.id==="hollywood"&&r.pilot)?.place).toBe("sculptedSoft");
  writeFileSync(join(dir!,"bare.png"),Buffer.from(data.bare,"base64"));
  const rows=data.rows.map(({image,...row})=>{
    const file=row.id+(row.pilot?"-"+row.place:"-baseline")+".png";
    writeFileSync(join(dir!,file),Buffer.from(image,"base64"));return {...row,file};
  });
  writeFileSync(join(dir!,"manifest.json"),JSON.stringify({points:data.points,rows},null,2));
});
