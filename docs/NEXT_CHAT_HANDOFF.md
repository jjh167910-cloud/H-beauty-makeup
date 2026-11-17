# H-Beauty Makeup — cross-chat continuation (living handoff)

**Purpose:** Make the long-running virtual makeup project resumable from any new ChatGPT chat without relying on the previous conversation's context window. **Read this first** in a new chat, then fetch GitHub PR and workflow status. Update this file at the end of every substantial work session.

**Last handoff update:** 2026-11-17 (Europe/Stockholm). The GitHub branch HEAD and current Actions run must be refreshed dynamically; do not rely on a SHA copied into an old chat.

## Repository and canonical links

- **Connected GitHub repository:** https://github.com/jjh167910-cloud/H-beauty-makeup
- **Development PR:** https://github.com/jjh167910-cloud/H-beauty-makeup/pull/23
- **Long-term issue/checklist:** https://github.com/jjh167910-cloud/H-beauty-makeup/issues/24
- **Working branch:** `feat/realism-benchmark-v2` (do not confuse this with `main`).
- **Production `main` at project start:** `7379d767df62e2846209811497e6e5d75a39d023`.
- **Live Worker:** https://h-beauty-makeup.jjh167910.workers.dev/ (not a guarantee PR code is deployed).
- **Updated technical plan:** `docs/REALISM_IMPLEMENTATION_V2.md`.
- **Project's original source:** user-uploaded 18-page `Roadmap.pdf` dated 2026-11-16 (the PDF may NOT be available in a new chat). The implementation specification and this handoff preserve the necessary facts.

## Explicit user intent

1. Push photorealistic virtual makeup quality as high as technically achievable. User prefers rigorous implementation, not a proposal-only response.
2. **Offline/on-device** rendering; do not upload customers' selfies. Download AI assets progressively and cache for offline use. Mobile-first, Persian UI, premium aesthetic.
3. All 42 catalog looks should eventually be accurate; 4 **pilot** looks first. Do not change customer facial identity, natural expression, realistic skin or background.
4. User said **licensing will be resolved separately**. Do not delay renderer and benchmarking work for licensing discussions. This does NOT assert permission to train on any restricted source; check terms before any real commercial training/data import.
5. Preserve production until experimental improvements pass gates; avoid conflating branch/test CI success with actual deployed quality.
6. User often says "continue" and expects tangible commits, tests, and precise verification, without repeated questions.

## Original 18-page roadmap summary (source-derived, not independent verification)

- Root problem F1–F5: catalog looks are ratios/differences of ~900×1200 synthetic catalog images (one model), warped to customers; this bakes source geometry, lighting and artifact transfer into the pipeline.
- F6–F12: live renderer differs from still result; 478 landmarks limit precise lash/lip fitting; UX controls are far below fold; no seamless booking/sharing; tests use synthetic/catalog reference data; before is retouched; code has monolithic renderer plus 42 fallback networks.
- Preserve local offline architecture, resumable downloads, visibility/occlusion, stable landmarks, existing lipstick and pigment physics. Replace source-format photo differences with explicit coverage/pigment/finish/vector lashes and liner.
- Long-term phases 0–8: baseline measurements, visible quick fixes, new look format, dense face understanding, intrinsic lighting/materials, optional neural finish, product UX, engineering consolidation, ongoing look library. Original times 28–44 weeks for one developer were **estimates, not confirmed delivery dates**.
- Quality targets are **aspirational**, requiring blind paired comparisons, real selfies across skin tones/eye types, calibrated shade tests, physical phone FPS, true original photo preservation, and artist validation.

## Implemented on PR #23 (source of truth: live PR commits)

- `scripts/quality/benchmark_v2.mjs`: local pixel-difference metrics; introduced hard/near-clipping detection; independent-customer and skin-group blind preference assessment; uncertainty/insufficient-data status. It does NOT prove photorealism.
- `tests-node/benchmark_v2.test.mjs`: unit tests for guards, confidence clustering and subgroup failures.
- `docs/REALISM_IMPLEMENTATION_V2.md`: versioned quality-engineering design, validation gates, architecture, safe rollout.
- `src/lib/material-eye-v2.ts`: **EXPERIMENTAL** still-image overlay: refit lid/brow shapes from customer's own landmarks; pigment/lighting compositing from original photo; vector liner and individually tapered lashes; physically suggested rhinestone facets on customer eye, optical lens blur to match camera, segmentation/occlusion mask and preview-only operation.
- `src/lib/tryon.ts`: pilot wired **only** to saved-photo WebGL2 path when URL contains `?eyePilot=v2`; it is disabled for regular users, gallery thumbnails, live mirror and default output. Optional 2048px still-photo cap on high-memory devices only.
- `tests/material-eye-v2.spec.ts`: Playwright browser tests for experimental pixel changes, visibility/occlusion, new clipping, negative control and rhinestone highlight distinction.

**Important limitations:** No trained student/final neural model; this is **not** state-of-the-art proof; the photo-ratio GPU baseline is not completely retired. The experimental overlay currently uses a browser 2D CPU per-pixel eye ROI, and has not been measured on physical phones or graded on real customer selfies. A shader-based material pass, dense eye geometry and real photographic benchmarks remain to be built.

## Validation status and known regressions (update with each CI result)

- Existing PR workflow: `.github/workflows/review.yml`; runs Node tests, npm typecheck, Vite build, download/retry Playwright, then full Playwright.
- Node unit tests, typecheck, build and download/retry browser step **passed** in earlier runs. This alone does not imply the entire PR passed.
- A previous **full browser run FAILED** on `tests/material-eye-v2.spec.ts`: 9 changed pixels outside the test's intended eye area (`outsideChanges=9`). That is a concrete pixel-boundary regression, not an artistic judgment.
- Corrective branch commit `adce1070a0b6fe78ec1cabe0f232df9bbcb68587` narrows the liner/lash stencil from -0.36 to -0.27 eye widths to prevent stray pixels, while allowing the wing. **Re-run/verify the latest CI** to confirm that this fix actually works.
- Other recent commits introduced rhinestone facets and a new Playwright test. Their complete browser test result still requires fresh GitHub verification.
- If tests fail, fetch exact GitHub Actions job logs and fix code/test reproducibly. Avoid artificially widening boundaries to suppress true visual spills.

## Prioritized next engineering work (do actual work, not just planning)

1. **Immediate: make PR #23 green.** Fetch current PR head and associated workflow run, inspect failed Playwright logs for `material-eye-v2.spec.ts`, patch known issues, and confirm full suite success. Only then call it passing.
2. **Next: upgrade the experimental still-eye renderer to a proper WebGL2 ROI/material shader** with face-space coverage, pigment translucency, preserved skin albedo/detail, vector paths, physically controlled sheen, and no readback-to-CPU per frame. Bench source/photo parity.
3. **Improve eye tracking and masks:** subpixel lash line and eyelid crease geometry; hooded/monolid and profile behavior; eyelashes and liner must never fall on hair, sclera, glasses or background.
4. **A/B pipeline:** same selfie and look rendered by baseline vs opt-in material renderer, randomized order; measure independent blind preference, artist quality rubric, pupil/lash edge placement, skin-group parity, no clipping.
5. **Migrate all four pilot looks** (no-makeup, Hollywood, electric blue, rhinestone) fully to authored layer recipes; take them across actual supported Android phones; only then expand to all 42.
6. **Material + teacher research:** physically grounded skin/pigment light transport, photo-specific intrinsic decomposition, optional highly realistic neural finisher conditioned on identity/geometry. Teacher output must not change face/background. Train offline on GPU, distill for phone; test quality before enabling.
7. **Product quality and rollout:** still/live alignment, progressive-first-result, mobile UI, share+booking, offline cache and verified live Worker SHA. Remain in feature branch until evidence supports a release.

## Latest engineering continuation — 2026-11-17

The development branch received additional **actual code changes**, not just documentation:

