"""
HD face: the face-restoration network the app runs on the phone (src/lib/face-hd.ts) before the makeup, and its
reference. GFPGAN v1.4 (Tencent ARC, Apache-2.0; github.com/TencentARC/GFPGAN) redraws a soft or small face at
512 x 512; only its fine detail is kept (eyes, lashes, brows, lips, skin texture): her face's shape, tones and colours
stay her photo's own (a detail transfer), so the network can't change who she is.

    python scripts/tinybeauty/face_hd.py build                          # public/tryon/face-hd/*.bin (int8 weights, 2 parts)
    python scripts/tinybeauty/face_hd.py run in.jpg out.png [points.json] # reference output, for checking the browser

`build` downloads FaceFusion's ONNX export of the official GFPGANv1.4 weights (checked against its published CRC),
stores the large weights as int8 per output channel (DequantizeLinear; compute stays float32: 57-60 dB from the
float32 network) and splits the file in two (each under GitHub's 50 MB warning).
"""
import json
import os
import sys
import urllib.request
import zlib

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'tryon', 'face-hd')
SOURCE = 'https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/gfpgan_1.4.onnx'
SOURCE_CRC = '5a6c6364'
PART = 48_000_000
SIZE = 512
# FFHQ's five points at 512 (eye centres, nose tip, mouth corners), as GFPGAN aligns faces (facexlib)
TEMPLATE = np.array([[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935], [201.26117, 371.41043], [313.08905, 371.15118]])
DETAIL = 4.0      # the detail kept: finer than this Gaussian sigma (pixels of the 512 face); coarser stays hers
EDGE = (40, 20)   # the restored square's inset and feather (pixels of the 512 face)
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
OVAL_GROW = 0.12  # her face's outline, grown this share (her hairline and brows' tails), feathered by FEATHER eye widths
FEATHER = 0.15


def five(P):
    """Her five points from the face model's 478: iris centres, nose tip, mouth corners (left to right in the photo)."""
    P = np.asarray(P, np.float64)
    e = sorted([P[468, :2], P[473, :2]], key=lambda q: q[0]); m = sorted([P[61, :2], P[291, :2]], key=lambda q: q[0])
    return np.array([e[0], e[1], P[1, :2], m[0], m[1]])


def similarity(src, dst):
    """The rotation, scale and shift carrying src onto dst (least squares, Umeyama): a 2x3 matrix."""
    ms, md = src.mean(0), dst.mean(0); a, b = src - ms, dst - md
    va = (a ** 2).sum(); c = (a[:, 0] * b[:, 0] + a[:, 1] * b[:, 1]).sum() / va; s = (a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]).sum() / va
    R = np.array([[c, -s], [s, c]]); t = md - R @ ms
    return np.hstack([R, t[:, None]])


def warp(img, M, size, reflect=True):
    """img (float HxWxC) through the 2x3 matrix M (photo -> out), bilinear, mirrored past its edges."""
    H, W = img.shape[:2]; Mi = np.linalg.inv(np.vstack([M, [0, 0, 1]]))[:2]
    ys, xs = np.mgrid[0:size[1], 0:size[0]] + 0.5
    sx = Mi[0, 0] * xs + Mi[0, 1] * ys + Mi[0, 2] - 0.5; sy = Mi[1, 0] * xs + Mi[1, 1] * ys + Mi[1, 2] - 0.5
    def fold(v, n):
        if not reflect: return np.clip(v, 0, n - 1)
        v = np.mod(v + 0.5, 2 * n) - 0.5; return np.clip(np.where(v > n - 0.5, 2 * n - 1 - v, v), 0, n - 1)
    sx, sy = fold(sx, W), fold(sy, H)
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int); x1, y1 = np.minimum(x0 + 1, W - 1), np.minimum(y0 + 1, H - 1)
    fx, fy = (sx - x0)[..., None], (sy - y0)[..., None]
    if img.ndim == 2: img = img[..., None]
    out = (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy) + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy)
    return out


def boxes(sigma, n=3):
    """Box widths whose n passes approximate a Gaussian of this sigma (odd widths)."""
    w = int(np.floor(np.sqrt(12 * sigma * sigma / n + 1))); w -= (w % 2 == 0)
    m = round((12 * sigma * sigma - n * w * w - 4 * n * w - 3 * n) / (-4 * w - 4))
    return [w if i < m else w + 2 for i in range(n)]


def box_blur(x, sigma):
    """Three box blurs (edges clamped): about a Gaussian; the browser does the same."""
    for w in boxes(sigma):
        r = w // 2
        for axis in (0, 1):
            n = x.shape[axis]; idx = np.clip(np.arange(-r - 1, n + r), 0, n - 1)
            c = np.cumsum(np.take(x, idx, axis=axis), axis=axis, dtype=np.float64)
            hi, lo = np.take(c, np.arange(2 * r + 1, n + 2 * r + 1), axis=axis), np.take(c, np.arange(0, n), axis=axis)
            x = (hi - lo) / w
    return x


