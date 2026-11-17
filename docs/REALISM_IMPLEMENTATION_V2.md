# H-Beauty Makeup — realism roadmap v2 (implementation specification)

Status: **development specification**, not a photorealism certification.
Baseline repository: 7379d767 (2026-11-16). Original source: Roadmap.pdf, pages 1–18.
Build on the existing offline, on-device WebGL2 engine; do not replace production before measured superiority.

## Why v2 differs from the original nine-phase roadmap

The main diagnosis is unchanged: the catalog's photograph-ratio layers carry the source model's
geometry, lighting, cosmetic residue and eyelashes. They are not portable cosmetic materials.
The renderer must eventually accept **coverage, pigment, opacity, finish, vector geometry and
occlusion**, all in the customer's own face coordinates. However, several gates in the original
plan would overstate confidence unless revised:

1. **No training without legal provenance.** Do not assume FFHQ, public beauty photos, Sapiens2,
   FLUX, ART or other research checkpoints may be used commercially or to distill another model.
   Record both input-image rights and each model's output-use/training restrictions.
   FFHQ dataset metadata is CC BY-NC-SA 4.0; individual images have different licenses.
   FLUX 3 Image Klein limits uses of outputs to improve similar AI models. A commercial salon
   needs rights verified for the specific intended use. A paper citation is not a license.
2. **A 70% blind preference on correlated ratings is not 70% independent evidence.**
   Face/look pairs are the comparison units, but four looks on the same face are correlated.
   Do not treat rater clicks or repeated looks as additional independent people. Report a
   customer-cluster Wilson 95% interval on subject-level success, skin-tone
   strata and per-look scores. Report inconclusive results as inconclusive.
3. **Do not count clipping already present in the input camera photo as new makeup clipping.**
   Count introduced RGB 0/255 endpoints in previously non-clipped channels. Report near-endpoint
   0–5/250–255 pressure as a diagnostic, not an automatic fail for editorial looks.
4. **A no-change-outside-mask test is necessary but insufficient.** Require mask provenance,
   non-border masks, edge inspection, independently evaluated facial landmarks, and visual artist
   signoff. The existing pixel-lock Python audit remains valid and is complemented by
   scripts/quality/benchmark_v2.mjs.
5. **Photographic colour truth needs controlled calibration.** ΔE2000 against a real shade swatch
   is valid only with consistent exposure/white balance, measured illumination and a colour
   target. On arbitrary selfies, publish colour appearance as approximate.
6. **Live and still renderers share a material model, not a pixel-identical performance promise.**
   Live video may use lower-resolution ROI effects; still mode uses adaptive high-res tiling.
   Compare both with a toleranced, perceptual test and temporal-stability metrics.
7. **A 3 MB student, 4096 px output or 30 fps is a hypothesis, not a contract.** Benchmark on
   three actual phone classes; only promote a new model if its benefit exceeds compute, download,
   memory and battery costs. Keep WebGL2 as the minimum supported graphics path; WebGPU optional.
8. **Prioritize commercial fidelity, not artificial beautification.** An untouched original
   must remain available for before/after. Studio light and restoration are opt-in and labelled.
   Any AI finish must be strictly masked and preserve identity, anatomy and skin detail.

## Revised delivery order

**A — Evidence and permission gate (before GPU spending).** Record rights for datasets and
teacher models; collect opt-in real-phone test photos privately; annotate eye/lip curves; measure
baseline versus two real competitors on matched looks. Do not commit selfies, face embeddings or
any personal identifying metadata. Establish artist rubric and reproducible capture conditions.
Run the existing GPU pilot only with sources licensed for the use.

**B — Four-look material pilot (before expanding to 42).** Start with no-makeup, Hollywood,
electric blue and rhinestone. Give every look named cosmetic products, authorable coverage masks,
vector liner paths, independently anchored lash strands, editable finishes and optional particles.
Use the existing "میکاپ من" material path to replace photo-ratio layers one product at a time.
An authoring prototype may use manual masks until automatic extraction clearly beats them.

