# H-Beauty manicure | First 50-candidate quality batch

Date: 29 October 2026. **50 original candidate photographs screened; 10 selected; 40 withheld.**

Release gate: all ten source WebPs are distinct native 1600×1600 imagery with an observed single hand and five fingernails, neutral/ivory silk background, reviewed style color/finish, unique SHA-256 hash, and no byte-equal overlap with earlier source selections. See `assets/hbeauty-manicure-batch50-a.sha256` and `docs/MANICURE_BATCH50_A_QA.csv`.

The ten source U IDs in the latest 200-image archive: U004, U005, U007, U009, U016, U028, U074, U076, U158, U159. Images were re-identified to existing H-Beauty style IDs; their misleading original provisional filenames are NOT used.

Forty other reviewed images remain on hold; no guess-based rename or color substitution is allowed. The existing 29 manicure and 78 pedicure approved image bytes are preserved. Expected manicure image coverage after this release: 39 of 220.

Images are labeled AI-generated inspiration rather than real salon work. Visual quality review is necessarily judgment-based; byte verification and browser tests alone do not certify every anatomical or aesthetic property.

Deployment is only complete once PR review and the live service-worker checksum verification for the merge commit pass. Individual public WebP URLs require their own HTTP check if exact HTTP availability is to be claimed.
