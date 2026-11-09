# Hananeh Beauty Nail Atlas v2 — 34 designs

## Delivered
- 28 stable manicure styles (existing IDs unchanged) plus 6 new pedicure styles.
- Individual optimized 640 × 640 WebP editorial concept images in the ZIP `Hananeh_Nail_Studio_34_Look_Editorial_Pack_v2.zip`.
- Original 8 high-resolution source crops preserved as the hero-quality tier. Other crops come from lower-resolution AI lookbook sheets and are marked accordingly in `nail-photo-manifest.json`. Upscaling does not create real detail.
- Only **24 of the 34 images** are enabled in the optional photographic version after visual review. Ten designs retain their **more accurate local vector illustrations** because the generated photo did not match the name/finish closely enough. This is deliberate quality control, not missing data.
- An all-or-none 34-file SHA256 lock protects the optional visual release and the offline service worker. The v1 four-photo edition is still supported.
- No images are claimed to depict services performed by the salon.

## Installing original image files
The GitHub connector in ChatGPT cannot directly transfer the locally generated binary WebP files. The accompanying ZIP contains the complete `public/nails/photos/` directory and the exact v2 SHA256 lock. The lock is also committed in `assets/hbeauty-nail-editorial-v2.sha256`.
**Recommended one-file installation:** upload `Hananeh_Nail_Studio_34_Look_Editorial_Pack_v2.zip` unchanged to the repository’s `assets/` folder. The build script safely extracts only the 34 SHA256-verified WebPs before Vite runs. This avoids 34 separate GitHub file selections. Alternatively, place all 34 WebPs under `public/nails/photos/` without renaming or re-encoding. The build then automatically activates `VITE_NAIL_EDITORIAL_V2=true` and packages all files for offline PWA use.
**Do not claim the 24 photographic cards are live until that binary upload and Cloudflare deployment are verified.** Missing all photos leaves the gallery working with offline vector previews.

## QA gates
- Count 34 unique style IDs and 34 uniquely named WebPs; preserve every original manicure ID.
- Verify SHA256 of every file; intentionally fail on partial or tampered collections.
- Ensure photos never cover labels/actions and use consistent cover cropping.
- Gallery search, favorites, responsive mobile layout, service selection, booking reference and WhatsApp booking message must keep working.
- Confirm pedicure tab shows six foot designs, independent of 28 manicure designs.
- Test browser reload/offline with pre-cached images on Android and iOS hardware.

## Source-quality honesty
These are AI-generated *inspiration references*, not salon portfolio results.
Native crops for some concepts are as small as 186 pixels high, so the pack is good for mobile thumbnails but **not a certified full-resolution 4K beauty photo set**. A proper future photo production shoot or individually generated high-resolution images would be needed to honestly label all 34 as photographic masters.
