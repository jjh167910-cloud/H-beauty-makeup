#!/usr/bin/env python3
"""Extract a semi-transparent makeup carrier from a licensed, ALIGNED pair.

Research tool to prepare supervised transparency data for the H-Beauty
appearance model. It does not train or ship a model, and never uploads faces.

Per-region paired photographs must be registered to THE SAME person, framing,
expression and illumination, preferably by photographing successive layers
without moving camera or head. An unaligned target is rejected.

A known cosmetic pigment is required to solve a per-pixel opacity in LINEAR
sRGB. The inverse problem is not unique and the fitted pigment is a
one-color approximation, not measured spectral reflectance.

  python scripts/quality/extract_paired_transparency.py \
    --manifest /private/paired-look.json --out /private/paired-extraction

The JSON manifest contains:
{
  "schema_version": 1,
  "pair_id": "subject17-lip-red-01",
  "source": "bare.png", "target": "with-lipstick.png",
  "source_sha256": "<hex sha256>", "target_sha256": "<hex sha256>",
  "mask": "lips-mask.png", "region": "lips", "pigment": "#b32339",
  "alignment_reviewed": true,
  "rights_scope": "commercial-model-training",
  "rights_document_id": "signed-rights-record-reference",
  "consent_document_id": "signed-subject-consent-reference",
  "rights_reviewed_by": "authorized-human-reviewer"
}

Rights assertions are SELF-REPORTED metadata, NOT independently verified by
this program. Before any commercial training, independently verify originals,
consent, scope, derivative rights and records. Do not commit source/target
images, facial landmarks, signed releases or private manifests to GitHub.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageCms

from audit_pixel_locked_look import load_rgb

PALETTE_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
SHA_RE = re.compile(r"^[a-fA-F0-9]{64}$")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$")
REGIONS = {"lips", "eyes", "cheeks"}
MIN_QUALITY = {"outside_mae": 1.75, "outside_fraction_gt8": 0.004,
               "inside_mae": 9.0, "inside_p95": 24.0}
EPS = 1e-5


def srgb_to_linear(v: np.ndarray) -> np.ndarray:
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(v: np.ndarray) -> np.ndarray:
    return np.where(v <= .0031308, v * 12.92,
                    1.055 * np.maximum(v, 0) ** (1/2.4) - .055)


def must_have(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing {key}; no license/identity evidence may be inferred")
    return value.strip()


def check_manifest(path: Path) -> tuple[dict, dict[str, Path], np.ndarray]:
    data=json.loads(path.read_text(encoding="utf8"))
    if not isinstance(data,dict) or data.get("schema_version") != 1:
        raise ValueError("Expected transparency pair manifest schema_version=1")
    if not ID_RE.fullmatch(must_have(data,"pair_id")):
        raise ValueError("Invalid anonymized pair_id")
    if data.get("region") not in REGIONS:
        raise ValueError("Region must be lips, eyes or cheeks")
    shade=must_have(data,"pigment")
    if not PALETTE_RE.fullmatch(shade):
        raise ValueError("Pigment must be measured/approved #RRGGBB")
    if data.get("alignment_reviewed") is not True:
        raise ValueError("Registered same-person, same-pose pair alignment requires explicit review")
    if data.get("rights_scope") != "commercial-model-training":
        raise ValueError("Commercial training rights must be explicitly documented")
    # These are declarations for a future legal human audit. This tool is not
    # a legal verifier and cannot tell whether identifiers describe real grants.
    for key in ("rights_document_id","consent_document_id","rights_reviewed_by"):
        if len(must_have(data,key)) < 4:
            raise ValueError(f"{key} must identify a verifiable external record")
    root=path.resolve().parent
    files={}
    for key in ("source","target","mask"):
        value=must_have(data,key)
        p=(root/value).resolve()
        if not p.is_relative_to(root) or not p.is_file():
            raise ValueError(f"{key}: path missing or escapes the private manifest directory")
        files[key]=p
    if files["source"] == files["target"]:
        raise ValueError("A paired source and target must be independent files")
    for key in ("source","target"):
        expected=must_have(data,key+"_sha256")
        if not SHA_RE.fullmatch(expected) or sha256(files[key].read_bytes()).hexdigest()!=expected.lower():
            raise ValueError(f"{key} does not match registered sha256")
    pigment=np.array([int(shade[i:i+2],16) for i in (1,3,5)],dtype=np.float32)/255
    return data,files,pigment


def check_srgb(path: Path):
    with Image.open(path) as im:
        orientation=im.getexif().get(274,1)
        if orientation not in (None,1):
            raise ValueError(f"{path.name}: normalize rotated EXIF photo into upright lossless PNG first")
        profile=im.info.get("icc_profile")
    if not profile:
        return
    try:
        name=ImageCms.getProfileName(ImageCms.ImageCmsProfile(BytesIO(profile))).lower()
    except (ValueError,OSError,TypeError) as exc:
        raise ValueError(f"Invalid ICC profile in {path.name}") from exc
    if "srgb" not in name:
        raise ValueError(f"{path.name}: explicit sRGB conversion required before extraction")


def extract(manifest_path: Path, out: Path, *,
            min_native: bool = False) -> dict:
    out.mkdir(parents=True,exist_ok=True)
    # A failed rerun must never leave accepted-looking data from a prior pair.
    for stale in ("makeup-alpha.png","makeup-rgba.png",
                  "reconstructed-on-source.png","extraction-report.json"):
        (out/stale).unlink(missing_ok=True)
    data,files,pigment=check_manifest(manifest_path)
    for path in files.values():
        check_srgb(path)
    source_img=load_rgb(files["source"])
    target_img=load_rgb(files["target"])
    w,h=source_img.size
    if target_img.size!=(w,h):
        raise ValueError("Paired source/target image dimensions disagree")
    if min_native and (w<2048 or h<2048):
        raise ValueError("Native 2K paired images required for premium data")
    with Image.open(files["mask"]) as m:
        if m.mode not in ("L","1") or m.size!=(w,h):
            raise ValueError("Cosmetic region mask must be grayscale at source size")
        mask_u8=np.asarray(m.convert("L"),dtype=np.uint8)
    covered=mask_u8>0
    n=int(np.count_nonzero(covered))
    if n<50 or n/(w*h)>.12:
        raise ValueError("Cosmetic region must be nonempty and <=12% of frame")
    src=np.asarray(source_img,dtype=np.uint8)
    target=np.asarray(target_img,dtype=np.uint8)
    outside=np.abs(src[~covered].astype(np.int16)-target[~covered].astype(np.int16))
    mean_out=float(np.mean(outside))
    frac_out=float(np.mean(np.any(outside>8,axis=1)))
    if mean_out>MIN_QUALITY["outside_mae"] or frac_out>MIN_QUALITY["outside_fraction_gt8"]:
        raise ValueError(
            f"PAIR-REGISTRATION-FAIL: outside-cosmetic drift {mean_out:.2f} RGB MAE, "
            f"{frac_out:.3%} pixels >8; do not learn face/hair/lighting shifts as makeup"
        )

    # Work only inside the cosmetic ROI, keeping high-res memory modest and
    # preserving 100% unchanged source outside it.
    ys,xs=np.where(covered)
    x0,y0,x1,y1=int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1
    original=src[y0:y1,x0:x1].astype(np.float32)/255
    observed=target[y0:y1,x0:x1].astype(np.float32)/255
    local_mask=mask_u8[y0:y1,x0:x1]
    source_linear=srgb_to_linear(original)
    target_linear=srgb_to_linear(observed)
    chroma=srgb_to_linear(pigment).reshape(1,1,3)
    direction=chroma-source_linear
    delta=target_linear-source_linear
    denom=np.sum(direction*direction,axis=2)
    identifiable=denom>EPS
    alpha=np.zeros(denom.shape,dtype=np.float32)
    projection=np.sum(delta*direction,axis=2)
    np.divide(projection,denom,out=alpha,where=identifiable)
    # Matte/transparent same-pigment compositing is one interpretable
    # approximation. It does not recover multilayer shadow/liner/lashes.
    alpha=np.clip(alpha,0,1)
    alpha=np.minimum(alpha,local_mask.astype(np.float32)/255)
    alpha[local_mask==0]=0

    linear_result=source_linear*(1-alpha[...,None])+chroma*alpha[...,None]
    rgb_result=np.clip(np.round(linear_to_srgb(linear_result)*255),0,255).astype(np.uint8)
    out_np=src.copy()
    out_patch=out_np[y0:y1,x0:x1]
    out_patch[local_mask>0]=rgb_result[local_mask>0]
    if np.any(out_np[~covered] != src[~covered]):
        raise AssertionError("Source-locked reconstruction changed protected pixels")
    roi_error=np.abs(out_patch.astype(np.float32)-target[y0:y1,x0:x1].astype(np.float32))
    err=roi_error[local_mask>0]
    per_pixel=np.max(roi_error,axis=2)[local_mask>0]
    inside_mae=float(np.mean(err))
    inside_p95=float(np.percentile(per_pixel,95))
    if (inside_mae>MIN_QUALITY["inside_mae"] or inside_p95>MIN_QUALITY["inside_p95"]):
        raise ValueError(
            f"PAIR-TRANSPARENCY-FAIL: one-pigment model reconstruction "
            f"{inside_mae:.2f} RGB MAE, {inside_p95:.2f} p95. "
            "Use product-specific layers, genuine intermediate photographs or a learned appearance model."
        )
    alpha_out=np.zeros((h,w),dtype=np.uint8)
    alpha_out[y0:y1,x0:x1]=np.round(alpha*255).astype(np.uint8)
    rgba=np.zeros((h,w,4),dtype=np.uint8)
    rgba[covered,:3]=np.round(pigment*255).astype(np.uint8)
    rgba[:,:,3]=alpha_out
    Image.fromarray(alpha_out,"L").save(out/"makeup-alpha.png")
    Image.fromarray(rgba,"RGBA").save(out/"makeup-rgba.png")
    Image.fromarray(out_np,"RGB").save(out/"reconstructed-on-source.png")
    report={
        "status":"training-pair-engineering-preflight-only",
        "release_approved":False,
        "trained_model_available":False,
        "rights_human_verified_by_software":False,
        "pair_id":data["pair_id"],
        "region":data["region"],"pigment":data["pigment"],
        "source_size":[w,h],
        "source_sha256":sha256(files["source"].read_bytes()).hexdigest(),
        "target_sha256":sha256(files["target"].read_bytes()).hexdigest(),
        "region_fraction":round(n/(w*h),6),
        "mean_pair_drift_outside_mask_rgb":round(mean_out,4),
        "fraction_outside_pixels_above_8":round(frac_out,6),
        "reconstruction_inside_mae_rgb":round(inside_mae,4),
        "reconstruction_inside_p95_max_rgb":round(inside_p95,4),
        "unidentifiable_inside_fraction":round(
            float(np.mean(~identifiable[local_mask>0])),6),
        "alpha_mean":round(float(np.mean(alpha[local_mask>0])),6),
        "rgba_compositing_space":"linear-sRGB",
        "restrictions":[
            "The declared source/target commercial licenses and model consent need independent legal verification",
            "Only a single known pigment and aligned one-product capture can be disambiguated",
            "A browser canvas alpha blend in encoded sRGB will differ from this linear-light reference",
            "Do not commit original photographs, private consent records, masks or facial data to public GitHub",
            "No new trained model is produced by this extraction; no photorealism claim",
        ],
    }
    (out/"extraction-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",required=True,type=Path)
    p.add_argument("--out",required=True,type=Path)
    p.add_argument("--require-native-2k",action="store_true")
    args=p.parse_args()
    report=extract(args.manifest,args.out,min_native=args.require_native_2k)
    print(json.dumps(report,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
