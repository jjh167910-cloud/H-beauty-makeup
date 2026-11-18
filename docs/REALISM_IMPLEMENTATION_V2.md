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

### Complete-cohort and intersectional quality gate (research continuation, 2026-11-17)

The four predeclared pilot conditions (`no-makeup`, `hollywood`, `electric-blue`,
`rhinestone`) must be evaluated **on each of at least 30 distinct anonymized subjects**.
Passing aggregate sample counts per look is not enough: four disjoint groups of 30 faces
would create 120 comparisons but **zero** subjects with full four-look coverage.
`evaluatePilot` now returns `completeSubjects`, `ratedCompleteSubjects` and
`skinGroupSubjects` for the complete matched cohort, validates consistent skin
stratum per anonymous subject, and requires all four registered pilot IDs.

In addition to aggregate, per-look and per-skin preference, the private report includes
`lookSkinPreference` and `lookSkinWilson95` for each look/skin-depth intersection.
A look-by-skin cell with at least five comparisons and fewer than 50% H-Beauty wins
is a failed quality gate even if both marginal averages are above 50%.
Unpowered cells are reported but not treated as reliable evidence.
The report contains no selfie pixels, landmarks, filenames or identifying subject data.
These tests use synthetic *metadata* and never certify human realism.

### Negative-control contract (2026-11-17)

The pre-registered `no-makeup` condition checks **exact image preservation**,
not beauty preference. Its `paired_preference` may be a genuine tie or omitted:
it does not contribute a synthetic win or loss to cosmetic A/B statistics.
The private audit MUST include `inside_changed_pixels: 0` and the existing
zero-change/zero-new-clipping measurements for every no-makeup case.
Missing inside-pixel evidence is `insufficient-evidence`; any changed
pixel is a hard failure. `untouchedControls` reports complete zero-delta
control checks, and `lookPreference["no-makeup"]` is explicitly null.
The four-look matched-cohort gate remains in force, but Wilson and subgroup
cosmetic preference calculations use only the three **active** makeup looks.
This prevents the honest no-makeup negative control from making a valid
blind comparison mathematically impossible to pass.

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

## Landmark-geometry fail-closed safety increment — 2026-11-17

**Development-branch-only:** The shader-native saved-photo pilot now validates the target customer's actual eyelid/brow/lower-lid geometry before computing pigment, liner, individual lashes or facet locations. This is independent of reference catalog appearance; the aim is to **not hallucinate makeup on invalid or occluded landmarks**, not to invent a plausible new eye.

`src/lib/material-eye-native.ts` exports `nativeEyeGeometryValid`, a small rotation-invariant geometric guard. It checks all nine upper-eyelid landmarks and all five brow landmarks are present and finite, ensures the upper-lid curve projects broadly monotonically along the eye chord, rejects single grossly displaced upper-lid vertices, rejects eyebrows that reverse their order or collapse onto the eyelid chord, and retains the existing per-eye width/eyebrow gap checks. The lower-lid landmark must also be finite, present and on the correct side of the brow direction; a genuinely closed eyelid remains supported (lash strands are disabled by aperture gating). Each eye is checked independently; a malformed far/profile eye is suppressed rather than mirrored. When **both** are invalid, the native eye stage yields no result and the existing fully rendered baseline is preserved. The saved-photo flow now checks `nativeEyeLegacyFallbackAllowed()` before invoking the older CPU eye overlay; that overlay may only run on a native shader/driver failure if **both eyes** have passed the stricter geometry gate. One invalid eye is sufficient to suppress the less-restrictive fallback, rather than adding potentially misplaced ink to that eye.

`tests/material-eye-geometry.spec.ts` exercises real rotations (0°, 37°, 90°, 180°, 270°), monotone and crossed curves, malformed upper vertex, inverted eyebrow ordering, eyebrow-chord collapse, missing/NaN lower-lid points and lower lid illegally moved into the eyebrow region. The existing GPU raster tests and real saved-photo generated catalog smoke test remain in the early CI gate to detect overstrict false negatives. This is still a **heuristic geometry safeguard**, not a learned per-pixel eyelid/occlusion mask; real annotation-driven thresholds for hooded/monolid eyes and challenging poses remain needed.

