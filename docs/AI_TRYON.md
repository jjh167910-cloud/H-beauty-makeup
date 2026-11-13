# On-device makeup try-on

This site is the try-on (`src/components/tryon-page.tsx`; `?look=<id>` opens it on a look). The
customer opens a **live mirror** on her
front camera, takes a selfie or picks a photo, and the catalog look is painted on her own face,
at **soft / natural / bold** intensity («ملایم / طبیعی / پررنگ»). Everything runs inside the
phone's browser: no server, no API key, downloaded styles work offline, and no picture
leaves the phone.

## Progressive download (mobile data)

On first use only the selected style is installed, along with the shared face landmark,
occlusion segmentation and sharpening data. Estimated AI bytes: ~28 MiB with WebGL2,
~40 MiB on the ONNX fallback. All other styles are downloaded only when the customer
selects them, and are cached for offline reuse; previews never silently fetch them.
The 108 MiB high-resolution face-restoration model is offered explicitly as an
optional improvement for soft photos, not part of mandatory setup. Previously installed
HD files are reused. The HD button also offers «توقف دانلود HD»; stopping a download
cancels its active network request and keeps *fully completed files* in Cache Storage.
Reopening the HD download fetches the still-missing parts only; bytes of an interrupted
file must be retransferred because HTTP byte-range resumption is not implemented.
Large network responses are streamed directly into Cache Storage instead of being
assembled into a temporary JS array and Blob, reducing peak memory usage on mobile.
Progress counts the estimated bytes of missing files and completes only after cache writes.
Cache eviction by the browser or device can still require downloading again, so offline
support applies to files that remain stored.

## How it works

MediaPipe Face Landmarker finds the face (478 points with depth); a small face (a full-length or
group photo) is looked for in overlapping squares of the photo. A soft or small photo is first
sharpened on the phone, and her photo is lit like a studio portrait (both below). Then the makeup
engine paints the look, only where her face can be seen (hair, hands and glasses are left alone,
below). Her face shape, skin tone, hair and background stay her own (we tested FLUX.2 klein, a
4-billion-parameter image model, as an alternative: it lightened her skin and changed her face, so
it is not used).

### Sharpening soft photos (`src/lib/enhance-gl.ts`)

Selfies sent through messengers and camera frames are often soft; painted as they are, the result
looks low quality however good the makeup is. When the photo is soft around her eyes (estimated
blur above 1.3 px) or her face is small (eyes under 60 px wide), it is shrunk until it is crisp and
redrawn 4× larger by Real-ESRGAN's compact network (`realesr-general-x4v3` blended 50/50 with its
denoising twin; ~1.2M parameters, `public/tryon/enhance-x4.bin`, 2.4 MB float16), on the graphics
chip in WebGL2 (half-float texture arrays, one uniform block of weights per pass). The network's
result is mixed with the photo enlarged smoothly: 55 % of it on a small but sharp photo (alone, it
paints hair and skin like oil there), up to 85 % on a blurred one (there it brings back what the blur
took). The makeup is then painted on the sharpened photo; «وضوح بیشتر» switches back to the photo as taken. It runs on
at most 160K pixels, reports progress, and a phone that would need more than 15 s skips it (the
photo is used as it is). `scripts/tinybeauty/enhance.py` exports the weights and is the reference
(the browser output matches it to 67 dB).

### Studio light («نور و پوست استودیویی», `src/lib/studio-gl.ts`)

The catalog photos are studio portraits; her photo is usually a selfie in flat light. Side by side
the makeup was right but her picture looked poor, so her photo is retouched the way a portrait
photographer would, on the graphics chip, before the makeup (before and after alike, so the
comparison stays the makeup's alone). Every step follows her face's 478 points:

- **colour**: her skin's hue moved 30 % of the way to a warm studio hue (CIELAB 44°, at most 4°) as
  a white balance that keeps her skin's brightness; flat colour made richer (her skin by up to 25 %,
  never past chroma 30; the rest of the photo by 8 %), as a vibrance: no colour past its own or past
  her skin's own made richer;
- **skin**: frequency separation in log light. Unevenness between 0.01 and 0.06 eye widths (blotches,
  dull patches) is softened by 90 % where it is faint, and left where it is strong (an edge-aware
  shrinkage, as in wavelet denoising: the edges of her nose, lids and jaw stay crisp); finer texture
  (pores) only by 15 %, so skin never looks like plastic. Never on her eyes, brows, lips or nostrils;
- **under her eyes**: the shadow (dark circles) lifted 65 % of the way to her skin's brightness (at
  most 1.35×), its grey or violet cast moved 35 % towards her skin's colour, as a concealer would;
- **blemishes**: a small dark blob on her skin — a spot, a mark — is found by its shape (her skin's
  light curving up all round it and about as much every way, measured on the blotch-scale light; a
  crease, the edge of her nose or a fold curves one way only or much more one way) and lifted 90 % to
  the skin around it — no lighter than that skin on any side (the darkest of four opposite pairs
  around it, so her skin's slope cancels), so a blob at a shadow's edge leaves no light patch — its
  red or brown cast moved to that skin's colour, her finer texture over it kept: a retoucher's healing
  brush, automatic. Never on the base of her nose (its wings, nostrils and the shadow under them: her
  shape; healed, it left a light ghost of her nose's wing). A mole (much darker) is part of her and
  stays. On test marks most blemishes are at least halved and their sum falls under 45 %, a mole keeps
  ≥ 85 %, a crease and the shadow under her nose ≥ 90 %, her nose's shading moves by < 0.08 (log light);
- **light**: a beauty dish's fall-off over her face (along her face's own axes, from the bridge of her
  nose: its middle a little brighter, its edges a little darker, the shape a studio key light gives a
  face), a gentle contrast about her skin's own brightness, a soft shoulder (no clipped highlights),
  a soft vignette away from her face, and a glow: her highlights bloom in her skin's warmth, in
  proportion to her own light, so deep skin is not lightened. Her brightest colours stay colours: a
  channel past 0.85 (linear) is brought in towards her brightness with a soft knee, her brightness kept,
  so no channel clips (a clipped red had turned lit skin flat and pale — next to her lips, a pale line);
- **eyes**: the whites a little brighter and clearer (her irises left), her eyes, lashes, brows and
  lips crisper (on a photo already sharpened — the network, the HD face — only 30 % as much: more
  rings); her skin left soft.

It is set at a beauty app's strength, but no stronger than a photo can take: on an already smooth or
sharpened photo a stronger light (contrast 0.1, glow 0.5, beauty dish 0.45) made skin look like
plastic and features like a painting, so it is now contrast 0.07, glow 0.35, beauty dish 0.35. Yet on the test faces her skin's lightness moves by at most ±2 (CIELAB L, light and deep
skin; deep skin is not lightened), her fine texture keeps ≥ 75 %, her eyes' detail doubles. It is on by default; the chip
«نور و پوست استودیویی» under the photo (and in the live mirror) switches it off. In the live mirror it
runs on every frame, its settings re-measured every 8 frames and eased. It takes 10–40 ms on a 1–2
megapixel photo even in the test browser's software renderer. `scripts/tinybeauty/studio.py` is the
reference (the browser output matches it to 52 dB on the synthetic test faces).

### HD face (`src/lib/face-hd.ts`)

