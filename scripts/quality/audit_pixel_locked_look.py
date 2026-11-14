#!/usr/bin/env python3
"""Verify that a composited makeup look cannot alter pixels outside its mask.

This is an engineering guard, NOT a photorealism, face-identity, commercial-
licensing or artistic-accuracy certificate. Human visual approval is mandatory.

Usage:
  python scripts/quality/audit_pixel_locked_look.py \
    --master bare-reference.png --look styles/hollywood.png \
    --mask masks/hollywood-allowed.png --out out/hollywood --premium

Only approved makeup regions may be nonzero in the single-channel mask.
A full image generated independently is expected to fail this gate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageEnhance

MAX_ALLOWED_COVERAGE = 0.25
MIN_ALLOWED_COVERAGE = 0.0001
MIN_NATIVE_WIDTH = 2048
MIN_NATIVE_HEIGHT = 2732
TARGET_ASPECT = 3 / 4
ASPECT_TOLERANCE = 0.005


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as im:
        im.verify()
    with Image.open(path) as im:
        if im.mode not in ("RGB", "RGBA"):
            raise ValueError(f"Unexpected {path.name} color mode: {im.mode}")
        return im.convert("RGB")


def load_mask(path: Path) -> Image.Image:
    with Image.open(path) as im:
        im.verify()
    with Image.open(path) as im:
        if im.mode not in ("L", "1"):
            raise ValueError("Allowed-region mask must be grayscale PNG, not RGB/RGBA")
        return im.convert("L").point(lambda x: 255 if x > 0 else 0)


def nonzero_count(im: Image.Image) -> int:
    return sum(im.histogram()[1:])


def max_value(im: Image.Image) -> int:
    return max((i for i, count in enumerate(im.histogram()) if count), default=0)


def audit(master_path: Path, look_path: Path, mask_path: Path,
          out: Path, premium: bool = False, max_mask_coverage: float = MAX_ALLOWED_COVERAGE) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    for p in (master_path, look_path, mask_path):
        if not p.is_file():
            errors.append(f"Missing input: {p}")
    if errors:
        result = {"passed": False, "errors": errors, "requires_artist_review": True}
        (out / "audit.json").write_text(json.dumps(result, indent=2) + "\n")
        return result

    master = load_rgb(master_path)
    edited = load_rgb(look_path)
    allowed = load_mask(mask_path)

    if master.size != edited.size or allowed.size != master.size:
        errors.append(f"Dimensions differ: master {master.size}, look {edited.size}, mask {allowed.size}")
    if master.size != edited.size or allowed.size != master.size:
        result = {"passed": False, "errors": errors, "requires_artist_review": True}
        (out / "audit.json").write_text(json.dumps(result, indent=2) + "\n")
        return result

    w, h = master.size
    if premium and (w < MIN_NATIVE_WIDTH or h < MIN_NATIVE_HEIGHT):
        errors.append(f"Premium master {w}x{h} below native {MIN_NATIVE_WIDTH}x{MIN_NATIVE_HEIGHT} target (do not upscale)")
    if premium and abs(w / h - TARGET_ASPECT) > ASPECT_TOLERANCE:
        errors.append(f"Premium master {w}x{h} must use the consistent 3:4 frame")

    coverage = nonzero_count(allowed) / (w * h)
    if coverage <= MIN_ALLOWED_COVERAGE:
        errors.append("Allowed cosmetic region is empty or implausibly small")
    if coverage > max_mask_coverage:
        errors.append(f"Allowed region covers {coverage:.1%} of image; maximum {max_mask_coverage:.1%}")
    # A cosmetic edit must not give itself permission to change the image border.
    for border in (allowed.crop((0, 0, w, min(h, 4))),
                   allowed.crop((0, max(0, h - 4), w, h)),
                   allowed.crop((0, 0, min(w, 4), h)),
                   allowed.crop((max(0, w - 4), 0, w, h))):
        if border.getbbox() is not None:
            errors.append("Mask includes the photo border (background must be protected)")
            break

    rgb_diff = ImageChops.difference(master, edited)
    red, green, blue = rgb_diff.split()
    any_difference = ImageChops.lighter(red, ImageChops.lighter(green, blue))
    protected_mask = ImageChops.invert(allowed)
    protected_diff = ImageChops.multiply(any_difference, protected_mask)
    allowed_diff = ImageChops.multiply(any_difference, allowed)
    unauthorized = nonzero_count(protected_diff)
    changed_inside = nonzero_count(allowed_diff)
    if unauthorized:
        errors.append(f"{unauthorized:,} pixels changed outside the makeup mask")
    if changed_inside == 0:
        errors.append("No makeup pixels changed inside the allowed mask")

    # Review visuals. Red heatmap reveals forbidden changes; no source photo
    # is uploaded or transmitted to external APIs by this offline script.
    black = Image.new("L", master.size, 0)
    heatmap = Image.merge("RGB", (ImageEnhance.Contrast(protected_diff).enhance(5),
                                  black, black))
    heatmap.save(out / "protected-differences.png")
    allowed.save(out / "allowed-region-mask.png")
    result = {
        "passed": not errors,
        "requires_artist_review": True,
        "premium_native_dimension_gate": premium,
        "width": w, "height": h,
        "allowed_coverage_percent": round(100 * coverage, 3),
        "changed_inside_mask_pixels": changed_inside,
        "changed_outside_mask_pixels": unauthorized,
        "maximum_unauthorized_channel_delta": max_value(protected_diff),
        "master_sha256": hashlib.sha256(master_path.read_bytes()).hexdigest(),
        "look_sha256": hashlib.sha256(look_path.read_bytes()).hexdigest(),
        "errors": errors,
        "notes": [
            "A mask can hide bad blending seams or incorrect lips/liner. Check every pixel of the eye/lip boundary manually.",
            "Exact outside-mask preservation does not certify matching facial identity inside editable regions.",
            "Authentic cosmetic-free photographic source and native resolution require separate provenance checks.",
            "A synthetic editorial reference is not independently verified cosmetic-free photography."
        ]
    }
    (out / "audit.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", type=Path, required=True)
    parser.add_argument("--look", type=Path, required=True)
    parser.add_argument("--mask", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--premium", action="store_true")
    args = parser.parse_args()
    report = audit(args.master, args.look, args.mask, args.out, premium=args.premium)
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
