/**
 * Explicit, local-only Android GPU A/B benchmark of the native eye postpass.
 *
 * Usage (on a consenting physical phone, after its optional models are ready):
 *   const { preparePhoto } = await import("/src/lib/tryon.ts");
 *   const { runNativeEyeAB } = await import("/src/lib/native-eye-benchmark.ts");
 *   const prepared = await preparePhoto(yourChosenPhotoBlob);
 *   const report = await runNativeEyeAB(prepared.plain);
 *   console.log(report); // metrics only; never uploads the photograph
 *
 * This research-only module is not imported by the salon UI or live camera.
 * GPU measurements need the timer extension and at least 30 valid samples
 * per mode to be analytically sufficient. CI software GPU is not a phone.
 */
import { paintLook, gpu, type Shot } from "./tryon";
import { nativeEyeMaterial, nativeEyeScissor } from "./material-eye-native";
import { auditNativeEyePixels, type NativeEyePixelParity } from "./native-eye-parity";
import type { Level } from "./makeup-gl";
import type { NativeEyeGpuMeasurement, NativeEyeGpuMode } from "./native-eye-gpu-timer";

export type NativeEyeABStats = {
  mode: NativeEyeGpuMode;
  valid: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};
export type NativeEyeABSummary = {
  status: "sufficient-samples" | "insufficient-samples";
  minRequiredPerMode: number;
  samples: Record<NativeEyeGpuMode, number>;
  timings: NativeEyeABStats[];
  /** Positive means fast's median is lower; not a certification of better UX. */
  medianGpuSpeedupPercent: number | null;
  /** Positive means fast's p95 is lower. */
  p95GpuSpeedupPercent: number | null;
};

const validSample = (s: NativeEyeGpuMeasurement) =>
  (s.mode === "native" || s.mode === "native-fast") &&
  Number.isSafeInteger(s.sequence) && s.sequence >= 1 &&
  Number.isFinite(s.gpuMs) && s.gpuMs >= 0 && s.gpuMs <= 10_000;

const quantile = (values: number[], q: number) =>
  values[Math.max(0, Math.ceil(values.length * q) - 1)];

export function summarizeNativeEyeAB(
  samples: NativeEyeGpuMeasurement[], minRequiredPerMode = 30,
): NativeEyeABSummary {
  if (!Array.isArray(samples) || !Number.isSafeInteger(minRequiredPerMode) ||
    minRequiredPerMode < 1 || minRequiredPerMode > 32)
    throw new RangeError("Expected samples and a target of 1..32 valid GPU queries per mode");
  const seen = new Set<number>();
  const byMode: Record<NativeEyeGpuMode, number[]> = { native: [], "native-fast": [] };
  for (const sample of samples) {
    if (!sample || !validSample(sample) || seen.has(sample.sequence)) continue;
    seen.add(sample.sequence);
    byMode[sample.mode].push(sample.gpuMs);
  }
  const timings = (["native", "native-fast"] as const).flatMap((mode) => {
    const values = byMode[mode].sort((a, b) => a - b);
    if (!values.length) return [] as NativeEyeABStats[];
    return [{
      mode, valid: values.length, p50Ms: quantile(values, 0.50),
      p95Ms: quantile(values, 0.95), minMs: values[0],
      maxMs: values[values.length - 1],
    }];
  });
  const sufficient = Object.values(byMode).every(a => a.length >= minRequiredPerMode);
  const normal = timings.find(x => x.mode === "native");
  const fast = timings.find(x => x.mode === "native-fast");
  const speed = (normalMs: number | undefined, fastMs: number | undefined) =>
    normalMs == null || fastMs == null || normalMs <= 0
      ? null : (1 - fastMs / normalMs) * 100;
  return {
    status: sufficient ? "sufficient-samples" : "insufficient-samples",
    minRequiredPerMode,
    samples: { native: byMode.native.length, "native-fast": byMode["native-fast"].length },
    timings,
    medianGpuSpeedupPercent: sufficient ? speed(normal?.p50Ms, fast?.p50Ms) : null,
    p95GpuSpeedupPercent: sufficient ? speed(normal?.p95Ms, fast?.p95Ms) : null,
  };
}

