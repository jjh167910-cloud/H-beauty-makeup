# H-Beauty — 162-style manicure photo queue (manifest-verified progress)

This document tracks the **original** 162-style backlog created when 58 of 220 manicure photographs had been published. It is not a claim that all 162 are still missing.

## Verified checkpoint — 30 October 2026

The successful GitHub production workflow for commit `afe41545cb9f99d62a8a7e0f8e3c78e19f9b034f` confirmed 70/220 manicure photos and 78/78 pedicure photos, with matching public service-worker bytes and SHA-256 validation of the published photographs.

- Original baseline: 58 manicure photos.
- Additional approved and published images from the original 162-style queue: **12**.
- Current manicure photos: **70/220**; **150** still without approved photographs.
- Original queue progress: B61 **10/50**, B62 **1/50**, B63 **1/50**, B64 **0/12**.
- Pedicure baseline: **78**, unchanged.

The original queue remains at `docs/HBEAUTY_MANICURE_162_QUEUE.json` for audit continuity. Its `published_photo_count:58` and `missing_photo_count:162` fields are **historical cohort baseline fields**, not current production totals. Use `node scripts/nail-release-progress.mjs --markdown` to calculate current manifest-derived counts. **Manifest-derived counts prove source membership, not live Cloudflare publication**. The separate deployment workflow must pass live byte checks.

## Source decisions — 30 October

- **Sage Velvet Matte Short Square**: the archived native PNG has a visible limestone/stone surface beneath the hand. **REJECTED** for the required pure ivory silk studio brief, even though nail finish and shape are plausible.
- **Sage Garden, Botanical Line and Lavender Velvet Matte** native archival sources examined: visibly rest on stone. **REJECTED** for that reason.
- **Pearl/Midnight/Sage Double French** older sources: visibly stone-backed, and some are closer to medium/short instead of long as required. **REJECTED**.
- **19 standalone chrome and French originals** were separately found on ivory silk; four were already promoted in release #65. Other images are already covered by a distinct approved release or need precise shape/length/palette QA. No additional image is automatically approved.
- **External 1360×768 Sage Velvet Matte generation**: **NOT RELEASED**. It is a landscape image with height below the current minimum native-resolution gate, not a compliant square photograph.
- Contact sheets and cropped individual panels are not standalone originals and must not be published.

## Release conditions

A new image requires a genuine single-image original at native square resolution, the exact catalog style ID/shape/length/finish, five anatomically normal nails, no stone or props, distinct styling, full-resolution review, an individual editorial QA record and a SHA-256 lock. Do not relabel or change the catalog specification to fit a convenient photograph. Preserve AI-generated **inspiration**, not salon-work, labeling.

Each new 1–50-image batch must pass typechecking, production build, all-photo offline precache, mobile RTL/booking QA, Cloudflare public service-worker byte matching and all-public-photo SHA-256 checks. Never claim an image is deployed solely because a PR was opened or merged.

**Current queue/prompt sources:** `docs/HBEAUTY_MANICURE_B61_PROMPTS.md` through `docs/HBEAUTY_MANICURE_B64_PROMPTS.md`. Generated code and prompts do not create or approve new photo bytes.
