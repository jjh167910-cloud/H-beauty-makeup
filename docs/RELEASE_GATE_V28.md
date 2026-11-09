# H-Beauty v28 — source-level asset and offline verification

**Release status: Draft; not merged or deployed.** Date: 23 October 2026.

## Locally verified

- `node scripts/verify-images.mjs`: PASS. 283 hairstyle families, 292 full WebP images, 292 matching thumbnails, 44 reviewed focal offsets, no missing/bad signatures or PWA icons.
- `node --test tests-node/*.test.mjs`: PASS, three tests for service-worker install, upgraded cache activation, and offline navigation shell.
- 28 TypeScript/TSX files parsed with zero syntax errors; 10 source CSS files parsed without stylesheet errors. These checks **do not replace** Vite compilation or TypeScript type checking.

## Changes

- Offline service worker advances from `h-beauty-v3` to `h-beauty-v4` and pre-caches the new salon SVG, 192/512px Android icons and Apple touch icon.
- GitHub PR and production workflows verify all hairstyle images and offline service worker behavior *before* installing packages.
- Meta description and PWA shortcuts use honest appointment-request language (`درخواست نوبت`). Removed unverified Tehran location claim from site metadata.
- Existing v26/v27 visual changes remain in the draft: mobile booking visibility, tablet two-column hero, 44 per-image focal offsets, legibility, and controls outside photos.

## Gate still required

No production certification. Real React Playwright screenshots, build, type checking and physical Android tests remain unavailable: local npm registry DNS fails and GitHub Actions runners fail before their first step. Previously generated screenshots are **static layout reproductions only**.

When infrastructure works:

```sh
npm ci --no-audit --no-fund
npm run verify:assets
npm run test:offline
npm run typecheck
npm run build
npm run test:ui
```

Review the resulting real-screen captures at 320, 390 and 768px before merging. GitHub-to-Cloudflare production deployment separately requires the user's `CLOUDFLARE_API_TOKEN` GitHub Actions secret.
