"""The catalog model without makeup: the teacher's 'bare' face.

The catalog's no-makeup photo (public/makeup/looks/no-makeup.webp) isn't bare: the model wears a little blush and a
tinted gloss. Divided by it, every look lost that much blush and lip colour (and the no-makeup look was no change at
all). This takes them out, pixel-locked: only the blush on her cheeks and the tint and gloss on her lips change; every
other pixel, and her face's geometry (her points stay those of the photo), stays as it is.

    python scripts/tinybeauty/bare.py out.png      # the bare face, to look at (the teacher makes it as it needs it)
"""
from __future__ import annotations
import sys
import cv2, numpy as np

# The blush on her cheeks is the redness (and slight darkening) above her skin's own, at blush scale, around her
# cheekbones and apples (eye widths); this much of it stays (a natural flush).
CHEEK_POINTS, CHEEK_R, CHEEK_KEEP = (50, 280, 205, 425, 117, 346), 0.45, 0.15
# Her lips: this share of their colour is her own; the gloss's sparkle and streaks (bright spots above her lips' level,
# smaller than LIP_SPOT eye widths) go, all but this much of their lift (a natural sheen).
LIP_OWN, LIP_SPOT, LIP_SHEEN = 0.8, 0.06, 0.15


def _nconv(x, w, s):
    return cv2.GaussianBlur(x * w, (0, 0), s) / np.maximum(cv2.GaussianBlur(w, (0, 0), s), 1e-4)


def true_bare(im, p3):
    """`im` (RGB uint8, the catalog's no-makeup photo) with its blush and lip tint and gloss taken out; p3: its points."""
    import teacher as T
    H, W = im.shape[:2]; p = p3[:, :2]; ew = T.eye_width(p)
    lab = cv2.cvtColor(im.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    skin = T.regions((H, W), p)['skin'].astype(np.float32)
    # cheeks: the redness above her skin's own around them, at blush scale
    cheeks = np.zeros((H, W), np.float32)
    for i in CHEEK_POINTS:
        cv2.circle(cheeks, tuple(int(v) for v in p[i]), int(ew * CHEEK_R), 1, -1)
    cheeks = cv2.GaussianBlur(cheeks, (0, 0), ew * 0.3) * skin
    cheeks = np.clip(cheeks / max(float(cheeks.max()), 1e-6) * 1.4, 0, 1)
    ref = skin * (1 - np.clip(cheeks * 3, 0, 1))      # her skin away from her cheeks
    base_a, base_L = (_nconv(lab[..., c], ref, ew * 0.9) for c in (1, 0))
    near_a, near_L = (_nconv(lab[..., c], skin, ew * 0.12) for c in (1, 0))
    out = lab.copy()
    out[..., 1] -= np.maximum(near_a - base_a, 0) * (1 - CHEEK_KEEP) * cheeks
    out[..., 0] -= np.minimum(near_L - base_L, 0) * (1 - CHEEK_KEEP) * cheeks   # (a blush darkens a little)
    # lips: less of the tint (her lips' own colour, the same hue), the gloss's bright spots brought down to a sheen
    lm = cv2.GaussianBlur(T.lip_hard((H, W), p).astype(np.float32), (0, 0), ew * 0.02)
    L, a, b = lab[..., 0], lab[..., 1] * LIP_OWN, lab[..., 2] * LIP_OWN
    k = max(3, int(round(ew * LIP_SPOT)) | 1)
    Lo = cv2.morphologyEx(L, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    lift = np.maximum(L - cv2.GaussianBlur(Lo, (0, 0), 0.8), 0)
    nL = L - lift * (1 - LIP_SHEEN) + 1.0
    w = np.clip(lift / 5, 0, 1)                        # (a sparkle is white: there her lips' colour from around it)
    a = a * (1 - w) + _nconv(a, lm * (1 - w), ew * 0.05) * w
    b = b * (1 - w) + _nconv(b, lm * (1 - w), ew * 0.05) * w
    for c, v in ((0, nL), (1, a), (2, b)):
        out[..., c] = out[..., c] * (1 - lm) + v * lm
    return np.clip(cv2.cvtColor(out, cv2.COLOR_Lab2RGB) * 255, 0, 255).round().astype(np.uint8)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__); raise SystemExit
    import teacher as T
    bare, _ = T._bare()
    cv2.imwrite(sys.argv[1], cv2.cvtColor(bare, cv2.COLOR_RGB2BGR))
    print(sys.argv[1])