- `src/lib/material-eye-v2.ts`: rejects collapsed brow-to-lid geometry, avoids sclera painting through a tighter stroke mask, hard-caps newly rendered RGB values to 1…254 to avoid hard clipped specular highlights, and has an optional GPU-powered photo path using `?eyePilot=v2&eyeCompute=gpu` (both opt-in).
- `src/lib/material-eye-gpu.ts`: new **WebGL2 RGBA8 linear-light arithmetic kernel** for cropped eye ROI pigment, cosmetic blend, liner/lash/rhinestone opacity. It branches around protected no-op pixels to avoid gamma round-trip drift. It does **not** eliminate the CPU geometry or the GPU readback yet. On GPU failure, the experiment falls back to local CPU without losing the customer's photo.
- `tests/material-eye-gpu.spec.ts`: isolated GPU/browser test for protected byte parity, new pixel clipping, opacity, and invalid-size fail-closed handling; skips only if runner has no WebGL2.
- `tests/material-eye-v2.spec.ts`: added degenerate geometry + sclera tests, rhinestone clipping checks, and saved-photo GPU versus CPU A/B numeric comparison on synthetic fixtures.
- `scripts/quality/benchmark_v2.mjs` and corresponding Node tests: blind comparisons are now also assessed **per individual look**, not only in aggregate; poor-performing looks fail the pilot gate.
- `.github/workflows/review.yml`: new material-eye browser tests run ahead of the long legacy suite and outdated PR workflow runs are cancelled when newer commits arrive (concurrency control).
- **Verified earlier in this session:** Node, TypeScript, build, quick material-eye browser tests and streamed-download/retry tests passed on an earlier feature commit. New GPU integrated branch was subsequently changed: **inspect latest PR checks, do not assume the latest SHA passed**. The full Playwright suite is long-running and may still need fixes.

**Production remains unchanged.** `main` was not merged; Cloudflare Workers was not deployed from this experimental PR.

**Most important next action:**
1. Retrieve the current head SHA of PR #23 and latest `Try-on review` workflow result (the current branch head before this handoff edit was `158d696ef3bdf8b5e9503f6ed6cdc39cf8bbd3d2`; this document commit makes it stale). If a targeted GPU/eye browser test fails, inspect that run's job logs, fix it first, and rerun.
2. **Measure** actual on-device CPU/GPU parity on low, mid and high-end Android, not only synthetic Chrome, including source photo exact pixel lock outside editable regions, introduced hard clipping, p95 latency, memory and power.
3. Move GPU blending into the existing `MakeupGL` target chain to eliminate copy-back into CPU canvas. Add exact per-pixel permissions and retinal/scleral occlusion. Keep a feature flag and preserve the current production renderer.
4. Continue with photo-grounded four-look authoring and real blinded visual reviews. Never claim this pilot is already more realistic without such evidence.

## Latest completed increment: WebGL2 canvas without synchronous eye readback — 2026-11-17

**Repository branch:** `feat/realism-benchmark-v2` in PR #23. **Production `main` stays unchanged.**
At the time of this handoff update, the implemented code commits include:
- `a1435d8c839317e1acd08a6c878be2caf1f44c3e`: expose `compositeEyeGPUCanvas` from the existing WebGL2 compositor without `gl.readPixels`.
- `7077a48e62210f2f1ff5151bbad234deb13e255e`: add masked direct-canvas path in `applyMaterialEyeV2`, including row inversion, span-by-span pixel protection, and readback/CPU fallback.
- `313acb5ef125e345583f1d4b690a3e4b4c3576be`: isolated masked GPU-canvas parity test.
- `bdb8e626e81068eb0c0ffca4f4d862df97f0e8a4`: return the **actually used** eye path (`cpu`, `gpu-readback`, `gpu-canvas`, or `mixed`) and local elapsed milliseconds.
- `639e955e59bfe7449d7ac93c6e27389230fa5b6c`: end-to-end synthetic light/deep textured-skin and occlusion A/B test across all three computation paths.
- `4ec784630774393780475f9ea4438a90eb73c104`: include all targeted material/GPU/canvas checks early in CI.
- `docs/REALISM_IMPLEMENTATION_V2.md`: updated with exact experimental modes and limitations.

**Experimental modes:** `?eyePilot=v2` for CPU, `?eyePilot=v2&eyeCompute=gpu` for GPU+readPixels, `?eyePilot=v2&eyeCompute=canvas` for GPU+masked canvas blits without synchronous pixel readback. Only saved-photo pilot; ordinary production output and live video remain untouched.

**Verification confirmed on feature commit `4ec784630774393780475f9ea4438a90eb73c104`:** Node tests, TypeScript, Vite build, targeted eye-material tests including both GPU tests and end-to-end canvas path, all **passed**. The full Playwright suite was still running; do NOT call it passed until its final conclusion is fetched. Later documentation commits have new workflow runs: check the exact newest branch SHA and run status.

**Still incomplete:** This does *not* eliminate CPU ROI `getImageData` for source/legacy render or per-pixel material weight construction; it does *not* integrate the shader into the existing `MakeupGL` framebuffer chain. Direct masked 2D blits may be slower on some phones, so no measured speedup claim. Real user selfie blind comparisons and artist assessments remain unperformed.

**Exact next code work:**
1. Fetch latest PR #23 head + `Try-on review` run; investigate any full-suite failure, especially newly added `tests/material-eye-canvas.spec.ts`.
2. Build a shader-native mask/geometry stage directly in `MakeupGL`, avoiding the separate WebGL context and intermediate 2D copies. Do **not** remove CPU reference or alter normal production until exact image parity and quality gates pass.
3. Capture device-level p50/p95, peak memory, frame time and identity pixel-protection on low/mid/high-end Android. The new `compute` and `elapsedMs` return fields can help instrumentation, but these are currently measured only in synthetic tests.
4. Use real **consented** photos with true makeup and independent blind review for placement, lashes, deep skin, editorials and occlusions. No image quality claim from synthetic fixtures alone.
5. Update this handoff and issue #24 with actual results, NOT forecasts.

## Current implementation milestone — shader-native eye pigment in existing MakeupGL (2026-11-17)

**Current PR:** #23, branch `feat/realism-benchmark-v2`. **Production main and public Cloudflare site unchanged.**

This session implemented and committed:
- `src/lib/material-eye-native.ts`: GLSL ES 3.0 native face-space upper-lid and eyebrow geometry, material coverage, two authored linear-light pigments per look, per-fragment skin-aware lighting and face visibility. Detects invalid or collapsed eyes, suppresses profile eye hallucination. Native shadow-only pilot for Hollywood, electric blue, rhinestone; no-makeup negative control.
- `src/lib/makeup-gl.ts`: native material stage integrated **within the current renderer's WebGL2 context**, after the main composite. It lazily allocates a single temporary full-size RGBA8 framebuffer and performs a GPU-to-GPU shader pass onto the final canvas, with no `gl.readPixels`, no CPU-built per-pixel eye masks, no separate GPU engine and no intermediary Canvas2D blits. Lazy compile and incomplete-FBO fallback keep default production safe. `lastNativeEye` and `lastNativeEyeMs` diagnose application (elapsed milliseconds are CPU draw submission, *not* GPU time).
- `src/lib/tryon.ts`: only **saved-photo** `?eyePilot=v2&eyeCompute=native` routes into the renderer, not live mirror, guided tutorial or thumbnails; if experimental shader fails, falls back to existing CPU eye overlay.
- `tests/material-eye-native.spec.ts`: synthetic light/deep-colour and occlusion pixel-lock regression, no-makeup control and degenerate-face rejection.
- `tests/material-eye-native-integration.spec.ts`: actual saved-photo preparation → `paintLook` → `MakeupGL.render` integration using the repository's existing generated makeup-free catalog face, verifying native application and the protected outer image region.
- `.github/workflows/review.yml`: early targeted shader regression + native integrated saved-photo test ahead of long full browser suite.
- `docs/REALISM_IMPLEMENTATION_V2.md`: updated with scope, fallback, tests and limits.

**VERIFIED against native integration commit `216aeccccd7d29ec9740536ba90509a880767c91`:** GitHub CI showed Node/offline shell tests, TypeScript typecheck, Vite build, isolated eye-material/browser tests and **full saved-photo native integration test all successful**. The download/retry and the full suite were still running at last observation and may be cancelled when newer docs commits arrive; fetch current SHA/results, do not assume final green.

