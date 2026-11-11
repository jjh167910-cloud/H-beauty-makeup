"""Her own products on top of a look ("build your own"): the reference for the phone engine's pigments
(src/lib/makeup-gl.ts), like teacher.py is for the looks.

A swapped product keeps where and how the makeup artist put it on in the catalog photo, and changes
what it is made of:

  * placement: per look, how much of each product the artist put where, measured from the catalog
    photos (eyeshadow coverage maps, public/tryon/cov/<look>.webp, in the layer's crop);
  * pigment: Kubelka-Munk layering. Her skin's reflectance under her photo's light is estimated
    (eye whites for the light's colour, broad skin brightness for shading), the pigment (a swatch
    colour, calibrated like the lipsticks) is layered over it with a thickness from the coverage,
    and the result is lit again. Dark pigments deepen where it's thick, sheer ones tint, light ones
    brighten without going chalky;
  * finish: matte, shimmer (fine grains), metallic (sheen with her own highlights), glitter;
  * the step-by-step zones (step_geometry, as stepGeometry in makeup-gl.ts) decide which part of the
    look's own layer a swapped product replaces.

    python scripts/tinybeauty/products.py cov      # public/tryon/cov/*.webp + coverage strengths in looks.json
"""
from __future__ import annotations
import json, sys
from functools import lru_cache
from pathlib import Path
import cv2, numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import teacher as T  # noqa: E402

STEP_KEYS = ['base', 'conceal', 'brows', 'shadow', 'liner', 'lashes', 'contour', 'blush', 'glow', 'lips']


# ------------------------------------------------------------- step zones
def _unit(a):
    n = float(np.hypot(a[0], a[1])) or 1.0
    return np.array([a[0] / n, a[1] / n], np.float64)

def _ellipse(c, rx, ry, ax, n=28):
    d = _unit(ax); q = np.array([-d[1], d[0]])
    t = np.arange(n) / n * np.pi * 2
    return c + np.outer(np.cos(t) * rx, d) + np.outer(np.sin(t) * ry, q)

def _band(line, up, down, side):
    out = []
    for a, b in zip(line[:-1], line[1:]):
        d = _unit(b - a); n = np.array([-d[1], d[0]])
        if n @ side < 0: n = -n
        out.append(np.array([a + n * up, b + n * up, b - n * down, a - n * down]))
    return out

def _hull(pts):
    return cv2.convexHull(np.float32(pts))[:, 0].astype(np.float64)

def _ring(p, ids, sx=1.0, sy=None):
    sy = sx if sy is None else sy
    q = p[ids]; c = q.mean(0)
    return c + (q - c) * [sx, sy]