A soft or small face is redrawn in HD on the phone before the studio light and the makeup: GFPGAN
v1.4 (Tencent ARC, Apache-2.0), a face-restoration network, sees her face aligned to FFHQ's five
points at 512 × 512 (her iris centres, nose tip and mouth corners) and draws its eyes, lashes, brows,
lips and skin texture sharp. Its weights are stored as int8 per output channel
(`public/tryon/face-hd/`, 85 MB; 57–60 dB from the float32 network) and it runs in ONNX
Runtime Web on the graphics chip (WebGPU), or on four or more processor cores where the app is
cross-origin isolated; elsewhere, or past 30 s, her photo is used as it is. A phone whose page stopped
while it was running (out of memory: the browser reloads the page) doesn't try it again for a week.
Cloudflare Workers serve no file over 25 MiB, so the network is in four parts of 20.4 MiB and ONNX
Runtime's WebGPU WebAssembly (25.5 MiB) in two, joined on the phone (`gfpgan-1.4-q8.N-of-4.bin`,
`ort-wasm-simd-threaded.asyncify.N-of-2.bin`); a phone that kept them whole drops those copies.

A face network can change who she is. Only its fine detail is kept (finer than 4 pixels of the 512
face): her face's shape, tones and colours stay her photo's own (her photo + the network's fine
detail − her photo's fine detail), only on her face where it can be seen (the segmenter's face, inside
her outline grown 12 %; never a hand, hair or glasses in front of it), feathered into the rest. It
runs when her face holds less detail than the network draws (her irises' distance over the photo's
softness under 1.25× the network's) and isn't turned far; a crisp, large face is left as it is. It
is drawn on the sharpened photo (or a copy of the photo as taken), so «وضوح بیشتر» switches it off
too. On a soft test photo her eyes' fine detail grows ≥ 1.5×, her face's blurred tones move by under
3 of 255 and nothing away from her face changes. The phone downloads it with the rest (the one-time
download is 148 MB where it runs: the network and ONNX Runtime's WebGPU build).
`scripts/tinybeauty/face_hd.py` builds the weights and is the reference. Licence: GFPGAN is Apache-2.0
except third-party code it lists (NVIDIA's StyleGAN2 and DFDNet, non-commercial terms); only the
weights of its clean architecture are shipped, no code (`public/tryon/LICENSE-face-hd.txt`) — to be
checked before a commercial launch.

(An earlier version also drew foundation, eyeshadow pigment, lash strips and brow strokes as
separate products. Side by side with this engine it looked worse — waxy skin, heavy and muddy
eyes, fuzzy lashes — so it was removed.)

### Engine 1 — on the graphics chip (`src/lib/makeup-gl.ts`, phones with WebGL2)

| Step | What |
| --- | --- |
| Catalog layer | Each look photo is an edit of the bare-face portrait `no-makeup.webp`, so look ÷ bare (aligned along the face mesh, linear light, as a log-ratio) is exactly the look's makeup: eyeshadow, liner, blush, contour. Pre-computed per look (`public/tryon/layers/<look>.webp`, ~130 KB), warped onto her face along MediaPipe's 852-triangle mesh (nearer triangles in front) and multiplied onto her photo. The edit's own grading of the whole photo is taken out (measured on the backdrop), and the look's complexion goes on her foundation instead (see *Each look at its full strength*); contour, bronzer, blush and highlights stay at full strength. |
| Lipstick | Matte, satin, lined and ombre lips put down **opaque colour** — the lipstick's own colour, worked out from the look photo (what, at the finish's opacity over the bare photo's lips, gives the colour seen there) — over her own lip texture and shading (fine texture kept, broad two-tone pigment of her lips not). Gloss is a tinted gloss (70 %) plus her own sharp highlights; a lipstick that hardly changes the model's lips (a nude like her own, a clear gloss) changes hers the same way instead, with the finish's shine, and a gloss that catches the light by her lips' shape even in a selfie's flat light: a soft highlight on the fullest part of her lower lip and a smaller one on her upper lip, broken up by her lips' own lines (strongest for gloss; a little for satin, ombre, lined, metallic and glitter; none for matte). Lined lips get a slightly deeper edge; ombre lips the look photo's centre-to-edge change. |
| Matched to her photo | The colour is matched to her photo's light through the **whites of her eyes** (brightness and colour cast; the catalog's are the bare photo's, her own as in her photo before the studio retouch), and **nude shades follow her skin depth** (her skin over the catalog model's, her light taken out): a nude chosen for the catalog model becomes the same nude for her, instead of a pale lip on deeper skin. Bold colours (red, berry, coral) and deep shades (a brown, a plum) stay exact: they are pigments. |
| Eyes | The look's crisp liner and lash detail from the full-size catalog photo (`public/tryon/eyes/`), minus what her own lashes already give. |
| Her own lipstick | «رژ لب»: 17 shades (`src/data/lipsticks.ts`) and five finishes — مات / ساتن / براق / متالیک / اکلیلی — on top of any look (or the look's colour in another finish). A swatch colour becomes lipstick as the catalog photos show it: `colour = k · swatch · eye-white`, with `k` fitted on the 42 looks (their designed lip colour vs the lipstick measured in the photo), then matched to her light like the look's own. Matte covers her lips' own shine; metallic adds a soft sheen where her lips catch the light, her highlights and a fine pearl; glitter adds grains that sparkle where her lips are lit. Grains live on the bare catalog face's coordinates, warped along the mesh, so they stay on her lips in the live mirror. |
| Intensity | soft / natural / bold: (catalog layer, lipstick opacity, eye detail) = (0.6, 0.55, 0.5) / (1, 1, 0.9) / (1.35, 1.12, 1). |

**Both eyes alike.** The catalog model's head is slightly turned, so one of her eyes (the left one in
a straight-on photo) is seen at an angle and about a quarter narrower. Its makeup, stretched onto a
straight face, came out softer and with weaker liner. Since makeup is symmetric, that half of the face
is now painted with the mirror image of the near half (the catalog layer, the eye detail and the
eyeshadow placement), using the left/right landmark pairs of MediaPipe's symmetric canonical face
model (`canonical_face_model.obj`, Apache-2.0). Tested: a mirrored photo gives the mirrored result,
for the look's own makeup and for her own eyeshadow.

It runs at full photo resolution (up to 1600 px) in a fraction of a second, and on every frame of
the live mirror (painted at up to 960 px, stepping down to 800, 640 and 480 on a phone that can't keep
up; a phone far too slow skips straight to a size that is really smaller). The reference implementation is `scripts/tinybeauty/teacher.py`; the browser
engine matches it to 45–55 dB on the face.

### Each look at its full strength

The looks came out alike on her: much of what makes each one its own was taken out on the way from the
catalog photo. `scripts/tinybeauty/strength.py` measures it: per region (lids, cheeks, under the
cheekbones, lips, the face as a whole) the change the makeup makes to the region's average colour, as a
share of the catalog photo's change (projected on it: 100 % = as strong), and how much of it goes another
way. On a stock photo, median over the 42 looks, before → now: lids 61 → 81 %, cheeks 23 → 69 %, under the
cheekbones 4 → 63 %, the face as a whole −9 → 70 %, lips 54 → 99–111 % (a different face keeps its own
features, lips and light, so not every region can reach 100 %). Painted on the catalog face itself:
lids 85 %, cheeks 91 %, under the cheekbones 86 %, lips 102 %, the face 71 % (80–90 % of the complexion
goes on, and her foundation lifts the shaded side of the face).

- **The edit's grading, not the look's skin, is taken out.** Each look photo is an AI edit of the bare one,
  and besides the makeup the edit shifts the whole photo's exposure and white balance a little (up to
  ~5 %). That is measured on the backdrop — the bright, grey part of the bare photo beyond 1.35x the face's
  outline, above the chin (`grading`) — and taken out. Before, 85 % of every broad brightness change over
  the skin and of the skin's overall colour was removed, and bronzer, contour and the look's complexion
  with them.
- **The look's complexion goes on her foundation.** A porcelain twenties face, a bronzed goddess, a
  k-beauty glow: the median change over the skin (`look_tone`, at most ±30 % per colour) becomes her
  foundation's shade (`tint` in looks.json: 80 % of its brightness and 90 % of its colour, at the
  foundation's strength), on all of her face up to her outline, and blended down her neck — her body skin
  (the segmenter's) below her jaw, outside the foundation's shape (so not a hand in front of her face),
  no wider than her jaw, gone half an eye width below her chin (`neck_weight`). The layer carries the rest
  at full strength, except where her foundation doesn't go (her eyes with their brows, her lips), where it
  keeps the complexion too. Over plain skin it may darken up to 50 % and lighten up to 15 %.
- **Her foundation no longer cools every look** (its broad colour counts every part of her skin alike,
  above).
- **Eyes at their depth.** Around the eyes and lips the thin-streak closing and the hair test no longer
  apply (the segmenter took liner and lashes for hair, and a smoky edge was narrow enough to count as a
  streak). A pale or shimmer shadow may lighten the lid by up to 25 % (was 8 %).
- **Lipstick as pigment.**
  - *Her light.* The eye whites in each look photo read darker under that look's lashes, liner and shadow
    (by up to 40 %), and the studio retouch brightens hers; both made her light seem brighter and every
    lipstick paler. The catalog's light reference is now the bare photo's eye whites (in each photo's
    grading), measured without the irises in Python too (as on the phone); in studio light her eye whites
    are the ones in her own photo, in the studio's light on her skin (`studioFace`, and on each live frame).
  - *Nude depth.* A nude follows her skin's own depth — her skin over the catalog model's with her light
    taken out (the light was counted twice) — and a deep shade (under 25–45 % of the skin's brightness in
    the catalog) not at all: a deep brown or plum is a pigment.
  - *Opacity.* A lipstick's colour is what, at its finish's opacity over the bare photo's lips, gives the
    lips seen in the look photo; on her lips the look's change then shows as in the catalog. A deep shade
    over lighter lips takes more opacity (up to 0.97). Matte covers 0.95, satin, lined and metallic 0.92,
    ombre and glitter 0.9, gloss 0.7 (was 0.82–0.9, gloss 0.45). A lipstick that changes the model's lips by
    less than 3 % (fully from 15 %) changes hers the same way, her lips times its change, with the finish's
    shine (`ratio`, `pigment` in looks.json): a clear gloss stays her lips, not the model's lip colour.
- The tiny fallback networks (phones without WebGL2) were trained on the earlier teacher and still show
  the softer looks until they are trained again (`train.py`).

### Each look's recipe: what its photo can't carry

A catalog photo carries a look as a change of colour; some of what makes a look its own doesn't come
through that way: a gold lid's gleam, glitter, a blue liner (the eye detail is a darkening, so a
coloured liner turned dark grey), a dewy or a matte skin. Each style's recipe (its `FaceLook` in
`src/data/makeup-styles.ts`: skin, lid colours, liner colour, accents) adds them as products laid over
the look, through the same engine as her own products (`lookRecipe()` in `tryon.ts`, `recipe()` in
`products.py`):