**Feature flag:** `?eyePilot=v2&eyeCompute=native` on development build only. Legacy `cpu`, `gpu` (readback), and `canvas` experimental modes are still available for A/B. Default remains original production renderer.

**Critical limitations:** native pass covers authored **eyeshadow only**. It still relies on baseline generated-photo layers for liner, eyelashes and rhinestones, and on MediaPipe 478 geometry for the eyelid. It has not been independently compared against real makeup photographs, nor benchmarked on low-end Android. The extra full-size framebuffer could increase GPU memory/per-frame time; a passing desktop smoke test does not imply 30fps.

**Next priorities for any new chat:**
1. Fetch PR #23 latest head, Actions tests, and logs. Fix any failure in the new native integration or full Playwright suite. Preserve opt-in safety.
2. Implement GPU-native physically tapered **liner and individual eyelash primitives**, matching the customer's actual lash curve, with visibility/depth occlusion and controlled softness. Add separate tests on two eye shapes, closed eyes and profiles.
3. Reduce temporary full-size framebuffer allocations or prove affordable memory/performance across three actual Android device tiers; measure GPU timer queries or frame times, not only CPU submission.
4. Test true photographed makeup against baseline with consented, blinded expert review, preserving identity, natural pores and eye geometry; do not claim state of the art without this evidence.
5. Extend four pilot material looks and then the 42-look catalog only after real-photo and performance gates. Update this handoff and issue #24 at every substantial commit.

## Current milestone — GPU-native eyeliner, wings and eyelashes (2026-11-17)

**Work completed in current chat, on PR #23 / `feat/realism-benchmark-v2`:**

- `src/lib/material-eye-native.ts`: the existing **shader-native eyeshadow** now also draws material-coloured eyeliner, shape-specific graphic wings, and subpixel antialiased eyelashes. The roots of individual strands are bound to the customer's MediaPipe upper-lid landmarks. Their density, taper, length and irregularity follow the look recipe (natural/volume/dramatic). Camera-blur-dependent softness, source-eye closing/profiling, and visibility clipping are included. Raw catalogue image/liner artifacts still exist underneath for now.
- `src/lib/makeup-gl.ts`: new `uLift`, `uOpening`, `uLinerColor`, `uLinerWidth`, `uWingLength`, `uLashLength`, `uLashCount`, `uInkSoft` uniforms sent to the existing MakeupGL context. There is **no second GPU context or CPU raster step** in this native mode.
- `tests/material-eye-native.spec.ts`: tests compare GPU raster with and without eyeliner/eyelashes on two synthetic skin depths; assert no changes to protected background, sclera, occlusion, or introduction of hard clipping. A separate test verifies a profile far eye is suppressed and the closed-eye aperture reaches zero (strands are conditional on this aperture).
- **Regression diagnosed and fixed in test:** Electric Blue uses `liner:"graphic"`, with a 0.30-eye-span wing. The initial guard assumed Hollywood's 0.22-span wing, falsely flagging pixels at **x 89–90, y 163–167**. Corrected the test to the actual catalog geometry; a separate stricter background check remains in place.
- `docs/REALISM_IMPLEMENTATION_V2.md`: updated with design, test evidence, limitations.

**Verification on committed source SHA `392768e6b88cae9bf23918388de23d45504271fe` (CI run `43987081850`):** Node/offline shell, TypeScript typecheck, Vite build, all **10 targeted material-eye tests**, **end-to-end saved-photo native integration test**, and **streamed download/retry test** passed. The **full Playwright app suite was still in progress** when documentation was subsequently updated. Check current branch HEAD and current Actions; do NOT assert the full suite passed unless GitHub reports the final conclusion. Documentation commits trigger fresh PR CI and may cancel prior ones due to concurrency.

**Feature flag remains unchanged:** `?eyePilot=v2&eyeCompute=native` in a development build, **saved-photo only**. Ordinary customers and live mirror still use the old renderer. **Production main and Cloudflare site have not been merged or deployed.** No real-photo blind evaluations or Android performance certification yet.

**Next exact engineering tasks:**

1. Read PR #23 latest HEAD, its GitHub Actions result and logs. Fix any regression. Let at least one full app test suite complete before promoting the branch.
2. Add GPU-native makeup **rhinestone facets and eye shimmer/finish** that share the actual photo's light and eyelid; prove no clipping, lens-consistent specular highlights, and no unauthorized edits.
3. Improve eye landmarks beyond the sparse 9-point lash curve: real eyelid crease, natural lash self-occlusion, hooded and monolid eyes, glasses/hand occlusion, near-closed/smiling eyes, extreme profiles. Introduce accurate per-region coverage and compare against annotated photos.
4. Benchmark GPU execution time (not only CPU submission) and peak memory on representative low/mid/high-memory Android devices. Keep the CPU/reference fallback and deterministic feature flags.
5. Validate real consented photographs with independent blind comparisons, especially dark skin, liner/lash precision, and no identity/skin texture distortion. Only expand to 42 catalog looks and production if objective quality gates pass.
6. Update this handoff, issue #24 and PR #23 description with precise commits/tests for cross-chat continuation.

## Latest completed engineering increment — native eyelid shimmer + rhinestones (2026-11-17)

**Canonical branch:** `feat/realism-benchmark-v2`; PR #23, tracker issue #24. **Production main / public Cloudflare site unchanged.** Read the PR head and latest CI first; branch SHAs below describe historical commits, not necessarily current HEAD after this handoff edit.

### Committed implementation
- `src/lib/material-eye-native.ts` now generates two additional independent **WebGL2-native** photo-coordinate materials:
  - sparse deterministic micro-shimmer enabled by the look metadata `accents: ["shimmer"]`; soft linear-light highlight blend, limited density, no catalog reference texture;
  - seven face-fitted small gemstone facets per valid eye enabled by `accents: ["rhinestones"]`, with eye-specific positions (upper lid to brow), offset specular reflections, illumination adaptation, hard-clipping prevention and the pre-existing face visibility mask.
- `src/lib/makeup-gl.ts` passes `uShimmer` and `uRhinestones` uniforms to the already integrated **single WebGL2 context** shader. No CPU eye ROI painting, extra WebGL context or synchronous `gl.readPixels` in the native photo pipeline.
- `tests/material-eye-finish.spec.ts` added as a browser regression: the same eye with finishes off, shimmer on, and shimmer + gemstones; check isolated material differences, visual geometry, hard RGB clipping, sclera, occluded pixels, protected background and per-look gating. Included early in `.github/workflows/review.yml`.
- `docs/REALISM_IMPLEMENTATION_V2.md` updated with architectural, photographic and rollout limits.

### Exact validation history
- Source commit `866a9048f66bd05d025d294991eff8d53eda1a5b`, initial CI `43990214858`: FAILED **typecheck** due two unterminated GLSL strings in the TypeScript shader array. This was a plain syntax defect, not a runtime image regression.
- Source commit `f2877fd69e8acff34875977925a4b249d1860676`: fixed both malformed string terminators. CI run **43990338747** passed Node/offline tests, TypeScript, Vite build, **targeted eye shader/browser tests including new facets + shimmer test**, **native full saved-photo integration smoke**, and **model download/cancellation/retry**. The **full `Try-on tests` browser suite was still in progress** when this handoff was prepared; do not assert full-suite success.
- Documentation commits may cancel superseded CI runs by workflow concurrency. Always fetch the **latest PR #23 HEAD SHA** and Actions jobs for the up-to-date outcome.

### Remaining technical/quality risks
- Shader-rendered gem facets and particle shimmer are carefully bounded procedural approximations; no real-photo evidence of state-of-the-art visual quality or gemstone physics.
- Full-size final second-pass framebuffer may have significant memory cost; no Android GPU execution-time measurement, power evaluation, sustained FPS, or thermal profiling.
- Existing catalog photo-ratio layers still contribute underneath the pilot for much of the face. Neural image-quality teacher and genuinely authored 42-look material migration not complete.
- Eyelid contour uses nine upper-lid anchors and five brow anchors; hooded/monolid, glasses and occluded faces require dense geometry and independent photographic QA.

