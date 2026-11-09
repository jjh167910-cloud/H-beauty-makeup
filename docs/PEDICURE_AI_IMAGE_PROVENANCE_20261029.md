# H-Beauty pedicure images — AI-generation provenance and release gate

Record date: 2026-10-29
Owner-provided provenance statement: **All 78 pedicure images were created using ChatGPT.**

## Commercial use
OpenAI's current Terms of Use / European Terms assign OpenAI's rights in generated Output to the user, to the extent permitted by law. On the owner's stated provenance, no separate stock-photo license is needed for these original ChatGPT-generated images. This is not a guarantee of exclusivity, copyrightability, or non-infringement, and any third-party reference materials or identifiable person's likeness would require separate review where relevant.

Terms: https://openai.com/sv-SE/policies/eu-terms-of-use/

## Representation to customers
Describe these files as **AI-generated nail design inspirations**, never as photographs of actual H-Beauty salon work. Nail-color and finish details may differ from the result of an appointment.

## Technical provenance
The local review package `HBeauty78_Deployment_Ready_REVIEW_ONLY.zip` was inspected with 78 WebP assets under `public/nails/photos/{style_id}.webp`, a SHA-256 manifest, and a release README. The archive and images passed integrity checks in the review workspace. These images have **not** been uploaded to the GitHub repository by this document commit.

## Outstanding production gates
- Upload the 78 WebP files to `public/nails/photos/` under their existing IDs.
- Wire the pedicure gallery to the file paths with a graceful fallback; the repository currently has only `public/nails/photos/UPLOAD-INSTRUCTIONS.txt`.
- Confirm the exact colors, Aura gradient, Jelly translucency, and five-toe anatomy at full resolution. Do not infer visual approval from file integrity.
- Run `npm run typecheck`, `npm run verify:assets`, `npm run test:offline`, and `npm run build`, and perform on-device gallery and offline tests.
- Deploy and verify the live Cloudflare Worker. A previous Cloudflare API action required login/approval and was declined, so no Cloudflare deployment was performed here.

**Release state:** provenance confirmed by the owner; ChatGPT commercial-output rights understood; imagery still awaits final visual and live release QA. Not production deployed.
