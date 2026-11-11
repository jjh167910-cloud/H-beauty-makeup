"""How strong each look comes out, region by region, against its catalog photo: the check that no look is washed out
(or overdone) on the way from the catalog to her face.

    python scripts/tinybeauty/strength.py catalog [LOOKS]      # the reference (with each look's recipe) on the bare catalog face
    python scripts/tinybeauty/strength.py renders DIR [LOOKS]  # renders of each look on one face: DIR/<look>.png,
                                                               # DIR/0_bare.png (no makeup) and DIR/points.json
    python scripts/tinybeauty/strength.py sig                  # each look's signature for the try-on's look rail
                                                               # (src/data/look-signatures.json, see SIG_WEIGHT)
LOOKS: comma-separated (default: all). For each look and region (her lids, past her eyes' outer corners where a wing
runs out, cheeks, under her cheekbones, lips, and her face as a whole) the change the makeup makes: the log ratio of
the region's average colour (linear RGB) made up over
bare, for the catalog with the photo's own grading taken out (teacher.grading). Its strength is how much of the
catalog's change it has (the change projected on the catalog's: 100% = as strong), and it strays when that is off by
more than TOL, or where the catalog changes little (under FLOOR), when it changes more than FLOOR. `off` is the part of
the change in another direction (another hue). On the catalog face every look should be close; on another face her own
lips, lids and light differ, so there the numbers show which looks stray, by how much and which way.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import teacher as T

REGIONS = ['lid', 'wing', 'cheek', 'contour', 'lips', 'face']   # (the temples: the catalog's hair falls differently there)
TOL, FLOOR = 0.1, 0.04
# A look's signature: its catalog photo's change per region, weighted by how much a difference there shows (the lips and
# lids most, under the cheekbones and the whole face least). The look rail puts the looks most unlike those before
# first (variedLooks in makeup-styles.ts), so its first pictures show the catalog's range, not four natural looks.
SIG_WEIGHT = {'lid': 1.0, 'wing': 0.8, 'cheek': 0.8, 'contour': 0.4, 'lips': 1.2, 'face': 0.5}


def masks(P, shape, half=0):
    """The regions, placed by the face points (P: MediaPipe points, pixels); with `half` (-1, 1: as teacher.HALF) only
    on that half of the face."""
    H, W = shape; q = np.asarray(P)[:, :2]; ew = T.eye_width(q)
    def poly(idx, grow=0.0):
        r = q[idx]; c = r.mean(0); r = c + (r - c) * (1 + grow)
        m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.int32(np.round(r))], 1); return m.astype(bool)
    def disk(c, r):
        m = np.zeros((H, W), np.uint8); cv2.circle(m, (int(c[0]), int(c[1])), int(r * ew), 1, -1); return m.astype(bool)
    eyes = poly(T.EYE_R, 0.15) | poly(T.EYE_L, 0.15)
    brows = poly(T.BROW_R, 0.3) | poly(T.BROW_L, 0.3)
    lid = (poly(T.EYE_R, 1.0) | poly(T.EYE_L, 1.0)) & ~eyes & ~brows
    lips = poly(T.LIPS_OUT) & ~poly(T.LIPS_IN)
    oval = T.poly_mask((H, W), q, [T.OVAL], scale=0.95) > 0.5
    cheek = (disk(q[205], 0.25) | disk(q[425], 0.25)) & ~lid
    contour = (disk((q[147] + q[213]) / 2, 0.2) | disk((q[376] + q[433]) / 2, 0.2)) & ~cheek
    temple = disk(q[54] + [0, 0.1 * ew], 0.2) | disk(q[284] + [0, 0.1 * ew], 0.2)
    # past each eye's outer corner, where a liner's wing and a smoky eye's edge run out (up to 0.8 eye widths on)
    wing = np.zeros((H, W), np.uint8)
    for inner, outer in ((133, 33), (362, 263)):
        ax = (q[outer] - q[inner]) / np.linalg.norm(q[outer] - q[inner]); up = np.array([ax[1], -ax[0]]); up = up if up[1] < 0 else -up
        o = q[outer]; pts = [o - up * 0.08 * ew, o + ax * 0.8 * ew - up * 0.02 * ew, o + ax * 0.8 * ew + up * 0.4 * ew, o + up * 0.3 * ew]
        cv2.fillConvexPoly(wing, np.int32(np.round(pts)), 1)
    wing = wing.astype(bool) & ~poly(T.EYE_R, 0.15) & ~poly(T.EYE_L, 0.15) & ~brows
    face = oval & ~poly(T.LIPS_OUT, 0.15) & ~(poly(T.EYE_R, 1.2) | poly(T.EYE_L, 1.2)) & ~brows
    out = dict(lid=lid, wing=wing & ~lid, cheek=cheek & oval, contour=contour & oval, temple=temple & oval, lips=lips, face=face)
    if half:
        a, d = q[10], q[152] - q[10]; ys, xs = np.mgrid[0:H, 0:W]
        side = np.sign(d[0] * (ys - a[1]) - d[1] * (xs - a[0]))
        side33 = np.sign(d[0] * (q[33, 1] - a[1]) - d[1] * (q[33, 0] - a[0]))   # point 33's half is -1
        keep = side == (-side33 if half == 1 else side33)
        out = {k: m & keep for k, m in out.items()}
    return out


def change(bare, made, P, grade=None):
    """Each region's log ratio (3,) of its average colour in `made` over `bare` (uint8 RGB), minus `grade`. On a turned
    face only its near half (the far half is painted from the near one's mirror image, teacher.symmetric)."""
    out = {}
    for k, m in masks(P, bare.shape[:2], -T.far_half(P)).items():
        if m.sum() < 20: continue
        v = np.log((T.lin(made)[m].mean(0) + 1e-3) / (T.lin(bare)[m].mean(0) + 1e-3))
        out[k] = v - (grade if grade is not None else 0)
    return out


def catalog_change(look):
    bare, pb = T._bare()
    return change(bare, T.rgb(T.LOOKS / f'{look}.webp'), pb, T.grading(look))


def verdict(v, ref):
    """(strength: v projected on ref over ref's size, None where ref is under FLOOR; off: the rest of v; strays)"""
    size = float(np.linalg.norm(ref))
    if size < FLOOR:
        d = float(np.linalg.norm(v - ref)); return None, d, d > FLOOR
    k = float(v @ ref) / size ** 2; off = float(np.linalg.norm(v - k * ref))
    return k, off, abs(k - 1) > TOL or off > max(FLOOR, TOL * size)


def report(rows, title):
    print(title)
    print(f"{'look':16s} " + ' '.join(f'{r:>12s}' for r in REGIONS))
    fails = {r: 0 for r in REGIONS}; ks = {r: [] for r in REGIONS}; n = 0
    for look, (got, ref) in rows.items():
        cells = []
        for r in REGIONS:
            if r not in got or r not in ref: cells.append(f"{'-':>12s}"); continue
            k, off, bad = verdict(got[r], ref[r])
            fails[r] += bad
            if k is not None: ks[r].append(k)
            cells.append((f'{k * 100:4.0f}%' if k is not None else '   ~ ') + f' {off:.2f}' + ('*' if bad else ' '))
        n += 1
        print(f'{look:16s} ' + ' '.join(f'{c:>12s}' for c in cells))
    print('median strength: ' + ', '.join(f'{r} {np.median(ks[r]) * 100:.0f}%' for r in REGIONS if ks[r]))
    print('strays (*): ' + ', '.join(f'{r} {fails[r]}/{n}' for r in REGIONS))
    print(f'(each cell: strength as a share of the catalog\'s (~: the catalog changes little there), then how much of the '
          f'change goes another way; * off by more than {TOL:.0%})')


def signatures():
    out = {}
    for look in T.catalog_looks():
        ch = catalog_change(look)
        out[look] = [round(float(x) * w, 3) for r, w in SIG_WEIGHT.items() for x in ch.get(r, np.zeros(3))]
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('catalog', 'renders', 'sig'):
        print(__doc__); raise SystemExit
    if sys.argv[1] == 'sig':
        path = T.REPO / 'src/data/look-signatures.json'
        json.dump(signatures(), open(path, 'w'), separators=(',', ':'))
        print('signatures:', path); raise SystemExit
    if sys.argv[1] == 'catalog':
        looks = sys.argv[2].split(',') if len(sys.argv) > 2 else [l for l in T.catalog_looks() if l != 'no-makeup']
        import products as PR
        bare, pb = T._bare(); rows = {}
        for look in looks:
            rows[look] = (change(bare, PR.paint_look(look, bare, pb), pb), catalog_change(look))
        report(rows, 'The teacher on the bare catalog face vs the catalog photos')
    else:
        d = Path(sys.argv[2])
        looks = sys.argv[3].split(',') if len(sys.argv) > 3 else [l for l in T.catalog_looks() if l != 'no-makeup' and (d / f'{l}.png').exists()]
        bare = T.rgb(d / '0_bare.png'); P = np.array(json.load(open(d / 'points.json')))
        rows = {look: (change(bare, T.rgb(d / f'{look}.png'), P), catalog_change(look)) for look in looks}
        report(rows, f'Renders in {d} vs the catalog photos')
        json.dump({l: {'here': {r: v.round(4).tolist() for r, v in g.items()}, 'catalog': {r: v.round(4).tolist() for r, v in c.items()}}
                   for l, (g, c) in rows.items()}, open(d / 'strength.json', 'w'))
