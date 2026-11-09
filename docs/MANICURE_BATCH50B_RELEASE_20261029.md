# H-Beauty — manicure Batch50B release (29 October 2026)

Nine byte-preserved native **1600 × 1600 WebP** editorial inspirations passed source selection and technical preflight. Previous production baseline: 39 manicure photographs, 78 pedicure photographs. A completed release would total **48 manicure** images; other 172 manicure styles remain illustrated.

## Source provenance and intended catalog IDs

| Source | Catalog ID | Visible design |
|---|---|---|
| U019 | `nail-atlas-modern-french-espresso` | Espresso brown double-tip fine-metallic French |
| U029 | `nail-atlas-foil-cobalt` | Cobalt blue with individual gold-leaf flakes |
| U037 | `nail-atlas-modern-french-merlot` | Deep merlot with parallel tip lines |
| U042 | `nail-atlas-modern-french-sage` | Sage double-line French |
| U044 | `nail-atlas-modern-french-lavender` | Lavender double-line French |
| U062 | `nail-rose-french` | Rose-pink French on long nude coffin nails |
| U116 | `nail-atlas-magnetic-midnight` | Midnight blue magnetic cat-eye beam |
| U117 | `nail-atlas-magnetic-coral` | Coral magnetic cat-eye beam |
| U118 | `nail-atlas-magnetic-pearl` | Pearl-white magnetic cat-eye beam |

User confirms ChatGPT-generated image source. Present as **AI-generated inspirations**, never as actual salon work. Native photo inspection was used for visible design/hand/finish consistency, not a guarantee of every microscopic anatomical detail.

## Atomic release acceptance
- Check exactly nine image files against immutable SHA-256 digest list in `assets/hbeauty-manicure-batch50b.sha256`, no duplicate images or style names.
- Build must fail on any missing, altered, malformed or extra-style assigned photos.
- PWA must precache exact nine WebPs alongside previously published 39 manicures and 78 pedicures, without touching their release locks.
- Run `node --test tests-node/*.test.mjs`, `npm run typecheck`, `npm run build`, `npm run test:ui`.
- Accept as live only if the Cloudflare production build has succeeded and the public service-worker checksum matches that exact commit. This check does not individually HTTP-certify every image URL.

Images U001–U200 in the previously audited sources are not authoritative style IDs; curated file naming and hashes for this batch supersede those original provisional assignments.
