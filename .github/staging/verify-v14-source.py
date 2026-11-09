#!/usr/bin/env python3
"""Fail-closed validation of an imported H-Beauty V14 staging source tree.

Validates source provenance and synthetic research test readiness.
Does not certify model quality, photo rights, or deployment.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path

ROOT=Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd())).resolve()
manifest=ROOT/"QUALITY_V14_MANIFEST.json"
comparison=ROOT/"scripts/quality/compare_renderer_v14.py"
if not manifest.exists() and not comparison.exists():
    print("V14 not imported: baseline-only staging; research validation not applicable")
    raise SystemExit(0)
if not manifest.is_file() or not comparison.is_file():
    raise SystemExit("ERROR: partial V14 import: manifest and implementation must both exist")
obj=json.loads(manifest.read_text(encoding="utf8"))
for key in ("customer_rendering_engine_changed","production_ready","allowed_in_live_app","photorealism_certified"):
    if obj.get(key) is not False:
        raise SystemExit(f"ERROR: V14 is research-only and {key} must be false")
if obj.get("source_only") is not True:
    raise SystemExit("ERROR: unrecognized V14 source manifest")
if not obj.get("release","").startswith("H-Beauty V14"):
    raise SystemExit("ERROR: wrong release manifest")
changed=obj.get("changed_files")
if not isinstance(changed,list) or len(changed)<8:
    raise SystemExit("ERROR: incomplete V14 manifest")
seen=set()
for item in changed:
    name=item["path"]
    p=(ROOT/name).resolve()
    if name in seen or not p.is_relative_to(ROOT) or not p.is_file() or p.is_symlink():
        raise SystemExit(f"ERROR: unsafe/missing/duplicate V14 manifest path {name}")
    seen.add(name)
    data=p.read_bytes()
    if len(data)!=item["bytes"] or hashlib.sha256(data).hexdigest()!=item["sha256"]:
        raise SystemExit(f"ERROR: V14 source mismatch: {name}")
for prohibited in ("private-datasets","renderer-inputs","research-portraits","private-reviews","review-packets"):
    if (ROOT/prohibited).exists():
        raise SystemExit(f"ERROR: private research directory mistakenly imported: {prohibited}")
print(f"VALIDATED V14 research-only source: {len(seen)} pinned file hashes, no private datasets")
