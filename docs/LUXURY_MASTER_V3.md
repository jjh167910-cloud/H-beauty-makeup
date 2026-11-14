# H-Beauty — luxury editorial portrait master (V3 visual direction)

## Status

The previous generated samples are **rejected**. They repeatedly retained a casual
white T-shirt and gold pendant and were independently regenerated with differences
in hairstyle, pose and facial details. They are **not suitable as finished premium
makeup-catalog images or as registered training pairs**.

This document sets the required luxury editorial direction for **one approved
presentation master** and every subsequent look, while keeping marketing
artwork distinct from photographic calibration ground truth.

## A. The approved luxury presentation master

- **Identity:** the woman in the user's supplied makeup-free mirror selfie;
  preserve face silhouette, natural dimples, eye and brow proportions, nose,
  lip boundaries, skin undertone and recognizable expression. Never substitute
  a generically beautified face.
- **Wardrobe:** elegantly draped **black silk couture high-neck top** with
  precise tailored construction. The collar and shoulders are visible, without
  a casual white T-shirt, printed graphics, bridal costume, or distracting
  neckline.
- **Jewelry:** tiny polished gold stud earrings only. No disc pendant,
  layered necklaces, glittery accessories or hair ornaments. Rhinestones are
  added **only** when the individual makeup style explicitly specifies them.
- **Hair:** dark brunette natural curls kept recognizably hers, but shaped
  with a professional salon finish, smooth curl definition and believable
  flyaway strands. Use ONE identical silhouette, parting and root pattern
  across all makeup variants.
- **Background:** uniform warm ivory `#F5F3EF`, including all corners.
  No gradients, spotlights on the wall, bokeh, furniture, mirrors or props.
- **Lighting:** large soft beauty key light above camera-left, subdued fill,
  discreet hair separation light. Preserve three-dimensional skin shadows,
  iris detail, pore microtexture, cheek relief and natural lip creases.
  No waxy smoothing, face reshaping or glowing filters.
- **Camera:** realistic luxury medium-format portrait character, flattering
  ~85 mm equivalent perspective, eye-level slightly three-quarter, 3:4 vertical
  frame. Full hair silhouette visible, centered face with ample safe margin.
  Face is the hero; chest/wardrobe only minimally included.
- **Color management:** consistent sRGB output with neutral whites and natural
  skin undertones; no pink/orange artificial cast. Retain an archival
  lossless production master and create WebP delivery derivatives.
- **Nominal size:** genuine native at least 2048 × 2732, never enlarge an
  old 900 × 1200 file merely to pass a pixel-size requirement.
- **Output:** exactly ONE portrait per finished style. No text, labels,
  watermarks, frame, contact sheet, QR code or extra fingers.

## B. Single-master production workflow

1. Obtain the original makeup-free image, verify usage rights, and document
   which parts of its visible skin are real photographic observations.
2. Create ONE synthetic **luxury editorial presentation master** with the
   intended clothing, hair, background, crop and lighting.
3. Compare it side by side against the original for face similarity and
   reject if eye/nose/lip geometry or skin undertone drift. Approve it as
   **synthetic presentation art**, never as independently photographed
   bare-face ground truth.
4. Freeze the presentation master, archival checksum, camera geometry,
   expression, hair, clothing, jewelry, shadow positions, crop and background.
5. Make the 42 cosmetics variations by **editing only authorized makeup
   regions of that exact fixed image**, not by generating 42 full portraits
   independently. Preserve all other pixels whenever technically possible.
6. Generate the four pilot variants first: natural no-makeup makeup,
   Hollywood, electric-blue and rhinestone. Use each look's full recipe:
   lashes, brows, eyes, complexion, blush, contour, lips, finish and listed
   accessories. Verify exact pigment placement under the same lighting.
7. Produce and visually inspect pixel-difference maps. The difference in
   hair, wardrobe, necklace area, earrings and background must be zero or
   attributable to precisely documented compositing metadata.
8. Before scaling to all 42, compare all pilots at 100% zoom and through
   the actual mobile try-on renderer on multiple faces. Reject any pilot
   that resembles a recolored filter, loses skin texture or alters identity.

## C. Calibration versus marketing photography: NEVER conflate

The actual original mirror selfie may serve as photographic evidence of the
model's makeup-free complexion. The newly dressed, studio-lit luxury master
is an **AI-composed catalog photograph**, even if highly photorealistic.
It cannot reveal original obscured skin texture or prove that pixels are
authentic capture. Do not feed the marketing master into the ground-truth
calibration gate under the label `original_cosmetic_free_photograph`.

For makeup appearance learning, use separately validated, aligned source
pairs and masked material maps. Keep these distinct from the luxury
presentation portraits. Synthetic reference pairs are usable for controlled
experiments, but must be labeled synthetic and benchmarked against real
paired photography before promotion.

## D. Luxury rejection criteria

Reject an image when any of the following occurs:

- White casual T-shirt, gold pendant, or unapproved accessory remains.
- Hairstyle, camera angle, expression, lighting or wardrobe varies between
  styles; distinct full-frame generations are not acceptable training pairs.
- Face structure or identity appears subtly replaced or beautified.
- False eyelashes have melted roots, clumps or painted irises.
- The eyeliner is disconnected from the lash line, asymmetrical or blurry.
- Lipstick bleeds beyond natural boundaries; reflections look plastic.
- Blush is an opaque colored patch; freckles and pores disappear.
- Hair/collar/background vary in a makeup-only edit.
- Source image is enlarged and presented as native high resolution.
- Any 42-style release is attempted before all 4 pilot images receive
  documented visual approval and independent try-on comparisons.

**Current catalog status:** no luxury presentation master has been approved.
The original images remain unchanged; this direction is a mandatory
production brief, not proof that the generated renders passed the standard.


## E. Automatic pixel-lock release gate

Each finished catalog image must ship with a **grayscale approved-change mask**
on the exact same pixel grid as the frozen presentation master. White pixels
allow only cosmetic pigment/edge changes; black pixels are immutable hair,
wardrobe, jewelry, background, and unedited skin. A look must be rendered
against this master, not independently generated from a text description.

The new strict mask audit is:

```bash
python scripts/quality/audit_pixel_locked_look.py \
  --master candidates/reference-v2/bare-reference.png \
  --look candidates/reference-v2/styles/hollywood.png \
  --mask candidates/reference-v2/masks/hollywood-allowed.png \
  --out /tmp/hollywood-pixel-audit --premium
```

It reports exact protected-pixel differences, rejected mask coverage,
incorrect dimensions, unchanged looks, and whether the native resolution
meets the separate premium requirement. The result includes a heatmap of
forbidden changes. It does **not** certify cosmetics, authentic identity
inside the mask, seamlessly aligned eyelids, original camera provenance,
or skin photorealism: every pilot still requires side-by-side visual review
at 100% zoom on the target device.

The first generated black-satin/Hollywood pair was rejected because the
hair/clothing changed; a crude local copy-and-mask composite was also rejected
because it left visible eyelid/cheek seams. Neither is a production reference,
even if an automated pixel check can be engineered to pass. Reject any
result with visible boundary artifacts regardless of structural status.

**Do not upscale the 1086×1448 experimental generated images.**
They may serve as art-direction studies only; premium release requires
genuine native-size image masters and independently verified source provenance.
