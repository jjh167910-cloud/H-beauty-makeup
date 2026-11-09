# H-Beauty hairstyle photograph and frame background audit

## Purpose
Keep salon portraits cohesive without deleting hair, hallucinating the model, blurring flyaway strands or replacing any original image content.

## 292-image source inspection
Scanned all **292 native 2048 × 2048 WebP** portrait files in `public/looks/`, sampling the outer 5 pixels on all four sides of a 256 × 256 representative raster for each image.

- Median outer-border RGB of the collection: **(245, 243, 239)** = **`#F5F3EF`**.
- **279 of 292** portraits had that exact per-file median RGB.
- The other 13 portraits had differences limited to 1–2 channel values; no per-file median differed by more than 8 from the target.
- Every portrait uses a light ivory studio backdrop already. Full AI background removal would create unnecessary risk to fine hair strands.

## Corrective treatment
The app previously used `#F9F6F3` in hairstyle photo frames, producing a visible border around pictures when padded inside 1:1 cards.

Define one shared styling token `--salon-hair-photo-matte: #F5F3EF` used by:
- homepage hero, four complete style previews and featured editorial cards;
- main lookbook, saved-look media, and their parent photo frames;
- full-screen discovery photography and hairstyle detail-sheet media.

Maintain this ivory matte in both light and dark appearance: it is a property of the photograph, not the user's chosen app chrome color. Preserve existing square `contain` photo positioning, inset hair margins and all approved original image bytes.

## Acceptance evidence
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `tests/hairstyle-photo-matte.spec.ts`: **9/9 PASS**, testing 320/354/390/768 px in light/dark, plus full-screen/detail.
- The browser regression samples the actual native photo pixel border via a canvas and asserts a max 4-RGB-channel difference from its frame background, along with original square dimensions, contained image fit and an exact RGB(245,243,239) frame color.

## Limits
This is a non-destructive photographic matte integration, not source-image background removal. Existing hair that is already clipped in the approved source cannot be restored by matching the backdrop. No altered images have been passed off as originals, and no AI segmentation model is required for this uniform source set.
