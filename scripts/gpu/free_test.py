"""Free test on Kaggle (or free Colab): is FLUX 3 Image Klein, run on a free 16 GB GPU, a good enough teacher?

Runs the 3 hardest looks on 4 synthetic faces with FLUX 3 Image Klein on the free GPU, and, if a Gemini
API key is given, the same 12 with Nano Banana 2.1 (about $0.50) to compare. One sheet per look:

    face | phone engine today | FLUX 3 makeup only | Nano Banana makeup only | FLUX 3 as drawn | Nano Banana as drawn

Both get three pictures: her face, the bare catalog photo and the made-up catalog photo, so they copy
only the makeup. On the free GPU (Tesla T4, no bfloat16), FLUX 3 runs in float16 with its parts moved
on and off the GPU as needed, and without its prompt upsampler (it doesn't fit); if float16 gives
broken images it retries in bfloat16. The time per image is measured, to plan the full run.

    python scripts/gpu/free_test.py                   # env HF_TOKEN (FLUX 3 is gated), GEMINI_API_KEY (optional)
    python scripts/gpu/free_test.py --dry-run         # no GPU: the phone engine stands in for both (tests the script)

Writes test-results/ (sheets, pairs, report.json) and test-results.zip next to it.
"""
from __future__ import annotations

import argparse, gc, io, json, os, sys, time, zipfile
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pilot as P  # noqa: E402  (checks, makeup only, sheet helpers)
T = P.T

LOOKS = ['classic-smokey', 'electric-blue', 'glitter-party']
PROMPT = ('Picture 1 is a woman. Picture 2 is a model without makeup and picture 3 is the same model with a makeup look. '
          'Apply exactly that makeup (the change from picture 2 to picture 3) to the woman in picture 1: the same '
          'eyeshadow colours and placement, eyeliner, lashes, brows, blush, contour, highlight and lipstick. Keep '
          'everything else in picture 1 exactly the same: her face, identity, skin tone, expression, hair, pose, '
          'lighting, background and framing. Photorealistic.')


