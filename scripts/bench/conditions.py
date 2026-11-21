"""Phone light conditions for the quality benchmark: known changes to a photo, so the truth is known.

Each condition is a fixed function T of a photo, built once from the bare face (its landmarks and its light) and then
applied unchanged to anything painted on that face. Makeup is on her face before the light falls on it, so the true
picture of a look in condition c is T_c(the look painted on the original photo); the engine's answer is the look painted
on T_c(the original photo). The difference between the two is the engine's error in that light (score.py, "light
consistency"). On the catalog model the catalog photo itself is the truth: T_c(catalog photo).

The light changes are gains in linear light (a field over the photo, per channel): that is what a change of light does to
a matte surface. Noise, the phone's noise reduction and compression come after, the same pixels for the same face.

    python scripts/bench/conditions.py IN.jpg OUT_DIR       # writes OUT_DIR/<name>__<cond>.png, to look at them
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'tinybeauty'))
import teacher as T  # noqa: E402

CONDITIONS = ('orig', 'warm', 'window', 'dim', 'flash', 'backlit', 'jpeg')
NAMES = {
    'orig': 'as generated', 'warm': 'warm indoor bulb', 'window': 'window side light', 'dim': 'dim evening, noisy',
    'flash': 'phone flash', 'backlit': 'backlit', 'jpeg': 'heavy compression',
}


def to_lin(u8: np.ndarray) -> np.ndarray:
    x = u8.astype(np.float32) / 255
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)


def to_srgb(lin: np.ndarray) -> np.ndarray:
    x = np.clip(lin, 0, 1)
    s = np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055)
    return np.clip(np.round(s * 255), 0, 255).astype(np.uint8)


def _ellipse(shape, p, grow: float, soft: float) -> np.ndarray:
    """Her head: the face oval grown by `grow`, softened by `soft` face widths."""
    q = p[T.OVAL, :2]; c = q.mean(0)
    m = np.zeros(shape, np.float32)
    cv2.fillPoly(m, [np.int32(np.round(c + (q - c) * grow))], 1)
    fw = np.ptp(q[:, 0])
    return cv2.GaussianBlur(m, (0, 0), max(1.0, fw * soft))


class Condition:
    """One condition for one face: `apply(img)` gives any picture of that face in this light."""

    def __init__(self, name: str, bare: np.ndarray, p: np.ndarray, seed: int):
        assert name in CONDITIONS, name
        self.name, self.shape = name, bare.shape[:2]
        h, w = self.shape
        p = np.asarray(p, np.float32)
        q = p[:, :2]; fw = float(np.ptp(q[T.OVAL, 0])); cx = float(q[T.OVAL, 0].mean()); cy = float(q[T.OVAL, 1].mean())
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        gain = np.ones((h, w, 3), np.float32)
        self.noise = None
        if name == 'warm':          # a 2700 K bulb, the phone's white balance correcting it only part way, a little dark
            gain *= np.float32([1.0, 0.80, 0.56]) * 0.85
        elif name == 'window':      # daylight from one side: one cheek lit, the other in shade, a little cool
            t = np.tanh((xx - cx) / (fw * 0.5) * 1.1)
            gain *= (0.95 + 0.55 * t)[..., None] * np.float32([0.96, 1.0, 1.08])
        elif name == 'dim':         # a dim lamp: under-exposed, warm, grainy, then the phone's noise reduction
            gain *= np.float32([1.0, 0.88, 0.72]) * 0.40
            rng = np.random.default_rng(seed)
            self.noise = (rng.standard_normal((h, w, 3)).astype(np.float32), rng.standard_normal((h, w, 1)).astype(np.float32))
        elif name == 'flash':       # light from the camera: her shading flattened, the background falling off, cool
            Y = cv2.GaussianBlur(to_lin(bare) @ np.float32([0.2126, 0.7152, 0.0722]), (0, 0), fw * 0.12)
            head = _ellipse(self.shape, p, 1.15, 0.08)
            ref = float(np.median(Y[head > 0.5]))
            flat = np.clip((ref / np.maximum(Y, 1e-4)) ** 0.5, 0.6, 2.2)
            fall = 1 / (1 + ((xx - cx) ** 2 + (yy - cy) ** 2) / (fw * 1.3) ** 2)
            g = (head * flat + (1 - head) * 0.55) * (0.55 + 0.45 * fall) * 1.25
            gain *= g[..., None] * np.float32([0.97, 1.0, 1.06])
        elif name == 'backlit':     # a bright window behind her: her face under-exposed, the background blown out
            head = _ellipse(self.shape, p, 1.35, 0.12)
            gain *= (head * 0.42 + (1 - head) * 2.2)[..., None] * np.float32([1.0, 0.98, 0.95])
        self.gain = gain

    def apply(self, img: np.ndarray) -> np.ndarray:
        assert img.shape[:2] == self.shape, (img.shape, self.shape)
        if self.name == 'jpeg':     # sent through a messaging app: half the size, strong compression, back up
            h, w = self.shape
            s = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
            ok, buf = cv2.imencode('.jpg', cv2.cvtColor(s, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 35])
            s = cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
            return cv2.resize(s, (w, h), interpolation=cv2.INTER_LINEAR)
        lin = to_lin(img) * self.gain
        if self.noise is not None:  # shot noise (grows with the light) and read noise, colour and luminance
            n3, n1 = self.noise
            sd = np.sqrt(0.0025 * lin + 0.00004)
            lin = lin + sd * (0.6 * n3 + 0.8 * n1)
            out = to_srgb(lin)
            return cv2.fastNlMeansDenoisingColored(out, None, 3, 5, 5, 15)
        return to_srgb(lin)


def conditions_for(bare: np.ndarray, p: np.ndarray, seed: int, names=CONDITIONS) -> dict[str, Condition]:
    return {c: Condition(c, bare, p, seed) for c in names}


if __name__ == '__main__':
    src, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    img = T.rgb(src); p = T.landmarks3(img); assert p is not None, 'no face'
    for c, cond in conditions_for(img, p, seed=1).items():
        cv2.imwrite(str(out / f'{src.stem}__{c}.png'), cv2.cvtColor(cond.apply(img), cv2.COLOR_RGB2BGR))
    print('written', out)
