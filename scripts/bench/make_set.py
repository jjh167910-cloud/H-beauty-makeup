"""The quality benchmark's photo set: real faces, the catalog model, and known light changes of both.

Real faces come from MST-E (Monk Skin Tone Examples, Google and TONL, 2023): 19 people who consented to the release of
their photos, spanning all 10 tones of the Monk scale, photographed on a phone in good and poor light. Its terms allow
research and evaluation, not training a model: these photos only ever measure the engine, nothing is fitted to them.
They stay on this machine (MSTE_DIR): never in the repo, CI, or any AI service. Fetch them with
scripts/bench/fetch_mste.py first. The user's own photos can be added with --own (also kept local).

    python scripts/bench/make_set.py RUN_DIR [--set quick|looks|full] [--engines v1,v2] [--own a.jpg,b.jpg]

quick: 8 looks on everything (the catalog model in four lights, 19 real people, six of them in three light changes);
looks: all the looks on the catalog model in all seven lights and on six real people (two light, two medium, two deep
skin, in good light), about 600 renders: every look against its catalog photo; full: all the looks on everything.

Writes RUN_DIR/photos/<id>.png, RUN_DIR/truth/<look>/<id>.png (the catalog model's truth: her catalog photo in that
light, makeup only: truth()) and RUN_DIR/manifest.json for render.cjs and score.py.

    python scripts/bench/make_set.py RUN_DIR --truth-only     # an existing run's truth made again (its catalog photos)

The catalog model is her bare face as the teacher sees it (teacher._bare(): no-makeup.webp with its blush and gloss
taken off), so every look, "no-makeup" included, has something to add. Her catalog photos are AI edits that moved her
face 2 to 6 px; each is aligned to the bare face first (the smooth part of the optical flow between them, about 0.2 px
left), so the truth is compared with the render pixel for pixel.
"""
from __future__ import annotations

import argparse, csv, json, os, sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(REPO / 'scripts/tinybeauty'))
import teacher as T  # noqa: E402
from conditions import Condition  # noqa: E402

MSTE_DIR = Path(os.environ.get('MSTE_DIR', '/tmp/claude-0/mste'))
MAX_SIDE = 1600                     # the app's own limit on a phone with less than 6 GB (src/lib/tryon.ts, MAX_SIDE)
QUICK_LOOKS = ['no-makeup', 'soft-glam', 'hollywood', 'classic-smokey', 'cut-crease', 'persian-bride', 'glitter-party', 'wine-lips']
SIM = ['warm', 'dim', 'flash']      # the light changes on real faces in the quick set (all six in the full set)


def group(mst: int) -> str:
    return 'light' if mst <= 3 else 'medium' if mst <= 6 else 'deep'


def all_looks() -> list[str]:
    src = (REPO / 'src/data/makeup-styles.ts').read_text(encoding='utf-8')
    import re
    return re.findall(r'^  style\("([a-z0-9-]+)"', src, re.M)


def shrink(img: np.ndarray) -> np.ndarray:
    k = MAX_SIDE / max(img.shape[:2])
    if k >= 1: return img
    return cv2.resize(img, (round(img.shape[1] * k), round(img.shape[0] * k)), interpolation=cv2.INTER_AREA)


