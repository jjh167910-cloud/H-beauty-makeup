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
      if (recipeGaps(style.look).length) problems.push(`${style.id}: can't paint ${recipeGaps(style.look).join(", ")}`);
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
  // (its accents: freckles with its blush, aegyo-sal with its eyeshadow, rhinestones and kohl with its liner)
  const accents = await page.evaluate(async () => {
    const { lookRecipe } = await import("/src/data/look-recipes.ts");
    const { minePicks, recipeLines } = await import("/src/data/my-makeup.ts");
    const arabic = lookRecipe("arabic-glam")!;
    return { sun: lookRecipe("sun-kissed")!.blush, k: lookRecipe("k-beauty")!.shadow, stones: lookRecipe("rhinestone")!.liner,
      kohl: arabic.liner, kohlPick: minePicks(arabic)!.liner, kohlText: recipeLines(arabic).join("\n"), soft: lookRecipe("soft-glam")!.liner,
      under: lookRecipe("cut-crease")!.shadow, underPick: minePicks(lookRecipe("cut-crease")!)!.shadow, underText: recipeLines(lookRecipe("cut-crease")!).join("\n"),
      softUnder: lookRecipe("soft-glam")!.shadow, softLashes: lookRecipe("soft-glam")!.lashes, hollywoodUnder: lookRecipe("hollywood")!.shadow,
      cleanLashes: lookRecipe("clean-girl")!.lashes };
  });
  expect(accents.sun).toMatchObject({ freckles: true });
  expect(accents.k).toMatchObject({ aegyo: true });
  expect(accents.stones).toMatchObject({ stones: true });
  expect(accents.kohl).toMatchObject({ kohl: true });         // (the Arabic glam's catalog photo has kohl on its waterline)
  expect(accents.kohlPick?.kohl).toBeGreaterThan(0.5);
  expect(accents.kohlText).toContain("سرمه داخل چشم");
  expect(accents.soft?.kohl).toBeUndefined();                 // (a soft glam's has not)
  expect(accents.under).toMatchObject({ lower: true });       // (the cut crease's photo has its eyeshadow under its lower lashes too)
  expect(accents.underPick?.lower).toBe(true);
  expect(accents.underText).toContain("سایه زیر چشم هم");
  // (a soft glam's photo has a soft shadow under its lower lashes and mascara on them too, LOWER_MASCARA; the Hollywood
  // glam's neither, nor a clean girl's lashes)
  expect(accents.softUnder?.lower).toBe(true);
  expect(accents.softLashes?.lower).toBe(true);
  expect(accents.hollywoodUnder?.lower).toBeUndefined();
  expect(accents.cleanLashes?.lower).toBeUndefined();
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
    // (false lashes along her upper lash line, a quarter to 85% of the way out, `up` eye widths above it: the share of
    // points darkened to under 0.7 of her bare skin)
    const lid = [362, 398, 384, 385, 386, 387, 388, 466, 263].map((i) => P[i]);
    const seg = lid.slice(1).map((q, i) => Math.hypot(q[0] - lid[i][0], q[1] - lid[i][1])), tot = seg.reduce((a, c) => a + c, 0);
    const lum = (d: Uint8ClampedArray, x: number, y: number) => { const i = (Math.round(y) * w + Math.round(x)) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
    const darkened = (d: Uint8ClampedArray, up: number) => {
      let n = 0, k = 0;
      for (let x = 0.25; x <= 0.85; x += 0.5 / tot) {
        let s = x * tot, i = 0;
        while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
        const a = lid[i], b = lid[i + 1], f = s / seg[i], t = [(b[0] - a[0]) / seg[i], (b[1] - a[1]) / seg[i]];
        const nrm = t[0] >= 0 ? [t[1], -t[0]] : [-t[1], t[0]];             // (up, towards her brow)
        const px = a[0] + (b[0] - a[0]) * f + nrm[0] * up * ew, py = a[1] + (b[1] - a[1]) * f + nrm[1] * up * ew;
        n++; if (lum(d, px, py) < 0.7 * lum(bare, px, py)) k++;
      }
      return k / n;
    };
    let spikes: number[] = [];
    for (const place of ["natural", "volume", "dramatic"]) {
      const c = await m.paintMine(shot, { gain: { lashes: 1 }, lashes: { place } }), d = pixels(c);
      lashes.push(mean(d, w, lash));
      if (place === "dramatic") spikes = [darkened(d, 0.02), darkened(d, 0.1)];
    }
    history.replaceState(null, "", "/?engine=v1");
    const off = m.lookV2();
    history.replaceState(null, "", "/");
    const offKept = m.lookV2();
    const v1 = pixels(await m.paintLook(shot, "hollywood", "natural"));
    let diff = 0;
    for (let i = 0; i < two.length; i += 4) diff += Math.abs(two[i] - v1[i]);
    // (past her outer corner, where its wing is, carrying on her lower lash line out and a little up: her bare skin there)
    const ax = [(P[263][0] - P[362][0]) / ew, (P[263][1] - P[362][1]) / ew], lift = [ax[1], -ax[0]];
    const wx = P[263][0] + ew * (0.14 * ax[0] + 0.04 * lift[0]), wy = P[263][1] + ew * (0.14 * ax[1] + 0.04 * lift[1]);
    const wing = (d: Uint8ClampedArray) => mean(d, w, [wx - 1, wy - 1, wx + 2, wy + 2]);
    return { on, kept, off, offKept, bareLash: mean(bare, w, lash), bareLine: line(bare), line: line(two), bareWing: wing(bare), wing: wing(two), bareLips: mean(bare, w, lips), lips: mean(two, w, lips), lashes, spikes, diff };
  }, photo);
  expect([out.on, out.kept, out.off, out.offKept]).toEqual([true, true, false, false]);
  expect(out.diff).toBeGreaterThan(0);                      // (not the old engine's picture)
  expect(out.line).toBeLessThan(out.bareLine + 3);          // her own lash line never paler (its eyeshadow, liner, lashes)
  expect(out.wing).toBeLessThan(out.bareWing - 10);         // its winged liner
  expect(out.lips).not.toBeCloseTo(out.bareLips, 0);         // its red lipstick
  expect(out.lashes[0]).toBeLessThan(out.bareLash);
  expect(out.lashes[1]).toBeLessThan(out.lashes[0]);
  expect(out.lashes[2]).toBeLessThan(out.lashes[1]);
  // false lashes in clumps: dense where they grow, spikes with her lid between them higher up (not a comb or a brush)
  console.log("lash spikes", JSON.stringify(out.spikes));
  expect(out.spikes[0]).toBeGreaterThan(0.55);
  expect(out.spikes[1]).toBeLessThan(0.3);
});

