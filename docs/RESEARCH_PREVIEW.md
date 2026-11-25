# Visible staging after each verified research milestone

## Blind mobile review — actual GPU evidence

After the automated WebGL safety assertions pass, the preview workflow publishes two
public-catalog-only, self-contained-in-a-folder review pages:

- `research-preview/index.html`: labeled before/after slider and measured eyelid L* changes
- `research-preview/blind-review.html`: randomized A/B assessment of Icy, Mod-60s,
  and Cut Crease, with a split-view slider, A/B/no-difference voting, optional notes
  and local JSON export. The experimental variant's identity is not displayed to
  the reviewer; the exported file retains the A/B assignment so an evaluator can
  compute blinded preferences. Images are genuine screenshots of the actual GPU
  renderer, never substitute image-generation outputs.

- `research-preview/blind-review-standalone.html`: the same blinded mobile
  interface with all six original actual GPU PNG frames embedded byte-for-byte
  as data URIs. This **single HTML file** can be opened on Android without
  unzipping or accessing the network. The generated `standalone-integrity.json`
  contains SHA-256 hashes and dimensions for each of the six original frames.
  `scripts/bench/package_blind_review.mjs` refuses private-source metrics,
  incomplete styles or screenshots, incompatible image dimensions, and missing
  evidence of eye/face/lip safety. It is built only after browser A/B assertions
  pass; no fabricated or re-rendered evidence is used.

Neither review page transmits photographs, results, comments or metadata. The
reviewer must download their JSON explicitly. This convenience check samples **one
public catalog face and three looks only**; it is **not** the independent real-face
multi-tone benchmark or a professional artist blind panel.

The test now **creates the published visual files only after all GPU protection
assertions have passed**. A failed browser check therefore cannot produce
misleading "verified" before/after files in the workflow artifact. Additional
unit tests reject partial/private screenshot sets and an actual mobile Playwright
test exercises the randomized voting interface and JSON export.

This repository has **two distinct release channels**:

1. **Production**: the existing `main` branch and `h-beauty-makeup` Worker. Customer-facing changes follow the private no-regression, blind-artist and Android acceptance gates.
2. **Research preview**: PR #26 and the optional `h-beauty-makeup-review` Worker. The mobile gallery is generated from a three-look, actual-WebGL2 paired baseline/repeat/candidate test. A separate full 48-look photometry workflow and the full app review must both pass on the **exact same PR head SHA** before cloud publication is allowed. Research hosting does not connect to the salon chat/Durable Object and displays a permanent review badge.

The preview workflow [`.github/workflows/research-preview.yml`](../.github/workflows/research-preview.yml) runs on changes to the research code in a same-repository pull request. It:

- Generates candidate eye-cap layers for all 48 public catalog looks in the CI workspace. It checks the 48-image set and UV/crop compatibility.
- Generates the visual gallery with actual paired WebGL2 baseline/repeat/candidate renders of Icy, Mod-60s and Cut Crease, measuring eyelid brightness and non-eye/face/lip pixel changes. A separate `Catalog pale-lid photometry` workflow audits all 48 looks; a new exact-head CI gate checks that both this audit and `Try-on review` succeeded before attempting cloud publishing.
- Writes an **offline interactive before/after comparison** of the three diagnostic public-reference looks into `test-results/public-eye-cap-visual/index.html` and a randomized `blind-review.html`. This artifact contains six actual GPU before/after PNGs, three-look metrics, and locally exported anonymous-review responses; it does not contain 48 GPU screenshots. The independent full-48 workflow produces its own aggregate numeric evidence.
- Uploads `hbeauty-review-public-before-after` (both review pages, standalone offline HTML, actual PNGs, SHA-256 integrity manifest and metrics) and `hbeauty-review-offline-build` (the isolated app) as GitHub Actions artifacts.
- Only then creates/updates a **separate** Worker using `wrangler.preview.jsonc` and `worker/preview.ts`, never production `wrangler.jsonc`.
- Checks live preview HTTP response for `x-hbeauty-stage: research-preview`, the permanent preview badge, SPA root and disabled `/api/chat`.

**To authorize cloud publishing**, configure the two independent GitHub repository secrets: `HBEAUTY_PREVIEW_API_TOKEN` and `HBEAUTY_PREVIEW_ACCOUNT_ID`. The token must be limited to this disposable preview Worker where Cloudflare permits resource scoping. **Do not copy or reuse `CLOUDFLARE_API_TOKEN`** from production into a PR preview workflow. Missing preview credentials deliberately skip cloud publication and leave the verified, downloadable visual artifacts marked successful; they never imply that a live URL exists. With credentials, `scripts/bench/check_review_checks.mjs` waits for and validates both required **same-head** CI successes, refusing stale, missing, failed or cancelled runs.

The expected link, **only after the deployment and public smoke checks succeed**, is:

`https://h-beauty-makeup-review.jjh167910.workers.dev/`

Do not call this URL live until the Actions summary reports a verified deployment. On mobile, open the public before/after artifact's `index.html` from its extracted folder and drag the portrait comparison slider. Because every file is static and relative, its contents remain usable offline.

**Data hygiene:** only the public makeup catalog model and experimental public layer textures enter these artifacts. No MST-E, private client photos, scored individual identities or salon passcodes are uploaded. No experimental layer is merged into the main production Worker by this procedure.

**Workflow per future change:** implement → commit → verify actual GPU tests → save before/after evidence → publish to staging (if authorized) → provide exact commit and verified preview URL in the chat. Failing regression, offline functionality or private real-face acceptance continues to block a *production* merge even when staging is accessible.
