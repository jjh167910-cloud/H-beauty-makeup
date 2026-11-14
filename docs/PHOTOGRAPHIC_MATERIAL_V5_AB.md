# V5 photo-relief cosmetics — experimental A/B evaluation

## Why

V4 achieved exact source-pixel preservation and face-anchored lip/eyelid
geometry, but it still looked synthetic: flat lipstick and little visible
difference between some eyelid finishes. The existing material renderer
converted an RGB pigment into one approximately constant image-wide material
tone, then scaled it using photographed source lightness. This can erase
natural skin relief or clip saturated red pigments when over-bright.

## What V5 changes

An **optional** per-layer `appearance_model: "source-relief-v5"` derives
cosmetic chroma from the selected pigment but derives coarse luminance
gradients, skin pores and lip creases from the exact original photograph.
Its central lightness anchor is the geometric mean of source luminance and
pigment luminance. This avoids making dark matte lipstick as bright as bare
skin. A bounded tone parameter controls the shade without replacing
the underlying photographic light direction.

Specular details for satin/gloss are **only reinforced where the source
already contains a highlight**. No new plausible-but-fake point-light
reflection is invented. Matte retains little of that highlight.

No model weights, third-party data, remotely hosted image synthesis,
reconstructed faces or source pixels outside selected cosmetic masks are
required. Existing `legacy` recipes remain unchanged. Eye-liner stays in
legacy sharp-edge mode in the V5 pilot comparisons; region geometry and lash
root realism remain separate artistic tasks.

### Opt-in recipe example

    {
      "name": "matte_red_lips",
      "mask": "masks/matte_red_lips.png",
      "pigment": "#b3242f",
      "opacity": 0.79,
      "finish": "matte",
      "texture_strength": 0.90,
      "feather_px": 1.0,
      "appearance_model": "source-relief-v5",
      "tone": 0.92
    }

The values are a *research* appearance prototype, not measured pigment
coefficients or physically exact spectral scattering.

## Repeatable A/B evaluation

On an existing, already-public makeup catalog photo:

    python scripts/quality/compare_material_v5.py \
      --photo public/makeup/looks/no-makeup.webp \
      --drafts /tmp/public-example-four-pilot-masks \
      --out /tmp/v5-legacy-comparison

The drafts must be generated for that EXACT source via
`detect_source_face.py` and `author_mesh_pilot_masks.py --render-drafts`
first; every source SHA must match.

This emits four sets of V5 PNGs, individual eye/lip close-ups and a
3-column grid: **original photo | legacy | V5**. The QA report counts
changed pixels and confirms zero outside the cosmetics mask; it does not
claim aesthetic superiority. Public sample derivatives may be shared as
short-retention GitHub artifacts; private user selfies and landmark files
must never be uploaded into public CI.

## Promotion criteria

1. Existing catalog is an ALREADY MADE-UP face. These comparisons cannot
   prove de novo before/after authenticity or recover obscured source skin.
2. Inspect both models side by side at 100–200% zoom for clipping,
   patchy lips, eyelid halos, eyeliner roots and realistic microtexture.
3. Test new model on a properly rights-cleared, native-resolution
   makeup-free original. The provided 857×1536 mirror selfie is useful
   for testing, **not** a genuine native 2048×2732 reference.
4. Have a qualified makeup artist conduct a blinded preference study,
   supplemented by checks of source-preservation and color stability.
5. Only enable this look-by-look if it wins meaningful comparisons.
   Nothing in this branch changes `src/lib/makeup-gl.ts`, the deployed
   renderer, the 42 reference portraits or production weights.

V5 does **not** create false eyelashes, professional eyeliner geometry,
physically realistic rhinestones, or a state-of-the-art neural appearance
model. Those remain independent quality gates.
