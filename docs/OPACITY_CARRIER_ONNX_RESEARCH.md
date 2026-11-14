# H-Beauty R1-E: source-locked opacity-carrier ONNX feasibility

## Purpose

R1-D implemented a trainable transparency-only PyTorch carrier model.
R1-E tests whether a PRIVATE, UNAPPROVED checkpoint can export to ONNX
and run under CPU ONNX Runtime without changing the source image outside
the authorized cosmetic mask. Passing says nothing about photographic
realism, mobile speed, training consent or permission to ship weights.

The underlying model predicts only a one-channel opacity field. A separate
linear-sRGB compositor applies the chosen pigment to the unchanged source
photograph. It never produces generated facial RGB, hair or clothing.

## Private local run

Install numpy, pillow, torch, onnx and onnxruntime locally. Start from the
private unapproved research checkpoint and matching training-report.json.

    python scripts/quality/export_opacity_onnx.py \
      --checkpoint /private/model-r1d/research-carrier-unapproved.pt \
      --out /private/model-r1e/onnx-review \
      --parity-trials 5

This exporter refuses output directories inside the public GitHub repository.
It requires a research_only checkpoint and a training report explicitly
declaring catalog_approved=false and deploy_to_live_app=false.
It loads the checkpoint with PyTorch weights_only=True.

Outputs, private only:

- opacity-carrier-RESEARCH-ONLY.onnx: fixed-size four-input, opacity-only graph.
- onnx-research-report.json: SHA-256 provenance, model size, model parity and
  CPU-inference latency observations.

Tensor contract:

| Input | Shape | Meaning |
| --- | --- | --- |
| source | (1,3,S,S) | original normalized RGB crop |
| mask | (1,1,S,S) | user-reviewed cosmetic edit permission |
| pigment | (1,3,1,1) | known cosmetic sRGB color |
| region | (1,3,1,1) | lips/eyes/cheeks one-hot |

Output alpha has shape (1,1,S,S), bounded [0,1]. S equals the checkpoint's
trained crop side, 96..512, divisible by 4.

The exporter tests multiple synthetic cases including original black
background, ordinary colored skin-like arrays and an empty mask. It
refuses a single nonzero output outside the mask and requires PyTorch/ONNX
max absolute alpha error not greater than 0.0002. It reports CPU latency
but makes NO claim about WebAssembly or Android speed. No learned source
photo reconstruction is involved.

ONNX opset 17 and a fixed input shape are deliberate for portability.
Real browser/Android provider support, memory consumption, quantized
weight quality, dynamic tracking, and startup download budget remain
unverified. There is no production ONNX integration in this change.

## Promotion remains blocked

Training must use independently licensed and consented aligned original
before/after images. Test and train subjects must be disjoint; assess
pigment fidelity, lip and liner detail, temporal stability, skin-tone
performance and professional artist-blinded quality against actual
cosmetics. One-epoch synthetic tests provide zero evidence for those
visual outcomes.

Do NOT copy the resulting checkpoint to public assets, the 42-look catalog,
GitHub Actions artifacts or Cloudflare. Even a small synthetic model might
retain private dataset information when trained on real people.

Synthetic non-person smoke:

    python scripts/quality/test_export_opacity_onnx.py