**Additional fail-closed path:** `src/lib/tryon.ts` now invokes `nativeEyeLegacyFallbackAllowed()` for the opt-in native fallback (code commits `571050fc63447b9f54e57126ddd9155ff86066bc`, `311d7c685b36625bf8006cec14df4416384fafdb`). The extended `tests/material-eye-geometry.spec.ts` verifies strict rejection of one or both malformed eyes, an all-valid positive control and the no-makeup negative control (commit `3550ef6bca9eea3a8eb3ac659e51b00c087f8e77`). This is a safety gate, not a proof of photographic accuracy.

**Implementation commits:** `9a628120aba5990135f859599f3d736f0862847b` (guard), `610a918cb74c37d82b5db0ef06bd4cd5c5c887dc` (browser tests), `7450a7fc67da32d2f29fa52df690d7377cfb9855` (CI gate). No production merge or deployment. Review the latest GitHub Actions before calling these tests passed.

## Live camera capture actionability and full-suite CI regression — 2026-11-17

Full PR verification reached the complete three-shard Playwright suite in `43997291151`. The quality-review job and shards **1/3** and **2/3** passed, but shard **3/3 failed one of its 15 tests**: `tests/tryon.spec.ts:493` (“live mirror paints the look ... a capture becomes a photo try-on”). The other **14 passed**. A structured Playwright failure artifact showed that the visible, enabled `گرفتن عکس` (“Take photo”) button did not complete an automated click before the original **300,000-ms total test deadline** after changing lipstick and toggling studio lighting. The artifact does not prove that the capture handler itself was blocked for five minutes—the total scenario had many steps and substantial model work.

### Actual code fix, not a skipped or disabled test
- `src/lib/live-tryon.ts` (commit `8bca6436dca4dd87357cbbbf5f65bb666240bce2`): the synchronous on-device detection/segmentation/studio/live-GPU draw loop now schedules its next animation frame after a small **9–32 ms quiet period**, adjusted by recent frame work. This gives taps, accessibility controls, and capture events a chance to run even on heavily loaded software renderers. `pauseForCapture()` / `resumeAfterCapture()` suspend expensive live image work without stopping the camera stream.
- `src/components/tryon.tsx` (commit `aa6b93770fa729d7e015dbd59e825a6117567f06`): the capture handler pauses live rendering before extracting/encoding the unmirrored video frame, resumes on failure, and retains the original photo try-on workflow after capture. Normal camera and appearance pipeline preserved.
- `.github/workflows/review.yml` (commit `00f338c36def25f5b964d1929f042f9137a4ed69`): explicitly exercises the previously failing camera-to-photo scenario **before** all three expensive full-suite shards. The pre-existing independent `live-mirror-smoke.yml` also runs this scenario whenever its files change.
- `tests/tryon.spec.ts` (commit `7e5a399b88462e55d82f6cf866062911ae07bfaf`): the long multi-action software-rendered scenario has a **600-second total allowance** while the critical capture click itself must dispatch in **at most 20 seconds**. This keeps real click responsiveness as an enforced assertion rather than only increasing the end-to-end timeout; the post-capture image remains subject to its existing 120-second explicit limit.

### Grounded verification
- GitHub's dedicated independent `Live mirror camera frame regression` workflow run `44000522932` **passed** on the frame-pacing/capture-pause changes (source `00f338c36def25f5b964d1929f042f9137a4ed69`), before the separate stricter-click-budget edit.
- The newest source `7e5a399b88462e55d82f6cf866062911ae07bfaf` has independent live-smoke run `44000741037` and PR review run `44000741018`; they were still running when this section was recorded. Consult the latest GitHub Actions status, do **not** claim a complete green PR until `review`, all three full-browser shards, and the dedicated live-smoke run explicitly pass.
- **No production deployment or main merge.** No real Android physical-device interaction, thermal, battery, GPU p50/p95 or blinded photographic appearance study is implied by a CI pass. The underlying mobile photo capture is still on-device and does not upload private selfies.

## Local-only Android native-eye GPU A/B trial harness — 2026-11-17

