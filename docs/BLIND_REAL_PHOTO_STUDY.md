# Private blind real-photo pilot study — H-Beauty Makeup

The experimental native eye-material renderer has many synthetic WebGL2 regression tests. They do **not** establish that the finished look is photographically convincing. This tool creates a strictly local, side-counterbalanced A/B pack for the three existing pilot looks. No customer selfies, pathnames, frame pixels or labels are stored in GitHub, uploaded to any server or included in the automated fixture.

The scripts require Node 20+ and built-in modules only. **Do not run with source photos inside this Git repository.** The script refuses to write its input manifest or output study pack inside the repository. The owner must independently confirm consent for each photo. The script copies bytes unchanged: EXIF and other embedded metadata may remain. Strip metadata before sharing even privately. The reviewer assets are not anonymized photographs; reviewers may recognize people. Use controlled private access.

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

The tool groups comparisons by look and skin depth, balances the candidate's A/B position to within one trial in every stratum, shuffles the presentation order deterministically, and copies the paired photos to opaque filenames inside reviewer/assets. Reviewer/trials.json and reviewer/scoring-template.csv contain no candidate identity, look ID or skin group metadata. The private answer-key.json is kept under a DIFFERENT sibling directory: never distribute it to raters.

Reviewers should open each same-ID A/B pair in a local image viewer at equal size, with equal exposure and cropping. Each independent makeup artist fills in a separate copy of scoring-template.csv: preferred = A/B/tie, score_a and score_b = integer 1–5 for photographic realism. Keep the reviewer copy private; the builder does not remove identifying metadata or prevent a rater from recognizing a face.

## Unblind only after all sheets are complete

    node scripts/quality/blind_photo_study.mjs score /private/hbeauty-study/private/answer-key.json /private/rater1.csv /private/rater2.csv

Use at least two independent raters, preferably three or more. The command rejects missing/duplicate scores, resolves candidate/comparator preferences through the private key, averages each candidate's artist score and returns one independent observation per subject/look regardless of rater count. Split votes produce a conservative tie. This output is *not* a release certificate. Rejoin with actual no-makeup pixel controls, per-look protected-pixel/clipping audits, consent provenance and required data in benchmark_v2.mjs before assessing the preregistered gate. Do not use synthetic or copied sample scores as real-human evidence.

The study must include challenging hooded/monolid/side-angle eyelids, hair and glasses occlusion, varied illumination and all skin depth groups. Separately measure low/mid/high physical Android GPU p50/p95, thermal, memory and battery behavior. Never claim market-leading photorealism from test execution alone.