### Most useful next implementation task
1. Inspect current PR #23 latest Actions run. If full test suite failed, fetch exact job logs, fix the failures and rerun. Confirm a complete **green** run, not only targeted tests.
2. Benchmark GPU stage using `EXT_disjoint_timer_query_webgl2` when available; distinguish CPU submission time from GPU time. Guard low-memory devices.
3. Replace the expensive fullscreen eye postpass with safe GPU-to-GPU base-framebuffer copy and per-eye rectangle scissor redraw, preserving an exact untouched-pixel path and testing the row orientation. Keep the native flag and CPU fallback. This can improve Android energy use without sacrificing cosmetic detail.
4. Improve dense eyelid and occlusion geometry and blinded real-photo assessments for lashes/liner, darker skin, hooded eyes and jewel placement; only then expand all 42 looks and production rollout.
5. At the end, update **this** file, PR #23 and tracker #24 with verified commits, tests, blockers and the next exact code edit.

**To resume in another chat:** "Continue H-Beauty Makeup's highest quality offline/on-device virtual try-on. Read `docs/NEXT_CHAT_HANDOFF.md` on branch `feat/realism-benchmark-v2`, PR #23, issue #24, and current GitHub CI. Fix any failures and implement the next validated GPU-stage improvement. Commit work to the research branch, preserve production, and update the handoff again."

## Current session — same-context native-fast GPU eye rendering (2026-11-17)

**Canonical work:** connected GitHub repo `jjh167910-cloud/H-beauty-makeup`, research PR #23, branch `feat/realism-benchmark-v2`, tracking issue #24. **Production main and Cloudflare site have not been changed**. New code is only reachable in saved-photo opt-in mode.

### Concrete implementation
- `src/lib/material-eye-native.ts`: `nativeEyeScissor()` produces a conservative WebGL bottom-left scissor rectangle based on *customer's* upper-lid/brow landmarks, wing tip length, eyelash curl and optical soft edge. Invalid/nonfinite landmarks fail closed to a full-frame native draw rather than clipping the customer's eye.
- `src/lib/makeup-gl.ts`: new optional `nativeFast` argument. Base image is first rendered to the already-existing optional RGBA8 framebuffer, copied directly GPU-to-GPU with `gl.blitFramebuffer` to the drawing buffer, then the same native shadow/liner/lash/shimmer/facet fragment shader runs only within the bounded eye region. This removes expensive fragment shader invocation over most of the background on suitable photos. Driver blit failure falls back to full shader. No `gl.readPixels`, extra GL context, CPU eye ROI painting or network upload. Diagnostic `lastNativeEyeFast` confirms actual optimized-path use.
- `src/lib/tryon.ts`: separate saved-photo-only URL flag `?eyePilot=v2&eyeCompute=native-fast`. The existing `?eyePilot=v2&eyeCompute=native` remains the **unchanged reference** and normal production output remains unchanged. Serialized renderer worker now takes `nativeFast`.
- `tests/material-eye-native-fast.spec.ts`: compares both paths on the same repository-generated reference face, verifies true scissor execution, byte-exact protected regions, near-equal in-eye output, and invalid-bounds handling. Added to the early PR browser CI step.
- `docs/REALISM_IMPLEMENTATION_V2.md`: updated with architecture, meaningful limitations, CI status and next performance gates.

### CI status and precise commit references
- Initial wiring source code compile failed on `tryon.ts` because the `paintGpuNow` worker was missing the new `nativeFast` argument; **fixed** in source commit `20368af53c5c127448a9177490e00871fcbdb5a7`.
- On **commit `20368af53c5c127448a9177490e00871fcbdb5a7`**, GitHub Actions workflow run **`43991217956`** passed the Node/offline shell, TypeScript typecheck, Vite build, and **expanded targeted browser tests including the fast/full GPU output parity and protected-pixel checks**, plus the full saved-photo native smoke integration test. The streaming model download and general `Try-on tests` full Playwright suite had **not** both completed at the last inspection. Later documentation commits launch new runs and may cancel earlier ones; do not claim a complete green run without checking the latest run's final conclusion.
- Last recorded source-code head BEFORE documentation commits: `20368af53c5c127448a9177490e00871fcbdb5a7`. **Refresh the PR head**, as documentation updates create newer commits.
- No live deployment, main merge, real human makeup photo A/B, physical Android performance measurement, or verified state-of-the-art claim.

### Highest-value next work
1. Fetch GitHub PR #23 current head SHA and latest `Try-on review` jobs. Read any failed job logs and fix tests. Confirm a **complete** CI run (the long suite has been repeatedly cancelled by incremental development commits).
2. Add genuine GPU execution-time benchmarking via nonblocking `EXT_disjoint_timer_query_webgl2` query polling (never block camera with `gl.finish` or readPixels), with CPU fallback and context loss handling. Compare `native` and `native-fast` on a real low/mid/high-end Android device. Test GPU memory overhead and sustained thermal FPS.
3. Enhance dense eye geometry/occlusion: 478 sparse landmarks do not reliably capture all crease and lash conditions, especially monolid/hooded eyes, eyeglasses, hands and high yaw. Preserve identity and source-photo skin pores at eye borders.
4. Run explicit real photographed-makeup blind comparisons across skin depths and styles. Treat source catalog ratios beneath the new shader as unresolved until four pilot looks are fully authored, then migrate all 42 only with pass/fail evidence.
5. Always update issue #24, PR #23 and `docs/NEXT_CHAT_HANDOFF.md` when finished. Do not merge/deploy until safe.

**Suggested new-chat prompt:** "Continue H-Beauty Makeup's highest-possible photorealistic, offline virtual try-on. Read `docs/NEXT_CHAT_HANDOFF.md` in branch `feat/realism-benchmark-v2` of `jjh167910-cloud/H-beauty-makeup`, PR #23, issue #24 and current CI. Fix failures, implement GPU timer-query benchmarking and real-device performance safeguards, commit tested work on the branch, preserve production and update the handoff."

## Latest session: native GPU timer queries + per-mode p50/p95 (2026-11-17)

**Active work:** GitHub `jjh167910-cloud/H-beauty-makeup`, branch `feat/realism-benchmark-v2`, open PR #23, tracking issue #24. **Production main and Cloudflare site unchanged.** This section is the newest engineering milestone, above the generic start procedure.

### Actual commits and files
- New `src/lib/native-eye-gpu-timer.ts` — **local, nonblocking WebGL2 GPU timer** using `EXT_disjoint_timer_query_webgl2` and `TIME_ELAPSED_EXT`. It checks readiness before result retrieval, has a maximum of three pending queries and retains only 64 completed measurements, discards all measurements on GPU disjoint/context loss, never calls `gl.finish()` or `readPixels()`, never uploads image data. It distinguishes the actual `native` vs `native-fast` path even after a blit fallback. Exposes per-mode p50/p95/min/max/sample counts.
- `src/lib/makeup-gl.ts`: native same-context eye shader pass is instrumented **only if `eyeTiming=1` on the research URL**. Query wraps blit + shader for native-fast and full shader for native; `try/finally` guarantees termination. Exposed `nativeEyeGpuTimingSupported`, `lastNativeEyeGpuMs`, `lastNativeEyeGpuMode`, `pollNativeEyeGpuTiming()`, and `nativeEyeGpuProfile()`. Separate pre-existing `lastNativeEyeMs` is **CPU submission time**, not GPU time. Timer cleans itself up on WebGL context loss or renderer dispose.
- New `tests/material-eye-timing.spec.ts`: synthetic/mock browser tests for unsupported extension, delayed results (no blocking retrieval), correct ns→ms conversion, disjoint/history invalidation, context loss, query backlog, negative readings and mode-specific bounded p50/p95. Added to short targeted Playwright CI step.
- `tests/material-eye-native-fast.spec.ts`: enabled `eyeTiming=1` during photo-render parity checks; timer support is allowed to be absent on a software runner, and results never block the photo.
- `docs/REALISM_IMPLEMENTATION_V2.md`: updated architecture, exact diagnostic flags, and real Android measurement protocol.

