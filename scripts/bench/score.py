"""The quality benchmark's scorer: every render of a run measured on each line of the rubric, and a report.

    python scripts/bench/score.py RUN_DIR [--baseline OTHER_RUN_DIR] [--note "what changed"] [--rescore | --resume | --photos catalog__]

Reads RUN_DIR/manifest.json, seen/ and renders/ (render.cjs) and truth/ (make_set.py). Writes RUN_DIR/scores.jsonl (one
line per render), RUN_DIR/summary.json and RUN_DIR/report.html (one file, pictures inside: real people's photos, keep it
private), and appends the summary to scripts/bench/history.jsonl.

What is measured (each render against her photo as the app took it, studio light off; colours are CIEDE2000):
- catalog: the catalog model's look against her catalog photo (the truth) in the same light: lip, lid and cheek colour,
  the whole face, and where the colour sits (the change's overlap with the truth's, and its offset in eye widths).
- light: a real face in a known light change (conditions.py): the look painted in that light against the look painted in
  her original light and then put in that light. Same makeup, same light: the colours must match.
- fairness: each look's lipstick hue, and the hue the blush and eyeshadow add, on light, medium and deep skin.
- skin: fine texture kept (pores, fine lines), blotches reduced, her shading kept.
- edges: lip colour outside her lip line; the eye whites changed; highlights blown; anything changed outside her face;
  how far her face moved (landmarks found on the render).
- brows: a look's brow fill on the skin around her own brow (her brow as her photo shows it, brow_mass()), and on the
  catalog model her brows against the catalog photo's (which keeps the model's own).
- under-eye: her under-eye against her cheek just below it (the shading of her eye's hollow): how much a look lifts it,
  and on the catalog model how far that is from the catalog photo's.
"""
from __future__ import annotations

import argparse, base64, datetime, json, os, re, subprocess, sys
from pathlib import Path

import cv2
import numpy as np
from skimage.color import deltaE_ciede2000, rgb2lab

HERE = Path(__file__).resolve().parent
REPO = Path(os.environ.get('HB_REPO', HERE.parent.parent))
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(REPO / 'scripts/bench')); sys.path.insert(0, str(REPO / 'scripts/tinybeauty'))
import teacher as T  # noqa: E402
from conditions import Condition, to_lin  # noqa: E402

UPPER_R = [33, 246, 161, 160, 159, 158, 157, 173, 133]
UPPER_L = [263, 466, 388, 387, 386, 385, 384, 398, 362]
CHEEK_R = [116, 117, 118, 100, 126, 142, 36, 205, 187, 147, 123]
CHEEK_L = [int(T.MIRROR[i]) for i in CHEEK_R]
LID_REACH = 0.55        # the lid zone: from her lash line up this share of the way to her brow


# ------------------------------------------------------------------ helpers
def rgb(path) -> np.ndarray:
    return cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2RGB)


def lab(img: np.ndarray) -> np.ndarray:
    return rgb2lab(img.astype(np.float32) / 255)


def mean_lab(img: np.ndarray, m: np.ndarray):
    """The region's colour: the mean of its light (linear), as Lab."""
    sel = m > 0.5
    if sel.sum() < 20: return None
    lin = to_lin(img)[sel].mean(0)
    s = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    return rgb2lab(s.reshape(1, 1, 3).astype(np.float32))[0, 0]


def ellipse(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(3, int(r) | 1),) * 2)


def lstar(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32) / 2.55


def brow_mass(img: np.ndarray, p: np.ndarray, ew: float) -> np.ndarray:
    """Her brows as her photo shows them (0/1): where her skin, softened past single hairs, is darker than the skin around
    it (a black-hat half an eye width across) by at least 35% of her brows' own darkness, in pieces lying mostly inside
    the face mesh's brow outline. (The mesh's brows sit a few hundredths of an eye width off hers: the app's were 0.03
    lower than the Python face finder's on the catalog model, and its own fill's edge followed them, under her hairs.)"""
    shape = img.shape[:2]
    zone = T.poly_mask(shape, p, [T.BROW_R, T.BROW_L], scale=1.4) > 0
    core = T.poly_mask(shape, p, [T.BROW_R, T.BROW_L], scale=1.0) > 0
    if core.sum() < 20: return np.zeros(shape, np.float32)
    bh = cv2.morphologyEx(cv2.GaussianBlur(lstar(img), (0, 0), max(1.0, ew * 0.025)), cv2.MORPH_BLACKHAT, ellipse(ew * 0.5))
    env = ((bh > max(1.2, 0.35 * np.percentile(bh[core], 90))) & zone).astype(np.uint8)
    env = cv2.morphologyEx(env, cv2.MORPH_OPEN, ellipse(ew * 0.03))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(env)
    keep = np.zeros(shape, np.float32)
    for i in range(1, n):
        m = lab_ == i
        if (m & core).sum() > 0.2 * m.sum() and st[i, cv2.CC_STAT_AREA] > (ew * 0.1) ** 2: keep[m] = 1
    return keep