export type NativeEyeABReport = Omit<NativeEyeABSummary, "status"> & {
  kind: "local-gpu-eye-ab";
  status: NativeEyeABSummary["status"] | "unsupported-gpu-timer" | "aborted" |
    "image-parity-failed" | "image-parity-unavailable";
  lookId: "hollywood" | "electric-blue" | "rhinestone";
  level: Level;
  photoWidth: number;
  photoHeight: number;
  warmupsPerMode: number;
  attemptedPerMode: number;
  totalWallMs: number;
  timerSupported: boolean;
  /** Exact on-device full-resolution A/B pixel integrity measured before timing. */
  pixelParity: NativeEyePixelParity | null;
  /** This is a FRAMEBUFFER estimate, not measured total GPU memory. */
  nativeRgba8FramebufferBytes: number;
  /** No user photo, landmarks, ID, device fingerprint, or image content. */
  evidence: "Local GPU elapsed queries and pixel-parity preflight only; physical device and photo quality not certified";
};

let inProgress = false;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runNativeEyeAB(
  shot: Shot,
  options: {
    lookId?: "hollywood" | "electric-blue" | "rhinestone";
    level?: Level;
    warmupsPerMode?: number;
    samplesPerMode?: number;
    signal?: AbortSignal;
  } = {},
): Promise<NativeEyeABReport> {
  if (inProgress) throw new Error("A native eye benchmark is already active");
  if (typeof location === "undefined" || typeof history === "undefined" ||
      new URLSearchParams(location.search).get("eyePilot") !== "v2")
    throw new Error("Native eye A/B is research-only: open ?eyePilot=v2 first");
  const lookId = options.lookId ?? "hollywood";
  const level = options.level ?? "natural";
  const warmups = options.warmupsPerMode ?? 3, target = options.samplesPerMode ?? 30;
  if (!Number.isSafeInteger(warmups) || warmups < 0 || warmups > 10 ||
      !Number.isSafeInteger(target) || target < 1 || target > 30)
    throw new RangeError("Warmups must be 0..10 and valid trials must be 1..30 per mode");
  if (!shot?.photo || !Number.isFinite(shot.photo.width) || !Number.isFinite(shot.photo.height) ||
    shot.photo.width <= 0 || shot.photo.height <= 0)
    throw new TypeError("An actual locally prepared photo is required");

  // The module never exports the picture or its landmark arrays. No network
  // request is made by the benchmark itself; normal offline model assets may
  // still need loading on the first warm-up of the existing renderer.
  const original = location.href;
  const started = performance.now();
  const r = gpu();
  let pixelParity: NativeEyePixelParity | null = null;
  const empty = summarizeNativeEyeAB([], 30);
  const make = (status: NativeEyeABReport["status"], metrics: NativeEyeABSummary): NativeEyeABReport => ({
    ...metrics, status, kind: "local-gpu-eye-ab", lookId, level,
    photoWidth: shot.photo.width, photoHeight: shot.photo.height,
    warmupsPerMode: warmups, attemptedPerMode: target,
    timerSupported: r?.nativeEyeGpuTimingSupported === true,
    pixelParity,
    totalWallMs: Math.round(performance.now() - started),
    nativeRgba8FramebufferBytes: shot.photo.width * shot.photo.height * 4,
    evidence: "Local GPU elapsed queries and pixel-parity preflight only; physical device and photo quality not certified",
  });
  if (!r) return make("unsupported-gpu-timer", empty);
  const setMode = (mode: NativeEyeGpuMode) => {
    const u = new URL(location.href);
    u.searchParams.set("eyePilot", "v2");
    u.searchParams.set("eyeCompute", mode);
    u.searchParams.set("eyeTiming", "1");
    history.replaceState(history.state, "", u.href);
  };
  // Visibility can change while asynchronous GPU work is in flight.
  // Keep the check in a helper so TypeScript does not assume a page
  // validated before an await must remain visible afterward.
  const pageIsVisible = () => document.visibilityState !== "hidden";
  const draw = async (mode: NativeEyeGpuMode) => {
    if (options.signal?.aborted || !pageIsVisible())
      return false;
    setMode(mode);
    await paintLook(shot, lookId, level);
    // A nonblocking yield gives the GPU a chance to make a query available.
    r.pollNativeEyeGpuTiming();
    await sleep(22);
    return !options.signal?.aborted && pageIsVisible();
  };

  inProgress = true;
  try {
    setMode("native");
    // A successful first query is only evidence that timing is SUPPORTED,
    // not a timing sample to include in warmed A/B results.
    if (!(await draw("native"))) return make("aborted", empty);
    if (r.nativeEyeGpuTimingSupported !== true)
      return make("unsupported-gpu-timer", empty);

    // Fail closed on image-quality differences BEFORE executing the timed
    // trials. The full ImageData readback is diagnostic-only and happens
    // outside measured GPU samples, not in the production/live renderer.
    const material = nativeEyeMaterial(shot.points, lookId, level);
    const roi = material ? nativeEyeScissor(material, shot.photo.width, shot.photo.height) : null;
    if (!roi) return make("image-parity-unavailable", empty);

    setMode("native");
    const originalCanvas = await paintLook(shot, lookId, level);
    const fullApplied = r.lastNativeEye === true && r.lastNativeEyeFast !== true;
    const nativePixels = originalCanvas.getContext("2d")?.getImageData(
      0, 0, shot.photo.width, shot.photo.height);
    setMode("native-fast");
    const optimizedCanvas = await paintLook(shot, lookId, level);
    const fastApplied = r.lastNativeEye === true && r.lastNativeEyeFast === true;
    const fastPixels = optimizedCanvas.getContext("2d")?.getImageData(
      0, 0, shot.photo.width, shot.photo.height);
    if (!nativePixels || !fastPixels) return make("image-parity-unavailable", empty);
    pixelParity = auditNativeEyePixels(nativePixels, fastPixels, roi, fullApplied, fastApplied);
    if (pixelParity.status !== "pass")
      return make(pixelParity.status === "fail" ? "image-parity-failed" : "image-parity-unavailable", empty);

    // Fresh warmups follow the pixel readback so it cannot pollute timing.
    for (let i = 0; i < warmups; i++) {
      if (!(await draw("native-fast"))) return make("aborted", empty);
      if (!(await draw("native"))) return make("aborted", empty);
    }
    // Drop warm-up and delayed first-use queries; isolate measured trials.
    if (!r.resetNativeEyeGpuSamples()) return make("insufficient-samples", empty);
    for (let i = 0; i < target; i++) {
      // Balanced AB/BA trials mitigate warmed-cache and thermal-order bias.
      const order: NativeEyeGpuMode[] = i % 2 === 0
        ? ["native", "native-fast"] : ["native-fast", "native"];
      for (const mode of order)
        if (!(await draw(mode)))
          return make("aborted", summarizeNativeEyeAB(r.nativeEyeGpuSamples(), 30));
    }
    // Do not block the GPU; at most eight short async drains for the final
    // GPU query results. Incomplete/driver-disjoint results remain INSUFFICIENT.
    for (let attempt = 0; attempt < 8; attempt++) {
      const data = r.nativeEyeGpuSamples();
      if (data.length >= target * 2) break;
      if (options.signal?.aborted) return make("aborted", empty);
      await sleep(35);
    }
    const metrics = summarizeNativeEyeAB(r.nativeEyeGpuSamples(), 30);
    return make(metrics.status, metrics);
  } finally {
    // Restore only the research toggles on the SAME page, never navigate away
    // or overwrite an unrelated route chosen during an aborted benchmark.
    const saved = new URL(original);
    const current = new URL(location.href);
    if (saved.origin === current.origin && saved.pathname === current.pathname &&
        saved.hash === current.hash) {
      for (const key of ["eyePilot", "eyeCompute", "eyeTiming"]) {
        const value = saved.searchParams.get(key);
        if (value === null) current.searchParams.delete(key);
        else current.searchParams.set(key, value);
      }
      history.replaceState(history.state, "", current.href);
    }
    inProgress = false;
  }
}
