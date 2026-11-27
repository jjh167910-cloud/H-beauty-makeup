import { test, expect } from "playwright/test";
import { mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
const dir=process.env.HB_SOFT_LINER_DIR;
test("paired GPU calibration of thin soft eyeliner",async({page})=>{
 test.skip(!dir,"Explicit public calibration only");test.setTimeout(600_000);
 mkdirSync(dir!,{recursive:true});
 await page.goto("/?engine=v2");
 const data=await page.evaluate(async()=>{
  const m=await import("/src/lib/tryon.ts");
  const {lookRecipe}=await import("/src/data/look-recipes.ts");
  const {minePicks}=await import("/src/data/my-makeup.ts");
  if(m.engine()!=="gpu")throw Error("Actual GPU required");
  await m.downloadModels(["no-makeup"],()=>{});
  const response=await fetch("/makeup/looks/no-makeup.webp");
  if(!response.ok)throw Error("Missing public input");
  const shot=(await m.preparePhoto(await response.blob())).plain;
  const capture=(c:HTMLCanvasElement)=>{
    const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
    t.getContext("2d")!.drawImage(c,0,0);return t.toDataURL("image/png").split(",")[1];
  };
  const rows=[];
  for(const id of ["romantic-bride","nineties"]){
    const r=lookRecipe(id)!;
    if(!r.liner)throw Error("Missing liner");
    for(const pilot of [false,true]) {
      const url=new URL(location.href);
      if(pilot)url.searchParams.set("softLinerPilot","1");else url.searchParams.delete("softLinerPilot");
      history.replaceState(null,"",url);
      for(const [name,hex,tool] of [["baseline","#141113","pen"],["brown-pencil","#4a2c20","pencil"],["black-pencil","#141113","pencil"],["brown-pen","#4a2c20","pen"],["soft-taupe","#594039","pencil"]] as const){
        const picks=minePicks({...r,liner:{...r.liner,hex,tool}})!;
        const mode=pilot?"guard-"+name:name;
        rows.push({id,mode,image:capture(await m.paintMine(shot,picks))});
        if(pilot&&name==="baseline"){
          rows.push({id,mode:"guard-no-liner",image:capture(await m.paintMine(shot,{...picks,gain:{...picks.gain,liner:0}}))});
        }
      }
    }
  }
  return {bare:capture(shot.photo),points:shot.points,rows};
 });
 expect(data.rows).toHaveLength(22);
 writeFileSync(join(dir!,"bare.png"),Buffer.from(data.bare,"base64"));
 const rows=data.rows.map(({image,...row})=>{
  const file=row.id+"-"+row.mode+".png";
  writeFileSync(join(dir!,file),Buffer.from(image,"base64"));return {...row,file};
 });
 writeFileSync(join(dir!,"manifest.json"),JSON.stringify({points:data.points,rows}));
});
