# H-Beauty — manicure archive subject/background triage (29 October 2026)

**REVIEW ONLY — NO NEW MANICURE IMAGE IS APPROVED BY THIS AUDIT.**

The seven uploaded legacy ZIPs contain 280 WebP entries but only **200 byte-distinct originals**. After examining labeled contact-sheet previews of all 200 unique sources, the visually apparent subject/background split is:

| Category | Count |
|---|---:|
| Clearly photographs of feet (invalid as manicures) | 64 |
| Hands placed on stone/limestone (violates pure ivory-silk brief), excluding foot photos | 37 |
| Hand images with silk or neutral background, needing full-resolution review | 99 |
| Total unique originals | 200 |

There were **44 images** with visible stone in total, seven of which were also in the foot group. The 99 clean-subject/background items are NOT matching or approved nail designs: the archives' provisional numerical ordering is unreliable. Examples on the first source review sheet: U001 assigned to `nail-milky-silk` shows purple polish, and U004 assigned to `nail-ruby-red` shows pink polish. Some sources were also previously repeated under unrelated style numbers.

## Tracking and next quality gate

`docs/MANICURE_200_SOURCE_SCREEN.csv` records U001–U200 screening outcomes. These IDs refer to the prior `HBeauty_7_ZIPs_AUDITED_200_Unique_Staging_NOT_APPROVED.zip` source evidence archive; **they are not publishable style IDs**.

The owner confirmed the imagery was generated using ChatGPT, so stock-photo licensing is not the principal blocker. Still required: verify the correct five-finger anatomy, color, nail shape and length, finish, design motif, nonduplication, single-source sharpness and orientation **at native resolution**. Confirm a 1:1 match to the authoritative 220 manicure style IDs before any new photo is SHA-locked or released.

The current production release already has **nine quality-gated manicure photographs**, plus **78 pedicure photographs**. Continue to use vector illustrations for the other 211 manicure designs. Do not publish these 99 unreviewed originals based solely on the screening result.

**Review scope:** human visual evaluation of contact-sheet images at approximately 230px each. It does not constitute a full pixel-level anatomy review, and 'not obvious stone' is not a guarantee of pure silk. The full per-source hash inventory and separated review images are in the conversation release package; the stored CSV here is a lightweight decision index only.
