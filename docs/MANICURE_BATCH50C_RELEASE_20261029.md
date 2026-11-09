# H-Beauty — Manicure Batch50C image release

This source-verified release adds **8 original 1600×1600 ChatGPT-generated manicure reference photographs** to the previous 48 and preserves all **78 pedicure photographs**. Customer-facing images remain labeled AI-generated style inspirations, not salon service photos.

## Style IDs
- `nail-atlas-magnetic-espresso`
- `nail-atlas-magnetic-sage`
- `nail-atlas-geometry-blush`
- `nail-atlas-prism-ivory`
- `nail-atlas-gradient-pearl`
- `nail-atlas-gradient-lavender`
- `nail-atlas-gradient-ruby`
- `nail-atlas-gradient-cobalt`

## Gates
- The eight images are exact original WebP bytes, independently SHA-256 locked in `assets/hbeauty-manicure-batch50c.sha256`.
- Release build fails if a file is missing, corrupt, duplicated, or altered.
- Gallery image paths are enabled only by `VITE_MANICURE_BATCH50_C=true` set after successful build validation.
- All eight enter the offline PWA precache with checksum revalidation.
- Existing V4 nine-photo manicure, all subsequent released manicure batches, 78-image pedicure release, favorites and routing remain unchanged.
- Run Node tests, `npm run typecheck`, `npm run build`, and mobile/booking UI regressions. Verify exact deployed Cloudflare service-worker digest and optionally test individual image URLs.

**Editorial caution:** Visual screening identifies five plausible natural nails and matching polish finish per image, but automated file checks cannot prove perfect anatomy or commercial quality on all displays.
