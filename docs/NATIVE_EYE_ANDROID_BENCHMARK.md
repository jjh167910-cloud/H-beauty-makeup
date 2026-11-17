# H-Beauty: on-device native-eye GPU A/B benchmark (research only)

This protocol measures **GPU execution time**, not makeup photorealism, camera FPS, total battery usage, or a completed production release. It is opt-in and runs only on the private/research preview of `feat/realism-benchmark-v2`. **It is not deployed to the public Cloudflare salon site.**

## What is measured

The same prepared still photograph and the same native eye-material pilot look are rendered twice per paired trial:

- `native`: the full-frame native GPU eye-material postpass.
- `native-fast`: the same eye shader, preceded by a GPU framebuffer copy and conservative eye-region scissor. If blit/scissor fails, that query is labeled `native`, not incorrectly counted as fast.

The browser's `EXT_disjoint_timer_query_webgl2` provides nonblocking elapsed nanoseconds, with no GPU stalls, readPixels, external APIs, or telemetry. The benchmark uses three warmup passes per mode, throws away all warmup queries, then schedules **30 A/B or B/A paired trials**, alternating order. Only the final 30 valid measurements **for each actual mode** can satisfy the statistical sample-count gate.

It reports mode-specific p50/p95/min/max and sample counts, and percentage improvement of native-fast relative to native. Positive percentage means lower GPU time, negative means a regression. A report of `sufficient-samples` means **only** that both mode sample counts are adequate. It is not a pass in a production or real-world quality study. GPU timer unsupported, GPU disjoint, backgrounded tab or aborted session must not be treated as success.

The report contains **no selfie, image pixels, detected landmarks, image pathname, unique user/device ID, or hardware fingerprint**. Its `nativeRgba8FramebufferBytes` field is an estimate for one RGBA8 framebuffer at that photo size, **not measured peak GPU allocation**. GPU execution times are not CPU paint times or live-camera FPS.

## Run on a consenting Android device

1. Prepare a **development build** of the experimental branch, load it in Chrome for Android, and open it with `?eyePilot=v2`. The normal public salon URL is not a valid test target. Connect Chrome DevTools from a trusted development machine, or use a locally controlled debugging environment.
2. Install or cache the required local face/model files through the app's normal optional download flow before benchmarking. Keep the browser tab in the foreground, with battery saver disabled, and use the same image resolution, look and level for both modes.
3. Run the following in the browser's own development console. The bundled `no-makeup.webp` is an existing generated fixture for **timing validation without a customer photograph**. A separately consented local portrait may be used in an offline development session; never publish its pixels or identity in a benchmark report.

```js
const { preparePhoto } = await import("/src/lib/tryon.ts");
const { runNativeEyeAB } = await import("/src/lib/native-eye-benchmark.ts");
const fixture = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
const shot = (await preparePhoto(fixture)).plain;
const report = await runNativeEyeAB(shot, {
  lookId: "hollywood", level: "natural",
  warmupsPerMode: 3, samplesPerMode: 30,
});
console.log(JSON.stringify(report, null, 2));
```

4. Repeat the independent session at least three times, with the same environment, then repeat for `electric-blue` and `rhinestone`. Record device **performance tier** (low/mid/high), OS/browser major version, image dimensions, look, approximate battery/thermal conditions and locally produced report in a separate private QA log. A tier label is sufficient: do not collect serial numbers or device advertising IDs.
5. Compare **p50 and p95**, the number of valid mode-specific samples, and variability across sessions. Also record app responsiveness, capture correctness, observed memory pressure, dropped frames and thermal throttling with platform tools. The benchmark cannot measure those automatically.
6. If the extension is unavailable or insufficient valid samples are returned, record `unsupported-gpu-timer` or `insufficient-samples`. Do not fill absent values, substitute elapsed CPU times or claim speedups without genuine GPU observations. An interrupted or hidden-tab run is `aborted`.

## Required production quality gates

GPU speed is one axis of release readiness. Preserve the opt-in flag and CPU/native fallbacks until the following are proven independently:

- Full GitHub Playwright quality gate including live-camera capture and all three shards is green.
- Consented real portraits across different visible facial geometry and skin depths have exact protected-pixel checks, eye/sclera/eyeglass occlusion validation, and artist blind comparisons. No synthetic model fixture proves production photorealism.
- Low-, mid- and high-tier physical Android tests show acceptable p50/p95, thermal, memory, battery and capture responsiveness. Do not confuse one software-rendered Chrome CI run with any of these conditions.
- All 42 looks are separately validated before replacing their legacy production rendering, and the actual public Cloudflare deployment is verified only after an approved merge.

See `src/lib/native-eye-benchmark.ts`, `src/lib/native-eye-gpu-timer.ts`, `tests/material-eye-benchmark.spec.ts`, `docs/REALISM_IMPLEMENTATION_V2.md`, and issue #24.
