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
LIPS = [(355,619),(364,611),(380,604),(401,596),(422,591),(443,593),
        (465,600),(475,601),(491,597),(515,590),(537,594),(553,603),
        (562,614),(552,623),(543,634),(526,648),(503,660),(481,665),
        (454,668),(427,667),(406,662),(390,654),(376,644),(361,635)]
EYE_LEFT = [(258,404),(265,386),(279,375),(300,369),(327,371),(347,378),
            (369,390),(385,404),(374,399),(356,393),(336,390),
            (317,389),(295,393),(275,402)]
EYE_RIGHT = [(470,383),(482,367),(500,353),(525,345),(556,345),
             (583,350),(610,362),(637,378),(621,375),(599,370),
             (579,366),(555,364),(535,364),(514,369),(490,380)]
CREASE_LEFT = [(254,404),(268,387),(294,381),(321,382),(352,390),
               (380,405),(372,399),(347,394),(320,391),(286,397),(264,411)]
CREASE_RIGHT = [(473,383),(490,372),(522,362),(554,360),
                (589,364),(636,381),(623,373),(594,369),
                (567,365),(535,367),(500,380)]
LINE_LEFT = [(259,410),(278,403),(298,396),(319,394),(341,395),(363,402),(383,412)]
LINE_RIGHT = [(477,393),(499,380),(528,370),(554,366),(580,369),(604,378),(626,388)]


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
    lids=joined(shape(EYE_LEFT,1.2),shape(EYE_RIGHT,1.2))
    crease=joined(shape(CREASE_LEFT,1),shape(CREASE_RIGHT,1))
    blush=joined(cheek((245,464,370,600),16),
                 cheek((530,430,700,582),19))
    lips=shape(LIPS,.45)
    blue_inner=joined(
        shape([(333,373),(351,379),(375,391),(384,404),
               (373,400),(353,394),(328,390),(316,390)],1),
        shape([(473,384),(481,366),(497,355),(522,348),
               (533,365),(511,370),(490,383)],1))
    blue_outer=joined(
        shape([(259,403),(267,385),(283,374),(304,371),(330,374),
               (315,391),(290,397),(266,410)],1),
        shape([(524,348),(556,343),(591,350),(618,363),(638,378),
               (618,374),(585,366),(556,365),(534,366)],1))
    wing=lines([(LINE_LEFT,3.8),(LINE_RIGHT,4.0),
                ([(262,409),(250,396)],2.4), ([(623,386),(643,377)],2.5)])
    graphic=lines([(LINE_LEFT,4.2),(LINE_RIGHT,4.1),
                   ([(261,406),(241,388)],4.2),([(625,387),(649,374)],4.6)])
    fine=lines([(LINE_LEFT,2.2),(LINE_RIGHT,2.3)])
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
            array=np.asarray(mask,dtype=np.uint8)
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
