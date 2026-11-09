# Nail Studio — standalone photo intake (quality V5 preparation)

## Important distinction

This procedure creates **candidates**, not automatically approved photographic catalog entries. It is for individual WebP exports from independently generated images or properly licensed original photography. A contact-sheet crop, a resized thumbnail, and a screenshot of a UI mockup are **not** independent native sources, regardless of exported dimensions.

The current live policy stays at **298 stable designs, nine approved AI-generated manicure photographs and zero approved pedicure photographs**. Do not add an image to `nail-photo-quality.json`, its SHA lock, the service-worker precache or `NAIL_EDITORIAL_PHOTOS` merely because its candidate preflight passed.

## Prepare a batch

1. Create **one actual design per image** with no collage layout, text, badge, watermark or on-image icon. For pedicures use believable foot anatomy and toenails; for manicures use believable finger anatomy. Nail length, shape, polish colour and finish must match the **existing style ID**.
2. Export full-size **WebP**, preferably square and at least 1024×1024, from a *native individual image source*. Do not resize a 186px or 256px sheet tile and report it as native.
3. Put the files in a temporary local folder named with their stable IDs, e.g. `pedi-french.webp` and `pedi-atlas-jelly-blush.webp`. No new IDs are assigned to existing looks.
4. Run `npm run review:nail-photo-candidates -- /path/to/folder`. This produces a JSON report. A nonzero exit status means the batch cannot proceed.

Candidate structural screening requires: a valid RIFF/WebP container and supported frame header, no animation, consistent dimensions, 800px or more on **both** axes, aspect ratio no more than 1.5:1, a 25KB–2MB candidate file, a known ID among the 298 designs, no duplicate-bytes among candidates or the nine current approved sources, and no unreviewed overwrite of an existing approved photograph.

**Limitations:** this fast Node preflight checks headers and metadata, not decoded image pixels; malformed compressed payloads can still pass a header check. A passing status of `STRUCTURAL_PREFLIGHT_ONLY` is **not permission to publish**.

## Automated pixel review (new)

After `npm ci` and `npm run build` have placed the SHA-pinned nine approved photographs in `public/nails/photos/`, run:

```sh
npm run review:nail-photo-pixels -- --baseline
npm run review:nail-photo-pixels -- ./candidate-single-images
```

The first command decodes all nine approved images in a real Chromium canvas and asserts they maintain the known optical-detail and transparency baseline. The second first executes the structural intake, then independently decodes every candidate, measures full-resolution four-neighbour grayscale Laplacian variance (>60), tests for transparent canvas pixels, and compares native-image 32×32 RGB projections against the approved images and each candidate (>0.045 normalized mean pixel distance). It also records an advisory grayscale dHash warning for potentially reused compositions after color changes.

The pixel gate now also tests for **multi-panel contact sheets**: repeated bright-neutral, near-regular vertical gutters together with persistent horizontal separators. The negative control creates a sharp, decodable 1200×900 WebP of separately styled panels and requires the system to reject it explicitly as a contact sheet. A strict two-axis rule minimizes rejection of ordinary photo backgrounds; dark-separator collages, edited-out grid lines and irregular montages may evade the detector, so visual review remains compulsory.

Malformed WebP pixels must fail the real browser decode, even if the file claims to be 1024×1024 in its headers. The CI negative fixture explicitly tests this attack. Results are `PIXEL_PREFLIGHT_ONLY`, `BASELINE_VERIFIED`, or `REJECTED`. None mean that toe or finger anatomy, artistic fidelity, material appearance, photography rights, lack of AI artifacts, or native provenance has been approved. Sharpness and different RGB pixels alone **cannot prove genuine optical resolution** or that a contact sheet was not aggressively sharpened. Never change the nine-photo public allowlist based on this program alone.

## Mandatory second-stage review before a photo can ship

- Decode every candidate in Chromium at full native dimensions, with no image errors.
- Run the existing per-pixel native optical-detail test: Laplacian variance must exceed the established photographic threshold (currently 60) and the low-resolution-upscale negative control must continue to fail.
- Compare downsampled RGB against every approved image and every other candidate. Enforce the calibrated minimum pairwise difference (>0.045); then inspect for semantic duplicates by eye because pixel variation alone is not enough.
- Inspect **each full-size image** for inaccurate fingers/toes, duplicate or missing digits, wrong nail-shape/length, floating decorations, impossible reflections, and incorrect material rendering. Reject images that do not visibly match the named style.
- Record the original uncropped source and generation/photography provenance. Mark AI-generated inspiration as AI; never label it as a real salon result. Check image-use rights before commercial display.
- Only after the whole release passes should a new versioned, SHA256-locked archive be prepared, its exact files precached offline, and the release-specific manifest/tests updated. Old IDs, favorites, booking references and SVG fallbacks must remain untouched.
- Verify the Cloudflare preview, merge after full browser tests, and independently compare the production `sw.js` hash to the GitHub build artifact.

## Why current generated sheets are not approved

A 1536px-wide sheet split into six image columns yields approximately 256px of image width per look. Enlarging that to 1024px does **not** create native detail. Those sheets can be used as *creative direction references*, not source photographs for an approved salon catalog.

The tests for the preflight itself are in `tests-node/nail-photo-candidate-intake.test.mjs`. They intentionally use structurally valid header fixtures rather than photographic pixels, so a passing unit test does not claim a generated photograph has been verified.
