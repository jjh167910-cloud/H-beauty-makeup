"""Train one tiny makeup network per catalog look and export it for the app.

Per look: the teacher paints the look on the clean synthetic training faces (faces.py), the
network learns before -> after, and the result is exported to public/tryon/tiny/<look>.onnx
(fp16 weights, ~230 KB). The base look is trained from scratch; the others start from it, so
each takes ~10 minutes on a 2-core CPU. Resumable: finished looks are skipped.

    python scripts/tinybeauty/train.py all            # or: train.py hollywood,sunset
"""
import json, math, os, shutil, sys, time
from multiprocessing import Pool, get_context
from pathlib import Path
import cv2, numpy as np, onnx, torch, torch.nn.functional as F
from onnx import TensorProto, helper, numpy_helper

sys.path.insert(0, str(Path(__file__).parent))
import teacher
from model import TinyMakeup, coords

WORK = Path(os.environ.get('TINYBEAUTY_WORK', teacher.REPO / '.tinybeauty'))
FACES, PAIRS, RUNS = WORK / 'sfhq/faces', WORK / 'pairs', WORK / 'runs'
OUT = teacher.TRYON / 'tiny'
BASE = 'hollywood'


# ------------------------------------------------------------------- data
_st = {}
def _init(look): _st['look'] = look; teacher.make_layer(look)
def _pair(name):
    face = teacher.rgb(FACES / f'{name}.png'); p = teacher.landmarks3(face)
    if p is None: return None
    out = teacher.paint(_st['look'], face, p)
    cv2.imwrite(str(PAIRS / _st['look'] / f'{name}.png'), cv2.cvtColor(out, cv2.COLOR_RGB2BGR)); return name

def make_pairs(look, names):
    (PAIRS / look).mkdir(parents=True, exist_ok=True)
    # 'spawn': forked workers deadlock once the parent has run PyTorch's thread pools.
    with get_context('spawn').Pool(2, initializer=_init, initargs=(look,)) as pool:
        return [n for n in pool.imap(_pair, names, chunksize=16) if n]

def load(look, names):
    rd = lambda p: cv2.cvtColor(cv2.imread(str(p)), cv2.COLOR_BGR2RGB)
    t = lambda a: torch.from_numpy(a).permute(0, 3, 1, 2).contiguous()
    return t(np.stack([rd(FACES / f'{n}.png') for n in names])), t(np.stack([rd(PAIRS / look / f'{n}.png') for n in names]))


# --------------------------------------------------------------- training
to_f = lambda u8: u8.float() / 127.5 - 1

def augment(x, y):
    """Same small random rotation/scale/shift for input and target (alignment robustness)."""
    b = x.shape[0]
    ang = (torch.rand(b) - 0.5) * math.radians(8); sc = 1 + (torch.rand(b) - 0.5) * 0.1
    tx, ty = (torch.rand(b) - 0.5) * 0.06, (torch.rand(b) - 0.5) * 0.06
    th = torch.stack([torch.stack([torch.cos(ang) / sc, -torch.sin(ang) / sc, tx], 1),
                      torch.stack([torch.sin(ang) / sc, torch.cos(ang) / sc, ty], 1)], 1)
    grid = F.affine_grid(th, x.shape, align_corners=False)
    w = lambda z: F.grid_sample(z, grid, mode='bilinear', padding_mode='reflection', align_corners=False)
    return w(x), w(y)

def weights(x, y):
    """Makeup covers a small part of the face, so a plain whole-image loss settles on
    'change nothing'. Pixels where the teacher painted makeup weigh 21x."""
    m = F.max_pool2d(((y - x).abs().amax(1, keepdim=True) > 0.02).float(), 9, 1, 4)
    return 1 + 20 * m, m

