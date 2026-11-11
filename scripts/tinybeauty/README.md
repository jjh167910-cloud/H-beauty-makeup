# Makeup engine files and look networks

`teacher.py` is the reference implementation of the app's makeup engine (the app runs the same
steps on the phone's graphics chip, `src/lib/makeup-gl.ts`) and builds its files:

```bash
python scripts/tinybeauty/teacher.py layers   # public/tryon/layers/*.webp + looks.json
python scripts/tinybeauty/teacher.py eyes     # public/tryon/eyes/*.png + eyes.json
python scripts/tinybeauty/teacher.py lipsticks  # the lipstick picker's calibration + glitter coordinates in looks.json
```

`teacher.paint(look, face, points, level, shade='#b3122e', finish='glitter')` renders her own lipstick pick
on top of a look, as the app's picker does.

`products.py` is the reference for her own products in the tutorial (eyeshadow, liner, blush, highlight,
contour; Kubelka-Munk pigment over her skin, finishes, per-step intensity) and builds the eyeshadow
coverage maps the app uses for placement:

```bash
python scripts/tinybeauty/products.py cov     # public/tryon/cov/*.webp + each look's eyeshadow strength in looks.json
```

`products.paint_custom(look, face, points, custom={'shadow': {'color': '#24305e', 'finish': 'matte',
'from': 'classic-smokey'}, 'gain': {'lips': 0.5}})` renders a look with her products.

`products.paint_look(look, face, points)` renders a look as the app does, with its recipe (`products.recipe(look)`: its skin's
finish, highlighter, eyeshadow finish and liner colour, from `src/data/makeup-styles.ts`). A look's freckles and
aegyo-sal (its `accents`) are drawn into its layer by `teacher.accent_layer`, and its liner's wing is kept to its tip
(`teacher.wing_zone`).

`strength.py` checks how strong each look comes out per region against its catalog photo (`catalog`, `renders DIR`),
and `strength.py sig` writes each look's signature for the look rail's order (`src/data/look-signatures.json`).

`enhance.py` exports the photo-sharpening network the app runs before painting a soft photo
(`src/lib/enhance-gl.ts`): put Real-ESRGAN's `realesr-general-x4v3.pth` and
`realesr-general-wdn-x4v3.pth` (release v0.2.5.0) in `scripts/tinybeauty/weights/` (not committed), then

```bash
python scripts/tinybeauty/enhance.py export                     # public/tryon/enhance-x4.bin (float16)
python scripts/tinybeauty/enhance.py run in.jpg out.png 0.4     # reference output, for checking the browser
```

`studio.py` is the reference of the studio light the app puts on her photo before the makeup
(`src/lib/studio-gl.ts`: white balance and richer colour, edge-aware skin smoothing, a beauty dish's
fall-off, glow, clearer eyes; the same strengths):

```bash
python scripts/tinybeauty/studio.py in.jpg out.png [points.json]   # points: the face model's 478, or found with MediaPipe
```

On phones without WebGL2 the app falls back to one tiny network per catalog look
(`public/tryon/tiny/<look>.onnx`, ~230 KB each, ~87K parameters). The rest of this folder
rebuilds those.

The approach follows TinyBeauty (Jin et al., *Toward Tiny and High-quality Facial Makeup with
Data Amplify Learning*, ECCV 2024): a strong but slow **teacher** paints a look on thousands of
faces, and a tiny U-Net learns that before → after change. Our implementation is our own code.

| Step | File | What it does |
| --- | --- | --- |
| Faces | `faces.py` | Synthetic SFHQ-T2I faces (MIT; FLUX.1-schnell / SDXL images only), FFHQ-aligned at 256 px with MediaPipe exactly like the phone, glasses/sunglasses/covered faces removed with CLIP. |
| Teacher | `teacher.py` | The catalog photo of a look divided by the bare-face catalog photo = the look's makeup layer; warped onto any face along the 468-point face mesh, plus the look's crisp liner/lash map (`public/tryon/eyes/`). |
| Network | `model.py` | TinyBeauty U-Net layout + 2 coordinate channels, no normalisation (learns in minutes on a CPU). |
| Training | `train.py` | Per look: teacher pairs → train (makeup-weighted L1 + SSIM) → validate → export fp16 ONNX. |

```bash
pip install -r scripts/tinybeauty/requirements.txt
python scripts/tinybeauty/faces.py fetch 8000 && python scripts/tinybeauty/faces.py align && python scripts/tinybeauty/faces.py filter
python scripts/tinybeauty/teacher.py eyes        # after adding/changing catalog photos
python scripts/tinybeauty/train.py all           # ~10 min per look on 2 CPU cores; resumable
```

Work files go to `.tinybeauty/` (git-ignored; set `TINYBEAUTY_WORK` to move them).

**Adding a look:** add its catalog photo to `public/makeup/looks/` as an edit of `no-makeup.webp`
(same model, same pose and light — the teacher needs that exact before/after pair) and its style
(with `lip` finish and `lipColor`) to `src/data/makeup-styles.ts`, then run `teacher.py layers`,
`teacher.py eyes` and `train.py <look-id>`.

The catalog model's head is turned, so her far eye (the left in a straight-on photo) is seen at an angle;
`teacher.symmetric()` / `eye_triangles()` paint that half with the mirror image of the near half (the same
in makeup-gl.ts). The fallback networks predate this too.

The current fallback networks were trained on the teacher before real lipstick was added (the
lips then were a sheer tint); retrain them with `train.py all` to give the fallback the new lips.
