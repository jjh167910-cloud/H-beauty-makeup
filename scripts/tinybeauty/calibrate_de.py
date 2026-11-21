"""Each catalog look's step gains set by colour: the gain that brings each region closest to its catalog photo
(CIEDE2000), on the bare catalog face.

    python scripts/tinybeauty/calibrate_de.py [LOOKS] [--dry] [--from=LOOK] [--steps=shadow,...] [--soft=0.05] [--mean]
      LOOKS: comma-separated (default: all); --from: go on from that look (a run cut off); --steps: only these steps;
      --soft: the softening before comparing, eye widths; --mean: compare each region's average colour, not pixel by pixel

calibrate.py moves a gain by how much of the catalog's change a region has (its change projected on the catalog's).
That is right where a step only darkens or only colours. A lid that lightens in one place and darkens in another
(a glitter lid with a deeper crease) is strengthened unevenly by the engine (finish.strengthen: all of a darkening,
LIGHTEN_GAIN of a lightening, CHROMA_GAIN of a change of hue), so pushing its gain to make up the projection overdid
its hue and its crease: glitter-party's lid went lilac at the 2.0 limit, ΔE 5.5 from its catalog photo where 1.0 gave
3.4 (benchmark, 2026-11). Here each step's gain is searched directly for the smallest colour difference in its region:
the lids (lash and liner strands left out, as score.py does), cheeks, under the cheekbones and the lips, each against
the catalog photo aligned to the bare face (as the benchmark's truth, its whole-photo grading taken out). Each region's
colour is weighted by the look's footprint (where its catalog photo changed the face, footprint()): strength.py's lid
reaches up to the brow, where a soft lid colour was diluted to almost nothing (hollywood's: ΔE 1.1 over all of it).
The comparison is pixel by pixel (both softened by SOFT eye widths), so a lid with a light middle and a dark crease is
matched in both. Whether a slightly misplaced shadow is held against a stronger one was checked: softening by up to
0.2 eye widths moved the chosen gains by under 0.15 (twenties 0.63 -> 0.76; its catalog lid, L* 39.5 where it is
darkest, is matched at 0.63 and is 4 L* darker at the old 1.72, though against the catalog's porcelain skin it reads
darker than on her own).

The engine is finish.py (paint_finished: the graphics-chip engine's v1 path, within about 1 ΔE of its renders). Only
the catalog face and its catalog photos are used: nothing from the benchmark's real faces (MST-E may not be fitted to).
A region the catalog barely changes (under FLOOR ΔE) has nothing to match and keeps its gain; a gain moves only when
that brings the region at least GAIN_TOL ΔE closer. Lips are only ever taken down (calibrate.HIGH).
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import cv2, numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent / 'bench'))
import teacher as T, finish as F, strength as ST  # noqa: E402
from calibrate import GAINS, LIMITS, HIGH  # noqa: E402

REGION = {'shadow': 'lid', 'blush': 'cheek', 'contour': 'contour', 'lips': 'lips'}
FLOOR, GAIN_TOL, ITERS, FOOT = 1.5, 0.25, 9, 8.0
PIXEL = True
SOFT = float(next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--soft=')), 0.05))


def lab(lin_rgb):
    """CIELAB (D65) of a linear-light RGB colour."""
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = M @ np.asarray(lin_rgb, np.float64) / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def de2000(a, b):
    from skimage.color import deltaE_ciede2000
    return float(deltaE_ciede2000(np.asarray(a)[None], np.asarray(b)[None])[0])


def strands(img, ew):
    """Lash and liner strands (thin lines darker than around them): score.py's Face.strands."""
    L = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)[..., 0]
    r = max(3, int(round(ew * 0.05)) | 1)
    return cv2.morphologyEx(L, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))) > 10


def footprint(bare, cat, ew):
    """Where the catalog photo changed her face (0..1): its colour difference from the bare face (CIE76, both softened
    by 0.05 eye widths, so the aligned photos' last fraction of a pixel and the edit's grain don't count) over FOOT."""
    s = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_RGB2LAB).astype(np.float32), (0, 0), max(1.0, ew * 0.05))
    a, b = s(bare), s(cat)
    d = np.linalg.norm((a - b) * np.float32([100 / 255, 1, 1]), axis=-1)
    return np.clip(d / FOOT, 0, 1)


def colours(img_u8, M, ew, w=None):
    """Each region's colour: CIELAB of its mean linear colour, weighted by `w` (the look's footprint) where given."""
    li = T.lin(img_u8); out = {}
    for step, region in REGION.items():
        m = (M[region] & ~strands(img_u8, ew) if region == 'lid' else M[region]).astype(np.float32)
        if w is not None: m = m * np.maximum(w, 0.05)
        out[step] = lab((li * m[..., None]).sum((0, 1)) / m.sum()) if m.sum() > 20 else None
    return out