def step_geometry(P, blush):
    """Each step's zone polygons on a face (pixels), as stepGeometry() in makeup-gl.ts."""
    P = np.asarray(P, np.float64)[:, :2]
    ew = T.eye_width(P)
    across = _unit(P[263] - P[33]); down = np.array([-across[1], across[0]])
    mean = lambda ids: P[ids].mean(0)
    sides = [
        dict(eye=T.EYE_R, c=mean(T.EYE_R), out=-across, inner=P[133], outer=P[33], upper=[133, 173, 157, 158, 159, 160, 161, 246, 33],
             brow=T.BROW_R, browLow=[46, 53, 52, 65, 55], edge=P[234], mouth=P[61], bone=[117, 118, 101]),
        dict(eye=T.EYE_L, c=mean(T.EYE_L), out=across, inner=P[362], outer=P[263], upper=[362, 398, 384, 385, 386, 387, 388, 466, 263],
             brow=T.BROW_L, browLow=[276, 283, 282, 295, 285], edge=P[454], mouth=P[291], bone=[346, 347, 330]),
    ]
    def tilt(s, deg):
        a = np.radians(deg); return _unit(s['out'] * np.cos(a) - down * np.sin(a))
    tags = {}            # each polygon's half of her face (-1 / +1; 0: across the midline), by id
    def per(f):
        out = []
        for side, s in zip((-1, 1), sides):
            for q in f(s): q = np.asarray(q, np.float64); tags[id(q)] = side; out.append(q)
        return out
    if blush == 'none': blush_p = []
    elif blush == 'high':
        blush_p = per(lambda s: [_ellipse(s['c'] + down * ew * 0.55 + s['out'] * ew * 0.35, ew * 0.5, ew * 0.2, tilt(s, 20))])
    elif blush == 'draped':
        blush_p = per(lambda s: [_ellipse(s['outer'] + s['out'] * ew * 0.45 + down * ew * 0.15, ew * 0.6, ew * 0.22, tilt(s, 40))])
    elif blush == 'under':
        blush_p = per(lambda s: [_ellipse(s['c'] + down * ew * 0.55, ew * 0.45, ew * 0.18, s['out'])])
    elif blush == 'nose':
        blush_p = per(lambda s: [_ellipse(s['c'] + down * ew * 0.8 + s['out'] * ew * 0.05, ew * 0.3, ew * 0.3, s['out'])])
        blush_p.append(_ellipse(P[195], ew * 0.45, ew * 0.1, across))
    else:
        blush_p = per(lambda s: [_ellipse(s['c'] + down * ew * 0.8 + s['out'] * ew * 0.05, ew * 0.33, ew * 0.33, s['out'])])
    def shadow(s):
        pts = np.vstack([P[s['eye']], P[s['browLow']] + (s['c'] - P[s['browLow']]) * 0.15,
                         [s['c'] + s['out'] * ew * 0.95 - down * ew * 0.15, s['c'] - s['out'] * ew * 0.6, s['c'] + down * ew * 0.25]])
        return [_hull(pts)]
    def liner(s):
        line = np.vstack([P[s['upper']], s['outer'] + tilt(s, 22) * ew * 0.32])
        return _band(line, ew * 0.06, ew * 0.025, -down)
    def contour(s):
        a = s['edge'] - s['out'] * ew * 0.05 + down * ew * 0.25
        b = a + _unit(s['mouth'] - s['edge']) * ew * 0.75
        return [_ellipse((a + b) / 2, ew * 0.42, ew * 0.13, b - a)]
    glow = per(lambda s: [_ellipse(P[s['bone']].mean(0) - down * ew * 0.05, ew * 0.3, ew * 0.135, tilt(s, 12))])
    glow += _band(np.array([P[6], P[195]]), ew * 0.03, ew * 0.03, across)
    glow.append(_ellipse(P[0] - down * ew * 0.04, ew * 0.07, ew * 0.04, across))
    return {
        'base': [P[T.OVAL]],
        'conceal': per(lambda s: [_ellipse(s['c'] + down * ew * 0.42 + s['out'] * ew * 0.05, ew * 0.55, ew * 0.24, across)]),
        'brows': per(lambda s: [_ring(P, s['brow'], 1.15)]),
        'shadow': per(shadow), 'liner': per(liner), 'lashes': [], 'contour': per(contour), 'blush': blush_p, 'glow': glow,
        'lips': [_ring(P, T.LIPS_OUT)],
        'side': lambda q: tags.get(id(q), 0),
    }

def lid_region(shape, P):
    """Where eyeshadow goes: the lids up to under the brows and out past the outer corner, and a thin
    band under the outer lower lashes (not the under-eye, where a photo's change is concealer)."""
    P = np.asarray(P, np.float64)[:, :2]; ew = T.eye_width(P)
    across = _unit(P[263] - P[33]); down = np.array([-across[1], across[0]])
    m = np.zeros(shape, np.float32)
    # the lower band runs from the outer corner to the middle (an inner-corner highlight isn't eyeshadow)
    for eye, low, out, upper, lower in ((T.EYE_R, [46, 53, 52, 65, 55], -across, [133, 173, 157, 158, 159, 160, 161, 246, 33], [33, 7, 163, 144, 145, 153]),
                                        (T.EYE_L, [276, 283, 282, 295, 285], across, [362, 398, 384, 385, 386, 387, 388, 466, 263], [263, 249, 390, 373, 374, 380])):
        c = P[eye].mean(0)
        pts = np.vstack([P[upper], P[low] + (c - P[low]) * 0.15, [c + out * ew * 0.95 - down * ew * 0.15, c - out * ew * 0.6]])
        cv2.fillConvexPoly(m, np.int32(np.round(_hull(pts))), 1)
        for q in _band(P[lower], ew * 0.065, ew * 0.0, down): cv2.fillConvexPoly(m, np.int32(np.round(q)), 1)
    return m

def _fill(shape, polys, side_of=None, side=None):
    """Polygons filled with 1; with a side map, each polygon of one half only where its half (or the midline)
    is in front: smoothstep(-0.5, 0, side * its half), as the zone shader in makeup-gl.ts."""
    m = np.zeros(shape, np.float32)
    for q in polys:
        s = side_of(q) if side_of and side is not None else 0
        if s == 0: cv2.fillPoly(m, [np.int32(np.round(q))], 1); continue
        k = np.zeros(shape, np.float32); cv2.fillPoly(k, [np.int32(np.round(q))], 1)
        t = np.clip((side * s + 0.5) / 0.5, 0, 1)
        m = np.maximum(m, k * t * t * (3 - 2 * t))
    return m

