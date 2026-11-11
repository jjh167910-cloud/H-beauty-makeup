"""Pilot on a rented GPU: which big AI image editor is the best *teacher* for the phone model?

The app stays offline. A GPU is used only for training: the best AI image editor we may use puts
each catalog look onto synthetic faces, and a small network learns to do the same on the phone.
This pilot runs the strongest candidates at full quality on a few looks x synthetic faces
(SFHQ-T2I, no real people) and makes one sheet per look, to choose before paying for the full run:

    face | phone engine today | FLUX 3 makeup only | Qwen makeup only | FLUX 3 as drawn | Qwen as drawn

Candidates (the best open models whose licences allow a salon app to use and learn from them):
  * flux3: FLUX 3 Image Klein (Black Forest Labs, Oct 2026; #3 open model for editing). FLUX Kommunity
    licence: free commercial use under US$5M yearly revenue; outputs may not train a *competing image
    model* (a makeup filter isn't one, but check the licence). Gated on Hugging Face: accept it there
    and log in on the machine (hf auth login) first. 16 steps with its prompt upsampler, as recommended.
  * qwen: Qwen-Image-Edit-2511 (Alibaba, Apache-2.0, no strings). 40 steps, true CFG 4, as recommended.
    It is slower, so it runs on fewer looks and faces.
(Fibo 2.0 and Qwen-Image-2.1 score a little higher but are research / non-commercial only.)

"Makeup only" keeps the face's own pixels and takes just the makeup from the AI result (the look /
bare log-ratio idea of teacher.make_layer), so identity, skin tone and lighting can't drift; it is
what the phone model would learn. Each result is checked: how far the AI moved the face (landmarks,
in eye widths) and how much it changed the skin colour (Lab, outside the makeup).

    python scripts/gpu/pilot.py                      # both teachers (~1.5 hours on an A100 80GB)
    python scripts/gpu/pilot.py --teachers qwen      # only one
    python scripts/gpu/pilot.py --dry-run            # no GPU: the phone engine stands in for the AI (tests the script)

Writes results/sheet_<look>.jpg, results/pairs/*.jpg, results/report.json and results.zip.
"""
from __future__ import annotations

import argparse, gc, json, sys, time, zipfile
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'scripts/tinybeauty'))
import teacher as T  # noqa: E402

LOOKS = ['soft-glam', 'hollywood', 'classic-smokey', 'persian-bride', 'electric-blue', 'cut-crease', 'clean-girl', 'glitter-party']
PROMPT = ('Apply exactly the makeup from the second image to the woman in the first image: the same eyeshadow colours '
          'and placement, eyeliner, lashes, brows, blush, contour, highlight and lipstick. Keep everything else in the '
          'first image exactly the same: her face, identity, skin tone, expression, hair, pose, lighting, background '
          'and framing. Photorealistic.')


# ------------------------------------------------------------------ the teachers
def pil(rgb):
    from PIL import Image
    return Image.fromarray(rgb)

def back(img, w, h):
    return cv2.resize(np.asarray(img.convert('RGB')), (w, h), interpolation=cv2.INTER_AREA)


class Flux3:
    """FLUX 3 Image Klein, step-distilled (16 steps, no CFG), with its prompt upsampler."""
    name, key = 'FLUX 3', 'flux3'
    REPO = 'black-forest-labs/flux-3-image-klein'
    def __init__(self):
        import torch
        from diffusers import ModularPipeline
        self.torch = torch
        try:
            pipe = ModularPipeline.from_pretrained(self.REPO)
            pipe.load_components(torch_dtype=torch.bfloat16)
            self.note = 'with prompt upsampler'
        except Exception as error:      # the upsampler is optional: encode the instruction as given
            print('FLUX 3: loading without the prompt upsampler:', repr(error)[:300], flush=True)
            blocks = ModularPipeline.from_pretrained(self.REPO).blocks
            blocks.sub_blocks.pop('prompt_upsampler', None)
            pipe = blocks.init_pipeline(self.REPO)
            pipe.load_components(torch_dtype=torch.bfloat16)
            self.note = 'without prompt upsampler'
        pipe.to('cuda')
        self.pipe = pipe

    def __call__(self, face, look, seed=0):
        h, w = face.shape[:2]
        with self.torch.inference_mode():
            images = self.pipe(prompt=PROMPT, image=[pil(face), pil(look)], height=h // 16 * 16, width=w // 16 * 16,
                               generator=self.torch.manual_seed(seed), output='images')
        return back(images[0], w, h)