test("a recipe's accents on her face: freckles dotted on her nose and cheeks, a lit aegyo-sal, rhinestones that sparkle, kohl on her waterline, eyeshadow under her lower lashes, a crease line, a glitter's own colour, a gradient lip, overlined lips, a lip liner, a thin brow", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  const photo = readFileSync(join(process.cwd(), "tests/fixtures/lit-cheek.jpg")).toString("base64");   // (a synthetic face)
  const out = await page.evaluate(async (b64) => {
    const m = await import("/src/lib/tryon.ts");
    await m.downloadModels(["no-makeup"], () => {});
    const shot = (await m.preparePhoto(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob())).plain;
    const P = shot.points, w = shot.photo.width;
    const pixels = (c: HTMLCanvasElement) => {
      const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
      const g = t.getContext("2d")!; g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    const ew = Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1]);
    const lum = (d: Uint8ClampedArray, x: number, y: number) => { const i = (Math.round(y) * w + Math.round(x)) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
    const each = (box: number[], f: (x: number, y: number) => void) => { for (let y = Math.round(box[1]); y < box[3]; y++) for (let x = Math.round(box[0]); x < box[2]; x++) f(x, y); };
    const around = (ids: number[], pad = 0) => {
      const xs = ids.map((i) => P[i][0]), ys = ids.map((i) => P[i][1]);
      return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    };
    // freckles: her blush step (none of the blush itself) with them and without: little darker dots on her cheek
    const zone = { place: "apples", soft: 0.17, size: 1.25 };
    const blush = { ...zone, hex: "#e3876f", finish: "matte" };
    const plain = pixels(await m.paintMine(shot, { gain: { blush: 0 }, blush }));
    const dotted = pixels(await m.paintMine(shot, { gain: { blush: 0 }, blush: { ...blush, freckles: 1 } }));
    let dots = 0, lighter = 0;
    each(around([350, 346, 280, 429]), (x, y) => { const d = lum(plain, x, y) - lum(dotted, x, y); if (d > 6) dots++; if (d < -2) lighter++; });
    // her blush where the catalog's photos have it (BLUSH_PLACE): the centre of its flush on her cheek (image right), out
    // from and down from her eye's centre (eye widths): the apples on the round of her cheek, high a little higher, further out
    const flush = async (place: string) => {
      const d = pixels(await m.paintMine(shot, { gain: { blush: 1 }, blush: { place, soft: 0.17, size: 1.25, hex: "#e8909f", finish: "matte" } }));
      const ids = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
      const c = ids.reduce((s, i) => [s[0] + P[i][0] / ids.length, s[1] + P[i][1] / ids.length], [0, 0]);
      const e = (Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1]) + Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1])) / 2;
      const L = Math.hypot(P[263][0] - P[33][0], P[263][1] - P[33][1]), ax = [(P[263][0] - P[33][0]) / L, (P[263][1] - P[33][1]) / L], dn = [-ax[1], ax[0]];
      let sw = 0, su = 0, sv = 0;
      each([c[0] - e * 0.5, c[1], c[0] + e * 1.6, c[1] + e * 2], (x, y) => {
        const i = (y * w + x) * 4, red = d[i] - d[i + 1] - (plain[i] - plain[i + 1]);
        const u = ((x - c[0]) * ax[0] + (y - c[1]) * ax[1]) / e, v = ((x - c[0]) * dn[0] + (y - c[1]) * dn[1]) / e;
        if (red > 2 && v > 0.2) { sw += red; su += red * u; sv += red * v; }
      });
      return [su / sw, sv / sw];
    };
    const apples = await flush("apples"), high = await flush("high");
    // her lipstick lit along her lips' own lines (LIP_STREAK): its brightest fiftieth further over its middle with a
    // gloss than a matte, and either way its colour on average as it was (the streaks' light taken from between them)
    const lipPx = (d: Uint8ClampedArray) => { const v: number[] = []; each(around([61, 291, 0, 17]), (x, y) => v.push(lum(d, x, y))); return v.sort((a, b) => a - b); };
    const lipShine = async (finish: string) => {
      const v = lipPx(pixels(await m.paintMine(shot, { gain: { lips: 1 }, lips: { hex: "#c06a72", finish } })));
      return [v[Math.floor(v.length * 0.98)] - v[Math.floor(v.length * 0.5)], v.reduce((a, b) => a + b, 0) / v.length];
    };
    const shine = { gloss: await lipShine("gloss"), satin: await lipShine("satin"), matte: await lipShine("matte") };
    // a gradient lip (LIP_GRADIENT): as red as the whole lip where her lips meet, much less so at her lip line; her lip
    // liner (LIP_LINER): her lips just inside her lip line darker, their middle and her skin just past it as they were
    const lipAt = (d: Uint8ClampedArray, a: number, b: number, t: number, out = 0) => {
      const n = Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]), x = P[a][0] + (P[b][0] - P[a][0]) * (t + out * ew / n), y = P[a][1] + (P[b][1] - P[a][1]) * (t + out * ew / n);
      let r = 0, l = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = (Math.round(y + dy) * w + Math.round(x + dx)) * 4; r += d[i] - d[i + 1]; l += (d[i] + d[i + 1] + d[i + 2]) / 3; }
      return [r / 9, l / 9];
    };
    const red = { hex: "#b3122e", finish: "matte" };
    const wholeLip = pixels(await m.paintMine(shot, { gain: { lips: 1 }, lips: red }));
    const gradLip = pixels(await m.paintMine(shot, { gain: { lips: 1 }, lips: { ...red, place: "gradient" } }));
    const redder = (d: Uint8ClampedArray, t: number) => (lipAt(d, 14, 17, t)[0] + lipAt(d, 13, 0, t)[0]) / 2 - (lipAt(plain, 14, 17, t)[0] + lipAt(plain, 13, 0, t)[0]) / 2;
    const gradient = { meet: [redder(wholeLip, 0.15), redder(gradLip, 0.15)], line: [redder(wholeLip, 0.88), redder(gradLip, 0.88)] };
    // overlined (LIP_OVER): her skin just past her lip line at her lips' middle red too, at her mouth's corners as it was
    const overLip = pixels(await m.paintMine(shot, { gain: { lips: 1 }, lips: { ...red, place: "overline" } }));
    const past = (d: Uint8ClampedArray, pairs: number[][]) => pairs.reduce((s, [a, b]) => s + lipAt(d, a, b, 1, 0.03)[0], 0) / pairs.length;
    const overline = { middle: [past(wholeLip, [[13, 0], [14, 17]]), past(overLip, [[13, 0], [14, 17]])],
      corners: [past(wholeLip, [[78, 61], [308, 291]]), past(overLip, [[78, 61], [308, 291]])] };
    const nude = { hex: "#c99582", finish: "satin" };
    const bare = pixels(await m.paintMine(shot, { gain: { lips: 1 }, lips: nude }));
    const pencil = pixels(await m.paintMine(shot, { gain: { lips: 1 }, lips: { ...nude, liner: "#6a3f33" } }));
    const lipLine = (d: Uint8ClampedArray, t: number, out = 0) => (lipAt(d, 14, 17, t, out)[1] + lipAt(d, 13, 0, t, out)[1]) / 2;
    const lipLiner = { line: [lipLine(bare, 0.9), lipLine(pencil, 0.9)], middle: [lipLine(bare, 0.45), lipLine(pencil, 0.45)],
      skin: [lipLine(bare, 1, 0.07), lipLine(pencil, 1, 0.07)] };
    // a thin brow (BROW_THIN, BROW_BLOCK): her own brow blocked out (its lower part near her skin's light), a thin arched
    // line drawn high in it; her forehead above it as it was
    const brow = { place: "natural", soft: 0.012, size: 1, hex: "#4c3328", thick: 0.02 };
    const natural = pixels(await m.paintMine(shot, { gain: { brows: 1 }, brows: brow }));
    const thinBrow = pixels(await m.paintMine(shot, { gain: { brows: 1 }, brows: { ...brow, place: "thin" } }));
    const browAt = (d: Uint8ClampedArray, t: number, out = 0) =>      // (her brow's middle points: lower 282, 295; upper 334, 296)
      [[334, 282], [296, 295]].reduce((s, [a, b]) => {
        const n = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]), k = t + (out * ew) / n;
        let l = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) l += lum(d, P[b][0] + (P[a][0] - P[b][0]) * k + dx, P[b][1] + (P[a][1] - P[b][1]) * k + dy);
        return s + l / 18;
      }, 0);
    const thin = { low: [browAt(natural, 0.2), browAt(thinBrow, 0.2)], line: [browAt(natural, 0.8), browAt(thinBrow, 0.8)],
      forehead: [browAt(natural, 1, 0.12), browAt(thinBrow, 1, 0.12)] };
    // aegyo-sal: her eyeshadow with it and without: the narrow band under her lower lashes lighter, her lid the same
    const shadow = { hex: "#e0a497", finish: "shimmer", place: "wash", pack: 1 };
    const lid = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow }));
    const lit = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow: { ...shadow, aegyo: "#f4ece6" } }));
    const down = [-(P[263][1] - P[362][1]) / ew, (P[263][0] - P[362][0]) / ew];
    const band = (d: Uint8ClampedArray) => [374, 380, 373].reduce((s, i) => s + lum(d, P[i][0] + down[0] * ew * 0.075, P[i][1] + down[1] * ew * 0.075), 0) / 3;
    const upper = (d: Uint8ClampedArray) => [386, 387, 385].reduce((s, i) => s + lum(d, P[i][0] - down[0] * ew * 0.12, P[i][1] - down[1] * ew * 0.12), 0) / 3;
    // rhinestones: her liner with them and without: bright crystals past her outer corner
    const liner = { hex: "#141113", place: "wing", lower: false, soft: 0.004, opacity: 0.95 };
    const lined = pixels(await m.paintMine(shot, { gain: { liner: 1 }, liner }));
    const stones = pixels(await m.paintMine(shot, { gain: { liner: 1 }, liner: { ...liner, stones: 1 } }));
    let brightest = 0, before = 0;
    each([P[263][0] + ew * 0.02, P[263][1] - ew * 0.4, P[263][0] + ew * 0.45, P[263][1] + ew * 0.05], (x, y) => {   // (past her outer corner)
      brightest = Math.max(brightest, lum(stones, x, y)); before = Math.max(before, lum(lined, x, y));
    });
    // kohl: her liner with it and without: the rim inside her lower lashes, either side of her iris, darker; the white
    // of her eye, her iris and the skin under her lashes as they were
    const kohl = pixels(await m.paintMine(shot, { gain: { liner: 1 }, liner: { ...liner, kohl: 0.8 } }));
    const up = [-down[0], -down[1]];
    const at = (d: Uint8ClampedArray, i: number, k: number) => {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum(d, P[i][0] + up[0] * ew * k + dx, P[i][1] + up[1] * ew * k + dy);
      return s / 9;
    };
    const rim = (d: Uint8ClampedArray) => [381, 382, 390, 249].reduce((s, i) => s + at(d, i, 0.012), 0) / 4;
    const underIris = (d: Uint8ClampedArray) => [374, 380].reduce((s, i) => s + at(d, i, 0.004), 0) / 2;   // (the rim in front of her iris)
    const white = (d: Uint8ClampedArray) =>     // (from her iris's centre 0.6 of the way to each corner of her eye)
      [362, 263].reduce((s, c) => s + lum(d, P[473][0] + (P[c][0] - P[473][0]) * 0.6, P[473][1] + (P[c][1] - P[473][1]) * 0.6), 0) / 2;
    const iris = (d: Uint8ClampedArray) => lum(d, P[473][0], P[473][1] + down[1] * ew * 0.05);
    const below = (d: Uint8ClampedArray) => [380, 374, 373].reduce((s, i) => s + at(d, i, -0.06), 0) / 3;
    // her eyeshadow under her lower lashes too: the band under the outer half of her lower lashes deeper, her lid as it was
    // (a deep brown: on this face the skin under her outer lower lashes is in shadow, darker than a mid-brown powder)
    const brown = { hex: "#3a2219", finish: "matte", place: "crease", pack: 1 };
    const crease = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow: brown }));
    const smudged = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow: { ...brown, lower: true } }));
    const under = (d: Uint8ClampedArray) => [249, 390, 373].reduce((s, i) => s + at(d, i, -0.06) + at(d, i, -0.09), 0) / 6;
    // a smoky eye (over its catalog map): its own band under her lower lashes too, packed on, all along them
    const smoky = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow: { ...brown, place: "smoky" } }));
    const underAll = (d: Uint8ClampedArray) => [380, 374, 373, 390].reduce((s, i) => s + at(d, i, -0.04) + at(d, i, -0.07), 0) / 8;
    // a graphic crease line with her liner: along her crease (her ring's middle points), darker; her lash line as it was
    const creased = pixels(await m.paintMine(shot, { gain: { liner: 1 }, liner: { ...liner, crease: true } }));
    const ring = (d: Uint8ClampedArray) => {      // (the darkest of a short column across the arc, either side of her crease)
      let s = 0;
      for (const i of [443, 444]) { let lo = 255; for (let k = -0.06; k <= 0.06; k += 0.01) lo = Math.min(lo, lum(d, P[i][0] + up[0] * ew * k, P[i][1] + up[1] * ew * k)); s += lo; }
      return s / 2;
    };
    // a glitter eyeshadow with a gold topper and a silver one: its grains warmer with the gold
    const glitter = { hex: "#8e5a7a", finish: "glitter", place: "wash", pack: 1 };
    const warmth = (d: Uint8ClampedArray) => { let r = 0, b = 0; for (const i of [385, 386, 387]) for (let k = 0.04; k <= 0.14; k += 0.01) for (let dx = -6; dx <= 6; dx++) {
      const j = (Math.round(P[i][1] - ew * k) * w + Math.round(P[i][0] + dx)) * 4; if (d[j] + d[j + 1] + d[j + 2] > 3 * 150) { r += d[j]; b += d[j + 2]; } } return r - b; };
    const gold = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow: { ...glitter, glitter: "#ffe1b4" } }));
    const silver = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow: { ...glitter, glitter: "#f4f4f6" } }));
    return { dots, lighter, apples, high, shine, gradient, overline, lipLiner, thin, band: [band(lid), band(lit)], upper: [upper(lid), upper(lit)], brightest, before,
      under: [under(crease), under(smudged)], lid: [upper(crease), upper(smudged)], smoky: [underAll(crease), underAll(smoky)],
      creaseLine: [ring(lined), ring(creased)], lashLine: [rim(lined), rim(creased)], warmth: [warmth(silver), warmth(gold)],
      rim: [rim(lined), rim(kohl)], rimIris: [underIris(lined), underIris(kohl)], white: [white(lined), white(kohl)], iris: [iris(lined), iris(kohl)], below: [below(lined), below(kohl)] };
  }, photo);
  console.log("kohl", JSON.stringify({ rim: out.rim, rimIris: out.rimIris, white: out.white, iris: out.iris, below: out.below }));
  console.log("blush", JSON.stringify({ apples: out.apples, high: out.high }), "lips", JSON.stringify(out.shine));
  expect(out.apples[0]).toBeGreaterThan(0.35);                 // her apples blush on the round of her cheek, not by her nose
  expect(out.apples[1]).toBeGreaterThan(0.95);                 // (nor up on her under-eye)
  expect(out.high[1]).toBeLessThan(out.apples[1]);             // high: higher,
  expect(out.high[0]).toBeGreaterThan(out.apples[0]);          // further out
  expect(out.shine.satin[0]).toBeGreaterThan(out.shine.matte[0] + 10);    // a satin lipstick lit along her lips' lines
  expect(Math.abs(out.shine.satin[1] - out.shine.matte[1])).toBeLessThan(4);  // (its colour on average much as a matte's)
  console.log("gradient, lip liner", JSON.stringify({ gradient: out.gradient, lipLiner: out.lipLiner }));
  expect(out.gradient.meet[1]).toBeGreaterThan(out.gradient.meet[0] * 0.8);   // a gradient lip: red where her lips meet,
  expect(out.gradient.line[1]).toBeLessThan(out.gradient.line[0] * 0.5);      // fading out to her lip line
  console.log("overline", JSON.stringify(out.overline));
  expect(out.overline.middle[1]).toBeGreaterThan(out.overline.middle[0] + 15);   // overlined: past her lip line at its middle,
  expect(Math.abs(out.overline.corners[1] - out.overline.corners[0])).toBeLessThan(3);   // (not at her mouth's corners)
  expect(out.lipLiner.line[1]).toBeLessThan(out.lipLiner.line[0] - 8);       // her lip liner along her lip line,
  expect(Math.abs(out.lipLiner.middle[1] - out.lipLiner.middle[0])).toBeLessThan(2);   // (not in her lips' middle,
  expect(out.lipLiner.skin[1]).toBeGreaterThan(out.lipLiner.skin[0] - 1.5);   // nor past it on her skin: a crisp edge)
  console.log("thin brow", JSON.stringify(out.thin));
  expect(out.thin.low[1]).toBeGreaterThan(out.thin.low[0] + 15);              // a thin brow: her own brow blocked out,
  expect(out.thin.line[1]).toBeLessThan(out.thin.low[1] - 15);                 // a line drawn high in it
  expect(Math.abs(out.thin.forehead[1] - out.thin.forehead[0])).toBeLessThan(3);   // (her forehead as it was, near enough)
  expect(out.dots).toBeGreaterThan(15);                       // dotted on
  expect(out.lighter).toBe(0);                               // (and nothing else on her cheek)
  expect(out.band[1]).toBeGreaterThan(out.band[0] + 2);      // her aegyo-sal lit
  expect(Math.abs(out.upper[1] - out.upper[0])).toBeLessThan(1.5);   // her lid as it was
  expect(out.brightest).toBeGreaterThan(Math.min(250, out.before + 25));   // a crystal catching her light
  expect(out.rim[1]).toBeLessThan(out.rim[0] * 0.75);                     // kohl on her waterline
  expect(out.rimIris[1]).toBeLessThan(out.rimIris[0] * 0.8);             // (on under her iris too: the rim runs on in front of it)
  expect(Math.abs(out.white[1] - out.white[0])).toBeLessThan(1.5);        // (not on the white of her eye,
  expect(Math.abs(out.iris[1] - out.iris[0])).toBeLessThan(1.5);          // nor her iris,
  expect(Math.abs(out.below[1] - out.below[0])).toBeLessThan(1.5);        // nor her skin under her lashes)
  console.log("under", JSON.stringify({ under: out.under, lid: out.lid, smoky: out.smoky }));
  expect(out.under[1]).toBeLessThan(out.under[0] - 4);                    // her eyeshadow under her lower lashes
  expect(Math.abs(out.lid[1] - out.lid[0])).toBeLessThan(1.5);            // (her lid as it was)
  expect(out.smoky[1]).toBeLessThan(out.smoky[0] - 15);                  // a smoky eye's band under her lower lashes
  console.log("crease, glitter", JSON.stringify({ creaseLine: out.creaseLine, lashLine: out.lashLine, warmth: out.warmth }));
  expect(out.creaseLine[1]).toBeLessThan(out.creaseLine[0] - 12);         // a graphic line along her crease
  expect(Math.abs(out.lashLine[1] - out.lashLine[0])).toBeLessThan(1.5);  // (her waterline as it was)
  expect(out.warmth[1]).toBeGreaterThan(out.warmth[0]);                   // a gold glitter warmer than a silver one
});

