# H-Beauty v29 — offline app-shell release gate

**23 October 2026 — Draft; not merged or deployed.**

## Defect corrected

Earlier service worker versions precached HTML, manifest and icons only. JS/CSS/fonts were cached when visited, so an update could remove older cached assets before the replacement bundle was available offline. Activation also removed unrelated caches sharing the origin.

The post-Vite finalizer now discovers the built files under `dist/assets`, embeds exact JS/CSS/font asset URLs in the installed worker, and assigns an asset-content fingerprint to its cache. Hairstyle photos continue caching on demand; they are not all preloaded. The finalizer fails if required files/placeholders are absent or the compiled app assets exceed 35 MiB. Old caches are deleted only when their names begin `h-beauty-`.

## Verified locally

- `node scripts/verify-images.mjs`: PASS, 283 families, 292 full and thumbnail image pairs, 44 focal offsets, 0 errors.
- `node --test tests-node/*.test.mjs`: 6/6 PASS, including offline JS/CSS/font fetches, cache isolation, offline navigation, build version changes, and missing template protection.
- `node --check`: PASS for the worker, finalizer and tests.

All build-finalizer tests used a synthetic compiled-assets fixture. **This does not establish that the full React app built or rendered correctly.**

## Remaining release gates

Local npm registry access is blocked and GitHub Actions has failed before executing runner steps. No real React screenshots, typecheck, production Vite build, or Android offline validation has passed for this release.

When runner access is restored:

```sh
npm ci --no-audit --no-fund
npm run verify:assets
npm run test:offline
npm run typecheck
npm run build
npm run test:ui
```

Inspect the actual `dist/sw.js` generated in the build and verify initial online installation followed by offline reload at 320px, 390px and 768px in both light and dark modes. Keep PR #8 draft until verified. Cloudflare deployment separately requires the GitHub Actions `CLOUDFLARE_API_TOKEN` secret.
