"""Training faces for the look networks: synthetic, licence-safe, aligned like on the phone.

Source: SFHQ-T2I (David Beniaguev, MIT licence) - synthetic faces with no real people.
Only images made with FLUX.1-schnell (Apache-2.0) and SDXL (CreativeML OpenRAIL++-M, outputs
usable commercially) are used. Files are read straight out of the 23 GB archive with HTTP range
requests, so only the chosen images are downloaded.

    python scripts/tinybeauty/faces.py fetch 8000      # ~1.4 GB of 1024 px JPEGs
    python scripts/tinybeauty/faces.py align           # FFHQ-aligned 256 px, usable faces only
    python scripts/tinybeauty/faces.py filter          # drop glasses/sunglasses/covered faces (CLIP)
"""
import json, os, random, sys, threading
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from pathlib import Path
import cv2, numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import teacher

WORK = Path(os.environ.get('TINYBEAUTY_WORK', teacher.REPO / '.tinybeauty'))
RAW, FACES = WORK / 'sfhq/raw', WORK / 'sfhq/faces'
URL = 'https://huggingface.co/datasets/bitmind/SyntheticFacesHighQuality-T2I/resolve/main/SyntheticFacesHighQuality.zip'


def fetch(n: int, start: int = 0):
    from remotezip import RemoteZip
    RAW.mkdir(parents=True, exist_ok=True)
    with RemoteZip(URL) as z: names = z.namelist()
    pick = [x for x in names if x.split('/')[-1].startswith(('FLUX1_schnell', 'SDXL'))]
    random.seed(7); random.shuffle(pick); pick = pick[start:start + n]
    local = threading.local()
    def one(name):
        if not hasattr(local, 'z'): local.z = RemoteZip(URL)
        dst = RAW / name.split('/')[-1]
        for _ in range(3):
            if dst.exists(): break
            try: dst.write_bytes(local.z.read(name))
            except Exception: local.z = RemoteZip(URL)
    with ThreadPoolExecutor(8) as ex: list(ex.map(one, pick))
    print('fetched', len(list(RAW.glob('*.jpg'))))


def _align(path):
    im = teacher.rgb(path); p = teacher.landmarks3(im)
    if p is None: return None
    e2e = np.linalg.norm(p[33, :2] - p[263, :2]); mid = (p[33, :2] + p[263, :2]) / 2
    if abs(p[1, 0] - mid[0]) / e2e > 0.22: return None                       # turned head
    op = lambda a, b, c, d: np.linalg.norm(p[a, :2] - p[b, :2]) / np.linalg.norm(p[c, :2] - p[d, :2])
    if min(op(159, 145, 33, 133), op(386, 374, 362, 263)) < 0.18: return None  # eyes closed
    q = teacher.ffhq_quad(p)
    if np.linalg.norm(q[3] - q[0]) < 300: return None                           # face too small
    M = cv2.getAffineTransform(q[[0, 1, 3]], np.float32([[0, 0], [0, 256], [256, 0]]))
    half = cv2.resize(im, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    crop = cv2.warpAffine(half, M @ np.diag([2, 2, 1]).astype(np.float32), (256, 256), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT)
    cv2.imwrite(str(FACES / f'{Path(path).stem}.png'), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
    return Path(path).stem


def align():
    FACES.mkdir(parents=True, exist_ok=True)
    with Pool(2) as pool: kept = [n for n in pool.imap(_align, sorted(map(str, RAW.glob('*.jpg'))), chunksize=16) if n]
    json.dump(kept, open(WORK / 'sfhq/index.json', 'w')); print('aligned', len(kept))


def clip_filter():
    import torch
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor
    m = CLIPModel.from_pretrained('openai/clip-vit-base-patch32').eval(); pr = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')
    texts = ['a close-up photo of a face without glasses', 'a close-up photo of a face wearing eyeglasses', 'a close-up photo of a face wearing sunglasses',
             'a photo of a face with a hand or object covering the mouth or eyes']
    names = json.load(open(WORK / 'sfhq/index.json')); tok = pr(text=texts, return_tensors='pt', padding=True); keep = []
    with torch.no_grad():
        for i in range(0, len(names), 32):
            ims = [Image.open(FACES / f'{n}.png').convert('RGB') for n in names[i:i + 32]]
            pz = m(input_ids=tok['input_ids'], attention_mask=tok['attention_mask'], pixel_values=pr(images=ims, return_tensors='pt')['pixel_values']).logits_per_image.softmax(-1)
            keep += [n for n, q in zip(names[i:i + 32], pz.tolist()) if q[0] > 0.5]
    json.dump(keep, open(WORK / 'sfhq/index_clean.json', 'w')); print('clean faces', len(keep))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch': fetch(int(sys.argv[2]) if len(sys.argv) > 2 else 8000, int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    elif cmd == 'align': align()
    elif cmd == 'filter': clip_filter()
    else: print(__doc__)