The optional CPU/Android benchmark infrastructure now includes a **repeatable on-device A/B runner**, not merely a bare WebGL query. No UI or production behavior changes: the module is never imported by the default salon interface or live camera. Research execution requires explicitly opening `?eyePilot=v2` on the experimental build and calling `runNativeEyeAB(shot)` on a locally prepared saved photo.

- `src/lib/native-eye-gpu-timer.ts` now exposes bounded local timer `snapshot()` and `resetSamples()`; `MakeupGL` exposes corresponding `nativeEyeGpuSamples()` and `resetNativeEyeGpuSamples()` for **nonblocking queries**. Warm-up queries and pending queries are discarded before sampled trials.
- `src/lib/native-eye-benchmark.ts` alternates `native` vs `native-fast` in balanced A/B, B/A order to reduce warm-up/thermal order bias; each candidate is rendered by **the same existing saved-photo pipeline and current customer landmarks**, with its actual GPU blit+shader execution measured. A GPU-driver fast-mode fallback is classified with its actual `native` query, never mislabeled.
- The runner offers a local-only, abortable protocol with three warm-ups per mode, **30 GPU timer samples requested per mode**, soft async yields and bounded draining of late queries. If the tab becomes hidden, it aborts; unsupported extension reports `unsupported-gpu-timer`. No `gl.finish()`, `gl.readPixels()` or uploaded telemetry/photo pixels are involved in the timer/runner.
- `summarizeNativeEyeAB()` de-duplicates sequence IDs, rejects nonfinite, negative, out-of-range GPU measurements and requires **30 valid samples PER ACTUAL MODE** to provide computed median/p95 comparative percentages. A 1-sample CI smoke remains permanently `insufficient-samples` even if it draws successfully. It reports p50/p95/min/max and local counts, with no false claim of certified performance.
- `tests/material-eye-benchmark.spec.ts` checks deterministic percentiles, invalid readings, insufficient evidence, default-production refusal, URL restoration, and a one-per-mode real saved-photo GPU smoke on the repository's generated no-makeup portrait. It is part of the early eye-material CI suite and automatically included in the three-shard full Playwright suite.
- Detailed physical-device instructions: `docs/NATIVE_EYE_ANDROID_BENCHMARK.md` (Chrome Android debugging, fixed same-photo look, local sample reporting and privacy, thermal/memory/interaction QA, three performance tiers).

**Validation state:** Historical PR source `0577894f6797e98ae4855025652c5d8975d83914` was fully green on Actions `44000889530` and live-smoke `44000889876`. The first new benchmark code at source `f2fb74d057c392dee22354c299ee3e9f6eeccd2b` failed TypeScript due an async `document.visibilityState` narrowing; fixed in `f025cc06d880b8d76f1fb8593e89a17bdfcce00d`. New benchmark branch must pass its own latest CI before promotion. No low/mid/high-end physical Android measurements or blind real-photo visual study are available. The `nativeRgba8FramebufferBytes` estimate is **not measured peak GPU memory**.

## Physical-device GPU A/B pixel parity gate — 2026-11-17

The opt-in Android GPU timing runner is now explicitly **blocked by output integrity** before any performance comparison. A faster shader is not acceptable if it changes the person's photo or incorrectly clips makeup.

- `src/lib/native-eye-parity.ts` (new) compares the actual full-resolution `ImageData` from the same saved-photo pipeline rendered once as `native` and once as `native-fast`. It validates a conservative bottom-left WebGL scissor ROI against top-down Canvas2D rows. It returns numeric metrics only: inside/outside pixel counts, changed protected-pixel count, maximum protected RGBA delta, maximum overall channel delta, and whole-image mean absolute channel delta.
- Strict pass: **zero** changed pixels outside the conservative eye ROI, maximum RGBA channel difference **≤3**, whole-image mean channel difference **<0.5**, and confirmation that the corresponding full/fast GPU modes really executed. Incorrect ROI, mismatched image sizes, or unexpected render fallback fail or report unavailable. The opt-in audit does not upload, serialize or save the raw photo.
- `src/lib/native-eye-benchmark.ts` performs parity preflight after initial model/GPU initialization and **before warm-up and timed samples**. A failed audit returns `image-parity-failed`, or `image-parity-unavailable`, without p50/p95 speedup claims. The preflight's two Canvas2D image readbacks may cause a one-off GPU synchronization; they happen **outside measured trials**, and the renderer itself remains free of `gl.readPixels()`, GPU `finish()` and sync waits. Future real phone measurements must still account for thermal/memory impact.
- `tests/material-eye-parity.spec.ts` tests a synthetic 4×3 portrait with inverted GL row coordinates, inside tolerance, *one* altered protected channel causing failure, excessive differences inside ROI, malformed bounds and a real generated-photo integration comparison. The early GitHub CI gate includes it. The existing benchmark smoke test now checks for passed parity whenever timer queries are supported; unsupported GPU timers remain explicitly unsupported.
- This is a **shader equivalence** requirement, not a claim that the original photo has been artistically transformed photorealistically or that the native renderer is better than a competitor. Real consented photos, eyelid/eyeglasses/hair occlusion classes, blinded professional makeup comparison, and physical Android GPU/thermal QA remain mandatory for production.

