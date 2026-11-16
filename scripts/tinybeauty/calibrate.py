"""Each catalog look as strong as its catalog photo, region by region: per-look step gains for the graphics-chip engine.

    python scripts/tinybeauty/calibrate.py DIR      # DIR: strength.py renders' output (DIR/strength.json), made from the
                                                     # engine's renders of every look on the bare catalog face

The engine paints each look with LOOK_GAIN (tryon.ts) times its own gains from src/data/look-gains.json. This reads how
strong each region came out on the catalog face (the change projected on the catalog photo's, strength.py) and moves
that look's gain for the region's step towards making it 100%: by (1 / strength) ** RATE, at most STEP either way per
run, its total between LIMITS. Run, render again, measure again: two or three runs settle.

A region whose catalog change is small (under strength.FLOOR) has nothing to match; one that comes out under MIN_K (the
engine's change goes another way) isn't a matter of strength, and is left: a gain set by hand there stays (cut-crease's
lids: its light cut and dark crease in one region measure as almost nothing, and the general eyeshadow strength made its
crease black; 0.55 by eye). Lips are only ever taken down, the liner at most 1.3 (HIGH).
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import strength as ST

GAINS = Path(__file__).resolve().parents[2] / 'src/data/look-gains.json'
# region (strength.py) -> the engine's step zone whose gain carries it
STEP = {'lid': 'shadow', 'wing': 'liner', 'cheek': 'blush', 'contour': 'contour', 'lips': 'lips'}
RATE, STEP_MAX, LIMITS, MIN_K, TOL = 0.8, 1.5, (0.5, 2.0), 0.25, 0.08
# Highest per step: lips never up (a lipstick's blend past full is an extrapolation); the liner's eye detail at most 1.3
# (the wing past the outer corners measures weak mostly because a turned face's far eye is the near one's mirror image,
# and pushing the liner for it made heavy black lines)
HIGH = {'lips': 1.0, 'liner': 1.3}


def main(d: Path):
    data = json.load(open(d / 'strength.json'))
    gains = json.load(open(GAINS)) if GAINS.exists() else {}
    changed = []
    for look, g in sorted(data.items()):
        mine = gains.setdefault(look, {})
        for region, step in STEP.items():
            if region not in g['here'] or region not in g['catalog']:
                continue
            k, _, _ = ST.verdict(np.array(g['here'][region]), np.array(g['catalog'][region]))
            if k is None or k < MIN_K or abs(k - 1) <= TOL:
                continue
            m = float(np.clip((1 / k) ** RATE, 1 / STEP_MAX, STEP_MAX))
            hi = HIGH.get(step, LIMITS[1])
            new = float(np.clip(mine.get(step, 1.0) * m, LIMITS[0], hi))
            if abs(new - mine.get(step, 1.0)) > 0.01:
                changed.append(f'{look} {step}: {mine.get(step, 1.0):.2f} -> {new:.2f} ({region} {k * 100:.0f}%)')
                mine[step] = round(new, 2)
        if not mine:
            del gains[look]
    json.dump(dict(sorted(gains.items())), open(GAINS, 'w'), indent=1)
    print('\n'.join(changed) or 'nothing to change')
    print(GAINS, f'{len(changed)} changes')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__); raise SystemExit
    main(Path(sys.argv[1]))