**C — Face-fitting only where errors justify it.** Retain MediaPipe tracking and the existing
outline editor. First evaluate landmark-based curves with crop refinement; distill dense
segmentation/geometry students only when measured eye/lip placement improves across challenging
eyes, poses, skin tones, occlusion and low light. Never infer confidence from landmark count alone.

**D — Intrinsic lighting plus materials.** Calibrate on a consented, controlled test set;
estimate skin reflectance and shading, not a single definitive albedo truth from an arbitrary
RGB selfie. Correct camera white balance first. Compose in linear light and use an explicit
tone-mapping/gamut path; retain skin pores, lip lines and natural facial shadows.

**E — Optional trained local finisher.** Train only from authorized data, with paired graphics
outputs and independently checked real-makeup references. Mask its residual output to cosmetic
regions; reject background, hair, facial-shape and texture drift. Train and evaluate on
independent people, with no overlapping identities across splits. The finisher may remain
disabled if it does not win blind comparisons.

**F — Product and engineering.** A sticky photo, grouped look browser, fast sharing,
one-tap booking message (customer manually sends photo), clear privacy copy, touch-accessible
bottom-sheet controls and graceful offline re-entry. Progressive model tiers: graphics first,
refinement later; cancelable/resumable downloads; HD optional. Keep old pipeline side-by-side
until pilot exit gates are independently met.

## Benchmark protocol (Phase 0 and every release)

- Benchmark: at least 30 independent, consented real selfies, four pilot looks on **each**,
  and at least five independent people in each light/medium/deep testing stratum. Add eye-shape,
  glasses, hijab, dark-light conditions and difficult images. Strata are test coverage, not
  claims about anyone's identity. A larger set will be necessary for a full 42-look release.
- Use holdout people never used for training or prompt selection; keep exposure/pose/look
  matching consistent for head-to-head competitor pairs.
- For each face/look pair, independently assign one blinded comparative decision
  (candidate, competitor, tie) after collecting rater feedback. Keep full raw rater results
  in secure private storage for inter-rater agreement analysis; public summaries are aggregate.
- Artist score 1–5 for placement, opacity/colour, edges, skin realism, identity, and
  would-show-to-a-client; a look below 4 on any crucial dimension is held back.
- Save local, anonymized **metadata only**: no selfies, thumbnails, coordinates or emails.
  For engineering audits, count protected pixel changes, newly clipped RGB channels and
  border mask pixels. Use the existing standalone offline image audit to generate these.
- Report device class, frames per second, p50/p95 time to first result, peak memory, download
  bytes, warm/cold cache, frame drops, and battery cost; do not cite software rendering as
  physical phone performance.
- Compare in a registered test design. The 70% blind win-rate is a **point estimate target**;
  require a Wilson 95% lower bound above 50% on the **customer-cluster**
  pass fraction (each customer must win at least 70% of her tested looks). Reject a skin
  stratum below 50% pairwise preference or a gap over 0.3 in mean artist score. Report per-look
  and skin-group results even when the overall headline is positive.
- No CI test or synthetic-photo evaluation may certify "state of the art". Phase promotion is
  blocked until a human artist and legal reviewer sign off.

### Machine-readable pilot report

Put this JSON **only in a private folder outside the public repository**. No real photos are
required by this tool. Values are measured or manually checked, not fabricated:

~~~json
{
  "schema_version": 2,
  "cases": [
    {
      "sample_id": "anonymous-001",
      "look_id": "hollywood",
      "skin_group": "medium",
      "capture_type": "consented_real_selfie",
      "blind_review": true,
      "artist_score": 4.4,
      "outside_changed_pixels": 0,
      "border_mask_pixels": 0,
      "introduced_clipped_channels": 0,
      "paired_preference": "candidate"
    }
  ]
}
~~~

Run:

