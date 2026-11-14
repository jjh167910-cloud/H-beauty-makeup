# H-Beauty R1-D: opacity-only learned makeup carrier

## Implemented

A trainable, region-conditioned PyTorch model that predicts cosmetic
TRANSPARENCY rather than new face pixels. Inputs are the original RGB
photo, reviewed cosmetic mask, pigment RGB, and lips/eyes/cheeks region.
Output alpha is clamped to the approved region, then composited in
linear sRGB on the original. All pixels outside makeup are **exactly**
the original image by construction.

This small U-Net is a research baseline. It is not a high-fidelity
neural appearance model or a source of realistic false lashes, individual
eyeliner strokes, glitter, powder scattering or accurate reflections.

## Private paired data required

Collect licensed same-person before/after photographs with unchanged
camera, light, angle and expression. Obtain independently reviewed
commercial training permission and signed subject consent. Create
per-product alpha supervision with extract_paired_transparency.py.

Place a private collection.json alongside the source photos:

    {
      "schema_version": 1,
      "records": [{
        "pair_id": "subject001-red-lips-001",
        "subject_id": "subject001",
        "session_id": "session001",
        "region": "lips",
        "pigment": "#a01e30",
        "source": "subject001/bare.png",
        "target": "subject001/after-lips.png",
        "mask": "subject001/mask.png",
        "alpha": "subject001/extraction/makeup-alpha.png",
        "report": "subject001/extraction/extraction-report.json",
        "rights_verified_by": "PRIVATE_REVIEWER_RECORD",
        "consent_verified_by": "PRIVATE_REVIEWER_RECORD",
        "license_record_ref": "PRIVATE_LICENSE_RECORD",
        "consent_record_ref": "PRIVATE_SUBJECT_RELEASE"
      }]
    }

Rights declarations are self-attested and must be independently verified.
Store one consistent subject_id across all photos of each real person.
The checker catches exact duplicate pictures assigned to different IDs,
but cannot prove that different pictures actually show different people.

## Run locally

    python -m pip install numpy pillow torch
    python scripts/quality/prepare_paired_dataset.py \
      --collection /private/pairs/collection.json \
      --out /private/pairs/index.json
    python scripts/quality/train_opacity_carrier.py \
      --index /private/pairs/index.json \
      --out /private/model-r1d --epochs 25 --side 192

The dataset preflight validates source/target/mask/alpha hashes, legal
review declarations, alpha within cosmetic region, source registration,
extraction reconstruction accuracy, and subject-disjoint partitions.
The trainer verifies all hashes again during load. It uses alpha L1,
reconstructed pigment color error, and mask-boundary gradient losses.

Training creates PRIVATE research-carrier-unapproved.pt and
training-report.json with separate validation and held-out test errors.
Checkpoints are NOT copied to public/tryon, production or CI artifacts.
The report always says catalog_approved=false and deploy_to_live_app=false.
Trained weights may memorize face details and remain privacy-sensitive.

## Tests and limitations

Synthetic-only checks (no real people):

    python scripts/quality/test_paired_dataset.py
    python scripts/quality/test_train_opacity_carrier.py

The latter runs a short one-epoch synthetic smoke, never a real-world
quality benchmark. A six-subject minimum is an engineering floor, not
an adequate number for generalization, fairness, or salon deployment.

To promote a future real model: independently verify rights, obtain
a substantial and diverse native-resolution paired dataset, keep
validation and test identities strictly separate, include real
intermediate product layers, compare rendering against makeup-artist
ground truth, and validate on physical Android without extra downloads.
Only after objective improvement and blind artist review should the
mobile inference/ONNX export and 42-style catalog promotion be considered.

Current status: trainable research code only. No approved trained
photographic makeup model, no user face data in the repo, and no
replacement of the existing production styles.
