# Hananeh Beauty — Nail Atlas V3 release

This release corrects the two **exactly duplicated photographs** previously present in V2:
- `nail-marble` no longer repeats `nail-botanical`. It now uses a dedicated 1254px marble-and-gold reference, exported as 640×640 WebP.
- `nail-midnight-glitter` no longer repeats `nail-cobalt-lines`. It now has restrained silver shimmer over the original midnight-blue polish.

The V3 lock `assets/hbeauty-nail-editorial-v3.sha256` requires exactly **34 unique design IDs and 34 unique binary SHA256 hashes**. It is impossible to release the new photo edition with missing, altered, or byte-identical duplicate assets through the normal V3 build.

## One-file publication

The accompanying `Hananeh_Nail_Studio_34_Look_Editorial_Pack_v3.zip` contains the 34 WebP files, README, JSON manifest, and the same SHA256 lock. Upload that **unchanged ZIP** to this single repository path:

`assets/Hananeh_Nail_Studio_34_Look_Editorial_Pack_v3.zip`

The build automatically prefers V3, extracts only locked files, checks each before writing anything, detects the new photographic edition, and includes its images in the offline service worker. Existing four-photo and V2 installations remain supported without renaming.

## What is verified and what is not

- Verify the exact source ZIP byte size/hash before publication. ZIP SHA256: `08557abc655b00598f211c8fa8b2882857af086032423e9ff7d7b3772046b57b`.
- The generated references are **AI-generated inspirations**, not real salon work.
- There are 34 optimized image files. Most came from small editorial contact-sheet cells. A 640×640 export is not the same as a 640×640 source capture.
- The app only shows photographically appropriate styles, keeping SVG fallbacks where image/finish fidelity is inadequate.
- Full-screen 4K nails, professional macro texture, and real-device color accuracy are not established by the archive.
- The Cloudflare Workers Build must actually publish the new commit for the app to change; a GitHub Actions green check alone is not confirmation of public deployment.

## Acceptance tests

1. Gallery counts: 28 manicure, 6 pedicure. No horizontal overflow at 320px.
2. Save favorites, reload, filter, open style details.
3. Book French manicure and a gel pedicure; retain exact requested nail IDs.
4. Upload one V3 ZIP, watch GitHub + Cloudflare build logs, verify 34 image URLs have HTTP 200 and correct WebP magic.
5. Test airplane mode after images are cached; verify photographs, audio controls and booking UI.
6. Confirm the Marble style displays its *marble* reference and Midnight Glitter displays unique glitter detailing (never repeats Botanical or Cobalt).

### Future production-quality target
Individually render each nail style at full native resolution with repeatable skin tone, anatomically believable finger shape, consistent crop/light, and no cross-style repetitions. Automatically check names, hashes, perceptual similarity, cuticle quality and nail geometry before promoting to the photo tier.
