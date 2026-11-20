"""A catalog look as the graphics-chip engine finishes it: the reference for what the tiny networks learn.

teacher.paint() is the look's layer, lipstick and eye detail. Every catalog look in makeup-gl.ts also carries (see
"Every look finished" in docs/AI_TRYON.md): a concealer that lifts each under-eye towards her cheek just below it,
her brows filled between their hairs in her own hairs' colour with a clean line under them, and its layer, eye detail
and lipstick each made as strong as in its catalog photo (LOOK_GAIN in tryon.ts times src/data/look-gains.json, per
step zone; where a strengthened layer lightens, less of it). This paints all of that, in the engine's order:
foundation, concealer, layer, brows, lipstick, eye detail. (Not the look's recipe products, a shimmer's or a
highlighter's sheen: the tiny networks never had those.)

    python scripts/tinybeauty/finish.py LOOK face.png out.png     # one look on one face, to look at
"""
from __future__ import annotations
import json, re, sys
from functools import lru_cache
from pathlib import Path
import cv2, numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import teacher as T
import products as PR

TRYON_TS = T.REPO / 'src/lib/tryon.ts'
GAINS = T.REPO / 'src/data/look-gains.json'
STEPS = ['base', 'conceal', 'brows', 'shadow', 'liner', 'lashes', 'contour', 'blush', 'glow', 'lips', 'lenses']

# As makeup-gl.ts: a look's concealer (CONCEAL_LOOK...), its brows (BROW_HAIR_Q, BROW_CARVE), a strengthened layer
# (LIGHTEN_GAIN, CHROMA_GAIN); as tryon.ts: the brows' fill (BROW_LOOK_*), lighter on the barest looks.
CONCEAL_LOOK, CONCEAL_LOOK_MAX, CONCEAL_HAIR, CONCEAL_TONE = 0.85, 2.2, 0.8, 0.6
CONCEAL_REF, CONCEAL_Q = (0.85, 0.1, 0.18), 0.6
CONCEAL_ZONE, CONCEAL_LASH = (1.1, 1.45, 0.55, 1.3), (0.2, 0.32)
CONCEAL_LIGHT = {'no-makeup': 0.5, 'clean-girl': 0.7}
BROW_HAIR_Q, BROW_CARVE = 0.3, (0.07, 0.12)
BROW_LOOK_DEEP, BROW_LOOK_FILL, BROW_LOOK = 0.85, 0.55, {'no-makeup': 0.6}
LIGHTEN_GAIN, CHROMA_GAIN = 0.35, 0.5


@lru_cache(None)
def look_gain(look, own_lip=True):
    """LOOK_GAIN (tryon.ts) times the look's own (look-gains.json), per step."""
    m = re.search(r'const LOOK_GAIN[^=]*=\s*\{([^}]*)\}', TRYON_TS.read_text())
    g = {k: float(v) for k, v in re.findall(r'(\w+):\s*([\d.]+)', m.group(1))}
    own = json.load(open(GAINS)).get(look, {}) if GAINS.exists() else {}
    for k, v in own.items():
        if k == 'lips' and not own_lip: continue
        g[k] = g.get(k, 1.0) * float(v)
    return g


def _frame(q):
    ew = T.eye_width(q); ax = q[263] - q[33]; ax = ax / np.linalg.norm(ax)
    return ew, ax, np.array([-ax[1], ax[0]])       # (down the face for an upright one, as uConAx in makeup-gl.ts)


def refs(ul, p):
    """measureFace's concealer references: her cheek's brightness just under each eye (CONCEAL_Q of a disc
    CONCEAL_REF eye widths down and out) and her skin's colour there (over its luminance); her brow hairs' colour."""
    q = np.asarray(p)[:, :2]; ew, ax, dn = _frame(q)
    if dn @ (q[152] - q[10]) < 0: dn = -dn
    H, W = ul.shape[:2]; ys, xs = np.mgrid[0:H, 0:W]; Y = T.luma(ul)
    under, tones = [], []
    for ids, out in ((T.EYE_R, -1), (T.EYE_L, 1)):
        c = q[ids].mean(0) + dn * ew * CONCEAL_REF[0] + ax * out * ew * CONCEAL_REF[1]
        m = (xs - c[0]) ** 2 + (ys - c[1]) ** 2 <= (ew * CONCEAL_REF[2]) ** 2
        under.append(float(np.quantile(Y[m], CONCEAL_Q)) if m.sum() >= 8 else 0.0)
        ok = m & (Y > 1e-4); tones.append(ul[ok] / Y[ok][:, None])
    tone = np.median(np.vstack(tones), 0) if sum(len(t) for t in tones) >= 16 else None
    bm = T.poly_mask((H, W), q, [T.BROW_R, T.BROW_L]) > 0.5
    brow = None
    if bm.sum() >= 20:
        px = ul[bm]; l = T.luma(px); brow = np.median(px[l <= np.quantile(l, BROW_HAIR_Q)], 0)
    return under, tone, brow


