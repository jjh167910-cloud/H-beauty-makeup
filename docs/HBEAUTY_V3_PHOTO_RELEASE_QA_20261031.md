# H-Beauty V3 hairstyle photographs — release facts (31 October 2026)

This release replaces the prior photographed lookbook under `/looks/{1..292}.webp` and
`/looks/sm/{1..292}.webp` through the pre-existing SHA-256-locked six-archive installer.

## Source and rendering provenance

- 292 photographic style IDs, aligned with the existing Persian catalog.
- 290 source portraits at **1024 × 1024**; 2 HB-040 and HB-041 edited comparison-panel crops at **887 × 887**.
- 584 delivered WebPs: 292 **2048 × 2048 resampled** display images, 292 560 × 560 thumbnails.
- None of the 292 2048-pixel display files is a native 2048-pixel camera/generation source.
- Original image IDs, names and booking associations are unchanged.
- Background edge color processing is limited to the bright studio matte; it is not a substitute for detailed photographic hair-edge retouching.

## Verification

All six immutable ZIP_STORED archives were checked before release preparation, with
SHA-256 entries in `assets/hbeauty-hair-ivory-292-v1.json`. Each is less than 16 MiB.
The ZIPs contain exactly one original and thumbnail per style ID.

The rendered WebP edge test uses a 128 × 128 downsample and the outer three-pixel
band; all 292 photographs have border RGB median within four channel levels of
the frame matte `#F5F3EF`. Automated checks still need to verify deployment
bytes, React/mobile regressions and PWA caching on the live Worker.

## Explicit quality limits

- Technical integrity and frame-color tests do not establish photographic perfection
  or a clinically meaningful biometric match to the user's reference.
- Two final fringe styles were extracted as separate portraits from an AI-generated
  side-by-side preview; they are not independent native-2K photographs.
- Publishing these derived files satisfies the immediate replacement request, but
  does not satisfy the earlier ideal of **292 independent native 2048 × 2048 source generations**.
- No claim of fully independent model-face or anatomy review is made.

## Rollback

Restore the previous `assets/hbeauty-hair-ivory-292-v1.json` from the commit before
this release, redeploy, and check all 584 public files against the restored
archive locks. The old source packages remain unchanged and reachable from Git history.
