# H-Beauty V18 verified transfer

Twelve binary Git objects reproduce precisely `hbeauty-v18-missing-overlay.zip` (25,148,777 bytes; SHA256 `2b466a4f986000df92149c022800c80f4342bdc7e1d333919d1911d9dde0de4a`). This overlay holds only the 382 changed source/asset files absent or different from this repository, out of 1,179 original V18 files. Nine large verified neural/runtime files (144,289,269 bytes uncompressed) are stored separately in the draft release tag `v18-verified-recovered-assets`. The existing staging source already contains 788 identical Git blobs.

**Do not treat these 12 chunks as a running app.** `.github/workflows/v18-reconstruct-build.yml` reconstructs the exact V18 source in temporary CI space, verifies SHA1 Git object identity for every original file and compiles the PWA. This is an isolated staging build, not H-Beauty production. No real-photo photorealism or offline device inference is certified by source checks.