See `docs/NATIVE_EYE_ANDROID_BENCHMARK.md`, PR #23, issue #24.

## GPU query backpressure and disjoint integrity — 2026-11-17

The local-only Android native-eye A/B benchmark is now robust to **delayed asynchronous GPU query completion** without weakening evidence requirements.

Previously, the benchmark rendered exactly 30 requests per mode while `EXT_disjoint_timer_query_webgl2` could hold only **three** unresolved queries. A driver delay could suppress valid query starts, making the final result unavailable even if the phone rendered correctly. The timer retained only the latest 64 measurements, potentially discarding valid earlier observations during a longer test.

- `src/lib/native-eye-gpu-timer.ts`: exposes a monotonically increasing **sample epoch**. Reset, GPU disjoint, driver-query exception and context disposal invalidate that generation. GPU query results remain asynchronous and local; there is still no `gl.finish()`, blocking readback or upload.
- `src/lib/makeup-gl.ts`: exposes read-only pending query count and sample epoch to the opt-in research runner.
- `src/lib/native-eye-benchmark.ts`: nonblocking poll/yield waits for spare query capacity, accumulates unique sequence IDs before the timer's 64-sample ring buffer can evict them, and retries balanced A/B or B/A draws within **at most 90 submissions per mode** and a **180-second budget**. Any evidence epoch change causes `gpu-evidence-lost` with **no** comparative speedup. Timed draws must actually execute their requested native/fast shader mode or return unavailable. Reported draw counts distinguish real submissions from requested target samples.
- `summarizeNativeEyeAB`: refuses any caller-provided required sample count **below 30 per actual mode**. The 1-sample CI smoke remains insufficient regardless of successful frames; null/unsupported/disjoint/missing data cannot turn into a performance claim.
- `tests/material-eye-timing.spec.ts` exercises pending-query saturation, resetting, GPU disjoint and loss of evidence generation; `tests/material-eye-benchmark.spec.ts` tests the non-negotiable statistical minimum and bounded retry metadata. The prior image-parity gate is unchanged.

This is **benchmark robustness**, not proof that `native-fast` is faster, photorealistic, more energy efficient, or ready for production. Physical Android samples and real photographic artist-blind validation remain required. See `docs/NATIVE_EYE_ANDROID_BENCHMARK.md`.

## Original-photo eyelid microtexture retention — experimental WebGL material pass (2026-11-17)

The original native WebGL2 eyelid pilot used `filled=mix(originalSkin,pigment,opacity)`, attenuating the customer's real fine-grained eyelid surface detail as pigment opacity increased. This is a material realism limitation: eyeshadow should modify reflectance/pigment while retaining visible source skin structure, not replace the eyelid with the synthetic catalog model's texture or a flat painted layer.

The latest **opt-in-only** `NATIVE_EYE_FS` now applies a strictly bounded **source-photo high-frequency residual** after linear-light pigment mixing:

