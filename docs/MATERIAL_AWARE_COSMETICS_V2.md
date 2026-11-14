# H-Beauty: Material-aware, source-locked makeup experiments

## What actually improves

The earlier luxury Hollywood image had a new face/hair/wardrobe compared with
the editorial master. Cutting and pasting the generated eyes or lipstick left
seams. The existing `compose_source_locked.py` therefore correctly rejects
unregistered, independently generated face replacements.

The next experimental path is `render_material_look.py`. It renders cosmetic
pigment **directly on the frozen source** using region masks. It never invents a
new face, hair, collar, background, eyelashes or eyelid shape. Hair, clothes
and all pixels not covered by approved masks are exactly identical to the
source image in the output PNG.

### Compositing model

- Convert source and target cosmetic RGB to linear light.
- Extract bounded, fine-scale luminance variations from the source, preserving
  much of the native texture in pigmented lips and cheeks.
- Respect local lighting with a conservative luminance factor.
- Apply each pigment with a configured coverage/opacity and a strictly inward
  edge feather, never changing a pixel outside a selected mask.
- Composite overlapping cosmetics in declared order **only when the later
  layer explicitly sets `allow_overlap: true`**. This supports eyeliner over
  eyelid pigment and highlights over blush without silent layer collisions.
- Keep source photograph, color profile, dimensions and framing unchanged.
- Re-run `audit_pixel_locked_look.py` on the resulting master and binary union
  of cosmetic masks; retain an individual checksum and QA report.

This method is a physically informed *approximation*, not full spectral
Kubelka-Munk skin-pigment optics. The satin/gloss treatments reuse some source
highlights rather than fabricating physically accurate new ones. Genuine
glitter, rhinestones, realistic individual added false eyelashes and complex
eyeliner geometry need separately reviewed artwork and masks. Do not claim
the renderer alone solves these effects.

## Four exact catalog pilot recipes

The directory `scripts/quality/material_recipes/` contains:

- `no-makeup.json`: sheer lip gloss, delicate lid, natural blush; no eyeliner.
- `hollywood.json`: rich matte `#b3242f` lipstick, crisp dark wing,
  taupe lid/crease and soft blush.
- `electric-blue.json`: distinct `#4aa3f0` and `#1d3fb8`
  eyelid/graphic liner materials, muted lip and **no blush**.
- `rhinestone.json`: lilac eyelid, rosy blush, gloss and liner;
  the required tiny reflective gems must be authored separately.

These JSON files contain **production instructions and mask file names, not
generated/approved masks**. They do not run until all referenced masks are
created in the relative `masks/` directory. A mask must fit the original
portrait exactly, be grayscale PNG, avoid the outer image border and cover
only the intended cosmetic surface.

To run a pilot in a staging folder, copy the JSON, supply the reviewed masks,
and execute:

```bash
python -m pip install pillow numpy
python scripts/quality/render_material_look.py \
  --master staging/frozen-master.png \
  --recipe staging/hollywood.json \
  --out staging/hollywood-output \
  --premium
```

The `--premium` option only checks *pixel dimensions* and aspect ratio. It
cannot establish that an image was captured natively; source checksum,
original-camera provenance and visual review must be checked separately by
`prepare_reference_v2.py validate`.

The output includes `material-render.png`, `material-render-report.json`,
a union-of-cosmetics grayscale mask, and a second strict pixel-lock audit.
A QA success means **engineering consistency only**, never approval of
photorealism, artist fidelity, or the final 42-look reference set.

## Evaluation on real photographs

1. Capture/approve one authentic makeup-free original with enough native
   resolution, plus one marketing-only synthetic editorial master if desired.
   Keep the two provenance categories separate.
2. Design region-accurate masks using face landmarks as a **starting point**,
   then correct eyelash roots, lip vermilion boundaries, eyelids and occlusion
   edges by hand.
3. Apply the four fixed recipes to the EXACT same frozen original. Use extra
   accessory geometry only where the recipe demands it.
4. Inspect at 100% and 200% zoom: eyeliner taper, lip border and creases,
   eyelash root geometry, skin pore preservation, eye symmetry, zero alteration
   to natural complexion outside cosmetic regions and consistent materials.
5. Run on representative faces with varied skin tones and illumination;
   ask a qualified makeup artist to perform blinded A/B comparison with the
   existing WebGL look and actual professionally applied makeup.
6. Promote only if the independent subjective and quantitative tests improve.
   Otherwise, revise the actual cosmetic material model, not just photos.

## Release rules

No image from the 1086x1448 experimental series is promoted as a real native
2048x2732 master; upscaling would not recover original skin detail. No
generated-photo claims of ground truth. No automatic copying of the material
results into `public/makeup/looks` or `public/tryon`. A successful cosmetic
source-lock check cannot prove the image is luxury photorealistic. The
production app is unchanged by this research branch.
