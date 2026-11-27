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