def de(a, b) -> float | None:
    if a is None or b is None: return None
    return float(deltaE_ciede2000(np.asarray(a)[None, None], np.asarray(b)[None, None])[0, 0])


def hue(a) -> float:
    return float(np.degrees(np.arctan2(a[2], a[1])) % 360)


def hue_gap(hs) -> float:
    """The widest gap between hues (degrees, on the circle)."""
    hs = [h for h in hs if h is not None]
    if len(hs) < 2: return 0.0
    return float(max(min(abs(a - b), 360 - abs(a - b)) for a in hs for b in hs))


def look_colours() -> dict:
    src = (REPO / 'src/data/makeup-styles.ts').read_text(encoding='utf-8')
    out = {}
    for m in re.finditer(r'style\("([a-z0-9-]+)",[^{]*\{([^}]*)\}', src):
        body = m.group(2); g = lambda k: (re.search(rf'{k}: "(#[0-9a-f]{{6}})"', body) or [None, None])[1]
        lid = re.search(r'lid: \["(#[0-9a-f]{6})", "(#[0-9a-f]{6})"\]', body)
        out[m.group(1)] = dict(lip=g('lipColor'), blush=g('blushColor'), lid=list(lid.groups()) if lid else None,
                               finish=(re.search(r'lip: "(\w+)"', body) or [None, None])[1], skin=(re.search(r'skin: "(\w+)"', body) or [None, None])[1])
    return out


def hex_lab(h):
    c = np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32).reshape(1, 1, 3) / 255
    return rgb2lab(c)[0, 0]


class Face:
    """One photo's regions, from the landmarks the app found on it."""

    def __init__(self, img: np.ndarray, p: np.ndarray):
        self.img = img; self.p = p = np.asarray(p, np.float32)[:, :2]
        shape = img.shape[:2]; self.shape = shape
        self.ew = ew = float(T.eye_width(p))
        k = lambda r: np.ones((max(1, int(r)), max(1, int(r))), np.uint8)
        outer = T.poly_mask(shape, p, [T.LIPS_OUT]); inner = T.poly_mask(shape, p, [T.LIPS_IN])
        self.lips = cv2.erode(outer, k(ew * 0.04)) * (1 - cv2.dilate(inner, k(ew * 0.04)))
        near = cv2.dilate(outer, k(ew * 0.06)); ring = cv2.dilate(outer, k(ew * 0.22)); far = cv2.dilate(outer, k(ew * 0.5))
        self.lip_ring = (ring - near) * (1 - cv2.dilate(inner, k(ew * 0.1)))
        self.lip_far = (far - cv2.dilate(outer, k(ew * 0.3))) * (1 - cv2.dilate(inner, k(ew * 0.1)))   # skin a little further out
        self.lids = np.zeros(shape, np.float32)
        for up, brow in ((UPPER_R, T.BROW_LOW_R), (UPPER_L, T.BROW_LOW_L)):
            lid = p[up]; bq = p[brow]; o = np.argsort(bq[:, 0])
            by = np.interp(lid[:, 0], bq[o, 0], bq[o, 1])
            top = np.stack([lid[:, 0], lid[:, 1] + LID_REACH * (by - lid[:, 1])], 1)
            poly = np.vstack([lid, top[::-1]])
            cv2.fillPoly(self.lids, [np.int32(np.round(poly))], 1)
        self.balls = T.poly_mask(shape, p, [T.EYE_R, T.EYE_L], scale=T.BALL_SCALE)
        self.lids *= 1 - cv2.dilate(self.balls, k(ew * 0.08))
        self.cheeks = np.zeros(shape, np.float32)
        for ids in (CHEEK_R, CHEEK_L):
            cv2.fillConvexPoly(self.cheeks, np.int32(cv2.convexHull(p[ids])), 1)
        self.face = T.poly_mask(shape, p, [T.OVAL])
        brows = T.poly_mask(shape, p, [T.BROW_R, T.BROW_L], scale=1.3)
        eyes = T.poly_mask(shape, p, [T.EYE_R, T.EYE_L], scale=1.8)
        self.skin = cv2.erode(self.face, k(ew * 0.25)) * (1 - cv2.dilate(outer, k(ew * 0.25))) * (1 - cv2.dilate(np.maximum(brows, eyes), k(ew * 0.3)))
        self.outside = 1 - cv2.dilate(self.face, k(ew * 1.2))
        # eyes and lids up to the brows: where eye makeup goes (for the placement check). Not the brows themselves: every
        # look fills her brows (a step of its own) and the catalog photos kept the model's, so they counted as eyeshadow
        # put where the catalog has none (about a third of the "misplaced" area, benchmark 2026-11).
        hull = np.zeros(shape, np.float32)
        for ring, brow in ((T.EYE_R, T.BROW_R), (T.EYE_L, T.BROW_L)):
            cv2.fillConvexPoly(hull, np.int32(cv2.convexHull(np.vstack([p[ring], p[brow]]))), 1)
        self.eyezone = cv2.dilate(hull, k(ew * 0.25)) * (1 - self.balls) * (1 - cv2.dilate(brows, k(ew * 0.06)))
        # her brows (as her photo shows them) and the skin around them within a brow product's reach, less her lids
        self.browzone = T.poly_mask(shape, p, [T.BROW_R, T.BROW_L], scale=1.3)
        self.brow_skin = self.browzone * (1 - cv2.dilate(brow_mass(img, p, ew), ellipse(ew * 0.06))) * (1 - cv2.dilate(self.lids, k(ew * 0.03)))
        # under each eye (the hollow a concealer goes on) and her cheek just below it (where the concealer's reference is)
        ax = p[263] - p[33]; ax = ax / max(np.linalg.norm(ax), 1e-6); dn = np.array([-ax[1], ax[0]])
        if dn @ (p[152] - p[10]) < 0: dn = -dn
        ys, xs = np.mgrid[0:shape[0], 0:shape[1]] + 0.5
        self.under = np.zeros(shape, bool); self.cheek_below = np.zeros(shape, bool)
        for ids, o in ((T.EYE_R, -1), (T.EYE_L, 1)):
            e = p[ids].mean(0); u = e + dn * ew * 0.42 + ax * o * ew * 0.05; c = e + dn * ew * 0.85 + ax * o * ew * 0.1
            du, dc = np.stack([xs - u[0], ys - u[1]], -1), np.stack([xs - c[0], ys - c[1]], -1)
            self.under |= (du @ ax / (ew * 0.3)) ** 2 + (du @ dn / (ew * 0.1)) ** 2 <= 1
            self.cheek_below |= (dc ** 2).sum(-1) <= (ew * 0.18) ** 2
        self.under &= self.balls < 0.5

    def hollow(self, img):
        """Her under-eye against her cheek just below it (L*): negative, darker; the shading of her eye's hollow."""
        L = lstar(img)
        return float(L[self.under].mean() - L[self.cheek_below].mean())

    def colours(self, img):
        return dict(lip=mean_lab(img, self.lips), lid=mean_lab(img, self.lids * (1 - self.strands(img))), cheek=mean_lab(img, self.cheeks))

    def strands(self, img):
        """Lashes and liner strands on her lids: thin lines darker than around them (a black-hat), left out of the lid's
        colour so it is her eyeshadow's (the engine draws a look's lashes over her own; the catalog photo has only its own)."""
        L = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)[..., 0]
        r = max(3, int(round(self.ew * 0.05)) | 1)
        bh = cv2.morphologyEx(L, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r)))
        return (bh > 10).astype(np.float32)


