"""Catalog-only diagnostics for the systematic plan's pale-eyeshadow defect.

Runs the public look/bare images through the Python layer builder, and compares
stage-by-stage L* on the same skin pixels. Never uses or uploads private faces.
Only prints aggregate statistics; images remain in the repository.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tinybeauty"))
import teacher as T

UPPERS = ([33, 246, 161, 160, 159, 158, 157, 173, 133],
          [263, 466, 388, 387, 386, 385, 384, 398, 362])
BROWS = (T.BROW_LOW_R, T.BROW_LOW_L)


def lid_mask(shape, p):
    """The central mobile lids, excluding lashes, brows and eyeballs."""
    q = p[:, :2]
    out = np.zeros(shape, np.uint8)
    for upper, brow in zip(UPPERS, BROWS):
        a = q[upper]
        b = q[brow]
        b = b[np.argsort(b[:, 0])]
        by = np.interp(a[:, 0], b[:, 0], b[:, 1])
        near = a + (np.column_stack([a[:, 0], by]) - a) * 0.17
        far = a + (np.column_stack([a[:, 0], by]) - a) * 0.63
        cv2.fillPoly(out, [np.int32(np.round(np.vstack([near, far[::-1]])))], 1)
    balls = T.poly_mask(shape, q, [T.EYE_R, T.EYE_L], scale=T.BALL_SCALE)
    return (out > 0) & (balls < 0.1)


def lstar(linear):
    rgb = T.srgb(np.clip(linear, 0, 1))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32) * 100 / 255


def inspect(look, sweep=False):
    base, pb = T._bare()
    image = T.rgb(T.LOOKS / (look + ".webp"))
    pl = T.landmarks3(image)
    if pl is None:
        raise RuntimeError("No public catalog face detected: " + look)
    h, w = image.shape[:2]
    bw, cover = T.mesh_warp(T.lin(base), pb, pl, (h, w))
    if np.any(~np.isfinite(bw)):
        raise RuntimeError("Non-finite reference warp: " + look)
    R = T.regions((h, w), pl[:, :2])
    ew, eps = R["ew"], 0.004
    src = T.lin(image)
    grade = T.grading(look)
    intended = src / np.exp(grade)

    def blur(x, sigma):
        return cv2.GaussianBlur(x * cover[..., None], (0, 0), sigma) / np.maximum(
            cv2.GaussianBlur(cover, (0, 0), sigma), 1e-3
        )[..., None]

    fine = np.log((blur(src, ew * 0.02) + eps) / (blur(bw, ew * 0.02) + eps))
    soft = np.log((blur(src, ew * 0.07) + eps) / (blur(bw, ew * 0.07) + eps))
    f = np.maximum(cv2.GaussianBlur(R["fine"], (0, 0), ew * 0.15),
                   T.wing_zone(look))
    raw = fine * f[..., None] + soft * (1 - f[..., None]) - grade

    skin = R["skin"] * cover
    tone = np.clip(np.median(raw[skin > 0.5], axis=0), -T.TONE_MAX, T.TONE_MAX)
    _, holes = T.found_shapes(pl)
    hm = np.zeros((h, w), np.float32)
    for hole in holes:
        cv2.fillPoly(hm, [np.int32(np.round(hole * 16))], 1, shift=4)
    after_tone = raw - tone * (1 - T.soften(hm, T.FOUND_SOFT * ew))[..., None]

    final, _, _ = T.layer_parts(look)
    stages = {"bare_warp": bw, "reference": intended,
              "raw_blurred_ratio": bw * np.exp(raw),
              "after_complexion_removal": bw * np.exp(after_tone),
              "extracted_layer": bw * np.exp(final)}
    lums = {name: lstar(v) for name, v in stages.items()}
    lid = lid_mask((h, w), pl)
    positive = lid & (lums["reference"] - lums["bare_warp"] > 0.7)
    mask = positive if positive.sum() >= 30 else lid
    result = {
        "look": look,
        "lid_pixels": int(lid.sum()),
        "lightened_pixels": int(positive.sum()),
        "measured_pixels": int(mask.sum()),
        "grade_rgb": [round(float(x), 4) for x in np.exp(grade)],
        "stages_Lstar": {
            key: round(float(v[mask].mean()), 3)
            for key, v in lums.items()
        },
    }
    goal = result["stages_Lstar"]["reference"]
    result["brightness_deficit_Lstar"] = {
        key: round(goal - x, 3)
        for key, x in result["stages_Lstar"].items()
        if key not in ("reference", "bare_warp")
    }
    if sweep:
        result["smoothing_sweep"] = []
        # Test alternatives strictly on the public catalog images, without changing
        # any application layer or calibration gains. The non-lid shift is the safety
        # warning: a brighter eyelid is not an improvement if other makeup moves.
        outside = (T.poly_mask((h, w), pl[:, :2], [T.OVAL]) > 0.5) & ~lid
        for fine_sigma, soft_sigma in [(0.012, 0.07), (0.008, 0.045)]:
            proposed, _, _ = T.layer_parts(look, fine_sigma=fine_sigma, soft_sigma=soft_sigma)
            proposed_lstar = lstar(bw * np.exp(proposed))
            raw_f = np.log((blur(src, ew * fine_sigma) + eps)
                           / (blur(bw, ew * fine_sigma) + eps))
            raw_s = np.log((blur(src, ew * soft_sigma) + eps)
                           / (blur(bw, ew * soft_sigma) + eps))
            raw_v = raw_f * f[..., None] + raw_s * (1 - f[..., None]) - grade
            raw_lstar = lstar(bw * np.exp(raw_v))
            shift = np.abs(proposed_lstar[outside] - lums["extracted_layer"][outside])
            result["smoothing_sweep"].append({
                "fine_sigma": fine_sigma, "soft_sigma": soft_sigma,
                "raw_deficit_Lstar": round(float(goal - raw_lstar[mask].mean()), 3),
                "extracted_deficit_Lstar": round(float(goal - proposed_lstar[mask].mean()), 3),
                "nonlid_shift_p90_Lstar": round(float(np.percentile(shift, 90)), 3),
            })
    if sweep:
        exempt, _, _ = T.layer_parts(look, protect_eye_light=True)
        exempt_lstar = lstar(bw * np.exp(exempt))
        outside = (T.poly_mask((h, w), pl[:, :2], [T.OVAL]) > 0.5) & ~lid
        result["core_edge_eye_exemption"] = {
            "baseline_deficit_Lstar": round(float(goal - lums["extracted_layer"][mask].mean()), 3),
            "candidate_deficit_Lstar": round(float(goal - exempt_lstar[mask].mean()), 3),
            "nonlid_shift_p90_Lstar": round(float(np.percentile(
                np.abs(exempt_lstar[outside] - lums["extracted_layer"][outside]), 90)), 3),
            "nonlid_shift_max_Lstar": round(float(np.max(
                np.abs(exempt_lstar[outside] - lums["extracted_layer"][outside]))), 3),
        }
    if sweep:
        result["eye_light_cap_sweep"] = []
        # Opt-in alternatives only. The default cap remains 0.6 and production
        # assets are untouched. Report collateral shifts on other face pixels.
        outside = (T.poly_mask((h, w), pl[:, :2], [T.OVAL]) > 0.5) & ~lid
        for cap in (0.8, 1.0, 1.2):
            alternative, _, _ = T.layer_parts(look, eye_light_cap=cap)
            lum_alt = lstar(bw * np.exp(alternative))
            abs_shift = np.abs(lum_alt - lums["extracted_layer"])
            nonlid = abs_shift[outside]
            # Classify the collateral: is it around other eye makeup, on the
            # lips, or on truly plain skin? A global 99th percentile of zero
            # can hide a severe change concentrated on a small organ.
            lip_zone = T.poly_mask((h, w), pl[:, :2], [T.LIPS_OUT], scale=1.25) > 0.5
            eye_zone = (R["fine"] > 0.35) & ~lip_zone
            plain_zone = outside & ~eye_zone & ~lip_zone
            def max_on(zone):
                return round(float(abs_shift[zone].max()), 3) if np.any(zone) else None
            result["eye_light_cap_sweep"].append({
                "eye_light_cap": cap,
                "deficit_Lstar": round(float(goal - lum_alt[mask].mean()), 3),
                "nonlid_shift_p90_Lstar": round(float(np.percentile(nonlid, 90)), 3),
                "nonlid_shift_p99_Lstar": round(float(np.percentile(nonlid, 99)), 3),
                "nonlid_shift_max_Lstar": round(float(nonlid.max()), 3),
                "outside_eye_makeup_max_Lstar": max_on(plain_zone),
                "lip_zone_max_Lstar": max_on(lip_zone),
                "other_eye_makeup_max_Lstar": max_on(eye_zone & outside),
                "nonlid_pixels_over_1_Lstar": int(np.count_nonzero(nonlid > 1.0)),
            })
    return result


def main():
    args = sys.argv[1:]
    sweep = "--sweep" in args
    looks = [a for a in args if not a.startswith("--")] or ["icy", "mod-60s", "cut-crease"]
    for look in looks:
        print("PALE_LID_SOURCE_STAGE " + json.dumps(inspect(look, sweep=sweep)), flush=True)


if __name__ == "__main__":
    main()
