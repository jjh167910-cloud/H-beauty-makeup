# H-Beauty Makeup — canonical cross-chat research handoff

**Updated:** 2026-11-17, Europe/Stockholm. **Source of truth:** check current GitHub PR/Actions; run IDs and SHAs copied here are historical, not a substitute for live verification.

## Where to continue

- **Repo:** https://github.com/jjh167910-cloud/H-beauty-makeup
- **Research branch:** `feat/realism-benchmark-v2` (do NOT confuse with `main`)
- **PR #23:** https://github.com/jjh167910-cloud/H-beauty-makeup/pull/23
- **Quality tracker #24:** https://github.com/jjh167910-cloud/H-beauty-makeup/issues/24
- **Implementation design:** `docs/REALISM_IMPLEMENTATION_V2.md`
- **Android benchmark protocol:** `docs/NATIVE_EYE_ANDROID_BENCHMARK.md`
- **Automated review:** `.github/workflows/review.yml`; independent camera regression workflow
- **Public salon worker:** https://h-beauty-makeup.jjh167910.workers.dev/ — **experimental PR code is NOT deployed there.**
- **Historical detailed handoff:** https://github.com/jjh167910-cloud/H-beauty-makeup/blob/bb176768c619d0d58b7d22c8416640457df78da6/docs/NEXT_CHAT_HANDOFF.md . The preceding 78 KB session log is preserved in immutable Git history; the present file intentionally replaces repetitive, outdated CI notes.

## What the user actually wants

Implement the highest practical **photorealistic, identity-preserving virtual makeup** for H-Beauty, not just propose an app. Prioritize offline/on-device local rendering and private customer selfies; progressive opt-in asset downloads and caching; polished Persian-first mobile UX; low-end Android reliability; distinct accurate looks for the **42-look catalog**. Four initial evaluation conditions: three named **native eye-material pilots** (`hollywood`, `electric-blue`, `rhinestone`) and a `no-makeup` control. Avoid claiming “state-of-the-art”, better-than-competitors, real Android speedups or production readiness without blinded representative photographs and physical-device data. Licensing is being handled separately by user; do not import unauthorized real-photo training datasets.

**Production rule:** Do not merge PR #23 into `main` or deploy to Cloudflare on the strength of CI alone. This pilot is only enabled for prepared saved photos with `?eyePilot=v2`. Live mirror, public users and default gallery use the existing renderer. Never upload customer selfies or landmarks.

## Why the rewrite is necessary

Original user roadmap (18-page `Roadmap.pdf`, dated 2026-11-16; see detailed implementation spec) flagged geometry/color-difference transfer from ~900×1200 synthetic catalog portraits, source-model shadow and eyelashes pasted onto customers, unreliable eye/hair occlusion, limited precision of 478 face landmarks, live/still mismatch, poor under-the-fold controls, poor validated real-photo quality and large monolithic code. Replacing a look-reference pixel difference with explicit cosmetic coverage, pigment/opacity, light adaptation, specular finish and individual lash geometry is the research direction, not an already validated result.

## Implemented research features (all opt-in where stated)

- `src/lib/material-eye-native.ts`: face-space upper eyelid/brow geometry and fail-closed malformed/occluded/profile/closed-eye checks; WebGL2 native still-photo material pass with source-photo pigment and fine microtexture, vector eyeliner/lashes, sparse shimmer and faceted gemstones, sclera protection, visibility mask. Never remaps the source catalog model's eye.
- `src/lib/makeup-gl.ts`: same-context GPU framebuffer and conservative eye scissor `native-fast`, records whether the requested shader actually ran, supports optional nonblocking GPU timing. No per-frame CPU image readback in the normal renderer.
- `src/lib/material-eye-v2.ts`: earlier experimental CPU pilot retained as a strictly constrained fallback. `src/lib/tryon.ts` gates research native pass behind `?eyePilot=v2`, not live production.
- `src/lib/native-eye-parity.ts`: opt-in, full-resolution native-vs-fast pixel preflight; exact untouched RGBA pixels outside conservative eye ROI; inside max channel difference <=3 and full-frame mean <0.5. Returns aggregate numbers only; two diagnostic Canvas2D readbacks occur **before** GPU timing, not in live rendering.
- `src/lib/native-eye-gpu-timer.ts` and `src/lib/native-eye-benchmark.ts`: WebGL2 `EXT_disjoint_timer_query_webgl2`, no `gl.finish`/blocking query during benchmark; at least **30 valid samples per actual mode** before any p50/p95 comparison, bounded <=90 render attempts per mode and <=180 seconds; balanced A/B–B/A order, deduplicated sequence IDs, epoch reset on disjoint/driver/context loss. Do not invent results on unsupported drivers.
- `scripts/quality/benchmark_v2.mjs` + `tests-node/benchmark_v2.test.mjs`: protected pixels/clipping and cautious blind photo-study metric gates. Synthetic-only tests do **not** establish human realism.
- Existing app progressively downloads large AI/model assets and supports offline shell/cached assets; related regression coverage exists. No new upload/telemetry introduced by the research code.

## Latest actual defect and fix (must verify newest CI)

**Failing old source:** `bb176768c619d0d58b7d22c8416640457df78da6`, `Try-on review` run **44078842828**. Exactly **23/24 targeted Playwright tests passed**, but `tests/material-eye-native.spec.ts` **failed** on synthetic light/deep eye lighting outlier: measured `lightProbeMean=3.119592875318066`, hard acceptance limit `<2.5`. All full Playwright shards were skipped. Separate camera run **44078842859** passed.

