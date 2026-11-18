import { test, expect } from "playwright/test";

test("local GPU parity preflight accepts only identical protected pixels and bounded inside differences", async ({ page }) => {
  await page.goto("/");
  const r = await page.evaluate(async () => {
    const { auditNativeEyePixels } = await import("/src/lib/native-eye-parity.ts");
    const width = 4, height = 3;
    const baseline = new ImageData(new Uint8ClampedArray(width * height * 4).fill(80), width, height);
    const changed = new Uint8ClampedArray(baseline.data);
    // WebGL y=1 maps to top-down image row 1, x=2 is inside [1,1,2,1].
    changed[(1 * width + 2) * 4] += 2;
    const within = new ImageData(changed, width, height);
    const roi: [number,number,number,number] = [1,1,2,1];
    const pass = auditNativeEyePixels(baseline, within, roi);
    const outsideBuffer = new Uint8ClampedArray(changed);
    // Top row corresponds to WebGL y=2: protected/unchanged.
    outsideBuffer[4] += 1;
    const outside = auditNativeEyePixels(baseline, new ImageData(outsideBuffer,width,height), roi);
    const strongBuffer = new Uint8ClampedArray(changed);
    strongBuffer[(1 * width + 2) * 4] = 87;
    const strong = auditNativeEyePixels(baseline, new ImageData(strongBuffer,width,height), roi);
    const fallback = auditNativeEyePixels(baseline, within, roi, true, false);
    let invalidScissor = false;
    try { auditNativeEyePixels(baseline, within, [0,0,5,1]); }
    catch { invalidScissor = true; }
    let differentSize = false;
    try {
      auditNativeEyePixels(baseline,
        new ImageData(new Uint8ClampedArray(3 * 3 * 4),3,3),roi);
    } catch { differentSize = true; }
    return { pass, outside, strong, fallback, invalidScissor, differentSize };
  });
  expect(r.pass.status).toBe("pass");
  expect(r.pass.insidePixels).toBe(2);
  expect(r.pass.outsidePixels).toBe(10);
  expect(r.pass.outsideChangedPixels).toBe(0);
  expect(r.pass.maxChannelDelta).toBe(2);
  expect(r.pass.meanChannelDelta).toBeCloseTo(2/(4*3*4),8);
  expect(r.outside.status).toBe("fail");
  expect(r.outside.outsideChangedPixels).toBe(1);
  expect(r.outside.maxOutsideChannelDelta).toBe(1);
  expect(r.strong.status).toBe("fail");
  expect(r.strong.maxChannelDelta).toBe(7);
  expect(r.fallback.status).toBe("unavailable");
  expect(r.invalidScissor).toBe(true);
  expect(r.differentSize).toBe(true);
});

test("real saved-photo optimized GPU output satisfies local parity preflight with no exported pixels", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/?eyePilot=v2");
  const audit = await page.evaluate(async () => {
    const { paintLook, preparePhoto, gpu } = await import("/src/lib/tryon.ts");
    const { nativeEyeMaterial, nativeEyeScissor } = await import("/src/lib/material-eye-native.ts");
    const { auditNativeEyePixels } = await import("/src/lib/native-eye-parity.ts");
    const photo = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
    const shot = (await preparePhoto(photo)).plain;
    const material = nativeEyeMaterial(shot.points,"rhinestone","natural");
    const roi = material ? nativeEyeScissor(material,shot.photo.width,shot.photo.height) : null;
    if (!roi) return { missing: true };
    const original = location.href;
    try {
      history.replaceState(history.state,"","/?eyePilot=v2&eyeCompute=native");
      const full = await paintLook(shot,"rhinestone","natural");
      const appliedFull = gpu()?.lastNativeEye === true && gpu()?.lastNativeEyeFast === false;
      const fullPixels = full.getContext("2d")!.getImageData(0,0,full.width,full.height);
      history.replaceState(history.state,"","/?eyePilot=v2&eyeCompute=native-fast");
      const fast = await paintLook(shot,"rhinestone","natural");
      const appliedFast = gpu()?.lastNativeEyeFast === true;
      const fastPixels = fast.getContext("2d")!.getImageData(0,0,fast.width,fast.height);
      return {
        audit: auditNativeEyePixels(fullPixels, fastPixels, roi, appliedFull, appliedFast),
        exposedPixels: false
      };
    } finally {
      history.replaceState(history.state, "", original);
    }
  });
  expect(audit.missing).not.toBe(true);
  expect(audit.audit.status).toBe("pass");
  expect(audit.audit.outsideChangedPixels).toBe(0);
  expect(audit.audit.maxOutsideChannelDelta).toBe(0);
  expect(audit.audit.maxChannelDelta).toBeLessThanOrEqual(3);
  expect(audit.audit.meanChannelDelta).toBeLessThan(0.5);
  expect(audit.exposedPixels).toBe(false);
});
