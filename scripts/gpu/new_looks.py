"""New looks' catalog photos, drawn on Kaggle's free GPU (or any GPU) by FLUX 3 Image Klein.

A catalog photo must be an edit of the bare catalog portrait, public/makeup/looks/no-makeup.webp: the same model,
pose and light, only the makeup changed (the teacher divides one by the other: scripts/tinybeauty/README.md, "Adding a
look"). The salon can't shoot them, so FLUX 3 draws each look in src/data/new-looks.json onto that portrait from its
written makeup, in a few variants (seeds). The artist picks the best one per look; it becomes the look's catalog photo.

Each variant is checked as the pilot checks a teacher: how far the face moved (drift, in eye widths: it must stay the
same model) and how much the skin's colour changed outside the makeup (skin dE). A sheet per look shows the bare
portrait and the variants, the steadiest first.

    python scripts/gpu/new_looks.py                    # env HF_TOKEN (FLUX 3 is gated); 4 variants per look
    python scripts/gpu/new_looks.py --variants 6 --looks icy,wine-lips
    python scripts/gpu/new_looks.py --dry-run          # no GPU: a tint stands in for FLUX 3 (tests the script)

Writes new-looks/ (<look>/<n>.webp at the catalog's size, sheet_<look>.jpg, report.json) and new-looks.zip.
"""
from __future__ import annotations

import argparse, gc, json, re, sys, time, zipfile
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pilot as P  # noqa: E402  (checks, crops, sheets)
import free_test as F  # noqa: E402  (FLUX 3 on a free GPU)
T = P.T
REPO = HERE.parent.parent
NEW = REPO / 'src/data/new-looks.json'

FRAME = ('Edit this photo: give the woman this makeup look, done by a professional makeup artist. Change only her makeup. '
         'Keep her face, identity, face shape, skin tone and skin texture, expression, pose, hair, earrings, lighting, '
         'background, framing and camera exactly the same. Makeup: {makeup} Photorealistic beauty photograph, real skin '
         'texture, sharp focus, no retouching, no filter.')


def enums() -> dict[str, set[str]]:
    """The FaceLook types' allowed values, read from src/data/makeup-styles.ts (so the two can't drift apart)."""
    src = (REPO / 'src/data/makeup-styles.ts').read_text(encoding='utf-8')
    out = {}
    for name in ('Skin', 'Shadow', 'Liner', 'Lashes', 'Brow', 'Blush', 'LipFinish', 'Accent'):
        m = re.search(rf'export type {name} = ([^;]+);', src)
        out[name] = set(re.findall(r'"([a-zA-Z]+)"', m.group(1)))
    return out


def validate(looks: list[dict]) -> None:
    """Each new look is a FaceLook the engine can paint, with a Persian title and its written makeup."""
    e = enums(); hexc = re.compile(r'^#[0-9a-f]{6}$')
    field = {'skin': 'Skin', 'shadow': 'Shadow', 'liner': 'Liner', 'lashes': 'Lashes', 'brow': 'Brow', 'blush': 'Blush', 'lip': 'LipFinish'}
    taken = set(P.catalog())
    for x in looks:
        L = x['look']; where = x['id']
        assert re.fullmatch(r'[a-z0-9-]+', where) and where not in taken, f'{where}: id taken or not kebab-case'
        assert x['title'] and x['makeup'], f'{where}: title and makeup needed'
        for k, t in field.items(): assert L[k] in e[t], f'{where}: {k} {L[k]!r} not one of {sorted(e[t])}'
        for a in L.get('accents', []): assert a in e['Accent'], f'{where}: accent {a!r}'
        for c in [*L['lid'], L['blushColor'], L['lipColor'], *([L['linerColor']] if 'linerColor' in L else [])]:
            assert hexc.match(c), f'{where}: colour {c!r}'


class Flux3Edit(F.Flux3Free):
    """FLUX 3 Image Klein on a free GPU (see free_test.py), editing one picture from a written prompt."""

    def edit(self, img, prompt, seed):
        from PIL import Image
        h, w = img.shape[:2]
        while True:
            f = F.fit(img, self.side)
            with self.torch.inference_mode():
                out = self.pipe(prompt=prompt, image=[Image.fromarray(f)], height=f.shape[0], width=f.shape[1],
                                generator=self.torch.manual_seed(seed), output='images')
            out = np.asarray(out[0].convert('RGB'))
            if np.isfinite(out).all() and out.std() > 2: return cv2.resize(out, (w, h), interpolation=cv2.INTER_AREA)
            rest = [d for d in self.dtypes if self.dtypes.index(d) > self.dtypes.index(self.dtype)]
            if not rest: raise RuntimeError(f'blank image in {self.dtype}; this GPU is too old for FLUX 3')
            print(f'FLUX 3: blank image in {self.dtype}, retrying in {rest[0]}', flush=True)
            self.load(rest[0])