class Qwen:
    """Qwen-Image-Edit-2511 at full quality: 40 steps, true CFG 4."""
    name, key = 'Qwen', 'qwen'
    REPO = 'Qwen/Qwen-Image-Edit-2511'
    def __init__(self):
        import torch
        from diffusers import QwenImageEditPlusPipeline
        self.torch = torch
        self.pipe = QwenImageEditPlusPipeline.from_pretrained(self.REPO, torch_dtype=torch.bfloat16)
        if torch.cuda.get_device_properties(0).total_memory / 2 ** 30 >= 70: self.pipe.to('cuda')
        else: self.pipe.enable_model_cpu_offload()
        self.pipe.set_progress_bar_config(disable=True)
        self.note = '40 steps, CFG 4'

    def __call__(self, face, look, seed=0):
        h, w = face.shape[:2]
        with self.torch.inference_mode():
            out = self.pipe(image=[pil(face), pil(look)], prompt=PROMPT, negative_prompt=' ', width=w // 16 * 16, height=h // 16 * 16,
                            num_inference_steps=40, true_cfg_scale=4.0, guidance_scale=1.0, generator=self.torch.manual_seed(seed)).images[0]
        return back(out, w, h)


class DryRun:
    """No GPU: the phone engine (bold) with a small shift stands in for an AI teacher, to test everything else."""
    note = 'dry run'
    def __init__(self, name, key, shift):
        self.name, self.key, self.shift, self.look = name, key, shift, None
    def __call__(self, face, look, seed=0):
        out = T.paint(self.look, face, T.landmarks3(face), 'bold')
        return cv2.warpAffine(out, np.float32([[1, 0, self.shift], [0, 1, -2]]), out.shape[1::-1], borderMode=cv2.BORDER_REFLECT)


# ------------------------------------------------------------- checks + makeup only
def skin_mask(shape, p):
    """Cheeks, forehead, chin: the face minus eyes, brows, lips and their surroundings (where makeup goes)."""
    R = T.regions(shape, p[:, :2]); m = R['skin'] * (1 - R['fine'])
    return m * T.poly_mask(shape, p[:, :2], [T.OVAL], scale=[0.85, 0.9])

def lab(rgb_u8):
    return cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2LAB).astype(np.float32) * [100 / 255, 1, 1] - [0, 128, 128]

def checks(face, out, pf, po):
    ew = T.eye_width(pf[:, :2])
    drift = float(np.linalg.norm(po[:468, :2] - pf[:468, :2], axis=1).mean() / ew) if po is not None else 9.9
    m = skin_mask(face.shape[:2], pf) > 0.5
    a, b = lab(face)[m].mean(0), lab(out)[m].mean(0)
    return {'drift': round(drift, 4), 'skin_dE': round(float(np.linalg.norm(a - b)), 2), 'skin_dL': round(float(b[0] - a[0]), 2)}

