#!/usr/bin/env python3
"""Audit H-Beauty catalog completeness and image-pair stability.

Usage:
    python -m pip install pillow
    python scripts/quality/audit_catalog.py --out /tmp/hbeauty-catalog

No face recognition and no network. This audits engineering consistency, NOT
artistic correctness, identity fidelity, image realism, or bare-face validity.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from PIL import Image, ImageChops, ImageStat, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[2]
STYLES = ROOT / "src/data/makeup-styles.ts"
PHOTOS = ROOT / "public/makeup/looks"
BASELINE = PHOTOS / "no-makeup.webp"
STYLE = re.compile(r'\bstyle\(\s*"([a-z0-9-]+)"\s*,\s*"([^"]+)"')

# Known catalog framing; these are rough *review regions*, not segmentation.
# All look photos should retain the same camera and framing.
ROIS = {
    "eyes_left": (0.10, 0.28, 0.34, 0.44),
    "eyes_right": (0.37, 0.22, 0.69, 0.41),
    "lips": (0.23, 0.54, 0.59, 0.67),
    "cheek_left": (0.11, 0.41, 0.32, 0.60),
    "cheek_right": (0.48, 0.41, 0.74, 0.60),
    # Near the top-left corner, away from the loose hair by her cheek.
    "background_upper_left": (0.005, 0.005, 0.045, 0.055),
    "hair_right": (0.79, 0.40, 0.95, 0.91),
    "hair_bottom_left": (0.01, 0.76, 0.16, 0.98),
}


def mean_diff(img: Image.Image, reference: Image.Image) -> float:
    diff = ImageChops.difference(img, reference)
    return round(sum(ImageStat.Stat(diff).mean) / 3.0, 3)


def region(img: Image.Image, spec: tuple[float, float, float, float]) -> Image.Image:
    w, h = img.size
    return img.crop((round(spec[0] * w), round(spec[1] * h),
                     round(spec[2] * w), round(spec[3] * h)))


def find_looks() -> list[tuple[str, str]]:
    items = STYLE.findall(STYLES.read_text(encoding="utf-8"))
    ids = [item[0] for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate IDs in makeup-styles.ts")
    return items


def audit(require_v2: bool = False) -> tuple[list[dict], list[str], list[str]]:
    items = find_looks()
    errors, warnings, rows = [], [], []
    if len(items) != 42:
        errors.append(f"Expected 42 catalog styles, found {len(items)}")
    if not BASELINE.is_file():
        errors.append(f"Baseline missing: {BASELINE.relative_to(ROOT)}")
        return rows, errors, warnings
    with Image.open(BASELINE) as b:
        base = b.convert("RGB")
    size = base.size
    if require_v2:
        # A v2 asset release must not silently reuse the made-up natural style
        # as the cosmetic-free extraction source. Human cosmetic-free approval
        # is still necessary even when the new file passes this machine gate.
        neutral = PHOTOS / "bare-reference.webp"
        if not neutral.is_file():
            errors.append("V2 reference missing: public/makeup/looks/bare-reference.webp")
        else:
            try:
                with Image.open(neutral) as opened:
                    neutral_image = opened.convert("RGB")
                if neutral_image.size != size:
                    errors.append(f"V2 neutral photo {neutral_image.size} differs from catalog {size}")
                if neutral_image.tobytes() == base.tobytes():
                    errors.append("V2 neutral photo is pixel-identical to the made-up no-makeup style")
            except (UnidentifiedImageError, OSError, ValueError) as exc:
                errors.append(f"Unreadable V2 neutral reference: {exc}")
    hashes: dict[str, list[str]] = defaultdict(list)
    required = {
        "photo": (PHOTOS, ".webp"),
        "thumbnail": (PHOTOS / "sm", ".webp"),
        "layer": (ROOT / "public/tryon/layers", ".webp"),
        "eye_detail": (ROOT / "public/tryon/eyes", ".png"),
    }

    for style_id, title in items:
        row: dict = {"id": style_id, "title": title, "dimensions": None,
                     "regions": {}, "warnings": []}
        paths = {}
        for group, (folder, suffix) in required.items():
            path = folder / (style_id + suffix)
            if not path.is_file():
                errors.append(f"Missing {group}: {path.relative_to(ROOT)}")
            else:
                paths[group] = path
        photo = paths.get("photo")
        if photo:
            try:
                with Image.open(photo) as opened:
                    opened.verify()
                with Image.open(photo) as opened:
                    im = opened.convert("RGB")
            except (UnidentifiedImageError, OSError, ValueError) as exc:
                errors.append(f"Unreadable photo {style_id}: {exc}")
                continue
            row["dimensions"] = [*im.size]
            row["bytes"] = photo.stat().st_size
            row["sha256"] = sha256(photo.read_bytes()).hexdigest()
            hashes[sha256(im.tobytes()).hexdigest()].append(style_id)
            if im.size != size:
                errors.append(f"{style_id}: {im.size} != reference size {size}")
            else:
                row["global_mean_rgb_delta"] = mean_diff(im, base)
                for key, roi in ROIS.items():
                    row["regions"][key] = mean_diff(region(im, roi), region(base, roi))
                max_feature = max(row["regions"][k] for k in
                                  ("eyes_left", "eyes_right", "lips", "cheek_left", "cheek_right"))
                row["max_region_change"] = round(max_feature, 3)
                if style_id != "no-makeup" and max_feature < 5.0:
                    row["warnings"].append("Low regional change versus baseline: check visual distinction")
                if row["regions"]["background_upper_left"] > 8.0:
                    row["warnings"].append("Potential background/white-balance drift: inspect manually")
                if max(row["regions"]["hair_right"],
                       row["regions"]["hair_bottom_left"]) > 12.0:
                    row["warnings"].append("Potential non-makeup drift in hair: inspect manually")
        rows.append(row)
    for ids in hashes.values():
        if len(ids) > 1:
            errors.append("Pixel-identical style photos: " + ", ".join(ids))
    expected = set(x[0] for x in items)
    for group, (folder, suffix) in required.items():
        actual = {p.stem for p in folder.glob("*" + suffix)}
        extra = actual - expected
        if extra:
            warnings.append(f"Unreferenced {group} files: {', '.join(sorted(extra))}")
    warnings.append(
        "MANUAL BLOCKER: 'no-makeup.webp' is also the natural-makeup style photo, "
        "yet teacher.py uses it as a bare-face calibration. Create a separate "
        "true cosmetic-free reference for v2; this is not machine-verifiable."
    )
    return rows, errors, warnings


def write_report(out: Path, rows: list[dict], errors: list[str], warnings: list[str]) -> None:
    out.mkdir(parents=True, exist_ok=True)
    data = {"count": len(rows), "source_baseline": "public/makeup/looks/no-makeup.webp",
            "photo_quality_approved": False,
            "errors": errors, "warnings": warnings, "styles": rows}
    (out / "catalog-audit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# H-Beauty catalog reference audit", "",
             "**This audit does not approve photorealism or correct makeup styling.**",
             "The old 'no-makeup' photo is NOT a verified cosmetic-free reference.", "",
             f"Styles: {len(rows)} · Structural errors: {len(errors)}", ""]
    lines.extend(f"- ERROR: {msg}" for msg in errors)
    lines.extend(f"- NOTE: {msg}" for msg in warnings)
    lines += ["", "| Style ID | Max eye/lips/cheek change (RGB 0–255) | Hair drift | Background drift | Flags |",
              "|---|---:|---:|---:|---|"]
    for row in rows:
        r = row.get("regions", {})
        max_hair = max(r.get("hair_right", 0), r.get("hair_bottom_left", 0))
        flags = "; ".join(row["warnings"]) or "Visual approval pending"
        lines.append(f"| {row['id']} | {row.get('max_region_change', 0):.1f} | "
                     f"{max_hair:.1f} | {r.get('background_left', 0):.1f} | {flags} |")
    (out / "catalog-audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT / "catalog-audit-output")
    parser.add_argument("--require-v2", action="store_true", help="Require a distinct, correctly sized neutral bare reference")
    args = parser.parse_args()
    rows, errors, warnings = audit(require_v2=args.require_v2)
    write_report(args.out, rows, errors, warnings)
    print(f"Audited {len(rows)} styles; {len(errors)} structural errors; "
          f"{sum(len(r['warnings']) for r in rows)} review flags")
    for issue in errors:
        print("ERROR:", issue, file=sys.stderr)
    sys.exit(1 if errors else 0)
