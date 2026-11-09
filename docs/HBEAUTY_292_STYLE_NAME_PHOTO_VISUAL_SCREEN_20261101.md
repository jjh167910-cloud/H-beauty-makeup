# H-Beauty — hairstyle image/name audit (1 November 2026)

## Source and scope

Source: the **exact production build artifact** from successful workflow [41256296756](https://github.com/jjh167910-cloud/H-beauty/actions/runs/41256296756), commit `bf639893b54a3ed5b9eb076e4e7f0b816f08ff39`.

The built JavaScript catalog contains **283 style families and 292 uniquely numbered variant IDs (HB-001…HB-292)**, with 292 unique, nonempty Persian names. The build contains all **292 full WebP portraits and 292 matching 560 × 560 thumbnails**, and the production workflow reports byte-for-byte live parity of all 584 assets.

All **292 thumbnails** were laid out across **12 labeled contact sheets** and visually screened in ID order against their Persian title and category. Select full-resolution images, including HB-001, were also inspected. No definite widespread ordering or category-to-photo shift was visible at that inspection scale. The new HB-001 has long chocolate-brown waves **and a visible short fringe**, consistent with its published title.

**Editorial limits:** A contact-sheet pass is not a professional, independent full-resolution certification of all 292 photographs. File SHA-256 equality, metadata presence and category tests cannot establish that a photographed style is correctly depicted. An image may look similar to another without being byte-identical. Do not mark the full catalog “all visuals independently approved” on this evidence alone.

## Near-duplicate editorial queue

These **10 pairs** warrant side-by-side inspection at native source resolution and explicit editorial approval. They are **not** established wrong-ID pairs; labels generally describe the shown style. Do not remove them or claim regeneration without a replacement file.

| Image IDs | Similarity observed |
| --- | --- |
| HB-105 / HB-207 | Almost the same braided high bun |
| HB-103 / HB-210 | Very similar sleek, centre-parted low bun |
| HB-086 / HB-188 | Nearly identical two afro puffs |
| HB-110 / HB-206 | Similar messy top bun with loose face-framing strands |
| HB-036 / HB-140 | Nearly identical long straight hair with full blunt fringe |
| HB-023 / HB-291 | Very similar long straight centre-parted hair; black/brown tone differs |
| HB-108 / HB-208 | Nearly identical braided crown with low bun |
| HB-009 / HB-061 | Two highlighted wavy lobs, similar composition |
| HB-073 / HB-152 | Two curly bobs with curled bangs |
| HB-095 / HB-096 | Two single thick side braids with subtle differences |

The 292 thumbnails contain **zero byte-identical files**; this does not rule out near-duplicates.

## Landing-page release audit

- Main landing hero and first-visit image use **HB-001**, with the matching catalog title.
- Category cards use HB-030 (waves), HB-026 (curls), HB-092 (braids), HB-043 (ponytail); these agree with the catalog taxonomy.
- The featured rail uses HB-063, HB-055, HB-213, HB-125, all existing representative IDs.
- The prior HB-001 short-buzz-cut metadata error has been corrected. HB-023 and HB-291 were also recategorized as straight hair.
- New deterministic tests in `tests-node/landing-hairstyle-semantic-parity.test.mjs` reject accidental future category and hero/title mapping regressions.

## Release policy

Keep the present production photos unchanged until an actual replacement passes image QA and the owner approves it. Repeat the contact-sheet screening and independent spot-check on the next image collection. This audit records *editorial candidates*, not a completed new photography batch.
