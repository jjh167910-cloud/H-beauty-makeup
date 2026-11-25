import { test, expect } from "playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const dir=process.env.HB_LASH_CALIBRATION_DIR;
test("isolate lower mascara and shadow contributions on seven affected styles",async({page})=>{
 test.skip(!dir,"Explicit public catalog calibration only");
 test.setTimeout(1500_000);
 const ids=["electric-blue","glitter-party","full-glam","navy-smokey","bold-glam","cut-crease","monochrome"];
 const b64=readFileSync(join(dir!,"input.png")).toString("base64");
 await page.goto("/?engine=v2");
 const data=await page.evaluate(async({ids,b64})=>{
   const m=await import("/src/lib/tryon.ts");
   if(m.engine()!=="gpu")throw Error("Actual GPU required");
   await m.downloadModels([...ids,"no-makeup"],()=>{});
   const shot=(await m.preparePhoto(await(await fetch("data:image/png;base64,"+b64)).blob())).plain;
   const capture=(c:HTMLCanvasElement)=>{
     const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
     t.getContext("2d")!.drawImage(c,0,0);return t.toDataURL("image/png").split(",")[1];
   };
   const rows=[];
   for(const id of ids){
     const base=m.v2Picks(id,"natural")!;
     if(!base.lashes||!base.shadow)throw Error("Missing eye products "+id);
     for(const [mode,strength,shadow] of [["baseline",1,true],["half-mascara",.5,true],["no-mascara",0,true],["no-extra-shadow",1,false],["half-no-extra-shadow",.5,false]] as const){
       const picks={...base,lashes:{...base.lashes,lowerStrength:strength},
          shadow:{...base.shadow,lower:shadow?base.shadow.lower:false}};
       rows.push({id,mode,image:capture(await m.paintMine(shot,picks))});
     }
   }
   return {points:shot.points,bare:capture(shot.photo),rows};
 },{ids,b64});
 expect(data.rows).toHaveLength(35);
 mkdirSync(dir!,{recursive:true});
 writeFileSync(join(dir!,"bare.png"),Buffer.from(data.bare,"base64"));
 const rows=data.rows.map(({image,...row})=>{
   const file=row.id+"-"+row.mode+".png";
   writeFileSync(join(dir!,file),Buffer.from(image,"base64"));return {...row,file};
 });
 writeFileSync(join(dir!,"lash-manifest.json"),JSON.stringify({points:data.points,rows}));
});
