"""
Reference of the studio retouch the app runs on the phone's graphics chip before the makeup (src/lib/studio-gl.ts):
the same steps, in the same order, with the same strengths (STUDIO), so the browser's output can be checked against it.

    python scripts/tinybeauty/studio.py in.jpg out.png [points.json]   # points: the face model's 478 (x, y, z) in pixels

- colour: her skin's hue moved part of the way to a warm studio hue as a white balance (her skin's brightness kept),
  and flat colour made richer (her skin up to a healthy chroma, never past it; the rest of the photo a little);
- skin: faint unevenness between pores and broad shading softened in log light (the edges of her nose, lids and jaw
  kept), fine texture kept; not on her eyes, brows, lips or nostrils;
- blemishes: a small dark blob on her skin (a spot, a mark) lifted to the skin around it, its cast taken away, her
  texture kept; a mole stays;
- light: a beauty dish's soft fall-off over her face (its middle a little brighter, its edges a little darker), a
  gentle contrast about her skin's brightness (which stays), a soft shoulder, a soft vignette away from her
  face, and her face's own highlights blooming softly in her skin's warmth, in proportion to her own light;
- eyes and features: the whites of her eyes a little brighter, her eyes, lashes, brows and lips crisper.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

STUDIO = dict(warm=0.3, hue_max=4.0, skin_sat=0.25, chroma_max=30.0, sat=0.08, fine=0.01, blotch=0.06, smooth=0.9, edge=0.12, pore=0.15,
              contrast=0.07, vignette=0.18, glow=0.35, face_light=0.35, under_eye=0.65, under_eye_tint=0.35, spots=0.9, eyes=0.6, sharp=0.8)
STUDIO_HUE = 44.0   # a warm studio skin hue (CIELAB degrees); hers moves only part of the way
GLOW_TOP = 0.5      # the glow counts her highlights up to this far above her skin's brightness (a share)
GAMUT_KNEE = 0.85   # her brightest colours kept in colour: a channel past this (linear) is brought in towards her brightness
UNDER_EYE_MAX = 1.35  # her under-eye is lifted at most this much
# Blemishes: a dark blob (her skin curving up all round, at SPOT_STEP eye widths) lifted to the ring around it (SPOT_RING
# eye widths away); a blob's curvature (log light) from SPOT_BLOB[0] to [1] counts; a mole (darker than SPOT_MOLE[0] to
# [1] in log light) is part of her and stays.
SPOT_STEP, SPOT_RING, SPOT_BLOB, SPOT_MOLE = 0.05, 0.13, (0.008, 0.02), (0.5, 0.8)
SPOT_MID = 0.025   # a blemish's own level: her fine light averaged this far around (eye widths); finer texture stays
SPOT_ROUND = (0.3, 0.55)   # a blemish is round: its curvatures within this ratio (weaker / stronger); a crease isn't
# no blemish is healed on the base of her nose (its wings, nostrils and the shadow under them: her shape), grown and feathered
NOSE_BASE = [129, 49, 64, 98, 167, 164, 393, 327, 294, 279, 358, 4]
SPOT_NOSE = (0.1, 0.06)
STUDIO_CRISP = 0.3         # on a photo already sharpened, the features are sharpened only this share more

OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]
EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]
BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
NOSTRILS = [[79, 166, 59, 75, 60, 20, 238, 239], [309, 392, 289, 305, 290, 250, 458, 459]]
LOWER_LIDS = [[33, 7, 163, 144, 145, 153, 154, 155, 133], [263, 249, 390, 373, 374, 380, 381, 382, 362]]
UNDER_EYE = (0.07, 0.42)   # her under-eye: from this far below her lower lid to this far (eye widths)
SKIN_PTS = [50, 101, 118, 280, 330, 347, 205, 425, 36, 266]
LUMA = np.array([0.2126, 0.7152, 0.0722])


def lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def enc(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def luma(c): return c @ LUMA

WP = np.array([0.95047, 1, 1.08883])
def _f(t): return np.cbrt(t) if t > 0.008856 else 7.787 * t + 16 / 116
def _fi(t): return t ** 3 if t > 0.2069 else (t - 16 / 116) / 7.787
def to_lab(c):
    r, g, b = c
    x, y, z = (0.4124 * r + 0.3576 * g + 0.1805 * b) / WP[0], 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / WP[2]
    return np.array([116 * _f(y) - 16, 500 * (_f(x) - _f(y)), 200 * (_f(y) - _f(z))])
def from_lab(c):
    L, a, b = c
    fy = (L + 16) / 116; x, y, z = _fi(fy + a / 500) * WP[0], _fi(fy), _fi(fy - b / 200) * WP[2]
    return np.array([3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z])


def eye_width(P): return (np.hypot(*(P[33][:2] - P[133][:2])) + np.hypot(*(P[263][:2] - P[362][:2]))) / 2


def params(u8, P):
    """What the retouch needs to know about her photo (studioParams): white balance, skin vibrance, pivot, tint."""
    H, W, _ = u8.shape
    ew = eye_width(P); r = max(2, int(round(ew * 0.1)))
    px = []
    for i in SKIN_PTS:
        x, y = int(round(P[i][0])) - r, int(round(P[i][1])) - r
        if x < 0 or y < 0 or x + 2 * r > W or y + 2 * r > H: continue
        px.append(lin(u8[y:y + 2 * r, x:x + 2 * r].reshape(-1, 3) / 255))
    px = np.concatenate(px); px = px[np.argsort(luma(px), kind='stable')]
    mid = px[int(np.floor(len(px) * 0.25)):int(np.ceil(len(px) * 0.9))]
    skin = np.array([np.sort(mid[:, c])[len(mid) >> 1] for c in range(3)])
    lab = to_lab(skin); h = np.degrees(np.arctan2(lab[2], lab[1])); C = np.hypot(lab[1], lab[2])
    dh = np.clip(STUDIO['warm'] * (STUDIO_HUE - h), -STUDIO['hue_max'], STUDIO['hue_max'])
    to = np.maximum(1e-4, from_lab([lab[0], C * np.cos(np.radians(h + dh)), C * np.sin(np.radians(h + dh))]))
    wb = to / np.maximum(skin, 1e-4)
    wb = np.clip(wb * luma(skin) / max(luma(skin * wb), 1e-4), 0.92, 1.08)
    bal = skin * wb
    C0 = np.hypot(*to_lab(bal)[1:])
    vs = float(np.clip(STUDIO['chroma_max'] / max(C0, 1e-3) - 1, 0, STUDIO['skin_sat']))
    pivot = float(luma(bal))
    cs = float(np.linalg.norm(bal - pivot) / max(pivot, 1e-4))   # her skin's colourfulness (linear RGB, relative to her brightness)
    return dict(wb=wb, vs=vs, pivot=pivot, tint=bal / max(pivot, 1e-4), cs=cs)


def poly_mask(P, ids, W, H, grow=0.0, scale=1.0):
    pts = np.array([P[i][:2] for i in ids], np.float64) * scale
    c = pts.mean(0); pts = c + (pts - c) * (1 + grow)
    im = Image.new('L', (W, H), 0); ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255)
    return np.asarray(im, np.float32) / 255


def blur(x, s): return gaussian_filter(x, max(0.5, s), mode='nearest', truncate=3.0)


def shift(a, dx, dy):
    H, W = a.shape; return a[np.clip(np.arange(H) + dy, 0, H - 1)][:, np.clip(np.arange(W) + dx, 0, W - 1)]


def ring_of(a, r):
    """The mean of a (H x W, or H x W x C) at 8 points r pixels around each pixel."""
    pts = [(int(round(r * np.cos(t))), int(round(r * np.sin(t)))) for t in np.arange(8) * np.pi / 4]
    if a.ndim == 3: return np.stack([ring_of(a[..., c], r) for c in range(a.shape[2])], -1)
    return sum(shift(a, dx, dy) for dx, dy in pts) / 8


def ring_low(a, r):
    """The darkest of the 4 means of opposite points r pixels around each pixel (her skin's slope cancels in each pair):
    a blemish is lifted no lighter than her skin around it on any side, so a shadow's edge (her nose's wing) isn't."""
    pts = [(int(round(r * np.cos(t))), int(round(r * np.sin(t)))) for t in np.arange(8) * np.pi / 4]
    return np.min([(shift(a, *pts[k]) + shift(a, *pts[k + 4])) / 2 for k in range(4)], 0)