### Exact test result
Source commit `2595c85d80f90d07e75c9745e1389865b1805d19`, GitHub Actions **run `43992204888`**:
- **PASSED:** offline Node tests, TypeScript, Vite build, all targeted eye renderer and GPU timing browser tests, end-to-end saved-photo native smoke, streamed AI model download/cancel/retry.
- The long general `Try-on tests` Playwright suite was **still running** at the time of this update and is NOT claimed green; the subsequent documentation commit may cancel superseded jobs automatically. Check latest PR HEAD and Jobs URL, because each new commit retriggers CI.
- The code is compiled and browser-tested but **no real Android GPU performance measurements exist**. No performance gain, state-of-the-art photorealism or physical smartphone validation is asserted.

### Research flags
- `?eyePilot=v2&eyeCompute=native&eyeTiming=1` measures native eye shader GPU elapsed time.
- `?eyePilot=v2&eyeCompute=native-fast&eyeTiming=1` measures the *same* native shader plus same-GPU-context blit/scissor in the optimized mode. The existing `native` and `native-fast` image paths also work without `eyeTiming`.
- Only in the **saved-photo** opt-in branch; default/live mirror and production unchanged.
- Current `gpu()?.nativeEyeGpuProfile()` returns per-mode last 64 local measurements. Unsupported extension => empty samples rather than a made-up time.

### Next highest-value actions
1. Inspect PR #23 newest SHA, latest CI outcome and failure logs. Fix any failures and allow one **complete** full Playwright suite to finish green before merging or deploying.
2. Collect **actual real-phone** GPU measurements: randomized A/B native vs native-fast on low/mid/high-end Android, 30+ valid queries per mode with the same photograph/look/output resolution, warmed GPU, and no disjoint results. Check p50/p95, extra fullscreen RGBA8 buffer memory, peak usage, sustained thermal behavior and battery cost; never equate CPU submission ms with GPU execution ms. No connected physical Android device is currently available in this chat.
3. Improve direct per-eye scissor geometry on hooded, monolid, near-closed, glasses, extreme yaw/occluded photos; test with annotated self-consented images while preserving pixels outside authorized masks.
4. Perform genuine real makeup photos versus candidate renders blinded with artists. Quality targets remain native photorealistic lashes, liner, pigments, skin pores and rhinestone optics; expand from the three pilot looks plus no-makeup control to all 42 only when evidence warrants it.
5. Update this file, PR #23 and issue #24 after each verified milestone. The next chat should proceed without asking for the original roadmap.

## Latest increment — rotation-invariant eye geometry fail-closed guard (2026-11-17)

**Canonical state:** `jjh167910-cloud/H-beauty-makeup`, branch `feat/realism-benchmark-v2`, open PR #23, engineering tracker #24. **Production main and public Cloudflare remain unchanged.** The only customer-accessible renderer remains the old default; these checks apply to the opt-in saved-photo material pilot.

### What changed in GitHub
- `src/lib/material-eye-native.ts` (code commit `9a628120aba5990135f859599f3d736f0862847b`): new exported `nativeEyeGeometryValid()` checks nine upper-lid and five eyebrow points individually on both eyes. Its rotation-invariant eye-chord projections reject impossible reversed/crossed eyelid curves, drastic single-point displacements, reversed or flattened eyebrows, and finite-point errors. Additionally the **lower** eyelid point must be present and finite and must not jump above the upper eyelid into the brow's halfspace. Missing lower-lid landmarks no longer throw a rendering exception. Closed lids remain valid for shadow but original lash aperture gate suppresses strands. Per-eye failure never hallucinates an opposite eye.
- `tests/material-eye-geometry.spec.ts` (commit `610a918cb74c37d82b5db0ef06bd4cd5c5c887dc`): positive controls with the same target eye geometry rotated by 0/37/90/180/270 degrees; negative controls for crossed/wildly distorted lid, inverted/flattened brow, missing/NaN lower lid, and lower lid intruding into the eyebrow region. The tests never use private customer photographs.
- `.github/workflows/review.yml` (commit `7450a7fc67da32d2f29fa52df690d7377cfb9855`): new test added to early targeted GPU/eye browser gate.
- `docs/REALISM_IMPLEMENTATION_V2.md`: updated with implementation and quality caveats.
- Previous source branch head `16839ca330e778521d4de8e704e7b3e02606d88d` had passed Node/offline, TypeScript, Vite, GPU timing/eye shader targeted tests, native saved-photo and streamed download checks. **General Playwright suite was still running and was cancelled by the next source code commit; do not claim complete green CI.**

### What is NOT validated yet
- New geometric thresholds are engineering heuristics, not annotated clinical/artist labels for monolid, hooded eyes, hands/glasses, high yaw, wink/smile, etc. CI has to show existing catalog face acceptance and all targeted regression tests PASS before considering this gate safe.
- Independent real makeup-photo blinded quality review, facial identity/skin microtexture tests on actual consented photographs, production Android GPU speed/memory/thermals and all 42 catalog styles are not done.
- GPU `eyeTiming=1` local nonblocking query and per-mode p50/p95 from last session are still implemented, but no real smartphone readings have been captured.

### Next exact tasks
1. Fetch PR #23 **current HEAD** and newest `Try-on review` GitHub Actions job steps. If `tests/material-eye-geometry.spec.ts`, `tests/material-eye-native.spec.ts` or full saved-photo integration fails, read job logs, fix precisely, rerun. **Never mistake a queued/cancelled/full-suite-in-progress job for a green build**.
2. Once targeted checks pass, preserve this version and seek **one complete full Playwright suite result** (prior continuous commits have repeatedly cancelled long runs). Do not merge PR #23 to main solely for a CI pass.
3. Further quality work must include annotated, consented real portrait data across monolid, hooded, closed, low light and occluded eye geometries. Preserve pixel identity outside the precise eye material masks and exclude failed geometry rather than guessing.
4. Use existing opt-in flags `?eyePilot=v2&eyeCompute=native` and `native-fast`, optionally `&eyeTiming=1`; collect randomized GPU p50/p95 on actual Android devices rather than trusting software renderer timing. Guard GPU memory and device crashes.
5. After each material change, update issue #24, PR #23 and this handoff with exact verified test results and branch SHA. Production default and offline privacy stay stable.

## Follow-up safety closure — reject invalid eye geometry in legacy CPU fallback (2026-11-17)

After adding rotation-invariant native landmark validity checks, a second risk was found and fixed: the saved-photo native GPU failure path originally retried the old CPU eye overlay even when the native shader had rejected the customer's distorted, missing or occluded eye landmarks. The CPU reference accepts a wider set of geometries and could have repainted such an eye.

**Completed on PR #23 experimental branch:**
- `src/lib/material-eye-native.ts`: new exported `nativeEyeLegacyFallbackAllowed(P, look, level)`. It returns true only if **both** eyes passed strict native landmark validation (current intended rule); otherwise retain the existing baseline-rendered photograph instead of running the less-strict experimental CPU overlay. Code commit `571050fc63447b9f54e57126ddd9155ff86066bc`.
- `src/lib/tryon.ts`: before any native-to-CPU fallback, gate the call to `applyMaterialEyeV2` with `nativeEyeLegacyFallbackAllowed`. Non-native legacy test modes are not changed. If one native eye is valid, the native GPU path may still render that eye independently; if the GPU stage fails, reject the CPU overlay for the whole photo to avoid inventing the invalid eye. Commit `311d7c685b36625bf8006cec14df4416384fafdb`.
- `tests/material-eye-geometry.spec.ts`: added two-good-eyes positive control, one-bad-eye / both-bad-eyes rejection and no-makeup negative control. Commit `3550ef6bca9eea3a8eb3ac659e51b00c087f8e77`.
- `docs/REALISM_IMPLEMENTATION_V2.md`: updated with the actual preserved-baseline behavior, superseding its earlier wording about a generic fallback.

**Verification:** The newest Actions run was queued at the time of the documentation update. Do NOT call the new geometry or fallback tests green until the current PR head run's early targeted step and full saved-photo integration have passed. The previous source commit prior to geometry modifications passed the targeted WebGL, offline/TS/build, integration and streamed-download checks, but the very long application suite was cancelled by continued source commits. **Main/production unchanged.**

