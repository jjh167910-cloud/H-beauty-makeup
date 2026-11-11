"""Where her face can actually be seen: makeup goes only on visible skin, never over hair, hands,
glasses frames, a phone, a scarf or anything else in front of her face.

MediaPipe's multi-class selfie segmentation (Apache-2.0; `public/tryon/segment.tflite`, its weights
stored as float16 by fp16.py) labels each pixel of a 256x256 crop around her face as background,
hair, body skin, face skin, clothes or other. Visible face = face skin, plus body skin outside her
face oval (her neck and ears, where contour fades out; a hand inside the oval covers her face).

That map is coarse (a crop pixel is 2-5 photo pixels), so it is refined with a colour-guided filter
(He et al., Guided Image Filtering, TPAMI 2013) in its fast form (He & Sun 2015): the filter's
local linear models are fitted on a 512x512 grid over the same crop and then applied to her photo at
full resolution, so the edges follow single hair strands and fingers in her photo.

The phone does exactly this on the graphics chip (makeup-gl.ts); this is the reference.

    python scripts/tinybeauty/occlusion.py show photo.jpg ...    # the maps next to each photo
"""
import sys
from functools import lru_cache
from pathlib import Path
import cv2, numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import teacher as T

MODEL = T.TRYON / 'segment.tflite'
SEG = 256           # the network's input size
GRID = 512          # the guided filter's grid over the same crop
CROP = 1.7          # the crop: this many times the face mesh's larger side
GUIDE_SIGMA = 2.4   # guided filter window (Gaussian sigma), in grid pixels
GUIDE_EPS = 2e-3    # guided filter regularisation (photo values 0..1): smaller follows her photo more closely
OVAL_SOFT = 0.12    # how softly "inside her face oval" ends, in eye widths
EDGE_SOFT = 0.12   # the look's skin-level layer fades out over about this far (eye widths) before her visible face's edge
VIS_LO, VIS_HI = 0.1, 0.8   # the network's probability -> visible (it is never sure: ~0.92 on plain face skin)
FACE, BODY = 3, 2   # classes: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other


@lru_cache(None)
def _segmenter():
    from mediapipe.tasks.python import vision, BaseOptions
    return vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL)), output_confidence_masks=True, output_category_mask=False))


def crop_box(p):
    """The square crop around her face: (x0, y0, side) in photo pixels (may reach outside the photo)."""
    q = np.asarray(p)[:468, :2]
    (x0, y0), (x1, y1) = q.min(0), q.max(0)
    side = max(x1 - x0, y1 - y0) * CROP
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - (y1 - y0) * 0.05      # a little more room above (hair)
    return float(cx - side / 2), float(cy - side / 2), float(side)


def to_grid(img, box, n):
    """The crop as an n x n picture: area-averaged when shrinking, edge pixels repeated outside the photo."""
    x0, y0, side = box
    s = n / side
    if s < 1:
        src = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        sx, sy = src.shape[1] / img.shape[1], src.shape[0] / img.shape[0]     # the scale actually made
        M = np.float32([[s / sx, 0, 0.5 * s / sx - x0 * s - 0.5], [0, s / sy, 0.5 * s / sy - y0 * s - 0.5]])
    else:
        src = img
        M = np.float32([[s, 0, -(x0 - 0.5) * s - 0.5], [0, s, -(y0 - 0.5) * s - 0.5]])
    return cv2.warpAffine(src, M, (n, n), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def classes(img, p):
    """The network's class probabilities for face skin and body skin on its 256x256 crop (256 256 2), and the crop."""
    import mediapipe as mp
    box = crop_box(p)
    small = to_grid(img, box, SEG)
    r = _segmenter().segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(small)))
    probs = np.stack([r.confidence_masks[c].numpy_view().reshape(SEG, SEG) for c in (FACE, BODY)], -1).astype(np.float32)
    return probs, box


def upsample(x, n_from, n_to):
    """A texture of n_from texels read at the texel centres of an n_to grid over the same square (bilinear, clamped)."""
    k = n_from / n_to
    M = np.float32([[k, 0, 0.5 * k - 0.5], [0, k, 0.5 * k - 0.5]])
    return cv2.warpAffine(x, M, (n_to, n_to), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)


def coarse(p, probs, box):
    """Visible face on the grid (GRID GRID, 0..1), before refinement: face skin, plus body skin outside her oval."""
    x0, y0, side = box
    g = GRID / side
    up = upsample(probs, SEG, GRID)
    q = (np.asarray(p)[:, :2] - [x0, y0]) * g
    oval = np.zeros((GRID, GRID), np.float32); cv2.fillPoly(oval, [np.int32(np.round(q[T.OVAL] - 0.5))], 1)
    inside = gauss(oval, T.eye_width(q) * OVAL_SOFT)
    return np.clip((up[..., 0] + up[..., 1] * (1 - inside) - VIS_LO) / (VIS_HI - VIS_LO), 0, 1)


