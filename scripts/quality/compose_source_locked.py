#!/usr/bin/env python3
"""Preflight and softly composite makeup-only changes onto a frozen portrait.

This tool NEVER aligns two independently regenerated faces. It REJECTS them.
A candidate must match the exact approved source pixel-for-pixel outside its
cosmetic mask.  After source locking is established, pixels at the cosmetic
mask edge are feathered inward, without altering any protected source pixel.

Usage:
  python scripts/quality/compose_source_locked.py \
    --master master.png --candidate aligned-makeup.png \
    --mask allowed-cosmetics.png --out review/hollywood --feather 7

A passed engineering preflight is not proof of photographic authenticity,
identity, natural-looking makeup, or invisible seams. Inspect full-resolution
eyes, lashes, cheeks and lips before approving any image.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter

from audit_pixel_locked_look import audit as verify_pixel_lock
from audit_pixel_locked_look import load_mask, load_rgb

MAX_ALLOWED_COVERAGE = 0.25
MAX_EDGE_MEAN_DIFFERENCE = 12.0
MAX_EDGE_P95_DIFFERENCE = 35.0
MIN_CORE_FRACTION = 0.20


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mask_depth(binary_mask: Image.Image, feather: int) -> np.ndarray:
    """8-neighborhood erosion depth, capped at feather+1 pixels."""
    current = binary_mask
    depth = np.zeros((binary_mask.height, binary_mask.width), dtype=np.uint8)
    for _ in range(feather + 1):
        current = current.filter(ImageFilter.MinFilter(3))
        inside = np.asarray(current, dtype=np.uint8) > 0
        depth[inside] += 1
        if not inside.any():
            break
    return depth


def preflight(master_path: Path, candidate_path: Path, mask_path: Path,
              out: Path, feather: int = 7, premium: bool = False) -> dict:
    if not 1 <= feather <= 24:
        raise ValueError("Feather distance must be between 1 and 24 pixels")
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    try:
        master = load_rgb(master_path)
        candidate = load_rgb(candidate_path)
        mask = load_mask(mask_path)
    except (OSError, ValueError) as exc:
        result = {"passed": False, "errors": [str(exc)], "requires_visual_approval": True}
        (out / "preflight.json").write_text(json.dumps(result, indent=2) + "\n")
        return result
    if master.size != candidate.size or master.size != mask.size:
        errors.append(f"Image/mask dimensions differ: {master.size}, {candidate.size}, {mask.size}")
        result = {"passed": False, "errors": errors, "requires_visual_approval": True}
        (out / "preflight.json").write_text(json.dumps(result, indent=2) + "\n")
        return result
    w, h = master.size
    if premium and (w < 2048 or h < 2732 or abs(w / h - 0.75) > 0.005):
        errors.append(f"Premium artwork must have genuine native >=2048x2732, 3:4 dimensions, not {w}x{h}")
    source = np.asarray(master, dtype=np.int16)
    edited = np.asarray(candidate, dtype=np.int16)
    allowed = (np.asarray(mask, dtype=np.uint8) != 0)
    coverage = float(allowed.mean())
    if coverage <= 0.0001:
        errors.append("Mask is empty or implausibly small")
    if coverage > MAX_ALLOWED_COVERAGE:
        errors.append(f"Cosmetic mask covers {coverage:.1%} of portrait; maximum is {MAX_ALLOWED_COVERAGE:.0%}")
    if allowed[:4].any() or allowed[-4:].any() or allowed[:, :4].any() or allowed[:, -4:].any():
        errors.append("Cosmetic mask touches the protected background border")

    delta = np.max(np.abs(edited - source), axis=2)
    unauthorized_count = int(np.count_nonzero(delta[~allowed]))
    changed_inside = int(np.count_nonzero(delta[allowed]))
    if unauthorized_count:
        errors.append(f"Candidate changes {unauthorized_count:,} pixels OUTSIDE cosmetic mask; independently generated portraits are not source-locked")
    if changed_inside == 0:
        errors.append("Candidate has no cosmetic changes inside the mask")

    # The outermost pixel row should be natural source skin, not an abrupt
    # change imported from a mismatched independently generated face.
    edge = allowed & ~np.asarray(mask.filter(ImageFilter.MinFilter(3)), dtype=bool)
    edge_values = np.mean(np.abs(edited.astype(np.float32) - source.astype(np.float32)), axis=2)[edge]
    edge_mean = float(np.mean(edge_values)) if edge_values.size else 0.0
    edge_p95 = float(np.percentile(edge_values, 95)) if edge_values.size else 0.0
    if edge_mean > MAX_EDGE_MEAN_DIFFERENCE or edge_p95 > MAX_EDGE_P95_DIFFERENCE:
        errors.append(
            f"Mask edge is misaligned or cuts through pigment: mean {edge_mean:.1f}, "
            f"p95 {edge_p95:.1f} RGB levels; adjust mask to include the entire cosmetic boundary"
        )
    depth = mask_depth(mask, feather)
    core = allowed & (depth >= feather)
    core_fraction = float(np.count_nonzero(core) / max(1, np.count_nonzero(allowed)))
    if core_fraction < MIN_CORE_FRACTION:
        errors.append(f"Mask core is too thin for a {feather}px feather ({core_fraction:.0%} usable core); reduce feather or revise mask")

    heat = Image.fromarray(delta.astype(np.uint8), "L")
    heat = ImageChops.multiply(heat, ImageChops.invert(mask))
    Image.merge("RGB", (heat, Image.new("L", master.size), Image.new("L", master.size))).save(
        out / "forbidden-changes.png"
    )
    result = {
        "passed": not errors,
        "candidate_source_locked": unauthorized_count == 0,
        "requires_visual_approval": True,
        "master_sha256": sha(master_path),
        "candidate_sha256": sha(candidate_path),
        "mask_sha256": sha(mask_path),
        "width": w, "height": h, "feather_px": feather,
        "mask_coverage_percent": round(100 * coverage, 3),
        "changed_outside_mask_pixels": unauthorized_count,
        "changed_inside_mask_pixels": changed_inside,
        "edge_mean_rgb_difference": round(edge_mean, 3),
        "edge_p95_rgb_difference": round(edge_p95, 3),
        "usable_mask_core_percent": round(100 * core_fraction, 3),
        "errors": errors,
        "notes": [
            "An altered face inside the mask can pass: inspect eyes, lashes, nose and lips manually",
            "Some sharply defined liners need a wider safe mask with an unchanged outer margin",
            "A source-locked candidate must be produced on the same frozen original image",
            "Passing a pixel test does not certify photorealism or authentic photographic provenance",
        ],
    }
    (out / "preflight.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def compose(master_path: Path, candidate_path: Path, mask_path: Path,
            out: Path, feather: int = 7, premium: bool = False) -> dict:
    check = preflight(master_path, candidate_path, mask_path, out, feather, premium)
    if not check["passed"]:
        return check
    master = load_rgb(master_path)
    candidate = load_rgb(candidate_path)
    mask = load_mask(mask_path)
    hard = np.asarray(mask, dtype=np.uint8) > 0
    depth = mask_depth(mask, feather).astype(np.float32)
    # Smoothstep eases from zero at the permitted mask edge to one in its
    # interior; thin geometry should be given a separate appropriately sized
    # mask to avoid erasing lashes and precise liner strokes.
    t = np.clip(depth / float(feather), 0.0, 1.0)
    weight = (3.0 * t * t - 2.0 * t * t * t) * hard
    base = np.asarray(master, dtype=np.float32)
    made = np.asarray(candidate, dtype=np.float32)
    blended = np.clip(np.rint(base + weight[..., None] * (made - base)), 0, 255).astype(np.uint8)
    # Guarantee original pixel EXACTNESS (including sRGB rounding) outside mask.
    blended[~hard] = np.asarray(master, dtype=np.uint8)[~hard]
    file_path = out / "source-locked-composite.png"
    Image.fromarray(blended, "RGB").save(file_path)
    # Confirm the generated file using the established strict pixel-lock gate.
    safety = verify_pixel_lock(master_path, file_path, mask_path, out / "pixel-lock", premium=premium)
    if not safety["passed"]:
        file_path.unlink(missing_ok=True)
        check["passed"] = False
        check["errors"].extend("post-composite: " + msg for msg in safety["errors"])
    else:
        check["composite_path"] = str(file_path)
        check["composite_sha256"] = sha(file_path)
        check["composite_changed_outside_mask_pixels"] = safety["changed_outside_mask_pixels"]
    (out / "preflight.json").write_text(json.dumps(check, indent=2) + "\n")
    return check


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--mask", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--feather", type=int, default=7)
    parser.add_argument("--premium", action="store_true")
    parser.add_argument("--preflight-only", action="store_true")
    args = parser.parse_args()
    result = (preflight if args.preflight_only else compose)(
        args.master, args.candidate, args.mask, args.out, args.feather, args.premium
    )
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
