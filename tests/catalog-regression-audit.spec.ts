import { test, expect } from "playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const root=process.env.HB_CATALOG_AUDIT_DIR;
const version=process.env.HB_CATALOG_AUDIT_VERSION;
test("fixed public inputs on exact historical GPU revision",async({page})=>{
  test.skip(!root||!version,"Explicit regression audit only");
  test.setTimeout(1200_000);
  const looks=JSON.parse(readFileSync(join(root!,"looks.json"),"utf8")) as string[];
  const b64=readFileSync(join(root!,"input.png")).toString("base64");
  await page.goto("/?engine=v2");
  const data=await page.evaluate(async({b64,looks})=>{
    const m=await import("/src/lib/tryon.ts");
    if(m.engine()!=="gpu")throw Error("Actual GPU required");
    await m.downloadModels([...looks,"no-makeup"],()=>{});
    const shot=(await m.preparePhoto(await(await fetch("data:image/png;base64,"+b64)).blob())).plain;
    const capture=(c:HTMLCanvasElement)=>{
      const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
      t.getContext("2d")!.drawImage(c,0,0);return t.toDataURL("image/png").split(",")[1];
    };
    const outputs=[];
    for(const look of looks) outputs.push({look,image:capture(await m.paintLook(shot,look,"natural"))});
    return {engine:m.engine(),points:shot.points,bare:capture(shot.photo),outputs};
  },{b64,looks});
  expect(data.outputs).toHaveLength(looks.length);
  const out=join(root!,version!);mkdirSync(out,{recursive:true});
  writeFileSync(join(out,"bare.png"),Buffer.from(data.bare,"base64"));
  for(const row of data.outputs)writeFileSync(join(out,row.look+".png"),Buffer.from(row.image,"base64"));
  writeFileSync(join(out,"manifest.json"),JSON.stringify({engine:data.engine,points:data.points,looks}));
});
