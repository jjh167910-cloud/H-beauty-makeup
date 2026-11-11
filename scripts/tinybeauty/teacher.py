"""The makeup engine's reference implementation ("teacher"), and the files the app needs.

Every look photo in public/makeup/looks/ is an edit of the same bare-face portrait
(no-makeup.webp), so

    makeup layer = look photo / bare photo   (aligned with the 468-point MediaPipe face mesh,
                                               in linear light, as a log-ratio)

is exactly the look's makeup. It is warped onto any face along the mesh and multiplied onto it.
On top of that:
  * lipstick: matte / satin / lined / ombre lips put down opaque colour (measured from the look
    photo) over her own lip texture and shading; gloss is a sheer tint with her own highlights.
    The colour is matched to her photo's light through the whites of the eyes, and nude shades
    follow her skin depth (a nude chosen for the model becomes the same nude for her);
  * the look's crisp liner/lash detail (eye map);
  * intensity: soft / natural / bold.
Nothing outside the makeup changes: her face, skin tone and background stay her own pixels.

The app runs the same steps on the phone's graphics chip (src/lib/makeup-gl.ts). This file is
also the teacher for the TinyBeauty-style fallback networks (train.py).

    python scripts/tinybeauty/teacher.py eyes      # (re)build public/tryon/eyes/*.png + eyes.json
    python scripts/tinybeauty/teacher.py layers    # (re)build public/tryon/layers/*.webp + looks.json
"""
from __future__ import annotations
import json, sys
from functools import lru_cache
from pathlib import Path
import cv2, numpy as np

REPO = Path(__file__).resolve().parents[2]
LOOKS = REPO / 'public/makeup/looks'
TRYON = REPO / 'public/tryon'

OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
LIPS_OUT = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
LIPS_IN = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]   # eye on the image's left
EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]
BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
BROW_LOW_R = [46, 53, 52, 65, 55]
BROW_LOW_L = [276, 283, 282, 295, 285]

lin = lambda u8: (u8.astype(np.float32) / 255) ** 2.2
srgb = lambda f: (np.clip(f, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
rgb = lambda path: cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2RGB)


# ----------------------------------------------------------------- MediaPipe
@lru_cache(None)
def _detector():
    from mediapipe.tasks.python import vision, BaseOptions
    return vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(TRYON / 'face_landmarker.task')), num_faces=1))

def landmarks3(img: np.ndarray):
    """478 MediaPipe points (x, y in pixels, z in pixel-like units), or None."""
    import mediapipe as mp
    h, w = img.shape[:2]
    r = _detector().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    if not r.face_landmarks: return None
    return np.array([[q.x * w, q.y * h, q.z * w] for q in r.face_landmarks[0]], np.float32)

@lru_cache(None)
def mesh_triangles() -> np.ndarray:
    """MediaPipe's canonical face-mesh triangles (852), from its tessellation edge list."""
    from mediapipe.tasks.python.vision import FaceLandmarksConnections as C
    e = [(c.start, c.end) for c in C.FACE_LANDMARKS_TESSELATION]
    tris = {tuple(sorted((e[i][0], e[i + 1][0], e[i + 2][0]))) for i in range(0, len(e), 3)}
    return np.array(sorted(tris))

def eye_width(p):
    return (np.linalg.norm(p[33, :2] - p[133, :2]) + np.linalg.norm(p[263, :2] - p[362, :2])) / 2

def ffhq_quad(p):
    """FFHQ alignment (NVIDIA's recipe) from MediaPipe points - the same as src/lib/tryon.ts."""
    el, er = p[EYE_R, :2].mean(0), p[EYE_L, :2].mean(0)
    ml, mr = p[61, :2], p[291, :2]
    eye_avg = (el + er) / 2; e2e = er - el; e2m = (ml + mr) / 2 - eye_avg
    x = e2e - np.flipud(e2m) * [-1, 1]; x /= np.hypot(*x)
    x *= max(np.hypot(*e2e) * 2.0, np.hypot(*e2m) * 1.8)
    y = np.flipud(x) * [-1, 1]; c = eye_avg + e2m * 0.1
    return np.float32([c - x - y, c - x + y, c + x + y, c + x - y])


# ------------------------------------------------------------- symmetry
# Each landmark's mirror image across the face, and its half (-1: the side of point 33, the left of a
# straight-on photo; 0: the midline; 1: the other side). From MediaPipe's canonical face model
# (mediapipe/modules/face_geometry/data/canonical_face_model.obj, Apache-2.0), which is symmetric.
MIRROR = np.array([0,1,2,248,4,5,6,249,8,9,10,11,12,13,14,15,16,17,18,19,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,281,282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,94,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,341,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,358,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376,377,378,379,151,152,380,381,382,383,384,385,386,387,388,389,390,164,391,392,393,168,394,395,396,397,398,399,175,400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,195,419,197,420,199,200,421,422,423,424,425,426,427,428,429,430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,450,451,452,453,454,455,456,457,458,459,460,461,462,463,464,465,466,467,3,7,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,153,154,155,156,157,158,159,160,161,162,163,165,166,167,169,170,171,172,173,174,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,196,198,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247])
HALF = np.array([0,0,0,-1,0,0,0,-1,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,0,-1,0,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1])
NARROW = 0.88    # an eye this much narrower than the other in a photo is seen at an angle

def far_half(p):
    """The half of a photo's face turned away from the camera (-1 or 1), when one eye is clearly
    narrower than the other; else 0."""
    p = np.asarray(p)[:, :2]
    r, l = np.linalg.norm(p[33] - p[133]), np.linalg.norm(p[263] - p[362])
    return -1 if r < NARROW * l else 1 if l < NARROW * r else 0

def symmetric(p, far=None):
    """Source points for a warp from a photo whose face is turned: the far half takes its near half's
    points, so it is painted with the mirror image of the near half (makeup is symmetric, and the near
    half is seen straight on and sharp)."""
    far = far_half(p) if far is None else far
    if not far: return p
    q = np.array(p, copy=True); idx = np.flatnonzero(HALF == far)     # the 468 mesh points (not the irises)
    q[idx] = np.asarray(p)[MIRROR[idx]]
    return q


# ------------------------------------------------------------------ warping
def mesh_warp(img, ps, pt, shape, z=None):
    """Piecewise-affine warp of img from source points ps to target points pt along the face
    mesh; with target depths z, nearer triangles are drawn last."""
    tris = mesh_triangles()
    if z is not None: tris = tris[np.argsort(-z[tris].mean(1))]
    ps, pt = ps[:, :2], pt[:, :2]
    out = np.zeros(shape + img.shape[2:], np.float32); cover = np.zeros(shape, np.float32)
    for t in tris:
        s, d = ps[t].astype(np.float32), pt[t].astype(np.float32)
        x, y, w, h = cv2.boundingRect(d)
        if w <= 0 or h <= 0: continue
        M = cv2.getAffineTransform(s, d - np.float32([x, y]))
        patch = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        m = np.zeros((h, w), np.uint8); cv2.fillConvexPoly(m, np.int32(np.round(d - [x, y])), 1)
        y0, x0 = max(0, y), max(0, x); y2, x2 = min(shape[0], y + h), min(shape[1], x + w)
        if y2 <= y0 or x2 <= x0: continue
        mm = m[y0 - y:y2 - y, x0 - x:x2 - x] > 0
        out[y0:y2, x0:x2][mm] = patch[y0 - y:y2 - y, x0 - x:x2 - x][mm]
        cover[y0:y2, x0:x2][mm] = 1
    return out, cover

def poly_mask(shape, pts, ids_list, scale=None):
    m = np.zeros(shape, np.float32)
    for ids in ids_list:
        q = pts[ids]
        if scale is not None: c = q.mean(0); q = c + (q - c) * scale
        cv2.fillPoly(m, [np.int32(np.round(q))], 1)
    return m

def regions(shape, p):
    """Masks in a photo's own coordinates: face, fine zone (eyes, lids, wings, lips), eyeballs, mouth, plain skin."""
    ew = eye_width(p)
    face = poly_mask(shape, p, [OVAL]); fine = np.zeros(shape, np.float32)
    for ring, brow in ((EYE_R, BROW_R), (EYE_L, BROW_L)):
        e = p[ring]; c = e.mean(0)
        hull = cv2.convexHull(np.float32(np.vstack([e, p[brow], [c + [ew * 0.95, -ew * 0.2], c + [-ew * 0.8, 0], c + [0, ew * 0.45]]])))
        cv2.fillConvexPoly(fine, np.int32(hull), 1)
    cv2.fillPoly(fine, [np.int32(np.round(p[LIPS_OUT]))], 1)
    fine = cv2.GaussianBlur(cv2.dilate(fine, np.ones((5, 5))), (0, 0), ew * 0.08)
    balls = poly_mask(shape, p, [EYE_R, EYE_L], scale=BALL_SCALE)
    mouth = poly_mask(shape, p, [LIPS_IN])
    skin = face * (1 - poly_mask(shape, p, [LIPS_OUT])) * (1 - cv2.dilate(poly_mask(shape, p, [EYE_R, EYE_L, BROW_R, BROW_L], scale=1.6), np.ones((9, 9))))
    return dict(ew=ew, face=face, fine=fine, balls=balls, mouth=mouth, skin=skin)


BALL_SCALE = [0.95, 0.8]   # the eyeball, as a share of the eye opening: no layer or eye detail inside it
BALL_SOFT = 0.015          # its edge's softness, in eye widths (at least 1.5 px)
FEATHER = 0.35             # the look's layer fades in over this far inside her face's outline (bare-face eye widths)
DETAIL_SHARP = 0.75        # her photo's blur (px) up to which the look's eye detail stays as crisp as in the catalog

def ball_keep(shape, p):
    """1 outside her eyeballs, 0 inside (softened): layer and eye detail stay on the lids."""
    ew = eye_width(np.asarray(p)[:, :2])
    return 1 - cv2.GaussianBlur(poly_mask(shape, np.asarray(p)[:, :2], [EYE_R, EYE_L], scale=BALL_SCALE), (0, 0), max(1.5, ew * BALL_SOFT))

@lru_cache(None)
def feather_weights():
    """Per mesh point, how much of the look's layer it carries: 0 on the face's outline, 1 from FEATHER inside it
    (distances on the bare catalog face, the larger of each point and its mirror image). As meshFeather() in makeup-gl.ts."""
    import json
    c = json.load(open(TRYON / 'looks.json'))['canon']
    q = np.array(c['pts'], np.float64).reshape(-1, 2); ew = float(c['ew'])
    a = q[OVAL]; b = np.roll(a, -1, axis=0); ab = b - a
    t = np.clip(((q[:, None] - a[None]) * ab[None]).sum(-1) / (ab * ab).sum(-1)[None], 0, 1)
    d = np.linalg.norm(q[:, None] - (a[None] + ab[None] * t[..., None]), axis=-1).min(1)
    d = np.maximum(d, d[MIRROR[:len(d)]])
    t = np.clip(d / (FEATHER * ew), 0, 1)
    # none on or inside the catalog lips, all from LIP_FILL[1] past them: there the layer is filled from the skin-level
    # colour around (a catalog lipstick drawn past the model's lip line left a moustache's shadow on her skin)
    a = q[LIPS_OUT]; b = np.roll(a, -1, axis=0); ab = b - a
    s = np.clip(((q[:, None] - a[None]) * ab[None]).sum(-1) / (ab * ab).sum(-1)[None], 0, 1)
    dl = np.linalg.norm(q[:, None] - (a[None] + ab[None] * s[..., None]), axis=-1).min(1) / ew
    inside = np.array([cv2.pointPolygonTest(np.float32(a), (float(x), float(y)), False) > 0 for x, y in q])
    l = np.where(inside, 0, np.clip((dl - LIP_FILL[0]) / (LIP_FILL[1] - LIP_FILL[0]), 0, 1))
    return np.r_[t * t * (3 - 2 * t) * l * l * (3 - 2 * l), np.ones(10)].astype(np.float32)

EYE_AROUND = (0.6, 1.1)   # around an eye (eye widths from its centre on the bare catalog face): all of it, then none
LIP_FILL = (0.05, 0.15)   # the layer's weight past the catalog lips' outline (eye widths): none, then all

