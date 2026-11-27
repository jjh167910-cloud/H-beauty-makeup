# Systematic quality plan — 27 November 2026 checkpoint

Source of requirements: user-supplied **Systematic Quality Plan — Hananeh Beauty Try-On.docx**, 20 November, updated 25 November. The source document is not uploaded to the repository. This ledger records experiment status, not release approval.

| Original defect | Research location | Current evidence and remaining acceptance |
| --- | --- | --- |
| 1 Electric Blue lower lashes | PR #27, integrated PR #39 | Candidate integrated for review; repeat actual GPU and private full-set comparison before acceptance. |
| 2 Pale lids | PR #26, #39 | Full 48-look public photometry passed on 21592289d0a62c4032ea339b15dcee11bb07e691; private benchmark and Mod-60s crease validation remain. |
| 3 Bold-eye artifacts | PR #29 | Source audit passed 48 looks, but some direct reference luminance errors increased. No visual acceptance; preserve intentional liner and lash strands. |
| 4 Smoky depth | PR #30, #39 | Arabic Glam L* 25.6296 → 24.1422, target 20.7251, zero exterior changes. Navy Smokey unchanged in pilot; existing sample target lighter than baseline. Integrated exact-head run pending; original 48-look ΔE criterion remains. |
| 5 Soft liner | PR #28, #39 | Guard eliminates pigment changes versus guarded no-liner but differs from original on 91/95 protected pixels. No recipe accepted. |
| 6 Under-eye chroma | PR #31 | Synthetic pilot prior result 616 changed pixels, zero exterior/tint changes, mean changed-pixel chroma loss 0.1086908 → 0.0610970 (not CIEDE2000). New fixed-region and lighting regression tests in fbb592b394bcabe218b0383c26c21ff1c2face38. Real medium/deep skin validation pending. |
| 7 Blush | PR #32, #39 | Pin-Up candidate integrated for review; Golden Hour unresolved unless measured improvement is verified. |
| 8 Colored-room lipstick | PR #33 | Dual-reference illuminant pilot; cross-light actual GPU and private test needed. |
| 9 Glitter | PR #34, #39 | Public calibration workflow passed prior integrated head; private and artist assessment outstanding. |
| 10 Highlight clipping | PR #35 | Isolated headroom pilot; verify nonzero baseline clipping, full stress set and later separate render passes. |
| 11 Brow concealment | PR #36 | Isolated local-skin estimate pilot; actual strongly lit faces and visual acceptance pending. |
| 12 Minor regressions | PR #37 | Ten-look historical regression audit; re-evaluate after items 1–4, including named lid/lower-lash regressions. |
| 13 New brow shapes | PR #38, #39 | Public brow calibration workflow passed prior integrated head; Korean straight and fuller Hollywood shapes need private and artist validation. |

## Current CI and next action

Integrated PR #39 head 50bd9fcc9a30a33408c543f6a941dbd51d1a3045 was still running full validation at inspection; four independent calibrations succeeded. Keep it stable rather than interrupt its in-flight tests. Last fully successful integrated head 21592289d0a62c4032ea339b15dcee11bb07e691; live exact SHA unverified.

Under-eye PR #31 prior exact head d0a5d2d19d840b28ca5f4f09dfd4800b9d19c1ff, CI run 45727188037, job 139599893570: 39 tests passed. New test measures every pixel in fixed landmark support in normal, dim and warm synthetic light, retains zero exterior/tint changes, rejects new clipping, and requires normal-light activation and improvement. Lighting transforms are not distinct real skin tones. No shader change this iteration. New-head CI pending. Run locally: npm ci; npm run test:ui -- tests/look-recipes.spec.ts --workers=1 --grep 'under-eye chroma pilot'.

## Original release gates (not satisfied)

Use a fixed private quick set of 59 photos × 8 looks × both engines = 944 renders on each change, full benchmark before release, per-look/skin/light reports and worst renders; preserve original thresholds: color and known-light ΔE <3, hue gap ≤10°, spill <3%, edge ratio 0.8–1.2, shading correlation >0.95, identity similarity >0.9, no non-makeup pixel changes or new clipping. The artist approves target cards, scores blind comparisons with repeats, and assesses professional realism. Headline targets: ≥40% judged real makeup and ≥70% blind preference over best competitor. Physical Android speed/memory/offline verification mandatory. Private images never go into GitHub, CI or any AI service. No production deployment/merge without explicit authorization. PR #23 remains separate longer-term realism groundwork.
