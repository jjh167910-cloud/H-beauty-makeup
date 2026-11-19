import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "playwright/test";

/**
 * Phase 2 of the roadmap: every catalog look is a recipe of products (src/data/look-recipes.ts), the same object as her
 * own makeup («میکاپ من»), and ?engine=v2 paints it with the pigment engine (no catalog layer), lashes strand by strand.
 */

test("every catalog look is a recipe her own makeup can hold, step by step", async ({ page }) => {
  await page.goto("/");
  const report = await page.evaluate(async () => {
    const { MAKEUP_STYLES } = await import("/src/data/makeup-styles.ts");
    const { lookRecipe, recipeGaps } = await import("/src/data/look-recipes.ts");
    const { MY_STEPS, cleanRecipe, minePicks, recipeLines } = await import("/src/data/my-makeup.ts");
    const problems: string[] = [];
    // (the same recipe, whatever order its steps' fields are in)
    const canon = (r: object) => JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, step]) => [k, Object.entries(step as object).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))]));
    for (const style of MAKEUP_STYLES) {
      const recipe = lookRecipe(style.id)!;
      // (a recipe is her own makeup: saved and read back, it is the same; every choice is one of the step's own)
      const back = cleanRecipe(JSON.parse(JSON.stringify(recipe)));
      if (canon(back) !== canon(recipe)) problems.push(`${style.id}: not kept as it is (${canon(back)} / ${canon(recipe)})`);
      for (const def of MY_STEPS) {
        const step = recipe[def.key];
        if (!step) continue;
        if (step.amount < 0 || step.amount > 1.5) problems.push(`${style.id} ${def.key}: amount ${step.amount}`);
        if (step.shade && def.shades.length && !def.shades.some((s) => s.id === step.shade)) problems.push(`${style.id} ${def.key}: shade ${step.shade}`);
        if (step.place && !def.places?.some((p) => p.id === step.place)) problems.push(`${style.id} ${def.key}: place ${step.place}`);
        if (step.tool && !def.tools.some((t) => t.id === step.tool)) problems.push(`${style.id} ${def.key}: tool ${step.tool}`);
      }
      for (const key of ["base", "conceal", "brows", "lashes", "lips"] as const) if (!recipe[key]) problems.push(`${style.id}: no ${key}`);
      if (style.look.shadow !== "none" && recipe.shadow?.hex !== undefined && !/^#[0-9a-f]{6}$/i.test(recipe.shadow.hex)) problems.push(`${style.id}: shadow colour`);
      if (!minePicks(recipe)) problems.push(`${style.id}: nothing to paint`);
      if (recipeLines(recipe).length < 5) problems.push(`${style.id}: recipe text`);
      if (recipeGaps(style.look).some((a) => ["shimmer", "contour", "lowerLiner", "bottomLashes"].includes(a))) problems.push(`${style.id}: gaps`);
    }
    const hollywood = lookRecipe("hollywood")!;
    return { problems, count: MAKEUP_STYLES.length, hollywood, lines: recipeLines(hollywood) };
  });
  expect(report.problems).toEqual([]);
  expect(report.count).toBeGreaterThanOrEqual(40);
  // the Hollywood glam as an artist's steps: a winged liner, false lashes, a red matte lipstick (its own, from its photo)
  expect(report.hollywood.liner).toMatchObject({ place: "wing" });
  expect(report.hollywood.lashes).toMatchObject({ place: "dramatic" });
  expect(report.hollywood.lips).toMatchObject({ finish: "matte", from: "hollywood" });
  expect(report.hollywood.brows).toMatchObject({ shade: "own", place: "full" });
  expect(report.lines.join("\n")).toContain("خط چشم");
});

