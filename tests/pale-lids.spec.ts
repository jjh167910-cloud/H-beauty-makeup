import { test, expect } from "playwright/test";

// Catalog-only pale-lid diagnostic. No private photos enter CI.
// Measures the actual WebGL catalog engine against public look photographs.
// The three named eyeshadow looks were identified in the systematic plan.
// Descriptive metric, not an artist certification.
test("public catalog pale-lid reference brightness: icy / mod-60s / cut-crease", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?engine=v1");
  const report = await page.evaluate(async () => {
    const m = await import("/src/lib/tryon.ts");
    const styles = ["icy", "mod-60s", "cut-crease"];
    await m.downloadModels(styles, () => {});
    const img = new Image();
    img.src = "/makeup/looks/no-makeup.webp"; await img.decode();
    const input = await fetch(img.src).then(r => r.blob());
    const shot = (await m.preparePhoto(input)).plain;
    const w = shot.photo.width, h = shot.photo.height, P = shot.points;
    const pixels = (source: CanvasImageSource) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(source, 0, 0, w, h);
      return g.getImageData(0, 0, w, h).data;
    };
    const originalCatalog = pixels(img);
    const before = pixels(shot.photo);
    const lin = (v: number) => { const t = v / 255; return t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4; };
    const Y = (d: Uint8ClampedArray, x: number, y: number, gain = [1, 1, 1]) => {
      const i = (Math.min(h - 1, Math.max(0, Math.round(y))) * w
        + Math.min(w - 1, Math.max(0, Math.round(x)))) * 4;
      const z = 0.2126 * lin(d[i]) / gain[0] + 0.7152 * lin(d[i + 1]) / gain[1] + 0.0722 * lin(d[i + 2]) / gain[2];
      const corrected = Math.min(1, Math.max(0, z));
      return corrected > 0.008856 ? 116 * Math.cbrt(corrected) - 16 : 903.296 * corrected;
    };
    // Undo whole-photograph exposure/white-balance changes in the AI-edited
    // catalog reference. The benchmark scorer does the same on the backdrop.
    // Only bright, approximately neutral pixels in the top outer corners qualify.
    const grade = (bare: Uint8ClampedArray, target: Uint8ClampedArray) => {
      const logRatios: number[][] = [[], [], []];
      for (let y = Math.round(h * 0.04); y < h * 0.20; y += 6)
        for (let x = 0; x < w; x += 6) {
          if (x >= w * 0.19 && x <= w * 0.81) continue;
          const k = (y * w + x) * 4;
          const b = [lin(bare[k]), lin(bare[k + 1]), lin(bare[k + 2])];
          const a = [lin(target[k]), lin(target[k + 1]), lin(target[k + 2])];
          const spread = Math.max(...b) - Math.min(...b);
          if (Math.min(...b) < 0.40 || spread > 0.10) continue;
          for (let c = 0; c < 3; c++) logRatios[c].push(Math.log((a[c] + 0.005) / (b[c] + 0.005)));
        }
      if (logRatios.some(v => v.length < 20)) return null;
      return logRatios.map(v => {
        v.sort((a, b) => a - b);
        return Math.exp(v[Math.floor(v.length / 2)]);
      });
    };
    const upper = [
      [33, 246, 161, 160, 159, 158, 157, 173, 133],
      [263, 466, 388, 387, 386, 385, 384, 398, 362],
    ];
    const brow = [
      [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
      [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    ];
    const locations: [number, number][] = [];
    for (let eye = 0; eye < 2; eye++) {
      const upperPoints = upper[eye].map(i => P[i]).sort((a,b) => a[0] - b[0]);
      const browPoints = brow[eye].map(i => P[i]).sort((a,b) => a[0] - b[0]);
      const xMin = upperPoints[0][0], xMax = upperPoints.at(-1)![0];
      const interp = (line: number[][], x: number) => {
        for (let i = 1; i < line.length; i++) if (x <= line[i][0]) {
          const a = line[i - 1], b = line[i];
          return a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1e-3, b[0] - a[0]);
        }
        return line.at(-1)![1];
      };
      for (const frac of [0.27, 0.36, 0.45, 0.54, 0.63, 0.72]) {
        const x = xMin + (xMax - xMin) * frac;
        const lash = interp(upperPoints, x), bone = interp(browPoints, x);
        for (const t of [0.28, 0.40, 0.52]) locations.push([x, lash + (bone - lash) * t]);
      }
    }
    const mean = (d: Uint8ClampedArray, gain?: number[]) =>
      locations.reduce((sum, [x,y]) => sum + Y(d,x,y,gain), 0) / locations.length;
    const reference = async (id: string) => {
      const image = new Image(); image.src = `/makeup/looks/${id}.webp`;
      await image.decode(); return pixels(image);
    };
    const output = [];
    for (const look of styles) {
      const target = await reference(look);
      const estimatedGrade = grade(originalCatalog, target);
      // When too little neutral backdrop is visible, do not invent correction.
      // The Python reference-stage diagnostic prints teacher.grading() separately.
      const gain = estimatedGrade ?? [1, 1, 1];
      const render = pixels(await m.paintLook(shot, look, "natural"));
      const bare = mean(before), expected = mean(target, gain), actual = mean(render);
      output.push({ look, bare, expected, actual, rawReference: mean(target),
        calibrated: Boolean(estimatedGrade), grade: gain.map(v => Number(v.toFixed(4))), targetLift: expected - bare,
        renderedLift: actual - bare, residual: expected - actual, points: locations.length });
    }
    return output;
  });
  console.log("PALE_LID_CATALOG_DIAGNOSTIC", JSON.stringify(report));
  expect(report.map(x => x.look)).toEqual(["icy", "mod-60s", "cut-crease"]);
  for (const metric of report) {
    expect(metric.points).toBe(36);
    for (const key of ["bare", "expected", "actual", "rawReference", "targetLift", "renderedLift", "residual"] as const)
      expect(Number.isFinite(metric[key]), `${metric.look} ${key}`).toBe(true);
  }
});
