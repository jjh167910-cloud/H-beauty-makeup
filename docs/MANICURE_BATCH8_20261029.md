# H-Beauty — manicure batch 8 visual release

**Source:** eight untouched AI-generated original 1600 × 1600 WebP files recovered from the 200-image legacy source pool. The owner's provenance confirmation is in `docs/PEDICURE_AI_IMAGE_PROVENANCE_20261029.md`.

| Source identifier | Correct destination in gallery | Visible treatment |
|---|---|---|
| U034 | `nail-atlas-geometry-champagne` | Fine champagne-gold geometric lines on almond nails |
| U035 | `nail-atlas-botanical-pearl` | Silver leaf botanical artwork over pearly ivory |
| U064 | `nail-gold-french` | Natural pink base with gilded French tips |
| U079 | `nail-champagne` | Fine champagne shimmer on softly rounded nails |
| U139 | `nail-rose-glitter` | Fine rose-gold stardust glitter |
| U153 | `nail-modern-lines` | Thin linear art over blush square nails |
| U163 | `nail-atlas-velvet-ruby` | Satin ruby velvet finish on squared coffin nails |
| U165 | `nail-atlas-velvet-champagne` | Warm champagne-beige velvet matte on square nails |

The original WebP bytes were not re-encoded or recolored. Each is checked against `assets/hbeauty-manicure-batch8.sha256`. The 8-photo release is atomic, separately gated by `VITE_MANICURE_BATCH8`, and added to offline precache only after validation. A missing file or a mismatch blocks deployment rather than silently publishing an incorrect photograph. The previous nine-photo V4 set, individual Midnight Sparkle, four-photo release, seven-photo batch, and all 78 pedicure photographs are unchanged.

## Visual and factual boundaries

The images are **AI-generated inspiration examples**, not photographs of H-Beauty's treatment outcomes. Visual review checked subject, five visible fingertips/nails, nail-design resemblance, silk background, obvious artifacts and overlap at original resolution. Image generation can still contain nonobvious anatomical artifacts; the service worker SHA checks validate fixed release bytes, not guarantees of physical realism.

## Release verification requirements

- `node --test tests-node/*.test.mjs`, `npm run typecheck`, `npm run build`, `npm run test:ui`
- No CI failures, exact public service-worker SHA verified against the built release.
- Compare all eight public URLs under `/nails/photos/` for 200 and WebP decoding; verify offline gallery behavior.
- If any image proves semantically incorrect in detailed review, remove its mapping via a separate change with documented evidence. Never alter photos silently.