def soft_lab(img_u8, ew):
    """CIELAB per pixel (float, L 0..100), softened by 0.05 eye widths like footprint()."""
    lab_ = cv2.cvtColor(cv2.GaussianBlur(img_u8.astype(np.float32) / 255, (0, 0), max(1.0, ew * SOFT)), cv2.COLOR_RGB2LAB)
    return lab_


def pixel_err(img_u8, ref_lab, ref_strands, M, ew, w, step):
    """The region's colour difference pixel by pixel (CIEDE2000 of the softened photos), weighted by the footprint: a
    lid with a light middle and a dark crease is matched in both, not only in its average."""
    from skimage.color import deltaE_ciede2000
    region = REGION[step]; m = M[region].copy()
    if region == 'lid': m &= ~(strands(img_u8, ew) | ref_strands)
    ys, xs = np.nonzero(m); k = np.maximum(w[ys, xs], 0.05)
    d = deltaE_ciede2000(soft_lab(img_u8, ew)[ys, xs], ref_lab[ys, xs])
    return float((d * k).sum() / k.sum())


def search(f, lo, hi, x0):
    """The gain in [lo, hi] (searched in log, golden section) where f is smallest, and f there; f(x0) too."""
    a, b = np.log(lo), np.log(hi); r = (np.sqrt(5) - 1) / 2
    c, d = b - r * (b - a), a + r * (b - a); fc, fd = f(np.exp(c)), f(np.exp(d))
    for _ in range(ITERS - 2):
        if fc < fd: b, d, fd = d, c, fc; c = b - r * (b - a); fc = f(np.exp(c))
        else: a, c, fc = c, d, fd; d = a + r * (b - a); fd = f(np.exp(d))
    x = float(np.exp(c if fc < fd else d))
    return x, min(fc, fd)


def main():
    from make_set import aligned, all_looks
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    global PIXEL, STEPS; PIXEL = '--mean' not in sys.argv
    STEPS = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--steps=')), None)
    looks = args[0].split(',') if args else [l for l in all_looks() if (T.LOOKS / f'{l}.webp').exists()]
    start = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--from=')), None)
    if start: looks = looks[looks.index(start):]
    bare, _ = T._bare(); p = T.landmarks3(bare); q = p[:, :2]; ew = T.eye_width(q)
    M = ST.masks(q, bare.shape[:2])
    gains = json.load(open(GAINS)) if GAINS.exists() else {}
    lines = []
    for look in looks:
        cat = aligned(T.rgb(T.LOOKS / f'{look}.webp'), bare, ew)
        cat = T.srgb(T.lin(cat) / np.exp(T.grading(look)))          # the edit's whole-photo change is not makeup
        w = footprint(bare, cat, ew)
        c0, ct = colours(bare, M, ew, w), colours(cat, M, ew, w)
        ref_lab, ref_strands = soft_lab(cat, ew), strands(cat, ew)
        st = F.prepare(look, bare, p)
        G = dict(F.look_gain(look)); mine = gains.setdefault(look, {})
        for step in REGION:
            if STEPS and step not in STEPS: continue
            if ct[step] is None or c0[step] is None or de2000(c0[step], ct[step]) < FLOOR:
                continue
            base = G.get(step, 1.0) / mine.get(step, 1.0)                  # LOOK_GAIN's part (tryon.ts), not the look's own
            def err(own, step=step):
                H = dict(G); H[step] = base * own; out = F.finish_with(st, H)
                if PIXEL: return pixel_err(out, ref_lab, ref_strands, M, ew, w, step)
                return de2000(colours(out, M, ew, w)[step], ct[step])
            now = mine.get(step, 1.0); e_now = err(now)
            best, e_best = search(err, LIMITS[0], HIGH.get(step, LIMITS[1]), now)
            best = round(best, 2)
            if e_now - e_best >= GAIN_TOL and abs(best - now) > 0.01:
                lines.append(f'{look:22s} {step:8s} {now:.2f} -> {best:.2f}   ΔE {e_now:.2f} -> {e_best:.2f}')
                mine[step] = best; G[step] = base * best
            else:
                lines.append(f'{look:22s} {step:8s} {now:.2f}   ΔE {e_now:.2f} (best {best:.2f}: {e_best:.2f})')
            print(lines[-1], flush=True)
        if not mine: del gains[look]
        if not dry:     # after each look, so a run cut off goes on with --from
            json.dump(dict(sorted(gains.items())), open(GAINS, 'w'), indent=1)
        T.layer_parts.cache_clear()     # (each look's layer is ~50 MB; all 48 kept ran the machine short)
    print(GAINS if not dry else '(dry run: nothing written)')


if __name__ == '__main__':
    main()
    import os; sys.stdout.flush(); os._exit(0)   # (mediapipe's landmarker raises in its own teardown)
