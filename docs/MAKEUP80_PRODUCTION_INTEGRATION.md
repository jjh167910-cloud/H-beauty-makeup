# H-Beauty 80-style premium makeup catalog — clean production integration

**Live URL:** https://h-beauty.mostifa2273.workers.dev/#/  
**Existing site:** latest salon makeup screens, favorites, bookings, and navigation from `main` (preserved)  
**Feature flag:** `VITE_MAKEUP_CURATED_80=true` (off by default)  
**Worker:** `h-beauty`

## Source of truth

The user's original `Pictures.zip` contains forty model portraits for named prompts **02 through 42 excluding 07**. The second uploaded `HBeauty_Makeup_43-82.zip` has another forty portraits, *with a different list of names from the earlier prompt brainstorming*. The uploaded filenames are authoritative: examples **43 Office Polished**, **61 Persian Kohl (Sormeh)**, **70 Yalda Night**, **82 J-Beauty Coral**.

Two static data modules enumerate exactly 80 original-numbered styles, Persian/English titles, technique descriptions, categories and palettes:
- `src/data/makeup-curated-40.ts` (original forty, image IDs `mk40-01…mk40-40`).
- `src/data/makeup-curated-43-82.ts` (new forty, image IDs `mk80-43…mk80-82`).

IDs remain stable for bookmarks, history, and booking drafts. When the feature flag is disabled the **existing 42-style production catalog continues unchanged**. Its IDs remain valid even when the curated edition is selected, so old saved/booking references are retained.

## User experience

- Uses the existing v31 mobile-first gallery, category cards, Persian search, style details, favorites and booking sheets from the current `main` branch.
- `VITE_MAKEUP_CURATED_80=true` shows **exactly 80** uploaded looks, with a three-way filter **All 80 / Original 40 / New 40**.
- Every photo is a distinct 4:5 image. The name and English number are **below** it; the favorite icon for the curated edition is moved outside the photo area.
- The detail view uses the real full-resolution portrait. Eyes/lips closeups are zooms of that same photo, not invented additional photos, and the UI discloses this explicitly.
- Images are AI-generated inspiration, not proof of makeup services performed by salon staff.
- The PWA pre-cache includes all **160 verified WebPs** (80 full-size, 80 thumbnails), so a completed installation can use this collection offline.

## How to deliver the single 20 MB asset archive

The exact, SHA256-pinned image asset archive is attached in this ChatGPT conversation as **`hbeauty-makeup-80.zip`** (20,281,715 bytes). This is deliberately *not* `HBeauty_80_Makeup_Complete_Import.zip`: it contains only the exact 162 files expected by the build importer.

1. Open this branch in GitHub or Codespaces and upload that one file to **`assets/hbeauty-makeup-80.zip`**. Its pinned digest is stored in `assets/hbeauty-makeup-80.sha256`. Do not unpack it manually or rename the file.
2. Run (Node.js 22+):
   ```bash
   npm ci
   npm run build:makeup-curated-80
   ```
   This automatically extracts the archive after verifying the locked ZIP SHA256 and the individual images against both manifest SHA256s, checks that all **80** image IDs exist, runs TypeScript, and builds the PWA with an offline cache containing all 160 images.
3. Preview and verify on an actual Android phone and desktop; inspect all 80 images for visual similarity and face-identity drift, plus publication rights.
4. For actual Cloudflare Workers Builds release, set **`VITE_MAKEUP_CURATED_80=true`** as a **build** variable in the connected `h-beauty` Worker. Its `wrangler.jsonc` build step automatically imports/verifies the ZIP before running Vite. Also set GitHub Actions **repository variable** `HBEAUTY_CURATED_80=true` so CI verifies the image bundle. Keep `HBEAUTY_DEPLOY_MODE=cloudflare-builds` if Cloudflare is the single publisher.
5. After passing CI and editorial checks, merge the branch into `main`. Verify the actual result at `https://h-beauty.mostifa2273.workers.dev/#/` including offline first-load and booking flow. If the new edition is unacceptable, set `VITE_MAKEUP_CURATED_80=false` and redeploy the last known good commit.

## Required quality gates

- 80 images with 4:5 framing; 960×1200 full and 480×600 thumbs.
- Both SHA256 manifests and the full ZIP match. The verified source ZIP hash is **`e535f33d830718c52505f311ca9237ee23f9fd79aed6e572cb471cab0d27f6b7`**.
- No absent original or new image: missing file blocks the opt-in build.
- No staged prompt-only placeholders or links substituted for actual WebP assets.
- `npm run typecheck`, `npm run verify:makeup-curated-80`, `npm run build:makeup-curated-80`, and full GitHub Actions mobile UI test must succeed with assets present.
- Rights-holder/model likeness approval, portrait identity and makeup distinctness remain editorial checks; SHA/CI cannot certify them. The separate `npm run verify:makeup-curated-80-release` supports explicit private release approvals.

**Technical note:** This branch is based on current `main`, rather than the earlier draft PR #11 based on an old v31 commit, to avoid losing the newer makeup UI. It supersedes old draft code for this gallery. GitHub connector text-file APIs cannot upload the image ZIP binaries from this chat; the single asset upload is required. A green GitHub CI job in `cloudflare-builds` mode is not proof that Cloudflare itself published a Worker.