@lru_cache(None)
def eye_regions():
    """Per mesh point, how much it lies around each eye (image-left eye, the other): 1 within EYE_AROUND[0] eye
    widths of the eye's centre on the bare catalog face, 0 beyond EYE_AROUND[1]. As meshEyes() in makeup-gl.ts."""
    import json
    c = json.load(open(TRYON / 'looks.json'))['canon']
    q = np.array(c['pts'], np.float64).reshape(-1, 2); ew = float(c['ew'])
    def around(eye):
        t = np.clip((np.linalg.norm(q - q[eye].mean(0), axis=1) / ew - EYE_AROUND[0]) / (EYE_AROUND[1] - EYE_AROUND[0]), 0, 1)
        return np.r_[1 - t * t * (3 - 2 * t), np.ones(478 - len(q))].astype(np.float32)
    return around(EYE_R), around(EYE_L)

def feather_map(p, shape):
    """The layer's share at each pixel of her photo (feather_weights along her mesh, front-most surface); around an
    eye that is hardly seen (the far eye of a face in profile, eye_shown) the look's eye makeup fades out too."""
    w = feather_weights()
    s = eye_shown(p)
    if min(s) < 0.999:
        gR, gL = eye_regions()
        w = w * (1 - (1 - s[0]) * gR) * (1 - (1 - s[1]) * gL)
    return zbuffer(p, shape, w[:len(p)])[1]

def photo_blur(img, p):
    """How soft the photo is around her eye: Gaussian sigma (px) explaining how little a further small blur
    (sigma 1.5) changes its edges. As photoBlur() in tryon.ts."""
    p = np.asarray(p)[:, :2]; ew = eye_width(p); c = p[EYE_R].mean(0)
    x0, y0 = max(0, int(np.floor(c[0] - ew * 0.7))), max(0, int(np.floor(c[1] - ew * 0.5)))
    x1, y1 = min(img.shape[1], int(np.floor(c[0] + ew * 0.7))), min(img.shape[0], int(np.floor(c[1] + ew * 0.4)))
    if x1 - x0 < 10 or y1 - y0 < 10: return 1.0
    g = (img[y0:y1, x0:x1].astype(np.float64) @ [0.299, 0.587, 0.114]) / 255
    def energy(x):
        dx = x[:-1, 1:] - x[:-1, :-1]; dy = x[1:, :-1] - x[:-1, :-1]; return float((dx * dx + dy * dy).mean())
    r = np.sqrt(energy(cv2.GaussianBlur(g, (11, 11), 1.5, borderType=cv2.BORDER_REPLICATE)) / max(energy(g), 1e-12))
    return float(min(4, max(0.4, 1.5 * r / np.sqrt(max(1 - r * r, 1e-3)))))

def detail_sigma(blur):
    """How much to soften the look's eye detail (px) so it is as sharp as her photo."""
    return max(0.0, blur - DETAIL_SHARP)

CONCEAL = 0.6        # concealer: how far a darker under-eye is lifted towards her skin's typical brightness (in log light)
CONCEAL_MAX = 1.35   # at most this much lighter

def conceal_zone(p, shape):
    """Where concealer goes: a soft ellipse under each eye (as the tutorial's concealer zone); the far eye's fades out
    as a turned head hides it. As uConC* in makeup-gl.ts."""
    q = np.asarray(p, np.float64)[:, :2]; ew = eye_width(q)
    across = q[263] - q[33]; across /= np.linalg.norm(across); down = np.array([-across[1], across[0]])
    H, W = shape; ys, xs = np.mgrid[0:H, 0:W] + 0.5
    z = np.zeros(shape, np.float32)
    for eye, out, k in ((EYE_R, -across, eye_shown(p)[0]), (EYE_L, across, eye_shown(p)[1])):
        c = q[eye].mean(0) + down * ew * 0.42 + out * ew * 0.05
        dx, dy = xs - c[0], ys - c[1]
        r = np.sqrt(((dx * across[0] + dy * across[1]) / (ew * 0.55)) ** 2 + ((dx * down[0] + dy * down[1]) / (ew * 0.24)) ** 2)
        t = np.clip((1.25 - r) / 0.55, 0, 1)
        z = np.maximum(z, t * t * (3 - 2 * t) * k)
    return z

def conceal_gain(user, user_lin, p, amount=1.0):
    """Her light under the eyes after concealer: dark circles lifted towards her skin's median brightness, never
    darkened. Her local brightness is her grey level softened as for the eye detail (greyB in makeup-gl.ts)."""
    ref = skin_lum(user_lin, p)
    if ref is None or amount <= 0: return np.ones(user_lin.shape[:2], np.float32)
    ew = eye_width(np.asarray(p)[:, :2])
    grey = cv2.cvtColor(user, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    Yl = soften(grey, max(1.2, ew * 0.042)) ** 2.2
    gain = np.clip(ref / np.maximum(Yl, 1e-4), 1, CONCEAL_MAX) ** CONCEAL
    return 1 + (gain - 1) * conceal_zone(p, user_lin.shape[:2]) * amount

# ------------------------------------------------------------ foundation
# Her foundation: her skin evened out everywhere inside her face's outline (her own, if she moved it), right up to it.
FOUND_COLOUR = 0.7                      # how much of her skin's uneven colour (redness, blotches) it covers
FOUND_NEAR, FOUND_WIDE = 0.05, 0.6      # her skin's colour softened over these (eye widths): local, broad
FOUND_UP, FOUND_DOWN, FOUND_OUT, FOUND_SOFT = 0.8, 0.1, 0.35, 0.1   # up her forehead, down onto her neck, past her outline (her visible face decides), edge
FOUND_DARK = (0.2, 0.4)                 # darker than this share of her skin's brightness (nostrils, lashes, a strand) isn't skin
FOUND_FACE = (0.6, 0.95)                # the segmenter's face-skin probability from which (to which) shade is lifted
FOUND_REACH, FOUND_NEAR_OUT = 0.45, 0.08  # skin going on further past her outline than this is her ear or neck: only this far
FOUND_LIGHT, FOUND_LIFT, FOUND_WIDE_L = 0.6, 1.6, 0.3   # her skin in shade lifted towards her skin's median brightness:
                                        # how much (in log light), at most how far below it counts, softened over (eye widths)

def seg_face(seg, x, y, c=0):
    """The segmenter's face-skin probability (c=1: body skin) at photo points (x, y) (pixel units, centres at .5),
    bilinear on its crop (outside it: 0). seg = (probs, box) from occlusion.classes. As segFace() in makeup-gl.ts."""
    probs, (x0, y0, side) = seg; n = probs.shape[0]; g = n / side
    gx, gy = (np.asarray(x) + 0.5 - x0) * g - 0.5, (np.asarray(y) + 0.5 - y0) * g - 0.5
    inside = (gx >= -0.5) & (gy >= -0.5) & (gx <= n - 0.5) & (gy <= n - 0.5)
    gx, gy = np.clip(gx, 0, n - 1), np.clip(gy, 0, n - 1)
    ix, iy = np.minimum(np.floor(gx).astype(int), n - 2), np.minimum(np.floor(gy).astype(int), n - 2)
    fx, fy = gx - ix, gy - iy; f = probs[..., c]
    v = (f[iy, ix] * (1 - fx) + f[iy, ix + 1] * fx) * (1 - fy) + (f[iy + 1, ix] * (1 - fx) + f[iy + 1, ix + 1] * fx) * fy
    return np.where(inside, v, 0.0)

def found_shapes(p, seg=None):
    """Where her foundation goes: her face's outline further out, its upper part carried on up her forehead (her hairline
    is where her visible face ends) and its lower part a little down her neck (blended there, no line at her jaw); without
    her eyes with her brows (one shape each) and her lips. How far out: as far as her face skin goes past the outline (the
    face model's outline often runs inside her cheek), at most FOUND_OUT eye widths; where her skin goes on further than
    FOUND_REACH (her ear, her neck) only a little. `seg`: (probs, box) from occlusion.classes. As foundShapes() in makeup-gl.ts."""
    q = np.asarray(p, np.float64)[:, :2]; ew = eye_width(q)
    up = q[10] - q[152]; up /= max(np.linalg.norm(up), 1e-6)
    eye = q[EYE_R + EYE_L].mean(0); mouth = q[LIPS_OUT].mean(0)
    o = q[OVAL].copy()
    o += up[None] * (FOUND_UP * ew * np.clip((o - eye) @ up / (0.6 * ew), 0, 1))[:, None]
    o -= up[None] * (FOUND_DOWN * ew * np.clip((mouth - o) @ up / (0.6 * ew), 0, 1))[:, None]
    d = o - o.mean(0); n = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
    out = np.full(len(o), FOUND_OUT)
    if seg is not None:
        t = np.arange(0, FOUND_REACH + 1e-9, 0.02)                        # along each point's way out (eye widths)
        f = seg_face(seg, o[:, 0, None] + n[:, 0, None] * t * ew, o[:, 1, None] + n[:, 1, None] * t * ew)
        ends = np.where((f < 0.5).any(1), t[np.argmax(f < 0.5, axis=1)], np.inf)
        out = np.where(ends <= FOUND_REACH, np.clip(ends + 0.05, FOUND_NEAR_OUT, FOUND_OUT), FOUND_NEAR_OUT)
        out = 0.25 * np.roll(out, 1) + 0.5 * out + 0.25 * np.roll(out, -1)
    o = o + n * (out * ew)[:, None]
    holes = []
    for ring, brow in ((EYE_R, BROW_R), (EYE_L, BROW_L)):
        h = hull(np.vstack([q[ring], q[brow]])); holes.append(h.mean(0) + (h - h.mean(0)) * 1.15)
    lips = q[LIPS_OUT]; holes.append(lips.mean(0) + (lips - lips.mean(0)) * 1.1)
    return o, holes

def hull(pts):
    """Convex hull, counter-clockwise from the leftmost point (Andrew's monotone chain; as hull() in makeup-gl.ts)."""
    P = sorted(map(tuple, np.asarray(pts, np.float64)))
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for x in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], x) <= 0: lo.pop()
        lo.append(x)
    for x in reversed(P):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], x) <= 0: hi.pop()
        hi.append(x)
    return np.array(lo[:-1] + hi[:-1], np.float64)

