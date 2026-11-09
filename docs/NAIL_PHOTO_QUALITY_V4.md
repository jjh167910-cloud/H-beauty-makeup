# Nail Atelier — Quality-First Photo Edition V4

The salon has **34 distinct bookable nail design references**: 28 manicure and 6 pedicure concepts. The V3 photographic source archive was audited. Of its 34 exported 640×640 WebP files, most originally came from extremely small 202px or 186px contact-sheet crops; one "Midnight Glitter" was a near-pixel-duplicate of "Black French" even though their SHA256 hashes differed. Shipping those as full-resolution salon photography would be misleading.

## V4: Nine selected photographic designs

The release features exactly nine AI-generated editorial *inspiration* images: `nail-milky-silk`, `nail-ballet-pink`, `nail-old-money`, `nail-ruby-red`, `nail-merlot`, `nail-cocoa`, `nail-classic-french`, `nail-pearl-chrome` and `nail-marble`. Every approved image's source crop is **at least 600×600**; the marble source is 1254×1254. Their minimum pairwise normalized mean absolute pixel difference after 32×32 downscaling is **0.09217**. This is not a semantic style-similarity guarantee, but it excludes the near-identical V3 black-French / midnight-glitter pair whose score was **0.0034**.

The other **25 designs do not disappear**. They retain the sharp offline SVG preview and functional favorites, filters, detail views and booking actions. Their photos will be promoted only when truly independent high-native-resolution source images are available and visually match the named design.

## Upload one verified ZIP

The downloadable artifact is `Hananeh_Nail_Studio_Quality_9_v4.zip` (about 396 KB). GitHub destination:
`assets/Hananeh_Nail_Studio_Quality_9_v4.zip`.

The updated production build automatically chooses V4 when the ZIP is present; it validates exact filenames, RIFF/WEBP signatures and every SHA256 against the committed `assets/hbeauty-nail-editorial-v4.sha256` lock, installs only the nine approved files and precaches them for offline display.

ZIP SHA256: `73618152697a6f8ff210179207e37ad321812ea233706b217ff7163ecda4ca89`.

The older four-, 34-photo V2 and 34-photo V3 editions remain supported. The v4 version intentionally uses fewer actual photographs than those older *source* archives: this is a stricter visual-quality policy, not a missing-style regression.

## Release verification

- React and TypeScript build.
- Node tests: 34 style IDs, nine approved source-native images, v4 lock, and optional installer verification.
- Playwright: mobile widths, no overflow, favorites, service selections, design IDs in bookings.
- On actual release: verify all nine public image URLs return WebP bytes and all nine appear offline after installation, while every other style renders accurate SVG fallback.
- Site publication by Cloudflare Workers Builds must be verified independently. A green GitHub Actions run that skipped Cloudflare deployment does **not** prove the published Worker has updated.

All visual examples remain AI-generated inspiration, never purported to be completed salon work.
