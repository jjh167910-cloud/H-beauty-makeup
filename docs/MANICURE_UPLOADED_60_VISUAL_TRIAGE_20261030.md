# 2026-10-30 uploaded manicure intake — visual triage only

**NOT an image release, editorial approval, deployment, or claim of native generator provenance.**

Three 20-file user archives were examined: `h-beauty-manicures-batch-01-of-08 (1).zip`, `h-beauty-manicures-batch-04-of-08.zip`, `h-beauty-manicures-batch-05-of-08.zip`. Original bytes were not committed or modified. All 60 files decoded as 1600×1600 WebP, with distinct filenames and unique SHA-256 hashes in the local QC artifact. The 60 exact IDs were cross-checked against the repository's 162-style manicure queue and were not QA-approved in that queue.

This summary is based on all 60 source previews (four images per 1620×1660 review sheet, 15 sheets) and selected native-scale inspections. The photographic image masters and full per-image checksum spreadsheet exist in the conversation's HBeauty QC deliverable, **not** in this PR. Neither 800 px previews nor an image's width prove it is a natively generated 1600 px original.

## Visual categorization

- **28** visually plausible candidates; do not publish until all independent required gates pass.
- **16** need a fuller exact-style, length/shape, effect, or anatomy investigation.
- **16** visibly unsatisfactory for the assigned metadata; regenerate/replace.
- **0 editorial approvals; 0 new images released.**

**Correction to early contact-sheet assessment:** The double-French photographs *do* show two separate tip lines on closer inspection. Check their requested shape and length individually; do not reject the whole family for missing double lines.

High-priority fails: solid-looking `gradient-ivory`/`gradient-blush` lack clear two-tone fades; multiple `jelly-*` photos are too opaque; some `watercolor-*` look like hard-edged stone veining; curled/hollow-looking thumbnails on `aura-ruby`, `aura-merlot`, and `jelly-sage` are unsuitable; `nail-cobalt-lines` lacks an unambiguous deliberately painted line motif.

| Catalog ID | Catalog shape | Catalog length | Finish | Visual intake status |
|---|---|---|---|---|
| `nail-sage-garden` | oval | medium | art | HOLD_EXACT_STYLE_REVIEW |
| `nail-lilac-bloom` | almond | medium | art | HOLD_EXACT_STYLE_REVIEW |
| `nail-cobalt-lines` | coffin | long | art | REJECT_REGENERATE |
| `nail-atlas-velvet-merlot` | almond | medium | matte | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-velvet-espresso` | oval | long | matte | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-velvet-sage` | square | short | matte | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-velvet-lavender` | coffin | medium | matte | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-velvet-cobalt` | almond | long | matte | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-gradient-ivory` | almond | short | ombre | REJECT_REGENERATE |
| `nail-atlas-gradient-blush` | oval | medium | ombre | REJECT_REGENERATE |
| `nail-atlas-gradient-champagne` | square | long | ombre | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-gradient-espresso` | oval | long | ombre | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-gradient-sage` | square | short | ombre | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-gradient-coral` | square | medium | ombre | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-modern-french-ivory` | square | long | french | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-modern-french-blush` | square | short | french | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-modern-french-ruby` | square | long | french | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-modern-french-midnight` | square | long | french | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-modern-french-coral` | square | short | french | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-modern-french-pearl` | square | medium | french | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-watercolor-blush` | almond | long | art | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-watercolor-champagne` | oval | long | art | REJECT_REGENERATE |
| `nail-atlas-watercolor-ruby` | square | long | art | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-watercolor-merlot` | coffin | long | art | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-watercolor-espresso` | almond | long | art | REJECT_REGENERATE |
| `nail-atlas-watercolor-sage` | oval | long | art | REJECT_REGENERATE |
| `nail-atlas-watercolor-lavender` | square | long | art | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-watercolor-cobalt` | coffin | long | art | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-watercolor-midnight` | almond | long | art | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-watercolor-coral` | oval | long | art | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-watercolor-pearl` | square | long | art | REJECT_REGENERATE |
| `nail-atlas-magnetic-ivory` | oval | medium | cat-eye | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-magnetic-blush` | oval | medium | cat-eye | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-magnetic-champagne` | oval | medium | cat-eye | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-magnetic-merlot` | oval | medium | cat-eye | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-magnetic-lavender` | oval | medium | cat-eye | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-magnetic-cobalt` | oval | medium | cat-eye | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-ivory` | coffin | long | aura | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-blush` | almond | long | aura | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-champagne` | oval | long | aura | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-ruby` | square | long | aura | REJECT_REGENERATE |
| `nail-atlas-aura-merlot` | coffin | long | aura | REJECT_REGENERATE |
| `nail-atlas-aura-espresso` | almond | long | aura | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-aura-sage` | oval | long | aura | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-lavender` | square | long | aura | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-aura-cobalt` | coffin | long | aura | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-midnight` | almond | long | aura | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-coral` | oval | long | aura | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-aura-pearl` | square | long | aura | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-jelly-ivory` | square | long | jelly | HOLD_EXACT_STYLE_REVIEW |
| `nail-atlas-jelly-blush` | square | short | jelly | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-jelly-champagne` | square | medium | jelly | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-jelly-ruby` | square | long | jelly | REJECT_REGENERATE |
| `nail-atlas-jelly-merlot` | square | short | jelly | REJECT_REGENERATE |
| `nail-atlas-jelly-espresso` | square | medium | jelly | REJECT_REGENERATE |
| `nail-atlas-jelly-sage` | square | long | jelly | REJECT_REGENERATE |
| `nail-atlas-jelly-lavender` | square | short | jelly | VISUAL_CANDIDATE_NOT_APPROVED |
| `nail-atlas-jelly-cobalt` | square | medium | jelly | REJECT_REGENERATE |
| `nail-atlas-jelly-midnight` | square | long | jelly | REJECT_REGENERATE |
| `nail-atlas-jelly-coral` | square | short | jelly | REJECT_REGENERATE |

