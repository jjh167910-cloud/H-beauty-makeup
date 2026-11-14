# H-Beauty Makeup Reference Studio V2 — 43-image production specification

## Decision: replace the calibration set, not blindly delete the current catalog

The current src/data/makeup-styles.ts contains 42 MAKEUP STYLES, including
no-makeup (میکاپ بدون میکاپ), which is itself a natural, sheer makeup style.
However, scripts/tinybeauty/teacher.py:_bare() reads the same
public/makeup/looks/no-makeup.webp as if it contained a cosmetic-free face.
Visual inspection shows tinted/glossy lips, mascara and cheek color already there.

**V2 requires 43 paired photographic references:**
1. A separate, genuinely makeup-free source, e.g. bare-reference.webp.
2. All 42 makeup styles, including no-makeup as a subtle finished style.

Until V2 is accepted, leave public/makeup/looks, public/tryon/layers,
public/tryon/eyes, and their current on-device runtime untouched.

## Production rules (each look edited from the SAME original bare reference)

- One identical adult model; exact same eyes/irises, eyebrows, nose, lips,
  facial structure, hair, ears, earrings, expression and pose.
- One exact camera, lens/framing, crop, perspective, exposure, white balance,
  shadows, and background throughout the 43-image series.
- Export all master images at matching native resolution and aspect ratio;
  require genuine native ≥2048×2732 resolution at 3:4 for the premium V2 source; do not fabricate detail or upscale smaller photographs.
  **Never upscale to meet a nominal pixel target.**
- Cosmetic changes ONLY: foundation, brows, eye shadow, liner, eyelashes,
  blush, contour, glow, lips and explicitly listed accessories.
- Preserve non-cosmetic skin texture, pores, moles, nose and eye shapes.
  Makeup follows existing skin relief rather than smoothing away identity.
- Opaque versus sheer pigment, edge falloff and matte / satin / gloss / shimmer
  must differ physically. Avoid uniformly brightening or smoothing skin.
- No changes to hair, earrings, clothing or background; no added jewelry,
  text, watermarks, contact sheets or entirely different models.
- Every look starts from the SAME verified bare reference, never a previously
  finished style. Editing one style into another compounds drift.
- A result visually matching its title is necessary but not sufficient: it
  must also be aligned and regionally accurate enough for material extraction.

## Generation order

1. Create and APPROVE the genuinely cosmetic-free bare master. This needs
   visual review, not just a no-makeup filename. Preserve natural lashes,
   eyebrow hairs, facial texture, expression and natural pigmentation.
2. Pilot four strongly different styles from that master:
   no-makeup (subtle), hollywood (matte red lip / wing), electric-blue
   (editorial blue pigment), rhinestone (small reflective accessories).
3. Produce material maps: opaque lip pigment, eyeshadow coverage,
   eyeliner/lash detail, blush/contour, highlight/shine. Compare phone
   output with the approved visual reference, not just the raw style photo.
4. Check multiple skin tones and lighting, both eyes, glasses, hair overlap,
   front and three-quarter views, before accepting a new makeup material.
5. If the pilot passes objective and artist assessment, rebuild or re-edit
   the remaining 38 styles from the same approved bare master.
6. Rebuild ALL dependent assets atomically: layer and eye images,
   coverage files, looks metadata, style signatures and fallback teacher
   training targets. Mixing old and new calibration assets is invalid.
7. Keep the existing production package available for rollback.
   Release only after quality gates, offline verification and artist review.

## High-priority visual inspection candidates

- no-makeup: a finished natural makeup style, NOT a bare reference.
- clean-girl, aqd, soft-glam, classic-bride: comparatively close to the
  current semi-made-up baseline; check that each look is recognizable and
  matches its detailed makeup brief in the new 43-image pair set.
- hollywood, henna-night, electric-blue, rhinestone, mod-60s,
  graphic-liner: preserve exact defining lipstick, liner, pigment,
  lash, and accessory geometry; use these as visual regression cases.
- Other looks are NOT rejected. All require photographic pair consistency
  and visual review before approval.

## Ground-truth provenance for the premium release

Supply both the actual original makeup-free master photo and a companion
bare-reference.json review record, using the example template from the
production-pack generator. It must record the original native dimensions,
the exact image SHA-256, whether the source is an authentic cosmetic-free
capture, usage-rights review, and a traceable human review record ID.

A de-makeup image created from the existing makeup-wearing photo can still
be used experimentally to explore the renderer, but it **cannot** be
promoted as independently verified photographic bare-face ground truth.
A synthetic image cannot recover the real obscured lip or lash pixels.