def foundation(user, user_lin, p, vis=None, amount=1.0, seg=None, tint=None, finish=0.0):
    """Her foundation as a gain on her light (H, W, 3). Her skin's colour softened a little (FOUND_NEAR) is brought towards
    her face's broad colour (FOUND_WIDE: her skin's average colour, every part of it counted alike, so that evened out her
    face is no cooler or warmer as a whole) at the same brightness, by FOUND_COLOUR: redness and blotches even out; and where
    her skin softened over FOUND_WIDE_L is darker than her skin's median brightness (the side of her face in shade), it is
    lifted part of the way (FOUND_LIGHT, in log light, from at most FOUND_LIFT below), never darkened. Her skin's texture
    stays. The averages are normalized convolutions over her visible skin inside found_shapes() (not her hair,
    nostrils or lashes); worked out at 1/EXTEND_SCALE of the size, then read at each pixel, as on the graphics chip.
    `vis`: occlusion.visible (None: all of it); nothing changes where her face isn't seen.
    `seg`: (probs, box) from occlusion.classes (None: unknown): her face skin, where shade is lifted and how far out it goes.
    `tint`: the foundation's shade (a colour gain, look_tint), on all of it. `finish`: her skin's own shine (brighter than
    her skin softened over FOUND_NEAR) taken down (-1 matte) or brought up (1 dewy)."""
    H, W = user.shape[:2]; ew = eye_width(np.asarray(p)[:, :2])
    if amount <= 0: return np.ones((H, W, 3), np.float32)
    sw, sh = -(-W // EXTEND_SCALE), -(-H // EXTEND_SCALE); kx, ky = sw / W, sh / H
    outline, holes = found_shapes(p, seg)
    m = np.zeros((sh, sw), np.float32)
    at = lambda q: np.int32(np.round((np.asarray(q) * [kx, ky] - 0.5) * 16))
    cv2.fillPoly(m, [at(outline)], 1, shift=4)
    for h in holes: cv2.fillPoly(m, [at(h)], 0, shift=4)
    R = soften(m, FOUND_SOFT * ew * kx)
    small = lambda x: cv2.resize(x, (sw, sh), interpolation=cv2.INTER_LINEAR)
    lu = small(user.astype(np.float32) / 255) ** 2.2
    S = R * (small(vis.astype(np.float32)) if vis is not None else 1)
    ref = skin_lum(user_lin, p)
    if ref:
        t = np.clip((luma(lu) / ref - FOUND_DARK[0]) / (FOUND_DARK[1] - FOUND_DARK[0]), 0, 1); S = S * t * t * (3 - 2 * t)
    A = np.dstack([lu * S[..., None], S]).astype(np.float32)
    A2 = np.dstack([lu / np.maximum(luma(lu), 1e-4)[..., None] * S[..., None], S]).astype(np.float32)
    up = lambda x: cv2.resize(x, (W, H), interpolation=cv2.INTER_LINEAR)
    N, L = (up(soften(A, s * ew * kx)) for s in (FOUND_NEAR, FOUND_WIDE_L)); C = up(soften(A2, FOUND_WIDE * ew * kx)); R = up(R)
    yN, yC = (np.maximum(luma(x[..., :3]), 1e-6) for x in (N, C))
    cg = ((C[..., :3] / yC[..., None]) / np.maximum(N[..., :3] / yN[..., None], 1e-5)) ** (FOUND_COLOUR * amount)
    cg /= np.maximum(luma(cg), 1e-5)[..., None]
    # her skin in shade (the side of her face by her hair, under her jaw) lifted towards her skin's typical brightness,
    # never darkened: the foundation covers all of her face, not just its lit middle
    if ref:
        yL = luma(L[..., :3]) / np.maximum(L[..., 3], 1e-4)
        if seg is not None:
            ys, xs = np.mgrid[0:H, 0:W]; face = seg_face(seg, xs, ys)
        sure = np.clip((face - FOUND_FACE[0]) / (FOUND_FACE[1] - FOUND_FACE[0]), 0, 1) if seg is not None else 1
        k = FOUND_LIGHT * amount * sure * sure * (3 - 2 * sure)
        cg = cg * (np.clip(ref / np.maximum(yL, 1e-6), 1, FOUND_LIFT) ** k)[..., None]
    if tint is not None: cg = cg * np.asarray(tint, np.float32)
    if finish:
        hl = luma(user_lin) / np.maximum(yN / np.maximum(N[..., 3], 1e-4), 1e-6)
        cg = cg * np.where(hl > 1, np.maximum(hl, 1) ** (finish * (0.75 if finish < 0 else 0.9)), 1.0)[..., None]
    w = R * np.clip(N[..., 3] / 0.1, 0, 1) * (vis if vis is not None else 1)
    gain = 1 + (cg - 1) * w[..., None]
    if tint is not None and seg is not None:
        gain = gain * (1 + (np.asarray(tint, np.float32) - 1) * neck_weight(p, seg, (H, W), R)[..., None])
    return gain.astype(np.float32)

TINT_NECK = (-0.7, -0.4, 0.5)   # the foundation's shade down her neck: from this far above her chin (eye widths, along
                                # her face's down), full, to this far below it, none
def neck_weight(p, seg, shape, w):
    """How much of the foundation's shade goes on her neck, blended down from her jaw: her body skin (the segmenter's)
    outside where the foundation goes (w: its shape, softened; so not a hand in front of her face), from TINT_NECK[0] to
    [1] eye widths above her chin coming in, gone by [2] below it, and no wider than her jaw. As in FOUND_FS."""
    H, W = shape; q = np.asarray(p, np.float64)[:, :2]; ew = eye_width(q)
    down = q[152] - q[10]; down /= max(np.linalg.norm(down), 1e-6); right = np.array([-down[1], down[0]])
    ys, xs = np.mgrid[0:H, 0:W] + 0.5
    d = ((xs - q[152, 0]) * down[0] + (ys - q[152, 1]) * down[1]) / ew
    side = np.abs((xs - q[152, 0]) * right[0] + (ys - q[152, 1]) * right[1]) / max(abs((q[397] - q[172]) @ right) / 2, 1e-6)
    sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
    body = sm(0.3, 0.8, seg_face(seg, xs - 0.5, ys - 0.5, 1))
    return (np.clip(1 - w, 0, 1) * body * sm(TINT_NECK[0], TINT_NECK[1], d) * (1 - sm(0, TINT_NECK[2], d)) * (1 - sm(0.9, 1.1, side))).astype(np.float32)

def soften(x, sigma):
    if sigma <= 0.3: return x
    k = 2 * int(np.ceil(3 * sigma)) + 1
    return cv2.GaussianBlur(x, (k, k), sigma, borderType=cv2.BORDER_REPLICATE)


# ------------------------------------------------------------- makeup layer
@lru_cache(None)
def _bare():
    b = rgb(LOOKS / 'no-makeup.webp'); return b, landmarks3(b)

PLAIN_BROAD = 0.25   # over plain skin, the catalog's lightening broader than this (eye widths) is partly left out
BROAD_KEEP = 0.5     # ...this much of it stays (a highlight on her cheekbones; the rest evened the bare face's own patches)
PLAIN_LUM = (-0.5, 0.15)   # over plain skin, the layer darkens or lightens at most this much (log)
PLAIN_CHROMA = -0.3        # ...and takes away at most this much of green or blue (redness taken away is left out)
EYE_LIGHT = 0.25           # around the eyes the layer lightens at most this much (a pale or shimmer shadow; not the catalog's eye whites)
TONE_KEEP = (0.8, 0.9)     # how much of the look's complexion (brightness, colour) goes on her foundation
TONE_MAX = 0.3             # the complexion's change, at most (log, per colour)
FILL, FILL_OUT = 0.2, 1.08   # the layer's edge filled from inside (eye widths), out to this much of the face's outline
EDGE_IN, EDGE_SOFT = (0.95, 0.97), 0.1   # the layer fades out at this much of the catalog face's outline (x, y), over (eye widths)
CORE = (0.85, 0.92)   # inside this much of the outline the catalog's detail is all makeup; beyond, only its broad shapes

@lru_cache(None)
def _background():
    """The catalog's backdrop in the bare photo: its bright, grey part beyond 1.35x the face's outline, above the chin
    (not her hair, her neck or her clothes)."""
    base, pb = _bare(); P = pb[:, :2]; H, W = base.shape[:2]
    lb = lin(base); Y = luma(lb)
    out = ~(poly_mask((H, W), P, [OVAL], scale=1.35) > 0.5)
    sat = (lb.max(-1) - lb.min(-1)) / np.maximum(lb.max(-1), 1e-4)
    ys = np.mgrid[0:H, 0:W][0]
    bg = out & (Y > np.quantile(Y[out], 0.6)) & (sat < 0.25) & (ys < P[152][1])
    return cv2.erode(bg.astype(np.uint8), np.ones((5, 5))) > 0

@lru_cache(None)
def grading(look):
    """The catalog edit's change to the whole photo (exposure, white balance), not makeup: the mean log ratio of the
    look photo over the bare one on the backdrop (3,). The look photos are pixel-aligned edits of the bare one."""
    base, _ = _bare(); im = rgb(LOOKS / f'{look}.webp'); bg = _background()
    return np.log(lin(im)[bg].mean(0) / lin(base)[bg].mean(0)).astype(np.float32)

@lru_cache(None)
def look_tone(look):
    """The look's complexion: its skin's typical change over the bare photo's (the median over the skin, the grading
    taken out; at most TONE_MAX), as a log ratio (3,). It goes on her foundation (look_tint), not in the layer."""
    return layer_parts(look)[2]

def look_tint(look):
    """Her foundation's shade for the look (a colour gain): TONE_KEEP of its complexion's brightness and colour."""
    t = look_tone(look); l = t.mean()
    return np.exp(l * TONE_KEEP[0] + (t - l) * TONE_KEEP[1]).astype(np.float32)

def make_layer(look: str):
    """The look's makeup as a log-ratio layer (H, W, 3) in the look photo's own coordinates, + its points."""
    return layer_parts(look)[:2]

def catalog_visible(look, im, pl, base, pb, shape):
    """Where the catalog face is seen clearly in both the look photo and the bare one (warped onto the look), 0..1:
    the visible-face map (occlusion.visible: hair, the ear) and, away from the eyes, brows and lips, thin dark lines
    (strands of hair the segmentation misses, creases; ridges()); with HAIR_MARGIN eye widths around them left out too."""
    import occlusion as O
    H, W = shape; ew = eye_width(pl[:, :2])
    lines = lambda img, p: np.clip((ridges(img, eye_width(p[:, :2])) - RIDGE[0]) / (RIDGE[1] - RIDGE[0]), 0, 1)
    vb, cov = mesh_warp(np.dstack([O.visible(base, pb), lines(base, pb), np.zeros(base.shape[:2], np.float32)]), pb, pl, shape)
    v = np.minimum(O.visible(im, pl), np.where(cov > 0, vb[..., 0], 1))
    strands = np.maximum(lines(im, pl), np.where(cov > 0, vb[..., 1], 0))
    # eye makeup (liner, lashes, the wing), brows and lips are thin dark lines too: not there
    q = pl[:, :2]; away = np.ones(shape, np.float32)
    for ring, brow in ((EYE_R, BROW_LOW_R), (EYE_L, BROW_LOW_L)):
        e = q[ring]; c = e.mean(0); out = np.sign(c[0] - q[EYE_R + EYE_L, 0].mean()) or 1.0
        wing = [c + [out * ew * 0.95, -ew * 0.25], c + [out * ew * 0.85, ew * 0.05]]
        cv2.fillConvexPoly(away, np.int32(cv2.convexHull(np.float32(np.vstack([e, q[brow], wing])))), 0)
    for ids, k in (([BROW_R], 1.35), ([BROW_L], 1.35), ([LIPS_OUT], 1.15)):
        away *= 1 - poly_mask(shape, q, ids, scale=k)
    away = cv2.GaussianBlur(cv2.erode(away, np.ones((int(ew * 0.25) | 1,) * 2)), (0, 0), ew * 0.03) * (1 - wing_zone(look))
    v = np.clip(np.minimum(v, 1 - strands * away), 0, 1)
    r = max(1, int(round(ew * HAIR_MARGIN)))
    out = 1 - cv2.dilate(1 - v, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    return cv2.GaussianBlur(out, (0, 0), max(1.0, r / 2)).astype(np.float32)

def ridges(img_u8, ew, scales=(0.012, 0.022)):
    """Thin dark lines in a photo: a Hessian ridge measure (strong curvature across, little along), max over two
    widths (eye widths), relative to the local brightness."""
    g = cv2.cvtColor(img_u8, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    out = np.zeros_like(g)
    for s in scales:
        sg = max(0.8, s * ew); b = cv2.GaussianBlur(g, (0, 0), sg)
        dxx = cv2.Sobel(b, cv2.CV_32F, 2, 0, ksize=3); dyy = cv2.Sobel(b, cv2.CV_32F, 0, 2, ksize=3); dxy = cv2.Sobel(b, cv2.CV_32F, 1, 1, ksize=3)
        h = np.sqrt(((dxx - dyy) / 2) ** 2 + dxy ** 2); l1, l2 = (dxx + dyy) / 2 + h, (dxx + dyy) / 2 - h
        out = np.maximum(out, np.maximum(l1 - 2 * np.abs(l2), 0) * sg * sg)
    return out / (cv2.GaussianBlur(g, (0, 0), 0.1 * ew) + 0.02)

HAIR_MARGIN = 0.03
RIDGE = (0.3, 0.6)   # ridges() from which a line is (partly / surely) a strand
THIN = 0.3   # on plain skin, darker streaks narrower than this (eye widths) are left out

@lru_cache(None)
def layer_parts(look: str, fine_sigma=0.02, soft_sigma=0.07):
    """The look's makeup as a log-ratio layer (H, W, 3) in the look photo's own coordinates, its points, and its
    complexion (look_tone)."""
    base, pb = _bare()
    im = rgb(LOOKS / f'{look}.webp'); pl = landmarks3(im)
    H, W = im.shape[:2]
    bw, cover = mesh_warp(lin(base), pb, pl, (H, W))
    li = lin(im); R = regions((H, W), pl[:, :2]); ew = R['ew']; eps = 0.004
    def lo(x, s):
        return cv2.GaussianBlur(x * cover[..., None], (0, 0), s) / np.maximum(cv2.GaussianBlur(cover, (0, 0), s), 1e-3)[..., None]
    lr_f = np.log((lo(li, ew * fine_sigma) + eps) / (lo(bw, ew * fine_sigma) + eps))
    lr_s = np.log((lo(li, ew * soft_sigma) + eps) / (lo(bw, ew * soft_sigma) + eps))
    # the eye and lip zones get finer detail and freer colour; a wide transition so their edge never shows
    f = cv2.GaussianBlur(R['fine'], (0, 0), ew * 0.15)[..., None]
    f = np.maximum(f, wing_zone(look)[..., None])     # (and out along the look's own wing)
    lr = lr_f * f + lr_s * (1 - f)
    # the edit's change to the whole photo (exposure, white balance) is not makeup
    lr = lr - grading(look)
    # The look's complexion (its foundation's shade, a bronzed or porcelain skin) goes on her foundation, all the way to
    # her face's outline (look_tint); here it is taken out where her foundation goes on (not her eyes with their brows,
    # nor her lips: there the layer keeps all of the look). Contour, bronzer, blush and highlights stay, at full strength.
    sk = (R['skin'] * cover).astype(np.float32)
    tone = np.clip(np.median(lr[sk > 0.5], axis=0), -TONE_MAX, TONE_MAX).astype(np.float32)
    _, holes = found_shapes(pl)
    hm = np.zeros((H, W), np.float32)
    for h in holes: cv2.fillPoly(hm, [np.int32(np.round(h * 16))], 1, shift=4)
    lr = lr - tone * (1 - soften(hm, FOUND_SOFT * ew))[..., None]
    lum = lr.mean(-1, keepdims=True); chroma = lr - lum
    # thin dark streaks on plain skin (a strand of the catalog model's hair, a crease) are not makeup: anything darker
    # narrower than THIN eye widths is closed over there (contour and blush are broad; liner and lashes are in `f`)
    k = 2 * int(round(ew * THIN / 2)) + 1
    closed = cv2.GaussianBlur(cv2.morphologyEx(lum[..., 0], cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))), (0, 0), ew * THIN / 4)
    zone = np.minimum(1, 2 * f)     # (around the eyes and lips: their shadow's wing and smoky edge are narrow too)
    lum = lum * zone + np.maximum(lum, closed[..., None]) * (1 - zone)
    nf = 1 - f
    # Over plain skin the catalog's foundation evened out the bare face's own patches (lighter under its eyes and on its
    # cheeks, less red there): on her those would be patches too, ending before the edge of her face. Her own skin is
    # evened by her foundation (foundation()) instead, all the way to her face's outline; so here most of the broad
    # lightening and the redness taken away are left out. Contour and bronzer (broad, darker), highlights (lighter: the
    # narrow part and BROAD_KEEP of the broad one) and blush (redder) stay.
    lb = cv2.GaussianBlur(lum[..., 0] * sk, (0, 0), ew * PLAIN_BROAD) / np.maximum(cv2.GaussianBlur(sk, (0, 0), ew * PLAIN_BROAD), 1e-3)
    lum = np.minimum(lum, EYE_LIGHT) * f + np.clip(lum - np.maximum(lb, 0)[..., None] * (1 - BROAD_KEEP), *PLAIN_LUM) * nf
    red = np.float32([2, -1, -1]) / np.sqrt(6)      # (redness taken away: its part along red, where negative)
    plain = chroma - np.minimum(chroma @ red, 0)[..., None] * red
    plain[..., 1:] = np.maximum(plain[..., 1:], PLAIN_CHROMA)
    chroma = chroma * f + plain * nf
    lr = lum + chroma
    # Brows: the catalog edit redraws them slightly differently; keep her own.
    brows = cv2.GaussianBlur(poly_mask((H, W), pl[:, :2], [BROW_R, BROW_L], scale=1.45), (0, 0), ew * 0.08)
    lr *= (1 - brows)[..., None]
    # fade out before the face's edge: there the look photo differs from the bare one by more than
    # makeup (stray hair, the edge itself), which would show as an arc on her temples
    inner = poly_mask((H, W), pl[:, :2], [OVAL], scale=list(EDGE_IN))
    mask = cv2.GaussianBlur(inner * cover, (0, 0), ew * EDGE_SOFT) * (1 - cv2.GaussianBlur(R['mouth'], (0, 0), 2))
    # hair: strands fall differently in the two photos; anything much darker than skin in either photo
    # towards the face's edge is left out (the centre and the eyes - their shadow, liner and wing - are kept)
    sky = float(np.median(luma(bw[R['skin'] * cover > 0.5])))
    dark = ((luma(li) < 0.45 * sky) | (luma(bw) < 0.45 * sky)).astype(np.float32)
    core = cv2.GaussianBlur(poly_mask((H, W), pl[:, :2], [OVAL], scale=list(CORE)), (0, 0), ew * 0.08)
    hair = np.clip(cv2.GaussianBlur(cv2.dilate(dark, np.ones((7, 7))), (0, 0), ew * 0.03) * 2, 0, 1)
    keep = 1 - hair * (1 - core) * (1 - f[..., 0])
    # strands of hair over the face in either photo (the catalog model's hair falls across her temple and cheek), found
    # by the same visible-face map as on her photo, a little wider: not makeup, so left out everywhere and filled from
    # around (on her face a strand would be a thin dark line from her brow's tail down her cheek)
    # (not over the eyes and lips: the segmenter takes the liner and lashes for hair)
    keep = np.minimum(keep, np.maximum(catalog_visible(look, im, pl, base, pb, (H, W)), zone[..., 0]))
    edge = cv2.GaussianBlur(inner * cover, (0, 0), ew * EDGE_SOFT) * keep   # the mask without the mouth: where the edge took it out
    mask *= keep
    lr = np.clip(lr, np.log(0.06), np.log(3.0))
    m = mask.astype(np.float32)
    # outside the core, the catalog photo's own detail (a strand of hair, the edge) shows as thin light or dark
    # streaks on her: there the look is kept smooth (its broad shapes - contour, the shadow's wing - stay)
    sm = cv2.GaussianBlur(lr * m[..., None], (0, 0), ew * 0.1) / np.maximum(cv2.GaussianBlur(m, (0, 0), ew * 0.1), 1e-3)[..., None]
    lr = lr * core[..., None] + sm * (1 - core)[..., None]
    # and no lighter than her skin there: the look's highlights sit inside (cheekbones, nose, forehead); light near the
    # catalog face's edge is its hair or background, not makeup
    lr = lr - (np.maximum(lr.mean(-1), 0) * (1 - core))[..., None]
    # ...and there the look's skin-level colour from inside is carried on to the face's outline (smoothed over
    # FILL eye widths, clipped to EXTEND_T): no stripe where the look would stop short of her face's edge
    # (on plain skin, from plain skin only: the eyeshadow next to a strand doesn't run down her cheek)
    nconv = lambda w: cv2.GaussianBlur(np.clip(lr, -EXTEND_T, EXTEND_T) * w[..., None], (0, 0), ew * FILL) / np.maximum(cv2.GaussianBlur(w, (0, 0), ew * FILL), 1e-3)[..., None]
    fill = nconv(m) * f + nconv(m * (1 - f[..., 0])) * (1 - f)
    out = cv2.GaussianBlur(poly_mask((H, W), pl[:, :2], [OVAL], scale=FILL_OUT), (0, 0), ew * 0.05)
    lr = lr * mask[..., None] + fill * ((1 - edge) * out)[..., None]
    lr = lr + accent_layer(look, pl[:, :2], (H, W))     # what the photo can't carry: freckles, aegyo-sal
    return lr.astype(np.float32), pl, tone

# ------------------------------------------------------------- accents
# Two of a look's accents (its FaceLook's `accents`) are too fine for the catalog layer to carry: freckles (smoothed away
# with the catalog model's pores and strands) and aegyo-sal (the lit fold under the lower lashes, a Korean eye: lighter
# than the layer may make the skin around an eye). They are drawn into the look's layer instead, in the catalog photo's
# coordinates, so they follow her face along the mesh like the rest of the look (her far side is the near side's mirror).
FRECKLES = (0.048, 0.5, (0.018, 0.034), (0.07, 0.17))   # grid (eye widths), share of cells with one, radius, darkness (log)
MELANIN = np.float32([0.55, 1.0, 1.5])  # a freckle's darkening per colour (relative): a warm brown, not grey
AEGYO = (0.12, 0.05, 0.26, 0.24, 0.025, -0.1)    # band below the lower lash line (eye widths), its softness, lift (log); the fold's line
AEGYO_TINT = np.float32([1.05, 1.0, 1.0])       # (a pearly pink: a little more red)

def accents(look):
    import re
    m = re.search(r'style\("' + re.escape(look) + r'",.*?\{([^}]*)\}', STYLES.read_text(), re.S)
    a = re.search(r'accents: \[([^\]]*)\]', m.group(1)) if m else None
    return set(re.findall(r'"([^"]+)"', a.group(1))) if a else set()

def _segment_dist(q, a, b):
    d = b - a; t = np.clip(((q - a) @ d) / max(float(d @ d), 1e-9), 0, 1)
    return np.linalg.norm(q - (a + t[..., None] * d), axis=-1)

def freckle_field(p, shape):
    """Where freckles fall (0..1): across the bridge of the nose and over the cheeks under the eyes, not on the eyes."""
    H, W = shape; ew = eye_width(p); ys, xs = np.mgrid[0:H, 0:W].astype(np.float32); q = np.dstack([xs, ys])
    nose = np.exp(-(_segment_dist(q, p[6], p[4]) / (0.2 * ew)) ** 2)
    down = p[152] - p[10]; down = down / np.linalg.norm(down); across = np.array([down[1], -down[0]])
    out = nose
    for ring in (EYE_R, EYE_L):
        c = p[ring].mean(0) + down * 0.72 * ew; r = q - c
        out = np.maximum(out, np.exp(-((r @ across) / (0.5 * ew)) ** 2 - ((r @ down) / (0.24 * ew)) ** 2))
    eyes = cv2.GaussianBlur(poly_mask(shape, p, [EYE_R, EYE_L], scale=1.5), (0, 0), ew * 0.08)
    return out * (1 - eyes) * (1 - cv2.GaussianBlur(poly_mask(shape, p, [LIPS_OUT], scale=1.2), (0, 0), ew * 0.05))

def freckles(p, shape, seed=7):
    """Freckles as a darkening (log, <= 0): scattered over freckle_field, each a soft dot of its own size and depth."""
    H, W = shape; ew = eye_width(p); cell, share, (r0, r1), (a0, a1) = FRECKLES; field = freckle_field(p, shape)
    step = cell * ew; gy, gx = np.mgrid[0:int(H / step) + 1, 0:int(W / step) + 1]
    u = np.random.default_rng(seed).random((5, *gx.shape))
    cx, cy = (gx + u[0]) * step, (gy + u[1]) * step
    inside = (cx < W) & (cy < H)
    f = np.where(inside, field[np.minimum(cy, H - 1).astype(int), np.minimum(cx, W - 1).astype(int)], 0)
    on = u[2] < share * f
    out = np.zeros(shape, np.float32)
    for x, y, v, w, k in zip(cx[on], cy[on], u[3][on], u[4][on], f[on]):
        r = ew * (r0 + (r1 - r0) * v * v); a = (a0 + (a1 - a0) * w) * np.sqrt(k)
        x0, x1, y0, y1 = int(max(0, x - 3 * r)), int(min(W, x + 3 * r + 1)), int(max(0, y - 3 * r)), int(min(H, y + 3 * r + 1))
        yy, xx = np.mgrid[y0:y1, x0:x1]
        out[y0:y1, x0:x1] -= a * np.exp(-((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2) / (r * r))
    return np.maximum(out, -0.45)

LOWER_LIDS = ([133, 155, 154, 153, 145, 144, 163, 7, 33], [362, 382, 381, 380, 374, 373, 390, 249, 263])

def _along(q, line, shift, sigma, weight, n=32):
    """A soft line (0..1) along a polyline moved by `shift` (resampled to n segments), as strong at each segment as
    weight(its share of the way)."""
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))]
    t = np.linspace(0, seg[-1], n + 1); line = np.c_[np.interp(t, seg, line[:, 0]), np.interp(t, seg, line[:, 1])]
    out = np.zeros(q.shape[:2], np.float32)
    for k in range(n):
        w = weight((k + 0.5) / n)
        if w > 0: out = np.maximum(out, w * np.exp(-(_segment_dist(q, line[k] + shift, line[k + 1] + shift) / sigma) ** 2))
    return out