**Cause:** The three-photo-site *median* can still change when the central source texel becomes an extreme bright/dark outlier and the remaining two reference sites differ due to the customer's original skin microtexture. Earlier work also corrected cross-eye lighting contamination, original-photo skin texture flattening and GPU timing evidence integrity; see issue #24 for exact commits.

**Implemented correction:**
1. `src/lib/material-eye-native.ts`, commit `f9ea7fee6a46a99c2ce087a421b0d6731c2fd819`: a **nested median of five actual source-photo skin luminance samples** per contributing eye. Outer `t=0.33` and `0.67` at lid/brow fraction `v=0.24`; center `t=0.5` at fractions `v=0.16,0.24,0.32`, median within that vertical strip, then median with the outer two. Restored identity/occlusion and source-photo microtexture behavior. This adds **two original texture fetches** per relevant pixel compared with the three-site median, so real Android performance is not known.
2. `tests/material-eye-native.spec.ts`, commit `4418e0c8dbf61d567e71067bbf8a31f4b3ab1643`: preserves original strict `lightProbeMean <2.5` and `lightProbeMax <=12` under isolated near-white/near-black center-reference corruption, on both synthetic light/deep skin; **does not weaken thresholds**. New complementary test changes all five left reference sites coherently and requires a real left-eye pigment response **>100 changed channel samples**, while right-eye RGB remains byte-identical. Original texture preservation, sclera/visibility, no clipping, protected pixels, and native-vs-fast parity still tested.

**Known verification on fix source** `4418e0c8dbf61d567e71067bbf8a31f4b3ab1643`, GitHub Actions `Try-on review` **44082529084**: offline Node, TypeScript, Vite build, **all targeted eye material/geometry tests including the previously failing outlier regression passed**, full saved-photo native integration passed, streamed model-download cancellation/retry passed. The final additional camera test and full 3 Playwright shards were in progress at time this handoff was prepared. Independent camera run **44082529195** completed SUCCESS. **Refresh and verify all jobs for the newest SHA**; editing this document creates a new commit/CI, and may cancel the prior run.

## Latest continuation — 2026-11-17: lens-matched eye optics and fail-closed tracking

**Baseline independently verified:** PR source `436147f0e86c1e51987f602cc4bb20f8badfb587`; [review Actions 44083471545](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44083471545) completed SUCCESS for review and **all three full Playwright shards**; [separate camera Actions 44083471608](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44083471608) completed SUCCESS. The historical nested-median regression no longer fails. This evidence applies **only** to the baseline commit, not automatically to the new commit.

**Changes in this opt-in research commit:** `material-eye-native.ts` rejects brow-point penetration and near-coincident duplicate eyes; `makeup-gl.ts` passes the existing measured `face.blur` to the native saved-photo pass; liner/lash antialiasing and facet/glint falloff match the camera blur, bounded and unchanged for sharp originals. `tests/material-eye-lens.spec.ts` validates blur caps, preserved no-makeup control, conservative scissor growth and malformed-landmark rejection; it is added to early CI via `review.yml`. No production/live-camera opt-in was changed.

**After commit:** resolve this PR's current HEAD SHA, verify the new review workflow's targeted tests and all three Playwright shards, plus the separate camera run. If any fails, read the actual job logs and fix, without relaxing pixel thresholds. The new commit is not validated merely because the preceding SHA was green.

**Still required:** real consented photos (hooded/monolid/glasses, varied lighting/depth) and blinded artist scores; physical low/mid/high Android GPU p50/p95, thermal, memory and capture response. Cloudflare PR preview builds have reported failures; keep these distinct from GitHub Actions and **do not deploy or merge** before release gates. Main/public worker intentionally unchanged; licensing handled separately. Never upload private selfies.

## Mandatory next-chat operating procedure

1. Fetch PR #23 **current head SHA** and check `Try-on review` plus separate `Live mirror camera frame regression` workflows for **that exact SHA**. Require `review`, **all three** `Full Playwright suite` shards and independent camera **completed success**. If any fail, read GitHub job logs and fix the real problem. Cancelled runs caused by later commits are not “green”.
2. If CI green, proceed to real **photographic fidelity** research: good eyeliner & lash placement for hooded/monolid/profile eyes; eyeglasses/hair occlusion, skin reflectance, realistic cosmetic opacity and local lighting. Test with protected original pixels plus **consented** diverse real photos, annotated occlusion and blinded professional makeup-artist preference. Synthetic fixtures and image parity alone are insufficient.
3. Run `docs/NATIVE_EYE_ANDROID_BENCHMARK.md` on real **low/mid/high physical Android tiers**, measure native-vs-fast GPU p50/p95, memory/thermals/camera responsiveness. The five-site eye-light reference adds GPU work; do not assert it is faster without observations.
4. Do not expand to 42 looks, merge, enable by default, or deploy until the pilot's beauty fidelity, privacy and physical phone gates are met. Keep PR body, issue #24 and this concise handoff updated with tested exact SHAs/results, not conjecture.

**In the final user response:** link PR #23 and issue #24, state exactly what code was committed, what checks passed/failed/pending, what remains, and whether public production changed.