def spot_heal(bb, bf, ew):
    """How much to lift her log light at each pixel to heal blemishes (0 elsewhere), and how sure it is a blemish."""
    s = int(round(SPOT_STEP * ew)); r = SPOT_RING * ew
    lxx, lyy = shift(bb, s, 0) + shift(bb, -s, 0) - 2 * bb, shift(bb, 0, s) + shift(bb, 0, -s) - 2 * bb
    lxy = (shift(bb, s, s) + shift(bb, -s, -s) - shift(bb, s, -s) - shift(bb, -s, s)) / 4
    rad = np.sqrt(0.25 * (lxx - lyy) ** 2 + lxy ** 2); kappa, kmax = 0.5 * (lxx + lyy) - rad, 0.5 * (lxx + lyy) + rad
    ring = ring_of(bb, r); low = ring_low(bb, r)
    mid = (bf + 8 * ring_of(bf, SPOT_MID * ew)) / 9
    deficit = np.maximum(0, ring - mid)
    t = np.clip((kappa - SPOT_BLOB[0]) / (SPOT_BLOB[1] - SPOT_BLOB[0]), 0, 1); blob = t * t * (3 - 2 * t)
    t = np.clip((kappa / np.maximum(kmax, 1e-6) - SPOT_ROUND[0]) / (SPOT_ROUND[1] - SPOT_ROUND[0]), 0, 1); blob = blob * t * t * (3 - 2 * t)
    t = np.clip((deficit - SPOT_MOLE[0]) / (SPOT_MOLE[1] - SPOT_MOLE[0]), 0, 1); keep = 1 - t * t * (3 - 2 * t)
    return blob * keep * np.maximum(0, low - mid), blob * keep