def aegyo(p, shape):
    """Aegyo-sal (log): a lit band along each lower lid (fullest towards the middle) and the fold's soft line under it."""
    H, W = shape; ew = eye_width(p); off, soft, lift, fold, fsoft, fdark = AEGYO
    down = p[152] - p[10]; down = down / np.linalg.norm(down)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32); q = np.dstack([xs, ys])
    hump = lambda a, b: (lambda t: float(np.sin(np.pi * np.clip((t - a) / b, 0, 1))) ** 0.7)
    band = sum(_along(q, p[l], down * off * ew, soft * ew, hump(0.05, 0.85)) for l in LOWER_LIDS)
    line = sum(_along(q, p[l], down * fold * ew, fsoft * ew, hump(0.15, 0.65)) for l in LOWER_LIDS)
    return lift * band, fdark * line

def accent_layer(look, p, shape):
    """The look's freckles and aegyo-sal (log ratio, H x W x 3), where its FaceLook has them."""
    acc = accents(look); out = np.zeros((*shape, 3), np.float32)
    if 'freckles' in acc: out += freckles(p, shape)[..., None] * MELANIN
    if 'aegyo' in acc:
        band, fold = aegyo(p, shape)
        out += band[..., None] * AEGYO_TINT + fold[..., None]
    return out

