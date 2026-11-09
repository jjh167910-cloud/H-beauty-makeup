#!/usr/bin/env python3
"""Reproducibly assemble the 292-photo V3 REVIEW CANDIDATE.

This is staging ONLY. No files under public/ or dist/ are mutated; no
Cloudflare deployment is made. All sources are pinned by whole-file SHA256.
Re-renders are explicitly tagged by ORIGINAL source resolution; no upscaling
may be falsely claimed to be native 2K.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import statistics
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "assets/hbeauty-hairstyles-v3-staging.json"
CATALOG = ROOT / "src/data/catalog.json"
HOST = "d2ol7oe51mr4n9.cloudfront.net"
FILE_RE = re.compile(r"HB-(\d{3})\.jpg")
TARGET = (245, 243, 239)


def fetch_locked(entry, local_root):
    if local_root:
        data = (local_root / entry["local_name"]).read_bytes()
    else:
        url = urllib.parse.urlsplit(entry["url"])
        if url.scheme != "https" or url.hostname != HOST or url.username or url.password:
            raise ValueError("Refusing untrusted image/archive host")
        with urllib.request.urlopen(entry["url"], timeout=80) as response:
            length = response.headers.get("Content-Length")
            if length and int(length) > 25_000_000:
                raise ValueError("Oversized source response")
            data = response.read(25_000_001)
    if len(data) > 25_000_000:
        raise ValueError("Oversized source")
    digest = hashlib.sha256(data).hexdigest()
    if digest != entry["sha256"]:
        raise ValueError(f"Source SHA256 mismatch: {entry['local_name']}")
    return data


def read_archive(entry, data):
    expected = set(entry["ids"]) if "ids" in entry else set(range(entry["first"], entry["last"] + 1))
    found = {}
    with zipfile.ZipFile(io.BytesIO(data)) as pack:
        for info in pack.infolist():
            if info.is_dir():
                raise ValueError("Unexpected archive directory")
            name = info.filename
            if name in ("QA_report_v3.csv", "QA_fix10.csv"):
                if info.file_size > 800_000:
                    raise ValueError("Oversized report")
                continue
            match = FILE_RE.fullmatch(name)
            if not match:
                raise ValueError(f"Unexpected file in source archive: {name}")
            id_ = int(match.group(1))
            if id_ not in expected or id_ in found or not (2_000 <= info.file_size <= 5_000_000):
                raise ValueError(f"Duplicate, missing, or oversized source image {name}")
            payload = pack.read(info)
            if not payload.startswith(b"\xff\xd8\xff"):
                raise ValueError(f"Source must be JPEG: {name}")
            found[id_] = payload
    if set(found) != expected:
        raise ValueError(f"Archive incomplete: expected {len(expected)} found {len(found)}")
    return found


def decode_jpeg(data, image_id):
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format != "JPEG":
                raise ValueError(f"Not JPEG: {image_id}")
            probe.verify()
        with Image.open(io.BytesIO(data)) as image:
            result = ImageOps.exif_transpose(image).convert("RGB")
            result.load()
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError(f"Corrupt photo HB-{image_id:03d}: {error}") from error
    if result.width != result.height or result.width < 900 or result.width > 4096:
        raise ValueError(f"Unexpected source dimensions HB-{image_id:03d}: {result.size}")
    return result


def corner_median(image):
    size = min(16, image.width // 20)
    samples = []
    for x in (0, image.width-size):
        for y in (0, image.height-size):
            pixels = list(image.crop((x,y,x+size,y+size)).getdata())
            samples.append(tuple(int(statistics.median(p[i] for p in pixels)) for i in range(3)))
    return tuple(int(statistics.median(v[i] for v in samples)) for i in range(3))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--local-root", type=Path, help="Use exact local user-uploaded files; hashes still required")
    parser.add_argument("--output", type=Path, default=Path("staging/hairstyles-v3"))
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config["schema"] != 1 or config["status"] != "STAGING_ONLY_NOT_APPROVED" or config["production_lock"]["may_deploy"]:
        raise ValueError("Invalid or unsafe staging manifest")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    source_files = {}
    source_origin = {}
    for entry in config["archives"]:
        payload = fetch_locked(entry, args.local_root)
        for image_id, data in read_archive(entry, payload).items():
            if entry["role"] == "base" and image_id in source_files:
                raise ValueError("Overlapping base archives")
            source_files[image_id] = data
            source_origin[image_id] = entry["role"]
    for entry in config["preliminary_overrides"]:
        image_id = entry["id"]
        if image_id not in (40,41):
            raise ValueError("Unexpected override ID")
        payload = fetch_locked(entry, args.local_root)
        source_files[image_id] = payload
        source_origin[image_id] = "PRELIMINARY_UNAPPROVED"
    if set(source_files) != set(range(1,293)):
        raise ValueError("Missing or extra style IDs")
    families = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog_names = {}
    for family in families:
        for image_id, name in zip(family["variantIds"],family["variantNames"]):
            if image_id in catalog_names:
                raise ValueError("Duplicate catalog ID")
            catalog_names[image_id] = name
    if set(catalog_names) != set(source_files):
        raise ValueError("Catalog and photo IDs differ")
    rows = []
    output_zip = output / "HBeauty_292_V3_STAGING_ONLY.zip"
    with zipfile.ZipFile(output_zip,"w",compression=zipfile.ZIP_DEFLATED, compresslevel=5) as pack:
        for image_id in range(1,293):
            image = decode_jpeg(source_files[image_id],image_id)
            matte = corner_median(image)
            rgb_delta = max(abs(matte[c]-TARGET[c]) for c in range(3))
            full = io.BytesIO()
            thumb = io.BytesIO()
            # Preserve actual original resolution: never silently upscale to 2K.
            image.save(full,format="WEBP",quality=92,method=4)
            image.resize((560,560),Image.Resampling.LANCZOS).save(thumb,format="WEBP",quality=90,method=4)
            pack.writestr(f"looks/{image_id}.webp",full.getvalue())
            pack.writestr(f"looks/sm/{image_id}.webp",thumb.getvalue())
            rows.append({
                "id":image_id, "name_fa":catalog_names[image_id],
                "original_width":image.width, "original_height":image.height,
                "sha256":hashlib.sha256(source_files[image_id]).hexdigest(),
                "source":source_origin[image_id], "corner_rgb":list(matte),
                "max_corner_delta_from_ivory":rgb_delta,
                "approved_for_production":False,
            })
    (output/"stage_manifest.json").write_text(json.dumps({
        "release":config["release"],"status":"BLOCKED_NOT_FOR_PRODUCTION",
        "count":len(rows),"approved_count":0,
        "native_2048_count":sum(x["original_width"]>=2048 for x in rows),
        "close_to_ivory_count":sum(x["max_corner_delta_from_ivory"]<=5 for x in rows),
        "preliminary_ids":[x["id"] for x in rows if x["source"]=="PRELIMINARY_UNAPPROVED"],
        "sources":rows
    },ensure_ascii=False,indent=2),encoding="utf-8")
    with (output/"review.csv").open("w",encoding="utf-8-sig",newline="") as fp:
        writer=csv.DictWriter(fp,fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({
        "staging_archive":str(output_zip),"complete":len(rows),
        "native_2048":sum(x["original_width"]>=2048 for x in rows),
        "production_deploy":False,
        "provisional":[40,41]
    }))
    assert len(rows)==292

if __name__=="__main__":
    main()
