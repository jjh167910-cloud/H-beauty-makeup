# Visible staging after each verified research milestone

This repository has **two distinct release channels**:

1. **Production**: the existing `main` branch and `h-beauty-makeup` Worker. Customer-facing changes follow the private no-regression, blind-artist and Android acceptance gates.
2. **Research preview**: PR #26 and `h-beauty-makeup-review`, deployed from a disposable GitHub runner **only after the 48-look real WebGL2 A/B check passes**. It never connects to the production salon chat/Durable Object and displays a permanent review badge.

The preview workflow [`.github/workflows/research-preview.yml`](../.github/workflows/research-preview.yml) runs on changes to the research code in a same-repository pull request. It:

- Generates candidate eye-cap layers for all 48 public catalog looks in the CI workspace. It checks the 48-image set and UV/crop compatibility.
- Runs actual paired WebGL2 baseline/repeat/candidate rendering across 48 looks, measuring eyelid brightness and non-eye/face/lip pixel changes. It fails without those checks.
- Writes an **offline interactive before/after comparison** of the three diagnostic public-reference looks into `test-results/public-eye-cap-visual/index.html`. It saves actual GPU before and candidate PNGs and per-look measurements for all 48, not illustrative, synthetic or AI-generated replacements.
- Uploads `hbeauty-review-public-before-after` (HTML and actual before/after images) and `hbeauty-review-offline-build` (the isolated build) as GitHub Actions artifacts.
- Only then creates/updates a **separate** Worker using `wrangler.preview.jsonc` and `worker/preview.ts`, never production `wrangler.jsonc`.
- Checks live preview HTTP response for `x-hbeauty-stage: research-preview`, the permanent preview badge, SPA root and disabled `/api/chat`.

**To authorize cloud publishing**, configure the two independent GitHub repository secrets: `HBEAUTY_PREVIEW_API_TOKEN` and `HBEAUTY_PREVIEW_ACCOUNT_ID`. The token must be limited to this disposable preview Worker where Cloudflare permits resource scoping. **Do not copy or reuse `CLOUDFLARE_API_TOKEN`** from production into a PR preview workflow. A missing preview token makes the deployment step fail clearly, but the earlier comparison artifact remains accessible.

The expected link, **only after the deployment and public smoke checks succeed**, is:

`https://h-beauty-makeup-review.jjh167910.workers.dev/`

Do not call this URL live until the Actions summary reports a verified deployment. On mobile, open the public before/after artifact's `index.html` from its extracted folder and drag the portrait comparison slider. Because every file is static and relative, its contents remain usable offline.

**Data hygiene:** only the public makeup catalog model and experimental public layer textures enter these artifacts. No MST-E, private client photos, scored individual identities or salon passcodes are uploaded. No experimental layer is merged into the main production Worker by this procedure.

**Workflow per future change:** implement → commit → verify actual GPU tests → save before/after evidence → publish to staging (if authorized) → provide exact commit and verified preview URL in the chat. Failing regression, offline functionality or private real-face acceptance continues to block a *production* merge even when staging is accessible.
