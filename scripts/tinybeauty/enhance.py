"""Photo sharpening for the try-on: Real-ESRGAN's compact model (realesr-general-x4v3, Xintao Wang, BSD-3-Clause).

Soft or small photos (most phone selfies sent through messengers) make the painted result look low quality.
src/lib/enhance-gl.ts runs this network on the phone's graphics chip before the makeup is painted.
This script exports its weights for the app and is the reference the browser output is checked against.

    python scripts/tinybeauty/enhance.py export      # -> public/tryon/enhance-x4.bin (float16, 2.4 MB)
    python scripts/tinybeauty/enhance.py run in.jpg out.png [lr_scale]

Weights: realesr-general-x4v3.pth and realesr-general-wdn-x4v3.pth from
https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0, blended 50/50 (its "denoise strength" 0.5).
"""
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'public/tryon/enhance-x4.bin'
WEIGHTS = Path(__file__).resolve().parent / 'weights'
NF, NC, UP = 64, 32, 4          # features, body convolutions, upscale (as the app's enhance-gl.ts)
DENOISE = 0.5


class SRVGG(nn.Module):
    """SRVGGNetCompact: 3x3 conv + PReLU, 32 more, a conv to 3*4*4 channels, pixel shuffle, plus the input upscaled."""
    def __init__(self):
        super().__init__()
        body = [nn.Conv2d(3, NF, 3, 1, 1), nn.PReLU(NF)]
        for _ in range(NC):
            body += [nn.Conv2d(NF, NF, 3, 1, 1), nn.PReLU(NF)]
        body += [nn.Conv2d(NF, 3 * UP * UP, 3, 1, 1)]
        self.body = nn.ModuleList(body)

    def forward(self, x):
        out = x
        for m in self.body:
            out = m(out)
        return F.pixel_shuffle(out, UP) + F.interpolate(x, scale_factor=UP, mode='nearest')


def load():
    a = torch.load(WEIGHTS / 'realesr-general-x4v3.pth', map_location='cpu')['params']
    b = torch.load(WEIGHTS / 'realesr-general-wdn-x4v3.pth', map_location='cpu')['params']
    m = SRVGG()
    m.load_state_dict({k: a[k] * (1 - DENOISE) + b[k] * DENOISE for k in a})
    return m.eval()


def export():
    """Per layer: conv weight [out, in, 3, 3], bias [out], then PReLU slopes [out] (all but the last layer)."""
    m = load(); parts = []
    for layer in m.body:
        for t in layer.parameters():
            parts.append(t.detach().numpy().astype(np.float32).ravel())
    data = np.concatenate(parts).astype(np.float16)
    OUT.write_bytes(data.tobytes())
    print(OUT, data.size, 'parameters', OUT.stat().st_size, 'bytes')


def run(rgb_u8: np.ndarray) -> np.ndarray:
    """RGB uint8 (H, W, 3) -> RGB uint8 (4H, 4W, 3), with the float16 weights the app uses."""
    m = load()
    with torch.no_grad():
        for p in m.parameters():
            p.copy_(p.half().float())
        x = torch.from_numpy(rgb_u8.astype(np.float32) / 255).permute(2, 0, 1)[None]
        y = m(x)[0].permute(1, 2, 0).clamp(0, 1).numpy()
    return (y * 255 + 0.5).astype(np.uint8)


if __name__ == '__main__':
    if sys.argv[1:2] == ['export']:
        export()
    elif sys.argv[1:2] == ['run']:
        import cv2
        im = cv2.cvtColor(cv2.imread(sys.argv[2]), cv2.COLOR_BGR2RGB)
        if len(sys.argv) > 4:
            s = float(sys.argv[4]); im = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        cv2.imwrite(sys.argv[3], cv2.cvtColor(run(im), cv2.COLOR_RGB2BGR))
    else:
        print(__doc__)
