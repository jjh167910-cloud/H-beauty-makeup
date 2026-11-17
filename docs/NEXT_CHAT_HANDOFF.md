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

## New-chat start procedure (mandatory)

1. Connect/use the GitHub app and fetch PR #23, current head SHA and workflow status; do not assume the latest chat's SHA still applies.
2. Read `docs/NEXT_CHAT_HANDOFF.md` from branch `feat/realism-benchmark-v2` and `docs/REALISM_IMPLEMENTATION_V2.md`; inspect `src/lib/material-eye-v2.ts`, `src/lib/tryon.ts`, and `tests/material-eye-v2.spec.ts`.
3. Read issue #24 and update its checklist as work is independently validated.
4. Fix or implement the highest-priority remaining item on that branch, run/check CI, and keep default production unchanged unless quality gates are satisfied.
5. End the chat by updating this file with the work accomplished, exact latest SHA, CI outcomes, failures, and **specific next edit**. Link PR #23 and issue #24 in the answer.

## Reusable user prompt for a new conversation

> Continue implementation of H-Beauty Makeup with the highest achievable photorealism and offline/on-device quality. Use my connected GitHub repository `jjh167910-cloud/H-beauty-makeup`. Read `docs/NEXT_CHAT_HANDOFF.md` and `docs/REALISM_IMPLEMENTATION_V2.md` in branch `feat/realism-benchmark-v2`, plus PR #23 and issue #24. Check the latest CI and fix any failures, then **continue implementing the material-aware eye renderer and four-look pilot**. Commit tested progress to the development branch, keep production stable, and **update the handoff file at the end** so future chats can continue. Do not ask me to repeat the roadmap. Licensing is handled separately; do not compromise technical quality.
