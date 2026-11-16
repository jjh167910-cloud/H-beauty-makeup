import { test, expect } from "playwright/test";

test("isolated WebGL2 eye-material kernel changes only authorized pixels", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const available = !!document.createElement("canvas").getContext("webgl2");
    if (!available) return { available: false };
    const { compositeEyeGPU } = await import("/src/lib/material-eye-gpu.ts");
    const width = 5, height = 3;
    const input = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++)
      input.set([80 + i, 120 + i, 145 + i, 255], i * 4);
    const previous = input.slice(), ink = new Uint8ClampedArray(input.length);
    const weights = new Uint8ClampedArray(input.length);
    // Only eye pixels 6 and 8 receive new pigment, center 7 gets opaque liner.
    weights.set([200, 80, 255, 0], 6 * 4);
    weights.set([0, 0, 0, 255], 7 * 4);
    weights.set([200, 160, 255, 0], 8 * 4);
    ink.set([10, 15, 25, 255], 7 * 4);
    const shaded = compositeEyeGPU({
      width, height, original: input, previous, ink, weights,
      pigmentA: [0.1, 0.04, 0.12], pigmentB: [0.30, 0.03, 0.50],
      referenceLight: 0.22,
    });
    if (!shaded) return { available: true, kernelUnavailable: true };
    const touched = [6, 7, 8];
    let protectedChanges = 0, clipped = 0;
    for (let i = 0; i < width * height; i++) {
      for (let channel = 0; channel < 4; channel++) {
        const a = shaded[i * 4 + channel], b = previous[i * 4 + channel];
        if (!touched.includes(i) && a !== b) protectedChanges++;
        if (touched.includes(i) && channel < 3 && (a === 0 || a === 255)) clipped++;
      }
    }
    const bad = compositeEyeGPU({
      width, height: height + 1, original: input, previous, ink, weights,
      pigmentA: [0.1, 0.04, 0.12], pigmentB: [0.30, 0.03, 0.50],
      referenceLight: 0.22,
    });
    return {
      available: true, kernelUnavailable: false, protectedChanges, clipped,
      changed6: shaded[6 * 4] !== previous[6 * 4],
      changed7: shaded[7 * 4] !== previous[7 * 4],
      changed8: shaded[8 * 4] !== previous[8 * 4],
      alphaStable: shaded.every((b, i) => i % 4 !== 3 || b === 255),
      failedClosed: bad === null,
    };
  });
  test.skip(!result.available, "Chromium runner has no WebGL2 context; typecheck still runs");
  expect(result.kernelUnavailable).toBe(false);
  expect(result.protectedChanges).toBe(0);
  expect(result.clipped).toBe(0);
  expect(result.changed6).toBe(true);
  expect(result.changed7).toBe(true);
  expect(result.changed8).toBe(true);
  expect(result.alphaStable).toBe(true);
  expect(result.failedClosed).toBe(true);
});


test("no-readback GPU canvas matches pixel-return mode, with byte-exact protected rows", async ({ page }) => {
  await page.goto("/");
  const metrics = await page.evaluate(async () => {
    const { compositeEyeGPU, compositeEyeGPUCanvas } = await import("/src/lib/material-eye-gpu.ts");
    const { blitEyeGPUCanvas } = await import("/src/lib/material-eye-v2.ts");
    const width = 19, height = 9;
    const original = new Uint8ClampedArray(width * height * 4);
    const previous = new Uint8ClampedArray(width * height * 4);
    const ink = new Uint8ClampedArray(width * height * 4);
    const weights = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      original.set([54 + 3 * x, 84 + y * 8, 103 + (x + y) * 2, 255], i);
      previous.set([68 + x, 99 + y * 3, 120 + x + y, 255], i);
      ink.set([12, 17, 22, 255], i);
      if (y >= 2 && y <= 6 && x >= 4 && x <= 14) {
        weights.set([150, 62 + x * 3, 230, 0], i);
      }
      if (y === 4 && x >= 7 && x <= 12) weights[i + 3] = 190;
    }
    const input = {width, height, original, previous, ink, weights,
      pigmentA: [0.18, 0.03, 0.21] as [number, number, number],
      pigmentB: [0.29, 0.08, 0.49] as [number, number, number], referenceLight: 0.21 };
    const pixels = compositeEyeGPU(input);
    const gpuCanvas = compositeEyeGPUCanvas(input);
    if (!pixels || !gpuCanvas) return { missing: true };
    const destination = document.createElement("canvas");
    destination.width = width; destination.height = height;
    const ctx = destination.getContext("2d")!;
    ctx.putImageData(new ImageData(previous, width, height), 0, 0);
    const spans = blitEyeGPUCanvas(ctx, gpuCanvas, weights, { x:0, y:0, w:width, h:height });
    const result = ctx.getImageData(0, 0, width, height).data;
    let protectedDiff = 0, maxColourError = 0, sumColourError = 0, n = 0;
    let upperChanged = 0, lowerChanged = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const allowed = weights[i + 2] !== 0 || weights[i + 3] !== 0;
      for (let c = 0; c < 4; c++) {
        if (!allowed && result[i + c] !== previous[i + c]) protectedDiff++;
        if (allowed && c < 3) {
          const d = Math.abs(result[i + c] - pixels[i + c]);
          maxColourError = Math.max(maxColourError, d);
          sumColourError += d; n++;
        }
        if (allowed && c === 0 && result[i] !== previous[i]) {
          if (y <= 3) upperChanged++;
          if (y >= 5) lowerChanged++;
        }
      }
    }
    return {missing: false, spans, protectedDiff, maxColourError,
      meanColourError: sumColourError / Math.max(1,n), upperChanged, lowerChanged};
  });
  expect(metrics.missing).toBe(false);
  expect(metrics.spans).toBeGreaterThan(0);
  expect(metrics.protectedDiff).toBe(0);
  expect(metrics.upperChanged).toBeGreaterThan(0);
  expect(metrics.lowerChanged).toBeGreaterThan(0);
  expect(metrics.meanColourError).toBeLessThan(1.5);
  expect(metrics.maxColourError).toBeLessThanOrEqual(4);
});
