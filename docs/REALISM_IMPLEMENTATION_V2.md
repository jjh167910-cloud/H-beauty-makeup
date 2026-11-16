# H-Beauty Makeup — realism roadmap v2 (implementation specification)

Status: **development specification**, not a photorealism certification.
Baseline repository: 7379d767 (2026-11-16). Original source: Roadmap.pdf, pages 1–18.
Build on the existing offline, on-device WebGL2 engine; do not replace production before measured superiority.

## Why v2 differs from the original nine-phase roadmap

The main diagnosis is unchanged: the catalog's photograph-ratio layers carry the source model's
geometry, lighting, cosmetic residue and eyelashes. They are not portable cosmetic materials.
The renderer must eventually accept **coverage, pigment, opacity, finish, vector geometry and
occlusion**, all in the customer's own face coordinates. However, several gates in the original
plan would overstate confidence unless revised:

1. **No training without legal provenance.** Do not assume FFHQ, public beauty photos, Sapiens2,
   FLUX, ART or other research checkpoints may be used commercially or to distill another model.
   Record both input-image rights and each model's output-use/training restrictions.
   FFHQ dataset metadata is CC BY-NC-SA 4.0; individual images have different licenses.
   FLUX 3 Image Klein limits uses of outputs to improve similar AI models. A commercial salon
   needs rights verified for the specific intended use. A paper citation is not a license.
2. **A 70% blind preference on correlated ratings is not 70% independent evidence.**
   Face/look pairs are the comparison units, but four looks on the same face are correlated.
   Do not treat rater clicks or repeated looks as additional independent people. Report a
   customer-cluster Wilson 95% interval on subject-level success, skin-tone
   strata and per-look scores. Report inconclusive results as inconclusive.
3. **Do not count clipping already present in the input camera photo as new makeup clipping.**
   Count introduced RGB 0/255 endpoints in previously non-clipped channels. Report near-endpoint
   0–5/250–255 pressure as a diagnostic, not an automatic fail for editorial looks.
4. **A no-change-outside-mask test is necessary but insufficient.** Require mask provenance,
   non-border masks, edge inspection, independently evaluated facial landmarks, and visual artist
   signoff. The existing pixel-lock Python audit remains valid and is complemented by
   scripts/quality/benchmark_v2.mjs.
5. **Photographic colour truth needs controlled calibration.** ΔE2000 against a real shade swatch
   is valid only with consistent exposure/white balance, measured illumination and a colour
   target. On arbitrary selfies, publish colour appearance as approximate.
6. **Live and still renderers share a material model, not a pixel-identical performance promise.**
   Live video may use lower-resolution ROI effects; still mode uses adaptive high-res tiling.
   Compare both with a toleranced, perceptual test and temporal-stability metrics.
7. **A 3 MB student, 4096 px output or 30 fps is a hypothesis, not a contract.** Benchmark on
   three actual phone classes; only promote a new model if its benefit exceeds compute, download,
   memory and battery costs. Keep WebGL2 as the minimum supported graphics path; WebGPU optional.
8. **Prioritize commercial fidelity, not artificial beautification.** An untouched original
   must remain available for before/after. Studio light and restoration are opt-in and labelled.
   Any AI finish must be strictly masked and preserve identity, anatomy and skin detail.

## Revised delivery order

**A — Evidence and permission gate (before GPU spending).** Record rights for datasets and
teacher models; collect opt-in real-phone test photos privately; annotate eye/lip curves; measure
baseline versus two real competitors on matched looks. Do not commit selfies, face embeddings or
any personal identifying metadata. Establish artist rubric and reproducible capture conditions.
Run the existing GPU pilot only with sources licensed for the use.

**B — Four-look material pilot (before expanding to 42).** Start with no-makeup, Hollywood,
electric blue and rhinestone. Give every look named cosmetic products, authorable coverage masks,
vector liner paths, independently anchored lash strands, editable finishes and optional particles.
Use the existing "میکاپ من" material path to replace photo-ratio layers one product at a time.
An authoring prototype may use manual masks until automatic extraction clearly beats them.

**C — Face-fitting only where errors justify it.** Retain MediaPipe tracking and the existing
outline editor. First evaluate landmark-based curves with crop refinement; distill dense
segmentation/geometry students only when measured eye/lip placement improves across challenging
eyes, poses, skin tones, occlusion and low light. Never infer confidence from landmark count alone.

**D — Intrinsic lighting plus materials.** Calibrate on a consented, controlled test set;
estimate skin reflectance and shading, not a single definitive albedo truth from an arbitrary
RGB selfie. Correct camera white balance first. Compose in linear light and use an explicit
tone-mapping/gamut path; retain skin pores, lip lines and natural facial shadows.

**E — Optional trained local finisher.** Train only from authorized data, with paired graphics
outputs and independently checked real-makeup references. Mask its residual output to cosmetic
regions; reject background, hair, facial-shape and texture drift. Train and evaluate on
independent people, with no overlapping identities across splits. The finisher may remain
disabled if it does not win blind comparisons.

**F — Product and engineering.** A sticky photo, grouped look browser, fast sharing,
one-tap booking message (customer manually sends photo), clear privacy copy, touch-accessible
bottom-sheet controls and graceful offline re-entry. Progressive model tiers: graphics first,
refinement later; cancelable/resumable downloads; HD optional. Keep old pipeline side-by-side
until pilot exit gates are independently met.

## Benchmark protocol (Phase 0 and every release)