def makeup_only(face, out, pf, po, keep_tone=0.15):
    """Her own photo with only the AI's makeup: log(AI / face), aligned along the mesh, with the large-scale
    brightness and the overall tint over the skin removed (lighting, skin lightening), as teacher.make_layer."""
    H, W = face.shape[:2]
    lo_, cover = T.mesh_warp(T.lin(out), po, pf, (H, W)) if po is not None else (T.lin(out), np.ones((H, W), np.float32))
    li, bw = lo_, T.lin(face); R = T.regions((H, W), pf[:, :2]); ew = R['ew']; eps = 0.004
    def lo(x, s):
        return cv2.GaussianBlur(x * cover[..., None], (0, 0), s) / np.maximum(cv2.GaussianBlur(cover, (0, 0), s), 1e-3)[..., None]
    lr_f = np.log((lo(li, ew * 0.012) + eps) / (lo(bw, ew * 0.012) + eps))
    lr_s = np.log((lo(li, ew * 0.07) + eps) / (lo(bw, ew * 0.07) + eps))
    f = cv2.GaussianBlur(R['fine'], (0, 0), ew * 0.15)[..., None]; lr = lr_f * f + lr_s * (1 - f)
    sk = (R['skin'] * cover).astype(np.float32)
    lum = lr.mean(-1, keepdims=True); chroma = lr - lum
    big = cv2.GaussianBlur(lum[..., 0] * sk, (0, 0), ew * 1.2) / np.maximum(cv2.GaussianBlur(sk, (0, 0), ew * 1.2), 1e-3)
    lum = lum - big[..., None] * (1 - keep_tone)
    chroma = chroma - np.median(chroma[sk > 0.5], axis=0) * (1 - keep_tone)
    lr = np.clip(lum + chroma, np.log(0.06), np.log(3.0))
    inner = T.poly_mask((H, W), pf[:, :2], [T.OVAL], scale=[0.92, 0.96])
    mask = cv2.GaussianBlur(inner * cover, (0, 0), ew * 0.12)
    return T.srgb(bw * np.exp(lr * mask[..., None]))


# ------------------------------------------------------------------ sheets
def label(img, text, size=0.55):
    bar = np.full((28, img.shape[1], 3), 255, np.uint8)
    cv2.putText(bar, text, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, size, (40, 30, 40), 1, cv2.LINE_AA)
    return np.vstack([bar, img])

def face_crop(img, p, size=320):
    ew = T.eye_width(p[:, :2]); q = p[:468, :2]
    cx, cy = q[:, 0].mean(), q[:, 1].mean(); half = ew * 2.3
    x0, y0 = int(max(0, cx - half)), int(max(0, cy - half * 1.05)); x1, y1 = int(min(img.shape[1], cx + half)), int(min(img.shape[0], cy + half * 1.1))
    return cv2.resize(img[y0:y1, x0:x1], (size, int(size * (y1 - y0) / max(1, x1 - x0))), interpolation=cv2.INTER_AREA)

def save_jpg(path, rgb, q=90):
    cv2.imwrite(str(path), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])