def texture(bare: np.ndarray, out: np.ndarray, m: np.ndarray, ew: float) -> dict:
    """Fine texture kept (pores, fine lines: render/bare), blotches left (mid-scale unevenness), shading kept (correlation)."""
    Y = lambda im: cv2.cvtColor(im, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
    yb, yo = Y(bare), Y(out); sel = m > 0.5
    if sel.sum() < 200: return {}
    s1 = max(0.8, ew * 0.012); s2 = max(2.0, ew * 0.05); s3 = ew * 0.3
    fine = lambda y: y - cv2.GaussianBlur(y, (0, 0), s1)
    mid = lambda y: cv2.GaussianBlur(y, (0, 0), s1) - cv2.GaussianBlur(y, (0, 0), s2)
    low = lambda y: cv2.GaussianBlur(y, (0, 0), s3)
    a, b = low(yb)[sel], low(yo)[sel]
    return dict(fine=float(fine(yo)[sel].std() / max(1e-3, fine(yb)[sel].std())),
                blotch=float(mid(yo)[sel].std() / max(1e-3, mid(yb)[sel].std())),
                shading=float(np.corrcoef(a, b)[0, 1]) if a.std() > 1e-3 and b.std() > 1e-3 else 1.0)


def de_map(a: np.ndarray, b: np.ndarray, sigma: float = 0) -> np.ndarray:
    if sigma > 0:
        a = cv2.GaussianBlur(a, (0, 0), sigma); b = cv2.GaussianBlur(b, (0, 0), sigma)
    return deltaE_ciede2000(lab(a), lab(b)).astype(np.float32)


def placement(f: Face, bare, out, truth) -> dict:
    """Where the colour went, against the truth's: overlap (IoU) of the clearly changed area around the eyes and on the
    cheeks, and the offset of its centre (eye widths)."""
    s = f.ew * 0.04
    dr, dt = de_map(bare, out, s), de_map(bare, truth, s)
    res = {}
    for name, zone in (('eyes', f.eyezone), ('cheeks', cv2.dilate(f.cheeks, np.ones((int(f.ew * 0.6),) * 2, np.uint8)))):
        z = zone > 0.5; a, b = (dr > 4) & z, (dt > 4) & z
        if b.sum() < 30: continue
        res[f'iou_{name}'] = float((a & b).sum() / max(1, (a | b).sum()))
        if a.sum() >= 30:
            ya, xa = np.nonzero(a); yb, xb = np.nonzero(b)
            res[f'shift_{name}'] = float(np.hypot(xa.mean() - xb.mean(), ya.mean() - yb.mean()) / f.ew)
    return res


# ------------------------------------------------------------------ scoring
def score_run(run: Path, resume: bool = False, only: str = '') -> list[dict]:
    M = json.loads((run / 'manifest.json').read_text())
    photos = {p['id']: p for p in M['photos']}
    seen = {}

    def get_seen(pid):
        if pid not in seen:
            f = run / 'seen' / f'{pid}.png'
            if not f.exists(): seen[pid] = None; return None
            j = json.loads((run / 'seen' / f'{pid}.json').read_text())
            img = rgb(f); seen[pid] = (img, j, Face(img, np.array(j['points'])))
        return seen[pid]

    def full_render(pid, engine, look):
        s = get_seen(pid); f = run / 'renders' / engine / look / f'{pid}.png'
        if s is None or not f.exists(): return None
        img, j, _ = s; x, y, w, h = j['crop']; out = img.copy(); out[y:y + h, x:x + w] = rgb(f)
        return out

    conds = {}

    def condition(p):
        """The light change of a simulated photo, rebuilt as make_set.py made it (from the original photo)."""
        key = p['id']
        if key not in conds:
            base = photos[p['base']]
            bimg = rgb(run / base['file']); pb = T.landmarks3(bimg)
            seed = 7 if p['face'] == 'catalog' else int(p['face'][4:])
            conds[key] = Condition(p['cond'], bimg, pb, seed)
        return conds[key]

    # each photo's rows are kept as they come (scores.partial.jsonl), so a run cut off goes on with --resume
    partial = run / ('scores.partial.jsonl' if not only else f'scores.partial.{only}.jsonl')
    rows = [json.loads(l) for l in partial.read_text().splitlines() if l] if resume and partial.exists() else []
    if not resume: partial.unlink(missing_ok=True)
    done = {r['photo'] for r in rows}
    for p in M['photos']:
        if p['id'] in done or not p['id'].startswith(only): continue
        # only this photo and the one it was made from stay loaded (a Face's full-size masks are about 100 MB: keeping
        # every photo's ran a 59-photo run out of memory)
        for k in [k for k in seen if k not in (p['id'], p['base'])]: del seen[k]
        for k in [k for k in conds if k != p['id']]: del conds[k]
        n0 = len(rows)
        s = get_seen(p['id'])
        if s is None: continue
        bare, j, f = s
        bare_c = f.colours(bare)
        pl = T.landmarks3(bare)      # the same face finder on her photo, so "moved" is not two finders disagreeing
        for engine in M['engines']:
            for look in M['looks']:
                out = full_render(p['id'], engine, look)
                if out is None: continue
                r = dict(photo=p['id'], face=p['face'], source=p['source'], group=p['group'], mst=p['mst'], light=p['light'],
                         cond=p['cond'], engine=engine, look=look)
                oc = f.colours(out)
                for k in ('lip', 'lid', 'cheek'):
                    r[f'{k}_lab'] = None if oc[k] is None else [round(float(v), 2) for v in oc[k]]
                    r[f'{k}_change'] = de(oc[k], bare_c[k])
                # catalog truth
                tf = run / 'truth' / look / f"{p['id']}.png"
                if tf.exists():
                    truth = rgb(tf)
                    if truth.shape == out.shape:
                        tc = f.colours(truth)
                        for k in ('lip', 'lid', 'cheek'): r[f'cat_{k}'] = de(oc[k], tc[k])
                        dm = de_map(out, truth, max(1.0, f.ew * 0.02))
                        r['cat_face'] = float(dm[f.face > 0.5].mean())
                        r.update({f'cat_{k}': v for k, v in placement(f, bare, out, truth).items()})
                        if (f.browzone > 0.5).sum() > 50:     # (softened past single hairs: the photos are aligned to ~0.2 px)
                            r['cat_brow'] = float(de_map(out, truth, max(1.0, f.ew * 0.05))[f.browzone > 0.5].mean())
                        r['cat_hollow'] = abs(f.hollow(out) - f.hollow(truth))
                # light consistency: the look in this light against the look in her own light, put in this light
                if p['cond'] not in ('orig',) and p['light'] == 'sim':
                    ref = full_render(p['base'], engine, look)
                    if ref is not None:
                        cond = condition(p)
                        truth = cond.apply(ref)
                        bs = get_seen(p['base'])
                        fb = bs[2] if bs else f           # the same pixels in both: her regions in the original photo
                        tc, oc2 = fb.colours(truth), fb.colours(out)
                        for k in ('lip', 'lid', 'cheek'): r[f'light_{k}'] = de(oc2[k], tc[k])
                        # how much the makeup changed in this light, against how much it should have (truth vs bare in this light)
                        bc = fb.colours(cond.apply(bs[0])) if bs else None
                        if bc:
                            for k in ('lip', 'lid', 'cheek'):
                                want, got = de(tc[k], bc[k]), de(oc2[k], bc[k])
                                if want and want > 2: r[f'light_{k}_strength'] = got / want
                # skin, edges, eyes, her face
                r.update({f'skin_{k}': v for k, v in texture(bare, out, f.skin, f.ew).items()})
                dm = de_map(bare, out)
                # lip colour past the lip line: the change just outside her lips beyond the change on the skin a little
                # further out (her foundation), as a share of the lips' own change
                lip_in = dm[f.lips > 0.5].mean() if (f.lips > 0.5).sum() > 20 else 0
                skin_out = dm[f.lip_far > 0.5].mean() if (f.lip_far > 0.5).sum() > 20 else 0
                if lip_in - skin_out > 3 and (f.lip_ring > 0.5).sum() > 20:
                    r['edge_bleed'] = float(max(0.0, dm[f.lip_ring > 0.5].mean() - skin_out) / (lip_in - skin_out))
                r['eye_whites'] = float(dm[f.balls > 0.5].mean()) if (f.balls > 0.5).sum() > 20 else None
                if (f.brow_skin > 0.5).sum() > 50:    # a brow fill past her own brow: how much darker the skin around it went
                    r['brow_spill'] = float(np.maximum(0, cv2.GaussianBlur(lstar(bare) - lstar(out), (0, 0), max(1.0, f.ew * 0.02)))[f.brow_skin > 0.5].mean())
                if f.under.sum() > 50 and f.cheek_below.sum() > 50: r['hollow_lift'] = f.hollow(out) - f.hollow(bare)
                r['outside'] = float(np.abs(out.astype(np.int16) - bare.astype(np.int16))[f.outside > 0.5].mean())
                fz = f.face > 0.5
                # blown highlights (a channel newly at 255); crushed blacks are counted apart and not held against it:
                # a black liner or a dark eyeshadow in a dark photo is that dark (the benchmark's poorly lit faces)
                r['clipped'] = float(((out[fz] >= 254).any(1) & ~(bare[fz] >= 254).any(1)).mean())
                r['crushed'] = float(((out[fz] <= 1).any(1) & ~(bare[fz] <= 1).any(1)).mean())
                po = T.landmarks3(out)
                r['drift'] = None if po is None or pl is None else float(np.linalg.norm(po[:468, :2] - pl[:468, :2], axis=1).mean() / f.ew)
                rows.append(r)
        with open(partial, 'a') as fh: fh.writelines(json.dumps(r) + '\n' for r in rows[n0:])
        print(p['id'], flush=True)
    return rows


# ------------------------------------------------------------------ summary
TARGETS = {   # line: (key, direction, target, where it comes from)
    'Catalog colour (lip, lid, cheek)': ('cat_colour', 'max', 3.0, 'roadmap: lip within ΔE 3'),
    'Catalog whole face': ('cat_face', 'max', 3.0, 'starting guess'),
    'Placement overlap (eyes)': ('cat_iou_eyes', 'min', 0.6, 'starting guess'),
    'Placement offset (eyes, eye widths)': ('cat_shift_eyes', 'max', 0.05, 'starting guess'),
    'Brows against the catalog (ΔE)': ('cat_brow', 'max', 3.0, 'starting guess'),
    'Brow fill past her brow (L* darker)': ('brow_spill', 'max', 1.5, 'starting guess'),
    'Under-eye against the catalog (L*, against her cheek)': ('cat_hollow', 'max', 3.0, 'starting guess'),
    'Under-eye lifted (L*, against her cheek)': ('hollow_lift', 'max', 6.0, 'starting guess: the catalog photos change it by -6 to +3.5'),
    'Same look in another light': ('light_colour', 'max', 3.0, 'starting guess'),
    'Skin-tone fairness, lipstick hue gap (°)': ('fair_lip', 'max', 10.0, 'starting guess'),
    'Fine texture kept (share of bare)': ('skin_fine', 'range', (0.55, 0.95), 'starting guess'),
    'Shading kept (correlation)': ('skin_shading', 'min', 0.95, 'starting guess'),
    'Lip colour past the lip line (share)': ('edge_bleed', 'max', 0.15, 'starting guess'),
    'Eye whites changed (ΔE)': ('eye_whites', 'max', 1.5, 'starting guess'),
    'Changed outside her face (0-255)': ('outside', 'max', 0.5, 'roadmap: nothing outside the makeup'),
    'Newly blown highlights (share of face)': ('clipped', 'max', 0.001, 'roadmap: no clipping'),
    'Face moved (landmarks, eye widths)': ('drift', 'max', 0.04, 'starting guess: the face finder itself moves ~0.02 when only colour changes'),
}


def pct(v, q):
    v = [x for x in v if x is not None and np.isfinite(x)]
    return float(np.percentile(v, q)) if v else None


def summarise(rows: list[dict], looks: list[str]) -> dict:
    S = {}
    for engine in sorted({r['engine'] for r in rows}):
        R = [r for r in rows if r['engine'] == engine]
        vals = {}
        vals['cat_colour'] = [r.get(f'cat_{k}') for r in R for k in ('lip', 'lid', 'cheek')]
        vals['light_colour'] = [r.get(f'light_{k}') for r in R for k in ('lip', 'lid', 'cheek')]
        for k in ('cat_face', 'cat_iou_eyes', 'cat_shift_eyes', 'cat_brow', 'brow_spill', 'cat_hollow', 'hollow_lift', 'skin_fine', 'skin_shading', 'skin_blotch', 'edge_bleed', 'eye_whites', 'outside', 'clipped', 'drift'):
            vals[k] = [r.get(k) for r in R]
        # fairness: per look, the lipstick hue on light, medium and deep skin (real faces, own light)
        fair = []
        for look in looks:
            hs = []
            for g in ('light', 'medium', 'deep'):
                L = [r['lip_lab'] for r in R if r['look'] == look and r['group'] == g and r['cond'] == 'orig' and r['source'] == 'mste' and r.get('lip_lab') and (r.get('lip_change') or 0) > 4]
                if L: hs.append(hue(np.mean(L, 0)))
            if len(hs) == 3: fair.append(hue_gap(hs))
        vals['fair_lip'] = fair
        E = {}
        for name, (key, way, target, src) in TARGETS.items():
            v = vals.get(key, [])
            med, p90, p10 = pct(v, 50), pct(v, 90), pct(v, 10)
            if med is None: E[name] = dict(key=key, n=0); continue
            worst = p10 if way == 'min' else p90
            if way == 'range': ok = target[0] <= (p10 or 0) and (p90 or 9) <= target[1]
            elif way == 'min': ok = worst >= target
            else: ok = worst <= target
            n = len([x for x in v if x is not None])
            E[name] = dict(key=key, n=n, median=med, worst=worst, target=target, way=way, src=src, ok=bool(ok))
        # by skin-tone group and by look, a few headline numbers
        by = {}
        for g in ('light', 'medium', 'deep', 'catalog'):
            G = [r for r in R if r['group'] == g]
            by[g] = dict(light=pct([r.get(f'light_{k}') for r in G for k in ('lip', 'lid', 'cheek')], 50),
                         fine=pct([r.get('skin_fine') for r in G], 50), bleed=pct([r.get('edge_bleed') for r in G], 50),
                         lip_change=pct([r.get('lip_change') for r in G], 50))
        bylook = {}
        for look in looks:
            G = [r for r in R if r['look'] == look]
            bylook[look] = dict(cat=pct([r.get(f'cat_{k}') for r in G for k in ('lip', 'lid', 'cheek')], 50),
                                light=pct([r.get(f'light_{k}') for r in G for k in ('lip', 'lid', 'cheek')], 50),
                                fine=pct([r.get('skin_fine') for r in G], 50), bleed=pct([r.get('edge_bleed') for r in G], 50))
        S[engine] = dict(lines=E, groups=by, looks=bylook, renders=len(R))
    return S


# ------------------------------------------------------------------ report
def thumb(img, f: Face, h=300):
    p = f.p; x0, x1 = p[:, 0].min(), p[:, 0].max(); y0, y1 = p[:, 1].min(), p[:, 1].max(); fw = x1 - x0
    x0, x1 = int(max(0, x0 - 0.15 * fw)), int(min(img.shape[1], x1 + 0.15 * fw)); y0, y1 = int(max(0, y0 - 0.1 * fw)), int(min(img.shape[0], y1 + 0.05 * fw))
    c = img[y0:y1, x0:x1]; k = h / c.shape[0]
    return cv2.resize(c, (int(c.shape[1] * k), h), interpolation=cv2.INTER_AREA)


def b64jpg(img) -> str:
    ok, buf = cv2.imencode('.jpg', cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])
    return 'data:image/jpeg;base64,' + base64.b64encode(buf).decode()


