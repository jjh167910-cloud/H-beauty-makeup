"""Add looks to the engine's files without making the others again.

    python scripts/tinybeauty/add_looks.py wine-lips,icy      # their catalog photos are in public/makeup/looks/

For each look (its catalog photo in public/makeup/looks/ and its style in src/data/makeup-styles.ts): its layer
(public/tryon/layers/), eye map (public/tryon/eyes/) and eyeshadow coverage map (public/tryon/cov/), its entries in
looks.json and eyes.json, and its signature in src/data/look-signatures.json; the same as `teacher.py layers`,
`teacher.py eyes`, `products.py cov` and `strength.py sig` make them (they reproduce the files of the looks already
there), but the other looks' files, the lipstick calibration and the mesh stay as they are. Then bump DATA_V and
EYES_V in src/lib/tryon.ts, and fit the looks' recipes (fit_recipes.cjs).
"""
from __future__ import annotations
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import teacher as T  # noqa: E402
import products as PR  # noqa: E402
import strength as ST  # noqa: E402


def main(looks: list[str]):
    have = set(T.catalog_looks()); styles = T.styles()
    for look in looks:
        assert look in have, f'{look}: no catalog photo public/makeup/looks/{look}.webp'
        assert look in styles, f'{look}: no style("{look}", ...) in src/data/makeup-styles.ts'
    data = json.load(open(T.TRYON / 'looks.json')); eyes = json.load(open(T.TRYON / 'eyes.json'))
    sig_path = T.REPO / 'src/data/look-signatures.json'; sig = json.load(open(sig_path))
    for look in looks:
        entry = T.export_layer(look, T.TRYON / 'layers')
        entry['cov'] = PR.export_cov(look, T.TRYON / 'cov')
        data['looks'][look] = entry
        eyes[look] = T.make_eye_map(look, T.TRYON / 'eyes')
        ch = ST.catalog_change(look)
        sig[look] = [round(float(x) * w, 3) for r, w in ST.SIG_WEIGHT.items() for x in ch.get(r, [0.0, 0.0, 0.0])]
        print(look, 'added', flush=True)
    data['looks'] = dict(sorted(data['looks'].items())); eyes = dict(sorted(eyes.items())); sig = dict(sorted(sig.items()))
    json.dump(data, open(T.TRYON / 'looks.json', 'w'), separators=(',', ':'))
    json.dump(eyes, open(T.TRYON / 'eyes.json', 'w'), separators=(',', ':'))
    json.dump(sig, open(sig_path, 'w'), separators=(',', ':'))
    print('looks.json:', len(data['looks']), 'eyes.json:', len(eyes), 'signatures:', len(sig))


if __name__ == '__main__':
    if len(sys.argv) != 2: print(__doc__); raise SystemExit(2)
    main(sys.argv[1].split(','))