def step_zones(shape, P, blush, gate=True):
    """The zone masks the engine uses (zoneA: conceal, contour, blush, glow; zoneB: shadow, liner band),
    blurred as in makeup-gl.ts. With `gate` (and 3D points), a zone of one half of her face is kept off
    the other half where that is in front (her far cheek behind her nose on a turned head)."""
    geo = step_geometry(P, blush); ew = T.eye_width(np.asarray(P)[:, :2])
    side = T.side_map(P, shape) if gate and np.asarray(P).shape[1] > 2 else None
    f = lambda key: _fill(shape, geo[key], geo['side'], side)
    g = lambda m, s: cv2.GaussianBlur(m, (0, 0), max(0.5, s))
    A = np.dstack([g(f('conceal'), ew * 0.1), g(f('contour'), ew * 0.1), g(f('blush'), ew * 0.12), g(f('glow'), ew * 0.12)])
    B = np.dstack([g(f('shadow'), ew * 0.04), g(f('liner'), max(0.8, ew * 0.012))])
    return A, B


# --------------------------------------------------------- coverage maps
COV_KINDS = ['shadow', 'blush', 'contour', 'glow']

@lru_cache(None)
def face_looks():
    """Each catalog style's FaceLook (src/data/makeup-styles.ts): skin, shadow, lid, liner, blush, ... """
    import re
    out = {}
    for m in re.finditer(r'style\("([a-z0-9-]+)",.*?\{([^}]*)\}', T.STYLES.read_text(), re.S):
        body = m.group(2); d = {}
        for k, v in re.findall(r'(\w+): "([^"]+)"', body): d[k] = v
        lid = re.search(r'lid: \["([^"]+)", "([^"]+)"\]', body)
        if lid: d['lid'] = [lid.group(1), lid.group(2)]
        acc = re.search(r'accents: \[([^\]]*)\]', body)
        d['accents'] = re.findall(r'"([^"]+)"', acc.group(1)) if acc else []
        out[m.group(1)] = d
    return out

# --------------------------------------------------------- each look's recipe
# What a catalog photo can't carry as a change of colour, the look's recipe (its FaceLook) adds as products over it: its
# skin's finish, a highlighter's sheen, its eyeshadow's shimmer or glitter (in the eyeshadow's own colour), its liner's
# colour. As lookRecipe() in tryon.ts.
SKIN_FINISH = {'matte': -0.6, 'sheer': 0.0, 'dewy': 0.7, 'glow': 0.5, 'bronzed': 0.3}   # her skin's shine: -1 matte .. 1 dewy
RECIPE_GLOW = {'glow': ('#f3dcb8', 1.6), 'bronzed': ('#e8c27a', 1.4), 'dewy': ('#f4ece6', 1.0)}   # highlighter, its sheen
SHIMMER_GLOW = ('#f3dcb8', 1.0)   # a shimmer look on a matte or sheer skin: a softer champagne highlight
RECIPE_SHEEN = {'shimmer': 1.5, 'metallic': 0.55, 'glitter': 1.6}   # the look's eyeshadow finish: how much it catches the light