~~~sh
node scripts/quality/benchmark_v2.mjs /private/path/benchmark.json
node --test tests-node/benchmark_v2.test.mjs
~~~

The CLI reports fail, insufficient-evidence or pass. Confidence is clustered by
independent customer rather than incorrectly treating repeated looks as independent. **Pass is only the quantitative pilot
gate**, not legal permission or proof the outcome is realistic. It always requires artist and
legal review. Partial/inconclusive data may not silently promote a model.

## Implemented experimental material-eye renderer (photo pilot)

The code in `src/lib/material-eye-v2.ts` is a **research implementation**, not an
externally validated result. It runs **only on saved photos when the URL explicitly
contains `?eyePilot=v2`**; it is off by default for every user, the live mirror and
thumbnail rendering. It does not introduce model downloads or remote photo processing.

For the four declared pilot looks, it preserves the normal engine's result as
the baseline, then uses each photo's real upper-lid and brow landmarks to define
a face-fitted pigment area. It replaces eye-region catalog photo-ratio pixels with
an authored cosmetic shade composited in linear light, preserving local lighting
and skin detail. Liner and lashes are drawn as vector paths / separately tapered
strands; the camera-face visibility mask suppresses occluded regions. Other face
pixels are unchanged.

Pilot IDs: `no-makeup` (negative control: intentionally unchanged),
`hollywood`, `electric-blue` and `rhinestone`.
The pilot does not yet replace rhinestone placement or provide real intrinsic
decomposition, neural lashes, temporal video consistency or validated accurate
placement for every eyelid type; these remain engineering milestones.

Browser checks in `tests/material-eye-v2.spec.ts` confirm the feature flag,
protected background pixels, two-eye rendering on synthetic landmarks, no new
0/255 clipping and an unchanged result when face visibility is zero.
**These tests do not establish photorealism or quality superiority.**

The intended side-by-side evaluation is one customer photo, same look and
settings, default renderer versus `eyePilot=v2`, with filenames randomized
for blind professional review. Do not deploy or enable pilot by default before
it wins on real photographed makeup.

## Experimental WebGL2 direct-canvas milestone — 2026-11-17

The still-photo opt-in pilot now offers **three separate computation modes**:

- `?eyePilot=v2`: baseline experimental CPU material-eye compositor
- `?eyePilot=v2&eyeCompute=gpu`: isolated WebGL2 linear-light compositor with `gl.readPixels` and 2D canvas `putImageData`
- `?eyePilot=v2&eyeCompute=canvas`: WebGL2 compositor returns its drawing canvas **without calling `gl.readPixels`**. The caller blits only mask-authorized horizontal segments onto the final 2D photo. It inverts GPU row ordering explicitly, preserves protected background pixels, and falls back to readback/CPU on failure

The direct-canvas mode **removes the synchronous GPU pixel readback from the eye shading stage**. This is an intermediate milestone, not native framebuffer integration: eye-geometry, coverage weights, reference-light estimation and intermediate input ROI acquisition still run on the CPU; separate WebGL and 2D canvas contexts remain. No claim is made that this mode is faster on a real phone until p50/p95 physical device measurements.

Tests: `tests/material-eye-gpu.spec.ts` asserts canvas-vs-readback pixel parity, exact protected pixels, vertical orientation and hard-clipping behavior. `tests/material-eye-canvas.spec.ts` compares the real `applyMaterialEyeV2` call in all three modes on textured synthetic light/deep skin with a simulated occlusion mask. The CI workflow runs both tests before the long application browser suite. An opt-in return value reports the **actual computation mode** and local elapsed milliseconds for device profiling.

**Release gate unchanged:** production remains on original renderer; independent photographed-makeup quality, user-identity protection, device performance and the complete app test suite must be validated before promotion. The next engineering task is to incorporate material shaders and face-space coverage into the existing `MakeupGL` framebuffer chain, eliminating canvas-to-canvas texture copies and CPU ROI readbacks.