def aligned(cat: np.ndarray, bare: np.ndarray, ew: float) -> np.ndarray:
    """A catalog photo moved onto the bare face: the optical flow between them, smoothed (0.3 eye widths) so only the
    face's movement is undone and not the makeup."""
    g = lambda im: cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)
    fl = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(g(bare), g(cat), None)
    fl = cv2.GaussianBlur(fl, (0, 0), ew * 0.3)
    h, w = bare.shape[:2]; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return cv2.remap(cat, xx + fl[..., 0], yy + fl[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def truth(look: str, bare: np.ndarray, ew: float) -> np.ndarray:
    """A catalog photo as the truth: aligned to the bare face, and the edit's change to the whole photo taken out
    (T.grading: its exposure and white balance, measured on the backdrop). That change is not makeup and the engine
    never paints it (the layer has it taken out); left in, the lid of a look whose photo was brightened read 5 L* too
    dark (lilac-eyes) where the makeup itself was 1.5 L* off. calibrate_de.py fits the gains to the same."""
    cat = aligned(T.rgb(T.LOOKS / f'{look}.webp'), bare, ew)
    return T.srgb(T.lin(cat) / np.exp(T.grading(look)))


def pose(img: np.ndarray):
    """Landmarks and how usable the photo is: frontal, level, mouth closed, eyes open, face large enough."""
    p = T.landmarks3(img)
    if p is None: return None, None
    q = p[:, :2]; ew = T.eye_width(q)
    r, l = np.linalg.norm(q[33] - q[133]), np.linalg.norm(q[263] - q[362])
    roll = float(np.degrees(np.arctan2(*(q[263] - q[33])[::-1])))
    open_ = min(np.linalg.norm(q[159] - q[145]), np.linalg.norm(q[386] - q[374])) / ew
    return p, dict(yaw=float(min(r, l) / max(r, l)), roll=roll, gap=float(np.linalg.norm(q[13] - q[14]) / ew),
                   open=float(open_), face=float(np.ptp(q[T.OVAL, 0]) / img.shape[1]))


def usable(m) -> bool:
    return m is not None and m['yaw'] > 0.85 and abs(m['roll']) < 12 and m['gap'] < 0.12 and m['open'] > 0.18 and m['face'] > 0.12


def mste_pick(cache_file: Path, poorly: int) -> list[dict]:
    """Per subject: her best well-lit frontal photo (the dataset's golden one when usable) and `poorly` poorly-lit ones."""
    rows = [r for r in csv.DictReader(open(MSTE_DIR / 'mst-e_image_details.csv')) if r['pose'] in ('frontal', 'facing_camera') and r['mask'] == '0']
    golden = {r['subject']: r for r in csv.DictReader(open(MSTE_DIR / 'golden_and_adversarial_mst-e_image_ids.csv'))}
    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    for r in rows:
        f = MSTE_DIR / 'img' / r['subject_name'] / r['image_ID']
        if f.name in cache or not f.exists(): continue
        _, m = pose(shrink(T.rgb(f)))
        cache[f.name] = m
    cache_file.write_text(json.dumps(cache))
    out = []
    for s in sorted({r['subject_name'] for r in rows}, key=lambda s: int(s.split('_')[1])):
        mine = [r for r in rows if r['subject_name'] == s and usable(cache.get(r['image_ID']))]
        score = lambda r: cache[r['image_ID']]['yaw'] - abs(cache[r['image_ID']]['roll']) / 90 - cache[r['image_ID']]['gap']
        well = sorted([r for r in mine if r['lighting'] == 'well_lit'], key=score, reverse=True)
        g = golden.get(s, {}).get('golden_image_id')
        well.sort(key=lambda r: r['image_ID'] != g)          # the golden image first, when usable
        poor = sorted([r for r in mine if r['lighting'] == 'poorly_lit'], key=score, reverse=True)
        n = int(s.split('_')[1])
        if well: out.append(dict(r=well[0], subject=n, light='well'))
        for k, r in enumerate(poor[:poorly]): out.append(dict(r=r, subject=n, light='poor'))
        if not well and not poor: print(f'{s}: no usable frontal photo', flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run'); ap.add_argument('--set', default='quick', choices=['quick', 'looks', 'full'])
    ap.add_argument('--engines', default='v1,v2'); ap.add_argument('--own', default='', help='your own photos (kept local)')
    ap.add_argument('--looks', default='')
    ap.add_argument('--truth-only', action='store_true', help="make an existing run's truth again (its catalog photos)")
    a = ap.parse_args()
    if a.truth_only:
        run = Path(a.run); M = json.loads((run / 'manifest.json').read_text())
        bare, _ = T._bare(); pb = T.landmarks3(bare); ew = T.eye_width(pb[:, :2])
        conds = [p['cond'] for p in M['photos'] if p['face'] == 'catalog']
        for look in M['looks']:
            if not (T.LOOKS / f'{look}.webp').exists(): continue
            cat = truth(look, bare, ew); (run / 'truth' / look).mkdir(parents=True, exist_ok=True)
            for c in conds:
                f = run / 'truth' / look / f'catalog__{c}.png'; f.unlink(missing_ok=True)     # (a new file: not another run's)
                cv2.imwrite(str(f), cv2.cvtColor(Condition(c, bare, pb, seed=7).apply(cat), cv2.COLOR_RGB2BGR))
        print(f'{run}: truth made again for {len(M["looks"])} looks x {len(conds)} lights'); sys.stdout.flush(); os._exit(0)
    run = Path(a.run); (run / 'photos').mkdir(parents=True, exist_ok=True)
    full, every = a.set == 'full', a.set == 'looks'
    looks = a.looks.split(',') if a.looks else all_looks() if full or every else QUICK_LOOKS
    photos = []

    def add(pid, img, **info):
        cv2.imwrite(str(run / 'photos' / f'{pid}.png'), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        photos.append(dict(id=pid, file=f'photos/{pid}.png', **info))

    # the catalog model (bare), and her catalog photos, aligned to her, as the truth in each light
    bare, _ = T._bare(); pb = T.landmarks3(bare); ew = T.eye_width(pb[:, :2])
    cats = {look: truth(look, bare, ew) for look in looks if (T.LOOKS / f'{look}.webp').exists()}
    for c in (['orig', 'warm', 'window', 'dim', 'flash', 'backlit', 'jpeg'] if full or every else ['orig', 'warm', 'dim', 'flash']):
        cond = Condition(c, bare, pb, seed=7)
        pid = f'catalog__{c}'
        add(pid, cond.apply(bare), face='catalog', source='catalog', mst=None, group='catalog', light='sim' if c != 'orig' else 'catalog', cond=c, base='catalog__orig')
        for look, cat in cats.items():
            (run / 'truth' / look).mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(run / 'truth' / look / f'{pid}.png'), cv2.cvtColor(cond.apply(cat), cv2.COLOR_RGB2BGR))

    # real faces
    picks = mste_pick(run.parent / 'mste_pose_cache.json', poorly=3 if full else 1)
    sim_subjects = None if full else {0, 13, 6, 3, 2, 12}     # two light, two medium, two deep (MST 3, 2, 5, 6, 8, 10)
    for k in picks:
        if every and (k['light'] != 'well' or k['subject'] not in sim_subjects): continue
        r = k['r']; mst = int(r['MST']); sid = f"mste{k['subject']:02d}"
        img = shrink(T.rgb(MSTE_DIR / 'img' / r['subject_name'] / r['image_ID']))
        pid = f"{sid}_{k['light']}_{Path(r['image_ID']).stem[-9:]}__orig"
        add(pid, img, face=sid, source='mste', mst=mst, group=group(mst), light=k['light'], cond='orig', base=pid, src=r['image_ID'])
        if k['light'] == 'well' and not every and (sim_subjects is None or k['subject'] in sim_subjects):
            p = T.landmarks3(img)
            for c in (['warm', 'window', 'dim', 'flash', 'backlit', 'jpeg'] if full else SIM):
                add(pid.replace('__orig', f'__{c}'), Condition(c, img, p, seed=k['subject']).apply(img), face=sid, source='mste',
                    mst=mst, group=group(mst), light='sim', cond=c, base=pid, src=r['image_ID'])

    for i, f in enumerate(x for x in a.own.split(',') if x):
        img = shrink(T.rgb(f)); pid = f'own{i}__orig'
        add(pid, img, face=f'own{i}', source='own', mst=None, group='own', light='own', cond='orig', base=pid)

    m = dict(set=a.set, looks=looks, engines=a.engines.split(','), photos=photos)
    (run / 'manifest.json').write_text(json.dumps(m, indent=1))
    print(f'{len(photos)} photos x {len(looks)} looks x {len(m["engines"])} engines = {len(photos) * len(looks) * len(m["engines"])} renders')


if __name__ == '__main__':
    main()
    sys.stdout.flush(); os._exit(0)   # (mediapipe's landmarker raises in its own teardown)