test("one recipe link opens either: her own makeup or a look's recipe, in «میکاپ من» on whoever opens it (never a photo)", async ({ page }) => {
  await page.goto("/");
  const links = await page.evaluate(async () => {
    const { lookRecipe } = await import("/src/data/look-recipes.ts");
    const { cleanRecipe, recipeFromLink, recipeLink } = await import("/src/data/my-makeup.ts");
    const look = lookRecipe("rhinestone")!, mine = { lips: { shade: "classic-red", amount: 1 }, blush: { shade: "berry", amount: 0.8, freckles: true } };
    const back = (r: object) => recipeFromLink(new URL(recipeLink(r as never)).search);
    return {
      look: JSON.stringify(back(look)) === JSON.stringify(cleanRecipe(look)), mine: JSON.stringify(back(mine)) === JSON.stringify(cleanRecipe(mine)),
      link: recipeLink(look), junk: [recipeFromLink("?mine=%%%"), recipeFromLink("?mine=e30"), recipeFromLink("?look=hollywood")],
    };
  });
  expect(links.look).toBe(true);
  expect(links.mine).toBe(true);
  expect(links.link).toMatch(/\/\?mine=[A-Za-z0-9_-]+$/);
  expect(links.link.length).toBeLessThan(2000);
  expect(links.junk).toEqual([null, null, null]);              // (not a recipe, an empty one, no recipe)
  // opened: it is her makeup from here (her draft), and the address no longer reopens it
  await page.goto(links.link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.getByText("امتحان میکاپ روی چهره خودتان")).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.search)).toBe("");
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("hb-my-makeup-draft-v1") ?? "{}"));
  expect(draft.liner).toMatchObject({ stones: true });
  expect(Object.keys(draft).length).toBeGreaterThanOrEqual(8);
});

