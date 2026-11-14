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
- Apply each pigment with configured coverage/opacity and a distance-derived,
  zero-at-the-boundary inward feather. Gaussian clipping alone is rejected
  because it can produce a hard semi-opaque outline on a binary mask.
  Never change a pixel outside the approved mask.
- Require genuine sRGB input; preserve its ICC profile if embedded. Reject
  unconverted wide-gamut originals rather than risk changing their appearance
  simply by discarding Display P3/AdobeRGB metadata. Untagged files are
  treated explicitly as assumed sRGB.
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

## Source-specific four-look mask geometry (research only)

The Python tool `scripts/quality/author_four_pilot_masks.py` authors 17
grayscale cosmetic masks for four pilot looks using manually reviewed
coordinates on one particular 1086x1448 synthetic editorial portrait.
It **cannot** be reused without re-authoring on another face, pose, crop,
or genuine native-resolution master. The input dimensions AND the exact
source SHA-256 must match the selected local research image.

To run, compute the source digest and invoke:

    sha256sum /path/to/frozen-master.png
    python scripts/quality/author_four_pilot_masks.py \
      --master /path/to/frozen-master.png \
      --expected-sha256 EXACT_SOURCE_DIGEST \
      --out /tmp/hbeauty-four-pilot-masks

Place each resulting look's `masks/` beside its existing recipe JSON.
Mask geography must be visually corrected, especially eyelashline and
lip borders, before attempting a high-fidelity photorealism evaluation.
The studied synthetic master already has visible cosmetic products and
does not qualify as genuine bare-face photographic ground truth.

The experimental shader also now preserves broad photographed source
lighting across pigmented lips/cheeks, not just fine texture. This reduces
flat-looking lipstick but is **not** proof of salon-grade realism.

No previews or synthetic masters are published to the production catalog.
Rhinestone is still missing separate, realistic reflective gem artwork.

## Micro-faceted rhinestone accessory pilot

The separate renderer `scripts/quality/render_rhinestones.py` creates tiny,
individually positioned, multi-facet crystal studies. Each has a restrained
local highlight and short soft contact shadow; it is **not** a physical
ray tracer or measured diamond reflectance model. It only adds accessories
to styles whose briefs explicitly permit rhinestones.

An example placement manifest is stored at:

`scripts/quality/material_recipes/rhinestone-accessories-STUDY.json`.

It is bound to the exact 1086x1448 synthetic rhinestone material preview
by its source SHA-256, not interchangeable with another portrait or with a
future real 2K photographic master. The manifest limits all stones and shadows
to a small region beside the outer eye. Placement, gems and lighting still
require an expert's 100% zoom review; in particular, verify that no stone
lands on eyelashes, eye whites or hair.

Research usage, only with the exact source photograph:

    python scripts/quality/render_rhinestones.py \
      --source research/rhinestone/material-preview-research.png \
      --recipe scripts/quality/material_recipes/rhinestone-accessories-STUDY.json \
      --out research/rhinestone-accessory-test

The offline script checks the image SHA, image size, gemstone position,
collision spacing and embedded ICC. It emits an image, binary union mask
and JSON QA record; all pixels outside tiny gem glint and shadow footprints
must be **identical** to the input source. Research files are never copied
into the live makeup catalog. Tiny static facets do not guarantee jewelry
photorealism in changing light or a moving live-camera view.

Next quality gate: compare gems and liner against photographed cosmetic
references, repair masks against the real native master, and conduct blind
side-by-side artist reviews before releasing a single new catalog image.

## V4 anatomical source-lock refinements (2026-11-14)

On the fixed 1086x1448 synthetic black-satin editorial pilot, 100-200% zoom
revealed that previous markup extended red lipstick above the natural
vermilion, made blush too broad, and painted broad solid blocks above the
eyelid in Electric Blue. Long duplicate eyeliner strokes appeared to float
above the natural lash roots.

V4 addresses these as follows:

- Independently traced **upper and lower lip polygons** protect the actual
  dark mouth opening. Exact lip geometry belongs to THIS source only.
- Narrower photographed eyelid contours with a **soft two-tone cobalt
  gradient** replace hard blocks. The source lashes and sclera remain visible.
- Only **short, anchored outer-canthus flicks** are drawn instead of a
  second full-length eyeliner hovering over the existing source lashes.
- Existing small cheek masks remain inside the cheek silhouette;
  opacity is reduced to preserve photographed local skin variation.
- Hollywood matte-red lip opacity is tuned to retain its existing photographed
  relief. This is still a source-locked color-material approximation.
- The Rhinestone pilot keeps the separately tested **two-gem** accessory
  study consistent with the original catalog reference.

The tests in test_author_four_pilot_masks.py now explicitly reject upper-lip
skin contamination and long floating eyeliner strokes. Source identity and
photo-size locks are unchanged.

V4 comparison images and changed-pixel reports were generated separately
from the approved V2 masks, and remain **research only**. On the earlier V3
drafts, many changed pixels lay outside the more accurately localized V4
cosmetic regions (23,433 for Hollywood, 5,379 for Electric Blue, and 35,325
for Rhinestone). These figures are *relative to the V4 research mask*,
not counts of proven anatomical errors. All four new research outputs have
zero changed pixels outside their own cosmetic+accessory masks.

The source image is still 1086x1448 and synthetic. This is NOT a genuine
native premium 2048x2732 photographic master. These changes do NOT produce
authentic facial texture where absent, medically verify a makeup-free face,
or certify professional luxury appearance. It would be incorrect to send the
V4 generated sample straight to production without human artistic review,
a truly controlled photographic source, and cross-face benchmarking.
