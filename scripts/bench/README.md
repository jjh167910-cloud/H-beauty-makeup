# The quality benchmark

Every change to the engine is measured on the same photos, against the last accepted version, before it ships
(docs: "Systematic Quality Plan"). Nothing here runs in CI: the real faces stay on the machine that runs it.

## The photos

- **Real faces:** [MST-E](https://skintone.google/mste-dataset) (Monk Skin Tone Examples; Google and TONL, 2023): 19 people
  who consented to the release of their photos, all 10 tones of the Monk scale, taken on a phone in good and poor light.
  Its terms allow research and evaluation, not training a model: these photos only measure the engine; no recipe, gain or
  threshold is fitted to them. They are never committed, put in CI or sent to any AI service, and the report showing
  them is a private file.
- **The catalog model** (the bare catalog face, `teacher._bare()`): her catalog photos are the exact answer for every look.
- **Known light changes** (`conditions.py`): a warm bulb, window side light, a dim noisy room, a phone flash, backlight,
  heavy compression, applied in code to a real photo or the catalog face. Makeup is on the face before the light falls
  on it, so the right answer in that light is known: the look painted in her own light, put in that light.
- **Your own photos** (`--own`), kept local too.

## Running it

    MSTE_DIR=/tmp/claude-0/mste python -I scripts/bench/fetch_mste.py     # once: ~330 MB of the dataset's 5.6 GB
    python scripts/bench/make_set.py RUN --set quick [--own me.jpg]      # 58 photos (+ yours) x 8 looks x 2 engines: 928 renders
    npm run dev -- --host 127.0.0.1 --port 4180 --strictPort
    node scripts/bench/render.cjs RUN --minutes 110                      # resumable: run again until it says done
    python scripts/bench/score.py RUN [--baseline OLD_RUN] --note "what changed"
                                     # --resume: go on after a cut-off run; --rescore: score again;
                                     # --photos catalog__: only those photos again (a line measured only there)

`--set looks` takes all 48 looks on the catalog model in all seven lights and on six real faces (two light, two medium, two
deep skin) in good light: 624 renders, about 110 minutes. `--set full` takes all 48 looks and all six light changes. The quick set takes about three hours on two CPU cores
(software WebGL, about 8 to 15 s a render); split it with `--minutes`.

## What is scored

Each render against her photo as the app took it (studio light off), colours in CIEDE2000:

| Line | Measured | Target |
| --- | --- | --- |
| Catalog colour | lip, lid and cheek colour against her catalog photo, in each light | ΔE 3 (roadmap) |
| Placement | overlap and offset of the changed area against the catalog photo's | starting guesses |
| Another light | same look, known light change: colours against the right answer | ΔE 3 |
| Skin-tone fairness | each lipstick's hue on light, medium and deep skin | 10° |
| Skin | fine texture kept, blotches left, shading kept | 55-95% kept; shading 0.95 |
| Brows | a look's brow fill on the skin past her own brow (L* darker); on the catalog model, the brows against the catalog's | 1.5; ΔE 3 |
| Under-eye | her under-eye against her cheek below it: how much a look lifts it; on the catalog model, against the catalog's | 6; 3 L* |
| Edges | colour past the lip line; eye whites changed; newly clipped pixels; anything changed outside the face; face moved | see score.py |

The starting guesses move once the artist has scored enough pictures on the bench: each goes to where her scores drop
below 4. `history.jsonl` keeps every run's summary.