test("?engine=v2 draws her eyeshadow's placement from her own eye: her lid for a wash, her crease for a crease", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/?engine=v2");
  const photo = readFileSync(join(process.cwd(), "tests/fixtures/lit-cheek.jpg")).toString("base64");   // (a synthetic face)
  const out = await page.evaluate(async (b64) => {
    const m = await import("/src/lib/tryon.ts");
    await m.downloadModels(["no-makeup"], () => {});
    const shot = (await m.preparePhoto(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob())).plain;
    const P = shot.points, w = shot.photo.width;
    const pixels = (c: HTMLCanvasElement) => {
      const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
      const g = t.getContext("2d")!; g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    const lum = (d: Uint8ClampedArray, [x, y]: number[]) => {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = ((Math.round(y) + j) * w + Math.round(x) + i) * 4; s += d[k] + d[k + 1] + d[k + 2]; }
      return s / 27;
    };
    // (both eyes: the middle of her lid, a third of the way from her lashes to her crease; and her crease)
    const spots = [[386, 443], [159, 223]].map(([lash, crease]) => ({
      lid: [P[lash][0] + (P[crease][0] - P[lash][0]) * 0.35, P[lash][1] + (P[crease][1] - P[lash][1]) * 0.35], crease: [P[crease][0], P[crease][1]],
    }));
    const bare = pixels(shot.photo);
    const darker = async (place: string) => {
      const d = pixels(await m.paintMine(shot, { gain: { shadow: 1 }, shadow: { hex: "#4a2c22", finish: "matte", place, pack: 1 } }));
      const at = (k: "lid" | "crease") => spots.reduce((s, x) => s + lum(bare, x[k]) - lum(d, x[k]), 0) / spots.length;
      return { lid: at("lid"), crease: at("crease") };
    };
    return { wash: await darker("wash"), crease: await darker("crease") };
  }, photo);
  expect(out.wash.lid).toBeGreaterThan(8);                       // a wash: all over her lid, up to her crease
  expect(out.wash.lid).toBeGreaterThan(out.crease.lid + 8);       // (far more on her lid than a crease placement puts there)
  expect(out.crease.crease).toBeGreaterThan(out.crease.lid + 10); // a crease: deepest in her own crease
  expect(out.crease.crease / out.crease.lid).toBeGreaterThan(1.5 * out.wash.crease / out.wash.lid);
});


