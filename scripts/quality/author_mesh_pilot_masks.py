#!/usr/bin/env python3
"""Generate reviewable cosmetic masks from a SAME-PHOTO 478-point face mesh.

This is an offline draft-mask author, not a trained segmentation system or
finished beauty makeover. Each mask is clipped to anatomical safe regions.
The tool must be run for EACH new source portrait; never reuse its outputs
on a different person's photograph.

  python scripts/quality/detect_source_face.py \
    --photo /private/bare-master.png --out /private/face-landmarks.json
  python scripts/quality/author_mesh_pilot_masks.py \
    --photo /private/bare-master.png \
    --landmarks /private/face-landmarks.json \
    --out /private/qa-four-pilots

Only the mask geometry, draft metadata and reviewed same-source cosmetics are
eligible for human review. This tool never uploads private face data.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from audit_landmark_masks import (
    EYE_L, EYE_R, BROW_L, BROW_R,
    anatomy_regions, checked_json, checked_mesh, shrink,
    audit as audit_anatomy,
)

PILOTS = ("no-makeup", "hollywood", "electric-blue", "rhinestone")


def grayscale(binary: np.ndarray) -> Image.Image:
    return Image.fromarray((binary.astype("uint8") * 255), "L")


def shadow_band(
    points: np.ndarray, eye: tuple[int, ...],
    brow: tuple[int, ...], size: tuple[int, int],
) -> np.ndarray:
    """Upper-lid SKIN band, bounded between the actual lash curve and brow.

    No rectangular masks. Upper edge follows 24% of the available skin
    between upper lash contour and eyebrow; lower edge hugs the lash roots.
    Color feathering happens later, inward only.
    """
    w, h = size
    arc = points[np.array(eye[:9])]
    brow_y = float(np.mean(points[np.array(brow), 1]))
    if len(arc) < 4:
        raise ValueError("Upper eyelid arc has insufficient landmarks")
    offsets = np.clip((arc[:, 1] - brow_y) * .24, max(1, w * .0006), max(3, w * .013))
    high = np.column_stack([arc[:, 0], arc[:, 1] - offsets])
    xy = [tuple(p) for p in high] + [tuple(p) for p in arc[::-1]]
    im = Image.new("L", size, 0)
    ImageDraw.Draw(im).polygon(xy, fill=255)
    return np.asarray(im, dtype=np.uint8) > 0


def liner_band(
    points: np.ndarray, eye: tuple[int, ...], size: tuple[int, int],
) -> np.ndarray:
    w, h = size
    curve = points[np.array(eye[:9])]
    width = float(np.linalg.norm(points[eye[0]] - points[eye[8]]))
    stroke_width = max(1, int(round(width * .018)))
    im = Image.new("L", size, 0)
    d = ImageDraw.Draw(im)
    d.line([tuple(p) for p in curve], fill=255, width=stroke_width, joint="curve")
    # A genuinely short, connected flick at the outside canthus; no floating
    # second eyeliner along the eyelid/eyebrow.
    outer = points[eye[0]]
    inner = points[eye[8]]
    direction = float(np.sign(outer[0] - inner[0]))
    tip = (outer[0] + direction * width * .11, outer[1] - width * .055)
    d.line([tuple(outer), tuple(tip)], fill=255, width=stroke_width)
    return np.asarray(im, dtype=np.uint8) > 0


def draft_regions(points: np.ndarray, size: tuple[int, int]) -> dict[str, np.ndarray]:
    safe = anatomy_regions(points, size)
    shadow = (
        shadow_band(points, EYE_R, BROW_R, size)
        | shadow_band(points, EYE_L, BROW_L, size)
    )
    shadow &= safe["shadow"]
    shadow &= ~safe["protected_eyes"]
    # Erode the lip contour slightly to preserve the photograph's original
    # vermilion-skin transition, never paint the inner mouth opening.
    lips = shrink(safe["lips"], 2) & ~safe["protected_mouth"]
    liner = (
        liner_band(points, EYE_R, size)
        | liner_band(points, EYE_L, size)
    )
    liner &= safe["liner"] & ~safe["protected_eyes"]
    # Eye pigments split by horizontal position INSIDE the lid mask.
    y, x = np.indices((size[1], size[0]))
    rx = float(np.mean(points[np.array(EYE_R[:9]), 0]))
    lx = float(np.mean(points[np.array(EYE_L[:9]), 0]))
    # "Inner" versus "outer" means towards the nose (image midpoint),
    # independent of which side is closer to the camera.
    centre = (rx + lx) / 2
    inner = shadow.copy()
    outer = shadow.copy()
    mid_r = (float(points[EYE_R[0], 0]) + float(points[EYE_R[8], 0])) / 2
    mid_l = (float(points[EYE_L[0], 0]) + float(points[EYE_L[8], 0])) / 2
    right_zone = x >= centre
    for mid, zone in ((mid_r, ~right_zone), (mid_l, right_zone)):
        # Opaque binary geometry; material opacity is controlled by recipe.
        if mid < centre:
            inner &= ~zone | (x >= mid)
            outer &= ~zone | (x < mid)
        else:
            inner &= ~zone | (x <= mid)
            outer &= ~zone | (x > mid)
    return {
        "lips": lips, "shadow": shadow, "liner": liner,
        "blue_inner": inner, "blue_outer": outer,
    }


# Each generated recipe is a research subset of the source-of-truth catalog:
# cheek geometry, skin foundation, false lash replacements and rhinestones
# are intentionally NOT fabricated by this first-pass anatomical tool.
LAYERS = {
    "no-makeup": [
        ("subtle_lids", "shadow", "#c9a18c", .12, 2.0, "satin"),
        ("tinted_lip", "lips", "#c9877c", .22, 1.0, "gloss"),
    ],
    "hollywood": [
        ("soft_lids", "shadow", "#d8b08a", .18, 2.0, "satin"),
        ("short_wing", "liner", "#171314", .91, 0.0, "matte"),
        ("matte_red_lips", "lips", "#b3242f", .79, 1.0, "matte"),
    ],
    "electric-blue": [
        ("light_blue_lids", "blue_inner", "#4aa3f0", .53, 2.0, "satin"),
        ("cobalt_lids", "blue_outer", "#1d3fb8", .66, 2.0, "satin"),
        ("graphic_liner", "liner", "#1d3fb8", .92, 0.0, "matte"),
        ("nude_lips", "lips", "#b57a72", .27, 1.0, "satin"),
    ],
    "rhinestone": [
        ("lavender_lids", "shadow", "#dfc0e6", .35, 2.0, "satin"),
        ("precise_liner", "liner", "#251c22", .74, 0.0, "matte"),
        ("rose_gloss", "lips", "#c97a96", .48, 1.0, "gloss"),
    ],
}


def generate(photo: Path, landmarks: Path, out: Path) -> dict:
    with Image.open(photo) as im:
        w, h = im.size
    p = checked_mesh(checked_json(landmarks), photo, (w, h))
    regions = draft_regions(p, (w, h))
    if min(int(np.count_nonzero(regions[k])) for k in ("lips", "shadow", "liner")) < 10:
        raise ValueError("Detected anatomy too small or occluded; manually review landmarks")
    source_hash = sha256(photo.read_bytes()).hexdigest()
    out.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source_sha256": source_hash,
        "source_dimensions": [w,h],
        "face_mesh_sha256": sha256(landmarks.read_bytes()).hexdigest(),
        "derived_mask_status": "unapproved-source-specific-drafts",
        "artist_approved": False,
        "full_catalog_style_fidelity": False,
        "styles": {},
    }
    for sid in PILOTS:
        folder = out / sid
        masks = folder / "masks"
        masks.mkdir(parents=True, exist_ok=True)
        recipe = {"style_id": sid, "status": "incomplete-anatomical-preview",
                  "source_sha256": source_hash, "layers": []}
        spatial = {"masks": []}
        for label, region, color, alpha, feather, finish in LAYERS[sid]:
            filename = f"{label}.png"
            geometry = regions[region]
            if int(np.count_nonzero(geometry)) < 10:
                raise ValueError(f"{sid}.{label}: source anatomy too small for this cosmetic")
            grayscale(geometry).save(masks / filename)
            kind = "lips" if region=="lips" else "liner" if region=="liner" else "shadow"
            spatial["masks"].append({"kind":kind,"file":filename})
            recipe["layers"].append({
                "name":label,"mask":f"masks/{filename}",
                "pigment":color,"opacity":alpha,
                "texture_strength":.90 if kind=="lips" else .55,
                "feather_px":feather,"finish":finish,
                # Eyeliner is a second painted product on top of shadow:
                # declare overlap explicitly (never silently bypass guards).
                "allow_overlap": True if kind=="liner" else False,
            })
        # Audit's manifest-relative paths have no nested mask directories.
        (masks / "anatomy.json").write_text(
            json.dumps(spatial, indent=2)+"\n", encoding="utf8"
        )
        (folder / f"{sid}.json").write_text(
            json.dumps(recipe, indent=2)+"\n",encoding="utf8"
        )
        report = audit_anatomy(photo, landmarks, masks / "anatomy.json",
                               folder / "anatomy-qa")
        if not report["passed_anatomical_preflight"]:
            raise ValueError(f"{sid}: generated mask failed anatomy audit: {report['errors']}")
        manifest["styles"][sid] = {
            "layer_count": len(LAYERS[sid]),
            "anatomical_gate_passed": True,
            "artist_approved": False,
            "missing_features": ["expert-corrected face masks", "foundation/blush/false lashes",
                                 "genuine reflective rhinestones" if sid=="rhinestone" else "photographic finish validation"],
        }
    (out / "draft-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf8"
    )
    return manifest


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--photo",type=Path,required=True)
    p.add_argument("--landmarks",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--render-drafts", action="store_true",
                   help="Render local preliminary portraits from anatomy masks (never approved artwork)")
    args=p.parse_args()
    result=generate(args.photo,args.landmarks,args.out)
    if args.render_drafts:
        from render_material_look import render
        for sid in PILOTS:
            render(args.photo, args.out/sid/(sid+".json"),
                   args.out/sid/"rendered-research-only", premium=False)
        print("Four anatomy-linked research previews rendered locally; manual makeup review REQUIRED.")
    print(f"Generated {len(result['styles'])} unapproved pilot mask sets; original image not copied or uploaded.")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
