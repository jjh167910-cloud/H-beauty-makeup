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

## New-chat start procedure (mandatory)

1. Connect/use the GitHub app and fetch PR #23, current head SHA and workflow status; do not assume the latest chat's SHA still applies.
2. Read `docs/NEXT_CHAT_HANDOFF.md` from branch `feat/realism-benchmark-v2` and `docs/REALISM_IMPLEMENTATION_V2.md`; inspect `src/lib/material-eye-v2.ts`, `src/lib/tryon.ts`, and `tests/material-eye-v2.spec.ts`.
3. Read issue #24 and update its checklist as work is independently validated.
4. Fix or implement the highest-priority remaining item on that branch, run/check CI, and keep default production unchanged unless quality gates are satisfied.
5. End the chat by updating this file with the work accomplished, exact latest SHA, CI outcomes, failures, and **specific next edit**. Link PR #23 and issue #24 in the answer.

## Reusable user prompt for a new conversation

> Continue implementation of H-Beauty Makeup with the highest achievable photorealism and offline/on-device quality. Use my connected GitHub repository `jjh167910-cloud/H-beauty-makeup`. Read `docs/NEXT_CHAT_HANDOFF.md` and `docs/REALISM_IMPLEMENTATION_V2.md` in branch `feat/realism-benchmark-v2`, plus PR #23 and issue #24. Check the latest CI and fix any failures, then **continue implementing the material-aware eye renderer and four-look pilot**. Commit tested progress to the development branch, keep production stable, and **update the handoff file at the end** so future chats can continue. Do not ask me to repeat the roadmap. Licensing is handled separately; do not compromise technical quality.
