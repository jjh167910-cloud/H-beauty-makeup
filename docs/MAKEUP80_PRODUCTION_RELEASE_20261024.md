# H-Beauty 80-Makeup Release — 24 October 2026

## What ships

- Existing H-Beauty v31+ salon app preserved: mobile-first Persian RTL, current hair catalog, booking, saved looks, service cards.
- **80 user-supplied AI-inspired makeup portraits**, numbered **02–42 (07 omitted)** plus **43–82**, with individual Persian names, exact English titles, descriptive makeup briefs and image-to-style mapping.
- **All 80 / Original 40 / New 40** collection switch, existing categories, Persian/English search, unobstructed 4:5 portrait crops, favorites and existing appointment wizard. Full-size detail photos, eye/lip close-ups derived from the *same photo*.
- Original prior saved makeup IDs and historical booking references are retained through the combined `styleById` lookup.
- PWA offline precache includes all **160 960×1200 and 480×600 WebP portraits**, plus app shell. Cache is content-addressed.
- Asset bundle is 14,446,765 bytes with SHA256 `bea05d41a50c85b4ccc8352772d9a11179f3b2a12ac48bbaed4ba4bb741b63d7`.
- Build downloads the immutable bundle only for the 80-look edition, verifies SHA256, strictly validates archive paths and 80 unique image hashes, then unpacks it into `public/makeup`. Source bundle was generated from the two user-supplied ZIPs, and is accessible through an external image workspace.

## Build automation

Workers `wrangler.jsonc` deploy build defaults to `VITE_MAKEUP_CURATED_80=true` **when no explicit override is provided**. It runs:
1. `npm ci` if dependencies absent
2. `npm run prepare:makeup-curated-80`
3. `npm run verify:makeup-curated-80`
4. `npm run build`

A manual override `VITE_MAKEUP_CURATED_80=false` disables this edition to preserve legacy catalog rendering. The GitHub deployment workflow defaults to the same release flag unless the repo variable `HBEAUTY_CURATED_80` explicitly overrides it.

## Tests, evidence, and limits

- Source and asset validation: **80 ID mappings, 80 distinct encoded masters, 80 thumbnails, two manifests**, SHA256 verified.
- Separate asset-download verification: remote bundle retrieved and checksum verified from a clean empty asset folder.
- Node tests: **12/12** on current-main integration.
- React TypeScript + Vite production build succeeded in isolated full-checkout CI-like environment; 177 precache assets at 15.25 MiB.
- Playwright mobile baseline regression **43/43** with the legacy catalog.
- Dedicated 80-look Chromium E2E **3/3**: 80 cards, first/new collection (40 each), Persian/English search, favorites, details and booking button.
- AI-generated makeup imagery is **inspiration**, not proof of services actually performed at the salon. Image-file uniqueness does not prove artistic dissimilarity or model-likeness correctness; editorial assessment remains important.
- **External dependency:** the verified source image bundle currently resides on the connected media provider's CDN. The build fails closed if unavailable or SHA mismatch. Migrate the archive to GitHub Releases or owner-controlled Cloudflare R2 when possible to avoid provider lock-in.

## Deployment and verification

- Worker: `h-beauty` at https://h-beauty.mostifa2273.workers.dev/#/
- Repository: `jjh167910-cloud/H-beauty`; trigger `main` push.
- Publishing mode is configured on GitHub as `cloudflare-builds`; Cloudflare Workers Builds must be linked to the existing Worker and `main` for the live URL to update.
- After merge, confirm the Cloudflare Builds entry for the merge SHA reports success, check the webpage, images for #02 and #82, filters, booking, and offline reload. A GitHub CI green check alone **does not prove live publication**.
- Roll back quickly by setting Cloudflare Builds variable `VITE_MAKEUP_CURATED_80=false` and redeploying, or restoring prior Worker deployment.

No Cloudflare account permissions were bypassed; an earlier protected Worker-inspection request was declined.