## Shader-native MakeupGL framebuffer integration — 2026-11-17

**Development-only experiment, not released.** New `src/lib/material-eye-native.ts` defines analytic, face-space eyelid coverage and linear-light pigment in GLSL ES 3.0, with eyebrow/upper-lid curves computed from the user's landmarks. It requires real face visibility and rejects collapsed/unreliable eye geometry. The `no-makeup` control is never altered. Initial native pigment pilots: Hollywood, electric blue and rhinestone. Existing eyeliner, eyelashes and rhinestone geometry still come from the baseline renderer until these individual materials are replaced and independently measured.

`MakeupGL.render` now supports an optional **native eye-material postpass** inside its own WebGL2 context. For `?eyePilot=v2&eyeCompute=native` on saved photos, the old full-face composition first renders into an opt-in RGBA8 framebuffer. A second fullscreen shader consumes that texture, the original selfie texture and the renderer's existing face-visibility texture, then outputs directly to the same context's drawing buffer. It computes the eye mask **per fragment on the GPU**. No CPU eye-ROI readback, no CPU per-pixel weight map, no auxiliary WebGL context and no 2D mask-row blits. The extra target is lazily allocated only for this mode, and destroyed on resize. The native shader is lazily compiled, so its failure does not affect ordinary production rendering.

The API exposes `MakeupGL.lastNativeEye` and `lastNativeEyeMs` for local diagnostics; the latter is **CPU submission time only**, not GPU execution time. On invalid geometry, unsupported WebGL2 shader or incomplete framebuffer, saved-photo rendering reverts to the previous opt-in CPU eye-material overlay. It does not silently claim a native result.

Tests:
- `tests/material-eye-native.spec.ts`: standalone WebGL2 face-fitting / visible-skin / colour/clipping / untouched background tests on synthetic light/deep photos, plus degenerate geometry/no-makeup rejection.
- `tests/material-eye-native-integration.spec.ts`: **full saved-photo photo-preparation → `paintLook` → `MakeupGL` path**, comparing the existing generated bare catalog face under the native and baseline shader; requires native application and protected outer-region parity.
- Existing material/CPU/readback/canvas tests remain as regression references, and the native tests run early in GitHub PR CI.

**Verified on commit `216aeccccd7d29ec9740536ba90509a880767c91`:** Node tests, TypeScript typecheck, Vite build, isolated shader/canvas regressions and the full saved-photo native smoke test passed. The streamed download check and full browser suite require their final GitHub conclusion at the current head before declaring the PR completely green.

This milestone is **not** full photorealistic superiority, full native vector eyelashes/liner, native face segmentation/dense geometry, all-42-look migration, or physical-phone 30fps. Blind human evaluation and real-world Android performance profiling remain required.

## Same-context GPU eyeliner + individually anchored eyelashes — 2026-11-17

The experimental `?eyePilot=v2&eyeCompute=native` saved-photo renderer now includes **authored eyeliner and tapered eyelash fibers**, on top of its shader-native pigment. They are generated in `src/lib/material-eye-native.ts` in GLSL ES 3.0 and drawn in the existing `MakeupGL` WebGL2 context; the CPU does not rasterize coverage masks, and this path does not use `gl.readPixels`.

- **Per-eye anatomy:** each upper-lid anchor and brow tangent comes from the current photo. A direction-to-brow unit vector defines outward curl even when the source selfie is rotated. Far/profile eyes with collapsed geometry are suppressed; the closed-eye aperture inhibits individual lash strands.
- **Shape-specific eyeliner:** cosmetic look metadata controls thickness and colour. Wing, fox, siren and longer `graphic` styles use distinct wing lengths. Electric Blue specifies `liner: "graphic"` and a **0.30-eye-span** extension, while Hollywood uses the shorter wing (0.22 spans). Liner geometry is distance-field rendered with subpixel softness.
- **Individually anchored fibers:** strand roots follow the target customer's nine-point upper-lid curve. Strand lengths, densities and irregularities vary by look (natural, volume, dramatic) and taper toward each tip. The shader skips work outside the eyelid ROI and clips below the lid to protect the sclera. All of this remains an experimental research approximation, **not photo-trained eyelashes or proof of cosmetic fidelity**.
- **Camera matching:** image-derived blur is supplied as a uniform to control subpixel ink antialiasing. Fragment output blends authored linear-light ink over the previous makeup render, with bounded RGB encoding and no change outside the authorized eye region or the visibility mask.