- Read the original customer pixel and four neighboring **customer pixels** (left/right/up/down, clamped within the image). Their center-weighted 5-tap low-pass estimate gives `microtexture = clamp(originalAlbedo - lowpass, ±0.045 linear RGB)`. There is no generated pore noise, AI source texture transfer, skin smoothing or facial-proportion modification.
- Restore at `0.60 × cosmetic pigment opacity`; clamp material output before the final sRGB conversion. Read four extra original texels **only where eyelid pigment opacity is above 0.015**. The existing shader visibility gate, eyebrow/upper-lid geometry, protected pixels, normal/live production isolation and native-fast framebuffer/scissor still apply.
- Existing tests now sample local synthetic fine-skin contrast on **light and deep skin fixtures**, while asserting protected/occluded/sclera pixels, absence of hard clipping, and non-flat pigment. The rest of the saved-photo native, shader parity and live-camera suites remain mandatory. Source commits `f9441537b21c7102fb29ea7514c408efdeda5c9e` and `bbde5aedbfb1fca791571877d58559656ee67086`.

**Limits:** This retains *some* photographed high-frequency source detail and can plausibly reduce plastic-looking eye pigment, but synthetic unit tests do **not** establish a perceptual improvement. Source detail may include sensor noise or imperfections and extra texture reads can cost GPU time. No physically measured Android p50/p95, no certified per-skin-group improvement and no blinded makeup-artist comparisons on consented real photographs are available. This cannot be called state of the art or production-ready; all three pilot looks and the eventual 42-look catalog require genuine representative photo/artist validation.

## Three-site per-eye photometric robustness — 2026-11-17

The prior native eye WebGL2 pigment shader used one source-photo skin-light sample for each contributing eye. Even after correcting inter-eye cross-contamination, a **single** bright specular pixel, dark stray hair, or sensor-noise artifact at that reference coordinate could alter illumination compensation across an otherwise unaffected painted eyelid.

Research-only material update:
- `src/lib/material-eye-native.ts` uses three **original customer photo** source texels, at normalized upper-lid/brow coordinates `along=0.33`, `0.50`, `0.67`, each `24%` of the upper lid-to-brow distance, to derive linear sRGB luminance.
- Take the **median luminance**, rather than the average or a single center value. It rejects one isolated extreme reference value without inventing skin texture. Selection remains confined to the **eye whose pigment/liner/gem contributes the current output pixel**; side-lit left and right eyes remain independent.
- `tests/material-eye-native.spec.ts` now injects **near-black (3) and near-white (250)** source RGB into only the central reference texel. It checks that distant eyelid makeup stays within a strict channel-maximum/mean tolerance, excluding only the direct local 3×3 texture footprint. Uses light and deep synthetic skin; existing protected pixels, no eye/sclera spill, no clipping, eye-isolation and original skin-texture tests remain.
- This adds two texture fetches to the opt-in shader for relevant output pixels; its physical Android GPU cost must be measured with `docs/NATIVE_EYE_ANDROID_BENCHMARK.md`. It is *not* evidence of superior photorealism; hair/eyeglass occlusion and pigment/material reflectance still require consented real-photo tests and artist-blinded ratings.

Commits: `f6a27f2db14d06ba6a28cc4a6f79cee89e536cf0` and `53b479a5c59d2bd4b4a1d7dbfe5133634890ee46`. Retain experiment behind `?eyePilot=v2`, not live/production. Verify all current-HEAD CI before promotion.

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

### Tapered, photo-fitted upper eyeliner wing (research continuation, 2026-11-17)

The experimental WebGL2 native eye shader uses the customer's own upper-lid
curve and measured eye width to position a wing. A uniform-width segment
had a marker-like, rounded tip. Replace it with a continuously tapering
screen-space wedge from the outer lid to the target wing tip: root radius
decreases with segment progress, anti-aliasing follows the already measured
photo blur, and alpha drops to zero beyond the pointed endpoint.

Acceptance is at two levels: synthetic GPU regression requires less visible
wing coverage near the tip than near its root, no change outside a safe facial
ROI, and preservation of legacy color ghost suppression; *actual* cosmetic
fidelity still requires blinded comparisons on consented human photos with
hooded, monolid, occluded and asymmetric eyes. Never confuse the synthetic
tests with that real-world evaluation. This mode is opt-in only.


### Preserving real photographic eyelid highlights — 2026-11-17

