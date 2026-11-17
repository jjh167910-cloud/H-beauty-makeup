import { expect, test } from "playwright/test";

test("GPU benchmark evidence gate excludes duplicates, nonfinite queries and low sample counts", async ({ page }) => {
  await page.goto("/");
  const x = await page.evaluate(async () => {
    const { summarizeNativeEyeAB } = await import("/src/lib/native-eye-benchmark.ts");
    const samples: Array<{ sequence: number; mode: "native"|"native-fast"; gpuMs: number }> = [];
    for (let i = 1; i <= 30; i++) {
      samples.push({ mode: "native", gpuMs: i, sequence: i * 2 - 1 });
      samples.push({ mode: "native-fast", gpuMs: i / 2, sequence: i * 2 });
    }
    const clean = summarizeNativeEyeAB(samples);
    const invalid = [
      { mode: "native", gpuMs: 0.1, sequence: 1 }, // duplicate, not an additional trial
      { mode: "native-fast", gpuMs: Number.NaN, sequence: 62 },
      { mode: "native", gpuMs: -1, sequence: 63 },
      { mode: "native", gpuMs: Number.POSITIVE_INFINITY, sequence: 64 },
    ] as typeof samples;
    const extended = summarizeNativeEyeAB(samples.concat(invalid));
    const short = summarizeNativeEyeAB(samples.slice(0, 56));
    const empty = summarizeNativeEyeAB([]);
    let invalidTarget = false, oneSampleCannotCertify = false;
    try { summarizeNativeEyeAB(samples, 0); } catch { invalidTarget = true; }
    try { summarizeNativeEyeAB(samples.slice(0,2), 1); }
    catch { oneSampleCannotCertify = true; }
    return { clean, extended, short, empty, invalidTarget, oneSampleCannotCertify };
  });
  expect(x.invalidTarget).toBe(true);
  expect(x.oneSampleCannotCertify).toBe(true);
  expect(x.clean.status).toBe("sufficient-samples");
  expect(x.clean.samples).toEqual({ native: 30, "native-fast": 30 });
  expect(x.clean.timings).toEqual([
    { mode: "native", valid: 30, p50Ms: 15, p95Ms: 29, minMs: 1, maxMs: 30 },
    { mode: "native-fast", valid: 30, p50Ms: 7.5, p95Ms: 14.5, minMs: 0.5, maxMs: 15 },
  ]);
  expect(x.clean.medianGpuSpeedupPercent).toBe(50);
  expect(x.clean.p95GpuSpeedupPercent).toBe(50);
  expect(x.extended).toEqual(x.clean);
  expect(x.short.status).toBe("insufficient-samples");
  expect(x.short.medianGpuSpeedupPercent).toBeNull();
  expect(x.empty.status).toBe("insufficient-samples");
  expect(x.empty.timings).toEqual([]);
});

test("local A/B benchmark never runs in production mode", async ({ page }) => {
  await page.goto("/");
  const x = await page.evaluate(async () => {
    const { runNativeEyeAB } = await import("/src/lib/native-eye-benchmark.ts");
    const before = location.href;
    let refused = false;
    try {
      await runNativeEyeAB({ photo: document.createElement("canvas") } as any, {
        warmupsPerMode: 0, samplesPerMode: 1,
      });
    } catch (e) { refused = String(e).includes("research-only"); }
    return { refused, unchangedUrl: location.href === before };
  });
  expect(x.refused).toBe(true);
  expect(x.unchangedUrl).toBe(true);
});

test("opt-in GPU benchmark uses only local metrics, restores URL and does not invent device timings", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/?eyePilot=v2");
  const result = await page.evaluate(async () => {
    const { runNativeEyeAB } = await import("/src/lib/native-eye-benchmark.ts");
    const { preparePhoto } = await import("/src/lib/tryon.ts");
    const original = location.href;
    const photo = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
    const shot = (await preparePhoto(photo)).plain;
    // One per mode is only a smoke check, NEVER an adequate benchmark.
    const report = await runNativeEyeAB(shot, {
      lookId: "hollywood", warmupsPerMode: 0, samplesPerMode: 1,
    });
    return {
      urlRestored: location.href === original,
      report,
      noImageInJson: !JSON.stringify(report).includes("data:image"),
    };
  });
  expect(result.urlRestored).toBe(true);
  expect(result.noImageInJson).toBe(true);
  expect(["insufficient-samples", "unsupported-gpu-timer"]).toContain(result.report.status);
  expect(result.report.minRequiredPerMode).toBe(30);
  expect(result.report.kind).toBe("local-gpu-eye-ab");
  expect(result.report.attemptedPerMode).toBe(1);
  expect(result.report.maxAttemptsPerMode).toBeGreaterThan(1);
  expect(result.report.renderedPerMode.native).toBeLessThanOrEqual(result.report.maxAttemptsPerMode);
  expect(result.report.renderedPerMode["native-fast"]).toBeLessThanOrEqual(result.report.maxAttemptsPerMode);
  expect(result.report.photoWidth).toBeGreaterThan(300);
  expect(result.report.evidence).toContain("not certified");
  expect(result.report.medianGpuSpeedupPercent).toBeNull();
  // When a GPU timer is available, sampled timing cannot proceed unless the
  // actual full-resolution native vs fast output passed protected-pixel audit.
  if (result.report.status !== "unsupported-gpu-timer") {
    expect(result.report.pixelParity?.status).toBe("pass");
    expect(result.report.pixelParity?.outsideChangedPixels).toBe(0);
    expect(result.report.pixelParity?.maxChannelDelta).toBeLessThanOrEqual(3);
  } else {
    expect(result.report.pixelParity).toBeNull();
  }
});