**Quality verification:** GitHub PR #23, branch `feat/realism-benchmark-v2`. Commit `392768e6b88cae9bf23918388de23d45504271fe` passed the offline Node tests, TypeScript, Vite build, ten targeted eye-material browser tests, full saved-photo native integration test, and stream-download retry checks. The full application Playwright suite was still running at the last check; **do not treat targeted passes as a completed PR**.

Regression details: an early test incorrectly assumed the shorter Hollywood wing length for Electric Blue. The browser test reported the nine pixels at **(89–90, 163–167)**; verifying the look metadata showed they belong to Electric Blue's intentionally longer graphic wing. The correct 0.30-span protected-eye geometry is now reflected in the test; independent background and sclera pixel-lock checks were retained.

**Not yet solved:** true photorealistic lash/liner depth, individualized lashes based on dense eye segmentation, eyelid occlusion by existing natural lashes, raw camera optics beyond blur, shimmer/rhinestone BRDF, physical Android memory/performance, 42-look migration and real-client photographed makeup comparisons. The original catalog-ratio baseline is still present under the experimental postpass and has not been replaced across the app.

## Native eye micro-shimmer and faceted gemstones — 2026-11-17

The experimental **saved-photo-only** native path `?eyePilot=v2&eyeCompute=native` now includes two look-controlled, shader-native finish materials, in addition to its earlier linear-light eyeshadow, eyeliner and individually drawn eyelashes.

- **Micro-shimmer** is enabled only for looks declaring `accents: ["shimmer"]` (currently Hollywood and Rhinestone in the three-look pilot). Tiny deterministic light-catching particles are generated in the customer's photo coordinate system, blended at low opacity in linear light with a source-photo illumination estimate. The shader leaves the underlying skin texture intact rather than copying high-frequency pixels from the catalog model.
- **Rhinestone facets** are enabled only for looks declaring `accents: ["rhinestones"]` (the Rhinestone pilot). Seven small faceted spots **per valid eye** are anchored between its own upper-lid and eyebrow curves, with spatially offset specular facets. A source-photo-derived light estimate bounds highlight energy. Hard 0/255 clipping is avoided in the new output encoder.
- **Safety:** both effects share the existing analytic eye-region gating and visibility/occlusion mask; no model or network requests are added, no new WebGL context is used, and unrelated pixels take an exact previous-output fast path. The no-makeup control and Electric Blue are unchanged by both finish toggles.
- **Tests:** `tests/material-eye-finish.spec.ts` renders the same generated eye three ways (no finish; shimmer only; shimmer + gems), verifies that only the authorized eye area changes, and checks hard clipping, sclera, occlusion and the style metadata. Included in early PR CI checks.

**Verified source** `f2877fd69e8acff34875977925a4b249d1860676` with GitHub Actions run `43990338747`: Node/offline shell, TypeScript, Vite build, target eye-material/browser tests including the finish test, full saved-photo native integration, and streamed model-download retry **passed**. The long full application Playwright suite was *still in progress* at the last check; that is not a completed full-suite pass. Earlier `866a9048f66bd05d025d294991eff8d53eda1a5b` failed TypeScript on two GLSL string terminators; both were corrected in `f2877fd6…`.