Under semi-opaque eyeshadow, the prior native shader could flatten tiny, naturally
occurring specular glints even though its skin microtexture residual was retained.
The opt-in pigment shader now uses an already available **original-photo**
five-site low-pass to detect only positive linear-luminance relief. A bounded
finish-dependent recovery blends back a fraction of the customer's own highlight;
no artificial highlight, pore pattern or skin-smoothing model is introduced.
Matte looks use less recovery than shimmer or reflective ones. Masked-out,
occluded, sclera and protected regions are unaffected. No extra source-image
texture fetches are required, though the changed ALU cost still needs physical
Android profiling.

Targeted WebGL A/B compares recovery on/off on independent light and deep
synthetic skin fixtures and requires the original bright texel's RGB distance
to decrease, zero new hard clipping, and zero changed outside-ROI pixels. The
real-world quality gate is still blind professional review of consented
photographs, including difficult eyelid anatomy and lighting; unit tests are
not evidence of comparative photorealism.

### Native lash fan, physically constrained strands, and visibility-first rejection — 2026-11-17

The prior experimental lash material leaned every strand in the outer direction,
regardless of follicle position, and derived taper from radial distance to the
follicle instead of progress along the arcing fiber. The new local shader maps
outer-to-inner lid position to a signed, bounded lash fan, tapers along the
root-to-tip chord and fades coverage beyond the tip. Inner lashes are shorter,
central lashes rise and outer lashes turn toward the temple. Pigment, lash
count, camera blur and photographed skin are otherwise preserved.

Opaque hair/occlusion masks now short-circuit before expensive per-eye
geometry and multi-point photometry, returning exactly the previous RGBA
pixel. The shader retains normal feathering when visibility is nonzero.
Focused GPU tests cover both eyelash segments and bytewise protected pixels,
plus total occlusion for light and deep synthetic skin. Claims about realistic
appearance or better Android speed require blind consented photo ratings and
physical phone timing; neither is inferred from these tests.

### Restoring the original eyelid seam to remove inherited catalog mascara (2026-11-17)

In the native saved-photo pilot, residual source-model eyeliner and lashes can
persist between the newly generated customer's ink and fibers. The shader now
computes a strictly upper-lid, narrow, feathered restoration seam in each
validated eye's own face coordinates. In this narrow strip it restores the
original customer photo beneath the newly applied native eye material. The
restoration is conditioned on the opt-in `uCleanLegacy` switch, partial
visibility, and validated eye geometry; no cosmetic edits should occur below
the lid on sclera, behind an occluder or outside the face ROI. The shader
continues returning the prior pixel byte-identically where all weights are 0.

Targeted GPU tests inject synthetic magenta inherited mascara, deliberately
turn off all new cosmetics, and insist the source-photo seam is measurably
restored with unchanged sclera/protected pixels. This **does not** establish
that real hooded/monolid eyes look correct, and physical Android GPU cost and
blinded consented artist reviews are still required before release.

### Lens-sized upper-lid restoration and zero-pigment preservation (2026-11-17)

A relative-to-brow `0.16` cleanup band scales to a visibly broad strip on
large face crops and can erase genuine photographic detail above the eye.
Native eye cleanup now stops after at most `1.6 + uInkSoft` source-photo pixels
(or `0.16` times local lid-to-brow gap, whichever is smaller), feathering from
the lashline to its upper limit. The original customer photograph, not the
catalog source, supplies any restored pixels.

When native pigment `uAmount=0`, the large eyeshadow replacement mask must
be zero. This prevents the apparent no-new-makeup control from silently
removing an entire eyelid layer; the separate tightly masked experimental
legacy-seam cleanup remains under `uCleanLegacy` and the visibility mask.
An early GPU regression enforces an exact all-RGBA identity with no cosmetic
passes/cleanup, positive restoration beside the lid with cleanup, zero change
3–4 pixels above it and existing protected/sclera checks. The work is a
technical precondition, **not** an artist-rated photorealism certification.

### Fail-closed curved eyelid / eyebrow collision (2026-11-17)