Once a real source exists, retain it as a lossless master and derive the
42 looks from this same source; keep editable makeup-region masks and
material maps as lossless assets. Avoid repeated JPEG/WebP compression
during editing and keep all photos in one explicit sRGB color space.
The final mobile assets may be optimized only after comparison with
the lossless masters. Visual experts must approve before enabling
any V2 release switch.

## Acceptance checks

### Automated (necessary, not sufficient)
- Exactly 42 named style entries and one independent bare reference.
- Every style has full image, thumbnail, layer and eye-detail reference.
- All 43 masters have identical dimensions and stable framing.
- No bitwise/pixel-identical duplicates; no corrupt/missing files.
- Background and hair drift maps are recorded for expert inspection.
- Per-region photographic difference maps are recorded.

To run the catalog audit:

    python -m pip install pillow
    python scripts/quality/audit_catalog.py --out catalog-audit-output

For a V2 release candidate (fails unless an independent, distinct, same-size
cosmetic-free base exists):

    python scripts/quality/audit_catalog.py --require-v2 --out catalog-audit-output

This machine gate cannot verify that the face is truly free of cosmetics;
manual approval remains mandatory.

### New source-specific lip / eyelid / lashline release gate

The real user-supplied makeup-free mirror photo exposed failures not visible
in the synthetic V4 study: the original manual lipstick mask went beyond the
person's actual mouth, and blue eye pigment floated above the eyelids. **Zero
pixel changes outside an arbitrary mask cannot prove anatomical correctness.**

The new `scripts/quality/audit_landmark_masks.py` uses the SAME MediaPipe
478-point face mesh already used by the H-Beauty try-on renderer. It enforces
the source photograph SHA-256, dimensions, a single detected face and a
minimum detection confidence, then checks:

- Lipstick against the source person's outer lip contour and protected inner
  mouth opening (not a different model's fixed polygon).
- Eyeshadow inside an upper-eye/brow window, never on the visible eye opening.
- Eyeliner near the source eyelash line and short anchored outer-eye wing,
  not a floating stroke halfway up the lid.

The manifest for each candidate is a JSON file at
`masks/<look-id>-anatomy.json` with e.g.:

```json
{"masks":[{"kind":"lips","file":"lips.png"},
          {"kind":"shadow","file":"shadow.png"},
          {"kind":"liner","file":"liner.png"}]}
```

Masks must be one-channel grayscale PNG in the same directory. Source
landmark JSON belongs at `face-landmarks.json` and must include
`coordinate_space: normalized`, `face_count: 1`, `dimensions`, SHA-256,
`detection_confidence` and at least 468 ordered `[x,y]` points.

A real premium-candidate check uses BOTH existing pixel locking and the
new anatomy gate:

```bash
python scripts/quality/prepare_reference_v2.py validate \
  --candidate-dir candidates/reference-v2 \
  --phase pilot --require-anatomy \
  --out /tmp/hbeauty-v2-premium-review
```

The standard research-only validation command (without the flag) remains
available for incomplete synthetic fixtures; **it is not a promotion route**.
This code does not extract mesh points itself; use the existing local
MediaPipe detector on the SAME photograph. Never upload personal images,
facial geometry or customer source hashes to public GitHub CI artifacts.

The gate is deliberately conservative, not a beauty-artist replacement:
graphic fashion eyeliner, false lashes, brow products, blush placement,
material reflectance and skin realism still need extra region-specific
review. Reject unrecognized, low-confidence or partly occluded faces until
a makeup artist checks their actual mask positions.

### Expert visual approval (indispensable)
- Identity and facial geometry unchanged.
- Natural skin pores; realistic lashes; crisp liner and lip edges.
- Exact makeup look brief in Persian and English; every listed accessory.
- Correct cosmetic material appearance, lighting and identity.
- No unintended changes to hair, background, earrings or framing.
- All styles are distinguishable whenever their briefs differ.
- A separate visually verified cosmetic-free bare master exists.
- Blind A/B comparisons on representative faces show V2 improves
  perceptual realism without identity, occlusion or privacy regression.

## Why not replace only no-makeup.webp now?

Changing its pixels in place silently alters every computed log-ratio,
lip calibration and derived layer. The system may then subtract a different
lash shape, skin gradient or shadow from the target look, making it LESS
realistic. Use a versioned, atomic reference-set migration, retrain
the tiny fallback and verify GPU parity, then switch the runtime.

This V2 plan does NOT claim that any new images are already generated,
artist-approved or deployed.
