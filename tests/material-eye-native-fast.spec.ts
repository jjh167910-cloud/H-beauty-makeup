import { test, expect } from "playwright/test";

/** A/B image parity of an opt-in, same-WebGL-context framebuffer-copy +
 * scissor path against the earlier full-frame native shader.
 * The catalog model fixture is generated, not a customer's private photo.
 */
test("native-fast scissored GPU output matches full native render with intact protected pixels", async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto("/?eyePilot=v2&eyeCompute=native");
  const audit = await page.evaluate(async () => {
    const { paintLook, preparePhoto, gpu } = await import("/src/lib/tryon.ts");
    const { nativeEyeMaterial, nativeEyeScissor } = await import("/src/lib/material-eye-native.ts");
    const file = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
    const prepared = await preparePhoto(file);
    const shot = prepared.plain;
    const material = nativeEyeMaterial(shot.points, "rhinestone", "natural");
    const bounds = material ? nativeEyeScissor(material, shot.photo.width, shot.photo.height) : null;
    if (!bounds) return { missing: true };

    history.replaceState({}, "", "/?eyePilot=v2&eyeCompute=native");
    const standard = await paintLook(shot, "rhinestone", "natural");
    const standardNative = gpu()?.lastNativeEye === true;
    const standardFast = gpu()?.lastNativeEyeFast === true;
    const a = standard.getContext("2d")!.getImageData(0, 0, standard.width, standard.height).data;

    history.replaceState({}, "", "/?eyePilot=v2&eyeCompute=native-fast");
    const optimized = await paintLook(shot, "rhinestone", "natural");
    const optimizedNative = gpu()?.lastNativeEye === true;
    const optimizedFast = gpu()?.lastNativeEyeFast === true;
    const b = optimized.getContext("2d")!.getImageData(0, 0, optimized.width, optimized.height).data;
    const W = standard.width, H = standard.height;
    let changed = 0, protectedChanged = 0, maxChannelDiff = 0;
    let accumulated = 0, compared = 0, maxOutside = 0;
    const [rx, ry, rw, rh] = bounds;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Bounds are in bottom-left GL coordinates. For a normal top-down
      // ImageData pixel, its GL row is H - 1 - y.
      const glY = H - 1 - y;
      const outside = x < rx || x >= rx + rw || glY < ry || glY >= ry + rh;
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(a[i + c] - b[i + c]);
        if (d > 0) changed++;
        if (outside && d > 0) protectedChanged++;
        if (outside) maxOutside = Math.max(maxOutside, d);
        maxChannelDiff = Math.max(maxChannelDiff, d);
        accumulated += d; compared++;
      }
    }
    return {
      standardNative, standardFast, optimizedNative, optimizedFast,
      width: W, height: H, bounds, changed, protectedChanged, maxOutside,
      maxChannelDiff, meanDifference: accumulated / compared,
      croppedArea: rw * rh, totalArea: W * H
    };
  });
  expect(audit.missing).not.toBe(true);
  expect(audit.standardNative).toBe(true);
  expect(audit.standardFast).toBe(false);
  expect(audit.optimizedNative).toBe(true);
  expect(audit.optimizedFast).toBe(true);
  expect(audit.croppedArea).toBeLessThan(audit.totalArea * 0.9);
  expect(audit.protectedChanged).toBe(0);
  expect(audit.maxOutside).toBe(0);
  expect(audit.meanDifference).toBeLessThan(0.5);
  expect(audit.maxChannelDiff).toBeLessThanOrEqual(3);
});

test("scissor bounds reject invalid data instead of trusting an unsafe ROI", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { nativeEyeScissor, nativeEyeMaterial } = await import("/src/lib/material-eye-native.ts");
    const pts = Array.from({ length: 478 }, () => [120, 120, 0]);
    const malformed = nativeEyeMaterial(pts, "hollywood", "natural");
    const good = {
      upper: new Float32Array(36), brows: new Float32Array(20),
      frame: new Float32Array(8), span: new Float32Array([40, 0]),
      enabled: new Int32Array([1, 0]),
      inkSoft: 0.7, wingLength: 0.2, lashLength: 0.15
    } as any;
    good.upper[0] = NaN;
    return {
      malformed: malformed === null,
      illegalSize: nativeEyeScissor(good, -1, 240),
      corruptMesh: nativeEyeScissor(good, 400, 240)
    };
  });
  expect(result.malformed).toBe(true);
  expect(result.illegalSize).toBeNull();
  expect(result.corruptMesh).toBeNull();
});