def fit(rgb, side):
    h, w = rgb.shape[:2]; k = min(1.0, side / max(h, w))
    return cv2.resize(rgb, (int(w * k) // 16 * 16, int(h * k) // 16 * 16), interpolation=cv2.INTER_AREA)


class Flux3Free:
    """FLUX 3 Image Klein (16 steps), float16 on a T4 with automatic offload, no prompt upsampler."""
    name, key = 'FLUX 3', 'flux3'
    REPO = 'black-forest-labs/flux-3-image-klein'

    def __init__(self, side=1024):
        import torch
        self.torch, self.side = torch, side
        cap = torch.cuda.get_device_capability(0)
        self.dtypes = [torch.bfloat16] if cap >= (8, 0) else [torch.float16, torch.bfloat16]
        self.load(self.dtypes[0])

    def load(self, dtype):
        from diffusers import ComponentsManager
        from diffusers.modular_pipelines import Flux3DistilledAutoBlocks
        if getattr(self, 'pipe', None) is not None:
            del self.pipe; gc.collect(); self.torch.cuda.empty_cache()
        cm = ComponentsManager()
        cm.enable_auto_cpu_offload(device='cuda:0')
        blocks = Flux3DistilledAutoBlocks()
        blocks.sub_blocks.pop('prompt_upsampler', None)        # ~18 GB more: doesn't fit a free GPU
        self.pipe = blocks.init_pipeline(self.REPO, components_manager=cm)
        self.pipe.load_components(torch_dtype=dtype)
        self.dtype = dtype
        self.note = f'{str(dtype).split(".")[-1]}, offload, no prompt upsampler, {self.side}px'

    def generate(self, face, bare, look):
        from PIL import Image
        f = fit(face, self.side)
        with self.torch.inference_mode():
            images = self.pipe(prompt=PROMPT, image=[Image.fromarray(f), Image.fromarray(fit(bare, 768)), Image.fromarray(fit(look, 768))],
                               height=f.shape[0], width=f.shape[1], generator=self.torch.manual_seed(0), output='images')
        return np.asarray(images[0].convert('RGB'))

    def __call__(self, face, bare, look):
        h, w = face.shape[:2]
        while True:
            out = self.generate(face, bare, look)
            if np.isfinite(out).all() and out.std() > 2: return cv2.resize(out, (w, h), interpolation=cv2.INTER_AREA)
            rest = [d for d in self.dtypes if d != self.dtype and self.dtypes.index(d) > self.dtypes.index(self.dtype)]
            if not rest: raise RuntimeError(f'blank image in {self.dtype}; this GPU is too old for FLUX 3')
            print(f'FLUX 3: blank image in {self.dtype}, retrying in {rest[0]}', flush=True)
            self.load(rest[0])


class NanoBanana:
    """Nano Banana 2.1 through the Gemini API (about $0.034 per image)."""
    name, key = 'Nano Banana', 'nano'
    MODEL = 'gemini-nano-banana-2.1'

    def __init__(self, api_key):
        from google import genai
        self.client = genai.Client(api_key=api_key)
        self.note = self.MODEL

    def __call__(self, face, bare, look):
        from PIL import Image
        from google.genai import types
        contents = [PROMPT, Image.fromarray(face), Image.fromarray(fit(bare, 1024)), Image.fromarray(fit(look, 1024))]
        try:
            r = self.client.models.generate_content(model=self.MODEL, contents=contents,
                                                    config=types.GenerateContentConfig(response_modalities=['IMAGE']))
        except Exception:      # some image models want text allowed in the reply too
            r = self.client.models.generate_content(model=self.MODEL, contents=contents)
        for part in r.candidates[0].content.parts:
            if getattr(part, 'inline_data', None) and part.inline_data.data:
                out = np.asarray(Image.open(io.BytesIO(part.inline_data.data)).convert('RGB'))
                return cv2.resize(out, face.shape[1::-1], interpolation=cv2.INTER_AREA)
        raise RuntimeError('no image in the reply: ' + (getattr(r, 'text', '') or '')[:200])


class Stand:
    """--dry-run: the phone engine (bold), slightly shifted, stands in for an AI."""
    note = 'dry run'
    def __init__(self, name, key, shift): self.name, self.key, self.shift, self.look = name, key, shift, None
    def __call__(self, face, bare, look):
        out = T.paint(self.look, face, T.landmarks3(face), 'bold')
        return cv2.warpAffine(out, np.float32([[1, 0, self.shift], [0, 1, -2]]), out.shape[1::-1], borderMode=cv2.BORDER_REFLECT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--faces', type=int, default=4)
    ap.add_argument('--looks', default=','.join(LOOKS))
    ap.add_argument('--side', type=int, default=1024)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--out', default=str(Path.cwd() / 'test-results'))
    a = ap.parse_args()
    out = Path(a.out); (out / 'pairs').mkdir(parents=True, exist_ok=True)
    looks = a.looks.split(',')
    started = time.time()
    data = []
    for f in sorted((HERE / 'faces').glob('*.jpg'))[:a.faces]:
        u = T.rgb(f); p = T.landmarks3(u)
        if p is not None: data.append((f.stem, u, p))
    bare = T.rgb(T.LOOKS / 'no-makeup.webp')
    refs = {look: T.rgb(T.LOOKS / f'{look}.webp') for look in looks}
    phone = {(look, n): T.paint(look, u, p, 'natural') for look in looks for n, u, p in data}
    report = {'teachers': {}, 'runs': []}
    results = {}
    makers = [('flux3', lambda: Stand('FLUX 3', 'flux3', 3) if a.dry_run else Flux3Free(a.side))]
    key = os.environ.get('GEMINI_API_KEY', '').strip()
    if key or a.dry_run: makers.append(('nano', lambda: Stand('Nano Banana', 'nano', -3) if a.dry_run else NanoBanana(key)))
    else: print('No GEMINI_API_KEY: skipping the Nano Banana comparison.', flush=True)
    for name_key, make in makers:
        rec = report['teachers'][name_key] = {}
        t0 = time.time()
        try: ai = make()
        except Exception as error:
            rec['error'] = repr(error)[:2000]; print(f'{name_key}: could not start: {rec["error"][:600]}', flush=True); continue
        rec.update(name=ai.name, note=ai.note, load_seconds=round(time.time() - t0))
        print(f'{ai.name} ready in {time.time() - t0:.0f}s ({ai.note})', flush=True)
        for look in looks:
            for n, u, p in data:
                if a.dry_run: ai.look = look
                t = time.time()
                try: o = ai(u, bare, refs[look])
                except Exception as error:
                    msg = repr(error)[:400]; rec.setdefault('failures', []).append(msg)
                    print(f'{ai.name} {look} {n}: failed {msg}', flush=True)
                    if 'too old' in msg: break
                    continue
                secs = time.time() - t
                po = T.landmarks3(o); c = P.checks(u, o, p, po); mo = P.makeup_only(u, o, p, po)
                results[(name_key, look, n)] = (o, mo, c)
                for kind, img in (('drawn', o), ('only', mo)): P.save_jpg(out / 'pairs' / f'{look}_{n}_{name_key}_{kind}.jpg', P.face_crop(img, p, 640))
                report['runs'].append({'teacher': name_key, 'look': look, 'face': n, 'seconds': round(secs, 1), **c})
                print(f'[{len(report["runs"])}] {ai.name} {look} {n}: {secs:.1f}s  drift {c["drift"]:.3f}  skin dE {c["skin_dE"]:.1f}', flush=True)
        runs = [r for r in report['runs'] if r['teacher'] == name_key]
        if runs:
            rec.update(seconds_per_image=round(float(np.median([r['seconds'] for r in runs])), 1), images=len(runs),
                       drift_median=round(float(np.median([r['drift'] for r in runs])), 4),
                       skin_dE_median=round(float(np.median([r['skin_dE'] for r in runs])), 2))
        if hasattr(ai, 'note'): rec['note'] = ai.note
        del ai; gc.collect()
        if not a.dry_run:
            import torch; torch.cuda.empty_cache()
    names = {'flux3': 'FLUX 3', 'nano': 'Nano Banana'}
    order = [k for k, _ in makers]
    for look in looks:
        rows = []
        for n, u, p in data:
            cols = [P.tile(P.face_crop(u, p), n[:2] + ' ' + n[-7:]), P.tile(P.face_crop(phone[(look, n)], p), 'phone engine now')]
            for kind, i in (('makeup only', 1), ('as drawn', 0)):
                for k in order:
                    r = results.get((k, look, n))
                    text = f'{names[k]} {kind}' + (f'  drift {r[2]["drift"]:.3f} dE {r[2]["skin_dE"]:.1f}' if r and i == 0 else '')
                    cols.append(P.tile(P.face_crop(r[i], p) if r else None, text if r else f'{names[k]}: not run'))
            h = min(c.shape[0] for c in cols); rows.append(np.hstack([c[:h] for c in cols]))
        ref = cv2.resize(refs[look], (240, int(240 * refs[look].shape[0] / refs[look].shape[1])))
        head = np.full((ref.shape[0], rows[0].shape[1], 3), 255, np.uint8); head[:, :240] = ref
        cv2.putText(head, f'look: {look}', (260, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (40, 30, 40), 2, cv2.LINE_AA)
        P.save_jpg(out / f'sheet_{look}.jpg', np.vstack([head] + rows), 85)
    if not a.dry_run:
        import torch; report['gpu'] = torch.cuda.get_device_name(0)
    report['total_minutes'] = round((time.time() - started) / 60, 1)
    json.dump(report, open(out / 'report.json', 'w'), indent=1)
    with zipfile.ZipFile(out.parent / 'test-results.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob('*')):
            if f.is_file(): z.write(f, f.relative_to(out.parent))
    print('ALL DONE:', json.dumps(report['teachers']), '->', out.parent / 'test-results.zip', flush=True)


if __name__ == '__main__':
    main()
