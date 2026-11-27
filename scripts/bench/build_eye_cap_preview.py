"""Build experimental eye-cap GPU layers for public catalog browser A/B.

Never overwrite main's shipped layers or look metadata. Test assets exist only
in the CI workspace, under public/tryon/eye-cap-preview, and are not published.
The candidate MUST use the exact old layer rectangle and UV mapping; failing
closed avoids global interpolation shifts falsely attributed to eye makeup.

    python scripts/bench/build_eye_cap_preview.py --cap 0.8
    python scripts/bench/build_eye_cap_preview.py --all --out /private/eye-cap-layers

With --all, even looks unaffected by the trial are included byte-identically
to the shipped files, so a private 48-look renderer can load a complete set.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
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
        # The exporter reserves a face rectangle for "no-makeup" / lip-only
        # looks, even when their source log-ratio is identically zero.
        on[max(0, int(p[:, 1].min())):min(h, int(p[:, 1].max())),
           max(0, int(p[:, 0].min())):min(w, int(p[:, 0].max()))] = True
        if not on.any():
            raise RuntimeError("No usable face rectangle in empty atlas: " + look)
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
    if previous_uv.shape != expected_uv.shape:
        raise RuntimeError("Shipped UV vector count differs for " + look)
    # Existing metadata remains AUTHORITATIVE. MediaPipe can vary by fractions
    # of a pixel across executions, so do not use fresh UV coordinates to
    # replace the shipped ones. A > 0.75 px shift indicates invalid alignment.
    shift = np.abs((previous_uv - expected_uv).reshape(-1, 2)
                   * np.array([x1 - x0, y1 - y0]))
    max_uv_shift_px = float(shift.max())
    if max_uv_shift_px > 0.75:
        raise RuntimeError("Atlas UV drift for %s is %.3f px (> 0.75); refuse GPU comparison" % (look, max_uv_shift_px))
    # A look without changed source pixels still needs its EXACT unchanged
    # shipped WebP bytes in the complete private candidate asset pack.
    has_delta = bool(np.any(crop != baseline_crop))
    # The candidate is exactly the SHIPPED WebP plus the encoded source delta,
    # not a newly resampled or globally repainted texture. Without this,
    # rounding/encoder or source re-extraction can alter unrelated regions.
    delta = crop.astype(np.int16) - baseline_crop.astype(np.int16)
    crop = np.uint8(np.clip(old[..., ::-1].astype(np.int16) + delta, 0, 255))
    changed = np.abs(candidate - baseline).max(-1) > 1e-6
    # Fail if effect reaches the surrounding blank atlas pixels outside crop.
    outside = changed.copy()
    outside[y0:y1, x0:x1] = False
    if outside.any():
        raise RuntimeError("Candidate changes pixels outside original layer crop for " + look)
    out.mkdir(parents=True, exist_ok=True)
    file = out / (look + ".webp")
    if has_delta:
        if not cv2.imwrite(str(file), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 101]):
            raise RuntimeError("Could not write preview WebP for " + look)
    else:
        shutil.copyfile(T.TRYON / "layers" / (look + ".webp"), file)
    return {"look": look, "cap": cap, "width": int(x1 - x0), "height": int(y1 - y0),
            "changed_source_pixels": int(changed.sum()) if has_delta else 0,
            "max_uv_shift_px": round(max_uv_shift_px, 4),
            "shipped_sha256": hashlib.sha256((T.TRYON / "layers" / (look + ".webp")).read_bytes()).hexdigest(),
            "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cap", type=float, default=0.8)
    parser.add_argument("--out", type=Path, default=OUTPUT)
    parser.add_argument("--all", action="store_true", help="build all catalog looks for a private real-face A/B benchmark")
    parser.add_argument("--looks", type=str, default="", help="optional comma-separated look IDs instead of three diagnostics")
    args = parser.parse_args()
    if not 0.6 < args.cap <= 1.0:
        parser.error("Research cap must be above baseline 0.6 and at most 1.0")
    if args.all and args.looks:
        parser.error("--all and --looks are mutually exclusive")
    looks = T.catalog_looks() if args.all else [x.strip() for x in args.looks.split(",") if x.strip()] if args.looks else LOOKS
    if args.all and len(looks) < 40:
        raise RuntimeError("Refusing partial full-catalog atlas generation (<40 looks)")
    if len(set(looks)) != len(looks) or any(look not in T.catalog_looks() for look in looks):
        raise RuntimeError("Unrecognized or duplicated catalog look in selection")
    summaries = []
    for look in looks:
        summaries.append(create(look, args.cap, args.out))
        T.layer_parts.cache_clear()
    (args.out / "manifest.json").write_text(json.dumps(
        {"source": "public catalog only", "production_assets_unchanged": True,
         "complete_catalog": bool(args.all), "cap": args.cap, "looks": summaries},
        indent=2))
    print("EYE_CAP_PREVIEW " + json.dumps({"looks": len(summaries),
        "with_delta": sum(x["changed_source_pixels"] > 0 for x in summaries),
        "complete_catalog": bool(args.all), "cap": args.cap}, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
