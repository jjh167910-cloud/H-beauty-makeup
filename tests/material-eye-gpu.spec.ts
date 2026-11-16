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