class Tint:
    """--dry-run: the lips tinted with the look's colour, slightly moved per seed, stand in for FLUX 3."""
    note = 'dry run'
    def __init__(self): self.look = None
    def edit(self, img, prompt, seed):
        p = T.landmarks3(img); m = T.regions(img.shape[:2], p[:, :2])['mouth'].astype(np.float32)[..., None]
        c = np.array([int(self.look['lipColor'][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
        out = img.astype(np.float32) * (1 - 0.5 * m) + c * 0.5 * m
        return cv2.warpAffine(np.clip(out, 0, 255).astype(np.uint8), np.float32([[1, 0, seed % 3], [0, 1, 0]]), img.shape[1::-1],
                              borderMode=cv2.BORDER_REFLECT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--looks', default='all', help='ids from src/data/new-looks.json, comma-separated, or all')
    ap.add_argument('--variants', type=int, default=4, help='pictures per look (seeds), for the artist to choose from')
    ap.add_argument('--side', type=int, default=1200, help="FLUX 3's working size (the catalog photos are 900 x 1200)")
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--out', default=str(Path.cwd() / 'new-looks'))
    ap.add_argument('--max-minutes', type=float, default=0, help='stop in time to write the zip (0: no limit)')
    a = ap.parse_args()
    spec = json.loads(NEW.read_text(encoding='utf-8'))
    looks = [x for x in spec['looks'] if a.looks == 'all' or x['id'] in a.looks.split(',')]
    validate(looks)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    started = time.time()
    late = lambda: a.max_minutes and (time.time() - started) / 60 > a.max_minutes
    bare = T.rgb(T.LOOKS / 'no-makeup.webp'); pb = T.landmarks3(bare)
    assert pb is not None, 'no face found in no-makeup.webp'
    t0 = time.time()
    ai = Tint() if a.dry_run else Flux3Edit(a.side)
    report = {'model': 'FLUX 3 Image Klein', 'note': ai.note, 'load_seconds': round(time.time() - t0), 'looks': {}}
    print(f'ready in {time.time() - t0:.0f}s ({ai.note})', flush=True)
    for x in looks:
        if late(): print(f'{a.max_minutes:.0f} minutes: stopping here ({x["id"]} and the looks after it not drawn).', flush=True); break
        if a.dry_run: ai.look = x['look']
        prompt = FRAME.format(makeup=x['makeup'])
        rec = report['looks'][x['id']] = {'title': x['title'], 'prompt': prompt, 'variants': []}
        (out / x['id']).mkdir(exist_ok=True)
        for n in range(a.variants):
            t = time.time()
            try: o = ai.edit(bare, prompt, seed=1000 + n)
            except Exception as error:
                msg = repr(error)[:400]; rec.setdefault('failures', []).append(msg); print(f'{x["id"]} #{n + 1}: failed {msg}', flush=True)
                if 'too old' in msg: break
                continue
            po = T.landmarks3(o); c = P.checks(bare, o, pb, po)
            cv2.imwrite(str(out / x['id'] / f'{n + 1}.webp'), cv2.cvtColor(o, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 92])
            rec['variants'].append({'n': n + 1, 'seconds': round(time.time() - t, 1), **c})
            print(f'{x["id"]} #{n + 1}: {time.time() - t:.0f}s  drift {c["drift"]:.3f}  skin dE {c["skin_dE"]:.1f}', flush=True)
        # (the sheet: the bare portrait, then the variants, the steadiest face first)
        best = sorted(rec['variants'], key=lambda v: (v['drift'] > 0.08, v['drift'] + v['skin_dE'] / 100))
        cols = [P.tile(P.face_crop(bare, pb, 360), 'before')]
        for v in best:
            img = T.rgb(out / x['id'] / f'{v["n"]}.webp')
            cols.append(P.tile(P.face_crop(img, pb, 360), f'#{v["n"]}  drift {v["drift"]:.3f}  dE {v["skin_dE"]:.1f}'))
        h = min(c.shape[0] for c in cols); row = np.hstack([c[:h] for c in cols])
        head = np.full((56, row.shape[1], 3), 255, np.uint8)
        cv2.putText(head, f'{x["id"]}: {x["en"][:90]}', (12, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (40, 30, 40), 2, cv2.LINE_AA)
        P.save_jpg(out / f'sheet_{x["id"]}.jpg', np.vstack([head, row]), 88)
        rec['order'] = [v['n'] for v in best]
        gc.collect()
    if not a.dry_run:
        import torch; report['gpu'] = torch.cuda.get_device_name(0)
    report['total_minutes'] = round((time.time() - started) / 60, 1)
    json.dump(report, open(out / 'report.json', 'w'), indent=1, ensure_ascii=False)
    with zipfile.ZipFile(out.parent / 'new-looks.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob('*')):
            if f.is_file(): z.write(f, f.relative_to(out.parent))
    print('ALL DONE ->', out.parent / 'new-looks.zip', flush=True)


if __name__ == '__main__':
    main()
