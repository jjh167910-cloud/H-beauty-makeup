import { test, expect } from "playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.HB_BLUSH_CALIBRATION_DIR;
test("render paired blush strength sweep on public catalog face", async ({ page }) => {
  test.skip(!dir, "Explicit public calibration run only");
  test.setTimeout(600_000);
  mkdirSync(dir!, {recursive:true});
  await page.goto("/?engine=v2");
  const results = await page.evaluate(async () => {
    const m = await import("/src/lib/tryon.ts");
    const { lookRecipe } = await import("/src/data/look-recipes.ts");
    const { minePicks } = await import("/src/data/my-makeup.ts");
    if (m.engine() !== "gpu") throw new Error("WebGL2 required; no fallback calibration");
    await m.downloadModels(["no-makeup"], () => {});
    const response = await fetch("/makeup/looks/no-makeup.webp");
    if (!response.ok) throw new Error("Missing public bare photo");
    const shot = (await m.preparePhoto(await response.blob())).plain;
    const capture = (c: HTMLCanvasElement) => {
      const t = document.createElement("canvas"); t.width=c.width; t.height=c.height;
      t.getContext("2d")!.drawImage(c,0,0); return t.toDataURL("image/png").split(",")[1];
    };
    const rows = [];
    for (const id of ["pin-up","golden-hour"]) {
      const recipe = lookRecipe(id)!;
      if (!recipe.blush) throw new Error("Missing blush recipe");
      const base = recipe.blush.amount;
      for (const amount of [base, ...[1.15,1.30,1.45].map(k=>Math.min(1.3,Math.round(base*k*1000)/1000))].filter((v,i,a)=>a.indexOf(v)===i)) {
        const next = {...recipe,blush:{...recipe.blush,amount}};
        const picks = minePicks(next)!;
        const canvas = await m.paintMine(shot,picks);
        rows.push({id,amount,base,image:capture(canvas)});
      }
    }
    return {bare:capture(shot.photo),points:shot.points,rows};
  });
  expect(results.rows.length).toBeGreaterThanOrEqual(6);
  writeFileSync(join(dir!,"bare.png"),Buffer.from(results.bare,"base64"));
  const rows=results.rows.map(({image,...row},i)=>{
    const file = row.id+"-"+i+".png";
    writeFileSync(join(dir!,file),Buffer.from(image,"base64"));
    return {...row,file};
  });
  writeFileSync(join(dir!,"manifest.json"),JSON.stringify({points:results.points,rows},null,2));
});
