#!/usr/bin/env python3
"""Generate A/B evidence for opt-in V5 vs legacy cosmetic materials.

Runs on a public, existing catalog photo only in CI. Both variants use the
EXACT same original photo and SAME source-linked geometry; only the material
model changes. Results must not be promoted to the luxury catalog.

    python scripts/quality/compare_material_v5.py \
      --photo public/makeup/looks/no-makeup.webp \
      --drafts /tmp/public-example-four-pilot-masks \
      --out /tmp/v5-material-study

Run on private customer photos ONLY in a private local environment. Do not
upload private portraits, hash-derived identity or landmarks as CI artifacts.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from author_mesh_pilot_masks import PILOTS
from render_material_look import render

COL_W, COL_H = 345, 470
INK, BACKGROUND = "#292629", "#f5f3ef"


def label_font(size):
    for font in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                 "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"):
        if Path(font).is_file():
            return ImageFont.truetype(font, size)
    return ImageFont.load_default()


def read_rgb(path: Path) -> Image.Image:
    with Image.open(path) as f:
        return f.convert("RGB")


def source_crop(mask_files: list[Path], size: tuple[int, int]) -> tuple[int,int,int,int] | None:
    boxes = []
    for p in mask_files:
        if p.is_file():
            with Image.open(p) as im:
                if im.size != size:
                    raise ValueError("All local cosmetics masks must match the original photo")
                bbox = im.convert("L").getbbox()
            if bbox:
                boxes.append(bbox)
    if not boxes:
        return None
    x0=min(x[0] for x in boxes);y0=min(x[1] for x in boxes)
    x1=max(x[2] for x in boxes);y1=max(x[3] for x in boxes)
    margin=max(18,int(max(x1-x0,y1-y0)*.32))
    return (max(0,x0-margin),max(0,y0-margin),
            min(size[0],x1+margin),min(size[1],y1+margin))


def contact_sheet(original: Image.Image, legacy: dict, variant: dict,
                  out: Path) -> None:
    board=Image.new("RGB",(COL_W*3,COL_H*len(PILOTS)+65),BACKGROUND)
    pen=ImageDraw.Draw(board)
    title=label_font(22);caption=label_font(18)
    for col,name in enumerate(("SAME PUBLIC SOURCE", "LEGACY MATERIAL", "V5 SOURCE RELIEF")):
        pen.text((col*COL_W+12,15),name,font=caption,fill=INK)
    for row,sid in enumerate(PILOTS):
        sources=[original,legacy[sid],variant[sid]]
        for col,im in enumerate(sources):
            fitted=ImageOps.contain(im,(COL_W-10,COL_H-65),Image.Resampling.LANCZOS)
            x=col*COL_W+(COL_W-fitted.width)//2
            y=65+row*COL_H+(COL_H-65-fitted.height)//2
            board.paste(fitted,(x,y))
        pen.text((12,70+row*COL_H),sid.upper(),font=title,fill=INK)
    board.save(out/"before-after-v5-contact-sheet.jpg",quality=92,subsampling=0)


def detail_board(sid: str, master: Image.Image, old: Image.Image, new: Image.Image,
                 folder: Path, out: Path):
    masks=list((folder/"masks").glob("*.png"))
    eyes=[p for p in masks if any(k in p.stem for k in ("lid","liner","wing","cobalt","blue"))]
    lips=[p for p in masks if "lip" in p.stem]
    strip_h=380
    board=Image.new("RGB",(450*3,strip_h*2+60),BACKGROUND)
    d=ImageDraw.Draw(board)
    for row,section in enumerate((eyes,lips)):
        crop=source_crop(section,master.size)
        if crop is None:
            continue
        for col,im in enumerate((master,old,new)):
            part=im.crop(crop)
            fit=ImageOps.contain(part,(430,345),Image.Resampling.LANCZOS)
            x=col*450+(450-fit.width)//2
            y=40+row*strip_h+(345-fit.height)//2
            board.paste(fit,(x,y))
        d.text((14,45+row*strip_h),
               "EYES" if row==0 else "LIPS",font=label_font(18),fill=INK)
    for col,text in enumerate(("Original","Legacy","V5")):
        d.text((col*450+170,12),text,font=label_font(17),fill=INK)
    board.save(out/f"{sid}-eyes-lips-review.jpg",quality=93,subsampling=0)


def compare(photo: Path, drafts: Path, out: Path) -> dict:
    out.mkdir(parents=True,exist_ok=True)
    source=read_rgb(photo)
    original_sha=sha256(photo.read_bytes()).hexdigest()
    old,updated={},{}
    report={"photo_source":"public-existing-catalog-made-up",
            "photo_sha256":original_sha,
            "source_size":list(source.size),
            "synthetic_or_painted_appearance_approval":False,
            "full_catalog_style_fidelity":False,
            "styles":{}}
    for sid in PILOTS:
        folder=drafts/sid
        config=folder/f"{sid}.json"
        recipe=json.loads(config.read_text(encoding="utf8"))
        if recipe.get("source_sha256") != original_sha:
            raise ValueError(f"{sid}: source hash mismatch")
        # Always render the legacy baseline from the SAME current recipe,
        # exact source and same masks. A cached old PNG can silently compare
        # different pigment strengths/geometry instead of two material modes.
        legacy_dir=out/"legacy"/sid
        render(photo,config,legacy_dir)
        legacy=read_rgb(legacy_dir/"material-render.png")
        enhanced=json.loads(json.dumps(recipe))
        for layer in enhanced["layers"]:
            kind=layer["name"].lower()
            if "lip" in kind or "gloss" in kind:
                layer["appearance_model"]="source-relief-v5"
                layer["tone"]=.92
            elif "lid" in kind or "blue" in kind:
                layer["appearance_model"]="source-relief-v5"
                layer["tone"]=1.02
            # Keep liner geometry and opacity unchanged: photographic
            # root geometry is the artist/landmark input, not a novel shader.
            else:
                layer["appearance_model"]="legacy"
        destination=out/sid
        destination.mkdir(parents=True,exist_ok=True)
        recipe_v5=folder/f"{sid}-v5.json"
        recipe_v5.write_text(json.dumps(enhanced,indent=2)+"\n",encoding="utf8")
        try:
            result=render(photo,recipe_v5,destination/"rendered")
        finally:
            recipe_v5.unlink(missing_ok=True)
        if result["changed_outside_cosmetic_mask"] != 0:
            raise AssertionError("Photographic source changed outside cosmetic masks")
        new=read_rgb(destination/"rendered/material-render.png")
        old[sid],updated[sid]=legacy,new
        before=np.asarray(legacy,dtype=np.int16)
        after=np.asarray(new,dtype=np.int16)
        mask=np.asarray(Image.open(destination/"rendered/approved-region-union.png"))>0
        diff=np.max(np.abs(before-after),axis=2)
        report["styles"][sid]={
            "changed_v5_vs_legacy_inside_masks":int(np.count_nonzero(diff[mask])),
            "changed_v5_vs_legacy_outside_masks":int(np.count_nonzero(diff[~mask])),
            "mean_channel_delta_inside_masks":round(float(np.mean(np.abs(before[mask]-after[mask]))),3),
            "v5_pixel_locked":result["changed_outside_cosmetic_mask"]==0,
            "artist_approved":False,
            "limitations":[
                "The public sample already contains cosmetics.",
                "No physically measured pigment reflectance.",
                "This does not add realistic new false lashes or reflective rhinestones.",
                "Numeric mask fidelity alone is not luxury photographic approval.",
            ]
        }
        if report["styles"][sid]["changed_v5_vs_legacy_outside_masks"]:
            raise AssertionError(f"{sid}: variant changed noncosmetic source pixels")
        detail_board(sid,source,legacy,new,folder,out)
    contact_sheet(source,old,updated,out)
    (out/"review-report.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8"
    )
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--photo",type=Path,required=True)
    p.add_argument("--drafts",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    args=p.parse_args()
    r=compare(args.photo,args.drafts,args.out)
    print(f"Compared {len(r['styles'])} source-locked V5 material candidates; none approved.")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
