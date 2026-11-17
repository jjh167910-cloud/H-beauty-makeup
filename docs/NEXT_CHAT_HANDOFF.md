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

## Continuation — 2026-11-17: complete-cohort and intersectional blind-study evidence

- **Baseline at the start of this iteration:** PR #23 head `491bc65adc503b6fb5195ba12636dc570ca07f1f`; [review 44088307814](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44088307814) **completed SUCCESS**, including targeted native eye and all three full Playwright shards; [camera 44088307807](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44088307807) **completed SUCCESS**. The opt-in lens/landmark research commit was green.
- **Quality finding:** `evaluatePilot` previously counted 30 subjects per look even when those were four disjoint sets, and could miss failures isolated to one look/skin-depth intersection. This weakens evidence for any claim that a material renderer improves photorealism.
- **This implementation:** `scripts/quality/benchmark_v2.mjs` requires 30 matched independent faces with all four required pilot conditions, validates one consistent skin-depth stratum per subject, uses the rated complete cohort for clustered Wilson confidence, and reports/fails underperforming look-by-skin cells when adequately sampled. Node regression tests cover disjoint cohorts, conflicting metadata, intersectional failures and the passing fixture; `docs/REALISM_IMPLEMENTATION_V2.md` documents the gate.
- **New commit CI:** check current PR head SHA after committing; verify `Try-on review` (review + all 3 Playwright shards) and separate camera run. The preceding green source does not validate this new metadata-gate commit.
- **Still unresolved:** consented real-photo blind artist comparisons and real low/mid/high-tier Android GPU, memory, thermal, camera data. Cloudflare preview build failure previously reported, but logs inaccessible; do not infer cause. Research remains `?eyePilot=v2` saved-photo opt-in; main/production unchanged. Licensing handled separately.

### CI regression repaired in this follow-up commit

Initial study-gate commit `71b13c438051bda29a9363d5e1e67b9bc71836be`
triggered [review run 44091293387](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44091293387):
offline Node tests **25/26 passed**; the one failure was the pre-existing
`confidence is clustered by independent customer` fixture
(`tests-node/benchmark_v2.test.mjs`, near line 111). The new cross-stratum
gate correctly returned `fail` because all deep-skin subjects lost the same
two looks, while that older fixture expected `insufficient-evidence`.
The fix splits the ten affected subjects into two groups losing different
looks: every look/skin cell remains at least at chance, but only 20/30 subjects
meet the predeclared 70% goal, leaving Wilson 95% inconclusive. The
cross-stratum gate and its independent regression tests remain **strict**,
without relaxing any quality threshold. Three full Playwright shards were
skipped on the failing source; do not mark the old run green.
Verify the latest head's Node, typecheck, build, targeted browser, three full
shards and independent camera workflow. Main and public production unchanged.

## Continuation — 2026-11-17: correctly score untouched no-makeup control

- On source `56403b71418d6a200d8118521cb38f260f5879c3`, review [44091511215](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44091511215) had its **required review job SUCCESS** and full three Playwright shards underway; independent camera [44091511197](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44091511197) SUCCESS. Do not cite incomplete shards as green.
- Found an important blind-study flaw during inspection: the `no-makeup` negative control was counted as a cosmetic preference trial, which would falsely penalize a genuine tie or tempt fabrication of a win. The corrected gate requires zero changed **inside and outside** pixels on the no-makeup condition, counts `untouchedControls`, and excludes this control from cosmetic preference, confidence and subgroup statistics. All four named looks remain mandatory for every subject.
- `tests-node/benchmark_v2.test.mjs` fixtures now use a genuine tie on the no-makeup control, explicit `inside_changed_pixels:0`, and test control corruption/missing measurements without weakening other thresholds. The confidence-only fixture distributes losses across skin strata and still tests an inconclusive 20/30 subject-cluster interval.
- `docs/REALISM_IMPLEMENTATION_V2.md` records the revised study protocol. Check latest PR head, required Node/review, 3 full shards and independent camera outcomes after committing. This is **benchmark credibility**, not measured photographic superiority.
- Keep the production `main`, customer selfies, default renderer and Cloudflare release unchanged. Real consented artist evaluation and physical Android performance still required.

