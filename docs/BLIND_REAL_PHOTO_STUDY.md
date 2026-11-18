# Private blind real-photo pilot study — H-Beauty Makeup

The experimental native eye-material renderer has many synthetic WebGL2 regression tests. They do **not** establish that the finished look is photographically convincing. This tool creates a strictly local, side-counterbalanced A/B pack for the three existing pilot looks. No customer selfies, pathnames, frame pixels or labels are stored in GitHub, uploaded to any server or included in the automated fixture.

The scripts require Node 20+ and built-in modules only. **Do not run with source photos inside this Git repository.** The script refuses to write its input manifest or output study pack inside the repository. The owner must independently confirm consent for each photo. The pack **refuses metadata-bearing or unsupported PNG/JPEG/WebP containers** by auditing the exact image bytes before writing reviewer assets. It does not re-encode images or change compressed pixels. PNG text/EXIF/unknown chunks, JPEG EXIF/XMP/comments/custom ICC and WebP EXIF/XMP/ICC/animation are rejected; convert or re-export such input locally to an ordinary metadata-free image first. No images are automatically sanitized, and byte-level structure checks are not a full image decode. A portrait is **still personally identifiable** by its visible face: use consent, limited private access and appropriate retention controls.

## Local input manifest

Create a JSON file outside this Git repo, such as /private/hbeauty/manifest.json, with schema_version 1 and a trials array. Each consented subject must have exactly one input pair for each look: hollywood, electric-blue and rhinestone. Use opaque anonymous sample IDs and light/medium/deep evaluation groups. Image paths must stay relative to the manifest folder, resolve within it (including symlinks), and have valid PNG/JPEG/WebP signatures. For each pair, provide:

- sample_id: e.g. S001 (not a person's name)
- skin_group: light, medium or deep
- look_id: hollywood, electric-blue or rhinestone
- candidate_file: relative path to the H-Beauty render of this subject
- comparator_file: relative path to the baseline render of the SAME subject and same look
- consent_confirmed: true (human operator confirmation; not automated consent verification)

The negative-control no-makeup original-pixel check remains in scripts/quality/benchmark_v2.mjs and is not counted as a beauty A/B preference.

## Create an offline blind pack

Set HBEAUTY_STUDY_SEED in the local environment to a private random string of at least 16 characters. Do not include it in the reviewer package or Git history. Run:

    node scripts/quality/blind_photo_study.mjs pack /private/hbeauty/manifest.json /private/hbeauty-study

The tool groups comparisons by look and skin depth, balances the candidate's A/B position to within one trial in every stratum, shuffles presentation order deterministically, verifies a strict metadata-free container allowlist for each photo and writes the verified bytes to opaque filenames inside reviewer/assets. New output folders are private (0700) and files are mode 0600 on POSIX systems; still verify access controls on the actual computer. A metadata rejection fails the pack rather than allowing unreviewed private data into reviewer assets. Reviewer/trials.json and reviewer/scoring-template.csv contain no candidate identity, look ID or skin group metadata. The private answer-key.json is kept under a DIFFERENT sibling directory: never distribute it to raters.

Reviewers should open each same-ID A/B pair in a local image viewer at equal size, with equal exposure and cropping. Each independent makeup artist fills in a separate copy of scoring-template.csv: preferred = A/B/tie, score_a and score_b = integer 1–5 for photographic realism. Keep the reviewer copy private; the builder refuses known metadata-bearing containers but cannot anonymize the visible face or prevent a rater from recognizing a person.

## Unblind only after all sheets are complete

    node scripts/quality/blind_photo_study.mjs score /private/hbeauty-study/private/answer-key.json /private/rater1.csv /private/rater2.csv

Use at least two independent raters, preferably three or more. The command rejects missing/duplicate scores, resolves candidate/comparator preferences through the private key, averages each candidate's artist score and returns one independent observation per subject/look regardless of rater count. Split votes produce a conservative tie. This output is *not* a release certificate. Rejoin with actual no-makeup pixel controls, per-look protected-pixel/clipping audits, consent provenance and required data in benchmark_v2.mjs before assessing the preregistered gate. Do not use synthetic or copied sample scores as real-human evidence.

Practical image preparation: use a trusted offline image editor to normalize EXIF orientation, convert colors into a standard output space such as sRGB and export without EXIF, text, XMP, comments, custom ICC or WebP animation. Confirm the image still looks the same after export. The pack intentionally fails closed on color profiles it cannot safely prove anonymous; it does not silently strip image orientation or color-management data. Do not upload private photos to online metadata-removal websites.

The study must include challenging hooded/monolid/side-angle eyelids, hair and glasses occlusion, varied illumination and all skin depth groups. Separately measure low/mid/high physical Android GPU p50/p95, thermal, memory and battery behavior. Never claim market-leading photorealism from test execution alone.
