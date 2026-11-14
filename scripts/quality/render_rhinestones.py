#!/usr/bin/env python3
"""Render tiny, locally lit faceted cosmetic rhinestones on a FROZEN photograph.

This is a deterministic pixel-locked accessory *research renderer*, not a
claim of physically exact gem optics. Placement is explicit and source-hash
locked. Never regenerate the rest of the face to add a gem.

    python scripts/quality/render_rhinestones.py --source input.png \
      --recipe rhinestone-placement.json --out research/rhinestone-gems

The source must be an opaque sRGB RGB/RGBA image; a non-sRGB ICC is rejected.
Only the small gem footprints/shadows may change. Both image and a binary union
mask are produced, and non-accessory pixels are compared byte-for-byte.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageFilter

from audit_pixel_locked_look import load_rgb

STYLES_WITH_GEMS = frozenset({"rhinestone"})
MAX_GEMS = 12
SCALE = 6


def finite(value: object, key: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{key} must be a number")
    num = float(value)
    if not math.isfinite(num) or not low <= num <= high:
        raise ValueError(f"{key} must be within [{low}, {high}]")
    return num


def validate_srgb(path: Path) -> bytes | None:
    with Image.open(path) as im:
        raw = im.info.get("icc_profile")
    if raw is None:
        return None
    try:
        profile = ImageCms.ImageCmsProfile(BytesIO(raw))
        name = ImageCms.getProfileName(profile).lower()
    except (OSError, ValueError, TypeError) as exc:
        raise ValueError(f"Invalid source ICC profile: {exc}") from exc
    if "srgb" not in name:
        raise ValueError(f"Convert {name.strip()!r} source ICC to sRGB before adding gems")
    return raw


def recipe_check(recipe: object, image_sha: str, width: int, height: int) -> tuple[list[dict], tuple[float, float, float, float]]:
    if not isinstance(recipe, dict) or recipe.get("style_id") not in STYLES_WITH_GEMS:
        raise ValueError("Accessory gems permitted only for an explicitly listed rhinestone style")
    if recipe.get("source_sha256") != image_sha:
        raise ValueError("Frozen source SHA256 does not match placement recipe")
    if recipe.get("source_dimensions") != [width, height]:
        raise ValueError("Placement must match the exact frozen source dimensions")
    box = recipe.get("allowed_skin_box")
    if not isinstance(box, list) or len(box) != 4:
        raise ValueError("Explicit four-value normalized allowed_skin_box required")
    x0,y0,x1,y1 = [finite(v, "allowed_skin_box", 0.0, 1.0) for v in box]
    if not x0 < x1 or not y0 < y1 or (x1-x0)*(y1-y0) > 0.03:
        raise ValueError("Skin box must be small and ordered; never cover a whole face")
    gems = recipe.get("gems")
    if not isinstance(gems, list) or not 2 <= len(gems) <= MAX_GEMS:
        raise ValueError("Expect 2-12 explicitly positioned tiny rhinestones")
    seen: list[tuple[float,float,float]] = []
    checked = []
    for i,g in enumerate(gems):
        if not isinstance(g,dict):
            raise ValueError(f"gem #{i}: expected object")
        x=finite(g.get("x"),f"gem#{i}.x",0,width)
        y=finite(g.get("y"),f"gem#{i}.y",0,height)
        r=finite(g.get("radius_px"),f"gem#{i}.radius_px",1.8,9.0)
        angle=finite(g.get("angle_deg",0),f"gem#{i}.angle_deg",-180,180)
        # Bound the complete supersampled sprite, including Gaussian contact
        # shadow; validating only the glass radius would allow soft shadow
        # pixels to leak beyond the user-reviewed skin placement rectangle.
        extent = math.ceil(r * 3.5 + 4)
        if not ((x0*width + extent) <= x <= (x1*width - extent)
                and (y0*height + extent) <= y <= (y1*height - extent)):
            raise ValueError(f"gem #{i}: footprint extends outside reviewed skin-only box")
        if any(math.hypot(x-px,y-py) < (r+pr)*0.85 for px,py,pr in seen):
            raise ValueError(f"gem #{i}: collision or near-overlap with another stone")
        seen.append((x,y,r))
        checked.append({"x":x,"y":y,"r":r,"angle":angle})
    return checked,(x0,y0,x1,y1)


def stone_sprite(radius: float, angle: float, skin_rgb: tuple[int,int,int]) -> Image.Image:
    """Supersampled 8-facet crystal, contact shadow and restrained highlight."""
    extent = math.ceil(radius*3.5 + 4)
    n = extent*2+1
    scale = SCALE
    side=n*scale
    cx=cy=side/2
    r=radius*scale
    skin_luma = float(np.dot(np.array(skin_rgb, dtype=float), [0.2126,0.7152,0.0722]))/255
    # Drop shadow is only a few pixels and slightly displaced toward lower right.
    shadow=Image.new("RGBA",(side,side),(0,0,0,0))
    d=ImageDraw.Draw(shadow)
    shift=0.95*scale
    d.ellipse((cx-r*1.1+shift,cy-r*.80+shift,cx+r*1.1+shift,cy+r*.80+shift),
              fill=(30,22,30,int(68*(.65+skin_luma*.35))))
    shadow=shadow.filter(ImageFilter.GaussianBlur(.66*scale))
    stone=Image.new("RGBA",(side,side),(0,0,0,0))
    d=ImageDraw.Draw(stone)
    rad=math.radians(angle)
    outer=[(cx+r*math.cos(rad+k*math.pi/4),cy+r*.94*math.sin(rad+k*math.pi/4))
           for k in range(8)]
    # Thin silver-toned setting edge; actual reflective body is subdivided
    # into facets with varied transmission, not a white painted circle.
    d.polygon(outer,fill=(91,89,106,221))
    inner_r=.84*r
    inner=[(cx+inner_r*math.cos(rad+k*math.pi/4),
            cy+inner_r*.94*math.sin(rad+k*math.pi/4)) for k in range(8)]
    palette=[(234,245,252,236),(159,172,192,220),(246,247,252,238),
             (112,128,159,211),(213,225,236,228),(105,116,144,226),
             (246,249,252,242),(165,183,207,215)]
    center=(cx-.15*r,cy-.14*r)
    for k in range(8):
        d.polygon((center,inner[k],inner[(k+1)%8]),fill=palette[k])
    # Internal face and discrete glints; use a realistic short highlight
    # rather than a starburst whose four arms look like an emoji.
    d.polygon(((cx-.31*r,cy-.40*r),(cx+.10*r,cy-.48*r),
               (cx+.03*r,cy-.08*r),(cx-.28*r,cy-.12*r)),fill=(255,255,255,240))
    d.ellipse((cx-.34*r,cy-.54*r,cx-.19*r,cy-.39*r),fill=(255,255,255,250))
    out=Image.alpha_composite(shadow,stone)
    return out.resize((n,n),Image.Resampling.LANCZOS)


def render(source_path: Path, recipe_path: Path, out: Path) -> dict:
    out.mkdir(parents=True,exist_ok=True)
    for relative in ("rhinestone-accessories.png","rhinestone-allowed-mask.png",
                     "rhinestone-qa.json","accessories-qa-overlay.png"):
        (out/relative).unlink(missing_ok=True)
    source=load_rgb(source_path)
    profile=validate_srgb(source_path)
    digest=sha256(source_path.read_bytes()).hexdigest()
    width,height=source.size
    recipe=json.loads(recipe_path.read_text(encoding="utf8"))
    gems,box=recipe_check(recipe,digest,width,height)
    original=np.asarray(source,dtype=np.uint8)
    canvas=source.convert("RGBA")
    changed=Image.new("L",source.size,0)
    placements=[]
    for g in gems:
        x,y,r=g["x"],g["y"],g["r"]
        ix,iy=int(round(x)),int(round(y))
        skin=tuple(int(v) for v in original[iy,ix])
        sprite=stone_sprite(r,g["angle"],skin)
        left=int(round(x-sprite.width/2))
        top=int(round(y-sprite.height/2))
        # The sprite can only affect the reviewed skin box, not iris, hair,
        # earrings, or background. The allowed box is author-provided and
        # must be verified visually, not presumed from numeric coordinates.
        alpha=sprite.getchannel("A")
        canvas.alpha_composite(sprite,(left,top))
        changed.paste(alpha.point(lambda a:255 if a>0 else 0),(left,top))
        placements.append({"center":[x,y],"radius_px":r,"angle_deg":g["angle"]})
    result=canvas.convert("RGB")
    output=np.asarray(result,dtype=np.uint8)
    approved=np.asarray(changed,dtype=np.uint8)>0
    violation=int(np.count_nonzero(np.any(original[~approved]!=output[~approved],axis=1)))
    if violation:
        raise AssertionError(f"{violation} unauthorized image pixels changed outside gems")
    touched=int(np.count_nonzero(np.any(original[approved]!=output[approved],axis=1)))
    coverage=float(np.mean(approved))
    if not touched or coverage>=.005:
        raise ValueError("Gemstones missing or implausibly cover too much of the portrait")
    path=out/"rhinestone-accessories.png"
    result.save(path,**({"icc_profile":profile} if profile else {}))
    changed.save(out/"rhinestone-allowed-mask.png")
    report={"style_id":"rhinestone","status":"research-only",
            "approved_for_catalog":False,"requires_artist_review":True,
            "source_sha256":digest,"render_sha256":sha256(path.read_bytes()).hexdigest(),
            "source_dimensions":[width,height],
            "gem_count":len(gems),"placement_box":list(box),
            "changed_outside_mask_pixels":violation,"changed_inside_mask_pixels":touched,
            "image_coverage_percent":round(100*coverage,5),
            "stones":placements,
            "warnings":["Tiny facets and shadows are optical approximations, not measured gems.",
                        "Confirm correct gem location and skin contact at 100% and 200% zoom.",
                        "The supplied photo may be synthetic; no bare-face provenance inferred.",
                        "Gems do not certify realistic mascara, lashes, eyeliner or underlying makeup."]}
    (out/"rhinestone-qa.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    return report


def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True,type=Path)
    p.add_argument("--recipe",required=True,type=Path)
    p.add_argument("--out",required=True,type=Path)
    a=p.parse_args()
    print(json.dumps(render(a.source,a.recipe,a.out),indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
