"""Audit an opt-in eyelid-lightening cap on EVERY public catalog look.

No private photographs or generated customer faces are read. The production
WebGL engine and exported makeup layers are not changed by this experiment.

Usage:
    python scripts/bench/audit_eye_cap.py [--cap 0.8] [--all]
Default: a small stress set. --all: all public catalog photos.
The safety gate is strict about non-eye pixels; whether the result is actually
more photorealistic still requires blinded review and private face benchmarks.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from diagnose_pale_lids import lid_mask, lstar, T  # noqa: E402

STRESS_LOOKS = (
    "icy", "mod-60s", "cut-crease", "glitter-party", "classic-smokey",
    "electric-blue", "plum-smokey", "soft-glam", "hollywood",
    "no-makeup", "persian-bride", "k-beauty",
)
# Changes under half a CIELAB unit can arise from 8-bit conversion (0.392).
MAX_PLAIN_LSTAR = 0.8
MAX_LIP_LSTAR = 0.5
MAX_OUTSIDE_LSTAR = 0.5


def max_region(array: np.ndarray, region: np.ndarray) -> float:
    return float(array[region].max()) if np.any(region) else 0.0


def inspect(look: str, cap: float) -> dict:
    base, pb = T._bare()
    photo = T.rgb(T.LOOKS / (look + ".webp"))
    p = T.landmarks3(photo)
    if p is None:
        raise RuntimeError("Face finder failed on catalog look " + look)
    h, w = photo.shape[:2]
    bw, _ = T.mesh_warp(T.lin(base), pb, p, (h, w))
    old, _, _ = T.layer_parts(look)
    new, _, _ = T.layer_parts(look, eye_light_cap=cap)
    bL, nL = lstar(bw * np.exp(old)), lstar(bw * np.exp(new))
    delta = np.abs(bL - nL)
    face = T.poly_mask((h, w), p[:, :2], [T.OVAL]) > 0.5
    lips = T.poly_mask((h, w), p[:, :2], [T.LIPS_OUT], scale=1.2) > 0.5
    lids = lid_mask((h, w), p)
    ew = T.eye_width(p[:, :2])
    support = np.zeros((h, w), np.float32)
    for eye, brow in ((T.EYE_R, T.BROW_R), (T.EYE_L, T.BROW_L)):
        hull = cv2.convexHull(np.float32(np.vstack([p[eye, :2], p[brow, :2]])))
        cv2.fillConvexPoly(support, np.int32(np.round(hull)), 1)
    support = cv2.GaussianBlur(support, (0, 0), max(1.0, ew * 0.04))
    plain = face & (support < 0.01) & ~lips
    nonface = ~face & (support < 0.01)

    # Target is an aligned public catalog image with photographic grading
    # removed, as in make_set.truth and the normal public benchmark.
    desired = lstar(T.lin(photo) / np.exp(T.grading(look)))
    bareL = lstar(bw)
    lightened = lids & (desired - bareL > 0.7)
    darkened = lids & (desired - bareL < -0.7)
    def mean(region, image):
        return float(np.mean(image[region])) if region.sum() > 30 else None

    old_deficit = mean(lightened, desired - bL)
    new_deficit = mean(lightened, desired - nL)
    dark_change = mean(darkened, nL - bL)
    metrics = {
        "look": look,
        "lightened_pixels": int(lightened.sum()),
        "darkened_pixels": int(darkened.sum()),
        "brightness_deficit_before_Lstar": round(old_deficit, 3) if old_deficit is not None else None,
        "brightness_deficit_after_Lstar": round(new_deficit, 3) if new_deficit is not None else None,
        "dark_lid_shift_Lstar": round(dark_change, 3) if dark_change is not None else None,
        "lip_max_change_Lstar": round(max_region(delta, lips), 3),
        "plain_max_change_Lstar": round(max_region(delta, plain), 3),
        "outside_face_max_change_Lstar": round(max_region(delta, nonface), 3),
        "other_eye_max_change_Lstar": round(max_region(delta, face & (support >= 0.01) & ~lids), 3),
    }
    metrics["safety"] = bool(
        metrics["lip_max_change_Lstar"] <= MAX_LIP_LSTAR
        and metrics["plain_max_change_Lstar"] <= MAX_PLAIN_LSTAR
        and metrics["outside_face_max_change_Lstar"] <= MAX_OUTSIDE_LSTAR
    )
    return metrics


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=float, default=0.8)
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if not 0.6 < a.cap <= 1.5:
        ap.error("cap must be above the unchanged production default of 0.6 and at most 1.5")
    available = T.catalog_looks()
    if a.all:
        looks = available
        if len(looks) < 40:
            raise RuntimeError("Expected at least 40 public catalog photos; refusing partial audit")
    else:
        looks = [look for look in STRESS_LOOKS if look in available]
        if len(looks) < 8:
            raise RuntimeError("Too many stress-test looks absent")
    rows = []
    for look in looks:
        row = inspect(look, a.cap)
        rows.append(row)
        print("PUBLIC_EYE_CAP_AUDIT " + json.dumps(row, sort_keys=True), flush=True)
    unsafe = [r["look"] for r in rows if not r["safety"]]
    improving = [r["look"] for r in rows if r["brightness_deficit_before_Lstar"] is not None
                 and r["brightness_deficit_after_Lstar"] is not None
                 and r["brightness_deficit_after_Lstar"] < r["brightness_deficit_before_Lstar"]]
    worsening = [r["look"] for r in rows if r["brightness_deficit_before_Lstar"] is not None
                 and r["brightness_deficit_after_Lstar"] is not None
                 and r["brightness_deficit_after_Lstar"] > r["brightness_deficit_before_Lstar"] + 0.2]
    print("PUBLIC_EYE_CAP_SUMMARY " + json.dumps({
        "total_looks": len(rows), "improved": len(improving),
        "worsened_looks": worsening, "unsafe_looks": unsafe,
        "cap": a.cap, "public_only": True,
    }), flush=True)
    return 0 if not unsafe and not worsening else 1


if __name__ == "__main__":
    sys.exit(main())