- Benchmark: at least 30 independent, consented real selfies, four pilot looks on **each**,
  and at least five independent people in each light/medium/deep testing stratum. Add eye-shape,
  glasses, hijab, dark-light conditions and difficult images. Strata are test coverage, not
  claims about anyone's identity. A larger set will be necessary for a full 42-look release.
- Use holdout people never used for training or prompt selection; keep exposure/pose/look
  matching consistent for head-to-head competitor pairs.
- For each face/look pair, independently assign one blinded comparative decision
  (candidate, competitor, tie) after collecting rater feedback. Keep full raw rater results
  in secure private storage for inter-rater agreement analysis; public summaries are aggregate.
- Artist score 1–5 for placement, opacity/colour, edges, skin realism, identity, and
  would-show-to-a-client; a look below 4 on any crucial dimension is held back.
- Save local, anonymized **metadata only**: no selfies, thumbnails, coordinates or emails.
  For engineering audits, count protected pixel changes, newly clipped RGB channels and
  border mask pixels. Use the existing standalone offline image audit to generate these.
- Report device class, frames per second, p50/p95 time to first result, peak memory, download
  bytes, warm/cold cache, frame drops, and battery cost; do not cite software rendering as
  physical phone performance.
- Compare in a registered test design. The 70% blind win-rate is a **point estimate target**;
  require a Wilson 95% lower bound above 50% on the **customer-cluster**
  pass fraction (each customer must win at least 70% of her tested looks). Reject a skin
  stratum below 50% pairwise preference or a gap over 0.3 in mean artist score. Report per-look
  and skin-group results even when the overall headline is positive.
- No CI test or synthetic-photo evaluation may certify "state of the art". Phase promotion is
  blocked until a human artist and legal reviewer sign off.

### Machine-readable pilot report

Put this JSON **only in a private folder outside the public repository**. No real photos are
required by this tool. Values are measured or manually checked, not fabricated:

~~~json
{
  "schema_version": 2,
  "cases": [
    {
      "sample_id": "anonymous-001",
      "look_id": "hollywood",
      "skin_group": "medium",
      "capture_type": "consented_real_selfie",
      "blind_review": true,
      "artist_score": 4.4,
      "outside_changed_pixels": 0,
      "border_mask_pixels": 0,
      "introduced_clipped_channels": 0,
      "paired_preference": "candidate"
    }
  ]
}
~~~

Run:

~~~sh
node scripts/quality/benchmark_v2.mjs /private/path/benchmark.json
node --test tests-node/benchmark_v2.test.mjs
~~~

The CLI reports fail, insufficient-evidence or pass. Confidence is clustered by
independent customer rather than incorrectly treating repeated looks as independent. **Pass is only the quantitative pilot
gate**, not legal permission or proof the outcome is realistic. It always requires artist and
legal review. Partial/inconclusive data may not silently promote a model.

## Implemented experimental material-eye renderer (photo pilot)

The code in `src/lib/material-eye-v2.ts` is a **research implementation**, not an
externally validated result. It runs **only on saved photos when the URL explicitly
contains `?eyePilot=v2`**; it is off by default for every user, the live mirror and
thumbnail rendering. It does not introduce model downloads or remote photo processing.

For the four declared pilot looks, it preserves the normal engine's result as
the baseline, then uses each photo's real upper-lid and brow landmarks to define
a face-fitted pigment area. It replaces eye-region catalog photo-ratio pixels with
an authored cosmetic shade composited in linear light, preserving local lighting
and skin detail. Liner and lashes are drawn as vector paths / separately tapered
strands; the camera-face visibility mask suppresses occluded regions. Other face
pixels are unchanged.

Pilot IDs: `no-makeup` (negative control: intentionally unchanged),
`hollywood`, `electric-blue` and `rhinestone`.
The pilot does not yet replace rhinestone placement or provide real intrinsic
decomposition, neural lashes, temporal video consistency or validated accurate
placement for every eyelid type; these remain engineering milestones.

Browser checks in `tests/material-eye-v2.spec.ts` confirm the feature flag,
protected background pixels, two-eye rendering on synthetic landmarks, no new
0/255 clipping and an unchanged result when face visibility is zero.
**These tests do not establish photorealism or quality superiority.**

The intended side-by-side evaluation is one customer photo, same look and
settings, default renderer versus `eyePilot=v2`, with filenames randomized
for blind professional review. Do not deploy or enable pilot by default before
it wins on real photographed makeup.

## Shipping policy

1. Production stays on main during research; use a feature flag and pilot branch.
2. Fail closed for changed pixels outside permitted cosmetic regions, introduced hard clipping,
   missing rights, non-consented study data, or lower-quality results on difficult skin/eye cases.
3. Promote one material/eye effect only after screenshot regression, human blind review and
   low/mid-range device performance; keep a measured rollback path.
4. Record the production SHA and independently verify the deployed build, not only GitHub CI.
5. Do not claim visual superiority over competitors until a reproducible independent study
   actually reaches the predeclared target.

Research anchors:
- WACV 2026, Chau et al., Towards High-Fidelity, Identity-Preserving Real-Time Makeup Transfer:
  https://openaccess.thecvf.com/content/WACV2026/html/Chau_Towards_High-Fidelity_Identity-Preserving_Real-Time_Makeup_Transfer_Decoupling_Style_Generation_WACV_2026_paper.html
- ECCV 2024 TinyBeauty: https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/3942_ECCV_2024_paper.php
- FFHQ license: https://github.com/NVlabs/ffhq-dataset/blob/master/LICENSE.txt
- FLUX 3 Image Klein terms: https://huggingface.co/black-forest-labs/flux-3-image-klein
