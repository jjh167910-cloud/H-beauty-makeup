#!/usr/bin/env python3
"""Reject cosmetic masks that miss the photographed person's own anatomy.

This is a reproducible, source-locked anatomical preflight, not an automatic
makeup generator or a photorealism certificate. The face-mesh coordinates must
come from the SAME source photograph, never a different catalog portrait.

The indices match the MediaPipe landmarks already used by makeup-gl.ts.
Landmark JSON example:
{
  "coordinate_space": "normalized", "face_count": 1,
  "source_sha256": "<exact master PNG checksum>",
  "dimensions": [2048,2732],
  "detection_confidence": 0.98,
  "points": [[x,y], ... at least 468 ordered landmarks ...]
}
Manifest JSON:
{"masks": [{"kind":"lips","file":"lips.png"},
           {"kind":"shadow","file":"shadow.png"},
           {"kind":"liner","file":"liner.png"}]}

This script does not store or upload a user's photograph or facial landmarks.
Do not commit face-specific landmark JSON from customer/user photos to GitHub.

python scripts/quality/audit_landmark_masks.py \
  --master master.png --landmarks face-mesh.json \
  --manifest masks.json --out review/anatomy --premium
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

LIPS_OUT = (61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146)
LIPS_IN = (78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95)
EYE_R = (33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7)
EYE_L = (263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249)
BROW_R = (70, 63, 105, 66, 107, 55, 65, 52, 53, 46)
BROW_L = (300, 293, 334, 296, 336, 285, 295, 282, 283, 276)
KINDS = frozenset(("lips", "shadow", "liner"))
# Expert review is still required. These safety thresholds are intentionally
# conservative; false negatives are preferable to mispainted eyes and mouths.
MAX_WRONG_ANATOMY_PIXELS = 2
MIN_FACE_DETECTION_CONFIDENCE = 0.80
MAX_MASK_FRACTION = {"lips": .025, "shadow": .09, "liner": .015}


def checked_json(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path.name}: expected a JSON object")
    return data


def checked_mesh(data: dict, master_path: Path, size: tuple[int, int]):
    w, h = size
    if data.get("source_sha256") != sha256(master_path.read_bytes()).hexdigest():
        raise ValueError("Face landmarks belong to a DIFFERENT source photograph")
    if data.get("dimensions") != [w, h]:
        raise ValueError("Face-landmark dimensions must match exact master dimensions")
    if data.get("coordinate_space") != "normalized":
        raise ValueError("Expected normalized x,y landmark coordinates")
    if data.get("face_count") != 1:
        raise ValueError("Exactly one detected face is required")
    # Some landmarkers provide a measured per-face confidence value. The
    # MediaPipe Tasks FaceLandmarker API does NOT expose that score in
    # FaceLandmarkerResult. It instead applies configured min-detection and
    # min-presence thresholds during inference. Validate which evidence we
    # genuinely have, without fabricating a numeric "measured" confidence.
    conf = data.get("detection_confidence")
    policy = data.get("detection_policy")
    if conf is not None:
        if (isinstance(conf, bool) or not isinstance(conf, (int, float))
                or not math.isfinite(conf) or conf < MIN_FACE_DETECTION_CONFIDENCE):
            raise ValueError("Measured face detection confidence is insufficient for anatomy QA")
    elif isinstance(policy, dict):
        max_faces = policy.get("max_faces_checked")
        if (policy.get("framework") != "mediapipe.tasks.vision.FaceLandmarker"
                or policy.get("running_mode") != "IMAGE"
                or isinstance(max_faces, bool)
                or not isinstance(max_faces, int) or max_faces < 2
                or policy.get("reported_per_face_confidence_available") is not False):
            raise ValueError("Unsupported or misrepresented face-landmark detection policy")
        for name in ("min_face_detection_confidence", "min_face_presence_confidence"):
            value = policy.get(name)
            if (isinstance(value, bool) or not isinstance(value, (int, float))
                    or not math.isfinite(value) or value < MIN_FACE_DETECTION_CONFIDENCE):
                raise ValueError(f"Face-landmark {name} threshold is insufficient")
    else:
        raise ValueError("No measured face confidence or auditable threshold configuration supplied")
    points = data.get("points")
    if not isinstance(points, list) or len(points) < 468:
        raise ValueError("Face mesh requires at least 468 ordered MediaPipe landmarks")
    a = np.asarray(points, dtype=np.float64)
    if a.ndim != 2 or a.shape[1] != 2 or not np.isfinite(a).all():
        raise ValueError("Malformed face-landmark coordinates")
    if (a < 0).any() or (a > 1).any():
        raise ValueError("Face-landmark coordinates must be normalized to [0,1]")
    a[:, 0] *= w
    a[:, 1] *= h
    for ids in (LIPS_OUT, LIPS_IN, EYE_R, EYE_L):
        poly = a[np.array(ids)]
        if float(np.ptp(poly[:, 0])) < w * .01 or float(np.ptp(poly[:, 1])) < h * .0015:
            raise ValueError("Degenerate lip/eye mesh contours; require accurate source-specific landmarks")
    return a


def polygon(points: np.ndarray, indices: tuple[int,...], size: tuple[int,int]) -> np.ndarray:
    im = Image.new("L", size, 0)
    xy = [tuple(map(float,points[i])) for i in indices]
    ImageDraw.Draw(im).polygon(xy, fill=255)
    return np.asarray(im, dtype=np.uint8) > 0


def grow(mask: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return mask.copy()
    im = Image.fromarray((mask*255).astype("uint8"),"L")
    return np.asarray(im.filter(ImageFilter.MaxFilter(2*px+1))) > 0


def shrink(mask: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return mask.copy()
    im=Image.fromarray((mask*255).astype("uint8"),"L")
    return np.asarray(im.filter(ImageFilter.MinFilter(2*px+1))) > 0


def stroke(points: np.ndarray, indices: tuple[int,...], size: tuple[int,int], width: int) -> np.ndarray:
    im = Image.new("L",size,0)
    xy=[tuple(map(float,points[i])) for i in indices]
    ImageDraw.Draw(im).line(xy,fill=255,width=width,joint="curve")
    return np.asarray(im)>0


def anatomy_regions(p: np.ndarray, size: tuple[int,int]):
    w,h=size
    eye_r=polygon(p,EYE_R,size)
    eye_l=polygon(p,EYE_L,size)
    eye_holes=grow(eye_r|eye_l,1)
    mouth=shrink(polygon(p,LIPS_IN,size),1)
    ew_r=np.linalg.norm(p[33]-p[133])
    ew_l=np.linalg.norm(p[263]-p[362])
    ew=(ew_r+ew_l)/2
    if not np.isfinite(ew) or ew < 5:
        raise ValueError("Detected eye geometry too small")
    margin=max(1,min(8,round(ew*.025)))
    lips=grow(polygon(p,LIPS_OUT,size),margin)&~mouth

    shadow=np.zeros((h,w),dtype=bool)
    liner=np.zeros((h,w),dtype=bool)
    for eye,brow,corner_a,corner_b in (
        (EYE_R,BROW_R,33,133),(EYE_L,BROW_L,263,362)
    ):
        eye_upper=np.array(eye[:9])
        x0,x1=sorted([float(p[corner_a,0]),float(p[corner_b,0])])
        width=x1-x0
        brow_y=float(np.mean(p[np.array(brow),1]))
        lid_y=float(np.mean(p[eye_upper,1]))
        if brow_y >= lid_y - max(2,width*.03):
            raise ValueError("Eye/brow landmarks inverted or too close for safe eyeshadow")
        xx0=max(0,round(x0-width*.14))
        xx1=min(w,round(x1+width*.14))
        yy0=max(0,round(brow_y + (lid_y-brow_y)*.18))
        yy1=min(h,round(lid_y+width*.12))
        if xx0>=xx1 or yy0>=yy1:
            raise ValueError("Invalid upper-eyelid makeup window")
        window=np.zeros((h,w),dtype=bool)
        window[yy0:yy1,xx0:xx1]=True
        shadow |= window
        # A short 3-8% eye-width strip follows the actual lash roots.
        safe_width=max(2,round(width*.10))
        liner|=stroke(p,tuple(eye[:9]),size,safe_width)
        # A small wing is allowed only adjacent to the actual outer corner.
        outer=np.array(p[corner_a],dtype=float)
        other=np.array(p[corner_b],dtype=float)
        direction=np.sign(float(outer[0]-other[0]))
        target=(float(outer[0]+direction*width*.21),float(outer[1]-width*.08))
        im=Image.new("L",size,0)
        ImageDraw.Draw(im).line([tuple(outer),target],fill=255,width=safe_width)
        liner|=(np.asarray(im)>0)
    # Do not permit makeup on the eye opening or mouth even if the window
    # intersects them near a canthus.
    shadow &= ~eye_holes
    liner &= ~shrink(eye_r|eye_l,2)
    return {"lips":lips,"shadow":shadow,"liner":liner,
            "protected_eyes":eye_holes,"protected_mouth":mouth,
            "eye_width":round(float(ew),2)}


def load_mask(path: Path, size: tuple[int,int]) -> np.ndarray:
    with Image.open(path) as original:
        original.verify()
    with Image.open(path) as original:
        if original.mode not in ("L", "1"):
            raise ValueError(f"{path.name}: mask must be grayscale, not {original.mode}")
        if original.size != size:
            raise ValueError(f"{path.name}: mask dimensions must match source")
        return np.asarray(original.convert("L"))>2


def audit(master: Path, landmarks: Path, manifest: Path, out: Path, premium=False) -> dict:
    out.mkdir(parents=True,exist_ok=True)
    for old in ("anatomy-report.json","unauthorized-anatomy.png"):
        (out/old).unlink(missing_ok=True)
    with Image.open(master) as img:
        w,h=img.size
    p=checked_mesh(checked_json(landmarks),master,(w,h))
    regions=anatomy_regions(p,(w,h))
    data=checked_json(manifest)
    layers=data.get("masks")
    if not isinstance(layers,list) or not layers or len(layers)>18:
        raise ValueError("Mask manifest must contain 1-18 layers")
    if premium and (w<2048 or h<2732 or abs(w/h-.75)>.005):
        raise ValueError("Native premium artwork must be at least 2048x2732 at 3:4 (no upscaling)")
    rows=[];errors=[];bad_union=np.zeros((h,w),dtype=bool)
    for i,layer in enumerate(layers):
        if not isinstance(layer,dict) or layer.get("kind") not in KINDS:
            raise ValueError(f"Layer #{i}: expected lips, shadow or liner")
        relative=layer.get("file")
        if not isinstance(relative,str) or Path(relative).name != relative or not relative.lower().endswith(".png"):
            raise ValueError(f"Layer #{i}: mask must be a PNG filename in manifest directory")
        m=load_mask(manifest.parent/relative,(w,h))
        kind=layer["kind"]; region=regions[kind]
        outside=m & ~region
        forbidden_eye=int(np.count_nonzero(m & regions["protected_eyes"]))
        forbidden_mouth=int(np.count_nonzero(m & regions["protected_mouth"]))
        pixels=int(np.count_nonzero(m));misplaced=int(np.count_nonzero(outside))
        bad_union |= outside
        coverage=pixels/(w*h)
        if pixels<10:
            errors.append(f"{relative}: makeup mask is empty or implausibly small")
        if misplaced > MAX_WRONG_ANATOMY_PIXELS:
            errors.append(f"{relative}: {misplaced} pixels outside {kind} anatomical region")
        if coverage>MAX_MASK_FRACTION[kind]:
            errors.append(f"{relative}: {kind} mask covers {coverage:.1%}, too broad")
        if forbidden_eye:
            errors.append(f"{relative}: {forbidden_eye} pixels overlap the visible eye opening")
        if forbidden_mouth:
            errors.append(f"{relative}: {forbidden_mouth} pixels overlap the inner mouth")
        rows.append({"kind":kind,"file":relative,"pixels":pixels,
                     "misplaced_pixels":misplaced,"over_eye_pixels":forbidden_eye,
                     "over_mouth_pixels":forbidden_mouth,
                     "source_frame_coverage_percent":round(coverage*100,4)})
    heat=Image.new("RGB",(w,h),(0,0,0))
    a=np.array(heat);a[bad_union]=(255,25,40)
    Image.fromarray(a,"RGB").save(out/"unauthorized-anatomy.png")
    report={
        "passed_anatomical_preflight":not errors,
        "approved_for_catalog":False,
        "requires_manual_makeup_artist_review":True,
        "source_width":w,"source_height":h,
        "source_sha256":sha256(master.read_bytes()).hexdigest(),
        "reference_landmarks_sha256":sha256(landmarks.read_bytes()).hexdigest(),
        "eye_width_px":regions["eye_width"],
        "total_pixels_outside_anatomy":int(np.count_nonzero(bad_union)),
        "errors":errors,"layers":rows,
        "notes":[
            "Face contours are detected estimates and must be visually reviewed.",
            "Passing this spatial test does not guarantee lipstick, eyeliner, lashes, materials or identity quality.",
            "Do not reuse face-landmark coordinates from a different photograph.",
            "Do not upload private user photographs or facial landmarks to public CI artifacts."
        ]
    }
    (out/"anatomy-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return report


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--master",type=Path,required=True)
    ap.add_argument("--landmarks",type=Path,required=True)
    ap.add_argument("--manifest",type=Path,required=True)
    ap.add_argument("--out",type=Path,required=True)
    ap.add_argument("--premium",action="store_true")
    a=ap.parse_args()
    r=audit(a.master,a.landmarks,a.manifest,a.out,a.premium)
    print(json.dumps(r,indent=2))
    return 0 if r["passed_anatomical_preflight"] else 1

if __name__=="__main__":
    raise SystemExit(main())
