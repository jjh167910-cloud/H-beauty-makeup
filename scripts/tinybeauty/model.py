"""TinyBeauty-style student for H-Beauty (our implementation).

U-Net with the TinyBeauty/BeautyREC layout (~85K parameters) that predicts the makeup residual of
one catalog look on a 256x256 FFHQ-aligned face. Differences from the paper that make it trainable
in minutes on a CPU: two coordinate input channels (the face is aligned, so position tells the
network where eyes and lips are), no normalisation layers, makeup-weighted loss."""
import torch, torch.nn as nn, torch.nn.functional as F

class Conv(nn.Module):
    def __init__(self, i, o, k, s, p, act=True):
        super().__init__(); self.pad = nn.ReflectionPad2d(p); self.conv = nn.Conv2d(i, o, k, s); self.act = act
    def forward(self, x):
        x = self.conv(self.pad(x)); return F.relu(x) if self.act else x

class Res(nn.Module):
    def __init__(self, c):
        super().__init__(); self.a = Conv(c, c, 3, 1, 1); self.b = Conv(c, c, 3, 1, 1, act=False)
    def forward(self, x): return x + self.b(self.a(x))

def coords(b, h, w, box=None):
    """Coordinate channels in [-1, 1] over the full 256 frame; `box` = (y0, x0, size) for a crop."""
    if box is None: ys, xs = torch.linspace(-1, 1, h), torch.linspace(-1, 1, w)
    else:
        y0, x0, full = box; step = 2 / (full - 1)
        ys, xs = -1 + (y0 + torch.arange(h)) * step, -1 + (x0 + torch.arange(w)) * step
    yy, xx = torch.meshgrid(ys, xs, indexing='ij')
    return torch.stack([xx, yy])[None].expand(b, 2, h, w)

class TinyMakeup(nn.Module):
    def __init__(self, dim=24):
        super().__init__()
        self.first = Conv(5, dim, 7, 1, 3)
        self.down1 = Conv(dim, dim, 4, 2, 1); self.down2 = Conv(dim, dim, 4, 2, 1)
        self.enc_res = nn.Sequential(Res(dim), Res(dim)); self.dec_res = nn.Sequential(Res(dim), Res(dim))
        self.up1 = Conv(dim * 2, dim, 3, 1, 1); self.up2 = Conv(dim * 2, dim, 3, 1, 1)
        self.out = Conv(dim, 3, 3, 1, 1, act=False)
    def forward(self, x, xy=None):
        """x: RGB in [-1, 1] (B,3,H,W); xy: coordinate channels (default: x is the full aligned face)."""
        if xy is None: xy = coords(x.shape[0], x.shape[2], x.shape[3])
        c1 = self.down1(self.first(torch.cat([x, xy], 1))); c2 = self.down2(c1)
        r = self.dec_res(self.enc_res(c2))
        u = self.up1(F.interpolate(torch.cat([c2, r], 1), scale_factor=2, mode='nearest'))
        u = self.up2(F.interpolate(torch.cat([c1, u], 1), scale_factor=2, mode='nearest'))
        return torch.tanh(self.out(u))       # residual in [-1, 1] image units
