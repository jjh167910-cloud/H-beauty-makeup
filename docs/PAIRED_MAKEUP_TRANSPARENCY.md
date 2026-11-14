# H-Beauty R1-C: Paired cosmetic transparency extraction

## What this adds

V5 cosmetic masks preserve the original face but cannot prove photographic
pigment realism. This research tool creates supervised opacity candidates
from rights-cleared, source-aligned BEFORE/AFTER photo pairs.

Source and target must depict the SAME person with stable pose, camera,
lighting and expression. The operator provides a product swatch color and
a conservative, reviewed single-region mask. The program solves in LINEAR
sRGB:

    target_linear ~= (1 - alpha) * source_linear + alpha * pigment_linear

It rejects target/background drift outside the region and rejects large
reconstruction errors inside it. It does NOT recover multilayer material,
invent eye lashes or prove that a pair is licensable.

## Local/private example

Manifest pair.json, stored beside source.png, target.png and mask.png:

    {
      "schema_version": 1,
      "pair_id": "anonymized001-red-lips-01",
      "source": "source.png",
      "target": "target.png",
      "mask": "mask.png",
      "source_sha256": "<actual source sha256>",
      "target_sha256": "<actual target sha256>",
      "region": "lips",
      "pigment": "#b32339",
      "alignment_reviewed": true,
      "rights_scope": "commercial-model-training",
      "rights_document_id": "PRIVATE_SIGNED_LICENSE_RECORD",
      "consent_document_id": "PRIVATE_SUBJECT_RELEASE_RECORD",
      "rights_reviewed_by": "PRIVATE_REVIEWER_RECORD"
    }

Commands:

    python -m pip install pillow numpy
    python scripts/quality/extract_paired_transparency.py \
      --manifest /private/pairs/pair.json \
      --out /private/outputs/paired-alpha \
      --require-native-2k

Files produced: makeup-alpha.png, makeup-rgba.png,
reconstructed-on-source.png, extraction-report.json.
The opaque source remains bit-for-bit unchanged outside the permitted
mask; saved alpha uses a linear-sRGB compositing contract, NOT automatic
gamma-space Canvas2D blending.

The native resolution gate checks dimensions only; it cannot distinguish
true native camera details from upscaling. Also require source capture
records, verified rights and critical visual review.

IMPORTANT: Manifests are SELF-REPORTED provenance declarations; this script
does NOT legally verify rights and consent records. The public repo has no
rights-cleared real training photos and must not store customer identity,
facial landmarks, signed releases or private source-target pairs.

## Scientific rationale and limitations

The WACV 2026 paper on identity-preserving real-time makeup transfer
decouples a transparent makeup mask extractor from graphics rendering and
uses transparency-aware objectives. The ECCV 2026 ART and MagicMakeup work
addresses reference detail and regional fidelity; external weights and
research dataset images still require explicit license/legal review before
commercial use.

The single-pigment inverse model is intentionally conservative and
non-identifiable when pigment equals underlying skin. Layered eyeliner
over shadow, false eyelashes and reflective gems cannot be recovered
uniquely from a single AFTER photograph. Collect intermediate product
application frames or adopt a learned multi-material forward model.

### Next stage after genuine, commercially cleared paired data

Train a region-conditioned transparency/appearance predictor that outputs
only cosmetic material, never a reconstructed face. Use matched real pairs,
source-mask-specific alpha supervision, reconstruction and lip-color losses,
sharply constrained anatomical boundaries, and temporal flicker objectives.
Train/test splits must be disjoint by PERSON, not just by image. Evaluate
identity, skin-tone fairness, material fidelity, motion, and source preservation
against the existing engine and professional makeup photographs.

The code here extracts supervision candidates; it trains NO model and
deploys NOTHING. The full 42-look luxury catalog remains unchanged.

Synthetic non-person regression tests:

    python scripts/quality/test_paired_transparency.py