def report(run: Path, rows, S, baseline=None, note=''):
    M = json.loads((run / 'manifest.json').read_text())
    def fmt(v, key=''):
        if v is None: return '–'
        if isinstance(v, tuple): return f'{v[0]:g} to {v[1]:g}'
        return f'{v:.3f}' if abs(v) < 1 else f'{v:.1f}' if abs(v) < 100 else f'{v:.0f}'
    css = ('body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px;color:#1d1a1c;background:#fbfafa}'
           'table{border-collapse:collapse;width:100%;margin:8px 0 24px;font-size:14px}th,td{border-bottom:1px solid #e3dfe1;padding:6px 8px;text-align:left;vertical-align:top}'
           'th{background:#f1eef0}.ok{color:#17803d;font-weight:600}.no{color:#b3261e;font-weight:600}.wrap{overflow-x:auto}'
           '.g{display:flex;flex-wrap:wrap;gap:12px}.c{background:#fff;border:1px solid #e3dfe1;border-radius:8px;padding:8px}.c img{height:220px;display:block}'
           '.row{display:flex;gap:4px}.cap{font-size:12px;color:#5c565a;max-width:460px}h2{margin-top:32px}small{color:#5c565a}')
    h = [f'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Try-on benchmark</title><style>{css}</style>']
    h.append(f'<h1>Try-on quality benchmark</h1><p>{datetime.datetime.now(datetime.UTC):%Y-%m-%d %H:%M} UTC · set <b>{M["set"]}</b> · '
             f'{len(M["photos"])} photos × {len(M["looks"])} looks × {len(M["engines"])} engines = {len(rows)} renders scored. {note}</p>'
             '<p><small>Real faces: MST-E (Google and TONL, 2023), 19 people across the 10 Monk skin tones, phone photos in good and poor light; '
             'used only to measure, never to fit. Private: do not share this file.</small></p>')
    for engine, E in S.items():
        B = (baseline or {}).get(engine, {}).get('lines', {})
        h.append(f'<h2>Engine {engine} ({E["renders"]} renders)</h2><div class="wrap"><table><tr><th>Line</th><th>Median</th><th>Worst 10%</th><th>Target</th><th>Pass</th>'
                 + ('<th>Baseline worst</th>' if B else '') + '<th>Target from</th></tr>')
        for name, e in E['lines'].items():
            if not e.get('n'): h.append(f'<tr><td>{name}</td><td colspan="5">no data</td></tr>'); continue
            b = B.get(name, {})
            h.append(f'<tr><td>{name}</td><td>{fmt(e["median"])}</td><td>{fmt(e["worst"])}</td><td>{"≤" if e["way"]=="max" else "≥" if e["way"]=="min" else ""} {fmt(e["target"] if not isinstance(e["target"], list) else tuple(e["target"]))}</td>'
                     f'<td class="{"ok" if e["ok"] else "no"}">{"yes" if e["ok"] else "no"}</td>' + (f'<td>{fmt(b.get("worst"))}</td>' if B else '') + f'<td><small>{e["src"]}</small></td></tr>')
        h.append('</table></div><h3>By skin tone (medians)</h3><div class="wrap"><table><tr><th>Group</th><th>Same look in another light (ΔE)</th><th>Fine texture kept</th><th>Lip colour past the line</th><th>Lip change (ΔE)</th></tr>')
        for g, v in E['groups'].items():
            h.append(f'<tr><td>{g}</td><td>{fmt(v["light"])}</td><td>{fmt(v["fine"])}</td><td>{fmt(v["bleed"])}</td><td>{fmt(v["lip_change"])}</td></tr>')
        h.append('</table></div><h3>By look (medians)</h3><div class="wrap"><table><tr><th>Look</th><th>Catalog colour ΔE</th><th>Another light ΔE</th><th>Fine texture kept</th><th>Past the lip line</th></tr>')
        for look, v in E['looks'].items():
            h.append(f'<tr><td>{look}</td><td>{fmt(v["cat"])}</td><td>{fmt(v["light"])}</td><td>{fmt(v["fine"])}</td><td>{fmt(v["bleed"])}</td></tr>')
        h.append('</table></div>')
    # the worst pictures, by the lines that matter most
    h.append('<h2>The worst renders</h2><p><small>Each: her photo · the render · (the truth, where there is one). The engine, the look and why it is listed underneath.</small></p>')
    photos = {p['id']: p for p in M['photos']}
    picks = []
    for key, rev, why in (('light_lip', True, 'lipstick changed with the light'), ('light_lid', True, 'eyeshadow changed with the light'),
                          ('light_cheek', True, 'blush changed with the light'), ('cat_lip', True, 'catalog lipstick off'), ('cat_lid', True, 'catalog eyeshadow off'),
                          ('edge_bleed', True, 'colour past the lip line'), ('skin_fine', False, 'skin texture lost'), ('eye_whites', True, 'eye whites changed'),
                          ('drift', True, 'face moved')):
        R = sorted([r for r in rows if r.get(key) is not None], key=lambda r: r[key], reverse=rev)[:3]
        picks += [(r, why, key) for r in R]
    h.append('<div class="g">')
    done = set()
    for r, why, key in picks:
        ident = (r['photo'], r['engine'], r['look'])
        if ident in done: continue
        done.add(ident)
        img = rgb(run / 'seen' / f"{r['photo']}.png"); j = json.loads((run / 'seen' / f"{r['photo']}.json").read_text())
        f = Face(img, np.array(j['points']))
        x, y, w, hh = j['crop']; out = img.copy(); out[y:y + hh, x:x + w] = rgb(run / 'renders' / r['engine'] / r['look'] / f"{r['photo']}.png")
        tiles = [thumb(img, f), thumb(out, f)]
        if key.startswith('light'):
            p = photos[r['photo']]; bimg = rgb(run / photos[p['base']]['file'])
            bs = run / 'seen' / f"{p['base']}.png"; bj = json.loads((run / 'seen' / f"{p['base']}.json").read_text())
            ref = rgb(bs).copy(); x2, y2, w2, h2 = bj['crop']; ref[y2:y2 + h2, x2:x2 + w2] = rgb(run / 'renders' / r['engine'] / r['look'] / f"{p['base']}.png")
            seed = 7 if p['face'] == 'catalog' else int(p['face'][4:])
            tiles.append(thumb(Condition(p['cond'], bimg, T.landmarks3(bimg), seed).apply(ref), f))
        tf = run / 'truth' / r['look'] / f"{r['photo']}.png"
        if tf.exists(): tiles.append(thumb(rgb(tf), f))
        imgs = ''.join(f'<img src="{b64jpg(t)}">' for t in tiles)
        h.append(f'<div class="c"><div class="row">{imgs}</div><div class="cap"><b>{why}</b>: {key} = {r[key]:.3f} · {r["engine"]} · {r["look"]} · {r["photo"]} ({r["group"]}, {r["cond"]})</div></div>')
    h.append('</div>')
    (run / 'report.html').write_text('\n'.join(h), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('run'); ap.add_argument('--baseline'); ap.add_argument('--note', default='')
    ap.add_argument('--rescore', action='store_true', help='score again even if scores.jsonl exists')
    ap.add_argument('--resume', action='store_true', help='go on with a scoring run that was cut off (scores.partial.jsonl)')
    ap.add_argument('--photos', default='', help='score again only the photos whose id starts with this (e.g. catalog__), '
                    'their rows replaced in scores.jsonl: after a change to a line measured only there')
    a = ap.parse_args(); run = Path(a.run)
    sf = run / 'scores.jsonl'
    if a.photos:
        old = [json.loads(l) for l in sf.read_text().splitlines()]
        rows = [r for r in old if not r['photo'].startswith(a.photos)] + score_run(run, only=a.photos)
        sf.write_text('\n'.join(json.dumps(r) for r in rows)); (run / f'scores.partial.{a.photos}.jsonl').unlink(missing_ok=True)
    elif sf.exists() and not a.rescore and not a.resume: rows = [json.loads(l) for l in sf.read_text().splitlines()]
    else:
        rows = score_run(run, a.resume); sf.write_text('\n'.join(json.dumps(r) for r in rows))
        (run / 'scores.partial.jsonl').unlink(missing_ok=True)
    M = json.loads((run / 'manifest.json').read_text())
    S = summarise(rows, M['looks'])
    (run / 'summary.json').write_text(json.dumps(S, indent=1))
    base = json.loads((Path(a.baseline) / 'summary.json').read_text()) if a.baseline else None
    report(run, rows, S, base, a.note)
    commit = subprocess.run(['git', '-C', str(REPO), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    with open(HERE / 'history.jsonl', 'a') as fh:
        fh.write(json.dumps(dict(when=f'{datetime.datetime.now(datetime.UTC):%Y-%m-%dT%H:%M}Z', commit=commit, set=M['set'], run=run.name, note=a.note,
                                 lines={e: {n: {k: v for k, v in x.items() if k in ('median', 'worst', 'ok')} for n, x in s['lines'].items()} for e, s in S.items()})) + '\n')
    for e, s in S.items():
        print(e, ' '.join(f"{n.split(' (')[0]}={'ok' if x.get('ok') else 'NO'}" for n, x in s['lines'].items() if x.get('n')))
    sys.stdout.flush()
    os._exit(0)     # mediapipe's face landmarker raises in its own teardown at interpreter exit


if __name__ == '__main__':
    main()
