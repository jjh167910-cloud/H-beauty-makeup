#!/usr/bin/env python3
"""Refine a coarse SAME-PHOTO lip mask using that photograph's visible edges.

A MediaPipe face landmark polygon is a geometric approximation, and often
bleeds onto the skin immediately above/below lipstick. This script uses a
conservative, opt-in GrabCut foreground/background segmentation inside the
already-validated lip region. It CANNOT extend the permitted makeup mask;
nothing outside the original polygon will become editable.

This is a research *mask refinement* tool, not lip-product transfer or a
guarantee of subpixel lip segmentation. Source lips can be low contrast,
occluded, brightly illuminated, or covered in existing makeup: an artist
must inspect every output, especially mouth corners and the cupid's bow.

    python scripts/quality/refine_photo_lips.py \
      --source source.png --coarse lips.png --out research/lip-refinement

Never send source/user photos or masks to hosted endpoints.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from audit_pixel_locked_look import load_rgb

MIN_AREA_FRACTION = 0.45
MAX_AREA_FRACTION = 1.0
MAX_SAFE_CROP = 30


def refine(photo: Path, coarse: Path, out: Path, erode: int = 3,
           dilation: int = 7, iterations: int = 5) -> dict:
    out.mkdir(parents=True,exist_ok=True)
    for stale in ("refined-lips.png", "lip-refinement-report.json",
                  "lip-region-edges.png"):
        (out/stale).unlink(missing_ok=True)
    if not (1 <= erode <= 9 and 3 <= dilation <= 20
            and 2 <= iterations <= 10):
        raise ValueError("Unsupported lip-segmentation parameters")
    src=load_rgb(photo)
    w,h=src.size
    with Image.open(coarse) as mm:
        if mm.mode not in ("L", "1") or mm.size != src.size:
            raise ValueError("Coarse lip mask must be grayscale at exact source dimensions")
        safe=np.asarray(mm.convert("L"),dtype=np.uint8)>0
    pixels=int(np.count_nonzero(safe))
    if pixels<40 or pixels>=w*h*.08:
        raise ValueError("Invalid coarse lips coverage")
    yy,xx=np.where(safe)
    x0=max(0,int(xx.min())-MAX_SAFE_CROP)
    y0=max(0,int(yy.min())-MAX_SAFE_CROP)
    x1=min(w,int(xx.max())+MAX_SAFE_CROP+1)
    y1=min(h,int(yy.max())+MAX_SAFE_CROP+1)
    if x0==0 or y0==0 or x1==w or y1==h:
        raise ValueError("Lip mask touches photo border")
    mask_roi=safe[y0:y1,x0:x1].astype(np.uint8)
    ker=np.ones((3,3),np.uint8)
    # Distance-based foreground seeds are restricted to the inner lip
    # interior. A fixed 3-px erosion of an oversized landmark polygon can
    # leave surrounding cheek skin as "sure foreground", preventing GrabCut
    # from correcting an obviously incorrect lip border.
    distance=cv2.distanceTransform(mask_roi,cv2.DIST_L2,5)
    positive=distance[mask_roi>0]
    foreground_depth=max(float(erode),float(np.percentile(positive,75)))
    core=(distance>=foreground_depth)&(mask_roi>0)
    expanded=cv2.dilate(mask_roi,ker,iterations=dilation)>0
    if int(core.sum())<20:
        raise ValueError("Lips are too small to supply secure foreground seeds")

    # Authoritative outer boundary: landmark safety mask. The dilation
    # ring is a probable background zone to learn actual surrounding skin,
    # not a license to expand cosmetic paint onto that skin.
    label=np.full(mask_roi.shape,cv2.GC_BGD,dtype=np.uint8)
    label[expanded]=cv2.GC_PR_BGD
    label[mask_roi>0]=cv2.GC_PR_FGD
    label[core]=cv2.GC_FGD
    rgb=np.asarray(src,dtype=np.uint8)
    crop=np.ascontiguousarray(rgb[y0:y1,x0:x1,::-1])
    back=np.zeros((1,65),dtype=np.float64)
    fore=np.zeros((1,65),dtype=np.float64)
    cv2.grabCut(crop,label,None,back,fore,iterations,cv2.GC_INIT_WITH_MASK)
    found=(label==cv2.GC_FGD)|(label==cv2.GC_PR_FGD)
    found &= mask_roi>0
    # Preserve lip material around certainty seeds but NEVER revive pixels
    # outside the source's allowed outer ring.
    found |= core
    frac=float(found.sum()/pixels)
    if not (MIN_AREA_FRACTION<=frac<=MAX_AREA_FRACTION):
        raise ValueError(f"Image-guided lip refinement rejected: retained {frac:.1%} of source mask")

    # Soft outlines are authored by the subsequent material renderer's
    # inward feather; this file remains a strict binary safety region.
    refined=np.zeros((h,w),dtype=np.uint8)
    refined[y0:y1,x0:x1]=found.astype("uint8")*255
    if np.any((refined>0)&~safe):
        raise AssertionError("Image-guided segmentation escaped approved lip region")
    target=out/"refined-lips.png"
    Image.fromarray(refined,"L").save(target)
    # Review image: green outlines = coarse, magenta = retained/photo guided.
    color=np.array(src,dtype=np.uint8).copy()
    old_edge=(safe ^ (cv2.erode(safe.astype("uint8"),ker,iterations=1)>0))
    new_edge=(refined>0)^(cv2.erode((refined>0).astype("uint8"),ker,iterations=1)>0)
    color[old_edge]=np.array([35,240,120],dtype=np.uint8)
    color[new_edge]=np.array([248,25,170],dtype=np.uint8)
    Image.fromarray(color,"RGB").save(out/"lip-region-edges.png")
    report={
        "engineering_preflight_passed":True,"approved_for_catalog":False,
        "requires_artist_review":True,
        "source_sha256":sha256(photo.read_bytes()).hexdigest(),
        "coarse_mask_sha256":sha256(coarse.read_bytes()).hexdigest(),
        "refined_mask_sha256":sha256(target.read_bytes()).hexdigest(),
        "source_dimensions":[w,h],"coarse_pixels":pixels,
        "refined_pixels":int(found.sum()),
        "retention_percent":round(frac*100,3),
        "added_outside_original_mask":0,
        "notes":[
            "Lip boundaries on source already wearing makeup do not establish bare-face ground truth",
            "Color-based refinement can misclassify shadow, lip gloss and teeth",
            "Inspect natural cupid's bow, corners and dark mouth gap at 100-200% zoom",
            "Photorealistic lipstick requires genuinely accurate source-specific lip texture/materials"
        ],
    }
    (out/"lip-refinement-report.json").write_text(
        json.dumps(report,indent=2)+"\n",encoding="utf8")
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--coarse",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    args=p.parse_args()
    print(json.dumps(refine(args.source,args.coarse,args.out),indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
