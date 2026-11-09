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