| Recipe | Over the look |
| --- | --- |
| Skin `matte` / `sheer` / `dewy` / `glow` / `bronzed` | Her foundation's finish: her skin's own shine taken down or brought up (−0.6, 0, 0.7, 0.5, 0.3), at the foundation's strength. |
| Skin `glow`, `bronzed`, `dewy` (or a `shimmer` accent) | A highlighter on her cheekbones: champagne, gold or pearl (champagne for a shimmer look), its sheen 1.6 / 1.4 / 1.0 (1.0). Laid over the look's own makeup there (`over`), which stays. |
| Accent `shimmer`, `glitter` or `rhinestones` | The look's own eyeshadow gets its finish (`own`: no colour of its own, only its mica or grains, their colour halfway between the recipe's lid shade and the eyeshadow already there): shimmer (sheen 1.5), a gold lid's shimmer as a soft foil (metallic, 0.55: an orange-to-yellow hue, saturated over 0.5), glitter (1.6; an eyeshadow's glitter, any eyeshadow's, has 2.5 times as many grains as a lipstick's). Placed by the look's eyeshadow coverage map, and only where the look leaves her lid at least 30–70 % as bright as her own (not over its smoky dark). |
| `linerColor` | Her liner in that colour on her upper lid band (blue, navy, plum, brown), her lashes as they are. |

Her own picks replace the recipe's product of the same kind. The live mirror shows the look without its
recipe (those passes cost a camera frame too much); its capture, a photo try-on, has it.
`products.paint_look(look, face, points)` is the reference, and `strength.py catalog` uses it.

### Each look its own: the wing, freckles, aegyo-sal, the rail's order

The looks were still too alike on her. Part of it was lost on the way (a long liner's wing), part never
came through (freckles, aegyo-sal), and part is the catalog itself: many of its looks are natural ones,
alike by design, and the look rail showed four of them first.

- **The wing as long as in the catalog.** Wings in the catalog photos reach 1.0–1.25 eye widths from the
  eye's centre; the eye zones drawn around every face (the layer's fine zone, the eye detail's hull, the
  strand test's exception) stopped at 0.85–0.95, so the wing's tip was taken for a strand of hair, closed
  over as a thin streak on plain skin or kept to 50 % darkening. Each look's own wing is now found in its
  photo (`wing_zone` in `teacher.py`): where the photo is at least 55 % darker than the bare face
  (liner-dark: a smoky crease's lighter edge ran on into the catalog model's hair by her temple), connected
  to an eye, within 1.3 eye widths of its centre along its outer corner and 0.32 up at the tip, grown by
  0.05; there it is eye makeup. `strength.py` measures it (`wing`: past each eye's outer corner, up to 0.8
  eye widths on). Painted on the catalog face: arabic-glam 61 → 87 %, siren-eyes 76 → 92 %, full-glam
  65 → 81 %, electric-blue 70 → 76 % (the median over all looks hardly moves, 59 → 60 %: most have no wing
  that dark). On a face seen straight on a wing looks shorter than on the catalog model's turned head (her
  temple turns away), as it would in person.
- **Freckles** (sun-kissed, strawberry, boho-bride: the `freckles` accent). The catalog photos have them,
  but the layer smooths plain skin (the catalog model's pores and strands go with them). They are drawn
  into the look's layer instead (`freckles`): soft dots of 0.018–0.034 eye widths, 7–16 % darker, warm
  brown (blue darkened 1.5x, red 0.55x as much as green), over the bridge of the nose and the cheeks under
  the eyes (`freckle_field`), from a fixed seed, so they are the same on every photo and follow her face.
- **Aegyo-sal** (k-beauty, douyin: the `aegyo` accent): a lit band along each lower lid (0.12 eye widths
  below the lash line, 30 % lighter at most, a little pink) and the fold's soft line under it (0.24 below,
  10 % darker), fullest towards the middle of the eye (`aegyo`), drawn into the layer the same way.