EDGE_KEEP = 0.5   # how much of the skin-level layer stays right at her visible face's edge

def skin_fade(w, edge):
    """The layer w (log ratio) with its skin-level part (|w| < ~0.1: foundation tint, glow) faded by `edge` (occlusion.edge_fade);
    stronger makeup (liner, shadow, lips, blush) keeps its full strength."""
    if edge is None: return w
    t = np.clip((np.abs(w).max(-1) - 0.1) / 0.15, 0, 1)
    e = EDGE_KEEP + (1 - EDGE_KEEP) * edge     # to half: all the way, a darkened face gets a light rim at her hair
    return w * (e + (1 - e) * t * t * (3 - 2 * t))[..., None]

EXTEND, EXTEND_IN, EXTEND_T, EXTEND_SCALE = 0.6, 0.12, 0.15, 4

def work_rect(p, shape):
    """Where the graphics chip works: around the face mesh plus 0.6 eye widths + 8 px (x0, y0, x1, y1). As render()."""
    q = np.asarray(p, np.float64)[:468, :2]; ew = eye_width(np.asarray(p)[:, :2]); m = ew * 0.6 + 8
    (x0, y0), (x1, y1) = q.min(0), q.max(0); H, W = shape
    return max(0, np.floor(x0 - m)), max(0, np.floor(y0 - m)), min(W, np.ceil(x1 + m)), min(H, np.ceil(y1 + m))

def extend_layer(w, fmc, p, shape):
    """The look at the edge of the face mesh. The mesh stops short of her face (mid-forehead, the jaw, a turned cheek), and
    near its edge the catalog layer carries the catalog photo's own edge (light and dark streaks). So towards the edge (the
    feather weights, squared) the layer gives way to its own smoothed skin-level colour (clipped to EXTEND_T, normalized
    convolution over EXTEND_IN eye widths), which across the edge gives way to the same colour smoothed over EXTEND eye
    widths and carried on over the skin around the mesh, fading out as the mesh gets far: no makeup stops in a line.
    w: the warped layer (log ratio, 0 off the mesh), fmc: its weights (feather x mesh cover). Worked out at
    1/EXTEND_SCALE of the size, as on the graphics chip."""
    H, W = shape; ew = eye_width(np.asarray(p)[:, :2])
    sw, sh = -(-W // EXTEND_SCALE), -(-H // EXTEND_SCALE); k = sw / W
    A = cv2.resize(np.dstack([0.5 + np.clip(w, -EXTEND_T, EXTEND_T) * fmc[..., None] * 2, fmc]).astype(np.float32), (sw, sh), interpolation=cv2.INTER_LINEAR)
    B = soften(A, EXTEND * ew * k); N = soften(A, EXTEND_IN * ew * k)
    up = lambda a: cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR)
    wA, B, N = up(A[..., 3]), up(B), up(N)
    t = np.clip((N[..., 3] - 0.5) / 0.4, 0, 1); r = (t * t * (3 - 2 * t))[..., None]
    numB, denB = (B[..., :3] - 0.5) * 0.5, B[..., 3]
    wide = np.where(denB[..., None] > 0.5, numB / np.maximum(denB, 1e-6)[..., None], numB * 2)
    near = (N[..., :3] - 0.5) * 0.5 / np.maximum(N[..., 3], 0.05)[..., None]
    x0, y0, x1, y1 = work_rect(p, shape); ys, xs = np.mgrid[0:H, 0:W] + 0.5
    e = np.minimum(np.minimum(xs - x0, x1 - xs), np.minimum(ys - y0, y1 - ys))
    t = np.clip(e / (0.25 * ew), 0, 1); fade = t * t * (3 - 2 * t)
    a = (wA * wA)[..., None]
    return a * w + (1 - a) * (wide + (near - wide) * r) * fade[..., None]

def apply_layer(user, pu, lr, pl, strength=1.0, edge=None, vis=None, seg=None, tint=None):
    """The look's layer on her photo, over her foundation (with the look's shade `tint`, look_tint)."""
    H, W = user.shape[:2]
    ul = lin(user)
    ul = ul * foundation(user, ul, pu, vis, strength, seg, None if tint is None else np.asarray(tint) ** strength) * conceal_gain(user, ul, pu)[..., None]
    w, cover = mesh_warp(lr, symmetric(pl), pu, (H, W), z=pu[:, 2])
    w = skin_fade(extend_layer(w, feather_map(pu, (H, W)) * cover, pu, (H, W)), edge)
    R = regions((H, W), pu[:, :2])
    keep = ball_keep((H, W), pu) * (1 - cv2.GaussianBlur(R['mouth'], (0, 0), 1.5))
    w *= keep[..., None] * strength
    return srgb(ul * np.exp(w))


# --------------------------------------------------------------- eye detail
# A liner's wing (and a smoky eye's edge) runs on past the eye zones drawn around every face (regions' `fine`, the eye
# detail's hull): each look's own is found in its photo, so a long wing isn't cut short (it was taken for a strand of
# hair, or closed over as a thin streak on plain skin, past 0.85-0.95 eye widths from the eye's centre; wings reach 1.25).
WING = (1.3, 0.32, 0.15)   # how far it can reach (eye widths from the eye's centre): outwards, up at its tip, below its line
WING_DARK = -0.8           # the look photo this much darker than the bare face (log luminance: liner-dark), connected to the
                           # eye (lighter, a smoky crease's edge ran on into the catalog model's hair by her temple)
WING_LINER = WING_DARK     # (the eye detail's: the same)
WING_GROW = 0.05           # ...grown by this much (eye widths: its soft edge too), softened by half of it

@lru_cache(None)
def wing_zone(look: str, dark_at: float = WING_DARK):
    """Where `look`'s dark eye makeup runs on past its eyes (0..1, the look photo's coordinates): the photo darker than
    the bare catalog face (by `dark_at`, log) and connected to an eye, within WING of the eye's centre along its outer
    corner."""
    base, pb = _bare(); im = rgb(LOOKS / f'{look}.webp'); p = landmarks3(im)[:, :2]; H, W = im.shape[:2]
    bw, cov = mesh_warp(lin(base), pb, p, (H, W))
    s = lambda x: cv2.GaussianBlur(luma(x), (0, 0), 1.0) + 1e-3
    grade = float(luma(np.exp(grading(look))))       # (the edit's change to the whole photo is not makeup)
    dark = ((np.log(s(lin(im)) / s(bw) / grade) < dark_at) & (cov > 0)).astype(np.uint8)
    ew = eye_width(p); out = np.zeros((H, W), np.float32)
    for ring, inner, outer in ((EYE_R, 133, 33), (EYE_L, 362, 263)):
        e = p[ring]; c = e.mean(0); ax = (p[outer] - p[inner]) / np.linalg.norm(p[outer] - p[inner])
        up = np.array([ax[1], -ax[0]]); up = up if up[1] < 0 else -up
        reach = np.vstack([e, c + ax * WING[0] * ew + up * WING[1] * ew, c + ax * (WING[0] - 0.1) * ew, c + ax * (WING[0] - 0.35) * ew - up * WING[2] * ew])
        zone = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(zone, np.int32(cv2.convexHull(np.float32(reach))), 1)
        eye = np.zeros((H, W), np.uint8); cv2.fillPoly(eye, [np.int32(np.round(e))], 1)
        eye = cv2.dilate(eye, np.ones((int(ew * 0.06) | 1,) * 2))
        n, lab = cv2.connectedComponents(dark & zone)
        ids = np.unique(lab[(eye > 0) & (lab > 0)])
        out = np.maximum(out, np.isin(lab, ids).astype(np.float32) * (lab > 0))
    g = int(ew * WING_GROW) | 1
    return cv2.GaussianBlur(cv2.dilate(out, np.ones((g, g))), (0, 0), ew * WING_GROW / 2)

def detail_map(lum, p, wing=None):
    """Darkening detail (<=0) around the eyes: luminance minus its local blur, eyeballs excluded; with `wing` (wing_zone)
    out along the look's own wing too."""
    H, W = lum.shape; det = np.zeros_like(lum)
    for ring, brow in ((EYE_R, BROW_LOW_R), (EYE_L, BROW_LOW_L)):
        e = p[ring]; c = e.mean(0); w = np.linalg.norm(p[ring[0]] - p[ring[8]])
        base = cv2.GaussianBlur(lum, (0, 0), w * 0.09); d = np.minimum(0, lum - base)
        m = np.zeros((H, W), np.float32)
        hull = cv2.convexHull(np.float32(np.vstack([e, p[brow], [c + [w * 0.85, -w * 0.15], c + [-w * 0.75, 0], c + [0, w * 0.35]]])))
        cv2.fillConvexPoly(m, np.int32(hull), 1)
        ball = np.zeros_like(m); cv2.fillPoly(ball, [np.int32(c + (e - c) * [0.86, 0.55])], 1)
        m = cv2.GaussianBlur(m, (0, 0), w * 0.06)
        if wing is not None: m = np.maximum(m, wing * (np.linalg.norm(np.mgrid[0:H, 0:W][::-1].transpose(1, 2, 0) - c, axis=-1) < w * (WING[0] + 0.2)))
        det += d * m * (1 - cv2.GaussianBlur(ball, (0, 0), w * 0.03))
    return det

# The catalog model's own lid crease is not makeup: carried onto her lid (where her crease isn't), it drew a second line
# above her lashes; so did the tips of the catalog's long lashes, running together into an arc. Both are thin lines
# running along the lid beyond the lash-line band (lashes run across it, the liner lies on the lash line), and are left
# out: one the bare catalog face has too (the model's crease), and any faint one. A line drawn on purpose (a graphic
# liner, the 60s crease line) is dark, and the bare face hasn't it: it stays.
LID_LINE = 0.012               # the lines' scale (eye widths)
LID_BAND = (0.05, 0.09)        # beyond the lash-line band (eye widths past the eye's opening) ...
LID_REACH = (0.35, 0.45)       # ... up to (not the brows)
LID_ALONG = (0.7, 0.9)         # running along the lid: |cos| of the line's normal with the lid's
LID_BARE = (0.12, 0.03, 2.5)   # the bare face's line: darkness for all of it, its spread (eye widths) and gain
LID_FAINT = (0.4, 0.65)        # a line lighter than this (relative darkness, softened 0.01 eye widths) is faint

def _smooth(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t)

def lid_lines(lum, p, ew):
    """Per pixel, how much the eye detail there is a thin line running along the lid beyond the lash-line band."""
    H, W = lum.shape
    g = cv2.GaussianBlur(lum, (0, 0), max(0.8, LID_LINE * ew))
    gxx = cv2.Sobel(g, cv2.CV_32F, 2, 0, ksize=3) / 4; gyy = cv2.Sobel(g, cv2.CV_32F, 0, 2, ksize=3) / 4; gxy = cv2.Sobel(g, cv2.CV_32F, 1, 1, ksize=3) / 4
    valley = 0.5 * (gxx + gyy) + np.sqrt(0.25 * (gxx - gyy) ** 2 + gxy ** 2) > 0
    ang = 0.5 * np.arctan2(2 * gxy, gxx - gyy); vx, vy = np.cos(ang), np.sin(ang)    # across the line
    out = np.zeros((H, W), np.float32)
    for ring in (EYE_R, EYE_L):
        m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.int32(np.round(p[ring]))], 1)
        dist = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5).astype(np.float32)
        nx = cv2.Sobel(dist, cv2.CV_32F, 1, 0, ksize=5); ny = cv2.Sobel(dist, cv2.CV_32F, 0, 1, ksize=5); nn = np.maximum(np.hypot(nx, ny), 1e-6)
        along = _smooth(*LID_ALONG, np.abs(vx * nx / nn + vy * ny / nn))
        d = dist / ew
        out = np.maximum(out, (along * _smooth(*LID_BAND, d) * (1 - _smooth(*LID_REACH, d)) * valley).astype(np.float32))
    return out

def eye_detail(ref, p, wing=None):
    """A catalog photo's eye detail (<= 0, relative), and how much of it is a lid line."""
    lum = cv2.cvtColor(ref, cv2.COLOR_RGB2GRAY).astype(np.float32)
    rel = detail_map(lum, p, wing) / np.maximum(cv2.GaussianBlur(lum, (0, 0), eye_width(p) * 0.05), 20)
    return rel, lid_lines(lum, p, eye_width(p))