The original validated eyelid order and adjacent-point jumps, but a single
landmark could move near the eyebrow while still passing both, especially on
partially occluded or low-brow images. The opt-in native material validator now
limits upper-lid displacement from the eye-endpoint chord to 0.32 eye widths
and requires 0.025 eye widths of signed gap below the local interpolated brow.
The tests transform the complete geometry through five rotations, allow a
smooth upper-lid arch, reject a single eyebrow collision, and confirm that
an otherwise valid other eye survives while the unsafe legacy CPU fallback
remains blocked. No photograph is uploaded. The tolerances are deliberately
conservative engineering checks; real varied eyelid photos and blinded artist
review are required to establish safety/coverage and to tune false rejection.

### Occlusion-aware real-photo light reference selection (2026-11-17)

Native eyelid shading originally derived a five-site skin-light reference even
when a reference position was covered by hair or an eyeglass arm. Such pixels
must never be interpreted as the subject's skin reflectance. Each light probe
now uses the existing occlusion visibility texture. Fully visible sites keep
the exact prior nested-median algorithm. Partial references use only the
uncovered samples (trimmed estimate for 3–4, cautious two-site mean if agreeing);
zero or one usable references disables new native pigment, broad eyeshadow
replacement and mica rather than guessing a colour. Eyeliner/occlusion and
local original-photo seam logic remain independent and protected.

The GPU regression masks a source light sample, injects a photographic white
outlier, checks zero far-field pigment contamination while visible pigment
remains, and verifies an original-RGBA-preserving fail-closed outcome when
all five probes are occluded. This incurs additional visibility-texture
lookups; no device speed benefit is claimed without physical Android data.
Real-photo artist review is still required for false negative occlusions.

### Photographic skin texture protection near hair and glasses edges (2026-11-18)

The previous four-neighbour source-photo low-pass included every adjacent
pixel equally, even if that neighbor belonged to dark hair, an eyeglass frame,
or a bright reflection rather than skin. Its artificial light/dark residual
was then reintroduced as 'microtexture' into the new cosmetic material. The
experimental native eyelid shader now applies normalized, squared linear-RGB
contrast weights to its *existing* four neighbors before deriving the local
albedo residual and original highlight. Near-identical skin keeps the same
fine-detail support; a discontinuous material boundary is ignored. Unlike
procedural smoothing, this adds no source pixels, training data or GPU texture
fetches. It does add a few arithmetic operations and needs real Android timing.

The GPU regression paints four neighbors dark or bright next to the same
visible synthetic face pixel, and requires unchanged center RGBA within 2
8-bit levels for both light and deep skin while retaining nonzero native
pigmentation. The original owner photo and fully protected pixels stay
unchanged. These synthetic tests are engineering guards, not a blinded
photorealism judgement on actual human skin.

### Decoupling true photographic glints from edge-safe microtexture (2026-11-18)

CI on `66e456d` exposed a real regression: bilateral rejection of four
normal-colored neighbors surrounding a true bright glint made the local
microtexture low-pass equal to the center, removing the positive residual
used by the highlight-recovery term. The previously strict light-skin test
correctly failed; it must not be weakened. The revised GPU calculation
continues using edge-aware source RGB for microtexture, but detects glints
from the middle-two luminance of the original four neighboring photo pixels
and the independently validated eye-skin reference. A dark hair edge cannot
turn ordinary skin into a false specular point, while a true source highlight
can still survive pigment overlay. Both glint fidelity and hair-edge safety
GPU tests are mandatory; no new source texture reads are introduced.

### Avoiding needless skin-light and grain calculations on opaque native ink (2026-11-18)

The shader formerly ran its five source-photo lighting probes when any
cosmetic line or lash crossed an eye pixel, even when no skin-opacity material
used that photometry. It now requests the eye-light estimate only when actual
pigment wash, shimmer, or a gemstone contributes; opaque liner/wing/lash
regions no longer choose an unrelated illumination estimate. Sparse mica
grain computation is also conditional on active, visible shimmer. The actual
material and original-image preservation formulas are unchanged; no additional
GPU textures, model assets or network operations are introduced.

The GPU test disables pigment, mica and stones, renders real native liner,
then replaces **every original-photo source texel** with a dramatically
different synthetic colour. It asserts that the actual liner rendering
remains *bitwise identical* in all RGBA channels and nonempty. It restores
the source texture and retains all existing protected-pixel, glint, wing,
lash and natural-texture tests. This reduction in theoretical shader work
requires physical Android A/B timing evidence before any latency claim.