def conceal(lu, user, p, under, tone, amount):
    """A look's concealer on her light `lu` (linear, her foundation on): each under-eye towards her cheek below it."""
    if amount <= 0 or tone is None or min(under) <= 0: return lu
    q = np.asarray(p, np.float64)[:, :2]; ew, ax, dn = _frame(q); H, W = lu.shape[:2]
    ys, xs = np.mgrid[0:H, 0:W] + 0.5
    shown = T.eye_shown(p); zs, cs = [], []
    for e, (ids, out) in enumerate(((T.EYE_R, -1), (T.EYE_L, 1))):
        c = q[ids].mean(0) + dn * ew * 0.42 + ax * out * ew * 0.05; cs.append(c)
        dx, dy = xs - c[0], ys - c[1]
        r = np.hypot((dx * ax[0] + dy * ax[1]) / (ew * 0.55 * CONCEAL_ZONE[0]), (dx * dn[0] + dy * dn[1]) / (ew * 0.24 * CONCEAL_ZONE[1]))
        zs.append((1 - T.smoothstep(CONCEAL_ZONE[2], CONCEAL_ZONE[3], r)) * shown[e])
    first = zs[0] >= zs[1]
    ref = np.where(first, under[0], under[1]); k = np.maximum(zs[0], zs[1]) * amount * T.ball_keep((H, W), p)
    eyeC = np.where(first[..., None], cs[0] - dn * ew * 0.42, cs[1] - dn * ew * 0.42)
    grey = cv2.cvtColor(user, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    Ys = T.soften(grey, max(1.2, ew * 0.042)) ** 2.2; y = T.luma(lu)
    gain = np.clip(ref / np.maximum(Ys, 1e-4), 1, CONCEAL_LOOK_MAX) ** CONCEAL_LOOK
    along = (xs - eyeC[..., 0]) * dn[0] + (ys - eyeC[..., 1]) * dn[1]
    near = 1 - T.smoothstep(CONCEAL_LASH[0], CONCEAL_LASH[1], along / ew)
    hair = np.clip((Ys - y) / np.maximum(0.25 * Ys, 1e-4), 0, 1) * near
    lu = lu * (1 + (gain - 1) * k * (1 - CONCEAL_HAIR * hair))[..., None]
    c = lu / np.maximum(T.luma(lu), 1e-5)[..., None]
    return lu * (np.asarray(tone, np.float32) / np.maximum(c, 1e-4)) ** (CONCEAL_TONE * k * (1 - hair))[..., None]


def brows(base, ul, user, p, look, brow, kb):
    """A look's brows (browDefine in makeup-gl.ts): the gaps between her hairs towards her hairs' colour in the light
    there, and a clean line of concealer just under each brow."""
    skin = T.skin_lum(ul, p); amount = BROW_LOOK_FILL * BROW_LOOK.get(look, 1.0)
    if brow is None or not skin or amount <= 0: return base
    q = np.asarray(p, np.float64)[:, :2]; ew, ax, dn = _frame(q); H, W = base.shape[:2]
    zone = cv2.GaussianBlur(T.poly_mask((H, W), q, [T.BROW_R, T.BROW_L], scale=1.15).astype(np.float32), (0, 0),
                            max(0.8, ew * 0.02, 0.9 * T.photo_blur(user, p)))
    broad = PR.shading(ul, p)[1] * skin
    hairC = (np.asarray(brow) / skin * BROW_LOOK_DEEP)[None, None] * broad[..., None]
    yh, y = T.luma(hairC), T.luma(base)
    gap = np.clip((y - yh) / np.maximum(broad - yh, 1e-4), 0, 1)
    a = zone * kb
    base = base + (hairC - base) * (a * amount * gap)[..., None]
    up = -dn * ew * BROW_CARVE[0]                    # (the zone a little further up her face, over this point)
    above = cv2.warpAffine(zone, np.float32([[1, 0, -up[0]], [0, 1, -up[1]]]), (W, H), borderMode=cv2.BORDER_CONSTANT)
    band = np.clip(above - zone * 1.5, 0, 1)
    grey = cv2.cvtColor(user, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    hairs = np.clip(-(grey - cv2.GaussianBlur(grey, (0, 0), max(0.8, ew * 0.028))) / np.maximum(cv2.GaussianBlur(grey, (0, 0), max(1.2, ew * 0.042)), 20 / 255), 0, 1)
    return base * np.exp(BROW_CARVE[1] * band * kb * (1 - hairs))[..., None]


def strengthen(w, RL):
    """The layer `w` (log) made RL times as strong: where it darkens all of it; where it lightens LIGHTEN_GAIN of the
    extra for its lightening and CHROMA_GAIN for its change of hue (as the main pass in makeup-gl.ts)."""
    ly = T.luma(w)[..., None]; R = RL[..., None]; lighter = ly >= 0
    up = np.where(lighter, 1 + (R - 1) * LIGHTEN_GAIN, R) * ly + np.where(lighter, 1 + (R - 1) * CHROMA_GAIN, R) * (w - ly)
    return np.where(R > 1, up, w * R)


def paint_finished(look, face, p, level='natural'):
    """`look` on `face` (RGB uint8, MediaPipe points p) as the engine paints it (see the module's doc)."""
    k_layer, k_lip, k_eye = T.LEVELS[level]; H, W = face.shape[:2]
    lr, pl = T.make_layer(look); tint = T.look_tint(look)
    ul = T.lin(face)
    lu = ul * T.foundation(face, ul, p, None, k_layer, None, None if tint is None else np.asarray(tint) ** k_layer, cover=T.look_cover(look))
    under, tone, brow = refs(ul, p)
    lu = conceal(lu, face, p, under, tone, CONCEAL_LIGHT.get(look, 1.0) * k_layer)
    w, cover = T.mesh_warp(lr, T.symmetric(pl), p, (H, W), z=p[:, 2])
    # through her photo's lens (T.lens_sigma: on a soft photo the look is as soft as the photo), off her eyeballs
    lens = T.lens_sigma(T.photo_blur(face, p), T.eye_width(p[:, :2]))
    w = T.skin_fade(T.soften(T.extend_layer(w, T.feather_map(p, (H, W)) * cover, p, (H, W)), lens), None)
    R = T.regions((H, W), p[:, :2])
    keep = T.ball_keep((H, W), p, lens) * (1 - cv2.GaussianBlur(R['mouth'], (0, 0), 1.5))
    G = look_gain(look); g = lambda k: G.get(k, 1.0)
    A, B = PR.step_zones((H, W), p, 'apples')
    s = A.sum(-1) + B[..., 0]; sc = np.where(s > 1, 1 / np.maximum(s, 1e-6), 1.0)
    RL = np.maximum(0, 1 - s * sc) * g('base') + sc * (A[..., 0] * g('conceal') + B[..., 0] * g('shadow') + A[..., 1] * g('contour')
                                                         + A[..., 2] * g('blush') + A[..., 3] * g('glow'))
    base = lu * np.exp(T.layer_floor(strengthen(T.hair_light(w, face, p, B[..., 1]) * (keep * k_layer)[..., None], RL)))
    base = brows(base, ul, face, p, look, brow, k_layer * T.ball_keep((H, W), p, lens))
    out = T.srgb(T.shoulder(T.apply_lips(base, ul, p, look, k_lip * g('lips'), None), ul))
    RD = B[..., 1] * g('liner') + (1 - B[..., 1]) * g('lashes')
    return T.apply_eyes(out, face, p, look, strength=k_eye * RD)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__); raise SystemExit
    face = T.rgb(sys.argv[2]); p = T.landmarks3(face)
    cv2.imwrite(sys.argv[3], cv2.cvtColor(paint_finished(sys.argv[1], face, p), cv2.COLOR_RGB2BGR))
    print(sys.argv[3])