test("under-eye chroma pilot preserves deliberate foundation tint and protected areas", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/?engine=v2");
  const photo = readFileSync(join(process.cwd(),"tests/fixtures/lit-cheek.jpg")).toString("base64");
  const out = await page.evaluate(async b64 => {
    const m=await import("/src/lib/tryon.ts");
    await m.downloadModels(["no-makeup"],()=>{});
    const shot=(await m.preparePhoto(await (await fetch("data:image/jpeg;base64,"+b64)).blob())).plain;
    const pixels=(c:HTMLCanvasElement)=>{
      const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
      const g=t.getContext("2d")!;g.drawImage(c,0,0);return g.getImageData(0,0,t.width,t.height);
    };
    const render=async (tint:number[],pilot:boolean)=>{
      history.replaceState(null,"",pilot?"/?engine=v2&underChromaPilot=1":"/?engine=v2");
      return pixels(await m.paintMine(shot,{gain:{base:1},base:{tint,finish:0}}));
    };
    const source=pixels(shot.photo);
    const a=await render([1,1,1],false),b=await render([1,1,1],true);
    const c=await render([1.06,1,0.94],false),d=await render([1.06,1,0.94],true);
    const P=shot.points,ew=(Math.hypot(P[33][0]-P[133][0],P[33][1]-P[133][1])+Math.hypot(P[263][0]-P[362][0],P[263][1]-P[362][1]))/2;
    const dx=P[263][0]-P[33][0],dy=P[263][1]-P[33][1],n=Math.hypot(dx,dy);
    let down=[-dy/n,dx/n];if(down[0]*(P[152][0]-P[10][0])+down[1]*(P[152][1]-P[10][1])<0)down=down.map(x=>-x);
    const deepest=(ids:number[])=>ids.map(i=>P[i]).reduce((a,b)=>a[0]*down[0]+a[1]*down[1]>b[0]*down[0]+b[1]*down[1]?a:b);
    const centres=[deepest([145,153,144]),deepest([374,380,373])];
    let changed=0,exterior=0,maxOutside=0,tintChanges=0,maxLuma=0;
    let referenceErrorBefore=0,referenceErrorAfter=0,chromaLossBefore=0,chromaLossAfter=0,improved=0,regressed=0;
    const lin=(v:number)=>(v/255)**2.2;
    const lum=(d:Uint8ClampedArray,i:number)=>.2126*lin(d[i])+.7152*lin(d[i+1])+.0722*lin(d[i+2]);
    const chroma=(d:Uint8ClampedArray,i:number)=>{const y=Math.max(1e-6,lum(d,i));return [0,1,2].map(j=>lin(d[i+j])/y-1);};
    for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
      const i=4*(y*a.width+x);
      if([0,1,2].some(j=>c.data[i+j]!==d.data[i+j]))tintChanges++;
      const delta=Math.max(...[0,1,2].map(j=>Math.abs(a.data[i+j]-b.data[i+j])));
      if(!delta)continue;
      changed++;maxLuma=Math.max(maxLuma,Math.abs(lum(a.data,i)-lum(b.data,i)));
      const orig=chroma(source.data,i),old=chroma(a.data,i),next=chroma(b.data,i);
      const e0=Math.hypot(...orig.map((v,j)=>v-old[j])),e1=Math.hypot(...orig.map((v,j)=>v-next[j]));
      referenceErrorBefore+=e0;referenceErrorAfter+=e1;
      chromaLossBefore+=Math.max(0,Math.hypot(...orig)-Math.hypot(...old));
      chromaLossAfter+=Math.max(0,Math.hypot(...orig)-Math.hypot(...next));
      if(e1<e0)improved++;else if(e1>e0)regressed++;
      const inside=centres.some(p=>{
        const xx=(x+.5-p[0])/ew,yy=(y+.5-p[1])/ew;
        const v=xx*down[0]+yy*down[1],u=Math.abs(xx*down[1]-yy*down[0]);
        return v>=.12&&v<=.64&&u<=.62;
      });
      if(!inside){exterior++;maxOutside=Math.max(maxOutside,delta);}
    }
    const n=Math.max(changed,1);
    return {changed,exterior,maxOutside,tintChanges,maxLuma,improved,regressed,
      meanReferenceErrorBefore:referenceErrorBefore/n,meanReferenceErrorAfter:referenceErrorAfter/n,
      meanChromaLossBefore:chromaLossBefore/n,meanChromaLossAfter:chromaLossAfter/n};
  },photo);
  console.log("UNDER_CHROMA_PUBLIC_GPU_AB",JSON.stringify(out));
  expect(out.maxOutside).toBe(0);
  expect(out.tintChanges).toBe(0);
  // 8-bit conversion may perturb linear luminance even at constant shader Y.
  expect(out.maxLuma).toBeLessThanOrEqual(.012);
  // Local source chroma is a mechanistic target for neutral foundation, not
  // a substitute for a real made-up reference. Require activation on this
  // known public fixture, then quantify recovery among changed pixels.
  expect(out.changed).toBeGreaterThan(100);
  expect(out.meanReferenceErrorAfter).toBeLessThan(out.meanReferenceErrorBefore);
  expect(out.meanChromaLossAfter).toBeLessThan(out.meanChromaLossBefore);
  // Actual medium/deep skin efficacy still requires the private benchmark.
});