def gauss(x, sigma):
    return cv2.GaussianBlur(x, (0, 0), sigma, borderType=cv2.BORDER_REPLICATE)


def fit(I, p, sigma, eps):
    """Guided filter's linear models (a: H W 3, b: H W), averaged over each window: q = a . I + b."""
    mI = gauss(I, sigma); mp_ = gauss(p, sigma)
    cIp = gauss(I * p[..., None], sigma) - mI * mp_[..., None]
    S = np.empty(I.shape[:2] + (3, 3), np.float32)
    for i in range(3):
        for j in range(i, 3):
            S[..., i, j] = S[..., j, i] = gauss(I[..., i] * I[..., j], sigma) - mI[..., i] * mI[..., j]
    S += np.eye(3, dtype=np.float32) * eps
    a = np.linalg.solve(S, cIp[..., None])[..., 0]
    b = mp_ - (a * mI).sum(-1)
    return gauss(a, sigma), gauss(b, sigma)


def models(img, p, probs=None, box=None):
    """The grid's linear models (GRID GRID 4: a, b; for her photo's values minus 0.5) and the crop box."""
    if probs is None: probs, box = classes(img, p)
    I = to_grid(img, box, GRID).astype(np.float32) / 255 - 0.5
    a, b = fit(I, coarse(p, probs, box), GUIDE_SIGMA, GUIDE_EPS)
    return np.dstack([a, b]), box


def visible(img, p, probs=None, box=None):
    """Where makeup may go on her photo (H W, 0..1). `probs`/`box` from classes() (computed when missing)."""
    ab, box = models(img, p, probs, box)
    H, W = img.shape[:2]
    x0, y0, side = box
    g = GRID / side
    # the grid read at each photo pixel's centre (bilinear, clamped): photo x -> grid (x + 0.5 - x0) g - 0.5
    M = np.float32([[g, 0, (0.5 - x0) * g - 0.5], [0, g, (0.5 - y0) * g - 0.5]])
    AB = cv2.warpAffine(ab, M, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    I = img.astype(np.float32) / 255 - 0.5
    return np.clip((AB[..., :3] * I).sum(-1) + AB[..., 3], 0, 1)


def edge_fade(img, p, probs=None, box=None):
    """How much of the look's skin-level layer (foundation tint, glow) each pixel keeps: it fades out softly before the
    edge of her visible face (hairline, hair over her cheek, a hand), so it never ends in a line there."""
    if probs is None: probs, box = classes(img, p)
    x0, y0, side = box; g = GRID / side
    e = gauss(coarse(p, probs, box), EDGE_SOFT * T.eye_width(np.asarray(p)[:, :2]) * g)
    H, W = img.shape[:2]
    M = np.float32([[g, 0, (0.5 - x0) * g - 0.5], [0, g, (0.5 - y0) * g - 0.5]])
    E = cv2.warpAffine(e, M, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    t = np.clip((E - 0.5) / 0.45, 0, 1)
    return t * t * (3 - 2 * t)


def keep(out, img, vis):
    """The made-up photo where her face is visible, her own photo elsewhere (both RGB uint8)."""
    o = img.astype(np.float32) + (out.astype(np.float32) - img) * vis[..., None]
    return np.clip(o + 0.5, 0, 255).astype(np.uint8)


if __name__ == '__main__' and sys.argv[1:2] == ['show']:
    rows = []
    for f in sys.argv[2:]:
        im = T.rgb(f); p = T.landmarks3(im)
        if p is None: print('no face', f); continue
        probs, box = classes(im, p)
        v = visible(im, p, probs, box)
        v0 = cv2.resize(coarse(p, probs, box), (int(box[2]), int(box[2])))
        h = 360; r = lambda x: cv2.resize(x, (h * x.shape[1] // x.shape[0], h), interpolation=cv2.INTER_AREA)
        g = lambda m: cv2.cvtColor((np.clip(m, 0, 1) * 255).astype(np.uint8), cv2.COLOR_GRAY2RGB)
        rows.append(np.hstack([r(im), r(g(v0)), r(g(v)), r((im * v[..., None]).astype(np.uint8))]))
    cv2.imwrite('occlusion_show.jpg', cv2.cvtColor(np.vstack(rows), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print('occlusion_show.jpg')
