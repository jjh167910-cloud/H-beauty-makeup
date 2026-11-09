# H-Beauty v30 — Offline release transitions and focal-framing QA

Date: 23 October 2026. **Draft release candidate; not deployed.**

## Confirmed source-level risks corrected

1. Previous service worker deleted all preceding salon caches on activation. An older open tab could lose cached JavaScript assets during an update.
2. Each online navigation overwrote the installed HTML in the current offline cache, potentially pairing a new deployment's HTML with an older precached JS/CSS bundle.
3. A broad cache lookup could select the preceding version's HTML rather than the current version's copy after retaining the previous cache.
4. Horizontal photo focal overrides implicitly reset vertical `object-position`. The helper now preserves the intended per-view vertical alignment: portrait cards 32%, homepage hero 30%, immersive view centered.

## Changes

- Retain current and immediately preceding `h-beauty-` caches, delete older app caches only, never delete foreign caches.
- Never overwrite installed offline HTML during regular navigation.
- Prefer current cache for offline HTML and static assets; fall back to previous cache for old chunks.
- Updated seven dependency-free service-worker tests and browser-level photo focal expectations.

## Verification

- `npm run test:offline`: **7/7 passed locally**.
- `npm run verify:assets`: **PASS**, 283 families, 292 full-size images, 292 thumbnails, 44 focal overrides.
- TypeScript syntax parsed in 28 TS/TSX source/test files: **0 parse errors**.
- All 109 internal TypeScript imports resolved under the project's alias/barrel structure.

## Still blocked

Full Vite build and real React browser screenshots are **NOT verified**. The current environment lacks an npm tarball in the offline cache, cannot reach registry DNS, and Chromium blocks page navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. GitHub Actions has previously failed before runner steps. Do not report the previous static layout previews as actual React screenshots.

Before merge: run `npm ci`, `npm run verify:assets`, `npm run test:offline`, `npm run typecheck`, `npm run build`, `npm run test:ui`. Capture and inspect real screens at 320, 390 and 768 px in light and dark mode and verify offline → update → offline.