def restore(u8, P, session):
    """Her photo with the network's detail on her face (uint8 RGB in and out); P her 478 points in its pixels."""
    H, W = u8.shape[:2]
    M = similarity(five(P), TEMPLATE)
    face = warp(u8.astype(np.float64), M, (SIZE, SIZE))
    x = (face / 127.5 - 1).transpose(2, 0, 1)[None].astype(np.float32)
    y = session.run(None, {session.get_inputs()[0].name: x})[0][0].transpose(1, 2, 0)
    out = (np.clip(y, -1, 1) + 1) * 127.5
    return paste(u8, P, out, M)


def paste(u8, P, out, M):
    """The restored 512 face's fine detail onto her photo, inside her (grown, feathered) face and the restored square."""
    H, W = u8.shape[:2]; Mi = np.linalg.inv(np.vstack([M, [0, 0, 1]]))[:2]
    scale = np.sqrt(abs(np.linalg.det(Mi[:, :2])))
    back = warp(out, np.vstack([Mi, [0, 0, 1]])[:2], (W, H))
    sq = np.zeros((SIZE, SIZE)); sq[EDGE[0]:SIZE - EDGE[0], EDGE[0]:SIZE - EDGE[0]] = 1; sq = box_blur(sq, EDGE[1])
    sq = warp(sq[..., None], np.vstack([Mi, [0, 0, 1]])[:2], (W, H), reflect=False)[..., 0]
    ew = (np.hypot(*(P[33][:2] - P[133][:2])) + np.hypot(*(P[263][:2] - P[362][:2]))) / 2
    pts = np.array([P[i][:2] for i in OVAL], np.float64); c = pts.mean(0); pts = c + (pts - c) * (1 + OVAL_GROW)
    im = Image.new('L', (W, H), 0); __import__('PIL.ImageDraw').ImageDraw.Draw(im).polygon([tuple(q) for q in pts], fill=255)
    oval = box_blur(np.asarray(im, np.float64) / 255, FEATHER * ew)
    m = (sq * oval)[..., None]
    f = u8.astype(np.float64); s = DETAIL * scale
    det = f + (back - box_blur(back, s)) - (f - box_blur(f, s))
    return np.clip(f + m * (det - f) + 0.5, 0, 255).astype(np.uint8)


def build():
    import onnx
    from onnx import numpy_helper, helper
    os.makedirs(OUT, exist_ok=True)
    raw = os.path.join(OUT, 'gfpgan_1.4.onnx')
    if not os.path.exists(raw): urllib.request.urlretrieve(SOURCE, raw)
    crc = 0
    with open(raw, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 24), b''): crc = zlib.crc32(chunk, crc)
    assert format(crc, '08x') == SOURCE_CRC, 'unexpected file'
    m = onnx.load(raw); g = m.graph; inits, nodes = [], []
    for t in list(g.initializer):
        a = numpy_helper.to_array(t)
        if a.dtype != np.float32 or a.size < 4096: inits.append(t); continue
        axis = 1 if (a.ndim == 5 and a.shape[0] == 1) else 0      # (the modulated convolutions' weights: [1, out, in, k, k])
        amax = np.abs(a).max(axis=tuple(i for i in range(a.ndim) if i != axis))
        scale = np.where(amax > 0, amax / 127, 1).astype(np.float32); shape = [1] * a.ndim; shape[axis] = -1
        q = np.clip(np.round(a / scale.reshape(shape)), -127, 127).astype(np.int8)
        inits += [numpy_helper.from_array(q, t.name + '_q8'), numpy_helper.from_array(scale, t.name + '_s'), numpy_helper.from_array(np.zeros_like(scale, np.int8), t.name + '_z')]
        nodes.append(helper.make_node('DequantizeLinear', [t.name + '_q8', t.name + '_s', t.name + '_z'], [t.name], axis=axis))
    del g.initializer[:]; g.initializer.extend(inits)
    all_nodes = nodes + list(g.node); del g.node[:]; g.node.extend(all_nodes)
    data = m.SerializeToString(); os.remove(raw)
    for i in range(0, len(data), PART):
        open(os.path.join(OUT, f'gfpgan-1.4-q8.{i // PART}.bin'), 'wb').write(data[i:i + PART])
    print(len(data), 'bytes in', (len(data) + PART - 1) // PART, 'parts')


def session():
    import onnxruntime as ort
    parts = sorted(f for f in os.listdir(OUT) if f.startswith('gfpgan-1.4-q8.'))
    data = b''.join(open(os.path.join(OUT, f), 'rb').read() for f in parts)
    return ort.InferenceSession(data, providers=['CPUExecutionProvider'])


if __name__ == '__main__':
    if sys.argv[1] == 'build': build()
    elif sys.argv[1] == 'run':
        u8 = np.asarray(Image.open(sys.argv[2]).convert('RGB'))
        if len(sys.argv) > 4: P = np.array(json.load(open(sys.argv[4])), np.float64)
        else:
            sys.path.insert(0, HERE)
            from teacher import landmarks3
            P = landmarks3(u8).astype(np.float64)
        Image.fromarray(restore(u8, P, session())).save(sys.argv[3])
