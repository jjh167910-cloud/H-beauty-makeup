# H-beauty-makeup — staging repository

This is an **isolated preview destination**, not the production H-Beauty website.

The repository was initially created with a README only. The V14 FULL application archive and its binaries have **not been imported here**. The staging workflow detects that state and does not claim to have deployed the application.

After the complete V14 source and public assets are added, the workflow checks application assets, regression tests, TypeScript, and the Vite production build. It then uploads the built artifact. It may publish only the dedicated Cloudflare Worker **h-beauty-makeup**, provided this repository has valid `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and the assets satisfy the account's file-size limits.

**Never point the staging Worker at the existing `h-beauty` production Worker.** V14's neural research utilities are experimental and do not constitute a validated photographic makeup model. Actual mobile/browser visual quality still requires independent verification.

## Latest staging verification — 9 November 2026

- Verified GitHub Actions run: [42546720790](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42546720790)
- Asset verification passed; offline Node regression suite: **115/115 passed**.
- Dependency installation, TypeScript check, and Vite production build: **passed**.
- Build artifact: [h-beauty-makeup-staging-dist](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42546720790/artifacts/13643762367) (167,750,880 bytes compressed, GitHub-authenticated download).
- Publishing: **skipped intentionally**. The V14 source provenance files are absent and the staging Cloudflare credentials are unconfigured.
- **No public V14 URL exists yet; the imported source is not V14.**
- Keep the production H-Beauty repository and Worker unchanged.

## V14 import handoff (verified archive)

A draft release for the private staging repository has been created:
[**V14 Makeup Staging — upload exact FULL ZIP**](https://github.com/jjh167910-cloud/H-beauty-makeup/releases/tag/untagged-1d6f588832d930c9e5e1).

Attach the exact original `H-Beauty-MaxQuality-Implementation-v14-FULL.zip` (220,167,003 bytes) to the draft and **publish the release**. Its SHA-256 must be:

`8da7a75b370bfc7b1862ec139ca54ad8f0196a1935f76f5f5385a55116825fb4`

The private `import-v14-release.yml` workflow will then verify the full source archive, reject unsafe archive entries, retain staging-only GitHub Actions workflows, rename the Worker to `h-beauty-makeup`, import the source/assets and trigger the CI build. An independent browser screenshot workflow will also run.

**Research safety**: V14 does not certify a trained makeup model, and the existing visual renderer still needs real photo comparisons. This repo is an isolated staging preview, never production. A public Cloudflare URL requires valid account credentials; the current GitHub workflow will not attempt deployment without them and source-provenance validation.

Browser screenshot artifacts (baseline only until V14 is imported): [automated visual smoke workflow](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/workflows/browser-capture.yml).

## Lossless model splitting for Cloudflare staging

Cloudflare Workers Static Assets restrict each individual file to 25 MiB. V14 has three larger `.bin`/`.wasm` model assets (48,000,000, 37,577,374, and 26,781,914 bytes). The staging build runs `.github/staging/split-large-assets.mjs`, dividing these into seven chunks of at most 20 MiB, and the dedicated `.github/staging/worker.mjs` streams the original byte sequence to the app. No model weights are downscaled or omitted. Automated round-trip tests compare the complete SHA-256 digest and byte-for-byte reconstruction. Production H-Beauty is unchanged.

[Passing staging CI with chunk-integrity tests](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42548855709).

The **actual V14 application is still not imported** until the private draft release receives the pinned full ZIP; no live Cloudflare URL has been produced.