def ssim(a, b, win=11, sigma=1.5):
    g = torch.exp(-((torch.arange(win) - win // 2) ** 2) / (2 * sigma ** 2)); g = (g / g.sum()).to(a)
    k = (g[:, None] * g[None, :]).expand(a.shape[1], 1, win, win)
    f = lambda x: F.conv2d(x, k, padding=win // 2, groups=a.shape[1])
    mu_a, mu_b = f(a), f(b)
    va, vb, cov = f(a * a) - mu_a ** 2, f(b * b) - mu_b ** 2, f(a * b) - mu_a * mu_b
    return (((2 * mu_a * mu_b + 1e-4) * (2 * cov + 9e-4)) / ((mu_a ** 2 + mu_b ** 2 + 1e-4) * (va + vb + 9e-4))).mean()

def evaluate(net, X, Y):
    """PSNR (dB) of network vs teacher in the makeup region, and of the bare face vs teacher."""
    net.eval(); region, bare = [], []
    with torch.no_grad():
        for k in range(0, len(X), 16):
            x, y = to_f(X[k:k + 16]), to_f(Y[k:k + 16]); _, m = weights(x, y)
            ps = lambda q: (10 * torch.log10(m.sum(dim=(1, 2, 3)) * 3 / (((q - y) / 2).pow(2) * m).sum(dim=(1, 2, 3)).clamp_min(1e-12))).tolist()
            region += ps((x + net(x)).clamp(-1, 1)); bare += ps(x)
    net.train(); return float(np.mean(region)), float(np.mean(bare))

def train_stage(net, X, Y, steps, lr, res, crop, ck, tag, ssim_w, log):
    st = torch.load(ck) if ck.exists() else None
    if st and st.get('tag') != tag: st = None
    opt = torch.optim.Adam(net.parameters(), lr)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, lr, total_steps=steps, pct_start=0.05)
    step = 0
    if st: net.load_state_dict(st['net']); opt.load_state_dict(st['opt']); sched.load_state_dict(st['sched']); step = st['step']
    if res != 256:
        X = F.interpolate(X.float(), size=(res, res), mode='area').round().to(torch.uint8)
        Y = F.interpolate(Y.float(), size=(res, res), mode='area').round().to(torch.uint8)
    g = torch.Generator().manual_seed(step + len(tag)); t0 = time.time()
    while step < steps:
        idx = torch.randint(0, len(X), (8,), generator=g)
        x, y = augment(to_f(X[idx]), to_f(Y[idx])); xy = None
        if crop:   # full-detail training on crops: 4x cheaper, coordinates say where the crop is
            y0, x0 = [int(v) for v in torch.randint(0, res - crop + 1, (2,), generator=g)]
            x, y = x[:, :, y0:y0 + crop, x0:x0 + crop], y[:, :, y0:y0 + crop, x0:x0 + crop]
            xy = coords(8, crop, crop, (y0, x0, res))
        r = net(x, xy); w, _ = weights(x, y)
        loss = (w * (r - (y - x)).abs()).sum() / (w.sum() * 3)
        if ssim_w: loss = loss + ssim_w * (1 - ssim((x + r).clamp(-1, 1), y))
        opt.zero_grad(); loss.backward(); opt.step(); sched.step(); step += 1
        if step % 250 == 0 or step == steps:
            print(f'  {tag} step {step}/{steps} loss {loss.item():.4f} {time.time() - t0:.0f}s', file=log, flush=True)
            torch.save({'tag': tag, 'step': step, 'net': net.state_dict(), 'opt': opt.state_dict(), 'sched': sched.state_dict()}, ck)


# ----------------------------------------------------------------- export
def export(net, path: Path):
    """ONNX for the app: RGB 0..255 (1,3,256,256) aligned face -> made-up face 0..255, fp16 weights."""
    class Wrap(torch.nn.Module):
        def __init__(s, n):
            super().__init__(); s.n = n; v = torch.linspace(-1, 1, 256)
            s.register_buffer('xs', v.view(1, 1, 1, 256)); s.register_buffer('ys', v.view(1, 1, 256, 1))
        def forward(s, rgb):
            x = rgb / 127.5 - 1
            xy = torch.cat([s.xs.expand(1, 1, 256, 256), s.ys.expand(1, 1, 256, 256)], 1)
            return ((x + s.n(x, xy)).clamp(-1, 1) + 1) * 127.5
    tmp = path.with_suffix('.f32.onnx')
    torch.onnx.export(Wrap(net).eval(), torch.rand(1, 3, 256, 256) * 255, str(tmp), input_names=['rgb'], output_names=['out'],
                      opset_version=17, dynamo=False, do_constant_folding=False)
    m = onnx.load(str(tmp)); g = m.graph; inits, casts = [], []
    for init in list(g.initializer):
        a = numpy_helper.to_array(init)
        if a.dtype == np.float32 and a.size > 16:   # store weights as fp16, cast back when loading
            inits.append(numpy_helper.from_array(a.astype(np.float16), init.name + '_h'))
            casts.append(helper.make_node('Cast', [init.name + '_h'], [init.name], to=TensorProto.FLOAT))
        else: inits.append(init)
    del g.initializer[:]; g.initializer.extend(inits)
    nodes = list(g.node); del g.node[:]; g.node.extend(casts + nodes)
    onnx.checker.check_model(m); onnx.save(m, str(path)); tmp.unlink()


def run(look, names, log, warm_steps=1000):
    t0 = time.time(); idx = PAIRS / f'{look}.json'
    if idx.exists(): done = json.load(open(idx))
    else:
        done = make_pairs(look, names); json.dump(done, open(idx, 'w'))
        print(f'{look}: {len(done)} pairs in {time.time() - t0:.0f}s', file=log, flush=True)
    val = set(names[-120:]); tr = [n for n in done if n not in val]; va = [n for n in done if n in val]
    X, Y = load(look, tr); Xv, Yv = load(look, va)
    net = TinyMakeup(); ck = RUNS / 'ckpt.pt'
    if look == BASE:
        train_stage(net, X, Y, 2000, 3e-3, 128, None, ck, f'{look}-s1', 0, log)
        train_stage(net, X, Y, 1500, 1e-3, 256, 128, ck, f'{look}-s2', 0.5, log)
    else:
        net.load_state_dict(torch.load(RUNS / f'{BASE}.pt'))
        train_stage(net, X, Y, warm_steps, 1e-3, 256, 128, ck, f'{look}-w', 0.5, log)
    region, bare = evaluate(net, Xv, Yv)
    torch.save(net.state_dict(), RUNS / f'{look}.pt'); export(net, OUT / f'{look}.onnx')
    print(f'{look}: makeup-region PSNR vs teacher {region:.2f} dB (bare face {bare:.2f}) | {time.time() - t0:.0f}s', file=log, flush=True)
    shutil.rmtree(PAIRS / look, ignore_errors=True); ck.unlink(missing_ok=True)


if __name__ == '__main__':
    torch.set_num_threads(2)
    for d in (PAIRS, RUNS, OUT): d.mkdir(parents=True, exist_ok=True)
    names = json.load(open(WORK / 'sfhq/index_clean.json'))
    looks = teacher.catalog_looks(); looks = [BASE] + [l for l in looks if l != BASE]
    if len(sys.argv) > 1 and sys.argv[1] != 'all': looks = sys.argv[1].split(',')
    log = open(RUNS / 'log.txt', 'a')
    for look in looks:
        if not (OUT / f'{look}.onnx').exists(): run(look, names, log)
    print('all done', file=log, flush=True)