**Next step:** Check current PR #23 head and GitHub `Try-on review` run. Fetch logs and fix if new strict geometry rejects the existing generated catalog photo; keep a strong safety gate rather than loosening to satisfy an invalid fixture. Once targeted and integration pass, allow a full app-suite run to finish. Real portrait/Android GPU-quality evidence remains necessary for any public rollout.

## Most recent work — live camera input responsiveness and capture safety (2026-11-17)

**Project:** `jjh167910-cloud/H-beauty-makeup`; experimental PR #23; source branch `feat/realism-benchmark-v2`; issue #24. **Main/Cloudflare production untouched.**

### First complete sharded run revealed a single real failure
GitHub Actions `43997291151` on source SHA `d754662b6aaa42e677998e094ed69ecad052da12`: required targeted `review` job succeeded; full shard **1/3** succeeded; shard **2/3** succeeded; shard **3/3** finished failure with **14 passed / 1 failed**. The only failed test: `tests/tryon.spec.ts:493` live camera to captured photo after switching the look, lipstick, and studio lighting. Playwright artifact `tryon-full-shard-3` reported the **300-second TOTAL scenario timeout** during a click on visible, enabled `گرفتن عکس`. This was not evidence of five full minutes blocked in one click; the test had already spent time on CPU-heavy model work.

### Changes already pushed
- `src/lib/live-tryon.ts`: commit `8bca6436dca4dd87357cbbbf5f65bb666240bce2`. A **9–32 ms adaptive idle interval** follows each synchronous live-video detection/segmentation/studio render; gives input events time rather than scheduling heavy animation frames back-to-back. New `pauseForCapture()/resumeAfterCapture()` suspend live painting without losing camera stream.
- `src/components/tryon.tsx`: commit `aa6b93770fa729d7e015dbd59e825a6117567f06`. Capturing a still frame pauses heavy live processing first; resumes if capture fails, and otherwise follows the existing offline still-photo try-on.
- `.github/workflows/review.yml`: commit `00f338c36def25f5b964d1929f042f9137a4ed69`. The previously failed live-capture case is now a named early gate before the full three-shard suite. The repository's existing `.github/workflows/live-mirror-smoke.yml` also runs it independently on affected file changes.
- `tests/tryon.spec.ts`: commit `7e5a399b88462e55d82f6cf866062911ae07bfaf`. Entire heavy multi-step journey given **600s**, but the critical capture `.click({ timeout: 20_000 })` and post-capture result appearance **120s** remain strict; no test has been skipped or changed into a mock.
- `docs/REALISM_IMPLEMENTATION_V2.md`: comprehensive diagnosis and released-vs-research scope.

### Results explicitly verified, and not yet verified
- **PASS:** dedicated `Live mirror camera frame regression` CI **run 44000522932** on source `00f338c36def25f5b964d1929f042f9137a4ed69` including the real live camera/photo flow, frame scheduling and capture pause. That was before changing the test timeout.
- **PENDING at documentation time:** independent live-smoke `44000741037` and main PR review `44000741018` for source `7e5a399b88462e55d82f6cf866062911ae07bfaf`. Documentation updates create a newer head and may automatically cancel the prior main review (but not necessarily the separate live-smoke).
- The new CI full-shard pipeline from the prior commit successfully distributed all tests; no coverage skipped. Need a complete green **review + 3 shards** for the latest code before considering merge, and even then no public rollout without real-photo and Android evidence.

### Next instructions, no user clarification needed
1. Query PR #23 current head and latest GitHub Actions. Make sure the independent live-camera smoke is green after the **20-second click** budget, then check the new main `review` and all three full-browser shard conclusions. If a shard fails, fetch its exact decoded GitHub job log and artifact; implement the precise fix without bypassing the assertions.
2. If all tests pass, **do not merge to public main automatically**; the app's visual photorealism remains unproven on real consented makeup photographs. Begin low/mid/high Android device p50/p95 actual GPU timing using existing `eyeTiming=1` opt-in, and blind artist comparisons of 4 pilot looks.
3. Track whether 9–32ms quiet intervals improve actual tap latency and the live FPS/thermal balance on a physical Android device. Tune only on real evidence; don't assert a specific FPS from CI's software renderer.
4. Update `docs/NEXT_CHAT_HANDOFF.md`, `docs/REALISM_IMPLEMENTATION_V2.md`, tracker issue #24 and PR #23 after making verified changes. Every commit of handoff may rerun the PR Actions due current workflow design.

## Latest increment — privacy-safe physical-Android GPU A/B benchmark harness (2026-11-17)

**Canonical project:** `jjh167910-cloud/H-beauty-makeup`, branch `feat/realism-benchmark-v2`, open PR #23, issue #24. **Main/Cloudflare production unchanged.** Read the CURRENT PR HEAD and Actions runs; docs commits increment SHAs.

### Ground truth before the new implementation
The previous latest code SHA `0577894f6797e98ae4855025652c5d8975d83914` **PASSED ALL REQUIRED CI**: GitHub Actions `44000889530` review and **three of three full Playwright shards** success, separate live camera smoke `44000889876` success. The live camera click fix and the new native geometry/fallback gates were fully tested then. This did not prove photorealistic image quality or Android timing.

### Files added and modified in this session
- `src/lib/native-eye-gpu-timer.ts`: bounded local GPU timer `snapshot()` + `resetSamples()`, allowing exclusion of warm-up queries and full retention of actual query-mode labels; no photo pixels.
- `src/lib/makeup-gl.ts`: thin `nativeEyeGpuSamples()` + `resetNativeEyeGpuSamples()` local diagnostics, unchanged default GPU pipeline.
- New `src/lib/native-eye-benchmark.ts`: **private, opt-in research helper** `runNativeEyeAB(preparedShot)`. Uses `?eyePilot=v2` feature gate, prepares a balanced 30 A/B or B/A paired trials of standard native eye shader vs scissored framebuffer-blit native-fast shader, with 3 warm-ups per mode. Each successful draw shares the SAME local photo and look; the report never includes face pixels, landmarks, names or device identity. Query extension unavailable yields `unsupported-gpu-timer`; hidden/aborted session yields `aborted`; fewer than **30 valid, nonduplicate WebGL2 GPU elapsed queries for each ACTUAL mode** yields `insufficient-samples`, never a reported speedup. Per-mode p50/p95/min/max and speedup percentage are exposed only when sample counts suffice. Fast driver failure samples stay classified as native; no fake benchmark win.
- New `tests/material-eye-benchmark.spec.ts`: browser checks of 30+30 deterministic fake-GPU percentiles, invalid/duplicate values, insufficient samples, refusing to run without research feature flag, URL restoration, no photo in results, and one-per-mode smoke through the existing generated no-makeup saved portrait; the latter must **never** qualify as statistically sufficient. Added to early targeted `review.yml` and the already sharded general full suite.
- `docs/NATIVE_EYE_ANDROID_BENCHMARK.md`: Android Chrome DevTools protocol with a locally bundled synthetic no-makeup fixture; physical low/mid/high tier privacy-safe QA checklist and runnable console command. Not installed in public salon UI.
- `docs/REALISM_IMPLEMENTATION_V2.md`: architecture and honest validation limits updated.

### CI state
- New benchmark code committed across several revisions, with source `f025cc06d880b8d76f1fb8593e89a17bdfcce00d` fixing a TypeScript visibility-narrowing failure present in `f2fb74d057c392dee22354c299ee3e9f6eeccd2b`. The earlier failed source **is not green**.
- Browser benchmark targeted suite and complete Playwright suite were **not yet confirmed at the current documentation HEAD** when this handoff was prepared. Check latest PR #23 Actions `Try-on review` and independent `Live mirror camera frame regression`. Docs commits retrigger CI and can cancel in-flight previous SHA runs.
- **No physical Android device was connected or tested**; absolutely no claim that native-fast is faster, that energy or memory usage is acceptable, or that output beats competing apps. Benchmark results from software renderer or mock tests only validate the *harness*.

