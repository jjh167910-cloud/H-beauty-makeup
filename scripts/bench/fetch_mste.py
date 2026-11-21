"""Fetch the benchmark's real faces: MST-E photos (front-facing, no mask), read out of the dataset's zip (5.6 GB) one by one,
each shrunk to 1600 px on its long side (the app's own limit) and kept only on this machine, MSTE_DIR/img/<subject>/<id>.jpg.

MST-E (Monk Skin Tone Examples, Google and TONL, 2023; https://skintone.google/mste-dataset): 19 people who consented to the
release of their photos, all 10 Monk skin tones, good and poor light. Research and evaluation only: never used to train or
fit anything, never committed or uploaded anywhere.

    pip install remotezip pillow
    MSTE_DIR=/tmp/claude-0/mste python -I scripts/bench/fetch_mste.py
"""
import csv, io, os, sys, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from remotezip import RemoteZip
from PIL import Image, ImageOps
URL = 'https://storage.googleapis.com/mste/mst-e_data.zip'; BASE = os.environ.get('MSTE_DIR', '/tmp/claude-0/mste')
os.makedirs(BASE, exist_ok=True)
if not os.path.exists(f'{BASE}/mst-e_image_details.csv'):
    z = RemoteZip(URL)
    for n in ('README.md', 'mst-e_image_details.csv', 'golden_and_adversarial_mst-e_image_ids.csv'):
        Path(BASE, n).write_bytes(z.read(f'mst-e_data/{n}'))
R = [r for r in csv.DictReader(open(f'{BASE}/mst-e_image_details.csv')) if r['pose'] in ('frontal', 'facing_camera') and r['mask'] == '0']
local = threading.local()
def get(r):
    dst = f"{BASE}/img/{r['subject_name']}/{r['image_ID']}"
    if os.path.exists(dst): return 'have'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for attempt in range(3):
        try:
            if not hasattr(local, 'z'): local.z = RemoteZip(URL)
            data = local.z.read(f"mst-e_data/{r['subject_name']}/{r['image_ID']}")
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
            im.thumbnail((1600, 1600), Image.LANCZOS)
            im.save(dst, quality=95, subsampling=0)
            return 'ok'
        except Exception as e:
            local.z = RemoteZip(URL); err = e
    return f'failed {err!r}'
print(len(R), flush=True)
with ThreadPoolExecutor(6) as ex:
    for k, s in enumerate(ex.map(get, R)):
        if k % 50 == 0 or not s.startswith(('ok', 'have')): print(k, s, flush=True)
print('done', flush=True)
