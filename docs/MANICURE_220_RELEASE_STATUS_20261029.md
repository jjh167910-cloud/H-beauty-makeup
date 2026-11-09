# H-Beauty — manicure production release status (29 October 2026)

## What's already in production
The 220-ID manicure catalog is accessible in the H-Beauty Nail Atelier. Exactly **9 source-verified AI-generated manicure photos** are in the v4 pinned editorial package, and the other **211 styles use vector inspiration illustrations** rather than falsely labeled photos.

GitHub release evidence: [successful deploy workflow](https://github.com/jjh167910-cloud/H-beauty/actions/runs/40920678134). Its build log reports `Installed verified nail photo ZIP v4: 9 unique paths`, `Nail photographic edition: v4 (9 files)`, `Pedicure gallery: 78 verified photos` and exact public-service-worker byte verification.

## Verified mannequin/photo IDs
The authoritative list is `assets/hbeauty-nail-editorial-v4.sha256` (9 unique SHA-256 hashes). Do not replace any of the nine filenames without a new photographic quality sign-off and updated digest lock.

## Why the remaining 211 are not automatically published
The owner's previous manicure uploads were independently audited:
* The original seven archives contained 280 image files but only 200 byte-distinct photos; 80 duplicates.
* A later 98-file archive contained 38 distinct images, with unrelated source assignments and styles showing a wrong subject.
* Of 220 manicure IDs, 9 are approved, 19 were in an explicit review shortlist (not approved), and 192 had no active verified review shortlist.
* There are 7 IDs with no traceable indexed source assignment:
`nail-atlas-foil-coral`, `nail-atlas-botanical-champagne`, `nail-atlas-celestial-blush`, `nail-atlas-sculpture-sage`, `nail-atlas-sculpture-lavender`, `nail-atlas-sculpture-cobalt`, and `nail-atlas-sculpture-midnight`.

These figures describe source provenance and editorial approval, not a prohibition on using additional AI images. User confirms source ChatGPT generation, so stock-photo rights are not the blocker. Style fidelity, finger anatomy, real native resolution, exact ID mapping and deduplication remain the blockers.

## Next complete manicure photo release gate
Before replacing vector previews with all 220 photographs:
1. Match every image to one existing `nail-...` ID and its exact shape, length, finish, and shade.
2. Inspect individual originals for five correct fingers, five nails, no malformed joints, and true ivory silk without stone or props. Validate originality/duplicates and correct color/finish with native-resolution images.
3. Preserve all approved v4 image masters. Produce the 211 missing approvals and a SHA-256 locked `220/220` source manifest.
4. Add a 220-photo build path gated on all assets and their checksums, without changing the existing 78 pedicure path.
5. Run Node tests, image decoding, TypeScript, build, mobile tests and offline QA, then verify each public image URL and deployed service-worker digest.

**Current status:** 220 manicure designs exist; 9 photographic IDs are released, 211 stay deliberately illustrated. The 78-photo pedicure release remains unchanged. Do not misrepresent this as 220 photographic images deployed.