@lru_cache(None)
def _bare_creases():
    b, pb = _bare(); pb = pb[:, :2]
    rel, lines = eye_detail(b, pb)
    return lines * np.clip(-rel / LID_BARE[0], 0, 1), pb

def make_eye_map(look: str, out_dir: Path):
    ref = rgb(LOOKS / f'{look}.webp'); p = landmarks3(ref)[:, :2]
    rel, lines = eye_detail(ref, p, wing_zone(look, WING_LINER))
    crease, pb = _bare_creases(); ew = eye_width(p)
    own = mesh_warp(np.dstack([crease] * 3), pb, p, rel.shape)[0][..., 0]
    own = np.clip(cv2.GaussianBlur(own, (0, 0), LID_BARE[1] * ew) * LID_BARE[2], 0, 1)
    faint = 1 - _smooth(*LID_FAINT, cv2.GaussianBlur(-rel, (0, 0), 0.01 * ew))
    rel = rel * (1 - lines * np.maximum(own, faint))     # the model's crease and the lashes' tips left out
    q = np.clip(np.round(-rel * 255), 0, 255).astype(np.uint8)
    ys, xs = np.nonzero(q >= 2)
    x0, y0 = max(0, xs.min() - 2), max(0, ys.min() - 2); x1, y1 = min(q.shape[1], xs.max() + 3), min(q.shape[0], ys.max() + 3)
    q = q[y0:y1, x0:x1]; q[q < 2] = 0
    pc = p[:468] - [x0, y0]; keep = []
    for t in mesh_triangles():
        m = np.zeros(q.shape, np.uint8); cv2.fillConvexPoly(m, np.int32(np.round(pc[t])), 1)
        if (q[m > 0] > 0).any(): keep.append(t)
    ids = sorted({int(i) for t in keep for i in t}); pos = {i: k for k, i in enumerate(ids)}
    cv2.imwrite(str(out_dir / f'{look}.png'), q, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return {'w': int(q.shape[1]), 'h': int(q.shape[0]), 'ids': ids,
            'pts': [round(float(v), 1) for i in ids for v in pc[i]], 'tris': [pos[int(i)] for t in keep for i in t]}

@lru_cache(None)
def _eye_files():
    meta = json.load(open(TRYON / 'eyes.json')); return meta

def eye_triangles(m, far):
    """The eye map's triangles as (her landmark ids, map points): on a turned catalog face the far eye's
    triangles are replaced by the mirror image of the near eye's."""
    pts = np.array(m['pts'], np.float32).reshape(-1, 2); ids = np.array(m['ids']); tris = np.array(m['tris']).reshape(-1, 3)
    dst, src = [], []
    for t in tris:
        h = HALF[ids[t]]
        if far and (h == far).any(): continue
        dst.append(ids[t]); src.append(pts[t])
        if far and (h == -far).all(): dst.append(MIRROR[ids[t]]); src.append(pts[t])
    return np.array(dst), np.array(src)

EYE_DEPTH_TOL = 0.04      # eye detail behind a nearer part of her face (the nose of a turned head) is hidden;
                          # tolerance in the engine's depth units (1.8 = the face's whole depth range)
OPEN_LO, OPEN_HI = 0.12, 0.22   # lid opening (3D, over the eye's width): a closing eye's lashes fade, its liner stays
SHOWN_LO, SHOWN_HI = 0.35, 0.6  # an eye seen from the side (its width in the photo over the other eye's): its detail fades out

def zbuffer(p, shape, attr=None):
    """The front-most face-mesh surface at each pixel centre: its depth (inf where there is no mesh) and,
    optionally, a per-point attribute interpolated there (as the graphics chip's depth test does)."""
    H, W = shape; q = np.asarray(p, np.float64); z = q[:, 2]
    zb = np.full(shape, np.inf, np.float32); ab = np.zeros(shape, np.float32) if attr is not None else None
    for t in mesh_triangles():
        a, b, c = q[t, :2]
        x0, x1 = max(0, int(np.floor(min(a[0], b[0], c[0]) - 0.5))), min(W - 1, int(np.ceil(max(a[0], b[0], c[0]))))
        y0, y1 = max(0, int(np.floor(min(a[1], b[1], c[1]) - 0.5))), min(H - 1, int(np.ceil(max(a[1], b[1], c[1]))))
        if x1 < x0 or y1 < y0: continue
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-9: continue
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1] + 0.5
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
        l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
        l3 = 1 - l1 - l2
        inside = (l1 >= 0) & (l2 >= 0) & (l3 >= 0)
        zi = l1 * z[t[0]] + l2 * z[t[1]] + l3 * z[t[2]]
        sub = zb[y0:y1 + 1, x0:x1 + 1]; upd = inside & (zi < sub)
        sub[upd] = zi[upd]
        if attr is not None: ab[y0:y1 + 1, x0:x1 + 1][upd] = (l1 * attr[t[0]] + l2 * attr[t[1]] + l3 * attr[t[2]])[upd]
    return zb, ab

def side_map(p, shape):
    """Which half of her face is in front at each pixel (-1: the half of point 33, +1: the other, 0: midline / no face)."""
    return zbuffer(p, shape, np.r_[HALF, np.zeros(len(p) - len(HALF))].astype(np.float32))[1]

def openness(p):
    """How open each eye is (image-left eye of a straight-on photo, the other): lid gap over eye width, in 3D."""
    p = np.asarray(p, np.float64)
    f = lambda ups, lows, a, b: np.mean([np.linalg.norm(p[u] - p[l]) for u, l in zip(ups, lows)]) / np.linalg.norm(p[a] - p[b])
    return f([160, 159, 158], [144, 145, 153], 33, 133), f([387, 386, 385], [373, 374, 380], 263, 362)

def lash_keep(p):
    """How much of the look's lashes each eye keeps: all when open, none when closed (they'd lie on the lid)."""
    t = lambda x: float(np.clip((x - OPEN_LO) / (OPEN_HI - OPEN_LO), 0, 1))
    return tuple(v * v * (3 - 2 * v) for v in map(t, openness(p)))

def eye_shown(p):
    """How much of each eye's detail is drawn (image-left eye of a straight-on photo, the other): all of it, except for
    the far eye of a head turned towards profile, whose points the face model can't place (they slide onto the
    bridge of her nose); a three-quarter view keeps both."""
    q = np.asarray(p, np.float64)[:, :2]
    wr, wl = np.linalg.norm(q[33] - q[133]), np.linalg.norm(q[263] - q[362])
    t = lambda w: float(np.clip((w / max(wr, wl, 1e-6) - SHOWN_LO) / (SHOWN_HI - SHOWN_LO), 0, 1))
    return tuple(v * v * (3 - 2 * v) for v in (t(wr), t(wl)))

def lash_scale(p, shape, band=None, side=None):
    """The eye detail's scale at each pixel: 1, except outside the lash-line band of a closing eye."""
    k = lash_keep(p)
    if min(k) >= 0.999: return 1.0
    if band is None:
        from products import step_zones
        band = step_zones(shape, p, 'apples')[1][..., 1]
    if side is None: side = side_map(p, shape)
    return band + (1 - band) * np.where(side < 0, k[0], k[1])