**Limits:** these are procedural glossy approximations, *not* proven physically correct gemstones or a neural high-fidelity finisher. No actual human selfie's makeup appearance has been independently graded; no Android GPU execution/memory measurement has been performed. A fragment shader still draws over the full photo in the native postpass, which may be expensive on low-memory phones. Full release gates and production default remain unchanged.

**Next:** benchmark GPU timers + memory on Android; optimize the second shader pass via a protected framebuffer copy and small eye scissor regions; improve eyelid segmentation and photograph-based blind evaluations before extending beyond the three modified + one negative-control pilot looks.

## Native-fast GPU scissored postpass — 2026-11-17

**New opt-in research mode:** `?eyePilot=v2&eyeCompute=native-fast`, saved photos only, using the same independent/experimental `MakeupGL` native eye-material shader that already renders shade, liner, lashes, shimmer and rhinestone facets. `native` (full-screen GPU) and the normal production renderer remain unchanged.

- The previous native path painted a full-size RGBA8 framebuffer and then ran the expensive eye-material shader over **every pixel** of the portrait even though the eye effect is local.
- `nativeEyeScissor()` in `src/lib/material-eye-native.ts` computes a conservative WebGL2 bottom-left eye-envelope rectangle using *this photo's* eyelid/brow landmarks, lash length, wing extension (including Electric Blue's 0.30-span graphic wing) and camera-edge softness. Invalid geometry disables scissoring, not the whole photo.
- `MakeupGL.render(..., nativeEyeId, nativeFast)` first paints the old full composition to the existing optional RGBA8 target. When `nativeFast` is requested, it copies that target to the default drawing buffer entirely **on the GPU** with `gl.blitFramebuffer`, then enables `gl.scissor` for the conservative eye rectangle and executes the **same** native fragment shader, avoiding shader execution over the unedited background. If blit fails, the shader draws the complete frame. The GPU drawing buffer is never uploaded to a server.
- The newly exposed `MakeupGL.lastNativeEyeFast` distinguishes actual optimized execution from a fallback. CPU time `lastNativeEyeMs` is still a draw-submission duration, **not** GPU execution timing or a proven performance improvement.
- `tests/material-eye-native-fast.spec.ts` compares real saved-photo output of the same generated reference portrait in native and native-fast modes. It checks that the optimized GPU blit path actually ran, unchanged pixels outside the scissor rectangle, tolerances for small in-eye quantization differences, and rejection of invalid eye coordinates. Included in the early CI browser suite.
- The initial fast wiring commit produced a TypeScript error due to a missing `nativeFast` parameter on the serialized `paintGpuNow` worker. Fixed in commit `20368af53c5c127448a9177490e00871fcbdb5a7`.

**Validation on code commit `20368af53c5c127448a9177490e00871fcbdb5a7`:** GitHub Actions run `43991217956` passed Node/offline tests, TypeScript, Vite build, all targeted eye-material/browser tests **including fast/full GPU parity**, and the full saved-photo native integration smoke. At the last observation the streamed model download retry and long full application Playwright suite did not yet have a final result. Do not claim full production readiness from these checks.

**Remaining measurements and safety gates:** measure actual GPU milliseconds using `EXT_disjoint_timer_query_webgl2` when supported; profile video/photo output, GPU memory/thermal cost, eye-shader fragment count and smoothness on low/mid/high-end physical Android devices; perform real makeup-photo blind comparisons. The optimized rectangle can still cover a large portion of a close-up face, and framebuffer blits have driver-specific costs. Preserve the old path and independently prove perceptual quality before rollout.

## Nonblocking real GPU elapsed-time instrumentation — 2026-11-17

This is **development-only performance infrastructure**, not an assertion that native-fast is faster than full native on Android. It runs only on a saved-photo build with the two opt-in settings:

- `?eyePilot=v2&eyeCompute=native&eyeTiming=1` — full-frame same-context GPU eye-material postpass.
- `?eyePilot=v2&eyeCompute=native-fast&eyeTiming=1` — GPU blit plus eye-region scissored postpass, using the existing protected-pixel-safe fallback.

