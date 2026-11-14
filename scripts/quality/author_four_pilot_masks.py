#!/usr/bin/env python3
"""Experimental hand-anchored masks for four makeup pilot styles.

These coordinates belong to the same 1086x1448 synthetic editorial study
only. They are NOT general face landmarks or approved 2K catalog masks.
Every DIFFERENT model, source pose or crop must have masks re-authored.

Usage:
 python scripts/quality/author_four_pilot_masks.py --master photo.png \
   --expected-sha256 <sha256_of_exact_photo> --out research/four-pilots

Never commits photographs or generates deployment-ready catalog images.
"""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DIMENSIONS = (1086, 1448)
PILOTS = ("no-makeup", "hollywood", "electric-blue", "rhinestone")
# Source-specific V4 anatomical geometry. Visually inspected against the
# 1086x1448 original at 100-200% zoom. The previous single polygon started
# above the natural vermilion and flattened the mouth opening.
LIP_UP = [(368,637),(373,628),(385,618),(402,610),(420,606),
          (440,607),(460,608),(475,604),(489,603),(504,601),(519,605),
          (532,610),(543,616),(552,620),(554,623),(543,626),(520,630),
          (498,632),(473,636),(450,639),(425,639),(399,641),(380,640)]
LIP_LOW = [(369,643),(382,647),(400,648),(425,648),(448,647),(472,642),
           (496,638),(519,635),(540,629),(552,625),(545,637),
           (532,650),(515,662),(495,674),(476,680),(453,681),
           (432,680),(413,675),(393,666),(379,653)]
EYE_LEFT = [(260,402),(270,392),(287,385),(310,381),(333,379),
            (354,383),(370,393),(381,407),(367,400),(348,396),
            (325,393),(300,397),(282,404),(263,412)]
EYE_RIGHT = [(475,383),(489,371),(510,361),(533,355),(559,356),
             (584,362),(608,373),(632,386),(621,385),(596,377),
             (575,371),(551,370),(531,374),(509,380),(487,392)]
# Tighter outer-corner crease maps, never an eyebrow-to-lash rectangle.
CREASE_LEFT = [(262,402),(275,391),(291,386),(307,387),
               (324,394),(299,398),(277,408)]
CREASE_RIGHT = [(555,357),(580,360),(605,371),(630,384),
                (615,382),(587,375),(565,370)]
# The source already has visible lashes. Long secondary eyeliner strokes
# looked detached; paint only short tapered, canthus-connected flicks.
WING_LEFT = [(276,420),(260,416),(252,410),(247,406)]
WING_RIGHT = [(611,390),(625,395),(635,390),(640,385)]
BLUE_WING_LEFT = [(276,420),(262,417),(252,413),(246,408)]
BLUE_WING_RIGHT = [(611,390),(625,395),(638,391),(644,388)]

def spline(points, resolution=8):
    q = [points[0]] + points + [points[-1]]
    out = []
    for i in range(1, len(q)-2):
        p0,p1,p2,p3 = [np.array(q[j],dtype=float) for j in (i-1,i,i+1,i+2)]
        for t in np.linspace(0,1,resolution,endpoint=False):
            out.append(tuple(.5*(2*p1+(-p0+p2)*t+
                                  (2*p0-5*p1+4*p2-p3)*t*t+
                                  (-p0+3*p1-3*p2+p3)*t*t*t)))
    return out + [points[-1]]


def shape(points, blur=0, scale=3):
    im = Image.new("L", (DIMENSIONS[0]*scale, DIMENSIONS[1]*scale), 0)
    ImageDraw.Draw(im).polygon(
        [(round(x*scale),round(y*scale)) for x,y in spline(points)], fill=255)
    im = im.resize(DIMENSIONS, Image.Resampling.LANCZOS)
    return im.filter(ImageFilter.GaussianBlur(blur)) if blur else im


def cheek(xy, blur):
    im = Image.new("L", DIMENSIONS, 0)
    ImageDraw.Draw(im).ellipse(xy, fill=255)
    return im.filter(ImageFilter.GaussianBlur(blur))


def joined(*masks):
    a=np.maximum.reduce([np.asarray(mask) for mask in masks])
    return Image.fromarray(a.astype("uint8"),"L")