- **The rail shows the catalog's range first.** After her look, each next look on the rail is the one most
  unlike all those before it (`variedLooks` in `makeup-styles.ts`), by each look's signature: its catalog
  photo's change on the lids, past the eyes, cheeks, under the cheekbones, lips and the face, weighted by
  how much a difference there shows (`strength.py sig` writes `src/data/look-signatures.json`). From
  Hollywood glam the rail goes on pastel, arabic glam, electric blue, the nineties, bold glam...; looks much
  alike come last.

After the layers and eye maps were made again, DATA_V is v=6 and EYES_V v=3 (the v=5 and v=2 files are
dropped from phones' caches).

### Only where her face can be seen (hair, hands, glasses)

Makeup never goes over anything in front of her face: hair falling across an eye, fringe over the
brows, sunglasses, glasses frames (her eyes behind clear lenses are made up as usual), fingers over
her lips, a hand on her cheek, a scarf, a phone.

- **What is her face.** MediaPipe's multi-class selfie segmentation (Apache-2.0; weights stored as
  float16 by `scripts/tinybeauty/fp16.py`, 8.3 MB, `public/tryon/segment.tflite`) labels a 256x256
  crop around her face (1.7x the face mesh) as background, hair, body skin, face skin, clothes or
  other. Visible = face skin, plus body skin outside her face oval (neck, ears; inside the oval it is
  a hand). The network is never quite sure (~0.92 on plain skin), so 0.1-0.8 is mapped to 0-1.
- **Sharp edges.** That map is coarse (a crop pixel is 2-5 photo pixels), so it is refined with a
  colour-guided filter (He et al., *Guided Image Filtering*, TPAMI 2013) in its fast form: the
  filter's linear models are fitted on a 512x512 grid over the crop and applied to her photo at full
  resolution, so the edge follows single hair strands and fingers. On the graphics chip: a few
  passes on the small grid; the final mix keeps her own pixels wherever she is covered.
- **Live mirror:** re-segmented at most every 150 ms (less often on a slow phone); the fitted map is
  reused in between. The tutorial reuses the photo's map for every frame. The fallback engine (no
  WebGL2) uses the coarse map.
- Reference: `scripts/tinybeauty/occlusion.py`; the graphics chip matches it to 45-54 dB along the
  map's edges and leaves covered pixels exactly as in her photo. Tested in the browser on synthetic
  faces with hair over an eye, sunglasses and fingers over the lips (`tests/fixtures/`).

### Matching her photo

- **No edges where the makeup ends.** The face model's mesh stops short of her face (mid-forehead, the
  jaw, a turned cheek), and the catalog layers used to stop short of the mesh (at 90 % of the face, where
  the catalog photo's hair and edge spoil them), so the look ended in a line with a stripe of contour
  before it. Now:
  - *In the layer files* (`make_layer`): outside the face's core the look is kept smooth (no thin light
    or dark streaks from a catalog strand of hair) and no lighter than the skin there (highlights sit
    inside), and where it was left out it is filled with its own skin-level colour from inside (smoothed
    over 0.2 eye widths, clipped to ±15 %), out to 108 % of the face's outline.
  - *On her photo* (`extend_layer`, worked out at 1/4 size): towards the mesh's edge (the feather
    weights, 0.35 eye widths, squared) the layer gives way to its skin-level colour smoothed over 0.12
    eye widths, and across the edge to the same colour smoothed over 0.6 eye widths and carried on over
    her skin around the mesh (forehead up to her hairline, the neck), fading out as the mesh gets far.
  - Its skin-level part (foundation tint, glow; |change| under ~10 %) fades to half over ~0.12 eye widths
    before the edge of her visible face (hairline, hair over her cheek); all the way, a darkened face got
    a light rim at her hair. Liner, shadow, blush and lipstick keep their full strength.
