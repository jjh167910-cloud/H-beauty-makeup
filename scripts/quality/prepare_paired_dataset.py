#!/usr/bin/env python3
"""Build a PRIVATE subject-disjoint index for rights-reviewed makeup pairs.

This is a dataset preflight, not proof of informed consent or data license.
All sources stay local. Never commit the collection, index or face images to
the public H-Beauty repository.

python scripts/quality/prepare_paired_dataset.py \
  --collection /private/pairs/collection.json \
  --out /private/pairs/subject-disjoint-index.json --seed 20261114
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import random
import re

import numpy as np
from PIL import Image

from extract_paired_transparency import check_srgb, linear_to_srgb, srgb_to_linear

ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{2,95}$")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
KINDS = {"lips", "eyes", "cheeks"}
MIN_SUBJECTS = 6
MAX_OUTSIDE_MAE = 1.75
MAX_OUTSIDE_DELTA_PIXELS = 0.004


def require_string(entry: dict, key: str) -> str:
    value=entry.get(key)
    if not isinstance(value,str) or not value.strip():
        raise ValueError(f"{key} missing")
    return value.strip()


def path_under(root: Path, relative: str) -> Path:
    path=Path(relative)
    if path.is_absolute() or not path.parts or any(x in ("..", ".") for x in path.parts):
        raise ValueError(f"Invalid private relative path {relative!r}")
    full=(root/path).resolve()
    if not full.is_relative_to(root) or not full.is_file():
        raise ValueError(f"Private source path not found or escaped dataset: {relative!r}")
    return full


def verify_record(root: Path, entry: dict) -> dict:
    for key in ("pair_id","subject_id","session_id"):
        if not ID.fullmatch(require_string(entry,key)):
            raise ValueError(f"Invalid pseudonymous {key}")
    for key in ("rights_verified_by","consent_verified_by","license_record_ref","consent_record_ref"):
        if len(require_string(entry,key))<4:
            raise ValueError(f"Missing privately reviewed {key}")
    if entry.get("region") not in KINDS:
        raise ValueError("Unknown cosmetic region")
    if not HEX.fullmatch(require_string(entry,"pigment")):
        raise ValueError("Only #RRGGBB pigments are accepted")
    files={key:path_under(root,require_string(entry,key))
           for key in ("source","target","mask","alpha","report")}
    for name in ("source","target","mask","alpha"):
        check_srgb(files[name])
    report=json.loads(files["report"].read_text(encoding="utf8"))
    if not isinstance(report,dict) or report.get("status")!="training-pair-engineering-preflight-only":
        raise ValueError("No successful paired opacity extraction report")
    if report.get("release_approved") is not False or report.get("trained_model_available") is not False:
        raise ValueError("Pair report cannot claim artwork/model release approval")
    if report.get("region")!=entry["region"] or report.get("pigment","").lower()!=entry["pigment"].lower():
        raise ValueError("Pair report and collection region/pigment disagree")
    if report.get("pair_id")!=entry["pair_id"]:
        raise ValueError("Paired report ID mismatch")
    src_hash=sha256(files["source"].read_bytes()).hexdigest()
    tgt_hash=sha256(files["target"].read_bytes()).hexdigest()
    if report.get("source_sha256")!=src_hash or report.get("target_sha256")!=tgt_hash:
        raise ValueError("Source/target checksum mismatch with extraction report")
    if float(report.get("reconstruction_inside_mae_rgb",999))>9.0 or float(report.get("reconstruction_inside_p95_max_rgb",999))>24:
        raise ValueError("Opacity labels fail reconstruction fidelity gate")
    with Image.open(files["source"]) as s, Image.open(files["target"]) as t, Image.open(files["mask"]) as m, Image.open(files["alpha"]) as a:
        if s.size!=t.size or s.size!=m.size or s.size!=a.size:
            raise ValueError("All paired images, mask and alpha must share dimensions")
        if m.mode not in ("L","1") or a.mode not in ("L","1"):
            raise ValueError("Makeup mask and alpha must be grayscale")
        if s.width<256 or s.height<256:
            raise ValueError("Source resolution too small to train")
        mask=np.asarray(m.convert("L"),dtype=np.uint8)>0
        alpha=np.asarray(a.convert("L"),dtype=np.uint8)
        source=np.asarray(s.convert("RGB"),dtype=np.uint8)
        target=np.asarray(t.convert("RGB"),dtype=np.uint8)
    if int(np.count_nonzero(mask))<50 or np.mean(mask)>.12:
        raise ValueError("Mask coverage is empty or implausibly large")
    if np.any((alpha>0)&~mask):
        raise ValueError("Cosmetic opacity labels would alter the protected face/background")
    drift=np.abs(source[~mask].astype(np.int16)-target[~mask].astype(np.int16))
    outside_mae=float(np.mean(drift))
    outside_fraction=float(np.mean(np.any(drift>8,axis=1)))
    if outside_mae>MAX_OUTSIDE_MAE or outside_fraction>MAX_OUTSIDE_DELTA_PIXELS:
        raise ValueError(f"Unregistered pair drift outside cosmetics ({outside_mae:.3f} RGB MAE)")
    if float(np.mean(alpha[mask].astype(np.float32)/255))<.03:
        raise ValueError("Opacity labels have no meaningful pigment supervision")
    # The extraction report fingerprints the BEFORE/AFTER photos, but may
    # predate modifications to its mask or opacity PNG. Recompute the actual
    # painted RGB using the SPECIFIC files supplied for training, in linear
    # sRGB, and refuse modified/corrupt supervision rather than merely
    # trusting old report metrics or newly recorded alpha hashes.
    original=srgb_to_linear(source[mask].astype(np.float32)/255)
    pigment_rgb=np.array([int(entry["pigment"][i:i+2],16)
                          for i in (1,3,5)],dtype=np.float32)/255
    pigment=srgb_to_linear(pigment_rgb)
    opacity=alpha[mask].astype(np.float32)[:,None]/255
    reconstructed_linear=original*(1-opacity)+pigment[None,:]*opacity
    reconstructed=np.clip(
        np.round(linear_to_srgb(reconstructed_linear)*255),0,255
    ).astype(np.uint8)
    diff=np.abs(reconstructed.astype(np.float32)-target[mask].astype(np.float32))
    actual_mae=float(np.mean(diff))
    actual_p95=float(np.percentile(diff.max(axis=1),95))
    if actual_mae>9.0 or actual_p95>24.0:
        raise ValueError(
            f"TRAINING-LABEL-RECONSTRUCTION-FAIL: current alpha/mask "
            f"reconstructs paired target at {actual_mae:.2f} RGB MAE and "
            f"{actual_p95:.2f} p95; regenerate labels from source"
        )
    # Compare with the original extraction's float-opacity measurement,
    # allowing small 8-bit label quantization differences only.
    if (abs(actual_mae-float(report["reconstruction_inside_mae_rgb"]))>2.5
            or abs(actual_p95-float(report["reconstruction_inside_p95_max_rgb"]))>6.0):
        raise ValueError("Current opacity labels disagree with extraction-time reconstruction quality")
    return {
        "pair_id":entry["pair_id"],"subject_id":entry["subject_id"],
        "session_id":entry["session_id"],"region":entry["region"],
        "pigment":entry["pigment"].lower(),
        "files":{name:str(path.relative_to(root)) for name,path in files.items()},
        "source_sha256":src_hash,"target_sha256":tgt_hash,
        "mask_sha256":sha256(files["mask"].read_bytes()).hexdigest(),
        "alpha_sha256":sha256(files["alpha"].read_bytes()).hexdigest(),
        "size":[source.shape[1],source.shape[0]],
        "outside_mae":round(outside_mae,4),
        "outside_fraction_gt8":round(outside_fraction,6),
        "recomputed_inside_mae":round(actual_mae,4),
        "recomputed_inside_p95":round(actual_p95,4),
        "rights_status":"self-attested-private-human-review"
    }


def build(collection_path: Path, out: Path, seed: int=20261114) -> dict:
    root=collection_path.resolve().parent
    collection=json.loads(collection_path.read_text(encoding="utf8"))
    if not isinstance(collection,dict) or collection.get("schema_version")!=1:
        raise ValueError("Collection must have schema_version=1")
    records=collection.get("records")
    if not isinstance(records,list) or not records:
        raise ValueError("No paired data records")
    verified=[]
    seen_pair=set()
    # A previously applied target could be reused as a subsequent step's
    # source for the SAME person. Treat both photo roles as one fingerprint
    # space, so a forged person ID cannot leak that image into a holdout.
    image_owner={}
    for candidate in records:
        if not isinstance(candidate,dict):
            raise ValueError("Each pair must be a JSON object")
        entry=verify_record(root,candidate)
        if entry["pair_id"] in seen_pair:
            raise ValueError("Repeated pair identifier")
        seen_pair.add(entry["pair_id"])
        for key in ("source_sha256","target_sha256"):
            signature=entry[key]
            previous=image_owner.get(signature)
            if previous is not None and previous!=entry["subject_id"]:
                raise ValueError(f"Duplicate photo fingerprint ({key}) assigned to two different subjects")
            image_owner[signature]=entry["subject_id"]
        verified.append(entry)
    subjects=sorted({e["subject_id"] for e in verified})
    if len(subjects)<MIN_SUBJECTS:
        raise ValueError(f"Need at least {MIN_SUBJECTS} distinct, rights-reviewed subjects to build a subject-disjoint split")
    shuffled=subjects.copy()
    random.Random(seed).shuffle(shuffled)
    count=len(shuffled)
    ntest=max(1,round(count*.15))
    nval=max(1,round(count*.15))
    ntrain=count-ntest-nval
    if ntrain<3:
        raise ValueError("Insufficient subjects for nontrivial training split")
    allocation={subject:"train" for subject in shuffled[:ntrain]}
    allocation.update({subject:"val" for subject in shuffled[ntrain:ntrain+nval]})
    allocation.update({subject:"test" for subject in shuffled[ntrain+nval:]})
    for item in verified:
        item["split"]=allocation[item["subject_id"]]
    # Store ONLY anonymized relative paths and pseudonymous subject IDs;
    # never copy pixels or consent documents into a public artifact.
    result={
        "schema_version":1,
        "data_root":str(root),
        "collection_sha256":sha256(collection_path.read_bytes()).hexdigest(),
        "seed":seed,
        "status":"data-index-preflight-not-model-training",
        "commercial_rights_independently_verified":False,
        "model_promoted":False,
        "subject_disjoint":True,
        "subject_counts":{kind:sum(v==kind for v in allocation.values())
                          for kind in ("train","val","test")},
        "records":sorted(verified,key=lambda x:x["pair_id"]),
        "warnings":[
            "Rights declarations are self-attested; verify original signed records independently.",
            "A subject-disjoint split does not establish enough demographic or lighting diversity.",
            "Training is blocked until sufficient genuine high-resolution pairs and a reviewed holdout exist.",
            "This index includes private facial image paths; never publish or upload it to CI."
        ],
    }
    out.parent.mkdir(parents=True,exist_ok=True)
    if out.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
        raise ValueError("Never save a private paired-data index under the public repository")
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return result


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--collection",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--seed",type=int,default=20261114)
    args=p.parse_args()
    result=build(args.collection,args.out,args.seed)
    print("Private subject-disjoint paired dataset preflight passed:",
          len(result["records"]),"pairs,",
          result["subject_counts"],"subjects; model NOT trained or approved.")


if __name__=="__main__":
    main()