def metal_tone(hex_colour):
    """A gold shade (its shimmer is a soft foil): an orange to yellow hue (20-55 degrees), saturated (over 0.5)."""
    import colorsys
    r, g, b = (int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h = colorsys.rgb_to_hsv(r, g, b)[0] * 360
    return 20 <= h <= 55 and (max(r, g, b) - min(r, g, b)) / max(max(r, g, b), 1e-4) > 0.5

def recipe(look):
    """The look's recipe as products over it (paint_custom's `custom`): {} for a look without one."""
    fl = face_looks().get(look)
    if not fl: return {}
    acc = set(fl.get('accents', [])); out = {'finish': SKIN_FINISH.get(fl.get('skin'), 0.0)}
    glow = RECIPE_GLOW.get(fl.get('skin')) or (SHIMMER_GLOW if 'shimmer' in acc else None)
    if glow: out['glow'] = {'color': glow[0], 'finish': 'glow', 'over': True, 'sheen': glow[1]}
    fin = 'glitter' if acc & {'glitter', 'rhinestones'} else 'shimmer' if 'shimmer' in acc else None
    if fin == 'shimmer' and metal_tone(fl['lid'][0]): fin = 'metallic'
    if fin and fl.get('shadow', 'none') != 'none':
        out['shadow'] = {'color': fl['lid'][0], 'finish': fin, 'own': True, 'over': True, 'sheen': RECIPE_SHEEN[fin]}
    if fl.get('linerColor'): out['liner'] = {'color': fl['linerColor']}
    return out

def paint_look(look, face, p, level='natural', **kw):
    """The look with its recipe (recipe()), as the app paints it."""
    return paint_custom(look, face, p, level, custom=recipe(look), **kw)

COV_BLEND = 0.14    # final softening of the coverage, in eye widths
COV_GAMMA = 0.85    # the photo's change -> coverage: the artist's gradient, but the lid fills as a powder does
SHADOW_MIN = 0.3     # (log units) a look whose lids change less than this has no eyeshadow of its own to follow

@lru_cache(None)
def make_cov(look: str):
    """Where and how thickly the artist put the eyeshadow on (0..1 per pixel, the look photo's
    coordinates): any colour change on the lids, with the liner and lashes taken out (they are their
    own steps; where they were, the shadow around them fills in), normalised to its 99th percentile
    inside the zone so it keeps the artist's gradient. Also that percentile (the look's eyeshadow
    strength). Blush, contour and highlight use their zones' soft shapes (smoother than the photos)."""
    lr, pl = T.make_layer(look)
    H, W = lr.shape[:2]; ew = T.eye_width(pl[:, :2])
    A, B = step_zones((H, W), pl, face_looks().get(look, {}).get('blush', 'apples'), gate=False)
    g = lambda m, s: cv2.GaussianBlur(m, (0, 0), s)
    balls = g(T.poly_mask((H, W), pl[:, :2], [T.EYE_R, T.EYE_L], scale=[0.88, 0.6]), 1.5)
    # liner and lashes: the look photo's fine dark detail around the eyes (as its eye map)
    grey = cv2.cvtColor(T.rgb(T.LOOKS / f'{look}.webp'), cv2.COLOR_RGB2GRAY).astype(np.float32)
    rel = -T.detail_map(grey, pl[:, :2], T.wing_zone(look, T.WING_LINER)) / np.maximum(g(grey, ew * 0.05), 20)
    lash = g(cv2.dilate(np.clip(rel / 0.06, 0, 1), np.ones((3, 3))), ew * 0.02)
    zone = B[..., 0] * g(lid_region((H, W), pl), ew * 0.03); w = zone * (1 - lash) * (1 - balls)
    m = np.linalg.norm(lr, axis=-1)
    m = g(m * w, ew * 0.035) / np.maximum(g(w, ew * 0.035), 1e-3)     # excluded spots take their surroundings' value
    soft = g(zone, ew * 0.05)
    inside = zone > 0.5
    st = float(np.quantile(m[inside], 0.99)) if inside.sum() > 50 else 0.0
    out = np.zeros((H, W, 4), np.float32)
    # blended out like a powder: fading before the brow bone, no edge where the zone ends
    if st > 1e-4: out[..., 0] = g(np.clip(m / st, 0, 1) ** COV_GAMMA * soft * brow_fade((H, W), pl), ew * COV_BLEND)
    return out, pl, {'shadow': round(float(np.quantile(m[inside], 0.95)) if inside.sum() > 50 else 0.0, 4)}

def brow_fade(shape, P):
    """1 on the lid, fading to 0 on the way up to the brow (an artist blends eyeshadow out below the brow
    bone): from where each pixel lies between the upper lid line and the brow's lower edge."""
    P = np.asarray(P)[:, :2]
    lid, brow = np.full(shape, 255, np.uint8), np.full(shape, 255, np.uint8)
    for upper, low in (([133, 173, 157, 158, 159, 160, 161, 246, 33], [55, 65, 52, 53, 46]),
                       ([362, 398, 384, 385, 386, 387, 388, 466, 263], [285, 295, 282, 283, 276])):
        cv2.polylines(lid, [np.int32(np.round(P[upper]))], False, 0, 2)
        cv2.polylines(brow, [np.int32(np.round(P[low]))], False, 0, 2)
    dl = cv2.distanceTransform(lid, cv2.DIST_L2, 5); db = cv2.distanceTransform(brow, cv2.DIST_L2, 5)
    return 1 - smoothstep(0.5, 0.95, dl / np.maximum(dl + db, 1e-3))

def layer_box(look):
    """The crop export_layer() uses (the layer's uv are in it), so the coverage map shares them."""
    lr, pl = T.make_layer(look); H, W = lr.shape[:2]
    on = np.abs(lr).max(-1) > 2e-3
    if not on.any(): on[int(pl[:, 1].min()):int(pl[:, 1].max()), int(pl[:, 0].min()):int(pl[:, 0].max())] = True
    ys, xs = np.nonzero(on); m = 4
    return max(0, xs.min() - m), max(0, ys.min() - m), min(W, xs.max() + m + 1), min(H, ys.max() + m + 1)

def export_cov(look, out_dir: Path):
    cov, _, strength = make_cov(look)
    x0, y0, x1, y1 = layer_box(look)
    q = np.clip(np.round(cov[y0:y1, x0:x1, 0] * 255), 0, 255).astype(np.uint8)
    # grey, no alpha: lossless WebP may drop colour under transparent pixels
    cv2.imwrite(str(out_dir / f'{look}.webp'), cv2.merge([q, q, q]), [cv2.IMWRITE_WEBP_QUALITY, 101])
    return strength


# --------------------------------------------------------- pigment model
# Kubelka-Munk thickness at full coverage (S*X, scattering x thickness) and finish strengths per product.
BLUSH_SOFT = 0.16   # blush: its placement's shape blurred over this many eye widths
SHADOW_GLITTER = 0.75   # an eyeshadow's glitter: share of grain cells with a grain (a lipstick's: GLITTER_DENSITY)
OWN_LIGHT = (0.3, 0.7)  # a look's own eyeshadow finish goes on where the look leaves her lid this bright (of her own) or more
SHEEN = {'shadow': 1.0, 'blush': 0.6, 'contour': 0.0, 'glow': 1.0}    # how reflective a shimmer finish is per product
THICK = {'shadow': 0.6, 'blush': 0.08, 'contour': 0.25, 'glow': 0.05}
SHADE_SIGMA = (0.025, 0.22)   # her shading (form: lid crease, cheekbone), and the broad light, in eye widths

def lin_hex(hex_colour):
    return np.array([(int(hex_colour[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5)], np.float32)

def km(Rg, Rinf, x):
    """Kubelka-Munk: reflectance of a pigment layer (reflectance at infinite thickness Rinf, optical
    thickness x = S*X) over a substrate of reflectance Rg; per colour channel."""
    R = np.clip(Rinf, 0.02, 0.98)
    a = 0.5 * (1 / R + R); b = 0.5 * (1 / R - R)
    bx = b * np.maximum(x, 1e-4)
    c = 1 / np.tanh(bx)
    return (1 - Rg * (a - b * c)) / (a - Rg + b * c)

def her_light(user_lin, p):
    """Her photo's light: the colour of a white surface lit like her face (linear RGB), from her eye
    whites and skin brightness, with the lipstick picker's calibration (a swatch's colour as the
    catalog photos show it is k * swatch * eye-white)."""
    k, sc, sk = T.swatch_calibration()
    # The eye whites aren't white (a warm tint, and shaded): only her light's cast relative to the catalog
    # photo's is kept, on a neutral white as bright as the catalog's.
    white, _ = T.lip_target(dict(colour=np.full(3, k * float(sc.mean()), np.float32), sclera=sc, skin=sk, nude=0.0),
                            T.sclera(user_lin, p), T.skin_lum(user_lin, p))
    return np.asarray(white, np.float32)

def shading(user_lin, p):
    """Light on her face relative to her typical skin (1 = typical): her brightness blurred a little
    (keeps the face's form: lid crease, brow bone, cheekbone) and widely (the broad light);
    eyeballs and mouth left out. Pigment goes on her reflectance (her photo / light) and is lit again."""
    H, W = user_lin.shape[:2]; ew = T.eye_width(p[:, :2])
    R = T.regions((H, W), p[:, :2]); w = (1 - R['balls']) * (1 - R['mouth'])
    Y = T.luma(user_lin); ref = max(T.skin_lum(user_lin, p) or float(np.median(Y)), 1e-4)
    out = []
    for s in SHADE_SIGMA:
        n = cv2.GaussianBlur(w, (0, 0), ew * s); fill = np.maximum(0, 0.5 - n)    # deep inside a left-out spot: her own brightness
        out.append((cv2.GaussianBlur(Y * w, (0, 0), ew * s) + Y * fill) / (n + fill) / ref)
    return out

# Placement templates: the catalog look whose artist applied that eyeshadow style / blush placement most
# clearly; used when she picks a placement, or when her look has none of that product.
SHADOW_FROM = {'wash': 'monochrome', 'crease': 'full-glam', 'cutcrease': 'cut-crease', 'halo': 'henna-night',
               'smoky': 'classic-smokey', 'gradient': 'electric-blue'}

def cov_strength(look):
    return make_cov(look)[2]

def placement(kind, look, pick):
    """The catalog look whose coverage map places her product: her pick, else the look's own (when the
    look has that product clearly), else the template for the look's style."""
    if pick.get('from'): return pick['from']
    fl = face_looks()[look]
    if kind == 'shadow':
        style = fl.get('shadow', 'none')
        if style != 'none' and cov_strength(look)['shadow'] >= SHADOW_MIN: return look
        return SHADOW_FROM.get(style, SHADOW_FROM['wash'])
    style = fl.get('blush', 'none')                     # blush: a placement (zone shape on her face)
    return style if style != 'none' else 'apples'

def warp_cov(src, channel, p, shape):
    cov, pl, _ = make_cov(src)
    w, cover = T.mesh_warp(np.ascontiguousarray(cov[..., channel]), T.symmetric(pl), p, shape, z=p[:, 2])
    return w * cover

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def sparkle_terms(user_lin, p, form, broad):
    """Where grains and sheen catch the light: the lit, convex parts of her face (form over broad light:
    lid centre, brow bone, cheekbone) and her own highlights."""
    ew = T.eye_width(p[:, :2]); Y = T.luma(user_lin)
    g = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)
    hl = np.clip(g(Y, ew * 0.012) / np.maximum(g(Y, ew * 0.03), 1e-4) - 1.0, 0, 0.6)
    lit = np.clip(form / np.maximum(broad, 1e-4) - 0.85, 0, 0.6) * np.clip(broad, 0.3, 1.5)
    glint = 0.25 + 2.0 * lit + 1.5 * hl
    return glint, hl, lit

# Finishes: (share of the matte pigment kept, how much of a reflective surface replaces it where it's on,
# and that surface's reflection: of her light where her face is lit and convex, of her own highlights,
# of fine pearl grains, of glitter grains).
FINISHES = {'matte': (1.0, 0.0, 0, 0, 0, 0), 'shimmer': (0.75, 0.3, 1.0, 0.8, 0.9, 0),
            'metallic': (0.6, 0.75, 1.8, 1.4, 0.3, 0), 'glitter': (0.8, 0.0, 0, 0, 0.3, 1.8),
            'glow': (0.3, 0.0, 0.5, 0.6, 0.3, 0)}    # highlighter: a sheen added where her face catches the light
REFLECT_BASE = 0.8    # a reflective finish's surface under her light, before its highlights
CONTRAST = {'shimmer': 1.5, 'metallic': 3.0, 'matte': 1.0, 'glitter': 1.0, 'glow': 2.0}

def reflectance(base, E):
    """Her reflectance under light E, and that light. Where she is brighter than the light estimate allows
    (a lit brow bone, a warm cheek's red), the light is taken to be brighter, keeping her colour."""
    r = base / np.maximum(E, 1e-4)
    s = np.maximum(1.0, r.max(-1, keepdims=True) / 0.9)
    return np.clip(r / s, 0.005, 0.98), E * s

def apply_pigment(base, E, alpha, pick, thick, finish_terms, sheen=1.0):
    """One product: Kubelka-Munk layer over her (base, linear) lit by E, thickness from the coverage;
    shimmer / metallic finishes also turn part of it into a reflective, tinted surface (mica, foil) that
    follows her face's light; glitter adds grains that catch it. pick['own']: no layer of its own, only its finish (its
    mica and grains, in its colour) over the colour already there (the look's own eyeshadow); pick['sheen']: how
    reflective, times `sheen`."""
    col = lin_hex(pick['color']); Rinf = col[None, None]
    deep = pick.get('deep', 0.0)
    if deep: Rinf = Rinf ** (1 + deep * smoothstep(0.55, 1.0, alpha))[..., None]   # packed on: deeper, richer
    keep, mix, k_lit, k_hl, k_pearl, k_spark = FINISHES.get(pick.get('finish', 'matte'), FINISHES['matte'])
    sheen = sheen * pick.get('sheen', 1.0)
    x = alpha * thick * keep
    Rg, E = reflectance(base, E)
    out = base if pick.get('own') else base + (km(Rg, Rinf, x[..., None]) - Rg) * E   # only the pigment's change (none where x = 0)
    if keep < 1:
        glint, hl, lit, spark, pearl, white, broad, form = finish_terms
        tint = col / max(float(col.max()), 1e-4)
        tint = (tint * (0.5 + 0.5 * float(col.max())))[None, None]          # a light shade reflects more
        if pick.get('own'):     # (its mica lies in the eyeshadow already there: their colours meet halfway)
            cm = np.maximum(Rg.max(-1, keepdims=True), 1e-4); tint = np.sqrt(tint * Rg / cm * (0.5 + 0.5 * cm))
        L = white[None, None] * np.clip(broad, 0.3, 1.5)[..., None]
        # a smooth reflective surface shows the face's form more than skin does: its shading, exaggerated
        q = np.clip(form / np.maximum(broad, 1e-4), 0.3, 2.0) ** CONTRAST[pick.get('finish', 'matte')]
        refl = tint * (REFLECT_BASE * L * q[..., None] + L * (k_lit * lit + k_hl * hl + k_pearl * pearl * glint)[..., None])
        if pick.get('finish') == 'glow':    # added light (specular), never a paint
            out = out + tint * L * ((0.06 + k_lit * lit + k_hl * hl + k_pearl * pearl * glint) * sheen * np.clip(alpha, 0, 1))[..., None]
        else:
            m = (mix * sheen * smoothstep(0.05, 0.6, alpha))[..., None]
            out = out * (1 - m) + refl * m
        if k_spark: out = out + L * (k_spark * spark * glint * sheen * np.clip(alpha, 0, 1))[..., None] * (0.6 + 0.4 * tint)
    return out

def paint_custom(look, face, p, level='natural', custom=None, shade=None, finish=None, edge=None, vis=None, seg=None):
    """The look on `face` (RGB uint8, MediaPipe points p) with her own products swapped in and each
    step at its own intensity. custom = {'shadow': {'color', 'finish', 'deep', 'from'}, 'blush': {...},
    'contour': {...}, 'glow': {...}, 'liner': {'color'}, 'gain': {step: x}}; shade / finish: her lipstick."""
    custom = custom or {}; gain = custom.get('gain', {}); G = lambda k: float(gain.get(k, 1.0))
    k_layer, k_lip, k_eye = T.LEVELS[level]
    H, W = face.shape[:2]; p2 = p[:, :2]; ew = T.eye_width(p2)
    user = T.lin(face); fl = face_looks()[look]
    A, B = step_zones((H, W), p, fl.get('blush', 'apples'))
    g = lambda m, s: cv2.GaussianBlur(m, (0, 0), s)
    # 1. the look's own layer: swapped products' zones taken out, every step at its intensity
    lr, pl = T.make_layer(look)
    w, cover = T.mesh_warp(lr, T.symmetric(pl), p, (H, W), z=p[:, 2])
    w = T.skin_fade(T.extend_layer(w, T.feather_map(p, (H, W)) * cover, p, (H, W)), edge)
    R = T.regions((H, W), p2)
    keep = T.ball_keep((H, W), p) * (1 - g(R['mouth'], 1.5))
    own = {k: 0.0 if k in custom and not custom[k].get('over') else 1.0 for k in ('shadow', 'contour', 'blush', 'glow')}
    zsum = A[..., 0] + B[..., 0] + A[..., 1] + A[..., 2] + A[..., 3]
    sc = np.where(zsum > 1, 1 / np.maximum(zsum, 1e-6), 1.0)
    RL = (np.maximum(0, 1 - zsum * sc) * G('base') + sc * (A[..., 0] * G('conceal') + B[..., 0] * G('shadow') * own['shadow']
          + A[..., 1] * G('contour') * own['contour'] + A[..., 2] * G('blush') * own['blush'] + A[..., 3] * G('glow') * own['glow']))
    base = user * T.foundation(face, user, p, vis, G('base') * k_layer, seg, T.look_tint(look) ** (G('base') * k_layer),
                               float(np.clip(custom.get('finish', 0.0) * G('base') * k_layer, -1, 1))) * T.conceal_gain(face, user, p, G('conceal'))[..., None] \
        * np.exp(w * (keep * k_layer * RL)[..., None])
    # 2. her products, in the order they go on
    if any(k in custom for k in ('shadow', 'contour', 'blush', 'glow')):
        white = her_light(user, p); form, broad = shading(user, p); E = white[None, None] * form[..., None]
        glint, hl, lit = sparkle_terms(user, p, form, broad)
        canon, ccov = T.canon_coords(p, (H, W)); _, ew_b, _ = T._bare_points()
        spark = T.glitter(canon, ew * T.GLITTER_CELL, ew_b) * ccov
        spark_lid = T.glitter(canon, ew * T.GLITTER_CELL, ew_b, density=SHADOW_GLITTER) * ccov   # (an eyeshadow's glitter is denser)
        pearl = T.glitter(canon, ew * T.GLITTER_CELL * T.PEARL, ew_b, T.PEARL) * ccov
        terms = (glint, hl, lit, spark, pearl, white, broad, form)
        for kind in ('contour', 'blush', 'glow', 'shadow'):
            pick = custom.get(kind)
            if not pick: continue
            if kind == 'shadow': alpha = warp_cov(placement('shadow', look, pick), 0, p, (H, W))
            elif kind == 'blush':
                bg = step_geometry(p, placement('blush', look, pick))
                alpha = cv2.GaussianBlur(_fill((H, W), bg['blush'], bg['side'], T.side_map(p, (H, W))), (0, 0), ew * BLUSH_SOFT)
            elif kind == 'contour': alpha = A[..., 1]
            else: alpha = A[..., 3]
            alpha = alpha * G(kind) * k_layer
            # (the look's own eyeshadow's finish where it is a light shade, not over its smoky dark: OWN_LIGHT)
            if pick.get('own'): alpha = alpha * smoothstep(*OWN_LIGHT, T.luma(base) / np.maximum(T.luma(user), 1e-4))
            t = terms if kind != 'shadow' else (glint, hl, lit, spark_lid, pearl, white, broad, form)
            base = apply_pigment(base, E, alpha, pick, THICK[kind], t, SHEEN[kind])
    # 3. lipstick at its intensity
    L = T.lip_choice(look, shade, finish) if (shade or finish) else None
    band = np.clip(g(T.lip_hard((H, W), p), ew * 0.05) * 4, 0, 1)[..., None]
    b2 = base * (1 - band) + user * band
    lips = T.apply_lips(base, user, p, look, k_lip, L)
    out = b2 + (lips - b2) * G('lips')
    # 4. eye detail: liner (upper lid band) and lashes, each at its intensity; the liner in her colour
    res = T.srgb(out).astype(np.float32)
    ru = T.soften(T.warp_eyes(look, p2, (H, W), p[:, 2]), T.detail_sigma(T.photo_blur(face, p)))
    ru = ru * T.lash_scale(p, (H, W), band=B[..., 1]) * T.ball_keep((H, W), p)
    lu = cv2.cvtColor(face, cv2.COLOR_RGB2GRAY).astype(np.float32)
    own_d = np.minimum(0, lu - g(lu, ew * 0.028)) / np.maximum(g(lu, ew * 0.042), 20)
    d = np.minimum(0, ru - own_d * 0.6)
    band = B[..., 1]
    if 'liner' in custom:
        dl = np.clip(-k_eye * band * G('liner') * d, 0, 0.85); dd = np.clip(-k_eye * (1 - band) * G('lashes') * d, 0, 0.85)
        E2 = her_light(user, p)[None, None] * shading(user, p)[0][..., None]
        C = T.srgb(np.clip(lin_hex(custom['liner']['color'])[None, None] * E2, 0, 1)).astype(np.float32)
        res = res * (1 - dd[..., None])
        res = res + (C - res) * np.clip(dl * 1.15, 0, 1)[..., None]
    else:
        RD = band * G('liner') + (1 - band) * G('lashes')
        res = res * np.clip(1 + k_eye * RD * d, 0.15, 1)[..., None]
    return np.clip(res, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    if sys.argv[1:] == ['cov']:     # eyeshadow coverage maps + each look's eyeshadow strength in looks.json
        (T.TRYON / 'cov').mkdir(parents=True, exist_ok=True)
        data = json.load(open(T.TRYON / 'looks.json'))
        for look in T.catalog_looks():
            data['looks'][look]['cov'] = export_cov(look, T.TRYON / 'cov')
        data['products'] = {'shadowMin': SHADOW_MIN, 'shadowFrom': SHADOW_FROM}
        json.dump(data, open(T.TRYON / 'looks.json', 'w'), separators=(',', ':'))
        print('coverage maps:', len(data['looks']))
    else:
        print(__doc__)
