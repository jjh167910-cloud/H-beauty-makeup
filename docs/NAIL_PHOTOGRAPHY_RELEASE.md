# Hananeh Beauty — editorial Nail Atelier photo release v1

The app now supports a photographic editorial look with **four** coordinated AI-generated manicure references. **These are design inspirations and are not photographs of work done by the salon.** Existing 28 style IDs, favorites, filters and booking references are unchanged.

## Exact photo pack

Use the downloaded `Hananeh_Nail_Photo_Pack_v1.zip` supplied in the ChatGPT conversation. It contains the four files listed below, already cropped consistently to 600×600, compressed to WebP, and hashed. No re-encoding or renaming is permitted.

| Style | Path | SHA256 |
| --- | --- | --- |
| شیری ابریشمی / Milky Silk | `public/nails/photos/nail-milky-silk.webp` | `957afdef42d814d09e8b2ab31b91575f83a85ccc32006384ff00f72a807d939b` |
| فرنچ کلاسیک / Classic French | `public/nails/photos/nail-classic-french.webp` | `8ab7068c8691867d9e92aefb560ef5a382a2648fe9429b203d0c91317fa89df2` |
| قرمز یاقوتی / Ruby Rouge | `public/nails/photos/nail-ruby-red.webp` | `2b657a25c4d53a78e516987c61485d2815642a56c507a20ac72042099e76bd1d` |
| کروم مرواریدی / Pearl Chrome | `public/nails/photos/nail-pearl-chrome.webp` | `71a3272087c98e9ff38bcf5094b24bb0a4f1e14771249392d65ca975efe5a11e` |

## Install using GitHub mobile UI

1. Extract the ZIP on your phone.
2. Open [H-Beauty: public/nails/photos](https://github.com/jjh167910-cloud/H-beauty/tree/main/public/nails/photos).
3. Choose **Add file → Upload files**; select all four extracted WebP images (do not upload the ZIP itself).
4. Commit the upload to main. A connected Cloudflare Worker Build can then pick up the images.
5. Check that the publication process succeeds and the live image URLs return 200 OK, e.g. https://h-beauty.mostifa2273.workers.dev/nails/photos/nail-milky-silk.webp
6. Visit https://h-beauty.mostifa2273.workers.dev/#/nails, look for the editorial image on the first card, open its detail sheet, and verify favorites / booking / offline behavior.

## Release requirements

- All four WebPs must exist together; a partial upload **fails the service-worker finalizer**.
- Every file's SHA256 must match `assets/hbeauty-nail-editorial-v1.sha256`. Do not use unrelated salon photographs under these locked filenames.
- The gallery always falls back to the previous offline vector swatches if the entire optional photo pack is absent.
- The service-worker build adds the verified WebPs to the offline cache.
- New reference photos must never be labeled as actual salon work, testimonials, or before-and-after results.
- The other **24** concepts remain SVG illustrations. This is a four-photo first iteration, not a complete 28-photo photographic conversion.
- GitHub Actions may run CI only when Cloudflare Workers Builds is the publisher. A green GitHub workflow does not prove that the live Worker updated.

## Technical assurance

The tests assert that missing WebP files do not create permanent broken IMG elements, optional photographic media displays when present, crop uses `object-fit: cover`, and service-worker packaging rejects partial installations. Existing mobile booking and favorites tests remain in place.