test("?engine=v2 paints a look as its recipe (kept for the tab, ?engine=v1 turns it off), lashes strand by strand", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/?engine=v2");
  const photo = readFileSync(join(process.cwd(), "tests/fixtures/lit-cheek.jpg")).toString("base64");   // (a synthetic face)
  const out = await page.evaluate(async (b64) => {
    const m = await import("/src/lib/tryon.ts");
    await m.downloadModels(["hollywood", "no-makeup"], () => {});
    const on = m.lookV2();
    history.replaceState(null, "", "/");
    const kept = m.lookV2();                                // (for this tab, after the address changes)
    const shot = (await m.preparePhoto(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob())).plain;
    const P = shot.points;
    // (the engine's own canvas is WebGL's: read through a 2D copy)
    const pixels = (c: HTMLCanvasElement) => {
      const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
      const g = t.getContext("2d")!; g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    // above her upper lash lines (her lashes), and on her lips
    const box = (ids: number[], up: number) => {
      const xs = ids.map((i) => P[i][0]), ys = ids.map((i) => P[i][1]);
      return [Math.min(...xs), Math.min(...ys) - up, Math.max(...xs), Math.max(...ys)];
    };
    const ew = Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1]);
    const lash = box([386, 387, 388, 385, 384], ew * 0.25), lips = box([13, 14, 78, 308], 0);
    const mean = (d: Uint8ClampedArray, w: number, [x0, y0, x1, y1]: number[]) => {
      let s = 0, n = 0;
      for (let y = Math.round(y0); y < y1; y++) for (let x = Math.round(x0); x < x1; x++) { const i = (y * w + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n += 3; }
      return s / n;
    };
    const w = shot.photo.width, bare = pixels(shot.photo);
    // (just above her upper lash line, from its middle out: its winged liner and lashes)
    const line = (d: Uint8ClampedArray) => {
      let s = 0, n = 0;
      for (const i of [386, 387, 388, 466]) {
        const x0 = Math.round(P[i][0]), y0 = Math.round(P[i][1] - ew * 0.03);
        for (let y = y0 - 1; y <= y0 + 1; y++) for (let x = x0 - 1; x <= x0 + 1; x++) { const k = (y * w + x) * 4; s += d[k] + d[k + 1] + d[k + 2]; n += 3; }
      }
      return s / n;
    };
    const v2 = await m.paintLook(shot, "hollywood", "natural");
    const two = pixels(v2);
    // the lashes alone, natural to false lashes: darker each time
    const lashes = [];
    for (const place of ["natural", "volume", "dramatic"]) {
      const c = await m.paintMine(shot, { gain: { lashes: 1 }, lashes: { place } });
      lashes.push(mean(pixels(c), w, lash));
    }
    history.replaceState(null, "", "/?engine=v1");
    const off = m.lookV2();
    history.replaceState(null, "", "/");
    const offKept = m.lookV2();
    const v1 = pixels(await m.paintLook(shot, "hollywood", "natural"));
    let diff = 0;
    for (let i = 0; i < two.length; i += 4) diff += Math.abs(two[i] - v1[i]);
    // (past her outer corner, where its wing is: her bare skin there)
    const ax = [(P[263][0] - P[362][0]) / ew, (P[263][1] - P[362][1]) / ew], lift = [ax[1], -ax[0]];
    const wx = P[263][0] + ew * (0.12 * ax[0] + 0.07 * lift[0]), wy = P[263][1] + ew * (0.12 * ax[1] + 0.07 * lift[1]);
    const wing = (d: Uint8ClampedArray) => mean(d, w, [wx - 1, wy - 1, wx + 2, wy + 2]);
    return { on, kept, off, offKept, bareLash: mean(bare, w, lash), bareLine: line(bare), line: line(two), bareWing: wing(bare), wing: wing(two), bareLips: mean(bare, w, lips), lips: mean(two, w, lips), lashes, diff };
  }, photo);
  expect([out.on, out.kept, out.off, out.offKept]).toEqual([true, true, false, false]);
  expect(out.diff).toBeGreaterThan(0);                      // (not the old engine's picture)
  expect(out.line).toBeLessThan(out.bareLine + 3);          // her own lash line never paler (its eyeshadow, liner, lashes)
  expect(out.wing).toBeLessThan(out.bareWing - 10);         // its winged liner
  expect(out.lips).not.toBeCloseTo(out.bareLips, 0);         // its red lipstick
  expect(out.lashes[0]).toBeLessThan(out.bareLash);
  expect(out.lashes[1]).toBeLessThan(out.lashes[0]);
  expect(out.lashes[2]).toBeLessThan(out.lashes[1]);
});
