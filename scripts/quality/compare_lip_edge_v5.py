#!/usr/bin/env python3
"""Create Hollywood lipstick edge A/B evidence from an existing PUBLIC photo.

Performs a source-photo-guided correction to the landmark lip polygon,
composites the exact same cosmetic recipe and exports a four-way lip close-up:
source / legacy / V5 pigment / photo-guided V5. Research only.

No customer photo or source landmark file may enter a public CI artifact.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from refine_photo_lips import refine
from render_material_look import render


def compare(source: Path, drafts: Path, v5: Path, out: Path) -> dict:
    out.mkdir(parents=True,exist_ok=True)
    folder=drafts/"hollywood"
    recipe_path=folder/"hollywood.json"
    recipe=json.loads(recipe_path.read_text(encoding="utf8"))
    if recipe["source_sha256"]!=sha256(source.read_bytes()).hexdigest():
        raise ValueError("Photo and landmark-derived makeup style source hash mismatch")
    lip_layer=next(x for x in recipe["layers"] if "lip" in x["name"])
    lip_original=folder/lip_layer["mask"]
    masks=out/"mask-refinement"
    report=refine(source,lip_original,masks)
    # Research area is /tmp; never overwrite the original mask or recipe.
    # The material renderer requires masks within its recipe directory.
    copied=folder/"masks"/"photo-guided-lips-research.png"
    shutil.copyfile(masks/"refined-lips-alpha.png",copied)
    corrected=json.loads(json.dumps(recipe))
    for layer in corrected["layers"]:
        if "lip" in layer["name"]:
            layer["mask"]="masks/photo-guided-lips-research.png"
            layer["appearance_model"]="source-relief-v5"
            layer["tone"]=.86
            layer["feather_px"]=2.25
        elif "lid" in layer["name"]:
            layer["appearance_model"]="source-relief-v5"
            layer["tone"]=1.02
    run_cfg=folder/"hollywood-photo-guided-research.json"
    run_cfg.write_text(json.dumps(corrected,indent=2)+"\n",encoding="utf8")
    try:
        result=render(source,run_cfg,out/"photo-guided-render")
    finally:
        copied.unlink(missing_ok=True)
        run_cfg.unlink(missing_ok=True)
    if result["changed_outside_cosmetic_mask"]:
        raise AssertionError("Photo-guided lipstick changed protected pixels")
    src=Image.open(source).convert("RGB")
    before=Image.open(v5/"legacy/hollywood/material-render.png").convert("RGB")
    v5_image=Image.open(v5/"hollywood/rendered/material-render.png").convert("RGB")
    after=Image.open(out/"photo-guided-render/material-render.png").convert("RGB")
    with Image.open(lip_original) as im:
        bbox=im.getbbox()
    if not bbox:
        raise ValueError("No original lip reference for review")
    x0,y0,x1,y1=bbox
    margin=max(24,int(max(x1-x0,y1-y0)*.45))
    crop=(max(0,x0-margin),max(0,y0-margin),
          min(src.width,x1+margin),min(src.height,y1+margin))
    board=Image.new("RGB",(1600,520),"#f5f3ef")
    d=ImageDraw.Draw(board)
    for i,(image,label) in enumerate(zip(
        [src,before,v5_image,after],
        ["PUBLIC SOURCE","LEGACY LIPS","V5 PIGMENT","PHOTO-REFINED V5"]
    )):
        im=ImageOps.contain(image.crop(crop),(380,420),Image.Resampling.LANCZOS)
        board.paste(im,(i*400+(400-im.width)//2,65+(420-im.height)//2))
        d.text((i*400+20,20),label,fill="#222222")
    board.save(out/"hollywood-four-way-lips.jpg",quality=94,subsampling=0)
    result_report={
        "source":"existing public already-made-up catalog photograph",
        "photo_hash":sha256(source.read_bytes()).hexdigest(),
        "photo_guided_refinement":report,
        "pixel_lock_passed":result["changed_outside_cosmetic_mask"]==0,
        "approved_for_catalog":False,
        "artist_review_required":True,
        "notes":["GrabCut cannot reliably find every lip border on low contrast makeup-free lips",
                 "Inspect mouth opening, lip corners and cupid's bow at 200% zoom",
                 "Cannot claim premium-quality source-native photos or real makeup transfer"],
    }
    (out/"hollywood-photo-refinement-review.json").write_text(
        json.dumps(result_report,indent=2)+"\n",encoding="utf8")
    return result_report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--drafts",type=Path,required=True)
    p.add_argument("--v5",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    args=p.parse_args()
    compare(args.source,args.drafts,args.v5,args.out)
    print("One Hollywood photo-guided lip research comparison produced; NOT approved.")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
