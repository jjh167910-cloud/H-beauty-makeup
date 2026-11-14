# H-Beauty V2: offline source-linked face-mesh pilots

## Why this change exists

The first test on the real makeup-free photograph revealed that the earlier
masks were traced for a different synthetic portrait. Lipstick and blue
eyeshadow could preserve every pixel outside the supplied mask and still be
painted in the wrong anatomical location.

This update creates masks for the person's ACTUAL SOURCE photograph using
the exact MediaPipe face mesh used in H-Beauty. The private image and landmark
geometry are NEVER sent to GitHub or stored in CI.

## Local usage

Use Python 3.11 or a compatible version, NumPy, Pillow and mediapipe:

    python -m pip install numpy pillow mediapipe

    python scripts/quality/detect_source_face.py \
      --photo /private/approved-bare-master.png \
      --out /private/face-landmarks.json

    python scripts/quality/author_mesh_pilot_masks.py \
      --photo /private/approved-bare-master.png \
      --landmarks /private/face-landmarks.json \
      --out /private/four-pilot-anatomy

The first script uses the **already bundled**
public/tryon/face_landmarker.task model, entirely offline. It requires a
single face and configured face-detection/presence thresholds >=0.8.
The MediaPipe Tasks Python API does not supply a numerical per-face
confidence in the result; output metadata documents the actual configured
thresholds and never invents a measured confidence score.

The second script generates four source-hash-locked sets of draft lip,
eyelid and eyeliner masks for No-Makeup Makeup, Hollywood, Electric Blue and
Rhinestone. It also creates unapproved color recipes compatible with
render_material_look.py, and per-mask anatomical QA reports.

To render a research image using a selected style's JSON:

    python scripts/quality/render_material_look.py \
      --master /private/approved-bare-master.png \
      --recipe /private/four-pilot-anatomy/hollywood/hollywood.json \
      --out /private/four-pilot-anatomy/hollywood-preview

A JPEG or PNG without a non-upright EXIF rotation is supported for local
research. If the original is EXIF-rotated, normalize it to an upright lossless
PNG before BOTH detection and rendering.

## Release rules and limitations

- These are DRAFT masks, not a finished art-directed makeup transfer.
- The source photo must pass the separately documented real-photographic
  provenance, licensing, native-resolution and human review requirements.
- Automated lip masks avoid the inner mouth; eyeshadow avoids the visible
  eye; eyeliner follows the photographed upper lash line and a short wing.
- The generator intentionally does not invent foundation, professional
  false eyelashes, full blush/contour, photographic rhinestones or real
  cosmetic material reflectance. The four previews are therefore INCOMPLETE
  when measured against the original detailed catalog recipes.
- Hair, eyebrows, nose, mouth corners, eyelashes and occlusions can still
  require human mask corrections at 100-200% zoom.
- The original mirror selfie is 857x1536: this is NOT the required native
  >=2048x2732 luxury master. Do not upscale to pass the release gate.
- Keep all user/face geometry files local; do not upload to the public
  repository, GitHub Actions artifacts or Cloudflare.
- No generated draft automatically replaces the existing 42 public photos
  or published WebGL/tiny-model assets.

## Synthetic tests

    python scripts/quality/test_source_mesh_pipeline.py

Tests exercise source SHA mismatch, MediaPipe policy transparency, single-face
thresholds, four generated pilot mask sets, the same-photo anatomical gate,
and no photo copies in outputs. They do NOT demonstrate artistic approval
or real-photo photorealism.
