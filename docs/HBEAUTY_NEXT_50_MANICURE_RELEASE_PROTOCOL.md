# H-Beauty manicure batch deployment — production protocol

The next 162 catalog manicure styles remain illustrated until individually approved photographic images are available. Current production: **58 manicure** + **78 pedicure** photos. Existing archives have a history of incorrect nail color, malformed hand/foot substitution, stone supports, and duplicate sources. Do not reuse them without verifying the actual master at native resolution.

## One batch, up to 50 images

1. Audit each original, square WebP image at **native resolution >=1200x1200**: precisely one young adult woman's hand, five natural fingers and nail plates, true cuticles, pure ivory silk background, no stone, accurate colors, shape, finish, motifs, studio lighting and texture; no text/watermark, no upscaling or derivative/contact-sheet crops.
2. Select **1–50 images that actually pass**. Place only the originals in `public/nails/photos/<catalog-id>.webp`, preserving existing approved assets.
3. Create `assets/hbeauty-manicure-batch60.sha256` (or next unused `batch61`, etc.), one line per image: `<64-hex-sha256><two spaces>public/nails/photos/nail-...webp`. Never include a rejected asset.
4. Open a PR. The production build validates all existing and new style IDs and image hashes for duplicates, rejects missing/invalid WebPs or native dimensions below 1200, and injects **only the newly released IDs** into the manicure gallery. The service worker refuses any missing/mismatched asset; all new original images are precached for offline operation.
5. The GitHub review checks run; merge only with successful mobile RTL, booking, production-packaging and WebP checks. Cloudflare deployment must pass exact service-worker comparison, then **every released public manicure and pedicure URL must hash-match its immutable release lock**.
6. Only after the live verification passes may the new photo count be reported as live.

**Non-goals**: A manifest and hash prove identity and transfer integrity, not aesthetic quality or anatomy. The native source review remains mandatory. There is no numerical quota forcing a misleading release of 50 low-quality photographs.