def warp_eyes(look, pu, shape, z=None):
    m = _eye_files()[look]
    q = cv2.imread(str(TRYON / f'eyes/{look}.png'), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    dst, src = eye_triangles(m, far_half(_bare()[1]))
    order = np.argsort(-z[dst].mean(1)) if z is not None else np.arange(len(dst))
    shown = eye_shown(pu)   # each eye's triangles as much as that eye is seen (the far eye of a face in profile: none)
    out = np.zeros(shape, np.float32)
    if z is not None:    # the face in front (her nose hides the far eye of a turned head)
        front = zbuffer(np.c_[np.asarray(pu)[:, :2], z], shape)[0]
        tol = EYE_DEPTH_TOL / 1.8 * float(z[:468].max() - z[:468].min())
    for k in order:
        s = src[k]; d = pu[dst[k]].astype(np.float32)
        x, y, w, h = cv2.boundingRect(d)
        M = cv2.getAffineTransform(s, d - np.float32([x, y]))
        patch = cv2.warpAffine(q, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        patch = patch * np.float32(shown[0] if HALF[dst[k]].sum() < 0 else shown[1])
        mk = np.zeros((h, w), np.uint8); cv2.fillConvexPoly(mk, np.int32(np.round(d - [x, y])), 1)
        y0, x0 = max(0, y), max(0, x); y2, x2 = min(shape[0], y + h), min(shape[1], x + w)
        if y2 <= y0 or x2 <= x0: continue
        sub = out[y0:y2, x0:x2]; mm = mk[y0 - y:y2 - y, x0 - x:x2 - x] > 0
        if z is not None:
            a, b, c = d.astype(np.float64); zt = z[dst[k]]
            det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(det) > 1e-9:
                ys, xs = np.mgrid[y0:y2, x0:x2] + 0.5
                l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
                l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
                mm &= l1 * zt[0] + l2 * zt[1] + (1 - l1 - l2) * zt[2] <= front[y0:y2, x0:x2] + tol
        sub[mm] = patch[y0 - y:y2 - y, x0 - x:x2 - x][mm] if z is not None else np.maximum(sub[mm], patch[y0 - y:y2 - y, x0 - x:x2 - x][mm])
    return -out

def apply_eyes(base, user, pu, look, strength=0.9):
    z = pu[:, 2]; p2 = pu[:, :2]
    # as sharp as her photo, off her eyeballs, a closing eye's lashes faded
    ru = soften(warp_eyes(look, p2, user.shape[:2], z), detail_sigma(photo_blur(user, pu)))
    ru = ru * lash_scale(pu, user.shape[:2]) * ball_keep(user.shape[:2], pu); ew = eye_width(p2)
    lu = cv2.cvtColor(user, cv2.COLOR_RGB2GRAY).astype(np.float32)
    own = np.minimum(0, lu - cv2.GaussianBlur(lu, (0, 0), ew * 0.028)) / np.maximum(cv2.GaussianBlur(lu, (0, 0), ew * 0.042), 20)
    f = np.clip(1 + strength * np.minimum(0, ru - own * 0.6), 0.15, 1)[..., None]
    return np.clip(base.astype(np.float32) * f, 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- lipstick
STYLES = REPO / 'src/data/makeup-styles.ts'
# finish: (opacity, how much of her fine lip texture is kept, gloss shine)
FINISH = {'matte': (0.95, 0.75, 0.0), 'satin': (0.92, 0.9, 0.15), 'lined': (0.92, 0.85, 0.05),
          'gloss': (0.7, 1.0, 1.0), 'ombre': (0.9, 0.9, 0.2), 'metallic': (0.92, 0.85, 0.0), 'glitter': (0.9, 0.9, 0.1)}
MATTE_SHINE = 0.3     # how much of her lips' own highlights shows through a matte lipstick
FAIREST = 1.15        # fairest skin, relative to the catalog model's (who is fair)
LIGHT_CAST = 1.08     # at most this much more (or less) of one colour in her light than the mean (her eye whites' own tint)
NUDE_DEEP = (0.25, 0.45)   # a nude shade's brightness over the skin's (in the catalog) below which it is a pigment (a
                           # deep brown, a plum): it no longer follows her skin's depth, by NUDE_DEEP[1] it fully does
# intensity: (catalog layer, lipstick opacity, eye detail)
LEVELS = {'soft': (0.6, 0.55, 0.5), 'natural': (1.0, 1.0, 0.9), 'bold': (1.35, 1.12, 1.0)}
luma = lambda f: f @ np.float32([0.2126, 0.7152, 0.0722])

@lru_cache(None)
def styles():
    import re
    out = {}
    for m in re.finditer(r'style\("([a-z0-9-]+)",.*?\{([^}]*)\}', STYLES.read_text(), re.S):
        g = lambda k: (re.search(k + r': "([^"]+)"', m.group(2)) or [None, None])[1]
        out[m.group(1)] = dict(lip=g('lip'), lipColor=g('lipColor'))
    return out

def nude_weight(hex_colour):
    """1 for nude / brown / soft-pink shades (they follow her skin depth), 0 for bold colours (kept exact)."""
    c = np.array([int(hex_colour[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    return float(np.clip((0.66 - (c.max() - c.min()) / max(c.max(), 1)) / 0.24, 0, 1))

def lip_hard(shape, p):
    return poly_mask(shape, p[:, :2], [LIPS_OUT]) * (1 - poly_mask(shape, p[:, :2], [LIPS_IN]))

def sclera(img_lin, p):
    """Colour of the whites of the eyes (bright part of the eyeballs, not the irises), linear RGB: the light reference.
    As measureFace() in makeup-gl.ts."""
    m = (poly_mask(img_lin.shape[:2], p[:, :2], [EYE_R, EYE_L], scale=[0.85, 0.5]) > 0.5).astype(np.uint8)
    if len(p) >= 478:   # not her irises: light blue or grey eyes and their catchlights read as a cold light
        for c in (468, 473):
            r = np.mean([np.linalg.norm(p[c + k, :2] - p[c, :2]) for k in (1, 2, 3, 4)])
            cv2.circle(m, (int(round(p[c, 0])), int(round(p[c, 1]))), int(round(r * 1.2)), 0, -1)
    px = img_lin[m > 0]
    if len(px) < 30: return None
    l = luma(px); return np.median(px[l >= np.quantile(l, 0.7)], 0)

def skin_lum(img_lin, p):
    sk = regions(img_lin.shape[:2], p[:, :2])['skin'] > 0.5
    return float(np.median(luma(img_lin[sk]))) if sk.sum() > 50 else None

def lip_ref(img_lin, p):
    """Typical brightness of her lips (between their creases and highlights)."""
    l = luma(img_lin[lip_hard(img_lin.shape[:2], p) > 0.5])
    if len(l) < 20: return None
    return float(l[(l > np.quantile(l, 0.15)) & (l < np.quantile(l, 0.8))].mean())

def lip_colour(img_lin, p):
    """The lips' typical colour in a photo (linear RGB): the median between their creases and highlights."""
    m = cv2.erode((lip_hard(img_lin.shape[:2], p) > 0.5).astype(np.uint8), np.ones((5, 5))) > 0
    px = img_lin[m]; l = luma(px)
    return np.median(px[(l > np.quantile(l, 0.15)) & (l < np.quantile(l, 0.8))], 0)

PIGMENT_MIN = 0.3   # a lipstick's colour is at least this share of the colour seen (else it takes more opacity)
LIP_CHANGE = (0.03, 0.15)   # a lipstick that changes the model's lips less than this (log, in their most changed colour)
                            # changes hers the same way (her lips times the change); from LIP_CHANGE[1] on, its own colour

@lru_cache(None)
def look_lips(look):
    """The look's lipstick: its colour on the lips (linear RGB) and opacity, the look photo's eye-white colour and skin
    brightness (her light references), and the centre-over-edge colour change (for gradient lips).
    The lips seen in the look photo are the lipstick over the model's own lips at the finish's opacity (a gloss is
    sheer): the lipstick's own colour is what, at that opacity over the bare photo's lips, gives the colour seen. So on
    her lips the look's change shows as in the catalog, her own lips through it as much as the model's were. A colour
    that can't be made that way (a deep shade over lighter lips) takes more opacity, at most 0.97. A lipstick that hardly
    changes the model's lips (a nude like her own lips, a clear gloss) changes hers the same way instead (`ratio`, by
    `pigment` 0, LIP_CHANGE): her lips with the same small change and the finish's shine, not the model's lip colour."""
    im = rgb(LOOKS / f'{look}.webp'); p = landmarks3(im); li = lin(im); ew = eye_width(p[:, :2])
    m = cv2.erode((lip_hard(im.shape[:2], p) > 0.5).astype(np.uint8), np.ones((5, 5))) > 0
    seen = lip_colour(li, p)
    d = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5)
    inner, outer = m & (d > ew * 0.07), m & (d < ew * 0.03)
    ombre = np.median(li[inner], 0) / np.maximum(np.median(li[outer], 0), 1e-4) if inner.sum() > 20 and outer.sum() > 20 else np.ones(3)
    s = styles()[look]; alpha, gamma, shine = FINISH.get(s['lip'], FINISH['satin'])
    # The light references are the bare photo's (in this photo's grading): the look photo's own eye whites read darker
    # under its lashes, liner and shadow, and its skin carries the look's complexion.
    base, pb = _bare(); bl = lin(base); g = np.exp(grading(look))
    own = lip_colour(bl, pb) * g
    ratio = np.clip(seen / np.maximum(own, 1e-4), 0.3, 3).astype(np.float32)
    t = float(np.clip((np.abs(np.log(ratio)).max() - LIP_CHANGE[0]) / (LIP_CHANGE[1] - LIP_CHANGE[0]), 0, 1))
    need = np.where(own > seen, (own - seen) / np.maximum(own - PIGMENT_MIN * seen, 1e-4), 0).max()
    alpha = float(np.clip(max(alpha, need), alpha, 0.97))
    colour = np.maximum((seen - (1 - alpha) * own) / alpha, PIGMENT_MIN * seen).astype(np.float32)
    return dict(colour=colour, sclera=sclera(bl, pb) * g, skin=skin_lum(bl, pb) * float(luma(g)), ombre=np.clip(ombre, 0.4, 2.5),
                finish=s['lip'], alpha=round(alpha, 3), gamma=gamma, shine=shine, nude=nude_weight(s['lipColor']),
                ratio=ratio, pigment=round(t * t * (3 - 2 * t), 3))

def nude_deep(colour, skin):
    """How much a nude shade follows her skin's depth by how deep it is (NUDE_DEEP): 0 for a deep brown or plum."""
    t = float(np.clip((luma(np.asarray(colour, np.float32)) / max(skin, 1e-4) - NUDE_DEEP[0]) / (NUDE_DEEP[1] - NUDE_DEEP[0]), 0, 1))
    return t * t * (3 - 2 * t)

def lip_target(L, u_sclera, u_skin):
    """The lipstick colour for her photo: the look's lipstick in her light (her eye whites over the catalog's); nude
    shades also follow her skin's own depth (her skin over the catalog model's, her light taken out: a nude chosen for
    the model becomes the same nude for her), deep ones (nude_deep) not: those are pigments. As lipTarget()."""
    colour = np.array(L['colour'], np.float32)
    light = np.ones(3, np.float32); g = 1.0
    if u_sclera is not None and L['sclera'] is not None:
        e = np.asarray(u_sclera) / np.maximum(L['sclera'], 1e-4)
        mean = float(e.mean())
        # Small, soft or shaded eyes read too dark; her light can't be dimmer than her skin's brightness allows
        # (nobody's skin is much fairer than the catalog model's).
        floor = u_skin / L['skin'] / FAIREST if u_skin and L['skin'] else 0.0
        g = float(np.clip(max(mean, floor), 0.3, 2.0)) ** 0.85
        # (her eye whites are a rough white: their own tint and reflections mustn't turn every product cold or warm)
        light = g * np.clip(e / mean, 1 / LIGHT_CAST, LIGHT_CAST) ** 0.8
    if u_skin and L['skin']:
        depth = float(np.clip(u_skin / L['skin'] / g, 0.15, 2.5)) ** 0.6
        w = L['nude'] * nude_deep(colour, L['skin'])
        colour = colour * (1 - w + w * depth)
    return (colour * light).astype(np.float32), float(light.mean())

# ------------------------------------------------- her own lipstick (picker)
@lru_cache(None)
def swatch_calibration():
    """How a swatch colour looks as lipstick in the catalog photos' light, from the 42 looks (their designed
    lipColor vs the lipstick measured in the photo): colour = k * lin(hex) * eye-white. Also the catalog
    eye-white and skin brightness (one model, one light), used as a custom shade's references."""
    st = styles(); ks, sc, sk = [], [], []
    for look in catalog_looks():
        L = look_lips(look)
        if L['sclera'] is None: continue
        hx = st[look]['lipColor']; c = lin(np.array([[[int(hx[i:i + 2], 16) for i in (1, 3, 5)]]], np.uint8))[0, 0]
        ks.append(L['colour'] / np.maximum(c * L['sclera'], 1e-5)); sc.append(L['sclera']); sk.append(L['skin'])
    return float(np.median(np.array(ks))), np.median(np.array(sc), 0).astype(np.float32), float(np.median(sk))

def lip_choice(look, shade=None, finish=None):
    """The look's own lipstick, or a shade (hex) and/or finish picked on top of it."""
    L = dict(look_lips(look))
    if shade:
        k, sc, sk = swatch_calibration()
        c = lin(np.array([[[int(shade[i:i + 2], 16) for i in (1, 3, 5)]]], np.uint8))[0, 0]
        L.update(colour=(k * c * sc).astype(np.float32), sclera=sc, skin=sk, ombre=np.ones(3, np.float32),
                 nude=nude_weight(shade), finish=finish or 'satin', ratio=np.ones(3, np.float32), pigment=1.0)
    if finish: L['finish'] = finish
    if shade or finish:
        L['alpha'], L['gamma'], L['shine'] = FINISH[L['finish']]
    return L

def _hash(x, y):
    """32-bit integer hash of a glitter cell (the same in makeup-gl.ts)."""
    with np.errstate(over='ignore'):
        h = (x.astype(np.uint32) * np.uint32(73856093)) ^ (y.astype(np.uint32) * np.uint32(19349663))
        h ^= h >> np.uint32(16); h *= np.uint32(0x7feb352d); h ^= h >> np.uint32(15); h *= np.uint32(0x846ca68b); h ^= h >> np.uint32(16)
    return h

GLITTER_CELL = 0.02       # glitter grain spacing, in eye widths
GLITTER_DENSITY = 0.3     # share of cells with a grain
PEARL = 0.55              # metallic finishes: a finer, denser pearl (cell size relative to glitter)

def glitter(canon, cell_px, ew_bare, scale=1.0, density=None):
    """Glitter grains (0..~1 per pixel) at her lips: grains live on the bare catalog face's coordinates
    (`canon`, warped along the mesh), so they stay on her lips as she moves. `density`: share of cells with a grain."""
    c = canon / (ew_bare * GLITTER_CELL * scale)
    if density is None: density = GLITTER_DENSITY if scale == 1.0 else 0.6
    base = np.floor(c); out = np.zeros(c.shape[:2], np.float32)
    r = max(0.28, 0.6 / max(cell_px, 1e-3))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx, cy = base[..., 0] + dx, base[..., 1] + dy
            h = _hash(cx, cy); h2 = _hash(h, h ^ np.uint32(0x9e3779b9))
            on = (h & np.uint32(0xffff)).astype(np.float32) / 65536 < density
            px = cx + 0.25 + 0.5 * (h >> np.uint32(16)).astype(np.float32) / 65536
            py = cy + 0.25 + 0.5 * (h2 & np.uint32(0xffff)).astype(np.float32) / 65536
            b = 0.12 + 0.88 * ((h2 >> np.uint32(16)).astype(np.float32) / 65536) ** 4   # most grains dim, a few glints
            d2 = (c[..., 0] - px) ** 2 + (c[..., 1] - py) ** 2
            out += on * b * np.exp(-d2 / (r * r))
    return out

@lru_cache(None)
def _bare_points():
    b, pb = _bare(); return pb, float(eye_width(pb[:, :2])), b.shape[:2]

def canon_coords(p, shape):
    """Per pixel of her photo: the matching point of the bare catalog face (pixels), along the mesh."""
    pb, _, (bh, bw) = _bare_points()
    ys, xs = np.mgrid[0:bh, 0:bw].astype(np.float32)
    w, cover = mesh_warp(np.dstack([xs, ys]), pb, p, shape, z=p[:, 2])
    return w, cover

LIP_VOLUME = 0.6   # how much of her lips' own light and shade (upper lip darker, lower lip lit) the lipstick keeps
LIP_GRID = 192     # the lip refinement's grid, over a square crop around her lips
LIP_CROP = 1.6     # the crop: this many times the lips' larger side
LIP_BAND = 0.14    # her lips' colour decides within this far outside the detected lip outline (eye widths)
LIP_BAND_IN = 0.015  # ... and this far inside it (the lighter border of her lips looks like skin to the colours)
LIP_LUMA = 0.4     # her lips' brightness counts this much against their colour (the light rim of her upper lip is lip)
LIP_SIGMA = 0.025  # guided filter window (eye widths)
LIP_EPS = 1e-3     # guided filter regularisation

def lip_box(p):
    L = np.asarray(p)[LIPS_OUT, :2]; (x0, y0), (x1, y1) = L.min(0), L.max(0)
    side = max(x1 - x0, y1 - y0) * LIP_CROP; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return float(cx - side / 2), float(cy - side / 2), float(side)

def poly_sdist(poly, pts):
    """Signed distance from points (N, 2) to a closed polygon (K, 2): positive inside."""
    a = np.asarray(poly, np.float64); b = np.roll(a, -1, 0); ab = b - a
    t = np.clip(((pts[:, None] - a[None]) * ab[None]).sum(-1) / np.maximum((ab * ab).sum(-1), 1e-12)[None], 0, 1)
    d = np.linalg.norm(pts[:, None] - (a[None] + ab[None] * t[..., None]), axis=-1).min(1)
    x, y = pts[:, :1], pts[:, 1:2]
    ay, by, ax, bx = a[None, :, 1], b[None, :, 1], a[None, :, 0], b[None, :, 0]
    dy = np.where(by == ay, 1e-12, by - ay)
    cross = ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / dy + ax)
    return np.where(cross.sum(1) % 2 == 1, d, -d)

def lip_prob(img, p):
    """The lip refinement's input on its grid (0..1, in bytes as on the phone): the detected lip shape, and within
    LIP_BAND of its outline a colour model of her lips against the skin around them (lipProb in tryon.ts).
    None when there are too few pixels to fit it."""
    import occlusion as O
    box = lip_box(p); n = LIP_GRID; k = n / box[2]
    g = O.to_grid(img, box, n).astype(np.float64)
    ew = eye_width(np.asarray(p)[:, :2]) * k
    ys, xs = np.mgrid[0:n, 0:n] + 0.5
    pts = np.c_[xs.ravel(), ys.ravel()]
    q = (np.asarray(p, np.float64)[:, :2] - box[:2]) * k
    so = poly_sdist(q[LIPS_OUT], pts).reshape(n, n); si = poly_sdist(q[LIPS_IN], pts).reshape(n, n)
    f = np.dstack([LIP_LUMA * (g @ [0.299, 0.587, 0.114]), g[..., 0] - g[..., 1], g[..., 1] - g[..., 2]])
    core = (so > 0.06 * ew) & (si < -0.03 * ew); ring = (so < -0.05 * ew) & (so > -0.14 * ew)
    if core.sum() < 20 or ring.sum() < 20: return None, box
    def ll(sel):
        v = f[sel]; mu = v.mean(0); C = np.cov(v.T, bias=True) + np.eye(3) * 9; d = f - mu
        return -0.5 * np.einsum('...i,ij,...j->...', d, np.linalg.inv(C), d) - 0.5 * np.log(np.linalg.det(C))
    post = 1 / (1 + np.exp(-np.clip(ll(core) - ll(ring), -8, 8)))
    w = np.clip(1 - np.abs(so) / (np.where(so > 0, LIP_BAND_IN, LIP_BAND) * ew), 0, 1)
    pr = (so > 0) * (1 - w) + post * w
    pr[si > 0] = 0
    return (np.round(pr * 255) / 255).astype(np.float32), box

def lip_mask(img, p, pr=None, box=None):
    """Where the lipstick goes on her photo (0..1): the lip probability refined with a colour-guided filter (as in
    occlusion.py), so its edge is her own lip line, as sharp as her photo. None when no colour model could be fitted."""
    import occlusion as O
    if pr is None: pr, box = lip_prob(img, p)
    if pr is None: return None
    n = LIP_GRID; k = n / box[2]
    I = O.to_grid(img, box, n).astype(np.float32) / 255 - 0.5
    a, b = O.fit(I, pr, LIP_SIGMA * eye_width(np.asarray(p)[:, :2]) * k, LIP_EPS)
    H, W = img.shape[:2]
    M = np.float32([[k, 0, (0.5 - box[0]) * k - 0.5], [0, k, (0.5 - box[1]) * k - 0.5]])
    AB = cv2.warpAffine(np.dstack([a, b]), M, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    return np.clip((AB[..., :3] * (img.astype(np.float32) / 255 - 0.5)).sum(-1) + AB[..., 3], 0, 1)

def apply_lips(base_lin, user_lin, p, look, k_lip, L=None):
    """Lipstick over `base_lin` (her photo with the catalog layer, linear). Mirrors makeup-gl.ts."""
    H, W = user_lin.shape[:2]; ew = eye_width(p[:, :2]); L = L or look_lips(look)
    target, light = lip_target(L, sclera(user_lin, p), skin_lum(user_lin, p))
    hard = lip_hard((H, W), p)
    g = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)
    f = lip_mask(srgb(user_lin), p)                  # her own lip line
    if f is None: f = g(hard, max(0.8, ew * 0.012))
    base = base_lin      # (the layer has no lip colour: filled from the skin around, feather_weights)
    Y = luma(user_lin); ref = lip_ref(user_lin, p) or float(np.median(Y))
    broad = g(Y * hard, ew * 0.06) / np.maximum(g(hard, ew * 0.06), 1e-3)
    fine = Y / np.maximum(broad, 1e-4)
    fs = np.clip(fine, 0, 2.5)
    if L['finish'] == 'matte': fs = np.where(fs > 1, 1 + (fs - 1) * MATTE_SHINE, fs)   # matte covers her lips' own shine
    S = fs ** L["gamma"] * np.clip(broad / max(ref, 1e-4), 0.2, 3) ** LIP_VOLUME
    # its colour, or (a lipstick that hardly changes the lips: look_lips) her own lips with its change
    k = float(L.get('pigment', 1.0)); own = base * np.asarray(L.get('ratio', np.ones(3)), np.float32) ** (1 / max(L['alpha'], 0.05))
    cover = own * (1 - k) + target[None, None] * S[..., None] * k
    local = Y / np.maximum(g(Y * hard, ew * 0.02) / np.maximum(g(hard, ew * 0.02), 1e-3), 1e-4)
    if L['shine']:
        spec = np.clip(local - 1.04, 0, 0.5)
        cover = cover + (L['shine'] * spec * (float(np.mean(L['colour'])) + 0.25) * light)[..., None]
    col = np.asarray(target, np.float32); tint = col / max(float(col.max()), 1e-4)
    if L['finish'] == 'metallic':   # a soft sheen where her lips catch the light, her highlights, and a fine pearl
        ysm = g(Y * hard, ew * 0.012) / np.maximum(g(hard, ew * 0.012), 1e-3)
        hl = np.clip(ysm / np.maximum(g(Y * hard, ew * 0.02) / np.maximum(g(hard, ew * 0.02), 1e-3), 1e-4) - 1.0, 0, 0.6)
        sheen = np.clip((broad / max(ref, 1e-4) - 0.95) / 0.5, 0, 1) ** 1.5
        canon, cov = canon_coords(p, (H, W)); _, ew_b, _ = _bare_points()
        pearl = glitter(canon, ew * GLITTER_CELL * PEARL, ew_b, PEARL) * cov
        shine_ = (0.22 * sheen + 1.1 * hl + 0.35 * pearl * (0.5 + sheen)) * (float(np.mean(L['colour'])) + 0.3) * light
        cover = cover * 0.85 + shine_[..., None] * (0.35 + 0.65 * tint)
    if L['finish'] == 'glitter':    # grains that catch the light where her lips are lit
        canon, cov = canon_coords(p, (H, W)); _, ew_b, _ = _bare_points()
        spark = glitter(canon, ew * GLITTER_CELL, ew_b) * cov
        glint = 0.4 + 1.6 * np.clip(broad / max(ref, 1e-4) - 0.75, 0, 1) + 1.0 * np.clip(local - 1.0, 0, 0.5)
        cover = cover + ((spark * glint) * 1.8 * light)[..., None] * (0.6 + 0.4 * tint)
    a = np.full((H, W), L['alpha'], np.float32)
    if L['finish'] == 'ombre':      # towards the lips' middle (their outline softened over 0.05 eye widths, as M.a)
        t = np.clip((g(hard, ew * 0.05) - 0.5) * 2.2, 0, 1)
        cover = cover * np.asarray(L['ombre'], np.float32)[None, None] ** (t[..., None] - 0.5)
        a = 0.55 + 0.35 * t
    A = np.clip(a * k_lip, 0, 0.97) * f
    out = base * (1 - A[..., None]) + cover * A[..., None]
    if L['finish'] == 'lined':   # a slightly deeper lip liner along the edge
        e = 4 * f * (1 - f) * f * 0.45 * min(k_lip, 1)
        out = out * (1 - e[..., None]) + cover * 0.62 * e[..., None]
    return out


def paint(look, face, p, level='natural', shade=None, finish=None, edge=None, vis=None, seg=None):
    """Teacher output: the look painted on `face` (RGB uint8) with MediaPipe points p; optionally with
    her own lipstick shade (hex) and/or finish instead of the look's."""
    k_layer, k_lip, k_eye = LEVELS[level]
    base = lin(apply_layer(face, p, *make_layer(look), strength=k_layer, edge=edge, vis=vis, seg=seg, tint=look_tint(look)))
    L = lip_choice(look, shade, finish) if (shade or finish) else None
    return apply_eyes(srgb(apply_lips(base, lin(face), p, look, k_lip, L)), face, p, look, strength=k_eye)

def catalog_looks():
    return sorted(f.stem for f in LOOKS.glob('*.webp'))


# ------------------------------------------------------------------ export
def lipstick_data():
    """For the lipstick picker: the swatch calibration, and the bare catalog face's points (glitter and pearl
    grains live on them) with its eye width."""
    k, sc, sk = swatch_calibration(); pb, ew_b, _ = _bare_points()
    return {'swatch': {'k': round(k, 4), 'sclera': [round(float(v), 5) for v in sc], 'skin': round(sk, 5)},
            'canon': {'ew': round(ew_b, 2), 'pts': [round(float(v), 1) for v in pb[:468, :2].ravel()]}}

def encode_layer(lr):
    """Log-ratio -> 8-bit, finest near 0 (subtle blush) : q = 0.5 + 0.5 tanh(lr / 1.2). makeup-gl.ts decodes."""
    return np.clip(np.round((0.5 + 0.5 * np.tanh(lr / 1.2)) * 255), 0, 255).astype(np.uint8)

def export_layer(look, out_dir: Path):
    lr, pl = make_layer(look)
    H, W = lr.shape[:2]
    on = np.abs(lr).max(-1) > 2e-3
    if not on.any():   # the bare look itself: no layer, only lip gloss
        on[int(pl[:, 1].min()):int(pl[:, 1].max()), int(pl[:, 0].min()):int(pl[:, 0].max())] = True
    ys, xs = np.nonzero(on)
    m = 4
    x0, y0 = max(0, xs.min() - m), max(0, ys.min() - m); x1, y1 = min(W, xs.max() + m + 1), min(H, ys.max() + m + 1)
    crop = encode_layer(lr[y0:y1, x0:x1])
    cv2.imwrite(str(out_dir / f'{look}.webp'), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 101])
    w, h = x1 - x0, y1 - y0
    uv = ((pl[:, :2] - [x0, y0] + 0.5) / [w, h]).astype(np.float32)   # pixel centres -> texture coordinates
    L = look_lips(look)
    r = lambda v, n=5: None if v is None else ([round(float(x), n) for x in v] if np.ndim(v) else round(float(v), n))
    return {'uv': [round(float(v), 5) for v in uv.ravel()], 'tint': r(look_tint(look), 4),
            'lip': {'colour': r(L['colour']), 'sclera': r(L['sclera']), 'skin': r(L['skin']), 'ombre': r(L['ombre'], 4),
                    'finish': L['finish'], 'alpha': L['alpha'], 'gamma': L['gamma'], 'shine': L['shine'], 'nude': round(L['nude'], 3),
                    'ratio': r(L['ratio'], 4), 'pigment': L['pigment']}}


if __name__ == '__main__':
    if sys.argv[1:] == ['eyes']:
        (TRYON / 'eyes').mkdir(parents=True, exist_ok=True)
        data = {look: make_eye_map(look, TRYON / 'eyes') for look in catalog_looks()}
        json.dump(data, open(TRYON / 'eyes.json', 'w'), separators=(',', ':'))
        print('eye maps:', len(data))
    elif sys.argv[1:] == ['layers']:
        (TRYON / 'layers').mkdir(parents=True, exist_ok=True)
        looks = {look: export_layer(look, TRYON / 'layers') for look in catalog_looks()}
        data = {'tris': [int(i) for t in mesh_triangles() for i in t], **lipstick_data(), 'looks': looks}
        json.dump(data, open(TRYON / 'looks.json', 'w'), separators=(',', ':'))
        print('layers:', len(looks))
    elif sys.argv[1:] == ['lipsticks']:     # only the lipstick picker's data in looks.json
        data = json.load(open(TRYON / 'looks.json'))
        looks = data.pop('looks'); data.update(lipstick_data()); data['looks'] = looks
        json.dump(data, open(TRYON / 'looks.json', 'w'), separators=(',', ':'))
        print('lipstick data:', data['swatch'])
    else:
        print(__doc__)
