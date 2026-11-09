# Live H-Beauty Makeup test studio

[**Open the live makeup photo test studio**](https://h-beauty-makeup-photo-test-studio-phim6t.v2.appdeploy.ai/)

The deployed companion is a separately hosted manual try-on preview, with source in [`staging-photo-test/`](staging-photo-test/). It is *not* the full V14 experimental neural renderer and is not claimed to be photorealism-certified.

You can upload a photo locally (not stored by the service), paint separate lips/eyes/cheeks masks, adjust colors and opacity, validate that pixels outside the masks remain unchanged, compare before/after, and export a native-resolution PNG. No trained neural appearance model is used.

The full V14 repository import remains pending because the existing [draft V14 release](https://github.com/jjh167910-cloud/H-beauty-makeup/releases/tag/untagged-1d6f588832d930c9e5e1) has no attached asset. Cloudflare is not connected. The production H-Beauty website is unchanged.

## Independent browser verification

[GitHub Actions: passed on mobile and desktop](https://github.com/jjh167910-cloud/H-beauty-makeup/actions/runs/42552580373)

- Mobile viewport: 390 × 844; loaded test photo and painted pixels on the brush canvas; native PNG export 720 × 900; zero JavaScript exceptions.
- Desktop viewport: 1280 × 900; same pixel integrity and native-resolution PNG export; zero JavaScript exceptions.
- The hosted app reports ready, with zero frontend and network errors in its deployment health check.

These tests validate only the **manual browser companion**. They do not imply that the V14 neural model or full V14 archive is hosted. The GitHub release asset is still absent and Cloudflare credentials remain unavailable to this connection.

## Replacement automatic neural studio — 9 November 2026

**Current preferred test interface:** [H-Beauty Neural Makeup Studio](https://h-beauty-neural-makeup-studio-p8au6h.v2.appdeploy.ai/)

- Uses a **real hosted Gemini neural image-editing model** via a server-side image-generation API; no manual painting or region-mask UI.
- Takes the person's own photograph and a makeup reference (or named preset); generates an image automatically after explicit user consent for cloud processing.
- Source code: [staging-neural-preview/](staging-neural-preview/).
- Before/after comparison and download implemented.
- **Current inference blocker:** During the first end-to-end synthetic fixture test, the image provider returned HTTP 429 (quota exhausted). Generation is therefore **not verified as operational** on the current hosting entitlement; the UI reports the error instead of fabricating a result.
- **Not independently state-of-the-art certified**; original V14 package has no rights-cleared real-photo-trained neural checkpoint, and no real-photo benchmark or quality study was completed. The provider also caps request inputs and output bytes, so no native 2K output promise is made.
- The old [manual photo test studio](https://h-beauty-makeup-photo-test-studio-phim6t.v2.appdeploy.ai/) is superseded and should not be used as evidence of neural makeup transfer.
- Existing H-Beauty salon production is not modified.
