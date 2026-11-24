"""Build experimental eye-cap GPU layers for public catalog browser A/B.

Never overwrite main's shipped layers or look metadata. Test assets exist only
in the CI workspace, under public/tryon/eye-cap-preview, and are not published.
The candidate MUST use the exact old layer rectangle and UV mapping; failing
closed avoids global interpolation shifts falsely attributed to eye makeup.

    python scripts/bench/build_eye_cap_preview.py --cap 0.8
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "scripts/tinybeauty"))
import teacher as T

LOOKS = ("icy", "mod-60s", "cut-crease")
OUTPUT = REPO / "public/tryon/eye-cap-preview"


def create(look: str, cap: float, out: Path) -> dict:
    baseline, p, _ = T.layer_parts(look)
    candidate, cp, _ = T.layer_parts(look, eye_light_cap=cap)
    if baseline.shape != candidate.shape or not np.array_equal(p, cp):
        raise RuntimeError("Candidate changed catalog geometry for " + look)
    h, w = baseline.shape[:2]
    on = np.abs(baseline).max(-1) > 2e-3
    if not on.any():
        raise RuntimeError("Expected a nonempty eye-look base layer: " + look)
    ys, xs = np.nonzero(on)
    margin = 4
    x0, y0 = max(0, xs.min() - margin), max(0, ys.min() - margin)
    x1, y1 = min(w, xs.max() + margin + 1), min(h, ys.max() + margin + 1)
    old = cv2.imread(str(T.TRYON / "layers" / (look + ".webp")), cv2.IMREAD_COLOR)
    if old is None:
        raise FileNotFoundError("Shipped layer is missing for " + look)
    crop = T.encode_layer(candidate[y0:y1, x0:x1])
    baseline_crop = T.encode_layer(baseline[y0:y1, x0:x1])
    if old.shape[:2] != crop.shape[:2]:
        raise RuntimeError("Candidate crop differs from shipped atlas for " + look)
    if not np.array_equal(old[..., ::-1], baseline_crop):
        changed = np.abs(old[..., ::-1].astype(np.int16) - baseline_crop.astype(np.int16))
        mismatch = float(np.mean(changed.max(-1) > 1))
        if mismatch > 0.001:
            raise RuntimeError("Shipped atlas differs from baseline source for %s (%.3f%% pixels); regenerate and compare baseline before A/B" % (look, 100 * mismatch))
    meta = json.loads((T.TRYON / "looks.json").read_text())["looks"][look]
    expected_uv = np.round(((p[:, :2] - [x0, y0] + 0.5) / [x1 - x0, y1 - y0]).ravel(), 5)
    previous_uv = np.asarray(meta["uv"], np.float32)
    if previous_uv.shape != expected_uv.shape or np.max(np.abs(previous_uv - expected_uv)) > 1.1e-5:
        raise RuntimeError("Shipped UV mapping differs from candidate crop for " + look)
    if not np.any(crop != baseline_crop):
        raise RuntimeError("Experimental cap had no effect on " + look)
    changed = np.abs(candidate - baseline).max(-1) > 1e-6
    # Fail if effect reaches the surrounding blank atlas pixels outside crop.
    outside = changed.copy()
    outside[y0:y1, x0:x1] = False
    if outside.any():
        raise RuntimeError("Candidate changes pixels outside original layer crop for " + look)
    out.mkdir(parents=True, exist_ok=True)
    file = out / (look + ".webp")
    if not cv2.imwrite(str(file), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 101]):
        raise RuntimeError("Could not write preview WebP for " + look)
    return {"look": look, "cap": cap, "width": int(x1 - x0), "height": int(y1 - y0),
            "changed_source_pixels": int(changed.sum()),
            "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cap", type=float, default=0.8)
    parser.add_argument("--out", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if not 0.6 < args.cap <= 1.0:
        parser.error("Research cap must be above baseline 0.6 and at most 1.0")
    summaries = []
    for look in LOOKS:
        summaries.append(create(look, args.cap, args.out))
        T.layer_parts.cache_clear()
    (args.out / "manifest.json").write_text(json.dumps(
        {"source": "public catalog only", "production_assets_unchanged": True, "looks": summaries},
        indent=2))
    print("EYE_CAP_PREVIEW " + json.dumps(summaries), flush=True)


if __name__ == "__main__":
    main()