def lines(strokes):
    scale=3
    im=Image.new("L",(DIMENSIONS[0]*scale,DIMENSIONS[1]*scale),0)
    pen=ImageDraw.Draw(im)
    for points,width in strokes:
        pen.line([(round(x*scale),round(y*scale)) for x,y in spline(points)],
                 fill=255,width=max(1,round(width*scale)),joint="curve")
    return im.resize(DIMENSIONS,Image.Resampling.LANCZOS)


def build_masks():
    # Tight, source-locked cosmetic geometry; NEVER reuse on another model.
    lids_left = np.asarray(shape(EYE_LEFT, 1.7), dtype=np.float32)
    lids_right = np.asarray(shape(EYE_RIGHT, 1.7), dtype=np.float32)
    lids = Image.fromarray(np.maximum(lids_left,lids_right).astype("uint8"),"L")
    crease = joined(shape(CREASE_LEFT, 2),shape(CREASE_RIGHT, 2))
    blush = joined(cheek((269,478,365,584),11),
                   cheek((545,447,676,553),14))
    # Two anatomically aligned polygons preserve the untouched mouth seam.
    lips = joined(shape(LIP_UP,.55),shape(LIP_LOW,.55))
    yy,xx = np.mgrid[:DIMENSIONS[1],:DIMENSIONS[0]]
    # Soft two-tone blue gradient, not separate opaque polygon blocks.
    mix_left = np.clip((343-xx)/100.0,0,1)
    mix_right = np.clip((xx-500)/135.0,0,1)
    outer = np.clip(lids_left*mix_left + lids_right*mix_right,0,255)
    inner = np.clip(lids_left*(1-mix_left) + lids_right*(1-mix_right),0,255)
    blue_inner = Image.fromarray(inner.astype("uint8"),"L")
    blue_outer = Image.fromarray(outer.astype("uint8"),"L")
    wing = lines([(WING_LEFT,1.75),(WING_RIGHT,1.80)])
    graphic = lines([(BLUE_WING_LEFT,1.90),(BLUE_WING_RIGHT,1.85)])
    fine = lines([(WING_LEFT,1.20),(WING_RIGHT,1.25)])
    return {
        "no-makeup": {
            "no-makeup-lid-wash.png":lids,
            "no-makeup-cheeks.png":blush,
            "no-makeup-lips.png":lips,
        },
        "hollywood": {
            "hollywood-lid-wash.png":lids,
            "hollywood-lid-crease.png":crease,
            "hollywood-wing.png":wing,
            "hollywood-cheek.png":blush,
            "hollywood-lips.png":lips,
        },
        "electric-blue": {
            "electric-blue-inner-lid.png":blue_inner,
            "electric-blue-outer-lid.png":blue_outer,
            "electric-blue-graphic-liner.png":graphic,
            "electric-blue-lips.png":lips,
        },
        "rhinestone": {
            "rhinestone-lid-wash.png":lids,
            "rhinestone-outer-lid.png":crease,
            "rhinestone-liner.png":fine,
            "rhinestone-cheek.png":blush,
            "rhinestone-lips.png":lips,
        }
    }


def write_masks(master:Path, expected_sha256:str, out:Path):
    if not master.is_file():
        raise ValueError(f"Missing source {master}")
    digest=sha256(master.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError("Source does not match approved exact master SHA256")
    with Image.open(master) as im:
        if im.size != DIMENSIONS:
            raise ValueError(f"Study coordinates require {DIMENSIONS}, got {im.size}")
    masks=build_masks()
    report={"master_sha256":digest,"master_dimensions":DIMENSIONS,
            "native_2k_approved":False,"human_review":"pending",
            "marketing_source_is_synthetic":True,"production_ready":False,
            "styles":{}}
    for style_id, files in masks.items():
        folder=out/style_id/"masks"
        folder.mkdir(parents=True,exist_ok=True)
        records=[]
        for name,mask in files.items():
            array=np.array(mask,dtype=np.uint8,copy=True)
            array[array<2]=0
            Image.fromarray(array,"L").save(folder/name)
            records.append({"name":name,"covered_pixels":int(np.count_nonzero(array))})
        report["styles"][style_id]=records
    out.mkdir(parents=True,exist_ok=True)
    (out/"pilot-mask-manifest.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--master",type=Path,required=True)
    p.add_argument("--expected-sha256",required=True)
    p.add_argument("--out",type=Path,required=True)
    args=p.parse_args()
    data=write_masks(args.master,args.expected_sha256,args.out)
    print(f"Generated {len(data['styles'])} unapproved mask sets; source SHA verified.")


if __name__=="__main__":
    main()
