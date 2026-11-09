# H-Beauty V18 — offline web application (isolated staging)

**Release status (9 November 2026): COMPLETE verified source reconstruction and production PWA build. Website hosting remains unpublished.**

## Deliverables

- [**Verified complete V18 PWA build release**](https://github.com/jjh167910-cloud/H-beauty-makeup/releases/tag/v18-reconstructed-pwa-build): `HBeauty-V18-COMPLETE-VERIFIED-PWA.zip`, ~166 MB compressed, with SHA-256 checksum and source-provenance audit.
- [Successful complete V18 source reconstruction, tests, and production build](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42666794114).
- [Successful archival of production build](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42667572203).
- [Source transfer chunks and provenance](.github/v18-transfer/PROVENANCE.md).

## What was verified

1. **Exactly 1,179 original V18 files, 222,537,413 bytes**, reconstructed from 788 matching baseline Git files, 382 transferred changed files, and 9 SHA-256-verified model/runtime files recovered from GitHub Actions.
2. Original Git blob SHA-1 and byte count checked for every source file before compilation. The original source archive SHA-256 is pinned: `c94b46dfb30e6bbcafa611d24399aada9f38a3f5a04ce220a1e75c146f3fec86`.
3. One explicit **post-provenance TypeScript annotation fix** was applied to `src/lib/photo-export.ts` for a previously failing TS7006 check. Both pre- and post-patch SHA-256 values are recorded in the build audit. The neural weights were **not changed**.
4. `npm ci`, offline Node/PWA checks, catalog asset audit, TypeScript checking, `npm run build`, and `npm run verify:pwa-dist` **all passed**.
5. A complete browser deploy artifact was archived as a permanent GitHub Release rather than relying solely on expiring Actions artifacts.

## What is not complete

- **No live public V18 web URL yet.** The [direct V18 PWA release deployment workflow](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42668173801) has passed release checksum, model-chunk integrity and static asset-size checks, but safely skipped Cloudflare publish because the staging account credentials are absent. GitHub Pages is not configured for this private repository ([read-only Pages diagnostic](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42667851364) reported HTTP 404). This repository's Cloudflare account authorization / staging Worker secrets are also unavailable. Those hosting permissions cannot be inferred from passing CI.
- **Not physically verified offline on Android.** An installable PWA requires its model pack to be downloaded and installed once; after successful installation, on-device MediaPipe / ONNX inference is designed to work disconnected. Device storage eviction may require reinstalling offline assets.
- **Not independently certified state-of-the-art photorealism** and no verified arbitrary reference-photo neural transfer. V18 retains earlier ONNX look-specific experimental models and local WebGL processing, not a validated high-resolution real-photo-trained checkpoint.

## Isolation

The intended staging Worker is **`h-beauty-makeup`** only. The original `jjh167910-cloud/H-beauty` repository and production salon website were not edited. The older manual test studio is not the V18 offline application and must not be presented as such.

## Rebuilding

Open [`v18-reconstruct-build.yml`](.github/workflows/v18-reconstruct-build.yml), select **Run workflow**, and inspect the SHA-backed source reconstruction and PWA build. It uses the committed 12-part overlay and previously verified model artifact; if the model artifact eventually expires, obtain it from the separately stored recovered release asset. This build does **not** deploy to production.

Use the actual compiled PWA ZIP for a hosting provider with HTTPS, service-worker support and enough space for ~220 MB of offline assets. Never configure the hosting Worker name as `h-beauty`.