# ------------------------------------------------------------------ main
def tile(img, text, size=320):
    return label(img, text) if img is not None else label(np.full((size, size, 3), 235, np.uint8), text)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--teachers', default='flux3,qwen')
    ap.add_argument('--faces', type=int, default=6)
    ap.add_argument('--looks', default=','.join(LOOKS))
    ap.add_argument('--slow-looks', type=int, default=4, help='looks for the slow teacher (qwen)')
    ap.add_argument('--slow-faces', type=int, default=4, help='faces for the slow teacher (qwen)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--out', default=str(HERE / 'results'))
    a = ap.parse_args()
    out = Path(a.out); (out / 'pairs').mkdir(parents=True, exist_ok=True)
    looks = a.looks.split(',')
    started = time.time()
    data = []
    for f in sorted((HERE / 'faces').glob('*.jpg'))[:a.faces]:
        u = T.rgb(f); p = T.landmarks3(u)
        if p is None: print('no face in', f.name); continue
        data.append((f.stem, u, p))
    refs = {look: T.rgb(T.LOOKS / f'{look}.webp') for look in looks}
    phone = {(look, n): T.paint(look, u, p, 'natural') for look in looks for n, u, p in data}
    report = {'teachers': {}, 'runs': []}
    results = {}                                            # (teacher, look, face) -> (as drawn, makeup only, checks)
    order = a.teachers.split(',')
    for key in order:
        rec = report['teachers'][key] = {}
        t0 = time.time()
        try:
            if a.dry_run: ai = DryRun({'flux3': 'FLUX 3', 'qwen': 'Qwen'}[key], key, 3 if key == 'flux3' else -3)
            else: ai = {'flux3': Flux3, 'qwen': Qwen}[key]()
        except Exception as error:
            rec['error'] = repr(error)[:2000]
            print(f'{key}: could not load: {rec["error"][:500]}', flush=True)
            continue
        rec.update(name=ai.name, note=ai.note, load_seconds=round(time.time() - t0))
        print(f'{ai.name} ready in {time.time() - t0:.0f}s ({ai.note})', flush=True)
        slow = key == 'qwen'
        its_looks = looks[:a.slow_looks] if slow else looks
        its_faces = data[:a.slow_faces] if slow else data
        for look in its_looks:
            for name, u, p in its_faces:
                if a.dry_run: ai.look = look
                t = time.time()
                try: o = ai(u, refs[look])
                except Exception as error:
                    print(f'{key} {look} {name}: failed {repr(error)[:300]}', flush=True); rec.setdefault('failures', []).append(repr(error)[:300]); continue
                secs = time.time() - t
                po = T.landmarks3(o); c = checks(u, o, p, po); mo = makeup_only(u, o, p, po)
                results[(key, look, name)] = (o, mo, c)
                for kind, img in (('drawn', o), ('only', mo)): save_jpg(out / 'pairs' / f'{look}_{name}_{key}_{kind}.jpg', face_crop(img, p, 640))
                report['runs'].append({'teacher': key, 'look': look, 'face': name, 'seconds': round(secs, 1), **c})
                print(f'[{len(report["runs"])}] {ai.name} {look} {name}: {secs:.1f}s  drift {c["drift"]:.3f}  skin dE {c["skin_dE"]:.1f}', flush=True)
        runs = [r for r in report['runs'] if r['teacher'] == key]
        if runs:
            rec.update(seconds_per_image=round(float(np.median([r['seconds'] for r in runs])), 1),
                       drift_median=round(float(np.median([r['drift'] for r in runs])), 4),
                       skin_dE_median=round(float(np.median([r['skin_dE'] for r in runs])), 2), images=len(runs))
        del ai; gc.collect()
        if not a.dry_run:
            import torch; torch.cuda.empty_cache()
    names = {'flux3': 'FLUX 3', 'qwen': 'Qwen'}
    for look in looks:
        rows = []
        for name, u, p in data:
            cols = [tile(face_crop(u, p), name[:2] + ' ' + name[-7:]), tile(face_crop(phone[(look, name)], p), 'phone engine now')]
            for kind, i in (('makeup only', 1), ('as drawn', 0)):
                for key in order:
                    r = results.get((key, look, name))
                    text = f'{names.get(key, key)} {kind}' + (f'  drift {r[2]["drift"]:.3f} dE {r[2]["skin_dE"]:.1f}' if r and i == 0 else '')
                    cols.append(tile(face_crop(r[i], p) if r else None, text if r else f'{names.get(key, key)}: not run'))
            h = min(c.shape[0] for c in cols); rows.append(np.hstack([c[:h] for c in cols]))
        ref = cv2.resize(refs[look], (240, int(240 * refs[look].shape[0] / refs[look].shape[1])))
        head = np.full((ref.shape[0], rows[0].shape[1], 3), 255, np.uint8); head[:, :240] = ref
        cv2.putText(head, f'look: {look}', (260, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (40, 30, 40), 2, cv2.LINE_AA)
        save_jpg(out / f'sheet_{look}.jpg', np.vstack([head] + rows), 85)
    report['gpu'] = None if a.dry_run else __import__('torch').cuda.get_device_name(0)
    report['total_minutes'] = round((time.time() - started) / 60, 1)
    json.dump(report, open(out / 'report.json', 'w'), indent=1)
    with zipfile.ZipFile(out.parent / 'results.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob('*')):
            if f.is_file(): z.write(f, f.relative_to(out.parent))
    print('done:', json.dumps(report['teachers']), '->', out.parent / 'results.zip', flush=True)


if __name__ == '__main__':
    main()