## Mandatory release holds and next action

1. Every approval must refer to a real original image with auditable native-generation provenance and individual full-1600px editorial inspection; a 1600px header or visually pleasing image cannot prove native generation. A future reviewer may be different from this preview triage.
2. Match every style's shape, free-edge length, color, opacity, finish and motif to the catalog; compare against **previously published image pixels**, not only their SHA files, to ensure visually distinct output.
3. Only then create accurate `assets/hbeauty-manicure-batch*.sha256`, per-image `.qa.json` attestations, and queue approvals. Never write fabricated `PASS` values.
4. Require Atelier Review (full image QA, browser tests, mobile RTL/booking, offline integrity) and after merge exact live service-worker checksum plus all nail-photo URL byte hashes. No publication solely to hit a batch-size goal.
5. Preserve currently approved manicure photos, the six legacy quarantined originals and all 78 pedicure photographs.

This triage alone changes **no application code, queue status, public images or Cloudflare service**.

## Immutable source-identity ledger (added after initial triage)

The per-original SHA-256 hashes, exact catalog IDs, catalog shape/length/finish, and rejection/hold/candidate dispositions are now recorded in [MANICURE_UPLOADED_60_ORIGINAL_SHA256_NOT_APPROVED_20261030.csv](MANICURE_UPLOADED_60_ORIGINAL_SHA256_NOT_APPROVED_20261030.csv). Every source remains explicitly `UNVERIFIED` for generation provenance, `NOT_GRANTED` for editorial approval, and `DENIED` for release permission. The historical source ledger is immutable evidence, not an approval manifest or published hash lock.

`tests-node/manicure-intake-ledger.test.mjs` validates all 60 ledger IDs and hashes are unique, catalog shape/length/finish match the actual queue, exactly 28/16/16 dispositions are present, and no row can be misread as approved. Existing production photo records and all 78 pedicure originals remain untouched. Future genuine approved replacements use separate generation evidence and the existing editorial release records; do not mutate this historic baseline to create fake approvals.