def under_eyes(P, W, H):
    """Her under-eye areas (the lower lid's line moved down her face from UNDER_EYE[0] to UNDER_EYE[1] eye widths)."""
    ew = eye_width(P); down = P[152][:2] - P[10][:2]; down = down / max(np.hypot(*down), 1e-6)
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    for ids in LOWER_LIDS:
        lid = np.array([P[i][:2] for i in ids], np.float64)
        top, bottom = lid + down * ew * UNDER_EYE[0], lid + down * ew * UNDER_EYE[1]
        d.polygon([tuple(q) for q in np.concatenate([top, bottom[::-1]])], fill=255)
    return np.asarray(im, np.float32) / 255


def studio(u8, P, p=None):
    """Her photo (uint8 RGB) retouched; P her face's 478 points in its pixels."""
    P = np.asarray(P, np.float64); p = p or params(u8, P)
    H, W, _ = u8.shape; ew = eye_width(P)
    # her face's shapes: her face, what isn't skin, her features, her eyes' openings
    face = blur(poly_mask(P, OVAL, W, H), ew * 0.12)
    holes = blur(np.maximum.reduce([poly_mask(P, EYE_R, W, H, 0.45), poly_mask(P, EYE_L, W, H, 0.45), poly_mask(P, BROW_R, W, H, 0.3),
                                    poly_mask(P, BROW_L, W, H, 0.3), poly_mask(P, LIPS, W, H, 0.12)] + [poly_mask(P, n, W, H, 0.3) for n in NOSTRILS]), ew * 0.04)
    feats = blur(np.maximum.reduce([poly_mask(P, EYE_R, W, H, 0.7), poly_mask(P, EYE_L, W, H, 0.7), poly_mask(P, BROW_R, W, H, 0.35),
                                    poly_mask(P, BROW_L, W, H, 0.35), poly_mask(P, LIPS, W, H, 0.1)]), ew * 0.05)
    eyes = blur(np.maximum(poly_mask(P, EYE_R, W, H, -0.05), poly_mask(P, EYE_L, W, H, -0.05)), 0.7)
    under = blur(under_eyes(P, W, H), ew * 0.08)
    nose = blur(poly_mask(P, NOSE_BASE, W, H, SPOT_NOSE[0]), ew * SPOT_NOSE[1])
    skin = face * (1 - np.clip(holes * 1.6, 0, 1)); feat = np.clip(feats * 1.5, 0, 1)
    # her brightness (log) and her face's highlights, blurred
    x = lin(u8.astype(np.float64) / 255) * p['wb']; x0 = x
    y0 = luma(x); lg = np.log(np.maximum(y0, 1e-4))
    b_fine, b_blotch = blur(lg, ew * STUDIO['fine']), blur(lg, ew * STUDIO['blotch'])
    b_glow = blur(np.clip(y0 / max(p['pivot'], 1e-4) - 1.05, 0, GLOW_TOP) * face, ew * 0.18)
    b_y = blur(y0, max(0.7, ew * 0.012))
    yy, xx = np.mgrid[0:H, 0:W]; xx = xx + 0.5; yy = yy + 0.5
    cx, cy = P[:468, 0].mean(), P[:468, 1].mean(); dist = np.hypot(xx - cx, yy - cy)
    # richer colour: her face's region to her skin's own share, the rest a little
    t = np.clip((dist / (ew * 3) - 0.6) / 1.0, 0, 1); region = 1 - t * t * (3 - 2 * t)
    v = STUDIO['sat'] + (p['vs'] - STUDIO['sat']) * region
    # (a vibrance: no colour past its own or past her skin's own made richer by her skin's share)
    c = np.linalg.norm(x - y0[..., None], axis=-1) / np.maximum(y0, 1e-4)
    c2 = np.minimum(c * (1 + v), np.maximum(c, p['cs'] * (1 + p['vs'])))
    x = y0[..., None] + (x - y0[..., None]) * (c2 / np.maximum(c, 1e-6))[..., None]
    # skin: blotches softened (not the edges of her nose, lids or jaw: only where the unevenness is faint), fine texture kept
    band = b_fine - b_blotch
    lg2 = lg - STUDIO['smooth'] * skin * band * np.exp(-(band / STUDIO['edge']) ** 2) - STUDIO['pore'] * skin * (lg - b_fine)
    # blemishes: a dark blob on her skin lifted to the skin around it (her texture over it kept; a mole stays)
    lift, sure = spot_heal(b_blotch, b_fine, ew)
    lift, sure = lift * (1 - nose), sure * (1 - nose)
    lg2 = lg2 + STUDIO['spots'] * skin * lift
    x = x * np.exp(lg2 - lg)[..., None]
    # (and its red or brown cast, towards the colour of the skin around it)
    around = ring_of(x0, SPOT_RING * ew); around = around / np.maximum(luma(around), 1e-4)[..., None]
    yh = luma(x)[..., None]; cast = (STUDIO['spots'] * skin * sure * np.clip(lift / 0.15, 0, 1))[..., None]
    x = x + cast * (yh * around - x)
    # light: contrast about her skin's brightness, a soft shoulder, a soft vignette away from her face
    y = np.maximum(luma(x), 1e-5); yc = p['pivot'] * (y / p['pivot']) ** (1 + STUDIO['contrast'])
    yc = np.where(yc < 0.8, yc, 0.8 + 0.2 * np.tanh((yc - 0.8) / 0.2))
    rr = dist / (ew * 5.5)
    yc = yc * (1 - STUDIO['vignette'] * np.clip((rr - 0.8) / 1.2, 0, 1) ** 1.5 * (1 - face))
    x = x * (yc / y)[..., None]
    # face light: a beauty dish's fall-off, along her face's own axes
    c = (P[168][:2] + P[6][:2] + P[195][:2]) / 3; up = P[10][:2] - P[152][:2]; up = up / max(np.hypot(*up), 1e-6)
    dx, dy = xx - c[0], yy - c[1]
    u, w = (dx * -up[1] + dy * up[0]) / (ew * 1.5), (dx * up[0] + dy * up[1]) / (ew * 2)
    x = x * np.exp(STUDIO['face_light'] * (np.exp(-0.5 * (u * u + w * w)) - 0.5) * face)[..., None]
    # under her eyes: shadows lifted part of the way to her skin's brightness, and their cast towards her skin's colour
    local = np.exp(b_blotch)
    lift = np.minimum(1 + STUDIO['under_eye'] * under * np.maximum(0, p['pivot'] / np.maximum(local, 1e-4) - 1), UNDER_EYE_MAX)
    x = x * lift[..., None]
    yu = luma(x)[..., None]
    x = x + (STUDIO['under_eye_tint'] * under)[..., None] * (yu * p['tint'] - x)
    # glow: her face's highlights blooming softly, in her skin's warmth (in proportion to her own light, on any skin)
    x = x * (1 + STUDIO['glow'] * (b_glow * face)[..., None] * (0.5 + 0.5 * p['tint']))
    # eyes: the whites a little brighter and clearer (not her irises)
    iris = np.zeros((H, W))
    for c, ring in ((468, (469, 470, 471, 472)), (473, (474, 475, 476, 477))):
        if len(P) <= max(ring): break
        r = np.mean([np.hypot(*(P[j][:2] - P[c][:2])) for j in ring])
        iris = np.maximum(iris, np.clip((r * 1.1 - np.hypot(xx - P[c][0], yy - P[c][1])) / 1.5 + 0.5, 0, 1))
    sclera = eyes * (1 - iris)
    x = x + (STUDIO['eyes'] * sclera)[..., None] * ((luma(x) * 1.12)[..., None] - x)
    # her eyes, lashes, brows and lips crisper; her skin left soft
    x = x * (1 + STUDIO['sharp'] * p.get('sharp_k', 1) * feat * (y0 - b_y) / np.maximum(y0, 1e-3))[..., None]
    # her brightest colours kept in colour: no channel clipped (a clipped red turns lit skin flat and pale), her brightness kept
    y = luma(x)[..., None]; mx = x.max(-1, keepdims=True)
    m2 = GAMUT_KNEE + (1 - GAMUT_KNEE) * np.tanh((mx - GAMUT_KNEE) / (1 - GAMUT_KNEE))
    x = y + (x - y) * np.where((mx > GAMUT_KNEE) & (mx > y + 1e-4), np.maximum(0, (m2 - y) / np.maximum(mx - y, 1e-4)), 1)
    return (enc(x) * 255 + 0.5).astype(np.uint8)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    u8 = np.asarray(Image.open(src).convert('RGB'))
    if len(sys.argv) > 3: P = np.array(json.load(open(sys.argv[3])), np.float64)
    else:
        from teacher import landmarks3
        P = landmarks3(u8)
        if P is None: sys.exit('no face found')
    Image.fromarray(studio(u8, P)).save(dst)
