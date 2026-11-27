# The quality benchmark

Every change to the engine is measured on the same photos, against the last accepted version, before it ships
(docs: "Systematic Quality Plan"). Nothing here runs in CI: the real faces stay on the machine that runs it.

## The photos

- **Real faces:** [MST-E](https://skintone.google/mste-dataset) (Monk Skin Tone Examples; Google and TONL, 2023): 19 people
  who consented to the release of their photos, all 10 tones of the Monk scale, taken on a phone in good and poor light.
  Its terms allow research and evaluation, not training a model: these photos only measure the engine; no recipe, gain or
  threshold is fitted to them. They are never committed, put in CI or sent to any AI service, and the report showing
  them is a private file.
- **The catalog model** (the bare catalog face, `teacher._bare()`): her catalog photos are the exact answer for every look,
  each aligned to her and with the edit's change to the whole photo (exposure, white balance, measured on the backdrop)
  taken out (`make_set.truth`): that change is not makeup, and the engine never paints it. (Until 2026-11-21 it was left
  in: a look whose photo was brightened, lilac-eyes, scored a lid 5 L* too dark where the makeup was 1.5 L* off.
  `make_set.py RUN_DIR --truth-only` makes an older run's truth again.)
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
| Placement | overlap and offset of the changed area against the catalog photo's, each eye apart | starting guesses |
| Under the lower lashes | the colour along her lower lashes against the catalog photo's (where a smoky shadow or a lower liner goes) | ΔE 3 |
| Lower waterline | the rim inside her lower lashes (redder than her eye whites, off her iris) against the catalog photo's (where kohl goes) | ΔE 3 (starting guess) |
| Another light | same look, known light change: colours against the right answer | ΔE 3 |
| Skin-tone fairness | each lipstick's hue on light, medium and deep skin | 10° |
| Skin | fine texture kept, blotches left, shading kept | 55-95% kept; shading 0.95 |
| Brows | a look's brow fill on the skin past her own brow (L* darker); on the catalog model, the brows against the catalog's | 1.5; ΔE 3 |
| Under-eye | her under-eye against her cheek below it: how much a look lifts it; on the catalog model, against the catalog's | 6; 3 L* |
| Edges | colour past the lip line; eye whites changed; newly clipped pixels; anything changed outside the face; face moved | see score.py |

The starting guesses move once the artist has scored enough pictures on the bench: each goes to where her scores drop
below 4. `history.jsonl` keeps every run's summary.

## Regression release gate (private; required for rendering changes)

**Release eligibility:** The command refuses to pass a `quick` or other partial
benchmark, even when every metric is unchanged. Use `--set looks` or `--set full`
with at least 40 distinct public catalog looks, at least two distinct
simulated lighting conditions (e.g. warm and dim), and at least two independent
original-light MST-E faces in **each** of the light, medium, and deep cohorts.
The checker now requires **finite evidence**, not just image IDs: catalog lid/lip
colour and placement, cross-light colours, texture/shading, identity drift, eye
whites, clipping, scene protection and cross-tone lipstick fairness. It verifies
measured texture, eye-white and scene-protection scores on two subjects in each
tone group. These requirements apply equally to baseline, independently repeated
baseline and candidate. A scorer failure or a missing measurement cannot silently
look like a clean no-regression result. The command is a no-regression check,
not permission to skip artist review.


After scoring the baseline, a **second unchanged baseline render** (to measure
render-to-render noise), and the candidate on the **same fixed set of photos**:

```sh
node scripts/bench/gate.mjs \
  --baseline /private/bench/baseline \
  --repeat /private/bench/baseline-repeat \
  --candidate /private/bench/candidate \
  --out /private/bench/candidate/gate.md
```

The command reads each run's `manifest.json`, `scores.jsonl`, and `summary.json`.
It hashes private input photographs and catalog-truth images locally, rejects changed pixels even when file IDs match, and exits nonzero if render identities differ, metrics disappear, or any quality metric
regresses beyond the independently measured same-code repeat noise. It evaluates
the worst tenth of results on the whole benchmark, **each look, each skin-tone
group, and each look × skin-tone combination**, including both limits of acceptable
skin texture. Derived lipstick hue fairness is checked from the scorer summary.
The Markdown report contains only look labels, skin-tone groups and aggregate
numbers—not client photos, per-person scores, or photo IDs.

**Important:** the GitHub workflow tests the gate's algorithm using synthetic
numbers only. Neither the private MST-E photos nor scored real images, nor the
run's manifest, nor its generated report are uploaded to GitHub or CI. A green
GitHub check does **not** prove a rendering change passed the real benchmark.
Run the gate locally and review its report before requesting production release.
The gate is a no-regression safeguard, not a photorealism or artist-approval
certificate. An artist blind study and the full-set release review remain necessary.

To make the repeat meaningful, render the same code and same manifest independently;
do not copy its existing score file. If a group has no valid measurements, the gate
cannot establish quality for that group, so inspect coverage before accepting it.


## Private A/B of the experimental mobile-eyelid correction (not for production)

The public-catalog source and WebGL tests are insufficient to prove realism on other
faces. The next release check requires a true matched **baseline → independently
rerendered baseline repeat → candidate** evaluation under the existing private gate.

All commands below run **only on a trusted local machine** with licensed/consented
evaluation images. Nothing in these steps sends an evaluation photo to GitHub.
Use a folder outside the repository; the example `/private/hb` is illustrative.
On Windows, substitute an appropriate absolute private path.

First, obtain and configure the MST-E evaluation dataset locally as described
above (set `MSTE_DIR` to its existing directory). Generate all 48 catalog looks
and the three benchmark runs from **one immutable input set**:

```sh
python scripts/bench/make_set.py /private/hb/seed --set looks --engines v1
python scripts/bench/clone_inputs.py /private/hb/seed /private/hb/comparison
python scripts/bench/build_eye_cap_preview.py --all --cap 0.8 --out /private/hb/eye-cap-layers
```

The last command generates a full, standalone **public-only** experimental
WebP atlas pack. It refuses wrong atlas dimensions/UVs, records checksums, and
copies unaffected shipped layers byte-for-byte. It does **not** overwrite
`public/tryon/layers`, `looks.json`, or any customer data.

Start the dev server in a second terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 4180 --strictPort
```

Render each run (repeat commands as often as required; they resume completed
frames without overwriting them):

```sh
node scripts/bench/render.cjs /private/hb/comparison/baseline --minutes 110
node scripts/bench/render.cjs /private/hb/comparison/repeat --minutes 110
node scripts/bench/render.cjs /private/hb/comparison/candidate --minutes 110 --layer-dir /private/hb/eye-cap-layers
```

The `--layer-dir` flag works on the **v1 GPU catalog renderer only**. It
intercepts only experimental atlas WebP requests before model download, refuses
missing/malformed files, and asserts every expected look was actually served
from the private candidate pack. Without it, no production texture is changed.

Score and perform the release regression check entirely locally:

```sh
python scripts/bench/score.py /private/hb/comparison/baseline --no-history
python scripts/bench/score.py /private/hb/comparison/repeat --no-history
python scripts/bench/score.py /private/hb/comparison/candidate --no-history
node scripts/bench/gate.mjs --baseline /private/hb/comparison/baseline --repeat /private/hb/comparison/repeat --candidate /private/hb/comparison/candidate --out /private/hb/comparison/candidate/gate.md
```

`--no-history` prevents this private evaluation from modifying the Git-tracked
`scripts/bench/history.jsonl`. The triplet utility verifies SHA-256 of copied
input images, manifest and catalog truth in all runs and refuses to replace any
altered or symlinked input. **Do not upload the run folders, private gate report,
score rows, or customer/evaluation photos into CI, GitHub, or a public website.**

A PASS certifies *measured no regression against the specified baseline and
repeat noise on that exact sampled dataset*, not photo-realism or professional
makeup quality. Artist-blind review, device acceptance, latency, offline cache
and rollback checks remain independent requirements. Do not ship the
experimental WebP pack merely because its public tests are green.