`src/lib/native-eye-gpu-timer.ts` uses the standard WebGL2 `EXT_disjoint_timer_query_webgl2` extension. It starts a `TIME_ELAPSED_EXT` timer around the native eye pass and ends it even if rendering raises; the fast measurement **includes framebuffer blit and shader** (and is relabeled `native` if that optimization falls back). Importantly, `poll()` checks `QUERY_RESULT_AVAILABLE` before ever accessing `QUERY_RESULT`; it does not call `gl.finish`, `readPixels`, wait for sync objects, or upload photographs. It discards all pending/history samples on GPU disjoint or context loss, limits outstanding queries to three, and limits stored samples to **64** locally.

`MakeupGL` exposes `nativeEyeGpuTimingSupported`, `lastNativeEyeGpuMs`, `lastNativeEyeGpuMode`, `pollNativeEyeGpuTiming()`, and `nativeEyeGpuProfile()`. The last provides independent bounded **p50/p95, min/max, and sample count** per actual native mode. `lastNativeEyeMs` is still only CPU submission time; it must not be compared as GPU runtime. If the timer extension is unsupported, all visual rendering is unaffected and GPU readings remain unavailable instead of fabricating a timing.

`tests/material-eye-timing.spec.ts` uses deterministic mocked WebGL2 query APIs to exercise delayed result availability, unsupported extensions, query-cap backpressure, invalid ns, a GPU-disjoint invalidation, context loss, actual fallback-mode labeling and mode-specific bounded p50/p95. `tests/material-eye-native-fast.spec.ts` also renders an opt-in real saved-photo fixture with `eyeTiming=1` and confirms that enabling timing cannot break the pixel-equivalent image path. Both are in CI's short targeted eye-test step.

**Verified on source commit `2595c85d80f90d07e75c9745e1389865b1805d19`, Actions run `43992204888`:** Node/offline tests, TypeScript, Vite production build, targeted eye-material/browser tests (including timing and native-fast parity), full saved-photo native integration and streamed AI download/retry checks passed. The much larger general Playwright suite was still **in progress** at the last recorded check; a complete CI success had not yet been reported. Documentation commits can supersede runs, so check PR #23 current head.

**Next required evidence:** run a repeated, randomized A/B on low/mid/high-end *physical Android devices*, at identical image size and look with a warmed GPU; collect at least 30+ valid, non-disjoint per-mode samples; compare GPU p50/p95, CPU submission latency, FBO memory, sustained thermal/frame-time behavior, and image parity. Timings from CI's software renderer are not proof of physical-device speedup. Real human photographed-makeup blind comparisons and independent quality review are still mandatory before production.

## Shipping policy

1. Production stays on main during research; use a feature flag and pilot branch.
2. Fail closed for changed pixels outside permitted cosmetic regions, introduced hard clipping,
   missing rights, non-consented study data, or lower-quality results on difficult skin/eye cases.
3. Promote one material/eye effect only after screenshot regression, human blind review and
   low/mid-range device performance; keep a measured rollback path.
4. Record the production SHA and independently verify the deployed build, not only GitHub CI.
5. Do not claim visual superiority over competitors until a reproducible independent study
   actually reaches the predeclared target.

Research anchors:
- WACV 2026, Chau et al., Towards High-Fidelity, Identity-Preserving Real-Time Makeup Transfer:
  https://openaccess.thecvf.com/content/WACV2026/html/Chau_Towards_High-Fidelity_Identity-Preserving_Real-Time_Makeup_Transfer_Decoupling_Style_Generation_WACV_2026_paper.html
- ECCV 2024 TinyBeauty: https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/3942_ECCV_2024_paper.php
- FFHQ license: https://github.com/NVlabs/ffhq-dataset/blob/master/LICENSE.txt
- FLUX 3 Image Klein terms: https://huggingface.co/black-forest-labs/flux-3-image-klein