### Next implementation tasks
1. Fetch current PR HEAD; inspect newest `Try-on review` steps. If `tests/material-eye-benchmark.spec.ts` fails or TypeScript/test integration fails, fetch the exact job logs and fix the code **on this branch**, do not skip tests.
2. After a complete green CI, produce a documented opt-in mobile QA execution workflow that can collect actual valid on-device GPU p50/p95 on multiple Android tiers without leaking customer portrait bytes. The existing research helper can run in Chrome DevTools; no external model inference or image upload required. Collect >=30 valid queries per mode with balanced order, track heat/memory/battery and tap latency. If any GPU extension unavailable, report unsupported, do not substitute CPU time.
3. Continue genuine physically accurate eye material research with consented real makeup photographs and annotated gaze/eyelid/glass/occlusion examples; blind artists assess the four pilot looks (3 modified looks + no-makeup negative control) before any 42-look promotion.
4. Update PR #23, issue #24 and this handoff with concrete verified SHAs and CI outcomes. **Do not merge/deploy main/Cloudflare** without real-photo and real-device quality evidence.

## Latest quality milestone — local protected-pixel parity preflight for Android A/B (2026-11-17)

**Canonical codebase:** `jjh167910-cloud/H-beauty-makeup`, branch `feat/realism-benchmark-v2`, PR #23, tracker issue #24. **Production main and Cloudflare worker unchanged.**

### Verified baseline before this new work
The previous SHA `7e72d4df3be02c8870db83fb08175e5d520d742a` passed **all** GitHub Actions in `Try-on review` run **44006130958**: required Node/offline, TypeScript, Vite, early eye-material/geometry/benchmark browser tests, full native saved-photo integration, streamed model downloads, responsive live capture, and **all three full browser shards**. The separate `Live mirror camera frame regression` run **44006132561** was also green. These are actual completed checks, but no Android physical device or blinded real-photo makeup study was conducted.

### Code committed in THIS continuation
- New `src/lib/native-eye-parity.ts` (commit `85bcf5299ecca259d5bb154ca7177c175adef3a7`): **local-only, full-resolution native-vs-fast pixel auditor**. Input: two Canvas2D `ImageData` objects from the exact same locally prepared photo and shader eye scissor ROI. Converts WebGL bottom-left ROI to canvas top-down pixels. Returns numeric counts/differences only, never image data. Strict pass requires **ZERO changed RGBA pixels outside ROI**, overall max absolute channel delta **<=3**, whole image mean absolute delta **<0.5**, and proof that full and optimized shader stages executed; otherwise fail/unavailable.
- `src/lib/native-eye-benchmark.ts` (commit `95f8a7b6d0a3669cccf4510add91f6d8595b01cb`): existing opt-in `runNativeEyeAB` now performs the full-res pixel parity check BEFORE warmups and GPU timing trials. If it fails, returns `image-parity-failed` / `image-parity-unavailable` and no performance claim. The two Canvas2D readbacks are **explicitly opt-in diagnostic preflight** and occur outside timed GPU queries; the real-time renderer does not add any `gl.readPixels`, GPU `finish()` or blocking query waits. The report includes only parity metadata, GPU statistics and photo dimensions, never selfie pixels/landmarks.
- New `tests/material-eye-parity.spec.ts` (commit `a7c5bfe413b830840db0ff311dd5539d07cc6a16`): synthetic 4x3 strict ROI audit incl. protected pixel single-channel mutation, out-of-range differences, wrong dimensions, invalid scissor and unexecuted fast pass; separate *real saved-photo pipeline* comparison using the bundled generated no-makeup catalog portrait and rhinestone look. No actual customer identity used.
- `tests/material-eye-benchmark.spec.ts` (commit `c6881594e9a5106cebca0285e3daba4066e15364`): benchmark smoke now checks successful parity whenever a GPU timer extension is available, while maintaining 30-sample requirement for any timing claim.
- `.github/workflows/review.yml` (commit `c6e3c6a0c7c4148242aea23bfcbc06ece659997c`): adds new dedicated parity tests to early targeted material/benchmark suite, before heavyweight full-app shards.
- `docs/NATIVE_EYE_ANDROID_BENCHMARK.md` (commit `f579f2474d97f260df5174ca6acdbd72ac632973`) and `docs/REALISM_IMPLEMENTATION_V2.md` (commit `419884cce51fcfcde6932f18533cf6f7c06c5aa9`): precise audit threshold and honest Canvas2D readback-vs-GPU-timing distinction, physical device protocol and quality limitations.

### Verify next
1. **Current PR HEAD is dynamic.** Immediately query PR #23 and latest `Try-on review` GitHub Actions. Because documentation commits trigger concurrency cancellation, the latest source SHA may be this handoff commit; wait for *its* early targeted parity suite + native saved-photo smoke + download/live camera checks and **all three full-suite shards**. Fetch failing job logs if any and fix them—never silence failures.
2. On Android real device, run `?eyePilot=v2` and the documented private `runNativeEyeAB(shot)` protocol, collecting 30+ valid GPU timer queries each for native and native-fast. **No GPU speedup is claimed**. Parity fail/unavailable on any target phone blocks the comparison; never compare CPU submission time in place of GPU elapsed time. Read `docs/NATIVE_EYE_ANDROID_BENCHMARK.md`.
3. This is still **not** a photorealistic makeup research breakthrough. The architecture's shader only checks parity between modes, not whether either output resembles physically applied makeup. Need real consented portraits (different eye types/occlusion/skin depths), identity preservation, photographic pigment/lash/rhinestone optics and professional blinded comparisons before promoting to all 42 looks or production.
4. No connected physical Android device in this chat; do not invent real GPU time, power, memory values or speedups. Preserve user photo privacy (on device/offline).
5. Keep issue #24, PR #23, and this handoff synchronized with verified exact GitHub SHA/CI. Do not merge into main or deploy to public worker until genuine physical-device and real-image quality evidence.

## Latest continuation — reliable physical-Android GPU query collection (2026-11-17)

**Canonical:** `jjh167910-cloud/H-beauty-makeup`, research branch `feat/realism-benchmark-v2`, PR #23, engineering tracker #24. Production main/Cloudflare site untouched.

### Confirmed green starting point
At start of this continuation, branch SHA **`e75e4ac69bb51a6125c69eea133ce8a0aca814ee`** had **fully green** GitHub Actions: `Try-on review` run **44061910388** (required review and all three full Playwright shards passed), plus independent `Live mirror camera frame regression` run **44061910401** success. This certifies the previous **offline/TypeScript/build, eye shader/pixel parity/benchmark, saved-photo integration, streamed downloads and camera test** gates, *not* actual visual photorealism or Android GPU speed.

### Source implementation committed in this continuation
- `src/lib/native-eye-gpu-timer.ts` commit `114bb2016fd4124b3b5238cfcf3726f0378325c8`: new `sampleEpoch` increments on reset, GPU-disjoint, driver-query exception and context loss. A timed study can now distinguish a valid continuous GPU query generation from invalidation rather than accidentally comparing pre/post-disjoint measurements.
- `src/lib/makeup-gl.ts` commit `6510609667cfa8db68c76fa7d9aac7c0415cc342`: read-only `nativeEyeGpuPendingCount()` and `nativeEyeGpuSampleEpoch()` for opt-in local benchmark, no default render UI changes.
- `src/lib/native-eye-benchmark.ts` commit `995ad9d6d62245f803d8c47844ac625e566d751d`: bounded **nonblocking** GPU timer query drain+yield rather than submitting 30 blindly with only 3 outstanding query slots. Collects newly completed unique GPU sequence IDs into a private local list before the timer's 64-entry ring buffer evicts them. Alternates full/fast order, permits at most **90 submissions per mode** within **180 seconds**, checks actual requested GPU render mode, and aborts with `gpu-evidence-lost` if the timer epoch resets. Adds requested vs actual render count metadata. Statistics still require 30 valid queries in **each** actual mode, and still require strict full-image local pixel-parity preflight before timing. Never substitute CPU time, gl.finish, image readbacks during timed pass or uploaded telemetry.
- `tests/material-eye-timing.spec.ts` commit `fa3e096b21d55a10fef2f5ac28b0f66dc65bfd85`: browser regression test for query backlog, epoch reset, disjoint invalidation, context disposal and recovery, no query leaks.
- `tests/material-eye-benchmark.spec.ts` commit `abf05bd3919d1ca7c5796ba7fe836eeaa12c755b`: rejects a caller-requested one-query evidence threshold and checks bounded actual retry metadata. A one-trial CI smoke remains strictly insufficient; no fabricated speedup.
- `docs/NATIVE_EYE_ANDROID_BENCHMARK.md` commit `6a0b1685bca51e84e5ad115e23b83f2110c52448` and `docs/REALISM_IMPLEMENTATION_V2.md` commit `31b26bba0cde045211a46ef6cd06db0c6d94aa76`: physical phone protocol, evidence and timeout semantics, disjoint/unsupported cases.
- Issue #24, PR #23 updated; this handoff is final code-affecting commit planned in this session.

