# H-Beauty — full-library premium ivory portrait matting (2026-10-31)

## User requirement
All approved hairstyle model photographs must have **a uniform photo background matching the app frame** — not just a matching CSS border. Preserve each woman, hair shape, individual strands, face, pose, clothing, necklace and square native resolution. Deliver fully offline static assets.

## Processing and licensing
- Originals: 292 WebP, **2048 × 2048**. Existing preview images: 292 WebP, **560 × 560**.
- Processed originals: **292**, new derived thumbnails: **292**, total **584** ID-stable assets.
- Background: solid RGB `245,243,239`, **`#F5F3EF`**, matching existing hairstyle card mattes.
- Matting model: [MODNet](https://github.com/ZHKKKe/MODNet), Apache-2.0, ONNX [Xenova/modnet](https://huggingface.co/Xenova/modnet), pinned SHA-256 `25f165da9bfd30830a575f1f0490f1acd995975cb349bc02f3d79332e1fe5cf6`.
- Model input: 768 × 768 portrait matting, alpha upsampled to 2048 × 2048. **Opaque foreground pixels were preserved** prior to high-quality WebP encoding; partially transparent hair edges blended into the target ivory.
- No faces, haircuts, clothing or identity were regenerated. No remote image-generation API is called at runtime.
- Original source images remain recoverable from prior Git commits; releases install the vetted derivatives at build time.
- Public source names, variant references and source URLs are unchanged.

## Reproducibility and integrity
A six-volume, SHA256-locked archive manifest is committed at `assets/hbeauty-hair-ivory-292-v1.json`. Every release runs `installHairstyleIvory()` **before** Vite and service-worker packaging.

The importer:
1. Downloads only from the pinned HTTPS host.
2. Validates each part's entire SHA256 before decoding.
3. Accepts only exact `public/looks/{id}.webp` or `public/looks/sm/{id}.webp` paths, 1–292, no duplicates, encryption or path traversal.
4. Requires all 584 correctly named WebP files in a complete dataset.
5. Stages files and publishes them only after successful validation of the entire batch.
6. Fails the release rather than silently using a partly updated catalog.

The browser never downloads external image packs — all images are included in the published, offline-capable Cloudflare Worker static assets. The six archives are a **build-time** input, not client-side dependencies.

## Independent validation from the processing run
- Images processed: **292/292**. Image pairs generated: **584/584**. Segmentation failures: **0**.
- All 292 full-size images remained 2048×2048, all 292 thumbnails 560×560.
- 90th-percentile border deviation from target matte: **0 RGB levels for all 292** outputs.
- Opaque foreground mean absolute pixel difference from original, excluding ordinary WebP recompression: **median 0.29 RGB units**; **maximum 0.48** across the library.
- Background mask proportion ranged approximately **20.6%–62.8%** per image.
- Six contact sheets comparing original/processed assets were generated for photographic QA.
- The 12 ID-pinned browser samples verify their final thumbnail SHA256; the other 280 are protected by entire-archive SHA256 locks.

## Limitations and safeguards
Automated portrait matting is not equivalent to independent line-by-line human image inspection. Very fine translucent flyaway hair can require selective touch-up; original sources remain recoverable. The archive integrity and image geometry tests do not prove that every pixel looks ideal to a salon stylist.

Any modification to the six archive files or the pinning manifest must undergo a new release review. If the externally hosted locked archives become unavailable, fresh builds fail closed; long-term migration to a repository-controlled asset host is recommended before the external hosting contract changes.

## Release acceptance
- TypeScript: `npm run typecheck`
- Catalog integrity: `node scripts/verify-images.mjs`
- Build with verified full asset pack: `npm run build`
- Offline/data parity: `npm run test:offline`
- Live background/photo bytes and responsive UI: `npx playwright test tests/hairstyle-matte-292.spec.ts`
- Pre-existing editorial, cropping, booking, and mobile regression suites in GitHub Actions.

Release is **not certified live** until CI, Cloudflare publishing and live Worker assets are checked.