- **Foundation, all the way to her outline.** The catalog layers carried the catalog model's own foundation:
  it lightened and took the redness off *her* cheeks and under-eyes, which on another face left the middle
  of the face made up and the temples, the sides and the jaw as they were. Now:
  - *In the layer files* (`make_layer`): over plain skin, half of the lightening broader than 0.25 eye widths and
    the redness taken away (its part along red) are left out; contour, bronzer (darker), highlights and blush stay.
  - *On her photo* (`foundation()` in teacher.py, the `found` passes in makeup-gl.ts, at 1/4 size): inside
    her face's outline — her own if she moved it in «تنظیم خطوط صورت», further out by as much as her face skin
    (the segmenter's face class) goes on past it, up to 0.35 eye widths (the face model's outline often runs
    inside her cheek and temple); where her skin goes on further than 0.45 (her ear, her neck) only 0.08 —
    carried 0.8 eye widths up her forehead to her hairline and a little down onto her neck, without her
    eyes, brows and lips — her skin's colour softened over 0.05 eye widths is brought 70 % of the way to her face's broad
    colour (her skin's average colour over 0.6, every part counted alike: weighted by brightness, her lit, paler parts
    counted more and evening her out cooled all of her face, by 10 % in blue on a stock photo) at the same brightness. The averages only count her visible skin (not hair,
    nostrils or lashes), so redness and blotches even out right up to her hairline and jaw. Where her skin
    softened over 0.3 eye widths is darker than her skin's median brightness (the side of her face by her
    hair, under her jaw), it is lifted 60 % of the way in log light (from at most 1.6x below), never
    darkened, on her face skin only (not her ears or neck): the foundation covers her whole face, not just its lit middle. (Evening brightness towards the
    local average instead lit up the edge of her face in a light rim; towards her median it doesn't.) The look is painted over that; in the
    tutorial it goes on with the base step. Phones without half-float targets skip it. It has the look's complexion
    as its shade (below), blended a little down her neck.
- **No strands of the catalog model's hair.** In the catalog photos thin strands of hair fall across the
  model's temple and cheek (in the bare photo too, in other places). The look is the difference between the
  two photos, so a strand became a thin dark line on her face, from her brow's tail down her cheek. In the
  layer files (`make_layer`, `catalog_visible`) the catalog face counts only where both photos show clear
  skin: the visible-face map (hair, the ear) and, away from the eyes, brows and lips, thin dark lines
  (a Hessian ridge measure: strands the segmentation misses, creases), with 0.03 eye widths around them;
  there the look is filled from the plain skin around. Any darker streak on plain skin narrower than 0.3
  eye widths is closed over too (contour and blush are broader; liner and lashes are in the eye zone).
- **Eyes.** Nothing from the layer or the eye detail goes on her eyeballs (95 % x 80 % of the eye
  opening, a soft edge), so the lower white of the eye keeps its own edge. The catalog's liner and lash
  detail is softened to her photo's sharpness (her blur around the eye minus 0.75 px), so it doesn't look
  drawn on a soft selfie. The catalog model's own lid crease is not part of it: carried onto her lid
  (where her crease isn't), it drew a second line above her lashes. A crease is found as a thin line
  running along the lid (a Hessian valley whose normal is within 25-45° of the lid's) past the lash-line
  band (0.05-0.09 eye widths beyond the eye's opening, up to 0.35-0.45: not her brows); one the bare
  catalog face has too (warped onto the look along the mesh, spread 0.03 eye widths) is the model's and
  is left out. Lines drawn on purpose — a graphic liner, a cut crease, the 60s crease line — the bare face
  hasn't, and they stay. Lashes run across the lid and the liner lies on the lash line: both stay.
- **Concealer.** Under each eye (a soft ellipse; the far eye's fades out as she turns her head), a darker
  under-eye is lifted 60 % of the way (in log light) to her skin's median brightness, at most 1.35x; it
  never darkens. It reuses her softened grey level, so it costs the live mirror almost nothing.
- **Her own lip line.** The detected lip outline is only accurate to a few pixels, so on a 192x192 crop
  around her lips a colour model of her lips against the skin around them (Gaussians in brightness,
  red-green, green-blue; brightness counts 40 %: the light rim of her upper lip is as red as her lips
  but brighter, and is lip) decides out to 0.14 eye widths past the outline (her lips may be fuller than
  it) but only 0.015 inside it: the border of her lips (lighter, often catching the light) looks like skin
  to the colours, and left bare it showed as a pale line along the lipstick. A colour-guided filter (as for
  the visible face) fits it to her photo at full resolution: the lipstick reaches her lip line, stays off
  her skin, and its edge is as soft as her photo. The lipstick keeps 60 % of her lips' own light and shade
  (upper lip darker, lower lip lit), so it has volume. The live mirror re-measures her lip colours every
  other frame; the filter follows each frame's own edges.
- **No catalog lipstick on her skin.** The look's layer carries no lip colour: its mesh points on and inside
  the catalog lips weigh nothing (all from 0.15 eye widths past them), so there it is filled from the
  skin-level colour around, as at her face's edge. A catalog lipstick drawn past the model's lip line
  (overlined) had left its colour on her skin above her lip — with the bare lip border between, it looked
  like a moustache — and cutting the layer off at her lips instead had left a light ring.
- **Close-ups.** The face model works best when the face doesn't fill the picture, so a photo is looked
  at with a 30 % grey margin around it (a close-up selfie with the chin cut off no longer loses its lips).
- **Sharpening** shrinks a soft photo only until it is slightly soft (1.15 px) before the network draws
  it 4x larger, so it sharpens what is there instead of inventing it, and adds fine grain so skin doesn't
  look like plastic.
- Reference: `teacher.py` (`feather_weights`, `ball_keep`, `photo_blur`, `conceal_zone`, `conceal_gain`, `lip_prob`,
  `lip_mask`) and `occlusion.py` (`edge_fade`); the graphics chip matches it to 45-48 dB on a soft selfie
  and 38-43 dB on synthetic test faces.

### Turned heads and closed eyes

- **Turned head.** The look's eye detail (liner, lashes) is drawn only where no nearer part of her
  face is in front (depth-tested against the face mesh, tolerance 0.04 of the face's depth), so the
  far eye of a head in profile no longer leaves lashes on her nose. A step zone of one half of her
  face (her far cheek's blush, the far lid) stays off the other half where that is in front (a map of
  which half is in front, from the mesh).
- **Closing eyes.** When an eye closes (lid opening in 3D under 0.22 of the eye's width, nothing at
  0.12), the look's lashes fade and its liner stays: the catalog's lashes would otherwise lie on her
  closed lid as stripes. Open eyes are unchanged.
- **Face in profile.** The face model can't place the far eye of a head turned towards profile (its
  points slide onto the bridge of her nose), so that eye's makeup fades out as it narrows: its lashes
  and liner (each eye's detail scaled by its width in the photo over the other eye's: all from 0.6,
  none at 0.35) and the look's eye makeup around it (within 0.6-1.1 eye widths on the catalog face).
  A three-quarter view keeps both eyes; she can still place the far eye herself (below).
  Reference: `eye_shown`, `eye_regions`, `feather_map` in `teacher.py` (35-43 dB on heads in profile).
- Limits: the face points come from MediaPipe; on extreme poses (head thrown far back, face upside
  down) they can be off and the makeup follows them, unless she moves them (below).

### The try-on screen (`src/components/tryon.tsx`)

- **Her face on the look rail** («سبک‌ها روی چهره شما»). Once a look is on her photo, each look on the
  rail shows her own face in it, not the catalog model: a small copy of her photo around her face
  (`faceShot` in `src/lib/tryon.ts`: 240 px wide, from above her brows to below her chin) painted at
  her intensity (`paintThumb`), one look at a time in the rail's order while the phone is free
  (graphics-chip engine; not with the fallback engine, too slow, nor in «میکاپ من»). Until her picture
  is made, a look shows its catalog photo. The rail's pictures and her photo share the engine's canvas:
  a rail picture is made only while nothing else is painting, and a painting waits for the rail
  picture being made. A look's files are let go after its rail picture (only the shown look's stay),
  so memory stays as with one look.
- **Hold to see before.** The eye button on the result shows her photo without the makeup as long as
  she holds it (or Space / Enter on it); the before/after slider stays where she left it.
- **Each part's intensity** (the sliders button after «ملایم / طبیعی / پررنگ»): eyes (shadow, liner,
  lashes), skin and cheeks (foundation, concealer, contour, blush, highlight) and lips, each 0–150 %
  of the look at its level (the engine's per-step intensities, `ProductPicks.gain`). Her photo is
  repainted when she lets go of a slider (the last picture stays under the progress meanwhile, not
  her bare photo); «مثل خود سبک» puts them back. In the live mirror they apply at once.

### Her own outlines («تنظیم خطوط صورت»)

The face model's points can be off on some photos, so she can move them herself, and the app says
when it isn't sure.

- **Editor** (`src/components/tryon-outline.tsx`). Four parts: lips (12 handles on the
  lip line, 6 more on the inner line when her mouth is open), eyes (6 per eye: corners, upper and
  lower lid), brows (head, arch and tail of each) and the edge of her face (12 along it). The view
  zooms to the part. One finger always moves a point, never the photo: touching near a point
  (within a tenth of the view's width) takes it, touching anywhere else moves the point already
  taken, so her finger doesn't hide it; the point moves as far as her finger does, and a loupe shows
  it meanwhile. Two fingers (or the wheel, or +/-) zoom (up to 5x) and move the photo. The arrows under
  the photo (and arrow keys on a focused point) nudge the taken point 1.5 screen pixels at a time; the
  buttons sit under the photo, so no point is hidden behind them. A first finger always starts a new
  gesture (a lifted finger the page never heard of can't turn it into zooming), and the page keeps
  the finger's movement from the app's own scrolling when it runs inside an app.
  Sizes follow the view's width, so the editor works the same on a page shown scaled. «بازنشانی» puts
  one part back; «اعمال» repaints the look; «خودکار» (on the result) goes back to the face model's
  points.
- **How a part bends** (`src/lib/outline.ts`). A Gaussian radial-basis field through the handles'
  moves (exact at each handle) moves the part's own points fully and the face around it less with
  distance, so the mesh never folds; the other parts stay where they are. Moves are kept as shares of
  the photo's width, so they fit the photo as taken and the sharpened one. When she drew her lip line
  herself, the lipstick follows it as drawn (the automatic lip-line refinement is skipped).
- **When the app asks.** A note offers «تنظیم» when the face is in profile, when her lips hardly stand
  out from her skin (the lip colour model tells under 80 % of the lip and skin pixels near the outline
  apart: pale lips, a moustache, fingers on the mouth) or when the face is small (eyes under 20 px).
  Otherwise a quiet row under the result («میکاپ جای دقیقش نیست؟») opens the same editor.

### Tutorial engine (graphics-chip engine)

A look once had its own step-by-step tab («قدم‌به‌قدم») with a «محصول شما» product swap in each
step; both were removed (November 2026: the salon has no need for them). The engine behind them
stays: «میکاپ من» builds on it, its tutorial plays through it, and the engine tests cover it.

- **Steps in a makeup artist's order**: foundation (کرم‌پودر), concealer, brows, eyeshadow, liner,
  lashes, contour, blush, highlight, lips (`STEP_KEYS`; «میکاپ من» adds coloured lenses first).
- **Each step reveals the makeup inside its zone**, so a step-by-step playback is exactly as good as
  the try-on: with every step done it is the same picture, with none it is her photo (both tested,
  on a catalog look). Zones come from the face mesh (`stepGeometry` in `makeup-gl.ts`): under-eye
  triangles, eyelid hulls up to the brow, a band along the upper lid ending in a wing tip, cheek
  ellipses placed per blush style (apples, high, draped to the temple, across the nose, under the
  eye), contour below the cheekbone, highlight on the cheekbones / nose / cupid's bow, the lips. They
  are blurred and shared out so they add up to 1; whatever no zone covers belongs to foundation. A
  look's eye detail is split between liner (the band) and lashes (the rest).
- **Each step is animated** (`src/lib/tryon-tutor.ts`): the zone's outline appears, the tool for that
  step (sponge, brush, angled brush, pencil, liquid liner, mascara wand, fan brush, lipstick, gloss
  applicator or fingertip, drawn in the product's colour) moves the way it is used — spiralling out
  for foundation, along the lid for liner, along the brow — and the makeup appears behind it. Then
  the guide fades and the step stays on her face. Frames are painted at up to 1100 px so the
  animation stays smooth.
- How-to texts per brow, eyeshadow, liner, lash and blush style are in `src/data/makeup-steps.ts`.

### Products over a look (engine)

`paintLook` / `paintGpu` and the live mirror still take product picks (`ProductPicks`: an
eyeshadow, liner, blush, highlighter or contour of her own, and per-step intensities) laid over a
catalog look; of these the app offers only the per-step intensities (each part's intensity, on the
try-on screen above). The swaps lived in the removed tab, but their physics is what «میکاپ من» paints
with, and it stays tested. The shop's shades (17 eyeshadows with finishes مات /
شاین / متالیک / اکلیلی and placements یکدست / چین پلک / دودی / هالو / کات‌کریز / گرادیانی, 8 liners,
8 blushes with 5 placements, 5 highlighters, 4 contours) are in `src/data/products.ts`, the 17
lipsticks in `lipsticks.ts`.

- **Placement from the artists.** A swapped eyeshadow goes where the makeup artist put it in the
  catalog photo: per look, a coverage map of how thickly the lids were made up
  (`public/tryon/cov/<look>.webp`, 460 KB for all 42; liner and lashes taken out, the artist's
  gradient kept, blended out like a powder towards the brow bone so no edge shows where it ends). A
  placement (e.g. «دودی») uses the catalog look that shows that style best. Blush, contour and
  highlight use soft shapes on her face (the step zones).
- **Pigment physics.** The product is layered over her skin with the Kubelka–Munk model: her
  skin's reflectance is her photo divided by her light (the light's colour from her eye whites
  relative to the catalog photo's, its shape from her face's broad and fine shading), the
  pigment's reflectance is the swatch colour, its thickness comes from the coverage; the result is
  lit again by her light. So a navy deepens where it's packed and tints where it's thin, a light
  shade on deep skin lifts without going grey-white, and the lid's own shading stays.
- **Finishes.** Shimmer and metallic turn part of the pigment into a reflective surface tinted by
  the shade that follows her face's form (metallic exaggerates it, like foil); glitter and shimmer
  add grains that stay on her face in the live mirror; a highlighter only adds light where her
  face catches it. Her own shimmer and metallic lid shade also catch the light where her lid is
  fullest (her eyeball under it, just above the middle of her upper lid), even in a selfie's flat
  light: a luminous sheen there, as a pearly shadow shows in person.
- **Liner** in her colour replaces the look's liner on the upper lid; the lashes stay.
- **Intensities** scale each step's share of the look (and her product).
- Reference: `scripts/tinybeauty/products.py` (also builds the coverage maps); the phone engine
  matches it to 43–49 dB. With nothing swapped the picture is exactly the look's own (tested).

### Her own makeup («میکاپ من», graphics-chip engine)

A second tab next to «قبل و بعد»: her own makeup, built step by step on her bare
face, independent of the catalog looks (`src/data/my-makeup.ts`, screen
`src/components/tryon-mine.tsx`, engine `paintMine` in `src/lib/tryon.ts`). Eleven
steps in an artist's order — coloured lenses (in before any makeup), foundation, concealer, contour,
blush, highlight, brows, eyeshadow, liner, mascara/lashes, lipstick — each with:

- **Colour.** Foundation and concealer shades are relative to her own skin (هم‌رنگ پوست, روشن‌تر,
  تیره‌تر, گرم, صورتی; concealer: روشن‌کننده, هلویی for dark circles), and so is contour: as an artist
  picks a contour about two shades deeper than her, its shades are her own skin deeper (سرد, خنثی,
  گرم, تیره) or warmer and a little deeper (برنزر), and their swatches show it on her skin. The other
  products are the shop's shades (8 blushes, 5 highlighters, 7 brow colours, 17 eyeshadows, 8 liners,
  17 lipsticks).
- **Finish.** Foundation مات / طبیعی / شبنمی (her skin's own shine taken down or brought up),
  blush مات / ساتن, highlight درخشان / مرواریدی / اکلیلی, the eyeshadow and lipstick finishes.
- **Tool.** The brush's shape decides how soft and how wide the product goes on, and how much it
  lays down: e.g. a fluffy blush brush (wide, soft edge) against an angled one (defined) or cream
  with a finger (compact, stronger); a flat eyeshadow brush packs the colour (denser core, crisper
  edge), a blending brush softens it out; a liquid liner pen is crisp and opaque, a pencil soft.
- **Placement.** Blush روی گونه / بالا و کشیده / تا شقیقه / گونه و بینی / زیر چشم, contour under the
  cheekbones / full sculpt (temples and jaw too) / nose, highlight on the cheekbones / with nose and
  cupid's bow / inner corners and brow bones, concealer under the eyes (an upside-down triangle
  from just below the lash line) / and the centre of the face, the six eyeshadow placements, liner
  نازک / بال‌دار / کشیده / رو به پایین / دودی (and along the lower lash line), brows طبیعی / پرپشت /
  دقیق, lashes ریمل طبیعی / حجیم / مژه مصنوعی. Every shape follows her landmarks.
- **Amount** (0–150 %).
- **No painting with her finger.** An earlier version let her rub more of a product on, or wipe it
  off, with her finger (strokes on the face mesh, mirrored to the other side, an eraser, three
  sizes, «فقط جایی که می‌کشم»); it was removed (November 2026: the salon has no need for it). Her
  products go where their placements put them. Saved makeups from then open without their strokes,
  and a step that was only where she painted takes its first placement.
- **Zoom to look closely** (two fingers, or the mouse wheel; up to 5×): zoomed in, one finger moves
  the photo; a button returns to the whole photo. Holding the photo still shows her bare face.
- **Before and after side by side** (the compare button): her makeup left of a divider she drags,
  her bare face right of it, as in a look's «قبل و بعد»; works zoomed in too.
- **Undo and redo of everything** (60 steps, over the photo): every choice, removed step or opened
  saved makeup is one step back; dragging a slider is one step, not fifty.
- **Eyeshadow the way an artist lays it.** A lid shade, an optional second shade for the crease and
  outer corner («رنگ چین پلک و گوشه بیرونی») and an optional inner-corner light («نور گوشه چشم»).
  Her lid shade is packed on her mobile lid and blended out sheer above it; with two shades her
  placement says where the second shade goes (kept off the middle of her lid) and her lid shade is
  laid over it, so where the lid shade thins out the two blend, as a blending brush leaves it. Her
  crease is taken as two fifths of the way from her lashes to her brow, so her own lid's height sets
  how tall the lid shade is. Her lash line stays visible (the shade is pressed into the roots of her
  lashes, not painted over them). Under her eye and on her brow bone a placement's colour is only a
  whisper (smoky and halo wrap her lower lash line more).
- **Coloured lenses** («لنز رنگی»: عسلی، فندقی، سبز، طوسی، آبی، آبی یخی، بنفش), opaque («پوشاننده»:
  the lens's own printed iris — fine radial fibres, lighter mid-ring, a darker rim — in its colour,
  shaded by her lid, so it shows on dark eyes too) or natural («طبیعی»: her own iris, its hue
  changed; on light eyes). From the iris landmarks (468–477), only inside her eye's opening; her
  pupil, catchlights and the lashes over her iris stay hers; an eye whose iris landmarks are
  implausible (outside the eye, or of a size an iris can't be) gets none. The tutorial's how-to
  says to see an eye doctor and buy them from a pharmacy.

**Her own tutorial** («آموزش قدم‌به‌قدم میکاپ من»): her recipe played back on her photo step by
step, with the tutorial engine's guides and brush sweeps (`Tutor` with `mine`), drawn on
her own shapes (her concealer triangle, her contour, her blush placement, ...), each step with its
product (her shades), tool and how to do it with her choices (`mySteps()`: e.g. lid shade first,
second shade in the crease and outer V, the edge blended out, a touch of light in the inner
corner). Plays by itself (pauses to read), or step by step; holding shows the step before.

**In the live mirror** («آینه زنده با میکاپ من»): the camera shows her own makeup, its shapes
following her face as it moves; «گرفتن عکس» turns the frame into a photo and opens it in «میکاپ من»;
tapping a look switches the mirror back to looks.

How it is painted (`Mine` in `makeup-gl.ts`): the main pass runs with no catalog layer; the zone
targets carry her steps' coverage instead of a look's zones (zoneA: concealer, contour, blush,
highlight; zoneB: her liner, brows, where lashes go), drawn as polygons and softened per channel by
her tools (half-float targets where the phone has them, so soft edges fade out without 8-bit
steps). Her eyeshadow's placement is a catalog coverage map. Two-shade eyeshadow: soft spots along her mobile
lid (thinning towards the crease and the outer corner) and at her inner corners in two spare
channels of the eyeshadow coverage target say where the lid shade and the light go (the fourth:
under her eyes and her brow bones). The pigments use the same Kubelka–Munk layering and finishes as
products over a look (above), except that her eyeshadows and contour are laid as a powder and her highlight
is a capped sheen (below); at 100 % a contour, blush or highlight is a veil over its zone, not a coat of paint.

Checked on synthetic faces from light to very deep skin under warm, cool and coloured light, and
tuned so a product looks like itself on every one, measured in CIELAB against her bare photo (a test
holds the numbers on a light and a very deep face):
- *100 % is a makeup artist's full application.* After the powder model (below) made eyeshadow
  honest it had also made it faint: at 100 % a peach and bronze look hardly showed at arm's length
  (an earlier version of this round). Now 100 % lays down all of its powder (it was 70 %), the
  crease shade too (it was 75 %), and above the lid band the lid shade keeps half its density (it was
  a third): lid and crease are 80–90 % covered. A blush shows as a flush (ΔE about 12 on light skin,
  7 on very deep skin, mostly redness; it was 4–8); at 150 % it is bolder still.
- *Her light's colour* comes from her eye whites over the catalog's; light-blue and grey irises
  and their catchlights are cut out of that measurement, and the cast is capped (±8 % per channel
  before softening): eye whites are a rough white, and an over-cool estimate turned peach eyeshadow
  silver-green.
- *Eyeshadow is a powder, not a film.* Blended or sheer, fewer grains lie on her skin, each as its
  pan shows it (optical thickness 6), with her skin between them: coverage sets the share of skin
  covered (1 − e^(−3·coverage)), not the thickness of one layer. As a thin film (the first version)
  a chocolate crease filtered her skin into rust and a champagne lid stayed a grey veil, because a
  thin layer of a dark pigment passes her skin's red and a light pigment scatters back her skin's
  own colour. Her own lashes and brow hairs are kept over it. Metallic gleam is capped on a lit lid and its light a little
  paler than its body (foil, not neon).
- *Products are never lit brighter than her camera's white*, and a lit lid or cheekbone is treated
  as brighter skin as much as brighter light (at most 1.15× her skin's typical light).
- *Her light is never dimmer than her skin allows* (`mineLight`): eye whites in shadow read too dark
  (on a real phone photo the light came out at 0.47 for skin at 0.31, as if her skin reflected two
  thirds of all light), so her light is at least her skin's median over 0.38 (light skin, L* ≈ 68).
  It is also nearly neutral: 35 % of the eye whites' cast is kept (the wall behind her was neutral
  while her eye whites read cyan: their own blue and the room in them, not her light). Her lid is
  lit at least 0.75 of her face's light, her lid's folds still shading it: a lid darker than her face
  is mostly her skin's own colour there, and a primed lid shows the shade's own colour. Before
  this, a champagne lid on that photo came out khaki grey.
- *Contour shades her, it doesn't tint her.* Its grains are her own skin a few shades deeper, laid
  as a powder: it darkens by the same 5–7 L* on light and very deep skin with hardly any colour
  (|Δa*|, |Δb*| under 2.5). With the shop's fixed browns as a film it turned fair skin yellow (Δb*
  +12) and did nothing on very deep skin, where every one of them was lighter than her.
- *A highlight is a sheen, not a lamp.* At most 1.6 times as bright as her skin under it (on very
  deep skin it reached ΔE 36 before); on deeper skin its light takes on her skin's own warmth, as the
  golden highlighters made for it do, instead of a grey veil (a* −8.5, b* −4.8 before; now about
  −2, 0). Its soft veil scales down with her skin's lightness, and it sits on the top of her
  cheekbone, out towards her temple, not under her eye.
- *On deeper skin* a blush mostly tints (a stain seen through) instead of veiling in pale powder,
  and the same amount reads the same as on lighter skin.
- A numeric fix that matters for deep colours: `tanh` in the Kubelka–Munk layer is evaluated with
  its argument capped (it overflows to NaN past ~44 on some GPUs, which zeroed burgundy's green and
  blue). Foundation is the same foundation pass with
her shade (a colour gain) and finish, all over her face. Concealer lifts her
darker skin towards her skin's median (or above it, روشن‌کننده) in its colour. Brows are a thin
dark pigment that fills in between her hairs where her own brow is (her skin there darker than
her face around) and never lightens a hair. Liner is drawn from her upper lash line (thickness
growing towards the outer corner, the wing in the direction of her eye, the fox's inner corner
pulled down); lashes are the eye detail of catalog looks with lashes and at most a fine root line
(natural: no-makeup, volume: monochrome, dramatic: bronzed-goddess), kept only around her eyes.
Nothing goes on her eyeballs or inside her mouth, and nothing over hair, hands or glasses.

Her makeups are saved on her phone only (`localStorage`, with a small thumbnail of her face that
never leaves the phone); the one she's working on is kept between visits. «رزرو با این میکاپ»
shows the recipe as text to copy into her booking message, one line per step (colour, finish,
placement, tool, amount), so the artist sees what she made; her photo is not part of it. The tiny-network fallback has no «میکاپ من» (like the tutorial). There is no Python
reference for this mode yet: the pigments and foundation share their code (and reference) with
the modes above.

### Engine 2 — tiny networks (fallback without WebGL2)

One tiny network per look, following TinyBeauty (Jin et al., *Toward Tiny and High-quality Facial
Makeup with Data Amplify Learning*, ECCV 2024): ~87K parameters, ~230 KB, in ONNX Runtime Web
(WebAssembly) in a worker (`src/lib/tryon-worker.ts`), on the face aligned to 256×256; only its
change is mapped back onto her photo, plus the eye detail. Soft shows it at 60 %.

**Live mirror** (`src/lib/live-tryon.ts`): every camera frame is tracked by MediaPipe and painted
by the graphics-chip engine; her light references (eye whites, skin, lips) are re-measured every
8 frames and smoothed. Her landmarks are steadied from frame to frame (`src/lib/steady.ts`): the
tracker's points shimmer by a pixel or two even on a still face, which made a liner or a lip line
crawl. Her face's motion is split as face-tracking pipelines do: the rigid part (her head turning,
rolling, coming closer) is fitted to all 478 points at once by least squares (Umeyama) and taken as
it is, so there is no lag however fast she moves; what is left (a blink, a smile, the shimmer) goes
per point through the One Euro filter (Casiez et al., CHI 2012), a low-pass whose cut-off rises
with speed above a dead zone the size of the shimmer. On tracker-like noise a still face shimmers
3.6 times less (0.31 px instead of 1.13), a fast head turn or roll is not trailed, and a blink
still follows (all tested). With the fallback, the latest network change (in face-aligned coordinates)
is placed on each new frame and refreshed whenever the worker is free. «گرفتن عکس» turns the
current frame into a full photo try-on.

## Rebuilding the look files (offline, not in the app)

```bash
python scripts/tinybeauty/teacher.py layers   # public/tryon/layers/*.webp + looks.json (mesh, lipstick data, picker calibration)
python scripts/tinybeauty/teacher.py lipsticks  # only the lipstick picker's data in looks.json
python scripts/tinybeauty/teacher.py eyes     # public/tryon/eyes/*.png + eyes.json (then bump EYES_V in tryon.ts)
python scripts/tinybeauty/products.py cov     # public/tryon/cov/*.webp (eyeshadow placement) + strengths in looks.json
python scripts/tinybeauty/fp16.py selfie_multiclass_256x256.tflite public/tryon/segment.tflite   # the segmenter, float16
python scripts/tinybeauty/occlusion.py show photo.jpg    # where her face can be seen, next to the photo
python scripts/tinybeauty/strength.py catalog           # each look painted on the bare catalog face vs its catalog photo
python scripts/tinybeauty/strength.py renders DIR       # renders of each look on one face (DIR/<look>.png, 0_bare.png, points.json)
python scripts/tinybeauty/strength.py sig               # each look's signature for the look rail's order (src/data/look-signatures.json)
```

After `layers`, run `products.py cov` (it adds to looks.json) and bump `DATA_V` in `tryon.ts`.

Lipstick finish and the nude-or-bold decision come from each style's `lip` and `lipColor` in
`src/data/makeup-styles.ts`; the colour itself is measured from the look photo. The tiny fallback
networks are trained by `scripts/tinybeauty/train.py` (see its README).

## Offline and privacy

- «آماده‌سازی هوش مصنوعی» downloads once into Cache Storage `hb-ai-models-v2`: ~36 MB with the
  graphics-chip engine (MediaPipe 17 MB, face segmentation 8.3 MB, 42 look layers 4.7 MB, sharpening
  network 2.4 MB, eye detail 1 MB, look data 0.8 MB, look-rail photos 2 MB), plus 112 MB where the HD
  face runs (its network 85 MB, ONNX Runtime's WebGPU build 27 MB), ~53 MB with the fallback
  (ONNX Runtime 14 MB and 42 networks 10 MB instead of the layers and the sharpening network). Files of
  the other engine are removed from the cache. Phones that already downloaded the earlier files only
  fetch the segmentation network. When the look data is made again (`DATA_V` in `tryon.ts`), phones that
  have it fetch the new layers, coverage maps and looks.json (about 5 MB) and drop the old ones.
- `public/sw.js` serves every `/tryon/` request from that cache; app releases never delete it, and
  files of earlier engines (`hb-ai-models-v1`, the 52 MB EleGANt download) are removed.
- MediaPipe Tasks reports usage statistics to Google once a minute; the app refuses that one
  address before any request is made. `public/_headers` also limits network connections to the
  app's own server (`Content-Security-Policy: connect-src 'self'`).
- `public/_headers` enables cross-origin isolation so ONNX Runtime can use several CPU cores.

## Licences

- Makeup engine, look layers and lipstick data: our own code, made from the salon's own catalog photos.
- Fallback look networks: trained by us (own code) on teacher output for synthetic faces from
  SFHQ-T2I (MIT licence; only FLUX.1-schnell / SDXL images, whose outputs may be used commercially).
- Sharpening network: Real-ESRGAN `realesr-general-x4v3` / `realesr-general-wdn-x4v3` weights,
  © 2021 Xintao Wang, BSD 3-Clause (the notice must stay with the weights; see `public/tryon/LICENSE-enhance.txt`).
- HD face network: GFPGAN v1.4 weights (Tencent ARC; Apache-2.0 except listed third-party code with
  non-commercial terms, see above and `public/tryon/LICENSE-face-hd.txt`), ONNX export by FaceFusion.
- ONNX Runtime Web: MIT. MediaPipe (face landmarks, multi-class selfie segmentation): Apache 2.0.
  CLIP (only to filter training faces): MIT.
- Test photos (`tests/fixtures/`): synthetic faces from SFHQ-T2I (MIT), made with FLUX.1-schnell (Apache-2.0).
- TinyBeauty's paper is the method reference; its code and weights are not used.