### CI at time of writing: MUST refresh
The previous SHA `e75e4ac...` had passed 100% of automated checks. **This new sampling implementation must pass its own newest-head GitHub Actions review and all 3 full Playwright shards**. Its first `review` workflow reached TypeScript and Vite build success and was running early targeted browser tests on source `6a0b1685bca51e84e5ad115e23b83f2110c52448`; subsequent docs and this handoff trigger new CI that can cancel earlier in-flight PR runs. Do not confuse a cancelled previous run with a failure of the current head, and do not claim latest-head fully green until all jobs explicitly pass.

### Next engineering action
1. Read current PR #23 HEAD and current Actions workflows. If `tests/material-eye-timing.spec.ts` or `tests/material-eye-benchmark.spec.ts` fails, retrieve **job log**; fix precise TypeScript/assertion/GPU flow bug, rerun early targeted tests, then allow all 3 full Playwright shards to complete on one unmodified commit. Confirm separate live-camera smoke.
2. The real phone benchmark remains **unrun**: with consenting local image and optional generated fixture, measure 30+ genuine `EXT_disjoint_timer_query_webgl2` samples per requested mode on low/mid/high Android tiers, report actual p50/p95, memory/thermal/battery and capture interaction, without transmitting selfies. If extension unsupported or disjoint, report insufficient.
3. Physically accurate makeup research: validate upper/lower lid, skin microtexture/pigment opacity, occlusion by hands, hair, spectacles, and rhinestone/eyelash optics with annotated consented real photos and blind professional comparisons of four pilot looks. This remains the major aesthetic blocker; synthetic no-makeup fixture and parity do **not** certify realism, and 42 looks still need editorial validation.
4. Keep research-only and offline privacy restrictions. No merge/deploy to main or Cloudflare based only on green CI. Update PR #23, issue #24 and handoff with actual verified data.

## Latest continuation — restore source-photo skin microtexture in opt-in eye pigment (2026-11-17)

**Project:** `jjh167910-cloud/H-beauty-makeup`; PR #23, issue #24, branch `feat/realism-benchmark-v2`. Production `main` and the public Cloudflare salon app remain untouched.

### CI inherited at start
Latest prior head `fa53b66c4ae6ab893ce46038172564f171cf114c`, Actions `44069622283`: targeted `review` **PASS**, full suite shards **1/3 PASS**, **2/3 PASS**; shard **3/3 still running** when the new implementation began. A subsequent source commit cancelled that run before the last shard completed. Separate independent live camera smoke for that prior head had passed. **Never call that old head fully green**, and refresh Actions on the new head.

### Code actually committed
1. `src/lib/material-eye-native.ts` commit `f9441537b21c7102fb29ea7514c408efdeda5c9e`: experimental `NATIVE_EYE_FS` now avoids flattening fine original eyelid skin texture under cosmetic pigment. It derives a bounded `±0.045` linear-RGB high-frequency albedo residual from the **original user photo** minus its center-weighted 5-tap neighbor mean. The extra restoration is weighted by `0.60 × actual pigment opacity`, with color clipping protection, and runs only for tinted pixels. No generated pores, cross-face template texture, identity change or photo upload. Default/live production renderer unchanged; still only `?eyePilot=v2` saved-photo pilot.
2. `tests/material-eye-native.spec.ts` commit `bbde5aedbfb1fca791571877d58559656ee67086`: checks retention of original high-frequency contrast in an unobstructed eyelid ROI on **light and deep synthetic skin textures**, plus the existing strict exclusions for sclera, occluded regions, protected areas, and no 0/255 clipping. The tests are limited to generated fixtures; they are NOT artist-perceptual studies.
3. `docs/REALISM_IMPLEMENTATION_V2.md` commit `23d10365ef8e419dda0b676bce968b4e2ff292a5`: detailed shader design, performance trade-offs and research limitations.
4. Updated issue #24 and PR #23 with source commits and validation status. This handoff finalizes the session. **Refresh current head/CI**, because documenting the code also triggers review Actions and may cancel earlier in-flight runs.

### Verification known at the moment of documentation
- Source head `bbde5aedbfb1fca791571877d58559656ee67086`, GitHub `Try-on review` run **44071564413**: TypeScript, Vite build, **targeted eye-material/geometry tests including new synthetic microtexture checks PASSED**; native saved-photo integration and streamed download/retry **PASSED**. The required additional live-camera step was still running at last observation. Independent `Live mirror camera frame regression` run **44071564241 COMPLETED SUCCESS** on the same source.
- The latest *documentation-inclusive* HEAD after this handoff creates a new Actions run. **None of the updated source is approved for promotion until the new head passes required review plus all three sharded full Playwright jobs**.
- No real Android GPU p50/p95, thermal/memory, blind artist-rated makeup realism, or consented representative eye-type/skin-depth photo dataset results have been collected. Microtexture retention is a plausible materials improvement, not demonstrated state-of-the-art performance.

### Next concrete action
1. Query GitHub PR #23 current head and all associated `Try-on review` jobs. If any shader native/finish/parity, original detail contrast, saved-photo/live-camera or complete suite fails, download actual failed job logs and **fix**, not bypass/skip the test. If all green, note exact SHA/jobs. Avoid many successive commits cancelling costly shards.
2. Continue experimental **region-aware occlusion/skin-material** quality, especially hooded/monolid profiles, sunglasses/hair edges and lower eyelid conditions. Use tests that separately enforce true source skin texture retention, only authorized cosmetic pixels, and no iris/sclera changes. Do not invent real visual superiority.
3. Obtain **real low/mid/high Android GPU timer** results through `docs/NATIVE_EYE_ANDROID_BENCHMARK.md`. Native shader gained four texture fetches per tinted pixel, so physical performance must be reassessed; the opt-in local A/B runner is available. No devices connected now.
4. Run consented real-photo blinded artist review for three modified looks plus no-makeup control. Only after that and verified Android resource safety should the experimental mode be considered for a staged rollout; no automatic merge/deployment.

## New-chat start procedure (mandatory)

1. Connect/use the GitHub app and fetch PR #23, current head SHA and workflow status; do not assume the latest chat's SHA still applies.
2. Read `docs/NEXT_CHAT_HANDOFF.md` from branch `feat/realism-benchmark-v2` and `docs/REALISM_IMPLEMENTATION_V2.md`; inspect `src/lib/material-eye-v2.ts`, `src/lib/tryon.ts`, and `tests/material-eye-v2.spec.ts`.
3. Read issue #24 and update its checklist as work is independently validated.
4. Fix or implement the highest-priority remaining item on that branch, run/check CI, and keep default production unchanged unless quality gates are satisfied.
5. End the chat by updating this file with the work accomplished, exact latest SHA, CI outcomes, failures, and **specific next edit**. Link PR #23 and issue #24 in the answer.

## Reusable user prompt for a new conversation

> Continue implementation of H-Beauty Makeup with the highest achievable photorealism and offline/on-device quality. Use my connected GitHub repository `jjh167910-cloud/H-beauty-makeup`. Read `docs/NEXT_CHAT_HANDOFF.md` and `docs/REALISM_IMPLEMENTATION_V2.md` in branch `feat/realism-benchmark-v2`, plus PR #23 and issue #24. Check the latest CI and fix any failures, then **continue implementing the material-aware eye renderer and four-look pilot**. Commit tested progress to the development branch, keep production stable, and **update the handoff file at the end** so future chats can continue. Do not ask me to repeat the roadmap. Licensing is handled separately; do not compromise technical quality.