### Negative-control CI fixture adjustment

Source `4a210b79747741de8274daa602b0d69d1e8c16ab`, [review 44092671551](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44092671551), ran Node tests but FAILED one *obsolete expected statistic* in `poor performance on deep skin fails despite an excellent aggregate score`: expected 0.25 from four rated looks, actual 1/3 after correctly excluding the no-makeup negative control. The underlying subgroup fail behavior is intact. Corrected the assertion to 1/3, retaining the strict `status === "fail"` and explicit deep-stratum violation checks. Full browser shards skipped on that failed run. Recheck the next commit's complete CI; no production edits.

## 2026-11-17 — Opt-in native eye edge compositing and lens consistency

**Baseline checked before implementation:** head `0197ec5352e9755106d72ce94a7a9988cc6ebd08` passed both
[Try-on review 44092898942](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44092898942)
(including review and all three full browser shards) and
[Live mirror regression 44092898963](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44092898963).
This is baseline evidence only, not a verdict on the new commit.

**New source update (inspect latest PR HEAD):**
- `src/lib/makeup-gl.ts`: the uploaded WebGL `uInkSoft` is now exactly
  `nativeData.inkSoft` used by the eye shader's ROI/scissor calculation,
  eliminating an inconsistent second blur clamp (which used a 2.8 px ceiling
  instead of the material's 3.5 px) and reducing clipped or over-sharp ink.
- `src/lib/material-eye-native.ts`: new `uCleanLegacy` switch, enabled only
  when the opt-in prepared-photo native renderer successfully runs. At the
  feathered eyeliner/wing edge outside the eyelid wash, the shader fades
  legacy catalog residue toward the **customer's original photo** before
  drawing native ink. The mask is limited to actual ink, already occlusion-
  checked; other base complexion and all unaffected pixels remain unchanged.
  This is *localized* removal of inherited eye detail, not a complete
  material replacement of the old catalog face layer.
- `tests/material-eye-native-integration.spec.ts` interrogates the actual
  WebGL uniform after a forced 3.2 px synthetic blur setting (expected
  `uInkSoft=2.56`), not merely the TS helper. Separate
  `tests/material-eye-legacy-clean.spec.ts` compares a synthetic
  magenta old-wing residue before/after local cleanup and checks untouched
  protected pixels. `.github/workflows/review.yml` includes it in early CI.

**Validation status:** New SHA's required review job, all 3 full Playwright
shards, and separate camera regression MUST be checked after commit. Pixel
tests use simulated face/ink, not real customer photography. Never claim
real-world beauty improvement or mobile performance superiority from synthetic
tests. Physical Android/GPU + consented blinded artist assessment outstanding.
No production release/merge, no private photos, licensing separately.

## 2026-11-17 — customer-fitted tapered eyeliner wing (research-only)

- **Verified green input:** PR #23 baseline SHA `b9c0825d83bd70bd1a6533d5354744841ee2ebd4` passed [Try-on review 44098745500](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44098745500) (**review plus 3/3 full Playwright shards**) and independent [camera workflow 44098745372](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44098745372). Previous local legacy-wing cleanup and blur correction were not deployed.
- **New opt-in GPU geometry:** `src/lib/material-eye-native.ts` introduces `taperedWing`, a screen-space wing whose width diminishes smoothly from its lid-root toward a pointed outer tip, with the existing measured lens softness applied to its anti-aliased edge. The shader uses *unclamped* segment progress to prevent soft ink extending indefinitely past the tip. The customer's own landmarks still anchor both endpoints; existing visibility, sclera, protected-pixel and fail-closed geometry rules remain. No changes to other makeup layers, full catalog, default mode or live mirror.
- **New rendering regression:** `tests/material-eye-legacy-clean.spec.ts` still verifies legacy-magenta ghost suppression and protected regions, and now renders with wing on versus wing off to measure root-versus-tip ink cross sections. The test is already part of early targeted CI.
- **Status of THIS commit:** not certified by the previous green run. Recheck exact-head new GitHub Actions required review, 3/3 full Playwright shards and independent camera workflow, fix actual logs on failure. This is engineered shape plausibility, not a blinded human photograph result. Real-phone GPU/thermals and consented diverse eyelid/occlusion photo review remain.
- **Isolation:** `feat/realism-benchmark-v2` only; do not merge, deploy public worker, collect selfie data or imply commercial proof. Licensing separately handled.

## Continuation — 2026-11-17: original-photo eyelid highlight preservation

**Verified preceding SHA:** `96c5ee34fcd9b027065390768ac7a01d9d67ebe5` passed [review run 44118941531](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44118941531) (required review plus **all 3 full Playwright shards**) and [camera run 44118941440](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44118941440) independently. This green status applies only to the previous baseline.

**Opt-in photometric change:** `src/lib/material-eye-native.ts` adds a bounded `highlightRecovery` optical-material parameter: conservative for matte Hollywood, larger for electric blue and reflective rhinestone. The native fragment shader reuses the **already fetched** 4-neighbour original-photo low-pass, measures only **positive** local linear-luminance relief, and restores a fraction of the customer's **actual** photo glint, never synthetic noise or unbounded added illumination. Changes are restricted to existing eyelid pigment mask; protected pixels, sclera and existing visibility/fail-closed geometry logic remain. `src/lib/makeup-gl.ts` uploads `uHighlightRecovery` only on opt-in saved-photo native pass; no default or live mirror behavior changed.

**Regression gate:** Existing targeted `tests/material-eye-legacy-clean.spec.ts` now includes real shader A/B for highlight recovery on separate synthetic *light and deep* skin fixtures, verifies recovered source-glint proximity strictly improves with recovery enabled, no hard clipping and byte-identical outside-ROI original pixels. Retains earlier wing-tip taper and old catalog ghost regressions. No source customer data uploaded, no new GPU texture reads. **Measure actual mobile performance rather than infer it.**

**Status on NEW commit:** verify current head `Try-on review` required job, **all three** browser shards and independent camera workflow. Previous green run cannot certify this new shader. If failed, inspect CI logs and repair without weakening the checks. Neither synthetic A/B nor camera CI proves perceptual quality on real photographs; blinded consented artist evaluation on hooded/monolid/glasses and Android low/mid/high performance/thermals remain blocked. Leave PR research-only; no production merge or Cloudflare deploy. Licensing handled separately.

## Continuation — 2026-11-17: anatomically fanned lash fibers and occlusion preflight

- **Verified previous SHA:** `19cce3f742c1aec0b6c037fe5d6749a29a03e549` completed [Try-on review 44126944618](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44126944618) with required review and **all three full Playwright shards** SUCCESS; [independent camera regression 44126945285](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44126945285) SUCCESS.
- **Native opt-in rendering:** `src/lib/material-eye-native.ts` fans vector lashes anatomically from temporal/outward at the outer lid through near-vertical center to nasal/inward at the inner lid, with shorter inner lashes. Fiber width now follows strand-axis progress (rather than Euclidean radius from the root), fades beyond its actual tip, and uses the existing photo-matched anti-alias. No texture/ML dependency, customer image transfer or default/live change. **Quality is a geometric hypothesis until real-photo professional review.**
- **Occlusion fail-closed and lightweight:** pixel visibility is checked before the per-eye pigment/lash loop and photo-light samples. Full invisible pixels return the exact previous RGBA texel; valid partly visible pixels still pass the original blending path. This can avoid needless math under hair/occlusion, but physical Android timing remains **unmeasured**.
- **Regression:** `tests/material-eye-native.spec.ts` adds a fully hidden RG mask A/B and insists the entire composed image—including alpha—stays byte-identical on both synthetic light/deep skin. `tests/material-eye-legacy-clean.spec.ts` isolates GPU lashes from eyeshadow and checks visible lashes near inner/outer roots, total changes, and zero out-of-ROI pixels; retains legacy-ghost, wing-taper and highlight regressions. These tests are in existing early targeted CI.
- **New SHA CI:** fetch exact PR #23 head after commit and check `Try-on review` required job + **3/3 Playwright shards** and independent camera run. Do not cite preceding green baseline as proof of this commit. Fix real logs without relaxing pixel/quality thresholds.
- **Release barriers:** consented diverse photographs with blinded artist ratings, glasses/hair/hooded/monolid occlusion, low/mid/high physical Android p50/p95/thermal/memory; licensing handled separately. Keep `main`, Cloudflare production, customer selfies and default/live renderer unchanged.

## Continuation — 2026-11-17: restore genuine upper-lid seam, not catalog mascara

- **Verified baseline:** PR #23 at `1887bac3e0a955df1e1ced4e8aa80a4460727fb5` has [review 44131960247](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44131960247) **completed SUCCESS** including required review and all 3 full Playwright shards; [camera 44131960168](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44131960168) **completed SUCCESS**.
- **Rendering quality defect:** existing native material restores the original inside eyeshadow wash and beneath new eyeliner, but baked source-model mascara/eyeliner can still show in gaps along the lid. This exposes the catalog model's eye geometry despite the new customer-fitted strands.
- **Change:** `src/lib/material-eye-native.ts` computes a feathered, upper-lid-only `legacySeam` from each validated eye's normalized lid/brow coordinates, restores the *original customer pixel* under that narrow strip, then applies native eye material as before. Its output is visibility-/occlusion-masked, clipped away below the upper lid to guard sclera, and disabled outside the opt-in `uCleanLegacy` mode. This is not full source-image erasure, a skin filter or a model texture.
- **Test:** `tests/material-eye-legacy-clean.spec.ts` adds a synthetic magenta old-mascara residue along an upper-lid strip, disables all new pigment/liner/lashes to prove the cleanup operates independently, measures improved original-photo restoration and exact protected/sclera preservation. Retains all prior lash, wing, highlight and ghost tests; already in targeted review CI.
- **New commit validation:** check the exact HEAD's required review, **all 3 full Playwright shards** and independent live-camera workflow. Do not confuse baseline green with this increment. Real skin/eyelid photo fidelity and physical Android GPU/thermal gates remain open.
- **Isolation:** research branch only, default/live/public production unaffected, no uploaded selfies and no merge or Cloudflare release. Licensing separately handled.

## Continuation — 2026-11-17: pixel-bounded eyelid restoration and true no-pigment identity

- **Baseline verification:** head `9992f16d4dd0d864768e6b21b70dfd02db2ddf6e`, review [44138528752](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44138528752) has required review + Playwright shards 1/3 and 2/3 **SUCCESS**, shard 3/3 still **in progress** when this commit was prepared; independent camera [44138528757](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44138528757) SUCCESS. Do not call baseline fully green until 3/3 completes.
- **Defect:** legacy cleanup on the upper eyelid used a fixed fractional brow span, producing an overly wide strip on large/high-resolution faces. Worse, `uAmount=0` still allowed the broad `replace` wash to clear existing eyelid composition, masking what the seam regression was actually testing.
- **Fix:** `src/lib/material-eye-native.ts` bounds cleanup to `min(0.16*browGap, 1.6+uInkSoft)` **photo pixels** above the validated upper-lid curve. The width follows existing measured photo blur without growing with face scale. The general eyeshadow-underlay replacement now requires nonzero actual pigment amount. The independent opt-in seam cleanup can still restore customer pixels under residual inherited catalog mascara. No new textures, assets, runtime service, image upload, model download, default or live-camera change.
- **Regression:** `tests/material-eye-legacy-clean.spec.ts` with all new cosmetic strength/liner/lashes disabled must preserve *every* prior RGBA byte when cleanup is off; with cleanup on it must restore the real-image texel near the upper-lid seam and leave one just 3–4 pixels farther from the lid untouched. Retains previously strict wing, lash, sparkle/glint, sclera and ROI assertions. Existing targeted CI picks up the test.
- **Current commit release gate:** verify exact new SHA's review job, three full Playwright shards and independent camera check. If red, inspect actual log and fix without weakening protection. Do not merge or release.
- **Human validation remains:** blinded consented real photos with difficult eye anatomy, eyeglasses and hair occlusion; real Android low/mid/high-tier GPU p50/p95, thermal, memory. Synthetic correctness does not establish superior photographic results. Licensing separately handled. Production/main untouched.

## Continuation — 2026-11-17: reject eyelid-to-brow tracking drift

- **Verified baseline at the start:** PR #23 SHA `6f2433a4f2faafbd341b6b34db4299a478d3a47e` passed [Try-on review 44141023263](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44141023263) **with all three full Playwright shards** and [separate live-camera regression 44141023226](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44141023226) SUCCESS. This validation applies to baseline only.
- **Found a fail-open geometry gap:** a single upper-lid landmark can jump into brow space yet remain monotonic and close enough to neighbouring lid points to pass the old validator; this can incorrectly drag original-photo pigments, eyeliner, lashes or cleanup to the eyebrow/forehead.
- **Fix:** `nativeEyeGeometryValid` now rejects a lid-arc excursion beyond 0.32 local eye widths and requires at least 0.025 eye widths of signed separation from the interpolated brow at corresponding eye position. The checks use the eye's own chord/normal and are rotation-invariant. Only a malformed eye is disabled; a valid opposite eye may render. An inconsistent eye also blocks the looser legacy CPU fallback. This is a conservative geometry hypothesis, not clinical truth for all eyelid anatomies.
- **Tests:** `tests/material-eye-geometry.spec.ts` adds an isolated stale upper landmark, an overlapping low eyebrow, a valid smooth-curvature control and one-eye-rejection/legacy-fallback assertions. It retains original five-angle rotation tests. Existing early target CI includes this spec.
- **After THIS commit:** check the latest exact SHA's required review, **3/3 full Playwright shards** and independent camera workflow. Fix actual failures rather than relaxing thresholds. No real-photo artistic fidelity claim or Android runtime performance claim yet.
- **Remaining gates:** consented blinded makeup-artist comparisons on hooded/monolid/asymmetric occluded eyes, real low/mid/high Android GPU p50/p95 and thermals. Production/main unchanged, research opt-in only, no customer photos in Git; licensing handled separately.

## Continuation — 2026-11-17: occlusion-aware photographic light references

**Previously verified source:** PR #23 SHA `f68770083dd525c4b22365e39b4914adff621e32`: [review 44165614852](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44165614852) completed SUCCESS for required review and all 3 full Playwright shards; [independent camera 44165614903](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44165614903) SUCCESS. This does NOT validate the new commit.

**New opt-in shader:** Original-photo pigment illumination references now check the existing hair/glasses/face visibility mask at each of five upper-lid/brow reference sites. Masked sites are **excluded** rather than treated as dark skin. With all five valid, the previous validated nested median is preserved exactly. With 3–4 valid, use their trimmed robust estimate; with 2 use a conservative pair mean only when their luminance difference is ≤0.25; with fewer than 2, fail closed on pigmentation/old-eyeshadow replacement/mica but retain separately safe eyeliner and photo-seam cleanup. No new datasets, new GPU textures or source-image uploads. This adds up to five visibility lookups per contributing eye pixel and must be benchmarked on physical Android; do NOT assert speed gains.

**Test:** `tests/material-eye-native.spec.ts` now selectively obscures one real original-photo reference sample in the mask, changes that precise source pixel to a white outlier, and verifies the *far painted eyelid* remains RGB-identical while other visible pigment still renders. All five references masked forces an exact full-frame no-op when liner/particles are disabled, with the eyelid itself still visible. Existing strict tests for true five-site coherent lighting, other-eye independence, sclera, occlusion, natural texture and protected pixels remain.

**Exact-new-commit checks:** fetch PR head and require review + **all 3 full Playwright shards** + independent camera completed success. If failing, inspect actual logs, fix rather than loosen thresholds. Real consented artist-blind skin/hooded/monolid/glasses evaluation and Android low/mid/high timing/thermal data are still required. Remains opt-in saved-photo research only; main/public Cloudflare unchanged; licensing separately handled.

## Continuation — 2026-11-18: preserve original photographic microtexture at occlusion edges

- **Previous exact source green:** PR #23 `81afe5b4159867319d7e63284bf843e60af24d37`; [Try-on review 44173825839](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44173825839) (required review plus all 3 Playwright shards) and [independent camera 44173825838](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/44173825838) both completed SUCCESS. The green result precedes this change.
- **Engine fix:** `src/lib/material-eye-native.ts` uses edge-aware, locally contrast-normalized weights for the four existing original-photo neighboring pixel samples instead of unconditional 5-tap smoothing. Abrupt black hair strands or bright glasses-frame highlights beside exposed skin no longer pull its low-pass toward an unrelated material, which otherwise reintroduced an artificial bright/dark rim through microtexture and highlight preservation. The calculation uses squared RGB contrast in linear space, avoiding extra `sqrt` and **no new texture fetches**. It retains baseline texture on smooth skin and uses the customer's actual photo only. Not an AI-generated skin filter.
- **GPU regression:** Existing `tests/material-eye-native.spec.ts` separately for synthetic light/deep skin now paints all four adjacent ORIGINAL-photo texels with extreme dark and light values while the center is visibly cosmetically painted. It requires <=2/255 RGBA delta at that untouched source center versus baseline. Other strict RGB/identity/occlusion/colour lighting tests remain.
- **Status on new commit:** verify exact-head required review, all 3 full Playwright shards and separate camera workflow. Do not imply prior green CI verifies this code. Performance overhead is extra shader ALU, not new memory fetches; real low/mid/high Android benchmarks are still needed. Real consented blind makeup-artist comparisons and challenging anatomy/occlusion remain the largest photorealism evidence gaps.
- **Isolation:** `feat/realism-benchmark-v2` only. Public Cloudflare `main` unchanged, no merge, no default/live renderer changes, no customer images uploaded. Licensing handled separately.

## Mandatory next-chat operating procedure

1. Fetch PR #23 **current head SHA** and check `Try-on review` plus separate `Live mirror camera frame regression` workflows for **that exact SHA**. Require `review`, **all three** `Full Playwright suite` shards and independent camera **completed success**. If any fail, read GitHub job logs and fix the real problem. Cancelled runs caused by later commits are not “green”.
2. If CI green, proceed to real **photographic fidelity** research: good eyeliner & lash placement for hooded/monolid/profile eyes; eyeglasses/hair occlusion, skin reflectance, realistic cosmetic opacity and local lighting. Test with protected original pixels plus **consented** diverse real photos, annotated occlusion and blinded professional makeup-artist preference. Synthetic fixtures and image parity alone are insufficient.
3. Run `docs/NATIVE_EYE_ANDROID_BENCHMARK.md` on real **low/mid/high physical Android tiers**, measure native-vs-fast GPU p50/p95, memory/thermals/camera responsiveness. The five-site eye-light reference adds GPU work; do not assert it is faster without observations.
4. Do not expand to 42 looks, merge, enable by default, or deploy until the pilot's beauty fidelity, privacy and physical phone gates are met. Keep PR body, issue #24 and this concise handoff updated with tested exact SHAs/results, not conjecture.

**In the final user response:** link PR #23 and issue #24, state exactly what code was committed, what checks passed/failed/pending, what remains, and whether public production changed.
