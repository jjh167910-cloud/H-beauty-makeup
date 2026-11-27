# Integrated review handoff — 2026-11-27

Review only. Never merge this branch into main or promote unvalidated candidates.
Working review URL: https://h-beauty-review.jjh167910.workers.dev/
Prior validated source: dcdf7f8b5074ec751642e639de24984f42a55dad. Live SHA not independently verified.

## Soft eyeliner containment research (quality plan item 5)
- 57b25aef8447d2ed89715265376f4758755d4d30: opt-in GLSL containment for thin upper liner only; conservative sampling of blurred opening mask. Default off (softLinerPilot=1 explicitly enables it).
- 4ef4cff0d7ebd2a6c84022b5199eee770e912f47: 22 paired public GPU renders: five original modes, five guarded modes, and one guarded no-liner control per look (Romantic Bride, Nineties).
- 061c7d021dd3bd0e6e53e317d89520e1f82a24d0: fixed rim CIEDE2000 scoring; original strict protected-pixel and clipping checks retained; guarded candidates additionally compared to guarded baseline and no-liner control.
- 937f4e6da5732b0434cc910ae8ef88eb7f77c084: public calibration workflow integrated into PR #39.
- No recipe promotion. Guard is a hypothesis, not verified improvement. If no mode meets all criteria, retain original recipe. If protected pixels still change, inspect masks, rasterization alignment and liner-independent lash composition rather than relax limits.

## Next
Read exact-head workflow runs and public-soft-liner-calibration report. Require real paired GPU outputs, unchanged protected pixels, original score improvement and cheek/clipping controls. Check whether no-liner control differs for reasons other than pigment and diagnose rather than suppress failures. Review images before promotion. Then address remaining quality plan items, including smoky depth, under-eye chroma and lighting-adaptive lips, with targeted public pairs and private real-face gates. Preserve 48-look regression tests, original identity and all non-makeup pixels. Private benchmark, artist review and physical Android acceptance remain outstanding. Never upload private photos or modify production.

## 2026-11-27 — integrated smoky-band and gate update
- Prior exact head 21592289d0a62c4032ea339b15dcee11bb07e691: seven workflows completed success. Soft liner run 45920971971, report selections baseline/baseline. Best guarded ΔE00 3.506 / 4.254 versus 4.559 / 4.970; zero protected changes versus guarded no-liner, but 91 / 95 versus original renderer. Do not promote. No-liner scores 3.362 / 4.056 are even lower, so evaluate anatomical realism and reference alignment, not just color error. MediaPipe destructor warning was nonfatal.
- Review package published in run 45920971982, job 140252992567; live SHA not verified.
- PR #29 source audit 45720445062 passed 48 looks but individual reference luminance errors increased; no promotion on source-only evidence.
- PR #30 exact head 55261aa54b50e3cabef8cebd4215fd48d9ea4f0a, run 45727320453: 39 tests passed; Arabic Glam L* 25.6296 -> 24.1422 (reference 20.7251), 3960 changed pixels, zero outside. Navy Smokey unchanged; reference lighter than baseline. Ported shader, recipe flag and paired test to integrated branch in a030ac1255e5d86f0cd76cb534e665f3b62a27e4, 0c99d2e44699ac71b516c927b4c0f759af55c3fd and e3ef7c24c1bfd6bcb04ea5573bc5002ffcaffd40. Default off; `?engine=v2&smokeBandPilot=1` enables Arabic Glam only. Integrated validation pending.
- Added soft liner safety workflow to mandatory exact-head checks, including native deployment, in d305541efb71cec3c57951499d16cd2f435aa851, dfc64bce2c9fe5cf0db0bab72c4a7e857728aa69 and 9207b05463cd1e4a4a6c1af4d58ec40599ff10a1. Six independent checks plus preview workflow required. Unit tests and integrated CI pending on new head.
- Next: inspect exact-head GPU/CI results, keep all pilots default-off until evidence; solve eyeliner with original baseline protection intact, assess under-eye PR #31 on actual medium/deep skin locally; proceed with lighting-adaptive lips and other unaccepted defects. Private real-face, artist and physical Android gates remain outstanding. No production changes. Library plan search yielded no results in this run.

## 2026-11-27 — under-eye integration and lipstick CI repair
- Original user roadmap received; authoritative 13-item ledger at https://github.com/jjh167910-cloud/H-beauty-makeup/blob/quality/under-eye-chroma-20261126/docs/QUALITY_ROADMAP_STATUS.md . Original private 944-render quick gate, full 48-look gate, artist and physical Android acceptance still required.
- Prior integrated head 50bd9fcc9a30a33408c543f6a941dbd51d1a3045: all seven exact-head workflows completed success (review run 45969201022, preview 45969200960). Live SHA not independently verified.
- Under-eye PR #31 exact head eaff1f3ae740e435397c8a46b670fe8abe4dc51d passed review run 45970339882. Ported the opt-in shader and three fixed-region tests to integrated PR #39: 75e7b4506c606b0feef5a7e3ec1d801e5a1a6df7 and dc61cfab215713b09d150680e0ba6fc00de85ec2. Enable only with ?engine=v2&underChromaPilot=1. No private real-face efficacy claimed. Recheck integrated CI before preview deployment.
- Lipstick PR #33 prior head 2c2f6c181c86a63e2a7556b072d88a969b54ffa1 failed review run 45971463924, job 140412659302: 39 passed, 1 failed at transient HD status indicator. All nine lip-light diagnostic cases had null secondary cue and zero activation; warm input had 33,485 clipped source channels. Commits 41d6318f045ef1553659b7184010fdc47289554d (wait for actual completed HD result; preserve sharpness, identity, exterior and toggle assertions) and b04cbc11271f752a9f810baf3db9650b4eb6e40d (invertible light transforms, zero input clipping required). Both fixes awaiting CI. No estimator efficacy or HD root-cause certainty claimed. Next diagnose secondary cue rejection, retain default off, no forced cast or weakened gate.
- Remaining: eyeliner baseline protection, bold-eye artifacts, Golden Hour blush, lipstick cue, highlight stress, brow concealment, minor regressions and private/artist/Android gates. Production untouched.
