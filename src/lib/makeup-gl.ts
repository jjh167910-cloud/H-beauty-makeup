/*
 * The makeup engine on the phone's graphics chip (WebGL2). It does the same steps as the
 * reference teacher (scripts/tinybeauty/teacher.py), at full photo resolution and fast enough
 * for every camera frame of the live mirror:
 *
 * 1. Catalog layer: the look's makeup (look photo / bare photo, a log-ratio pre-computed per
 *    look) is warped onto her face along MediaPipe's 852-triangle face mesh, nearer triangles
 *    in front, and multiplied onto her photo in linear light.
 * 2. Lipstick: matte / satin / lined / ombre lips get opaque colour (measured from the look
 *    photo) over her own lip texture and shading; gloss is a sheer tint with her own
 *    highlights. The colour is matched to her photo's light through the whites of her eyes,
 *    and nude shades follow her skin depth.
 * 3. Eyes: the look's crisp liner and lash detail, minus what her own lashes already give.
 * 4. Intensity: soft / natural / bold.
 * 5. Her own lipstick (the picker): any shade and finish instead of the look's. Metallic adds a
 *    soft sheen where her lips catch the light plus a fine pearl; glitter adds grains that catch
 *    the light. Grains live on the bare catalog face's coordinates (warped along the mesh), so they
 *    stay on her lips as she moves in the live mirror.
 * 6. Only where her face can be seen: a segmentation network (visibility(), in tryon.ts) marks
 *    her face skin; refined on the graphics chip with a colour-guided filter, it keeps every bit
 *    of makeup off hair, hands, glasses frames, sunglasses and anything else in front of her face
 *    (occlusion.py is the reference).
 * Everything else stays her own pixels.
 */
import type { Pt } from "./tryon";

export type Level = "soft" | "natural" | "bold";
/** (catalog layer, lipstick opacity, eye detail), as LEVELS in teacher.py. */
export const LEVELS: Record<Level, [number, number, number]> = { soft: [0.6, 0.55, 0.5], natural: [1, 1, 0.9], bold: [1.35, 1.12, 1] };

export type LipInfo = {
  colour: number[]; sclera: number[] | null; skin: number | null; ombre: number[];
  finish: string; alpha: number; gamma: number; shine: number; nude: number;
  /** A lipstick that hardly changes the model's lips changes hers the same way: the change, and how much its own colour
   * counts instead (1: all; look_lips in teacher.py). */
  ratio?: number[]; pigment?: number;
};
/** Lipstick finishes she can pick. */
export type Finish = "matte" | "satin" | "gloss" | "metallic" | "glitter";
/** Her lipstick pick: a shade (swatch hex) and/or a finish over the look's lipstick; null = the look's. */
export type LipChoice = { shade: string | null; finish: Finish | null };
/** How a swatch looks as lipstick in the catalog photos' light (swatch_calibration in teacher.py). */
export type Swatch = { k: number; sclera: number[]; skin: number };
/** The bare catalog face's points (pixels) and eye width: glitter and pearl grains live on them. */
export type Canon = { ew: number; pts: number[] };
/** (opacity, her lip texture kept, gloss shine) per finish, as FINISH in teacher.py. */
export const FINISH: Record<string, [number, number, number]> = {
  matte: [0.95, 0.75, 0], satin: [0.92, 0.9, 0.15], lined: [0.92, 0.85, 0.05], gloss: [0.7, 1, 1],
  ombre: [0.9, 0.9, 0.2], metallic: [0.92, 0.85, 0], glitter: [0.9, 0.9, 0.1],
};
const GLITTER_CELL = 0.02, GLITTER_DENSITY = 0.3, PEARL = 0.55, PEARL_DENSITY = 0.6, MATTE_SHINE = 0.3;
/** An eyeshadow's glitter: share of grain cells with a grain (denser than a lipstick's; SHADOW_GLITTER in products.py). */
const SHADOW_GLITTER = 0.75;
/**
 * Her own eyeshadow's mica (shimmer, metallic): how strongly its fine grains (the pearl's) sparkle over her lid, as a
 * share of the lid's own brightness, where her lid is unlit (more where it catches the light). The lid between the
 * grains is a little darker, by half as much, so its colour holds on average (darkened as much, the shimmer lids came
 * out 0.8 to 1.4 L* darker than without it).
 */
const MICA = [0, 2.4, 1.9];
/** A look's own eyeshadow finish goes on where the look leaves her lid this bright (of her own) or more, not over its smoky dark. */
const OWN_LIGHT = [0.3, 0.7];
/**
 * A lipstick's gloss catches the light by her lips' shape, even in a selfie's flat light: a soft highlight on the
 * fullest part of her lower lip and a smaller one on her upper lip, broken up by her lips' own lines. Its strength per
 * finish (matte none).
 */
const LIP_GLOSS: Record<string, number> = { gloss: 0.55, satin: 0.14, ombre: 0.1, lined: 0.08, metallic: 0.1, glitter: 0.08 };
/** Her own shimmer and metallic eyeshadow catch the light where her lid is fullest (her eyeball under it): how much. */
const LID_SHEEN = 0.45, LID_GLOW = 0.6;
/** Her products: shading blur widths (form, broad light) and the blush's softness, in eye widths (products.py). */
const SHADE_SIGMA = [0.025, 0.22], BLUSH_SOFT = 0.16, REFLECT_BASE = 0.8;
/** An eyeshadow packed on (its placement's `deep`, SHADOW_DEEP in tryon.ts) at most this share of `deep` deeper than its pan. */
const PIG_DEEPEN = 0.5;
/** Her own eyeshadow: her lid lit at least this much of her face's light (her lid's folds still shading it). */
const MINE_LID_FORM = 0.75;
/** Her own eyeshadow's powder: how fast its grains cover her skin as her coverage builds (per unit of thickness). */
const MINE_POWDER = 0.6;
/** Her contour's powder: how fast its grains cover her skin as her coverage builds. */
const MINE_CONTOUR_POWDER = 1.6;
/** Her highlight: at most this much brighter than her skin under it (0.6: 1.6 times as bright). */
const MINE_GLOW_MAX = 0.6;
/**
 * A highlighter is her own skin glowing instead of its pale or gold light on her where a full layer of it would change
 * her skin's colour this much (hueShift: from-to): deep, rich skin, where it would be a grey, ashen or khaki patch.
 * Then: how much of its light in flat light (all of it where she is lit or her face catches the light; less as her
 * shade deepens), the gold it turns at its brightest (a factor on her colour, of luminance 1), and how much softer her
 * colour is there (its log-ratios scaled down: a lit sheen, not a deeper orange).
 */
const GLOW_SHIFT = [0.1, 0.3], GLOW_SHADE = 0.8, GLOW_GOLD = "vec3(1.06, 1.0, 0.85)", GLOW_SOFT = 0.15;
/** Her crease shade: always blended out, so at most this much of its powder stays where she laid it. */
const MINE_CREASE = 1;
/** Her own eyeshadow by her lash line: how far her lash line reaches from her eye's opening (eye widths), how much of it stays. */
const MINE_LASH_LINE = 0.035, MINE_LASH_KEEP = 0.6;
/** Her own makeup: products lit at most this much brighter than her skin's typical light; her own lashes and hairs over them (how much). */
const MINE_FORM_MAX = 1.15, MINE_HAIR = 0.85;
/** Around her eyes, her lashes: from this share of her skin's brightness down they are all hair (to the second: none). */
const MINE_LASH_DARK = [0.12, 0.3];
/** Her contour and blush on the deepest skin: this much more product for the same amount. */
const MINE_DEEP_RICH = 2.4;
/**
 * Freckles (a freckle pen, dotted on): her skin times this colour where one is fully on (a warm brown of her own skin,
 * as a freckle is), and how soft their edges are (eye widths: dots, not a smudge).
 */
const FRECKLE_TINT = [0.7, 0.58, 0.5], FRECKLE_SOFT = 0.006;
/**
 * Her inner-corner and aegyo light: as strong as her eyeshadow's amount within these (a look whose eyeshadow is a
 * whisper still has its aegyo-sal lit; a bold one doesn't make it a white stripe).
 */
const MINE_LIGHT_GAIN = ["0.6", "1.2"];
/**
 * Rhinestones (stones): three crystals in a line up and out from her outer eye corner, as the wing goes: how far out
 * along it each sits and its radius (eye widths), the line's angle up from straight out (degrees), and how much brighter
 * than a white under her light a crystal's lit facets are.
 */
const STONES = [[0.03, 0.032], [0.145, 0.048], [0.26, 0.032]], STONE_TILT = 40, STONE_LIGHT = 1.25;
/**
 * The foundation's shade down her neck (neck_weight in teacher.py): from TINT_NECK[0] to [1] eye widths above her chin
 * (along her face's down) coming in, gone by [2] below it.
 */
const TINT_NECK = [-0.7, -0.4, 0.5];
/** Fairest skin relative to the catalog model's (who is fair): bounds how dim her light can be. */
const FAIREST = 1.15;
/**
 * And the deepest: the catalog model's skin reflects at most this many times the light the deepest skin does. Bounds how
 * bright her light can be: in a dim, moody photo her eye whites still read bright (catchlights, glossy eyes), and her
 * light taken from them alone turned every dark lipstick bright red on her (on the synthetic faces 7 % read so, by
 * 1.3x at the median, nearly all deep skin or a dim room). At 8, a very deep skin's own makeup lost its warmth (her
 * skin then read paler than it is, and a blush on it became a pale veil).
 */
const DEEPEST = 12;
/**
 * A nude shade's brightness over the skin's (in the catalog) below which it is a pigment (a deep brown, a plum): it no
 * longer follows her skin's depth; by NUDE_DEEP[1] it fully does (nude_deep in teacher.py).
 */
const NUDE_DEEP = [0.25, 0.45];

/**
 * Her visible face (occlusion.py): the segmenter's face-skin and body-skin probabilities (r, g bytes;
 * VIS_SEG x VIS_SEG) on a square crop around her face (`box`: x0, y0, side in photo pixels).
 */
export type Visibility = { probs: Uint8Array; box: [number, number, number] };
export const VIS_SEG = 256;
/** The guided filter's grid over the crop, its window (grid pixels) and regularisation; the crop's size; the oval's softness (eye widths). */
const VIS_GRID = 512, GUIDE_SIGMA = 2.4, GUIDE_EPS = 2e-3, VIS_CROP = 1.7, OVAL_SOFT = 0.12;
/** The look's skin-level layer fades out over about this far (eye widths) before her visible face's edge (edge_fade in occlusion.py). */
const EDGE_SOFT = 0.12;
/** The segmenter's probability -> visible (it is never sure: ~0.92 on plain face skin). */
const VIS_LO = 0.1, VIS_HI = 0.8;
/**
 * Eye detail behind a nearer part of her face (the nose of a turned head) is hidden: depth tolerance in
 * the mesh's depth units (1.8 = the face's whole depth). A closing eye keeps its liner, its lashes fade
 * (they would lie on the lid): lid opening (3D, over the eye's width) from OPEN_LO (none) to OPEN_HI (all).
 * As EYE_DEPTH_TOL, OPEN_LO / OPEN_HI in teacher.py.
 */
const EYE_DEPTH_TOL = 0.04, OPEN_LO = 0.12, OPEN_HI = 0.22;
/**
 * The look at the edge of the face mesh (extend_layer in teacher.py). The face model's mesh stops short of her face
 * (mid-forehead, the jaw, a turned cheek), and near its edge the catalog layer carries the catalog photo's own edge
 * (light and dark streaks). So towards the edge (the feather weights, squared) the layer gives way to its own smoothed
 * skin-level colour (clipped to EXTEND_T, normalized convolution over EXTEND_IN eye widths), which across the edge gives
 * way to the same colour smoothed over EXTEND eye widths and carried on over her skin around the mesh, fading out as the
 * mesh gets far. No makeup stops in a line. Worked out at 1/EXTEND_SCALE of the size.
 */
const EXTEND = 0.6, EXTEND_IN = 0.12, EXTEND_T = 0.15, EXTEND_SCALE = 4;
/** An eye seen from the side (its width in the photo over the other eye's) has its detail fade out (eye_shown in teacher.py). */
const SHOWN_LO = 0.35, SHOWN_HI = 0.6;
/**
 * As in teacher.py: the eyeball as a share of the eye opening (no layer or eye detail inside it) and its edge's
 * softness (eye widths); how far inside her face's outline the look's layer fades in (bare-face eye widths); how much
 * of her lips' own light and shade the lipstick keeps; the lip refinement's grid, window (eye widths) and regularisation.
 */
const BALL_SCALE = [0.95, 0.8], BALL_SOFT = 0.015, FEATHER = 0.35, LIP_VOLUME = 0.6;
/**
 * Kohl on her lower waterline (water_mask in teacher.py). The rim between her eyeball and her lower lash roots lies inside
 * her eye's contour, where the face mesh has no triangles: the layer never reached it, and her waterline stayed pink under
 * a smoky eye whose catalog photo has it 3 to 6 times darker. Each look's own change there (looks.json `water`: inner,
 * middle and outer parts of the rim, WATER_T) goes on a band WATER_BAND eye widths up from her lower contour (at most
 * WATER_OPEN of her eye's opening there, and WATER_OUT below it, onto her lash roots), off her irises and her eye whites
 * (WATER_WHITE: at least this share of their light and redder by less than this), its edges WATER_SOFT soft. Her own
 * makeup's kohl («میکاپ من»: Mine.liner.kohl) goes on the same band, in her liner's colour.
 */
const WATER_BAND = 0.03, WATER_OPEN = 0.35, WATER_OUT = 0.006, WATER_SOFT = 0.006;
const WATER_WHITE = [[0.45, 0.75], [0.02, 0.06]], WATER_T = [0.35, 0.6];
/**
 * Her own kohl on that band (Mine.liner.kohl), as a soft kohl pencil lies on the wet rim in the catalog photos: its edges
 * `soft` times softer again below, `out` eye widths further onto her lower lash roots and smudged on down from there
 * (`smudge`: gone by this many eye widths below her lower lid, at most this share of the rim's), on under her irises too
 * (the rim runs on in front of them: in the lower `under` of the band there), fading in over her inner corner (`inner`:
 * shares of the way along her lower lid). Laid as the look's own change is, it came out a crisp black stripe from her
 * inner corner that stopped at her iris.
 */
const KOHL_RIM = { soft: 2.0, out: 0.006, under: 0.25, inner: [0.0, 0.08], smudge: [0.04, 0.5] };
/** Her lower lids' contours, inner corner first (LOWER_LIDS in teacher.py). */
const LOWER_LIDS = [[133, 155, 154, 153, 145, 144, 163, 7, 33], [362, 382, 381, 380, 374, 373, 390, 249, 263]];
/**
 * Her camera's lens. Makeup is on her face before the photo is taken, so on a soft photo it is as soft as everything else
 * (painting the soft photo = the lens over the painting of a sharp one): the look's layer, eye detail and liner go through
 * the part of her photo's blur they don't already have. The catalog photos' own softness around the eyes is CATALOG_BLUR
 * px at their eye width (photo_blur in teacher.py: 0.58-0.73), larger or smaller as the look is warped onto her eyes, at
 * least LENS_OWN px; Gaussian widths add in squares. Below LENS_MIN px nothing is softened.
 */
const CATALOG_BLUR = 0.68, LENS_OWN = 0.5, LENS_MIN = 0.3;
/** The eye detail darkens her photo at most to this share of its light (the 0.15 of apply_eyes in teacher.py). */
const EYE_FLOOR = 0.15;
/**
 * Her camera's white (shoulder() in teacher.py): where the makeup brightens a channel past SHOULDER[0] (linear) it rolls
 * off towards SHOULDER[1] instead of clipping, the other channels with it in proportion (her skin's hue kept: per channel
 * a lit highlight turned greyish), never below her own pixel there. A highlighter or blush on a lit cheek,
 * a bright lid, a gloss kept their texture instead of a flat patch at 255 (every look clipped somewhere on the test faces).
 */
const SHOULDER = [0.8, 0.995];
/**
 * A look's lightening stays off her lashes and brow hairs (hair_light() in teacher.py): where she is HAIR_LIGHT[0..1]
 * darker than right around her (fine scale), up to HAIR_LIGHT[2] of it is left off. A pale lid shade goes on her skin
 * under them; it no longer turned a deep lash line's lashes into pale specks.
 */
const HAIR_LIGHT = [0.15, 0.45, 0.9];
/** ...and off her upper lash line (the liner band, zoneB.g), and so does its eyeshadow's finish (a shimmer's mica on her
 * own lashes between the look's lashes read as pale specks along a deep lash line). */
const LASH_BAND_LIGHT = 1.0;
/** A look's own eyeshadow finish: how lit her lid's form may read for its gleam (OWN_GLEAM in products.py). */
const OWN_GLEAM = 1.25;
/** An eyeshadow over a look stays off her lash line itself: where she, softened a little, is this much of her broad light
 * or less (SHADOW_LASH in products.py), fading in by the second. */
const SHADOW_LASH = [0.45, 0.8];
/**
 * A look's layer darkens her at most towards LAYER_FLOOR of her own light (layer_floor() in teacher.py): its brightness
 * softly, its change of hue kept, then each channel held above it by a sharp knee (FLOOR_KNEE). A pigment still reflects
 * a few percent of the light, so a saturated blue lid keeps a little red in it instead of a channel at 0 (and its
 * shading with it). Rolled off channel by channel, as it was, a vivid lid lost its colour: a blue lid's red and green,
 * darkened most, were held back most, and it came out greyer.
 */
const LAYER_FLOOR = 0.04, FLOOR_KNEE = 4;
/** shoulder(): her camera's white (SHOULDER), in the foundation and main passes; never below her own pixel (own). */
const SHOULDER_GLSL = `vec3 shoulder(vec3 c, vec3 own) {
  float m = max(c.r, max(c.g, c.b));
  if (m <= ${SHOULDER[0]}) return c;
  // (its brightest channel rolls off and the others with it in proportion: her skin's hue kept, not greyed)
  float s = ${SHOULDER[0]} + ${(SHOULDER[1] - SHOULDER[0]).toFixed(3)} * (1.0 - exp(-(m - ${SHOULDER[0]}) / ${(SHOULDER[1] - SHOULDER[0]).toFixed(3)}));
  return max(c * (s / m), min(c, own));
}`;
/** The lens (Gaussian sigma, px) the look still needs on a photo of blur `blur` whose eye width is `ew` (lens_sigma in teacher.py). */
export function lensSigma(blur: number, ew: number, canonEw?: number): number {
  const own = Math.max(LENS_OWN, canonEw ? (CATALOG_BLUR * ew) / canonEw : 0.75);
  return Math.sqrt(Math.max(0, blur * blur - own * own));
}
/**
 * Her lips' own light and shade go into the lipstick only inside her lip line (her lips' share of the 0.02-eye-width
 * neighbourhood, from-to); a shine follows her lips' shape smoothly, and her lips' fine lines only this much.
 */
const LIP_INSIDE = [0.55, 0.9], LIP_KNEE = 1.25, LIP_KNEE_SLOPE = 0.1, LIP_GLOSS_OWN = 0.5, GLOSS_FLAT = 0.3;
/**
 * The look's layer carries no lip colour: its mesh points on and inside the catalog lips (and closer than LIP_FILL[0]
 * eye widths past them, all from LIP_FILL[1]) weigh nothing, so there the layer is filled from the skin-level colour
 * around (the extension). A catalog lipstick drawn past the model's lip line (overlined) otherwise left its colour on her
 * skin above her lip, like a moustache's shadow; cut off at her lips instead, it left a light ring. Her lipstick is
 * painted over it from her own lip line.
 */
const LIP_FILL = [0.05, 0.15];
/** Concealer (conceal_gain in teacher.py): how far a darker under-eye is lifted towards her skin's typical brightness, and at most how much. */
const CONCEAL = 0.6, CONCEAL_MAX = 1.35;
/**
 * A look's concealer (every catalog look): her under-eye lifted towards the brightness of her cheek just below it (her own
 * light there, so it never turns into a pale patch), this share of the way in log light and at most CONCEAL_LOOK_MAX
 * times; her lashes and the fine lines of her lids, darker than the skin around, stay as they are (by CONCEAL_HAIR); and
 * its grey, brown or violet cast moved this share towards her skin's own colour, as a peach-toned concealer does.
 * Where it is measured: her cheek under each eye (CONCEAL_REF: eye widths down, out; its radius), the upper-middle of
 * its brightness (a quantile: not the shadow of a crease, nor shine).
 */
const CONCEAL_LOOK = 0.85, CONCEAL_LOOK_MAX = 2.2, CONCEAL_HAIR = 0.8, CONCEAL_TONE = 0.6;
/**
 * Its colour shows as far as it covers: where it lifts her by CONCEAL_TONE_FULL (log light) or more, all of CONCEAL_TONE;
 * where it doesn't lift her, her hollow keeps its own colour. Moved everywhere in its zone, her under-eye came out
 * greyer than her cheek on most faces (a shadow keeps its colour; the same tint at less light is less colourful), a grey
 * crescent once the hollow kept its shading (benchmark, 2026-11). As finish.py.
 */
const CONCEAL_TONE_FULL = 0.25;
/**
 * And it gives way under the look's own shadow (the layer darkening her): by as much as the shadow darkens her, all of it
 * once the shadow takes CONCEAL_UNDER off her light (log). A smoky look's shadow along the lower lashes went on over
 * the concealer's lift and came out 4 to 6 L* lighter than its catalog photo, which has none under it (benchmark, 2026-11).
 * As finish.py.
 */
const CONCEAL_UNDER = 0.25;
const CONCEAL_REF = [0.85, 0.1, 0.18], CONCEAL_Q = 0.6;
/**
 * Her eye's hollow keeps its own shading: only what is darker than CONCEAL_SHADE of her cheek's brightness below is lifted
 * (a dark circle, not the hollow). Lifted all the way to her cheek, it took out 17 of the catalog model's 18 L* between
 * her under-eye and her cheek where every catalog photo keeps them (to within -6..+3.5), and painted a pale crescent
 * under each eye with every dark speck (her pores) lifted away (benchmark, 2026-11); at 0.45 the catalog model's
 * hollow keeps all but its darkest creases. As finish.py.
 */
const CONCEAL_SHADE = 0.45;
/**
 * Its zone: the concealer ellipse (uConC, uConAx) this much wider and taller, full to CONCEAL_ZONE[2] of its radius and
 * gone by [3] (it only lifts what is darker than her cheek, so it can reach past the whole shadow: a smaller zone left a
 * dark arc where it stopped); her lashes are kept only near her lash line (from CONCEAL_LASH[0] to [1] eye widths below
 * her eye's middle), further down every dark speck is lifted like the skin around it.
 */
const CONCEAL_ZONE = [1.1, 1.45, 0.55, 1.3], CONCEAL_LASH = [0.2, 0.32];
/** A region of a look made stronger (its step gain over 1): of the extra, this share goes to what lightens, and this to its change of hue. */
const LIGHTEN_GAIN = 0.35, CHROMA_GAIN = 0.5;
/** Her brow hairs are the darkest BROW_HAIR_Q of her brows' outline (measureFace). */
const BROW_HAIR_Q = 0.3;
/**
 * A look's brows are carved: just under each brow (the brow zone, BROW_CARVE[0] eye widths further up her face, less
 * the zone itself) her skin is brought up this much (log light, BROW_CARVE[1]) by a concealer under the brow, which
 * gives the brow a clean lower edge; never her hairs.
 */
const BROW_CARVE = [0.07, 0.12];
/**
 * A look's brows go only where her own brow is: her skin, softened past single hairs (uGrey.y), darker than her broad
 * skin around (uShadeB) by BROW_MASS[0] to [1] of it; inside the face mesh's brow outline, BROW_ZONE[0] its size and
 * BROW_ZONE[1] eye widths soft. The outline alone drew a brow of its own: the mesh's brows sit a few hundredths of an eye
 * width off hers, and the fill, strongest on bare skin (the widest gap between hairs), painted a flat block under her
 * brow's tail, a hard edge, and on a sparse brow a grey box (benchmark on real faces, 2026-11). As finish.py.
 */
const BROW_ZONE = [1.2, 0.06], BROW_MASS = [0.12, 0.35];
/** A look's concealer per look: lighter on the barest looks. */
const CONCEAL_LIGHT: Record<string, number> = { "no-makeup": 0.5, "clean-girl": 0.7 };
/* Her foundation (foundation() in teacher.py): her skin's colour evened out everywhere inside her face's outline, right up
 * to it. How much of her uneven colour it covers; her skin's colour softened over FOUND_NEAR eye widths brought towards it
 * softened over FOUND_WIDE; the shape (up her forehead, down onto her neck, past her outline, its edge's softness, eye
 * widths); darker than FOUND_DARK of her skin isn't skin. */
const FOUND_COLOUR = 0.45, FOUND_NEAR = 0.05, FOUND_WIDE = 0.6;     // (FOUND_COLOUR: as teacher.py, and why)
/* Her skin in shade (the side of her face by her hair, under her jaw) lifted towards her skin's median brightness, never
 * darkened: how much (in log light), from at most how far below, her brightness softened over FOUND_WIDE_L eye widths. */
const FOUND_LIGHT = 0.6, FOUND_LIFT = 1.6, FOUND_WIDE_L = 0.3, FOUND_FACE = [0.6, 0.95];
/** Her face skin going on further past her outline than FOUND_REACH eye widths is her ear or neck: then only FOUND_NEAR_OUT. */
const FOUND_REACH = 0.45, FOUND_NEAR_OUT = 0.08;
const FOUND_UP = 0.8, FOUND_DOWN = 0.1, FOUND_OUT = 0.35, FOUND_SOFT = 0.1, FOUND_DARK = [0.2, 0.4];
/* Its coverage: a foundation's pigment covers her skin's own colour, so blotches of brightness and colour (redness, a
 * brown patch, dull spots) fade, while her face's shape (light and shade change her brightness, not her colour) and her
 * skin's fine texture (pores, finer than FOUND_FINE eye widths) stay. Her brightness softened over FOUND_FINE over it
 * softened over FOUND_MID is evened out by COVER_LIGHT x the coverage where the difference is faint, less where it is
 * strong (COVER_T in log light: a fold, the side of her nose; darker ones keep at least COVER_DARK of it: a mark is
 * covered); her colour softened over FOUND_FINE is brought COVER_COLOUR x the coverage of the way to it softened over
 * FOUND_NEAR (finer redness than the broad evening above). The coverage is the foundation's strength (a sheer veil
 * 0.55, a brush's matte 1.2), at most COVER_MAX. */
const FOUND_FINE = 0.02, FOUND_MID = 0.1, COVER_LIGHT = 0.85, COVER_COLOUR = 0.8, COVER_T = 0.08, COVER_DARK = 0.35, COVER_MAX = 0.9;
/* And her finer texture (her light over it softened over FOUND_FINE: pores, fine lines) a little softer, COVER_PORE x the
 * coverage where faint (COVER_PORE_T in log light: a nostril, a lash's shadow, a mole stay); a foundation fills it in, it
 * doesn't blur it away. Its finish's shine follows her skin softened over FOUND_FINE, not each pore's highlight (a dewy
 * finish made every pore glint: her texture came out stronger than before her makeup). */
const COVER_PORE = 0.45, COVER_PORE_T = 0.12;
/** It covers skin: a pixel darker than FOUND_DARK of her skin around it (a strand of hair, a lash) isn't, and its blotches
 * are no more than COVER_BAND in log light (past it is her face's shape or her hairline's shadow). */
const COVER_BAND = 0.4;
/**
 * And her skin perfected (MakeupGL.skin: her photo with only the studio retouch's skin, tryon.ts skinRetouch: faint
 * blotches softened, pores a little, blemishes healed, the shadow under her eyes lifted) brought in by the coverage
 * over RETOUCH_FULL: a foundation, a concealer and powder do that, so it is part of the after, not of her photo (her photo
 * before is in the studio's light only). A sheer veil brings in about three quarters of it, a fuller one all of it.
 */
const RETOUCH_FULL = 0.75;
export const LIP_GRID = 192;
const LIP_SIGMA = 0.025, LIP_EPS = 1e-3;
/** A dark photo's lips are fitted as if their crop were this bright, at most this many times brighter (LIP_LEVEL in tryon.ts). */
const LIP_LEVEL = 0.35, LIP_GAIN_MAX = 6;
/** Her lips refined (lip_prob in teacher.py): the probability on a LIP_GRID x LIP_GRID crop (`box`: x0, y0, side). */
/** Her lips on a square crop (box: x, y, side): lip probability, and how clearly her lips stood out from her skin (0.5-1). */
export type LipGrid = { p: Uint8Array; box: [number, number, number]; clarity?: number; level?: number };

const feathers = new WeakMap<Canon, Float32Array>();
const eyeAreas = new WeakMap<Canon, [Float32Array, Float32Array]>();
/** Around an eye (eye widths from its centre on the bare catalog face): all of it, then none (EYE_AROUND in teacher.py). */
const EYE_AROUND = [0.6, 1.1];

/** Per mesh point, how much it lies around each eye (image-left eye, the other): eye_regions in teacher.py. */
export function meshEyes(canon: Canon): [Float32Array, Float32Array] {
  let g = eyeAreas.get(canon);
  if (g) return g;
  const n = canon.pts.length / 2;
  const around = (eye: number[]) => {
    const cx = eye.reduce((s, i) => s + canon.pts[i * 2], 0) / eye.length, cy = eye.reduce((s, i) => s + canon.pts[i * 2 + 1], 0) / eye.length;
    const out = new Float32Array(478).fill(1);
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (Math.hypot(canon.pts[i * 2] - cx, canon.pts[i * 2 + 1] - cy) / canon.ew - EYE_AROUND[0]) / (EYE_AROUND[1] - EYE_AROUND[0])));
      out[i] = 1 - t * t * (3 - 2 * t);
    }
    return out;
  };
  g = [around(EYE_R), around(EYE_L)];
  eyeAreas.set(canon, g);
  return g;
}
/**
 * How much of the look's layer each mesh point carries: 0 on her face's outline, 1 from FEATHER inside it, so the
 * layer never ends in a line on her cheek (distances on the bare catalog face; feather_weights in teacher.py).
 */
export function meshFeather(canon: Canon): Float32Array {
  let w = feathers.get(canon);
  if (w) return w;
  const n = canon.pts.length / 2, q = (i: number) => [canon.pts[i * 2], canon.pts[i * 2 + 1]];
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = q(i);
    let best = Infinity;
    OVAL.forEach((a, k) => {
      const [ax, ay] = q(a), [bx, by] = q(OVAL[(k + 1) % OVAL.length]);
      const abx = bx - ax, aby = by - ay, t = Math.min(1, Math.max(0, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby)));
      best = Math.min(best, Math.hypot(x - ax - abx * t, y - ay - aby * t));
    });
    d[i] = best;
  }
  w = new Float32Array(478).fill(1);
  const lips = LIPS_OUT.map(q);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, Math.max(d[i], d[MIRROR[i]]) / (FEATHER * canon.ew)));
    // (and how far outside the catalog lips: none on or inside them)
    const [x, y] = q(i);
    let best = Infinity, inside = false;
    lips.forEach(([ax, ay], k) => {
      const [bx, by] = lips[(k + 1) % lips.length], abx = bx - ax, aby = by - ay;
      const s = Math.min(1, Math.max(0, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby)));
      best = Math.min(best, Math.hypot(x - ax - abx * s, y - ay - aby * s));
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    });
    const l = inside ? 0 : Math.min(1, Math.max(0, (best / canon.ew - LIP_FILL[0]) / (LIP_FILL[1] - LIP_FILL[0])));
    w[i] = t * t * (3 - 2 * t) * l * l * (3 - 2 * l);
  }
  feathers.set(canon, w);
  return w;
}

/** How much of the look's lashes each eye keeps (image-left eye of a straight-on photo, the other): lash_keep in teacher.py. */
export function lashKeep(P: Pt[]): [number, number] {
  const d = (a: number, b: number) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1], P[a][2] - P[b][2]);
  const open = (ups: number[], lows: number[], a: number, b: number) => ups.reduce((s, u, i) => s + d(u, lows[i]), 0) / ups.length / Math.max(d(a, b), 1e-6);
  const k = (x: number) => { const t = Math.min(1, Math.max(0, (x - OPEN_LO) / (OPEN_HI - OPEN_LO))); return t * t * (3 - 2 * t); };
  return [k(open([160, 159, 158], [144, 145, 153], 33, 133)), k(open([387, 386, 385], [373, 374, 380], 263, 362))];
}

/**
 * How much of each eye's detail is drawn (image-left eye of a straight-on photo, the other): all, except the far eye
 * of a head turned towards profile, whose points slide onto the bridge of her nose. eye_shown in teacher.py.
 */
export function eyeShown(P: Pt[]): [number, number] {
  const wr = Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]), wl = Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1]);
  const k = (w: number) => { const t = Math.min(1, Math.max(0, (w / Math.max(wr, wl, 1e-6) - SHOWN_LO) / (SHOWN_HI - SHOWN_LO))); return t * t * (3 - 2 * t); };
  return [k(wr), k(wl)];
}

/** The square crop around her face the segmenter sees (crop_box in occlusion.py). */
export function visCrop(P: Pt[]): [number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 468; i++) {
    x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); y0 = Math.min(y0, P[i][1]); y1 = Math.max(y1, P[i][1]);
  }
  const side = Math.max(x1 - x0, y1 - y0) * VIS_CROP;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - (y1 - y0) * 0.05;
  return [cx - side / 2, cy - side / 2, side];
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** 1 for nude / brown / soft-pink shades (they follow her skin depth), 0 for bold colours (nude_weight in teacher.py). */
export function nudeWeight(hex: string): number {
  const c = hexRgb(hex), max = Math.max(...c), min = Math.min(...c);
  return Math.min(1, Math.max(0, (0.66 - (max - min) / Math.max(max, 1)) / 0.24));
}

/** The look's lipstick, or her pick on top of it (lip_choice in teacher.py). */
export function lipChoice(lip: LipInfo, choice: LipChoice | null | undefined, swatch: Swatch): LipInfo {
  if (!choice || (!choice.shade && !choice.finish)) return lip;
  const out: LipInfo = { ...lip };
  if (choice.shade) {
    const c = hexRgb(choice.shade).map((v) => (v / 255) ** 2.2);
    Object.assign(out, {
      colour: c.map((v, i) => swatch.k * v * swatch.sclera[i]), sclera: swatch.sclera, skin: swatch.skin,
      ombre: [1, 1, 1], nude: nudeWeight(choice.shade), finish: choice.finish ?? "satin", ratio: [1, 1, 1], pigment: 1,
    });
  }
  if (choice.finish) out.finish = choice.finish;
  [out.alpha, out.gamma, out.shine] = FINISH[out.finish] ?? FINISH.satin;
  return out;
}
export type EyeFiles = { ids: number[]; pts: number[]; tris: number[]; w: number; h: number; map: Uint8Array };
/** A look's files: its layer's mesh coordinates, lipstick, layer, eye map, and its foundation's shade (look_tint in teacher.py). */
export type LookFiles = {
  id: string; uv: number[]; lip: LipInfo; layer: ImageBitmap; eyes: EyeFiles | null; tint?: number[];
  /** Its change on the lower waterline (log RGB): inner, middle, outer (water_profile in teacher.py). */
  water?: number[][];
};
/** Light and colour references measured on her photo (see measureFace). */
/** Her light references, and how soft her photo is around the eyes (`blur`: Gaussian sigma in pixels, photoBlur in tryon.ts). */
export type FaceStats = {
  sclera: number[] | null; skin: number | null; lipRef: number | null; blur?: number | null;
  /** Her cheek's brightness just under each eye (image-left eye, the other; linear), for the concealer. */
  under?: [number, number] | null;
  /** Her skin's colour (linear, over its luminance), for the concealer's tone. */
  tone?: number[] | null;
  /** Her brow hairs' colour (linear): the darker part of her brows, for a look's brow product. */
  brow?: number[] | null;
};

export const LIPS_OUT = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const LIPS_IN = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/**
 * Each landmark's mirror image across the face, and its half (-1: the side of point 33, the left of a
 * straight-on photo; 0: the midline; 1: the other side): from MediaPipe's canonical face model
 * (canonical_face_model.obj, Apache-2.0), which is symmetric. As MIRROR / HALF in teacher.py.
 */
const MIRROR = [0,1,2,248,4,5,6,249,8,9,10,11,12,13,14,15,16,17,18,19,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,281,282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,94,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,341,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,358,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376,377,378,379,151,152,380,381,382,383,384,385,386,387,388,389,390,164,391,392,393,168,394,395,396,397,398,399,175,400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,195,419,197,420,199,200,421,422,423,424,425,426,427,428,429,430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,450,451,452,453,454,455,456,457,458,459,460,461,462,463,464,465,466,467,3,7,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,153,154,155,156,157,158,159,160,161,162,163,165,166,167,169,170,171,172,173,174,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,196,198,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247];
const HALF = [0,0,0,-1,0,0,0,-1,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,0,-1,0,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
/** An eye this much narrower than the other in a catalog photo is seen at an angle (NARROW in teacher.py). */
const NARROW = 0.88;

/**
 * The half of a catalog photo's face turned away from the camera (-1 or 1; 0 if neither): from its
 * landmarks as texture coordinates (uv) in a w x h file. That half is painted with the mirror image of
 * the near half, which the camera saw straight on (far_half / symmetric in teacher.py).
 */
function farHalf(uv: number[], w: number, h: number): number {
  const d = (a: number, b: number) => Math.hypot((uv[a * 2] - uv[b * 2]) * w, (uv[a * 2 + 1] - uv[b * 2 + 1]) * h);
  const r = d(33, 133), l = d(263, 362);
  return r < NARROW * l ? -1 : l < NARROW * r ? 1 : 0;
}
/** The landmark whose texture coordinates paint landmark i (its mirror on the far half). */
const sourceOf = (i: number, far: number) => (far && i < 468 && HALF[i] === far ? MIRROR[i] : i);

export const eyeWidth = (P: Pt[]) =>
  (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;

/** Polygon of landmarks, optionally scaled about its own centre per axis (as poly_mask in teacher.py). */
function ring(P: Pt[], ids: number[], sx = 1, sy = sx): [number, number][] {
  let cx = 0, cy = 0;
  for (const i of ids) { cx += P[i][0] / ids.length; cy += P[i][1] / ids.length; }
  return ids.map((i) => [cx + (P[i][0] - cx) * sx, cy + (P[i][1] - cy) * sy]);
}

/**
 * Her lower contours as the waterline's band takes them (water_points in teacher.py): per eye its 9 points (pixels), each
 * one's position along the contour (0 at the inner corner) and the band's height there (px), ordered so that each
 * segment's left normal points into her eye.
 */
export function waterPoints(P: Pt[]): Float32Array {
  const ew = eyeWidth(P), out: number[] = [];
  [[EYE_R, LOWER_LIDS[0]], [EYE_L, LOWER_LIDS[1]]].forEach(([ring, low]) => {
    const q = low.map((i) => [P[i][0], P[i][1]]), s = [0];
    for (let i = 1; i < q.length; i++) s.push(s[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
    const len = Math.max(s[s.length - 1], 1e-6), up = ring.filter((i) => !low.includes(i));
    const h = q.map((x) => Math.min(WATER_BAND * ew, WATER_OPEN * Math.min(...up.map((i) => Math.hypot(P[i][0] - x[0], P[i][1] - x[1])))));
    let cx = 0, cy = 0;
    for (const i of ring) { cx += P[i][0] / ring.length; cy += P[i][1] / ring.length; }
    const a = q[3], b = q[5], n = [-(b[1] - a[1]), b[0] - a[0]];
    const flip = (cx - (a[0] + b[0]) / 2) * n[0] + (cy - (a[1] + b[1]) / 2) * n[1] < 0;
    const k = q.map((_, i) => (flip ? q.length - 1 - i : i));
    for (const i of k) out.push(q[i][0], q[i][1], s[i] / len, h[i]);
  });
  return new Float32Array(out);
}

/* ------------------------------------------------------- step-by-step mode */

/**
 * The guided tutorial shows a look going on step by step, in a makeup artist's order. Every step
 * reveals the *real* look (the catalog layer, the eye detail, the lipstick) inside that step's face
 * zone, so the last step is exactly the normal try-on. Zones are polygons from her landmarks; the
 * layer is split between them as a partition of unity (what no zone covers belongs to the base step).
 */
export const STEP_KEYS = ["base", "conceal", "brows", "shadow", "liner", "lashes", "contour", "blush", "glow", "lips", "lenses"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export type Poly = [number, number][];
/** How a step's brush moves: 0 out from A (radius |AB|), 1 from A to B, 2 from A out both ways (half length |AB|). */
export type Sweep = { mode: 0 | 1 | 2; axes: Array<[[number, number], [number, number]]> };
export type StepGeo = {
  polys: Poly[];
  sweep: Sweep;
  /** For drawing the guide, when not `polys`. */
  outline?: Poly[];
  /** The tool's path on each side, when it follows a curve rather than the sweep's straight axis. */
  paths?: Poly[];
  /** Each polygon's half of her face (-1: the half of point 33, 1: the other, 0 / missing: across the midline). */
  sides?: number[];
  /** Each polygon's value (missing: 1); drawn in order, a later polygon replaces an earlier one where they overlap. */
  values?: number[];
};
/** How much of each step is on her face (0..1), and the step being applied now with its progress. */
export type StepState = {
  done: Record<StepKey, number>;
  active?: { key: StepKey; t: number };
  blush: string;
  /** Steps this look doesn't have: their part of the look goes on with the base (set their `done` to the base's). */
  follow?: StepKey[];
};

/* ------------------------------------------------------ her own products */

/**
 * Her own products over a look ("build your own", reference: scripts/tinybeauty/products.py): a
 * swapped product keeps the artist's placement and changes what it is made of. Pigments are layered
 * over her skin with Kubelka-Munk (her reflectance = her photo / her light, the pigment's reflectance
 * = the swatch colour, thickness from the coverage), then lit again; finishes add grains or sheen.
 */
/**
 * A product: its colour (linear reflectance), thickness at full coverage, how much deeper it gets packed on, how
 * reflective its finish is, and the finish (0 matte .. 4 glow). `over`: laid over the look's own makeup there (else it
 * replaces it); `own`: no layer of its own, only its finish (mica, grains) over the colour already there (the look's
 * own eyeshadow, from its recipe).
 */
export type Pigment = { color: number[]; thick: number; deep: number; sheen: number; finish: number; over?: boolean; own?: boolean };
export type Products = {
  /** Her light: a white surface on her face (linear), see productLight. */
  white: number[];
  /** Eyeshadow, placed by a catalog look's coverage map (its own or a style's template). */
  shadow?: Pigment & { cov?: { id: string; image: ImageBitmap; uv: number[] } };
  contour?: Pigment;
  /** Blush in one of the placements (apples, high, draped, nose, under). */
  blush?: Pigment & { style: string };
  glow?: Pigment;
  /** Liner colour (linear reflectance). */
  liner?: number[];
  /** Each step's intensity (1 = as the look). */
  gain?: Partial<Record<StepKey, number>>;
  /**
   * The catalog look's own layer, eye detail and lipstick made this much stronger per step zone (its calibration to its
   * catalog photo, see LOOK_GAIN in tryon.ts); unlike `gain`, never the products added to it (a recipe's shimmer).
   */
  layerGain?: Partial<Record<StepKey, number>>;
  /** Brow fill (her own makeup only; a dark pigment, so its thickness is a few hundredths: it fills in, it doesn't paint over). */
  brows?: Pigment;
  /**
   * A look's brows: the gaps between her brow hairs filled towards her hairs' own colour (`ratio`: their colour over her
   * skin's brightness, so a brow in shade gets a deeper fill), this share of the way (`amount`).
   */
  browDefine?: { ratio: number[]; amount: number };
  /** Her own makeup's second eyeshadow (her crease and outer corner; the first is on her lid) and her inner-corner light. */
  shadow2?: Pigment;
  inner?: Pigment;
  /** Her own makeup on her bare face (see Mine): with it there is no catalog layer, and every step is hers. */
  mine?: Mine;
  /** A look's skin finish (its recipe): her skin's own shine taken down (-1 matte) or brought up (1 dewy). */
  finish?: number;
  /** A look's foundation's coverage per its strength (its recipe's base: a sheer veil 0.55 .. a brush's matte 1.2). */
  cover?: number;
  /** Coloured contact lenses: their colour (linear reflectance) and whether they cover her iris (else they tint it). */
  lenses?: { color: number[]; opaque: boolean };
};

/* ------------------------------------------------- her own makeup (my-makeup) */

/** A step's own shape: a placement (named as in my-makeup.ts), how soft its edge is (eye widths) and its size (1 = as drawn). */
export type MineZone = { place: string; soft: number; size: number };
/**
 * Her own makeup, built step by step on her bare face (no catalog look): the shapes of her steps and the products that
 * aren't pigments. The pigments themselves (contour, blush, highlight, eyeshadow, liner colour,
 * brows) are Products' own; each step's amount is Products.gain (0 = not used); her lashes are drawn strand by strand
 * (lashes), else the lash template is the look's eye detail.
 */
export type Mine = {
  /** Foundation, all over her face: its shade as a colour gain; finish -1 matte .. 1 dewy. */
  base?: { tint: number[]; finish: number };
  /** Concealer: how far above her skin's median it brightens (1 = up to it) and its colour (peach corrector...). */
  conceal?: MineZone & { lift: number; tint: number[] };
  contour?: MineZone;
  blush?: MineZone;
  glow?: MineZone;
  /** Brows: natural / full / defined. */
  brows?: MineZone;
  /**
   * Eyeshadow: its placement is a catalog coverage map (Products.shadow.cov); as it is (0), packed on (1) or blended out
   * (2); her light (Products.inner) at her inner corners (corners: the default when there is one) and along her
   * aegyo-sal (aegyoSal).
   */
  shadow?: { pack: number; low?: number; corners?: boolean; aegyoSal?: boolean;
    /** Its placement drawn from her own eye (shadowPattern: her lash line, crease and brow), not a catalog look's map. */
    drawn?: string;
    /** Smudged along her lower lash line too (LOWER_SMUDGE), over whatever its placement puts there. */
    lower?: boolean;
    /** Over a catalog look's map: this placement's own band under her lower lashes drawn on too (a smoky eye's). */
    below?: string;
    /** With two shades: how much her second shade gives way over her mobile lid, where her lid shade goes (0.85). */
    fade?: number;
    /** Her glitter's own colour (linear; a topper over her eyeshadow: gold, silver, rose gold), else her shade's. */
    glitterTop?: number[] };
  /**
   * Liner: thin / wing / fox / puppy / smudge, along her lower lash line too, its edge's softness and opacity; kohl: on
   * her lower waterline too, this opaque (the waterline's band, waterAt).
   */
  liner?: { place: string; lower: boolean; soft: number; opacity: number; kohl?: number;
    /** A graphic line along her crease too (a 60s banana), from over her inner corner to her outer corner. */
    crease?: boolean };
  /** Lashes strand by strand (lashStrands): natural / volume / dramatic, her lower lashes too. */
  lashes?: { place: string; lower?: boolean };
  /** Freckles dotted across her nose and upper cheeks (freckleSpots): how strong (1 = as an artist dots them). */
  freckles?: number;
  /** Rhinestones at her outer eye corners (stoneSpots): how bright (1 = as they catch her light). */
  stones?: number;
};
/** Thickness at full coverage and shimmer strength per product, as THICK / SHEEN in products.py. */
export const PIGMENT_THICK = { shadow: 0.6, blush: 0.08, contour: 0.25, glow: 0.05, brows: 0.45 } as const;
export const PIGMENT_SHEEN = { shadow: 1, blush: 0.6, contour: 0, glow: 1, brows: 0 } as const;
const PIGMENT_FINISH: Record<string, number> = { matte: 0, shimmer: 1, metallic: 2, glitter: 3, glow: 4 };
export const linHex = (hex: string) => hexRgb(hex).map((v) => (v / 255) ** 2.2);

export function pigment(kind: keyof typeof PIGMENT_THICK, hex: string, finish = "matte", deep = 0): Pigment {
  return { color: linHex(hex), thick: PIGMENT_THICK[kind], deep, sheen: PIGMENT_SHEEN[kind], finish: PIGMENT_FINISH[finish] ?? 0 };
}
export const linerColour = (hex: string) => linHex(hex);

/**
 * Her light: the colour a white surface on her face would have (her_light in products.py). The eye
 * whites aren't white, so only her light's cast relative to the catalog photo's is kept.
 */
export function productLight(face: FaceStats, swatch: Swatch): number[] {
  const grey = (swatch.k * (swatch.sclera[0] + swatch.sclera[1] + swatch.sclera[2])) / 3;
  const white: LipInfo = {
    colour: [grey, grey, grey], sclera: swatch.sclera, skin: swatch.skin, ombre: [1, 1, 1],
    finish: "satin", alpha: 1, gamma: 1, shine: 0, nude: 0,
  };
  return lipTarget(white, face).colour;
}

/** The most of the light her skin is likely to reflect (light skin, L* about 68: linear luminance of her face's median). */
const SKIN_MAX = 0.38, MINE_CAST_KEEP = 0.35;
/**
 * Her light for her own makeup: productLight, but never so dim that her skin would reflect more of it than skin can
 * (eye whites in shadow, or soft, read too dark: a champagne lid then came out a dull grey). Her own makeup is laid as
 * full products, so the light's level shows; a look's products are swaps over its own calibrated layer.
 */
export function mineLight(face: FaceStats, swatch: Swatch): number[] {
  const w = productLight(face, swatch), y = 0.2126 * w[0] + 0.7152 * w[1] + 0.0722 * w[2];
  // (and nearly neutral: her eye whites' own blue and the room's reflections in them aren't her light's colour, and her
  // camera's white balance already took most of its cast out)
  const floor = (face.skin ?? 0) / SKIN_MAX, k = y > 1e-4 && y < floor ? floor / y : 1;
  return w.map((v) => k * (y + (v - y) * MINE_CAST_KEEP));
}

type V = [number, number];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pt = (P: Pt[], i: number): V => [P[i][0], P[i][1]];
const mean = (P: Pt[], ids: number[]): V => mul(ids.reduce<V>((s, i) => add(s, pt(P, i)), [0, 0]), 1 / ids.length);
const unit = (a: V): V => { const n = Math.hypot(a[0], a[1]) || 1; return [a[0] / n, a[1] / n]; };

/** An ellipse around c with radii (rx along `ax`, ry across it). */
function ellipse(c: V, rx: number, ry: number, ax: V, n = 28): Poly {
  const d = unit(ax), q: V = [-d[1], d[0]];
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    return add(c, add(mul(d, Math.cos(t) * rx), mul(q, Math.sin(t) * ry)));
  });
}

/** A band along a polyline, `up` thick on one side and `down` on the other, as quads. */
function band(line: V[], up: number, down: number, side: V): Poly[] {
  const out: Poly[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], d = unit([b[0] - a[0], b[1] - a[1]]);
    let n: V = [-d[1], d[0]];
    if (n[0] * side[0] + n[1] * side[1] < 0) n = mul(n, -1);
    out.push([add(a, mul(n, up)), add(b, mul(n, up)), add(b, mul(n, -down)), add(a, mul(n, -down))]);
  }
  return out;
}

/** The outline of a band() (its quads' outer edges, there and back). */
function bandOutline(quads: Poly[]): Poly {
  return [...quads.map((q) => q[0]), quads[quads.length - 1][1], quads[quads.length - 1][2], ...[...quads].reverse().map((q) => q[3])];
}

function hull(points: V[]): Poly {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: V, a: V, b: V) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V[] = [], upper: V[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Where her foundation goes (found_shapes in teacher.py): her face's outline (her own, if she moved it) a little further
 * out, its upper part carried on up her forehead (her hairline is where her visible face ends) and its lower part a
 * little down her neck; holes: her eyes with her brows (one shape each) and her lips.
 */
/** The segmenter's face-skin probability at a photo point (pixel units, centres at .5), bilinear on its crop (outside: 0). */
function segFace(vis: Visibility, x: number, y: number): number {
  const n = VIS_SEG, [x0, y0, side] = vis.box, g = n / side;
  let gx = (x + 0.5 - x0) * g - 0.5, gy = (y + 0.5 - y0) * g - 0.5;
  if (gx < -0.5 || gy < -0.5 || gx > n - 0.5 || gy > n - 0.5) return 0;
  gx = Math.min(n - 1, Math.max(0, gx)); gy = Math.min(n - 1, Math.max(0, gy));
  const ix = Math.min(Math.floor(gx), n - 2), iy = Math.min(Math.floor(gy), n - 2), fx = gx - ix, fy = gy - iy;
  const f = (cx: number, cy: number) => vis.probs[(cy * n + cx) * 2] / 255;
  return (f(ix, iy) * (1 - fx) + f(ix + 1, iy) * fx) * (1 - fy) + (f(ix, iy + 1) * (1 - fx) + f(ix + 1, iy + 1) * fx) * fy;
}

export function foundShapes(P: Pt[], vis?: Visibility | null): { outline: Poly; holes: Poly[] } {
  const ew = eyeWidth(P), up = unit([P[10][0] - P[152][0], P[10][1] - P[152][1]]);
  const eye = mean(P, [...EYE_R, ...EYE_L]), mouth = mean(P, LIPS_OUT);
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const along = (a: V, b: V) => (b[0] - a[0]) * up[0] + (b[1] - a[1]) * up[1];   // how far b is above a
  const o = OVAL.map((i) => {
    let q = pt(P, i);
    q = add(q, mul(up, FOUND_UP * ew * clamp01(along(eye, q) / (0.6 * ew))));
    return add(q, mul(up, -FOUND_DOWN * ew * clamp01(along(q, mouth) / (0.6 * ew))));
  });
  const c = mul(o.reduce<V>((s, q) => add(s, q), [0, 0]), 1 / o.length);
  const dirs = o.map((q) => unit([q[0] - c[0], q[1] - c[1]]));
  // as far out as her face skin goes past the outline (at most FOUND_OUT); where it goes on past FOUND_REACH (her ear,
  // her neck), only FOUND_NEAR_OUT
  let out = o.map(() => FOUND_OUT);
  if (vis) {
    out = o.map((q, i) => {
      for (let k = 0; k * 0.02 <= FOUND_REACH + 1e-9; k++) {
        const t = k * 0.02;
        if (segFace(vis, q[0] + dirs[i][0] * t * ew, q[1] + dirs[i][1] * t * ew) < 0.5) return Math.min(FOUND_OUT, Math.max(FOUND_NEAR_OUT, t + 0.05));
      }
      return FOUND_NEAR_OUT;
    });
    const m = out.length;
    out = out.map((x, i) => 0.25 * out[(i - 1 + m) % m] + 0.5 * x + 0.25 * out[(i + 1) % m]);
  }
  const outline = o.map((q, i) => add(q, mul(dirs[i], out[i] * ew)));
  const holes = [[EYE_R, BROW_R], [EYE_L, BROW_L]].map(([ring, brow]) => {
    const h = hull([...ring, ...brow].map((i) => pt(P, i)));
    const m = mul(h.reduce<V>((s, q) => add(s, q), [0, 0]), 1 / h.length);
    return h.map((q) => lerp(m, q, 1.15));
  });
  holes.push(ring(P, LIPS_OUT, 1.1));
  return { outline, holes };
}

/** Her face's frame for the step zones: eye width, the directions across and down her face, and each half's landmarks. */
function frame(P: Pt[]) {
  const ew = eyeWidth(P);
  const across = unit([P[263][0] - P[33][0], P[263][1] - P[33][1]]);   // image left -> right
  const down: V = [-across[1], across[0]];
  const sides = [
    { eye: EYE_R, c: mean(P, EYE_R), out: mul(across, -1), inner: pt(P, 133), outer: pt(P, 33), upper: [133, 173, 157, 158, 159, 160, 161, 246, 33],
      lower: [133, 155, 154, 153, 145, 144, 163, 7, 33],
      brow: BROW_R, browIn: pt(P, 107), browTail: pt(P, 70), browLow: [46, 53, 52, 65, 55], edge: pt(P, 234), mouth: pt(P, 61), bone: [117, 118, 101], ridge: [118, 117, 116, 227],
      jaw: [132, 58, 172, 136, 150], temple: [103, 54, 21, 162] },
    { eye: EYE_L, c: mean(P, EYE_L), out: across, inner: pt(P, 362), outer: pt(P, 263), upper: [362, 398, 384, 385, 386, 387, 388, 466, 263],
      lower: [362, 382, 381, 380, 374, 373, 390, 249, 263],
      brow: BROW_L, browIn: pt(P, 336), browTail: pt(P, 300), browLow: [276, 283, 282, 295, 285], edge: pt(P, 454), mouth: pt(P, 291), bone: [346, 347, 330], ridge: [347, 346, 345, 447],
      jaw: [361, 288, 397, 365, 379], temple: [332, 284, 251, 389] },
  ];
  type Side = (typeof sides)[number];
  const per = (f: (s: Side) => { polys: Poly[]; axis: [V, V]; values?: number[]; outline?: Poly[] }, mode: 0 | 1 | 2): StepGeo => {
    const parts = sides.map(f);
    const values = parts.some((x) => x.values) ? parts.flatMap((x) => x.values ?? x.polys.map(() => 1)) : undefined;
    const outline = parts.some((x) => x.outline) ? parts.flatMap((x) => x.outline ?? x.polys) : undefined;
    return { polys: parts.flatMap((x) => x.polys), sweep: { mode, axes: parts.map((x) => x.axis) },
      sides: parts.flatMap((x, k) => x.polys.map(() => (k ? 1 : -1))), ...(values ? { values } : {}), ...(outline ? { outline } : {}) };
  };
  const tilt = (s: Side, deg: number): V => {            // `out`, turned up towards the temple
    const a = (deg * Math.PI) / 180, u: V = mul(down, -1);
    return unit(add(mul(s.out, Math.cos(a)), mul(u, Math.sin(a))));
  };
  return { ew, across, down, sides, per, tilt };
}

/** Each step's zone on her face and the way its brush moves (also used to draw the tutorial's guides). */
export function stepGeometry(P: Pt[], blush: string): Record<StepKey, StepGeo> {
  const { ew, across, down, sides, per, tilt } = frame(P);
  const nose = pt(P, 1);
  const lipC = lerp(pt(P, 0), pt(P, 17), 0.5);

  const blushGeo: StepGeo = (() => {
    switch (blush) {
      case "none": return { polys: [], sweep: { mode: 0, axes: [[nose, add(nose, mul(across, ew))]] } };
      case "high": return per((s) => { const c = add(add(s.c, mul(down, ew * 0.55)), mul(s.out, ew * 0.35)), d = tilt(s, 20);
        return { polys: [ellipse(c, ew * 0.5, ew * 0.2, d)], axis: [add(c, mul(d, -ew * 0.45)), add(c, mul(d, ew * 0.5))] }; }, 1);
      case "draped": return per((s) => { const c = add(add(s.outer, mul(s.out, ew * 0.45)), mul(down, ew * 0.15)), d = tilt(s, 40);
        return { polys: [ellipse(c, ew * 0.6, ew * 0.22, d)], axis: [add(c, mul(d, -ew * 0.55)), add(c, mul(d, ew * 0.6))] }; }, 1);
      case "under": return per((s) => { const c = add(s.c, mul(down, ew * 0.55));
        return { polys: [ellipse(c, ew * 0.45, ew * 0.18, s.out)], axis: [c, add(c, mul(s.out, ew * 0.5))] }; }, 0);
      case "nose": {
        const g = per((s) => { const c = add(add(s.c, mul(down, ew * 0.8)), mul(s.out, ew * 0.05));
          return { polys: [ellipse(c, ew * 0.3, ew * 0.3, s.out)], axis: [pt(P, 195), c] }; }, 1);
        g.polys.push(ellipse(pt(P, 195), ew * 0.45, ew * 0.1, across));
        return g;
      }
      default: return per((s) => { const c = add(add(s.c, mul(down, ew * 0.8)), mul(s.out, ew * 0.05));
        return { polys: [ellipse(c, ew * 0.33, ew * 0.33, s.out)], axis: [c, add(c, mul(s.out, ew * 0.42))] }; }, 0);
    }
  })();

  return {
    base: { polys: [OVAL.map((i) => pt(P, i))], sweep: { mode: 0, axes: [[nose, add(nose, mul(across, ew * 1.7))]] } },
    conceal: per((s) => { const c = add(add(s.c, mul(down, ew * 0.42)), mul(s.out, ew * 0.05));
      return { polys: [ellipse(c, ew * 0.55, ew * 0.24, across)], axis: [c, add(c, mul(s.out, ew * 0.6))] }; }, 0),
    brows: { ...per((s) => ({ polys: [ring(P, s.brow, BROW_ZONE[0])], axis: [s.browIn, s.browTail] }), 1),
      // The brow's middle line, inner end to tail (upper ids 4..0 paired with lower ids 5..9).
      paths: sides.map((s) => [4, 3, 2, 1, 0].map((k) => lerp(pt(P, s.brow[k]), pt(P, s.brow[9 - k]), 0.5))) },
    shadow: per((s) => {
      const pts: V[] = [...s.eye.map((i) => pt(P, i)), ...s.browLow.map((i) => lerp(pt(P, i), s.c, 0.15)),
        add(add(s.c, mul(s.out, ew * 0.95)), mul(down, -ew * 0.15)), add(s.c, mul(s.out, -ew * 0.6)), add(s.c, mul(down, ew * 0.25))];
      return { polys: [hull(pts)], axis: [s.inner, add(s.c, mul(s.out, ew * 0.95))] };
    }, 1),
    liner: (() => {
      const g = per((s) => {
        const line = s.upper.map((i) => pt(P, i));
        const tip = add(s.outer, mul(tilt(s, 22), ew * 0.32));
        return { polys: band([...line, tip], ew * 0.06, ew * 0.025, mul(down, -1)), axis: [s.inner, tip] };
      }, 1);
      const n = g.polys.length / 2;
      return { ...g, outline: [bandOutline(g.polys.slice(0, n)), bandOutline(g.polys.slice(n))],
        paths: sides.map((s) => [...s.upper.map((i) => pt(P, i)), add(s.outer, mul(tilt(s, 22), ew * 0.32))]) };
    })(),
    lashes: { ...per((s) => ({ polys: [], axis: [s.inner, add(s.outer, mul(s.out, ew * 0.2))] }), 1),
      paths: sides.map((s) => s.upper.map((i) => add(pt(P, i), mul(down, -ew * 0.05)))) },
    contour: per((s) => {
      const a = add(add(s.edge, mul(s.out, -ew * 0.05)), mul(down, ew * 0.25)), b = add(a, mul(unit([s.mouth[0] - s.edge[0], s.mouth[1] - s.edge[1]]), ew * 0.75));
      return { polys: [ellipse(lerp(a, b, 0.5), ew * 0.42, ew * 0.13, [b[0] - a[0], b[1] - a[1]])], axis: [a, b] };
    }, 1),
    blush: blushGeo,
    glow: (() => {
      const g = per((s) => { const c = add(mean(P, s.bone), mul(down, -ew * 0.05));
        return { polys: [ellipse(c, ew * 0.3, ew * 0.135, tilt(s, 12))], axis: [c, add(c, mul(s.out, ew * 0.4))] }; }, 0);
      const a = pt(P, 6), b = pt(P, 195);
      g.polys.push(...band([a, b], ew * 0.03, ew * 0.03, across), ellipse(add(pt(P, 0), mul(down, -ew * 0.04)), ew * 0.07, ew * 0.04, across));
      return g;
    })(),
    lips: { polys: [ring(P, LIPS_OUT)], sweep: { mode: 2, axes: [[lipC, pt(P, 61)]] } },
    // her irises (or, without them, the middle of each eye)
    lenses: per((s) => {
      const k = P.length >= 478 ? (pt(P, 468)[0] - s.c[0]) ** 2 + (pt(P, 468)[1] - s.c[1]) ** 2 < (pt(P, 473)[0] - s.c[0]) ** 2 + (pt(P, 473)[1] - s.c[1]) ** 2 ? 468 : 473 : -1;
      const c = k < 0 ? s.c : pt(P, k);
      const r = k < 0 ? ew * 0.2 : [1, 2, 3, 4].reduce((sum, j) => sum + Math.hypot(P[k + j][0] - c[0], P[k + j][1] - c[1]), 0) / 4;
      return { polys: [ellipse(c, r, r, s.out)], axis: [add(c, mul(s.out, -r)), add(c, mul(s.out, r))] };
    }, 1),
  };
}

/** How far a point is from a polyline. */
function polyDist(q: V, line: V[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], d = sub(line[i + 1], a), L = d[0] * d[0] + d[1] * d[1];
    const t = L ? Math.min(1, Math.max(0, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / L)) : 0;
    best = Math.min(best, Math.hypot(q[0] - a[0] - d[0] * t, q[1] - a[1] - d[1] * t));
  }
  return best;
}

/** A point along a polyline at share x of its length, with its normal turned towards `side`. */
function along(line: V[], x: number, side: V): [V, V] {
  const seg = line.slice(1).map((b, i) => Math.hypot(b[0] - line[i][0], b[1] - line[i][1]));
  let s = Math.min(1, Math.max(0, x)) * seg.reduce((a, b) => a + b, 0), i = 0;
  while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
  const a = line[i], b = line[i + 1], d = unit([b[0] - a[0], b[1] - a[1]]);
  let n: V = [-d[1], d[0]];
  if (n[0] * side[0] + n[1] * side[1] < 0) n = mul(n, -1);
  return [lerp(a, b, seg[i] ? s / seg[i] : 0), n];
}

/**
 * A band along a polyline (from share `from` of its length on) whose width on `side` grows from t0 to t1, `under` on the
 * other side; each point's normal is the mean of its segments' so the quads meet without notches (a liner's edge).
 */
function taper(line: V[], t0: number, t1: number, under: number, side: V, from = 0): Poly[] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const L = cum[cum.length - 1] || 1, s0 = from * L;
  const pts: Array<[V, number]> = [];
  for (let i = 0; i < line.length; i++) {
    if (cum[i] >= s0) pts.push([line[i], cum[i] / L]);
    else if (i + 1 < line.length && cum[i + 1] > s0) pts.push([lerp(line[i], line[i + 1], (s0 - cum[i]) / (cum[i + 1] - cum[i])), from]);
  }
  const normals = pts.map(([q], i) => {
    const a = pts[Math.max(0, i - 1)][0], b = pts[Math.min(pts.length - 1, i + 1)][0], d = unit([b[0] - a[0], b[1] - a[1]]);
    let n: V = [-d[1], d[0]];
    if (n[0] * side[0] + n[1] * side[1] < 0) n = mul(n, -1);
    void q;
    return n;
  });
  const width = (x: number) => t0 + (t1 - t0) * (from < 1 ? (x - from) / (1 - from) : 1);
  const out: Poly[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, xa] = pts[i], [b, xb] = pts[i + 1], na = normals[i], nb = normals[i + 1];
    out.push([add(a, mul(na, width(xa))), add(b, mul(nb, width(xb))), add(b, mul(nb, -under)), add(a, mul(na, -under))]);
  }
  return out;
}

/** A zone grown or shrunk about each polygon's own centre (a bigger or smaller brush). */
function sized(g: StepGeo, k: number): StepGeo {
  if (Math.abs(k - 1) < 1e-3) return g;
  const grow = (q: Poly) => { const c = mul(q.reduce<V>((s, x) => add(s, x), [0, 0]), 1 / q.length); return q.map((x) => lerp(c, x, k)); };
  return { ...g, polys: g.polys.map(grow), ...(g.outline ? { outline: g.outline.map(grow) } : {}) };
}

const NO_ZONE: StepGeo = { polys: [], sweep: { mode: 0, axes: [] } };

/**
 * Her lid and inner corner for a two-shade eyeshadow (an artist's way): soft spots along the middle of her lid from
 * near her inner corner to two thirds out (her lid shade; her crease and outer corner take her second shade), and one
 * at her inner corner (her inner-corner light); her aegyo-sal, the little roll just under her lower lashes (her light
 * along it: Korean makeup's "smiling eyes"). Pixels.
 */
export function lidSpots(P: Pt[]): { lid: Spot[]; inner: Spot[]; low: Spot[]; aegyo: Spot[] } {
  const { ew, down, sides } = frame(P), up = mul(down, -1);
  const lid: Spot[] = [], inner: Spot[] = [], low: Spot[] = [], aegyo: Spot[] = [];
  for (const s of sides) {
    const line = s.upper.map((i) => pt(P, i)), browLow = s.browLow.map((i) => pt(P, i));
    // (a spot's sigma is a third of its radius: these overlap into one soft band, solid from her lashes to the middle
    // of her lid, thinning out toward her crease and, gradually, toward her outer corner: the blend between her shades;
    // her crease about two fifths of the way from her lashes to her brow, so her own lid's height sets the band's;
    // smaller at her inner corner, so none of it wraps around below it)
    ([[0.12, 0.45, 0.65], [0.2, 0.5, 0.85], [0.29, 0.5, 1], [0.38, 0.45, 1], [0.48, 0.36, 1], [0.58, 0.24, 1], [0.66, 0.12, 1]] as const).forEach(([x, a, k]) => {
      const [q, n] = along(line, x, up), D = Math.min(0.9 * ew, Math.max(0.35 * ew, polyDist(q, browLow)));
      const c = add(q, mul(n, D * (0.2 + (1 - k) * 0.12)));
      lid.push([c[0], c[1], D * 0.5 * k, a]);
    });
    const c = add(add(s.inner, mul(s.out, -ew * 0.03)), mul(up, ew * 0.02));
    inner.push([c[0], c[1], ew * 0.24, 1]);
    // under her eye, from her lower lash line down: a placement's colour there is only a whisper of it (Mine.shadow.low)
    const under = s.lower.map((i) => pt(P, i));
    for (const x of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const [q, n] = along(under, x, down), d = add(q, mul(n, ew * 0.16));
      low.push([d[0], d[1], ew * 0.42, 0.5]);
    }
    // (her aegyo: a narrow band from near her inner corner to two thirds out, fullest under her iris, a lash line's
    // width below her lashes so they stay dark)
    ([[0.1, 0.3], [0.22, 0.55], [0.34, 0.7], [0.46, 0.7], [0.58, 0.55], [0.7, 0.38], [0.8, 0.2]] as const).forEach(([x, a]) => {
      const [q, n] = along(under, x, down), d = add(q, mul(n, ew * 0.075));
      aegyo.push([d[0], d[1], ew * 0.13, a]);
    });
    // and her brow bone, just under her brow: a placement's colour fades out before it (half as firmly)
    const bone = s.browLow.map((i) => pt(P, i));
    for (const x of [0.1, 0.35, 0.6, 0.85]) {
      const [q, n] = along(bone, x, down), d = add(q, mul(n, ew * 0.1));
      low.push([d[0], d[1], ew * 0.38, 0.28]);
    }
  }
  return { lid, inner, low, aegyo };
}

/**
 * Her eyeshadow's placements drawn from her own eye (the roadmap's Phase 2: anchored to three curves of hers, so a
 * hooded or a monolid eye gets a placement that suits it): over (s, t), s along her eye from her inner corner (0) to her
 * outer corner (1) and on out along her wing's way, t from her upper lash line (0) to her crease (1) to her brow (2),
 * and below her lower lash line (t < 0, to -1 a little way down her cheek). Her crease is MediaPipe's ring of points
 * around the socket of her eye (upper2), her brow its lower edge. How much of the eyeshadow each placement lays at (s, t).
 */
const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
/**
 * A smoky eye's band under her lower lashes, this much denser than on her lid (at most a full coverage): the catalog's
 * smoky photos have it packed on there, 10 to 24 L* under her lashes where her lid's outer half is 17 to 36, and laid as
 * deep as her lid, then blurred by the blending brush, it came out 29 to 34 (the arabic glam's 31 against its photo's
 * 12; 2026-11).
 */
const SMOKY_LOWER = 1.6;
/**
 * ...and packed on there: as much more powder as this, under her eye (lidSpots' low band, which her lid's colour never
 * reaches) where the band is full (its placement from SMOKY_BELOW_CORE[0] to [1] of a full coverage), whatever amount
 * her lid has; its blended edge below as it was (packed all the way down, her under-eye came out 5 to 6 L* darker than
 * the photos': theirs is smoked out, not packed); not over her eyeball's soft edge (her brush's blur reaches up onto it).
 */
const SMOKY_BELOW = 2.2, SMOKY_BELOW_CORE = [0.45, 0.85], SMOKY_BELOW_MATTE = 0.65;
const bump = (c: number, w: number, x: number) => Math.exp(-(((x - c) / w) ** 2));
const SHADOW_PATTERNS: Record<string, { out: number; f: (s: number, t: number) => number }> = {
  // her lid to just past her crease, one colour
  wash: { out: 1.08, f: (s, t) => (t >= 0 ? 1 - ss(0.8, 1.3, t) : 0.12 * (1 - ss(0, 1, -t)) * ss(0.4, 0.9, s)) },
  // a little on her lid, her crease's band, and a V from her outer corner up into it
  crease: { out: 1.1, f: (s, t) => (t >= 0 ? Math.max(0.3 * (1 - ss(0.65, 1, t)), bump(1, 0.3, t), 0.95 * ss(0.6, 0.95, s) * (1 - ss(0.95, 1.3, t)))
    : 0.3 * ss(0.55, 0.95, s) * (1 - ss(0, 1, -t))) },
  // all of her lid and her crease, smoked out above it and on out, and along her lower lash line, as deep there as on
  // her lid right at her lashes and as far down as the catalog's smoky photos take it (full to 0.12 eye widths below her
  // lashes, gone by 0.24, before her brush blurs it: a band a third as tall read as a faint shadow under the blending
  // brush, 4 to 10 ΔE lighter than their photos)
  smoky: { out: 1.18, f: (s, t) => (t >= 0 ? 1 - ss(0.95, 1.6, t) : SMOKY_LOWER * (1 - ss(0.75, 1.5, -t)) * (0.6 + 0.4 * ss(0.1, 0.45, s))) },
  // deeper at her inner and outer corners, her lid's middle lighter (the spotlight)
  halo: { out: 1.1, f: (s, t) => (t >= 0 ? (1 - ss(0.85, 1.35, t)) * (1 - 0.65 * bump(0.5, 0.17, s)) : 0.45 * (1 - ss(0, 1, -t)) * (0.4 + 0.6 * ss(0.45, 0.85, s))) },
  // a crisp line in her crease (her lid under it left for her lid shade), blended out above it
  cutcrease: { out: 1.15, f: (s, t) => (t >= 0 ? Math.max(0.12 * (1 - ss(0.75, 0.86, t)), ss(0.8, 0.9, t) * (1 - ss(1.05, 1.45, t)))
    : 0.3 * ss(0.55, 0.95, s) * (1 - ss(0, 1, -t))) },
  // from light at her inner corner to deep at her outer corner
  gradient: { out: 1.1, f: (s, t) => (t >= 0 ? (0.15 + 0.85 * ss(0.1, 0.95, s)) * (1 - ss(0.85, 1.35, t)) : 0.35 * ss(0.5, 1, s) * (1 - ss(0, 1, -t))) },
};
/**
 * Her mobile lid (as SHADOW_PATTERNS, at 1 where it is fullest): from her lashes up to just under her crease, from her
 * inner corner to past the middle of her eye, softening towards her crease and her outer corner. Her two-shade
 * eyeshadow's lid shade goes here and her crease shade around it, crossing over as a fluffy brush blends them; and here
 * any eyeshadow is packed on rather than blended out. (lidSpots' soft spots drew a narrow band just above her lashes,
 * a third of the way up her lid, with a crisp top edge: her lid shade came out as a pale crescent, her crease shade
 * drawn round it like an outline.)
 */
const LID_PATTERN = { out: 1.0, f: (s: number, t: number) => (t >= 0 ? (1 - ss(0.3, 1.2, t)) * (1 - ss(0.45, 0.95, s)) : 0) };
/**
 * Her eyeshadow smudged along her lower lash line too (Mine.shadow.lower, «سایه زیر چشم هم»: a small brush or a pencil
 * run along under her lower lashes and softened), as SHADOW_PATTERNS below her lashes: fullest from her outer corner to
 * the middle of her eye and fading towards her inner corner, a band down from her lashes about as deep as her lash line
 * is wide, softening out below it. Most of the catalog's looks with a crease, halo, gradient or wash have it in their
 * photos, a smoky eye all along her lower lashes (its own placement); with two shades it is the second one, as on her
 * outer corner.
 */
const LOWER_SMUDGE = (s: number, t: number) => (t < 0 ? (1 - ss(0.5, 1.2, -t)) * (0.2 + 0.8 * ss(0.2, 0.65, s)) : 0);
const NO_PATTERN = { out: 1.1, f: () => 0 };
/** How soft her drawn eyeshadow's edges are per tool (Mine.shadow.pack: finger, flat brush, fluffy brush), eye widths. */
const SHADOW_PATTERN_SOFT = [0.075, 0.055, 0.1];
/**
 * Her drawn eyeshadow at its fullest (a powder's coverage, as the catalog's maps measured from their photos peak: at 1
 * a lid of it was a flat sticker), and each placement's softness on that (a cut crease's line is crisp).
 */
const SHADOW_PATTERN_PEAK = 0.62, SHADOW_PATTERN_EDGE: Record<string, number> = { cutcrease: 0.55 };
/** Her crease's ring (inner to outer) per eye: image left, image right (MediaPipe's rightEyeUpper2 / leftEyeUpper2). */
const CREASE_RING = [[189, 221, 222, 223, 224, 225, 113], [413, 441, 442, 443, 444, 445, 342]];
/**
 * A winged liner's wing (degrees up from her eye's own axis, its length past her outer corner as a share of her eye's
 * width, how far along her lash line its top edge leaves her liner and how far above it, eye widths): a flick that
 * carries on her lower lash line's direction out past her corner and only a little up, thinning to a point, as the
 * catalog photos' wings do (their tips 0.35 to 0.45 eye widths past her corner, 5 to 8 degrees up from her eye's axis;
 * a fox or siren eye's 0.4 to 0.6 and 13 to 18). Drawn at 24 and 30 degrees, 0.3 and 0.42 long, they came out as a short
 * fat fin pointing up at her brow's tail.
 */
const LINER_WING: Record<"wing" | "fox", [number, number, number, number]> = { wing: [8, 0.38, 0.78, 0.045], fox: [15, 0.46, 0.72, 0.05] };
/**
 * Her eyeshadow's placement (SHADOW_PATTERNS) as triangles for the "pattern" program: x, y, 0, 0, coverage. `below`: only
 * its part under her lower lashes (drawn over a catalog look's map, which has little there).
 */
export function shadowPattern(P: Pt[], place: string, lid = false, lower = false, below = false): Float32Array {
  const pat = lid ? LID_PATTERN : place === "none" ? NO_PATTERN : SHADOW_PATTERNS[place] ?? SHADOW_PATTERNS.wash, peak = lid ? 1 : SHADOW_PATTERN_PEAK;
  const f = (s: number, t: number) => (below && t >= 0 ? 0 : lower && t < 0 ? Math.max(pat.f(s, t), LOWER_SMUDGE(s, t)) : pat.f(s, t));
  const { ew, down, sides } = frame(P), up = mul(down, -1);
  const S = 26, ts = [-1.6, -1.3, -1, -0.66, -0.33, 0, ...Array.from({ length: 21 }, (_, i) => i * 0.1)];
  const out: number[] = [];
  sides.forEach((side, k) => {
    // (each curve from her inner corner out, on past her outer corner along its own last direction)
    const curve = (ids: number[]) => {
      const line = ids.map((i) => pt(P, i)), n = line.length;
      const len = line.slice(1).reduce((a, b, i) => a + Math.hypot(b[0] - line[i][0], b[1] - line[i][1]), 0);
      const end = unit(sub(line[n - 1], line[n - 2]));
      return (s: number): V => (s <= 1 ? along(line, s, up)[0] : add(line[n - 1], mul(end, (s - 1) * len)));
    };
    const lash = curve(side.upper), crease = curve(CREASE_RING[k]), brow = curve([...side.browLow].reverse()), low = curve(side.lower);
    const at = (s: number, t: number): V => {
      if (t < 0) return add(low(Math.min(s, 1)), mul(down, -t * ew * 0.16));
      return t <= 1 ? lerp(lash(s), crease(s), t) : lerp(crease(s), brow(s), t - 1);
    };
    const value = (s: number, t: number) => Math.min(1, peak * f(s, t) * ss(-0.04, 0.1, s) * (1 - ss(pat.out - 0.1, pat.out, s)));
    for (let i = 0; i < S; i++) {
      const s0 = -0.04 + (i / S) * (pat.out + 0.04), s1 = -0.04 + ((i + 1) / S) * (pat.out + 0.04);
      for (let j = 0; j + 1 < ts.length; j++) {
        const t0 = ts[j], t1 = ts[j + 1];
        if (t0 < 0 && t1 > 0) continue;
        const q = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => [...at(s, t), 0, 0, value(s, t)]);
        for (const v of [0, 1, 2, 0, 2, 3]) out.push(...q[v]);
      }
    }
  });
  return new Float32Array(out);
}

/**
 * Where freckles go: patches of her face between four landmarks each (inner top, outer top, outer bottom, inner bottom,
 * so a patch bends and turns with her face): her nose from the middle of its bridge to its tip, and each cheek from
 * under her eye's inner half to her cheekbone, down to the side of her nose. How many dots each patch gets, and how
 * they crowd towards its inner top (across her nose and the tops of her cheeks, as sun-kissed freckles do).
 */
const FRECKLE_PATCHES: Array<{ at: [number, number, number, number]; n: number; crowd: [number, number] }> = [
  { at: [196, 419, 275, 45], n: 24, crowd: [0, 0.3] },
  { at: [121, 117, 50, 209], n: 30, crowd: [0.65, 0.45] },
  { at: [350, 346, 280, 429], n: 30, crowd: [0.65, 0.45] },
];
/** Each freckle: where in its patch (u across, v down), its size (eye widths) and how dark: the same on every face. */
const FRECKLES: Array<[number, number, number, number, number]> = (() => {
  let s = 0x2f6b9d1;            // (mulberry32: a fixed pattern, so her freckles stay put frame after frame)
  const rand = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out: Array<[number, number, number, number, number]> = [];
  FRECKLE_PATCHES.forEach((p, k) => {
    for (let i = 0; i < p.n;) {
      const u = rand(), v = rand();
      if (rand() > (1 - p.crowd[0] * u) * (1 - p.crowd[1] * v)) continue;
      const r = rand();     // (mostly small, a few bigger)
      out.push([k, u, v, 0.028 + 0.05 * r * r * r, 0.45 + 0.55 * rand()]);
      i++;
    }
  });
  return out;
})();

/** Her freckles as soft dots (pixels), on her FRECKLE_PATCHES. */
export function freckleSpots(P: Pt[]): Spot[] {
  const ew = eyeWidth(P);
  return FRECKLES.map(([k, u, v, r, a]) => {
    const [i0, i1, i2, i3] = FRECKLE_PATCHES[k].at;
    const top = lerp(pt(P, i0), pt(P, i1), u), bottom = lerp(pt(P, i3), pt(P, i2), u), c = lerp(top, bottom, v);
    return [c[0], c[1], r * ew, a];
  });
}

/** Her rhinestones (pixels: x, y, radius, and a number of its own: how its facets catch the light). */
export function stoneSpots(P: Pt[]): Spot[] {
  const { ew, sides, tilt } = frame(P);
  return sides.flatMap((s, k) => {
    const d = tilt(s, STONE_TILT), start = add(s.outer, mul(s.out, ew * 0.02));
    return STONES.map(([x, r], i): Spot => { const c = add(start, mul(d, ew * x)); return [c[0], c[1], ew * r, (k * 3 + i) * 0.137 + 0.05]; });
  });
}

/** Her brow fill per style: her hairs' darkness from / to which it is all of her brow, and how much of the zone gets some anyway (browFill). */
const BROW_SHAPE: Record<string, [number, number, number]> = { natural: [0.05, 0.25, 0], full: [0.02, 0.14, 0.2], defined: [0.04, 0.2, 0.12] };

/**
 * Her own makeup's shapes (Mine), one per zone channel: zoneA concealer, contour, blush, highlight; zoneB none (her
 * eyeshadow's placement is a catalog coverage map, in uCov), liner, brows, where the lash template's lashes go.
 * Every shape follows her landmarks; polygons of one half of her face stay on that half (ZONE_FS).
 */
export function mineZones(P: Pt[], m: Mine): { A: StepGeo[]; B: StepGeo[] } {
  const { ew, across, down, sides, per, tilt } = frame(P);
  const up = mul(down, -1);
  const steps = stepGeometry(P, m.blush?.place ?? "apples");
  // (the top of her cheekbone, as an artist lays a highlight: from below the middle of her eye out and up towards her
  // temple, widest over the bone's high point, a whisper at each end; not the hollow under her eye)
  const bones = per((s) => {
    const r = s.ridge.map((i) => pt(P, i));
    const line: V[] = [lerp(r[0], r[1], 0.45), r[1], lerp(r[1], r[2], 0.5), r[2], lerp(r[2], r[3], 0.55)];
    const width = [0.05, 0.085, 0.1, 0.095, 0.06];
    const polys = line.map((c, k) => {
      const d = sub(line[Math.min(k + 1, line.length - 1)], line[Math.max(k - 1, 0)]);
      return ellipse(add(c, mul(down, ew * 0.02)), Math.hypot(d[0], d[1]) * 0.55, ew * width[k], d);
    });
    return { polys, axis: [line[0], line[line.length - 1]] };
  }, 0);
  const join = (...gs: StepGeo[]): StepGeo => ({ polys: gs.flatMap((g) => g.polys), sweep: gs[0].sweep,
    sides: gs.flatMap((g) => g.polys.map((_, k) => g.sides?.[k] ?? 0)), values: gs.flatMap((g) => g.polys.map((_, k) => g.values?.[k] ?? 1)),
    outline: gs.flatMap((g) => g.outline ?? g.polys) });
  const mid = (polys: Poly[]): StepGeo => ({ polys, sweep: { mode: 0, axes: [] } });

  // concealer: an upside-down triangle under each eye (from just below her lower lash line), and her face's centre
  let conceal = NO_ZONE;
  if (m.conceal) {
    const under = per((s) => {
      const low = s.lower.map((i) => add(pt(P, i), mul(down, ew * 0.07)));
      const apex = add(add(mean(P, s.lower), mul(down, ew * 0.78)), mul(s.out, -ew * 0.06));
      return { polys: low.slice(1).map((q, i) => [low[i], q, apex] as Poly), axis: [low[0], apex], outline: [[...low, apex]] };
    }, 0);
    conceal = under;
    if (m.conceal.place === "center") {
      const brows = lerp(pt(P, 107), pt(P, 336), 0.5);
      conceal = join(under, mid([
        ellipse(add(brows, mul(up, ew * 0.6)), ew * 0.4, ew * 0.24, across),
        ...band([pt(P, 6), pt(P, 195)], ew * 0.06, ew * 0.06, across),
        ellipse(lerp(pt(P, 17), pt(P, 152), 0.55), ew * 0.24, ew * 0.13, across),
      ]));
    }
    conceal = sized(conceal, m.conceal.size);
  }

  // contour: under her cheekbones; the full sculpt adds her temples and jaw; or the sides of her nose
  let contour = NO_ZONE;
  if (m.contour) {
    const centre = mean(P, OVAL);
    const inward = (ids: number[]) => unit(sub(centre, mean(P, ids)));
    if (m.contour.place === "nose") {
      const a = pt(P, 168), b = pt(P, 4), side = (k: number): StepGeo => {
        const off = mul(across, k * ew * 0.16);
        return { ...mid(band([add(lerp(a, b, 0.2), off), add(lerp(a, b, 0.78), mul(off, 1.15))], ew * 0.03, ew * 0.03, across)), sides: [k] };
      };
      contour = join(side(-1), side(1));
    } else {
      contour = steps.contour;
      if (m.contour.place === "sculpt") {
        contour = join(contour, per((s) => {       // (lighter than under her cheekbones: these shade the edges of her face)
          const polys = [...taper(s.temple.map((i) => pt(P, i)), ew * 0.2, ew * 0.2, ew * 0.01, inward(s.temple)),
            ...taper(s.jaw.map((i) => pt(P, i)), ew * 0.14, ew * 0.1, ew * 0.02, inward(s.jaw))];
          const n = s.temple.length - 1;
          return { polys, values: polys.map(() => 0.7), axis: [pt(P, s.temple[0]), pt(P, s.jaw[0])],
            outline: [bandOutline(polys.slice(0, n)), bandOutline(polys.slice(n))] };
        }, 1));
      }
    }
    contour = sized(contour, m.contour.size);
  }

  // (the long, thin placements a little wider: a soft brush would thin them out)
  const blush = m.blush ? sized(steps.blush, m.blush.size * (["high", "draped", "under"].includes(m.blush.place) ? 1.2 : 1)) : NO_ZONE;

  // highlight: her cheekbones; the full glow adds her nose and cupid's bow; or her inner eye corners and brow bones
  let glow = NO_ZONE;
  if (m.glow) {
    if (m.glow.place === "inner") {
      glow = per((s) => {
        const tail = lerp(pt(P, s.browLow[0]), pt(P, s.browLow[2]), 0.5), dir = sub(s.browTail, s.browIn);
        return { polys: [ellipse(add(s.inner, mul(s.out, -ew * 0.07)), ew * 0.075, ew * 0.055, across),
          ellipse(add(tail, mul(down, ew * 0.1)), ew * 0.2, ew * 0.05, dir)], axis: [s.inner, tail] };
      }, 0);
    } else glow = m.glow.place === "full" ? steps.glow : bones;
    glow = sized(glow, m.glow.size);
  }

  // liner along her upper lash line (and her lower one), in her style
  let liner = NO_ZONE;
  if (m.liner) {
    const style = m.liner.place;
    liner = per((s) => {
      const lid = s.upper.map((i) => pt(P, i)), low = s.lower.map((i) => pt(P, i));
      const under = ew * 0.012, polys: Poly[] = [];
      // the wing as long as this eye is wide in the photo (a turned head's far eye is narrower)
      // and turned up from this eye's own axis (inner to outer corner), so it follows a tilted or turned eye
      const own = Math.min(ew, Math.hypot(s.outer[0] - s.inner[0], s.outer[1] - s.inner[1]));
      const ax = unit(sub(s.outer, s.inner));
      let lift: V = [-ax[1], ax[0]];
      if (lift[0] * up[0] + lift[1] * up[1] < 0) lift = mul(lift, -1);
      const turn = (deg: number): V => { const a = (deg * Math.PI) / 180; return unit(add(mul(ax, Math.cos(a)), mul(lift, Math.sin(a)))); };
      const top = (x: number, t: number) => { const [q, n] = along(lid, x, up); return add(q, mul(n, t)); };
      const wing = (deg: number, len: number, from: number, t: number) => polys.push([top(from, ew * t), add(s.outer, mul(turn(deg), own * len)), s.outer]);
      if (style === "thin") polys.push(...taper(lid, ew * 0.012, ew * 0.03, under, up));
      else if (style === "fox") {
        polys.push(...taper(lid, ew * 0.014, ew * 0.06, under, up));
        wing(...LINER_WING.fox);
        polys.push([add(s.inner, mul(up, ew * 0.014)), add(add(s.inner, mul(s.out, -ew * 0.09)), mul(down, ew * 0.035)), add(s.inner, mul(down, ew * 0.012))]);
      } else if (style === "puppy") {
        polys.push(...taper(lid, ew * 0.012, ew * 0.05, under, up, 0.1));
        polys.push([top(0.72, ew * 0.04), add(s.outer, mul(turn(-14), own * 0.2)), add(s.outer, mul(down, ew * 0.03))]);
      } else if (style === "smudge") {
        polys.push(...taper(lid, ew * 0.03, ew * 0.065, ew * 0.02, up));
        polys.push(...taper(low, ew * 0.004, ew * 0.03, ew * 0.006, down, 0.45));
      } else {                                                               // the classic wing
        polys.push(...taper(lid, ew * 0.01, ew * 0.055, under, up, 0.08));
        wing(...LINER_WING.wing);
      }
      if (m.liner!.lower && style !== "smudge") polys.push(...taper(low, ew * 0.003, ew * 0.02, ew * 0.006, down, 0.5));
      // (a graphic crease line: over her inner corner, along her crease (CREASE_RING), down to her outer corner's wing)
      if (m.liner!.crease) {
        // (a wide, shallow arc drawn with her eye open: from just inside her inner corner, between her lash line and her crease
        // (CREASE_RING) and a little past it over the middle of her lid, out past her outer corner to her wing)
        const ring = CREASE_RING[s.eye === EYE_R ? 0 : 1].map((i) => pt(P, i));
        const on = (line: V[], x: number): V => {     // (past either end along its own last direction)
          const n = line.length, a = x < 0 ? line[0] : line[n - 1], d = x < 0 ? sub(line[0], line[1]) : sub(line[n - 1], line[n - 2]);
          return x < 0 ? add(a, mul(unit(d), -x * own)) : x > 1 ? add(a, mul(unit(d), (x - 1) * own)) : along(line, x, up)[0];
        };
        const arc: V[] = Array.from({ length: 29 }, (_, i) => {
          const x = -0.04 + (i / 28) * 1.16, w = 0.95 * Math.max(0, Math.sin((Math.PI * (x + 0.04)) / 1.16)) ** 0.6;
          return lerp(on(lid, x), on(ring, Math.min(1, Math.max(0, x))), w);
        });
        polys.push(...taper(arc, ew * 0.01, ew * 0.02, ew * 0.01, up));
      }
      return { polys, axis: [s.inner, s.outer] };
    }, 1);
  }

  // brows: filled in from her brow's landmarks, lighter towards its inner end; fuller, or defined with a longer tail
  let brows = NO_ZONE;
  if (m.brows) {
    const style = m.brows.place, k = m.brows.size;
    brows = per((s) => {
      const pairs = [0, 1, 2, 3, 4].map((j) => {                    // tail to inner end
        const a = pt(P, s.brow[j]), b = pt(P, s.brow[9 - j]), c = lerp(a, b, 0.5), w = (style === "full" ? 1.3 : 1) * k;
        return [lerp(c, a, w), lerp(c, b, w)] as [V, V];
      });
      if (style === "defined") {
        const c0 = lerp(pairs[0][0], pairs[0][1], 0.5), c1 = lerp(pairs[1][0], pairs[1][1], 0.5);
        const tip = add(c0, mul(unit(sub(c0, c1)), ew * 0.1));
        pairs.unshift([lerp(tip, pairs[0][0], 0.25), lerp(tip, pairs[0][1], 0.25)]);
      }
      const n = pairs.length - 1, ramp = (j: number) => (j === n - 1 ? 0.5 : j === n - 2 ? 0.82 : 1);
      const polys = pairs.slice(0, -1).map(([a, b], j) => [a, pairs[j + 1][0], pairs[j + 1][1], b] as Poly);
      return { polys, values: polys.map((_, j) => (style === "defined" ? Math.min(1, ramp(j) + 0.1) : ramp(j))), axis: [s.browIn, s.browTail],
        outline: [[...pairs.map((q) => q[0]), ...[...pairs].reverse().map((q) => q[1])]] };
    }, 1);
  }

  // where the lash template's lashes go: around her eye, never on her brows
  const lashes = per((s) => {
    const lid = s.upper.map((i) => add(pt(P, i), mul(up, ew * 0.45))), low = s.lower.map((i) => add(pt(P, i), mul(down, ew * 0.2)));
    const zone = hull([...lid, ...low, add(add(s.outer, mul(s.out, ew * 0.32)), mul(up, ew * 0.25)), add(s.inner, mul(s.out, -ew * 0.06))]);
    return { polys: [zone, ring(P, s.brow, 1.25)], values: [1, 0], axis: [s.inner, s.outer] };
  }, 1);

  return { A: [conceal, contour, blush, glow], B: [NO_ZONE, liner, brows, lashes] };
}

/* ------------------------------------------------- lashes, strand by strand */

/**
 * Lashes drawn strand by strand on her own lash lines (Phase 2 of the roadmap: her own makeup's and every look's
 * lashes, no catalog look's eye detail), in clumps, as lashes are seen: a mascara pulls her lashes together into a few
 * at a time, a strip is knotted in spikes, and between them her lid shows. Per style: how many clumps along each upper
 * lash line and how many strands in each, their length and root half-width (eye widths), how dark, how far each clump's
 * strands are drawn together towards their tips, how much longer the outer ones are, how much shorter every other clump
 * is (a strip's long and short spikes) and how many fine single lashes between them. Drawn as evenly spaced strands of
 * one length, as they were, they came out as a comb or a brush.
 */
const LASH_STYLES: Record<string, { clumps: number; per: [number, number]; len: number; hw: number; dark: number; pull: number; outer: number; alt: number; wisps: number }> = {
  natural: { clumps: 22, per: [2, 3], len: 0.22, hw: 0.0045, dark: 0.75, pull: 0.4, outer: 0.15, alt: 0.1, wisps: 10 },
  volume: { clumps: 26, per: [3, 5], len: 0.27, hw: 0.0042, dark: 0.9, pull: 0.4, outer: 0.2, alt: 0.2, wisps: 10 },
  dramatic: { clumps: 28, per: [4, 6], len: 0.31, hw: 0.0042, dark: 0.95, pull: 0.35, outer: 0.25, alt: 0.25, wisps: 8 },
};
/**
 * How long her lashes look in a frontal photo, as a share of their length, from her inner corner out: her middle lashes
 * point at the camera (it sees them end-on, foreshortened), her outer ones sweep out to the side (seen whole): at least
 * LASH_SEEN[0], all of it from LASH_SEEN[1] to LASH_SEEN[2] of the way out.
 */
const LASH_SEEN = [0.62, 0.45, 0.95];
/** Which way they point (degrees from her lash line's normal, towards her outer corner): from a little in at her inner corner to swept out at her outer corner. */
const LASH_FAN = [-12, 82, 2];
/** Her lower lashes (bottomLashes, or a dramatic look's): from a quarter of the way out, short, pointing down, in twos and threes. */
const LOWER_LASHES = { clumps: 8, per: [2, 3] as [number, number], from: 0.25, len: 0.085, hw: 0.004, dark: 0.55, pull: 0.6 };
/** A lash's colour (linear reflectance: a black mascara or false lash, a little warm) and how opaque a strand's core is. */
const LASH_COLOUR = [0.012, 0.0105, 0.01], LASH_OPAQUE = 0.92;
/**
 * Each strand's points (a cubic curve), how much its half-width tapers by its tip and how much lighter its tip is (a
 * lash is thick and dark at its root, fine and see-through at its tip).
 */
const STRAND_STEPS = 10, STRAND_TAPER = 0.92, STRAND_TIP_LIGHT = 0.35;
/**
 * A lash's curl, as a frontal photo shows it (degrees, towards her outer corner, at its two inner control points and its
 * tip, which lie LASH_BEND of the way along it): from her lid it first leans out (it points at the camera there, so it
 * looks short and sideways), then curls back up towards its tip.
 */
const LASH_CURL = [26, 8, -22], LASH_BEND = [0.3, 0.68], LASH_CURL_FROM = 0.35;
/** How varied her lashes are: length, angle (degrees), thickness, darkness; a little wave across each. */
const LASH_VARY = { len: 0.35, angle: 12, width: 0.6, dark: 0.3, wave: 0.05 };

const hash = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const turn = (v: V, toward: V, deg: number): V => {     // v turned by deg towards `toward` (both unit, about perpendicular)
  const a = (deg * Math.PI) / 180;
  return unit(add(mul(v, Math.cos(a)), mul(toward, Math.sin(a))));
};
/**
 * A point along her lash line at share x of its length and its normal there (towards `side`), turning smoothly along it
 * (each landmark's the mean of its two segments'): with each segment's own, neighbouring lashes stood parallel in
 * groups between her landmarks.
 */
function lashLine(line: V[], side: V): (x: number) => [V, V] {
  const seg = line.slice(1).map((b, i) => Math.hypot(b[0] - line[i][0], b[1] - line[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const segN = line.slice(1).map((b, i): V => {
    const d = unit(sub(b, line[i])), n: V = [-d[1], d[0]];
    return n[0] * side[0] + n[1] * side[1] < 0 ? mul(n, -1) : n;
  });
  const N = line.map((_, i) => unit(add(segN[Math.max(0, i - 1)], segN[Math.min(segN.length - 1, i)])));
  return (x) => {
    let s = Math.min(1, Math.max(0, x)) * total, i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const f = seg[i] ? Math.min(1, s / seg[i]) : 0;
    return [lerp(line[i], line[i + 1], f), unit(lerp(N[i], N[i + 1], f))];
  };
}

/**
 * Her lashes as strands, triangles in pixels for the "strand" program: per vertex x, y, its distance across the strand
 * and the strand's half-width there (pixels), how dark. `shown`: how much of each eye is seen (image-left eye, the other).
 */
export function lashStrands(P: Pt[], style: string, lower: boolean, shown: [number, number] = [1, 1]): Float32Array {
  const { ew, down, sides } = frame(P), up = mul(down, -1);
  const S = LASH_STYLES[style] ?? LASH_STYLES.natural;
  const out: number[] = [];
  // (a cubic curve from its root through two points to its tip; its half-width and darkness fading towards the tip)
  const strand = (root: V, c1: V, c2: V, tip: V, hw: number, dark: number) => {
    const pts: Array<[V, number, number]> = [];
    for (let k = 0; k <= STRAND_STEPS; k++) {
      const u = k / STRAND_STEPS, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
      pts.push([[a * root[0] + b * c1[0] + c * c2[0] + d * tip[0], a * root[1] + b * c1[1] + c * c2[1] + d * tip[1]],
        Math.max(0.12, hw * (1 - STRAND_TAPER * u ** 1.3)), dark * (1 - STRAND_TIP_LIGHT * u ** 1.6)]);
    }
    const edge = pts.map(([q, h, dk], k) => {
      const p0 = pts[Math.max(0, k - 1)][0], p1 = pts[Math.min(pts.length - 1, k + 1)][0], t = unit(sub(p1, p0));
      const n: V = [-t[1], t[0]], w = h + 1;          // (one pixel more on each side: its edge fades over it)
      return [add(q, mul(n, w)), add(q, mul(n, -w)), w, h, dk] as const;
    });
    for (let k = 0; k < edge.length - 1; k++) {
      const [a0, a1, wa, ha, da] = edge[k], [b0, b1, wb, hb, db] = edge[k + 1];
      out.push(a0[0], a0[1], wa, ha, da, a1[0], a1[1], -wa, ha, da, b0[0], b0[1], wb, hb, db);
      out.push(a1[0], a1[1], -wa, ha, da, b1[0], b1[1], -wb, hb, db, b0[0], b0[1], wb, hb, db);
    }
  };
  // (a lash from `root` along `n` (her lash line's normal), pointing `theta` degrees out, `L` long, curled as LASH_CURL;
  // `pull` moves its tip (and its far control point part of the way), as a clump draws it in)
  const curled = (root: V, n: V, out_: V, theta: number, L: number, wave: number, pull: V = [0, 0], k = 1) => {
    const d = (deg: number) => turn(n, out_, Math.min(88, theta + deg * k));
    const side: V = [-n[1], n[0]];
    const c1 = add(root, mul(d(LASH_CURL[0]), L * LASH_BEND[0]));
    const c2 = add(add(root, mul(d(LASH_CURL[1]), L * LASH_BEND[1])), add(mul(side, wave * L), mul(pull, 0.45)));
    const tip = add(add(root, mul(d(LASH_CURL[2]), L)), pull);
    return [c1, c2, tip] as const;
  };
  // (where a lash of length L from `root` along `n` pointing `theta` out ends, uncurled by its clump)
  const end = (root: V, n: V, out_: V, theta: number, L: number, k = 1) => add(root, mul(turn(n, out_, theta + LASH_CURL[2] * k), L));
  sides.forEach((s, side) => {
    const seen = shown[side];
    if (seen < 0.05) return;
    const at = lashLine(s.upper.map((i) => pt(P, i)), up);
    // (the strands as long as this eye is wide in the photo: a turned head's far eye is narrower)
    const own = Math.min(ew, Math.hypot(s.outer[0] - s.inner[0], s.outer[1] - s.inner[1]));
    const fan = (t: number) => LASH_FAN[0] + LASH_FAN[1] * Math.max(0, t) ** LASH_FAN[2];
    // (how long they look: short at her inner corner, longest towards her outer corner (longer still for volume and
    // false lashes), a little shorter at its very end; her middle ones foreshortened)
    const curl = (t: number) => LASH_CURL_FROM + (1 - LASH_CURL_FROM) * smooth(0.3, 0.9, t);
    const reach = (t: number) => own * S.len * (0.35 + 0.65 * smooth(0.02, 0.4, t)) * (1 + S.outer * smooth(0.5, 0.95, t))
      * (1 - 0.4 * smooth(0.93, 1.03, t)) * (LASH_SEEN[0] + (1 - LASH_SEEN[0]) * smooth(LASH_SEEN[1], LASH_SEEN[2], t));
    const rootAt = (t: number) => { const [q, n] = at(t); return [add(q, mul(n, -ew * 0.004)), n] as const; };
    // (fine single lashes first, under the clumps; both eyes alike, mirrored, as a pair of strips or her own two eyes)
    for (let j = 0; j < S.wisps; j++) {
      const r = (k: number) => hash(j + 11, k);
      const t = 0.05 + 0.92 * ((j + 0.5 + (r(1) - 0.5) * 0.8) / S.wisps), [root, n] = rootAt(t);
      const [c1, c2, tip] = curled(root, n, s.out, fan(t) + (r(3) - 0.5) * 24, reach(t) * (0.55 + 0.35 * r(2)), (r(4) - 0.5) * 0.1, [0, 0], curl(t));
      strand(root, c1, c2, tip, S.hw * own * 0.7, S.dark * seen * 0.7);
    }
    // (the clumps: each a few strands from neighbouring roots, their tips drawn towards the clump's middle line, as long
    // or short as it; every other clump a little shorter)
    const T0 = 0.03, T1 = 0.99, w = (T1 - T0) / S.clumps;
    for (let c = 0; c < S.clumps; c++) {
      const r = (k: number) => hash(c, k);
      const tc = T0 + w * (c + 0.5 + (r(1) - 0.5) * 0.5), [rootC, nC] = rootAt(tc);
      const m = Math.max(1, Math.round((S.per[0] + Math.floor(r(2) * (S.per[1] - S.per[0] + 1))) * (0.5 + 0.5 * smooth(0, 0.3, tc))));
      const Lc = reach(tc) * (c % 2 ? 1 - S.alt : 1) * (1 - LASH_VARY.len / 2 + LASH_VARY.len * r(3));
      const thC = fan(tc) + (r(4) - 0.5) * LASH_VARY.angle;
      for (let k = 0; k < m; k++) {
        const q = (i: number) => hash(c * 7 + k, 20 + i);
        const [root, n] = rootAt(tc + w * 0.95 * ((k + 0.5) / m - 0.5 + (q(1) - 0.5) * 0.3));
        const L = Lc * (0.75 + 0.3 * q(2)), th = thC + (q(3) - 0.5) * 10;
        const kc = curl(tc), pull = mul(sub(end(rootC, nC, s.out, thC, L, kc), end(root, n, s.out, th, L, kc)), S.pull * (0.75 + 0.25 * q(4)));
        const [c1, c2, tip] = curled(root, n, s.out, th, L, (q(5) - 0.5) * 2 * LASH_VARY.wave, pull, kc);
        strand(root, c1, c2, tip, S.hw * own * (1 - LASH_VARY.width / 2 + LASH_VARY.width * q(6)), S.dark * seen * (1 - LASH_VARY.dark * q(7)));
      }
    }
    if (lower || style === "dramatic") {
      const low = lashLine(s.lower.map((i) => pt(P, i)), down), K = LOWER_LASHES, wl = (1 - K.from - 0.04) / K.clumps;
      for (let c = 0; c < K.clumps; c++) {
        const r = (k: number) => hash(c + 7, k);
        const tc = K.from + wl * (c + 0.5 + (r(3) - 0.5) * 0.5);
        const Lc = own * K.len * (0.6 + 0.4 * smooth(0.2, 0.8, tc)) * (0.75 + 0.5 * r(1)) * (lower ? 1 : 0.7);
        const m = K.per[0] + Math.floor(r(2) * (K.per[1] - K.per[0] + 1)), thC = 15 + 30 * tc + (r(4) - 0.5) * 10;
        const [qC, nC] = low(tc), rootC = add(qC, mul(nC, -ew * 0.003));
        for (let k = 0; k < m; k++) {
          const q = (i: number) => hash(c * 5 + k + 40, i);
          const [p, n] = low(tc + wl * 0.8 * ((k + 0.5) / m - 0.5)), root = add(p, mul(n, -ew * 0.003));
          const L = Lc * (0.8 + 0.25 * q(1)), th = thC + (q(2) - 0.5) * 8;
          const tipC = add(rootC, mul(turn(nC, s.out, thC - 6), L)), own_ = add(root, mul(turn(n, s.out, th - 6), L));
          const pull = mul(sub(tipC, own_), K.pull);
          strand(root, add(root, mul(turn(n, s.out, th + 2), L * 0.35)), add(add(root, mul(turn(n, s.out, th - 2), L * 0.7)), mul(pull, 0.45)),
            add(own_, pull), K.hw * own * (0.8 + 0.4 * q(3)), K.dark * seen * (lower ? 1 : 0.7));
        }
      }
    }
  });
  return Float32Array.from(out);
}

/* ------------------------------------------------------------ face stats */

const LIN = Float32Array.from({ length: 256 }, (_, i) => (i / 255) ** 2.2);
const quantile = (sorted: Float32Array, q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];

/**
 * Her light and colour references, on a small copy of the face: the colour of the whites of her
 * eyes, the brightness of her skin, and the typical brightness of her lips. As in teacher.py.
 */
export function measureFace(source: CanvasImageSource, P: Pt[]): FaceStats {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of OVAL) { x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); y0 = Math.min(y0, P[i][1]); y1 = Math.max(y1, P[i][1]); }
  const s = Math.min(1, 256 / Math.max(1, x1 - x0, y1 - y0));
  const w = Math.max(8, Math.ceil((x1 - x0) * s) + 2), h = Math.max(8, Math.ceil((y1 - y0) * s) + 2);
  const at = (p: [number, number]): [number, number] => [(p[0] - x0) * s + 1, (p[1] - y0) * s + 1];
  const make = () => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    return c.getContext("2d", { willReadFrequently: true })!;
  };
  const img = make();
  img.drawImage(source, x0 - 1 / s, y0 - 1 / s, w / s, h / s, 0, 0, w, h);
  const px = img.getImageData(0, 0, w, h).data;
  const fill = (g: CanvasRenderingContext2D, poly: [number, number][], op: GlobalCompositeOperation = "source-over") => {
    g.globalCompositeOperation = op;
    g.beginPath();
    poly.forEach((p, k) => { const [x, y] = at(p); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath(); g.fillStyle = "#fff"; g.fill();
  };
  const read = (g: CanvasRenderingContext2D) => g.getImageData(0, 0, w, h).data;

  const balls = make(); fill(balls, ring(P, EYE_R, 0.85, 0.5)); fill(balls, ring(P, EYE_L, 0.85, 0.5));
  if (P.length >= 478) {    // not her irises: light blue or grey eyes and their catchlights read as a cold light
    balls.globalCompositeOperation = "destination-out";
    for (const c of [468, 473]) {
      const r = [1, 2, 3, 4].reduce((sum, k) => sum + Math.hypot(P[c + k][0] - P[c][0], P[c + k][1] - P[c][1]), 0) / 4;
      const [x, y] = at([P[c][0], P[c][1]]);
      balls.beginPath(); balls.arc(x, y, r * 1.2 * s, 0, Math.PI * 2); balls.fill();
    }
  }
  const lips = make(); fill(lips, ring(P, LIPS_OUT)); fill(lips, ring(P, LIPS_IN), "destination-out");
  const skin = make(); fill(skin, ring(P, OVAL)); fill(skin, ring(P, LIPS_OUT), "destination-out");
  for (const ids of [EYE_R, EYE_L, BROW_R, BROW_L]) fill(skin, ring(P, ids, 1.75), "destination-out");
  const mb = read(balls), ml = read(lips), ms = read(skin);

  const sc: number[][] = [], lipY: number[] = [], skinY: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = LIN[px[o]], g = LIN[px[o + 1]], b = LIN[px[o + 2]], Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (mb[o + 3] > 127) sc.push([r, g, b, Y]);
    if (ml[o + 3] > 127) lipY.push(Y);
    if (ms[o + 3] > 127) skinY.push(Y);
  }
  let sclera: number[] | null = null;
  if (sc.length >= 30) {
    const ys = Float32Array.from(sc.map((v) => v[3])).sort();
    const cut = quantile(ys, 0.7);
    const bright = sc.filter((v) => v[3] >= cut);
    sclera = [0, 1, 2].map((c) => quantile(Float32Array.from(bright.map((v) => v[c])).sort(), 0.5));
  }
  let lipRef: number | null = null;
  if (lipY.length >= 20) {
    const ys = Float32Array.from(lipY).sort();
    const lo = quantile(ys, 0.15), hi = quantile(ys, 0.8);
    let sum = 0, n = 0;
    for (const y of ys) if (y > lo && y < hi) { sum += y; n++; }
    lipRef = n ? sum / n : quantile(ys, 0.5);
  }
  const skinLum = skinY.length > 50 ? quantile(Float32Array.from(skinY).sort(), 0.5) : null;
  // her cheek just under each eye (the concealer's reference) and her skin's colour there
  const ew = eyeWidth(P), ax0 = [P[263][0] - P[33][0], P[263][1] - P[33][1]], an = Math.hypot(ax0[0], ax0[1]) || 1;
  const ax = [ax0[0] / an, ax0[1] / an];
  let dn = [-ax[1], ax[0]];
  if (dn[0] * (P[152][0] - P[10][0]) + dn[1] * (P[152][1] - P[10][1]) < 0) dn = [-dn[0], -dn[1]];
  const tones: number[][] = [];
  const under = [[EYE_R, -1], [EYE_L, 1]].map(([ids, out]) => {
    const e = ids as number[], o = out as number;
    const m = e.reduce((acc, i) => [acc[0] + P[i][0] / e.length, acc[1] + P[i][1] / e.length], [0, 0]);
    const c = at([m[0] + dn[0] * ew * CONCEAL_REF[0] + ax[0] * o * ew * CONCEAL_REF[1], m[1] + dn[1] * ew * CONCEAL_REF[0] + ax[1] * o * ew * CONCEAL_REF[1]]);
    const r = ew * CONCEAL_REF[2] * s, ys: number[] = [];
    for (let y = Math.max(0, Math.floor(c[1] - r)); y <= Math.min(h - 1, Math.ceil(c[1] + r)); y++) {
      for (let x = Math.max(0, Math.floor(c[0] - r)); x <= Math.min(w - 1, Math.ceil(c[0] + r)); x++) {
        if ((x - c[0]) ** 2 + (y - c[1]) ** 2 > r * r) continue;
        const k = (y * w + x) * 4, rr = LIN[px[k]], gg = LIN[px[k + 1]], bb = LIN[px[k + 2]], Y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
        ys.push(Y);
        if (Y > 1e-4) tones.push([rr / Y, gg / Y, bb / Y]);
      }
    }
    return ys.length >= 8 ? quantile(Float32Array.from(ys).sort(), CONCEAL_Q) : 0;
  });
  const tone = tones.length >= 16 ? [0, 1, 2].map((k) => quantile(Float32Array.from(tones.map((t) => t[k])).sort(), 0.5)) : null;
  // her brow hairs: the darker part (BROW_HAIR_Q) of what lies inside her brows' outline, its middle colour
  const browsM = make(); fill(browsM, ring(P, BROW_R)); fill(browsM, ring(P, BROW_L));
  const mbw = read(browsM), bw: number[][] = [];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (mbw[o + 3] > 127) { const r = LIN[px[o]], g = LIN[px[o + 1]], b = LIN[px[o + 2]]; bw.push([r, g, b, 0.2126 * r + 0.7152 * g + 0.0722 * b]); }
  }
  let brow: number[] | null = null;
  if (bw.length >= 20) {
    const cut = quantile(Float32Array.from(bw.map((v) => v[3])).sort(), BROW_HAIR_Q);
    const dark = bw.filter((v) => v[3] <= cut);
    brow = [0, 1, 2].map((c) => quantile(Float32Array.from(dark.map((v) => v[c])).sort(), 0.5));
  }
  return { sclera, skin: skinLum, lipRef, under: under[0] > 0 && under[1] > 0 ? [under[0], under[1]] : null, tone, brow };
}


/** At most this much more (or less) of one colour in her light than the mean (her eye whites over the catalog's). */
const LIGHT_CAST = 1.08;
/**
 * Her light can be this dim against the catalog photo's, no dimmer (her skin bounds it first: FAIREST). It was 0.3: in a
 * dark photo (a dim room, the benchmark's poorly lit faces at 0.01-0.03) the lipstick then came out 10 to 40 times
 * brighter than her lips' light allowed, a glowing red on a dark face.
 */
const LIGHT_MIN = 0.005;
/**
 * The lipstick colour for her photo (linear RGB) and the mean light factor, as lip_target in teacher.py: the look's
 * lipstick in her light (her eye whites over the catalog's); nude shades also follow her skin's own depth (her skin over
 * the catalog model's, her light taken out: a nude chosen for the model becomes the same nude for her), deep ones not.
 */
export function lipTarget(lip: LipInfo, face: FaceStats): { colour: number[]; light: number; rgb: number[] } {
  let colour = lip.colour.slice();
  let light = [1, 1, 1], g = 1;
  if (face.sclera && lip.sclera) {
    const e = face.sclera.map((v, c) => v / Math.max(lip.sclera![c], 1e-4));
    const mean = (e[0] + e[1] + e[2]) / 3;
    // Small, soft or shaded eyes read too dark: her light can't be dimmer than her skin allows.
    const floor = face.skin && lip.skin ? face.skin / lip.skin / FAIREST : 0;
    const ceiling = face.skin && lip.skin ? (face.skin / lip.skin) * DEEPEST : Infinity;
    g = Math.min(2, Math.max(LIGHT_MIN, Math.min(mean, ceiling), floor)) ** 0.85;
    // (her eye whites are a rough white: their own tint and reflections mustn't turn every product cold or warm)
    light = e.map((v) => g * Math.min(LIGHT_CAST, Math.max(1 / LIGHT_CAST, v / mean)) ** 0.8);
  }
  if (face.skin && lip.skin) {
    const depth = Math.min(2.5, Math.max(0.15, face.skin / lip.skin / g)) ** 0.6;
    const y = (0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2]) / lip.skin;
    const t = Math.min(1, Math.max(0, (y - NUDE_DEEP[0]) / (NUDE_DEEP[1] - NUDE_DEEP[0])));
    const w = lip.nude * t * t * (3 - 2 * t);
    colour = colour.map((c) => c * (1 - w + w * depth));
  }
  const mean = (light[0] + light[1] + light[2]) / 3;
  return { colour: colour.map((c, i) => c * light[i]), light: mean, rgb: light.map((v) => v / mean) };
}

/* ---------------------------------------------------------------- shaders */

const QUAD_VS = `#version 300 es
in vec2 aPos; uniform float uFlip; out vec2 v;
void main() { v = aPos * 0.5 + 0.5; gl_Position = vec4(aPos.x, aPos.y * uFlip, 0.0, 1.0); }`;

// Face-mesh warp: vertices at her landmarks (pixels, depth), texture coordinates in the look's file.
const MESH_VS = `#version 300 es
in vec3 aPt; in vec2 aUv; in float aW; uniform vec2 uSize; uniform vec2 uZ; uniform float uBias; out vec2 v; out float vw;
void main() {
  v = aUv; vw = aW;
  float d = (aPt.z - uZ.x) / max(uZ.y - uZ.x, 1e-3) * 1.8 - 0.9 - uBias;
  gl_Position = vec4(aPt.xy / uSize * 2.0 - 1.0, d, 1.0);
}`;
// The look's layer (rgb; uPick.y: faded towards her face's outline by the points' weights, 0.5 = no change),
// a coverage map (rgb) or the eye detail (alpha; times the points' weights: how much of that eye is seen).
const COPY_FS = `#version 300 es
precision highp float; in vec2 v; in float vw; uniform sampler2D uTex; uniform vec4 uPick; out vec4 o;
void main() {
  vec4 t = texture(uTex, v);
  if (uPick.z > 0.5) {            // the layer's skin-level colour times the points' weights, and the weights (extend_layer)
    vec3 q = clamp(t.rgb * 2.0 - 1.0, -0.996, 0.996), lr = 0.6 * log((1.0 + q) / (1.0 - q));
    float w = clamp(vw, 0.0, 1.0);
    o = vec4(0.5 + clamp(lr, -${EXTEND_T}, ${EXTEND_T}) * w * 2.0, w);
    return;
  }
  o = uPick.x > 0.5 ? vec4(uPick.y > 0.5 ? mix(vec3(0.5), t.rgb, clamp(vw, 0.0, 1.0)) : t.rgb, 0.0) : vec4(0.0, 0.0, 0.0, t.r * clamp(vw, 0.0, 1.0));
}`;

// The look at and beyond the edge of the face mesh (extend_layer in teacher.py); the layer comes in unfeathered.
const EXTEND_FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D uLayer, uExtA, uExtB, uExtN; uniform vec4 uWork; uniform float uEw; uniform vec2 uSize; out vec4 o;
void main() {
  vec4 L = texture(uLayer, v), B = texture(uExtB, v), N = texture(uExtN, v);
  float w = texture(uExtA, v).a, a = w * w, r = smoothstep(0.5, 0.9, N.a);
  vec3 numB = (B.rgb - 0.5) * 0.5, numN = (N.rgb - 0.5) * 0.5;
  vec3 wide = B.a > 0.5 ? numB / B.a : numB * 2.0;   // the colour around, as sure as there is mesh around
  vec3 near = numN / max(N.a, 0.05);                 // the colour just here, smoothed
  vec2 px = v * uSize;
  float e = min(min(px.x - uWork.x, uWork.z - px.x), min(px.y - uWork.y, uWork.w - px.y));
  vec3 q = clamp(L.rgb * 2.0 - 1.0, -0.996, 0.996);
  vec3 lr = a * 0.6 * log((1.0 + q) / (1.0 - q)) + (1.0 - a) * mix(wide, near, r) * smoothstep(0.0, 0.25 * uEw, e);
  o = vec4((tanh(lr / 1.2) + 1.0) * 0.5, L.a);
}`;

// Her foundation, at 1/EXTEND_SCALE of the size: her light where it counts as her visible skin (rgb, times that) and how
// much it does (a), for the normalized convolutions of foundation() in teacher.py; with uChroma her light's colour
// (over its brightness: every part of her skin counted alike, for her face's average colour).
const FOUND_PREP_FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D uSrc, uR, uVis; uniform int uVisMode, uChroma; uniform vec3 uVisBox; uniform vec2 uSize;
uniform float uSkinY; out vec4 o;
void main() {
  vec3 src = texture(uSrc, v).rgb, lu = pow(src, vec3(2.2));
  float S = texture(uR, v).r;
  if (uVisMode > 0) {
    vec4 A = texture(uVis, (v * uSize - uVisBox.xy) / uVisBox.z);
    S *= uVisMode == 2 ? clamp(dot(A.rgb, src - 0.5) + A.a, 0.0, 1.0) : A.r;
  }
  float y = dot(lu, vec3(0.2126, 0.7152, 0.0722));
  if (uSkinY > 0.0) S *= smoothstep(${FOUND_DARK[0]}, ${FOUND_DARK[1]}, y / uSkinY);
  o = vec4((uChroma == 1 ? lu / max(y, 1e-4) : lu) * S, S);
}`;

// Her photo with her foundation on (foundation() in teacher.py): her skin's colour (softened a little, N) brought towards
// her face's broad colour (C) at the same brightness, and where her broad brightness (L) is below her skin's median
// (uSkinY) lifted part of the way; only where her face is seen. The main pass paints the look over this. Where it goes
// on is uR.g (uR.r: where her skin is measured); her own makeup's foundation has a shade (uFTint, a colour gain) and a
// finish (uFFinish: her skin's own shine taken down, -1 matte, or brought up, 1 dewy). The shade is blended a little
// down her neck (neck_weight in teacher.py: uNeck her chin and her face's down, uNeckW her eye width and half her jaw's).
const FOUND_FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D uSrc, uR, uN, uC, uL, uVis, uFace, uF, uM, uRet; uniform int uVisMode, uFaceOn;
uniform vec3 uVisBox; uniform vec2 uSize; uniform vec4 uWork; uniform float uK, uSkinY; uniform vec3 uFTint; uniform float uFFinish, uCover, uRetK;
uniform vec4 uNeck; uniform vec2 uNeckW; out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
${SHOULDER_GLSL}
void main() {
  vec3 src = texture(uSrc, v).rgb;
  vec2 px = v * uSize;
  if (px.x < uWork.x || px.y < uWork.y || px.x > uWork.z || px.y > uWork.w) { o = vec4(src, 1.0); return; }
  float vis = 1.0;
  if (uVisMode > 0) {
    vec4 A = texture(uVis, (v * uSize - uVisBox.xy) / uVisBox.z);
    vis = uVisMode == 2 ? clamp(dot(A.rgb, src - 0.5) + A.a, 0.0, 1.0) : A.r;
  }
  float shape = clamp(texture(uR, v).g, 0.0, 2.0);
  // her skin perfected (RETOUCH_FULL), where her face is seen
  if (uRetK > 0.0) src = mix(src, texture(uRet, v).rgb, uRetK * clamp(shape, 0.0, 1.0) * vis);
  vec4 N = texture(uN, v), C = texture(uC, v);
  float yN = max(luma(N.rgb), 1e-6), yC = max(luma(C.rgb), 1e-6);
  vec3 cg = pow((C.rgb / yC) / max(N.rgb / yN, vec3(1e-5)), vec3(${FOUND_COLOUR} * uK));
  cg /= max(luma(cg), 1e-5);
  vec3 lu = pow(src, vec3(2.2));
  float yShine = yN / max(N.a, 1e-4);   // (what her shine is measured against, and at)
  float yHere = luma(lu);
  if (uCover > 0.0) {             // its coverage (COVER_*): blotches of brightness and finer colour even out
    vec4 F = texture(uF, v), M = texture(uM, v);
    float yF = max(luma(F.rgb), 1e-6), sure = clamp(F.a / 0.1, 0.0, 1.0) * clamp(M.a / 0.1, 0.0, 1.0);
    float fine = log(max(yHere, 1e-6) / max(yF / max(F.a, 1e-4), 1e-6));
    sure *= smoothstep(${FOUND_DARK[0]}, ${FOUND_DARK[1]}, exp(fine));
    cg *= exp(-uCover * sure * ${COVER_PORE} * fine * ${COVER_PORE_T * COVER_PORE_T} / (${COVER_PORE_T * COVER_PORE_T} + fine * fine));
    yHere = mix(yHere, yF / max(F.a, 1e-4), sure);
    float band = clamp(log((yF / max(F.a, 1e-4)) / max(luma(M.rgb) / max(M.a, 1e-4), 1e-6)), -${COVER_BAND}, ${COVER_BAND});
    float keep = ${COVER_T * COVER_T} / (${COVER_T * COVER_T} + band * band);
    if (band < 0.0) keep = mix(${COVER_DARK}, 1.0, keep);
    cg *= exp(-uCover * sure * ${COVER_LIGHT} * band * keep);
    vec3 cc = pow(clamp((N.rgb / yN) / max(F.rgb / yF, vec3(1e-5)), 0.6, 1.6), vec3(uCover * sure * ${COVER_COLOUR}));
    cg *= cc / max(luma(cc), 1e-5);
  }
  if (uSkinY > 0.0) {
    vec4 L = texture(uL, v);
    float yL = luma(L.rgb) / max(L.a, 1e-4);
    // her face, not her ears or neck: the segmenter's face-skin probability, from FOUND_FACE[0] to FOUND_FACE[1]
    float face = uFaceOn == 1 ? smoothstep(${FOUND_FACE[0]}, ${FOUND_FACE[1]}, texture(uFace, (v * uSize - uVisBox.xy) / uVisBox.z).r) : 1.0;
    cg *= pow(clamp(uSkinY / max(yL, 1e-6), 1.0, ${FOUND_LIFT}), ${FOUND_LIGHT} * uK * face);
  }
  cg *= uFTint;
  if (uFFinish != 0.0) {          // her shine over her skin's softened brightness: matte takes it down, dewy brings it up
    float hl = yHere / max(yShine, 1e-6);
    cg *= hl > 1.0 ? pow(hl, uFFinish * (uFFinish < 0.0 ? 0.75 : 0.9)) : 1.0;
  }
  float w = shape * clamp(N.a / 0.1, 0.0, 1.0) * vis;
  lu *= 1.0 + (cg - 1.0) * w;
  if (uFaceOn == 1 && uNeckW.x > 0.0) {   // her neck: her body skin below her jaw, outside the foundation's shape
    vec2 r = px - uNeck.xy;
    float d = dot(r, uNeck.zw) / uNeckW.x, side = abs(dot(r, vec2(-uNeck.w, uNeck.z))) / uNeckW.y;
    float body = smoothstep(0.3, 0.8, texture(uFace, (px - uVisBox.xy) / uVisBox.z).g);
    float wn = clamp(1.0 - shape, 0.0, 1.0) * body * smoothstep(${TINT_NECK[0]}, ${TINT_NECK[1]}, d) * (1.0 - smoothstep(0.0, ${TINT_NECK[2]}, d))
      * (1.0 - smoothstep(0.9, 1.1, side));
    lu *= 1.0 + (uFTint - 1.0) * wn;
  }
  o = vec4(pow(clamp(shoulder(lu, pow(src, vec3(2.2))), 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);   // (her camera's white)
}`;

// Bare-face coordinates (pixels, per mesh vertex) as two 16-bit numbers, for the glitter grains.
const CANON_FS = `#version 300 es
precision highp float; in vec2 v; out vec4 o;
vec2 enc(float x) { float q = floor(clamp(x / 2048.0, 0.0, 1.0) * 65535.0 + 0.5); float hi = floor(q / 256.0); return vec2(hi, q - hi * 256.0) / 255.0; }
void main() { o = vec4(enc(v.x), enc(v.y)); }`;

// Which half of her face is in front (the mesh with each point's half, nearer triangles in front), as 0..1.
const SIDE_FS = `#version 300 es
precision highp float; in vec2 v; out vec4 o; void main() { o = vec4(v.x * 0.5 + 0.5, 0.0, 0.0, 1.0); }`;

// A soft spot (her own eyeshadow's lid, inner-corner and under-eye spots): none at its rim, added onto a channel of a
// target (uColor picks it). On 8-bit targets each spot rounds up or down at random, so overlapping spots add up without steps.
const DAB_VS = `#version 300 es
in vec2 aXy; in vec2 aUv; in float aW; uniform vec2 uSize; out vec2 q; out float a;
void main() { q = aUv; a = aW; gl_Position = vec4(aXy / uSize * 2.0 - 1.0, 0.0, 1.0); }`;
const DAB_FS = `#version 300 es
precision highp float; in vec2 q; in float a; uniform vec4 uColor; uniform int uDither; out vec4 o;
void main() {
  float d = dot(q, q);
  if (d >= 1.0) discard;
  float x = a * exp(-4.0 * d) * (1.0 - d);
  if (uDither == 1) x = floor(x * 255.0 + fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) / 255.0;
  o = uColor * x;
}`;

// A lash strand (lashStrands): q.x its distance across (pixels), q.y its half-width there; its edge faded over a pixel
// (a strand thinner than a pixel is that much fainter), as dark as `a`, laid over the strands under it (alpha only).
const STRAND_FS = `#version 300 es
precision highp float; in vec2 q; in float a; out vec4 o;
void main() {
  float c = clamp(max(q.y, 0.5) - abs(q.x) + 0.5, 0.0, 1.0) * min(1.0, 2.0 * q.y);
  o = vec4(0.0, 0.0, 0.0, a * c);
}`;

// A rhinestone, onto the finished picture: q from the stone's centre (its radius 1; the quad is bigger for its sparkle),
// a its own number. A flat-backed crystal: a bright table in the middle, facets around it each catching her light (or
// not) with a little play of colour, a darker edge where its setting is, and a star of light; as soft as her photo
// (uBlur, pixels), as bright as her light (uWhite), shown as much as her liner step is (uShow). Out: sRGB, premultiplied.
const STONE_VS = `#version 300 es
in vec2 aXy; in vec2 aUv; in float aW; uniform vec2 uSize; uniform float uFlip; out vec2 q; out float a;
void main() { q = aUv; a = aW; vec2 p = aXy / uSize * 2.0 - 1.0; gl_Position = vec4(p.x, p.y * uFlip, 0.0, 1.0); }`;
const STONE_FS = `#version 300 es
precision highp float; in vec2 q; in float a; uniform vec3 uWhite; uniform float uBlur, uShow; out vec4 o;
float hash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
void main() {
  float r = length(q), px = max(fwidth(r), 1e-4), soft = px * max(1.0, uBlur);
  float body = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, r);
  float ang = mod(atan(q.y, q.x) + a * 6.2832, 6.2832), f = floor(ang / 6.2832 * 8.0);
  float h = hash(f + a * 97.0), h2 = hash(f * 3.1 + a * 41.0);
  vec3 c = vec3(r < 0.45 ? 0.82 + 0.18 * h : mix(0.28, 1.0, h));
  c *= 0.84 + 0.16 * cos(6.2832 * (h2 + vec3(0.0, 0.33, 0.67)));
  c *= mix(1.0, 0.45, smoothstep(0.78, 1.0, r));
  c = min(c * uWhite * ${STONE_LIGHT.toFixed(2)}, vec3(1.0));
  vec2 g = q - vec2(-0.3, 0.32);
  float star = exp(-dot(g, g) * 45.0) + 0.55 * (exp(-abs(g.y) * 30.0 - abs(g.x) * 3.2) + exp(-abs(g.x) * 30.0 - abs(g.y) * 3.2));
  vec3 glint = min(vec3(star) * uWhite * 1.3, vec3(1.0));
  o = vec4((pow(c, vec3(1.0 / 2.2)) * body + pow(glint, vec3(1.0 / 2.2)) * (1.0 - 0.5 * body)) * uShow, body * uShow);
}`;

// Her eyeshadow's drawn placement (shadowPattern): each vertex's coverage, onto one channel (uColor picks it).
const PATTERN_FS = `#version 300 es
precision highp float; in vec2 q; in float a; uniform vec4 uColor; out vec4 o;
void main() { o = uColor * clamp(a, 0.0, 1.0); }`;

const FLAT_VS = `#version 300 es
in vec2 aXy; uniform vec2 uSize; void main() { gl_Position = vec4(aXy / uSize * 2.0 - 1.0, 0.0, 1.0); }`;
const FLAT_FS = `#version 300 es
precision mediump float; uniform vec4 uColor; out vec4 o; void main() { o = uColor; }`;
// A step's zone polygon of one half of her face (uHalf -1 / 1) only where that half (or the midline) is in
// front: her far cheek's zone stays off her nose on a turned head (_fill in products.py).
const ZONE_FS = `#version 300 es
precision mediump float; uniform vec4 uColor; uniform sampler2D uSide; uniform float uHalf; out vec4 o;
void main() {
  float s = texelFetch(uSide, ivec2(gl_FragCoord.xy), 0).r * 2.0 - 1.0;
  o = uColor * (uHalf == 0.0 ? 1.0 : smoothstep(-0.5, 0.0, s * uHalf));
}`;

// Her lip brightness (masked, for the lipstick shading), her grey level (for the eye detail) and her
// brightness without eyeballs and mouth (for the shading of her own products, as shading() in products.py).
const PREP_FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D uSrc, uMask;
layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1; layout(location = 2) out vec4 o2;
void main() {
  vec3 s = texture(uSrc, v).rgb; vec3 l = pow(s, vec3(2.2));
  vec4 m = texture(uMask, v);
  float Y = dot(l, vec3(0.2126, 0.7152, 0.0722)); float hard = m.b;
  o0 = vec4(Y * hard, hard, Y * hard, hard);
  float g = dot(s, vec3(0.299, 0.587, 0.114)); o1 = vec4(g, g, Y * hard, hard);
  float w = (1.0 - m.r) * (1.0 - m.g); o2 = vec4(Y * w, w, Y, Y);
}`;

// Separable Gaussian blur with a different width for each channel; wide blurs take every uStride-th pixel.
const BLUR_FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D uTex; uniform vec2 uStep; uniform vec4 uSigma, uCap; uniform int uR; uniform float uStride; out vec4 o;
void main() {
  vec4 inv = 1.0 / (2.0 * uSigma * uSigma), acc = vec4(0.0), sum = vec4(0.0);
  for (int i = -uR; i <= uR; i++) {
    float x = float(i) * uStride; vec4 w = exp(-x * x * inv);
    acc += min(texture(uTex, v + uStep * x), uCap) * w; sum += w;
  }
  o = acc / sum;
}`;

// Her visible face on the grid over the segmenter's crop (occlusion.py): her photo there (minus 0.5, about
// area-averaged), the coarse map p (face skin, plus body skin outside her oval), and the products the
// guided filter averages: I p, I I (diagonal), I I (cross).
const VIS_PREP_FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D uSrc, uProb, uOval; uniform vec4 uBox; uniform vec2 uPhoto; uniform int uCoarse, uDirect;
layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1; layout(location = 2) out vec4 o2; layout(location = 3) out vec4 o3;
void main() {
  vec2 at = uBox.xy + v * uBox.z;
  vec3 I = vec3(0.0);
  float cell = uBox.z / uBox.w;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) I += texture(uSrc, (at + vec2(float(x), float(y)) * cell / 3.0) / uPhoto).rgb;
  I = I / 9.0 - 0.5;
  vec2 pr = texture(uProb, v).rg;
  float p = uDirect == 1 ? pr.r : clamp((pr.r + pr.g * (1.0 - texture(uOval, v).r) - ${VIS_LO}) / ${VIS_HI - VIS_LO}, 0.0, 1.0);
  if (uCoarse == 1) { o0 = vec4(p, p, p, 1.0); return; }
  o0 = vec4(I, p); o1 = vec4(I * p, 0.0); o2 = vec4(I * I, 0.0); o3 = vec4(I.r * I.g, I.r * I.b, I.g * I.b, 0.0);
}`;

// The guided filter's local linear model at each grid pixel: q = a . I + b (fit() in occlusion.py).
const VIS_FIT_FS = `#version 300 es
precision highp float; in vec2 v; uniform sampler2D uS0, uS1, uS2, uS3; uniform float uEps; out vec4 o;
void main() {
  vec4 m = texture(uS0, v); vec3 Ip = texture(uS1, v).rgb, II = texture(uS2, v).rgb, X = texture(uS3, v).rgb;
  vec3 c = Ip - m.rgb * m.a;
  float rr = II.r - m.r * m.r + uEps, gg = II.g - m.g * m.g + uEps, bb = II.b - m.b * m.b + uEps;
  float rg = X.r - m.r * m.g, rb = X.g - m.r * m.b, gb = X.b - m.g * m.b;
  vec3 a = inverse(mat3(rr, rg, rb, rg, gg, gb, rb, gb, bb)) * c;
  o = vec4(a, m.a - dot(a, m.rgb));
}`;

const MAIN_FS = `#version 300 es
precision highp float; precision highp int; in vec2 v;
uniform sampler2D uSrc, uLayer, uMask, uLip, uGrey, uCanon;
uniform sampler2D uDetail;   // the eye detail (alpha), softened to her photo's sharpness
// her lips refined (lip_mask in teacher.py): 0 the detected shape, 1 the coarse probability, 2 the guided filter's models
uniform int uLipOn;
uniform sampler2D uLipM;
uniform vec3 uLipBox;
uniform vec3 uK;            // layer, lipstick, eye detail (intensity)
uniform float uLipTint;     // 1: the layer still has the look's lip colour (no extension: no fill over the lips)
uniform vec3 uTarget;       // lipstick colour for her light (linear)
uniform vec3 uOmbre;        // centre-over-edge colour for gradient lips
uniform float uAlpha, uGamma, uShine, uRef, uLipPig; uniform vec3 uLipRatio, uLightC;
uniform int uFinish;        // 0 plain, 1 lined, 2 ombre, 3 metallic, 4 glitter
uniform float uMetK, uLight, uEw, uCanonEw, uMatte;
// the gloss highlights by her lips' shape: lower and upper lip (centre, size along and across her mouth, pixels), her
// mouth's direction and the finish's gloss (LIP_GLOSS)
uniform vec4 uGlossLo, uGlossUp, uGlossDir;
// her lids' fullest part (centre, size along and across her eye, pixels) and each eye's direction (her own shimmer)
uniform vec4 uLidC[2], uLidDir;
uniform ivec2 uSize;
uniform vec4 uWork;         // where makeup can be: around her face (x0, y0, x1, y1 in pixels); elsewhere her pixels as they are
// step-by-step mode: zones (A: concealer, contour, blush, glow; B: shadow, liner band), how much of each
// step is on (STEP_KEYS order), the step being applied (its brush moves along uAx0/uAx1, uSweepMode)
uniform sampler2D uZoneA, uZoneB;
uniform int uStepsOn, uActive, uSweepMode;
uniform float uReveal[11], uFollow[11];
uniform float uProgress;
uniform vec4 uAx0, uAx1, uMid;
// her own products (products.py): the zones are on (uZonesOn) for steps or products; each step's intensity
// (uGain); which zones keep the look's own layer (uOwn: shadow, contour, blush, glow; 0 = her product
// replaces it); pigments in that order: reflectance, thickness at full coverage (0 = not swapped), how much
// deeper where packed, shimmer strength, finish (0 matte, 1 shimmer, 2 metallic, 3 glitter); eyeshadow
// coverage (uCov.r); her shading (uShadeF: form, uShadeB: broad light; masked sums); her light (uWhite)
uniform int uZonesOn;
uniform float uGain[11];
uniform float uLGain[11];   // the look's own layer, eye detail and lipstick per step zone (its calibration), times uGain
// (slots 4 and 5, her own makeup only: her second eyeshadow on her crease and outer corner, her inner-corner light)
uniform vec4 uOwn;
uniform float uPigX[6], uPigDeep[6], uPigSheen[6];
uniform vec3 uPig[6];
uniform int uPigFin[6], uPigOwn[6];
uniform sampler2D uCov, uShadeF, uShadeB;
uniform vec3 uWhite, uLiner;
uniform float uSkinRef;
uniform int uLinerOn;
// her own makeup on her bare face (Mine): no catalog layer; zoneA is her concealer, contour, blush and highlight, zoneB
// her freckles (r: her eyeshadow is in uCov), her liner, brows, and where the lash template's lashes go (the eye detail);
// uMineK: her concealer's brightness over her skin's median (x), how her eyeshadow's tool lays it (y: mineShadow)
// and whether it has a placement (z), her liner's opacity (w); her concealer's colour; her brow colour and its thickness
uniform int uMine;
uniform int uStrands;      // her lashes strand by strand (the eye detail is exactly them: not kept to the template's zone)
uniform float uFreckle;    // her freckles: how strong (0: none)
const vec3 LASH_COLOUR = vec3(${LASH_COLOUR.map((x) => x.toFixed(4)).join(", ")});
uniform vec4 uMineK;
uniform vec3 uConTint, uBrow, uBrowShape;
uniform float uBrowX, uMineLow, uLidFade, uMineBelow;
uniform vec4 uGlitterTop;
uniform vec4 uBrowDef;      // a look's brows: her hairs' colour over her skin's brightness (rgb), how far the gaps fill (a)
// coloured lenses: each iris (centre in uv, radius in uv x and y), the lens colour (linear, in her light), its amount
// and whether it covers her iris (1) or tints it (0)
uniform vec4 uIris[2];
// her mobile lid (1) to the rest of her eye's shadow placement (0): where her lid shade is packed on
float gLid = 1.0, gBelow = 1.0;
uniform vec3 uLens;
uniform vec2 uLensK;
// her visible face: 0 everywhere, 1 the coarse map, 2 the guided filter's models (grid over uVisBox: x0, y0, side)
uniform int uVisMode;
uniform sampler2D uVis, uVisEdge;
uniform vec3 uVisBox;
// a closing eye: the share of its lashes kept (image-left eye, the other); the side map tells the eyes apart
uniform float uSkinY;       // her skin's median brightness (linear): the concealer lifts darker under-eyes towards it (0: off)
uniform float uSkinMed;     // her skin's median brightness (linear; 0: not measured)
uniform vec4 uConC;         // the concealer ellipses' centres (one under each eye), their axis across the face (uConAx),
uniform vec4 uConAx;        // radii (uConAx.zw) and how much of each the turned head shows (uConK) (conceal_zone in teacher.py)
uniform vec2 uConK;
uniform vec3 uConRef;       // a look's concealer: her cheek's brightness under each eye (x, y; 0: none) and how much (z)
uniform vec3 uConTone;      // her skin's colour over its luminance (the concealer's tone)
uniform int uOpenOn;
uniform vec2 uOpen;
uniform sampler2D uSide;
// her lower waterline (waterPoints; WATER_*): per eye 9 points along her lower contour (pixels, the position along it from
// the inner corner, the band's height there); the look's change there (log RGB: inner, middle, outer); her irises (centre
// in pixels, radius; the band's softness in .w); her eye whites' colour (linear; w 0: not measured); how much (0: none),
// and how much of each eye is seen (eyeShown)
uniform vec4 uWaterP[18];
uniform vec3 uWaterC[3];
uniform vec4 uWaterI[2];
uniform vec4 uWaterW;
uniform float uWaterK;
uniform float uKohl;
uniform vec2 uWaterE;
out vec4 o;
float sweepT(vec2 x) {
  vec4 ax = uAx0;
  if (uAx1 != uAx0 && dot(x - uMid.xy, uMid.zw) > 0.0) ax = uAx1;
  vec2 A = ax.xy, d = ax.zw - ax.xy; float L2 = max(dot(d, d), 1.0);
  if (uSweepMode == 0) return clamp(length(x - A) / sqrt(L2), 0.0, 1.0);
  float t = dot(x - A, d) / L2;
  return clamp(uSweepMode == 2 ? abs(t) : t, 0.0, 1.0);
}
// A step's share here: in the tutorial, the sweep for the step being applied (and the steps this look doesn't
// have, which go on with the base) or how much of it is done; times the step's intensity.
// how much of step k is on so far in the guided tutorial (1: all of it, or no tutorial), and that times its amount
float shown(int k, float sw) { return uStepsOn == 1 ? (k == uActive || (uActive == 0 && uFollow[k] > 0.5) ? sw : uReveal[k]) : 1.0; }
float rv(int k, float sw) { return shown(k, sw) * uGain[k]; }
float rl(int k, float sw) { return rv(k, sw) * uLGain[k]; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// her waterline band here (0..1) and the look's change there (water_mask, water_colour in teacher.py), from her light lu
float waterAt(vec2 px, vec3 lu, out vec3 col, float kohl) {
  float best = 1e9, sd = 0.0, t = 0.0, hh = 1.0, past = 0.0, seen = 1.0;
  for (int e = 0; e < 2; e++) {
    for (int i = 0; i < 8; i++) {
      vec4 a = uWaterP[e * 9 + i], b = uWaterP[e * 9 + i + 1];
      vec2 ab = b.xy - a.xy;
      float L2 = max(dot(ab, ab), 1e-6), L = sqrt(L2), ur = dot(px - a.xy, ab) / L2, u = clamp(ur, 0.0, 1.0);
      vec2 q = a.xy + ab * u;
      float d = length(px - q);
      if (d < best) {
        best = d; sd = dot(px - q, vec2(-ab.y, ab.x) / L);
        // (past either corner, along her contour: the band stops there)
        past = ((i == 0 ? max(0.0, -ur) : 0.0) + (i == 7 ? max(0.0, ur - 1.0) : 0.0)) * L;
        t = mix(a.z, b.z, u); hh = mix(a.w, b.w, u); seen = e == 0 ? uWaterE.x : uWaterE.y;
      }
    }
  }
  // (her own kohl (KOHL_RIM): softer, a little onto her lash roots, on under her irises, fading out at her inner corner)
  float soft = uWaterI[0].w, low = soft * (1.0 + ${KOHL_RIM.soft.toFixed(2)} * kohl), below = (${WATER_OUT.toFixed(4)} + ${KOHL_RIM.out.toFixed(4)} * kohl) * uEw;
  float m = smoothstep(-below - low, -below + low, sd) * (1.0 - smoothstep(hh - soft, hh + soft, sd)) * (1.0 - smoothstep(0.0, 2.0 * soft, past)) * seen;
  float rim = 1.0 - smoothstep(${KOHL_RIM.under.toFixed(2)} * hh - soft, ${KOHL_RIM.under.toFixed(2)} * hh + soft, sd);
  for (int k = 0; k < 2; k++) {
    float off = smoothstep(0.95, 1.1, length(px - uWaterI[k].xy) / max(uWaterI[k].z, 1e-3));
    m *= max(off, kohl * rim);
  }
  float inner = mix(1.0, smoothstep(${KOHL_RIM.inner[0].toFixed(2)}, ${KOHL_RIM.inner[1].toFixed(2)}, t), kohl);
  m *= inner;
  if (uWaterW.w > 0.0) {
    vec3 s = uWaterW.rgb;
    float bright = smoothstep(${WATER_WHITE[0][0].toFixed(3)}, ${WATER_WHITE[0][1].toFixed(3)}, luma(lu) / max(luma(s), 1e-4));
    float red = (lu.r - lu.b) / max(lu.r + lu.g + lu.b, 1e-4) - (s.r - s.b) / max(s.r + s.g + s.b, 1e-4);
    m *= 1.0 - bright * (1.0 - smoothstep(${WATER_WHITE[1][0].toFixed(3)}, ${WATER_WHITE[1][1].toFixed(3)}, red));
  }
  // (and smudged down onto her lower lash roots, fading out below them: KOHL_RIM.smudge)
  if (kohl > 0.0 && sd < 0.0) m = max(m, kohl * ${KOHL_RIM.smudge[1].toFixed(2)} * (1.0 - smoothstep(below, ${KOHL_RIM.smudge[0].toFixed(4)} * uEw, -sd))
    * (1.0 - smoothstep(0.0, 2.0 * low, past)) * seen * inner);
  float k0 = ${(WATER_T[0] / 2).toFixed(4)}, k1 = ${((WATER_T[0] + WATER_T[1]) / 2).toFixed(4)}, k2 = ${((1 + WATER_T[1]) / 2).toFixed(4)};
  col = t < k1 ? mix(uWaterC[0], uWaterC[1], clamp((t - k0) / (k1 - k0), 0.0, 1.0)) : mix(uWaterC[1], uWaterC[2], clamp((t - k1) / (k2 - k1), 0.0, 1.0));
  return m;
}
/*
 * Coloured lenses on her irises, only where her eye is open (her eyeball mask): her pupil, her catchlights, her lashes
 * over her iris and her lid's shadow stay hers. A tint keeps her iris (its brightness and pattern) and changes its hue;
 * an opaque lens covers it with its own printed iris: fine radial fibres, lighter towards the middle of the ring, and
 * the dark rim a lens has at its edge, in its colour and her light.
 */
float lensHash(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
float lensFibre(float a, float n, float seed) {
  float x = a * n, i = floor(x);
  return mix(lensHash(i + seed), lensHash(mod(i + 1.0, n) + seed), smoothstep(0.0, 1.0, fract(x)));
}
vec3 lenses(vec3 c, vec3 src, float eye, float amount) {
  vec3 lin = pow(src, vec3(2.2));
  // (her pixel averaged with its four neighbours: a dark iris's sensor noise is not her lashes)
  vec2 px = 1.0 / vec2(textureSize(uSrc, 0));
  vec3 soft = (src + texture(uSrc, v + vec2(px.x, 0.0)).rgb + texture(uSrc, v - vec2(px.x, 0.0)).rgb
    + texture(uSrc, v + vec2(0.0, px.y)).rgb + texture(uSrc, v - vec2(0.0, px.y)).rgb) / 5.0;
  float Y = luma(lin), g = dot(src, vec3(0.299, 0.587, 0.114)), gs = dot(soft, vec3(0.299, 0.587, 0.114));
  float mean = pow(max(texture(uGrey, v).x, 0.02), 2.2), detail = clamp(Y / mean, 0.2, 2.5);
  float dark = clamp(pow(gs, 2.2) / mean, 0.2, 2.5);
  // catchlights; her lashes (much darker than around them, where her eye isn't dark itself)
  float keep = smoothstep(0.55, 0.85, g) + 0.8 * (1.0 - smoothstep(0.25, 0.45, dark)) * smoothstep(0.08, 0.2, texture(uGrey, v).x);
  eye = smoothstep(0.5, 0.92, eye);           // (well inside her eye's opening, never on her lid)
  for (int i = 0; i < 2; i++) {
    vec2 q = (v - uIris[i].xy) / max(uIris[i].zw, vec2(1e-5));
    float d = length(q);
    float m = eye * smoothstep(1.04, 0.92, d) * smoothstep(0.3, 0.42, d) * (1.0 - clamp(keep, 0.0, 1.0));
    if (m <= 0.0) continue;
    // a tint: her own iris, the lens's hue
    vec3 tint = uLens / max(luma(uLens), 1e-3) * max(Y, 0.004) * 1.3;
    // an opaque lens: its printed iris in its colour, shaded by her lid at the top, lit as her eye is (a little of her
    // own iris's light and dark shows through)
    float a = atan(q.y, q.x) / 6.2831853 + 0.5;
    float fib = 0.65 * lensFibre(a, 72.0, float(i) * 17.0) + 0.35 * lensFibre(a, 190.0, float(i) * 31.0 + 5.0);
    float ring = mix(0.72, 1.08, smoothstep(0.38, 0.62, d)) * (1.0 - 0.5 * smoothstep(0.82, 0.99, d));
    float lid = mix(0.62, 1.0, smoothstep(-0.9, 0.15, q.y));
    vec3 print = uLens * 0.8 * (0.78 + 0.44 * fib) * ring * lid * mix(1.0, clamp(detail, 0.6, 1.4), 0.3);
    vec3 t = uLensK.y > 0.5 ? print : tint * (1.0 - 0.35 * smoothstep(0.82, 0.99, d));
    c = mix(c, t, clamp(m * uLensK.x * amount, 0.0, 1.0));
  }
  return c;
}

uint hash2(uint x, uint y) {
  uint h = (x * 73856093u) ^ (y * 19349663u);
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16; return h;
}
// Glitter / pearl grains at bare-face coordinates c (as glitter() in teacher.py).
float grains(vec2 canon, float cellPx, float scale, float density) {
  vec2 c = canon / (uCanonEw * ${GLITTER_CELL} * scale), b = floor(c);
  float r = max(0.28, 0.6 / max(cellPx, 1e-3)), acc = 0.0;
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    vec2 cell = b + vec2(float(dx), float(dy));
    uint h = hash2(uint(int(cell.x)), uint(int(cell.y)));
    uint h2 = hash2(h, h ^ 0x9e3779b9u);
    if (float(h & 0xffffu) / 65536.0 >= density) continue;
    vec2 pc = cell + vec2(0.25 + 0.5 * float(h >> 16u) / 65536.0, 0.25 + 0.5 * float(h2 & 0xffffu) / 65536.0);
    float bright = 0.12 + 0.88 * pow(float(h2 >> 16u) / 65536.0, 4.0);
    vec2 d = c - pc;
    acc += bright * exp(-dot(d, d) / (r * r));
  }
  return acc;
}
vec2 canonAt() {
  vec4 t = texelFetch(uCanon, ivec2(v * vec2(uSize)), 0) * 255.0;
  return vec2(t.x * 256.0 + t.y, t.z * 256.0 + t.w) / 65535.0 * 2048.0;
}
// A soft spot at c (centre xy, sizes zw) along direction ax.
float spot(vec2 px, vec4 c, vec2 ax) {
  vec2 d = px - c.xy, q = vec2(dot(d, ax), dot(d, vec2(-ax.y, ax.x))) / max(c.zw, vec2(1e-3));
  return exp(-0.5 * dot(q, q));
}
// How far colour b is from colour a's hue and colourfulness, whatever their brightness (log ratios of the channels,
// weighted as the eye sees them).
float hueShift(vec3 a, vec3 b) {
  vec3 d = log(max(b, vec3(1e-5)) / max(luma(b), 1e-5)) - log(max(a, vec3(1e-5)) / max(luma(a), 1e-5));
  return sqrt(dot(d * d, vec3(0.35, 0.55, 0.1)));
}
// Kubelka-Munk: reflectance of a pigment layer (reflectance at infinite thickness Rinf, optical thickness x)
// over a substrate of reflectance Rg (km in products.py).
vec3 km(vec3 Rg, vec3 Rinf, float x) {
  vec3 R = clamp(Rinf, 0.02, 0.98);
  vec3 a = 0.5 * (1.0 / R + R), b = 0.5 * (1.0 / R - R);
  vec3 c = 1.0 / tanh(min(b * max(x, 1e-4), vec3(15.0)));   // (beyond 15 it is 1; past ~44 tanh overflows to NaN)
  return (1.0 - Rg * (a - b * c)) / (a - Rg + b * c);
}
// Finishes (FINISHES / CONTRAST in products.py): matte kept, reflective mix, reflection of lit form / her
// highlights / pearl grains / glitter grains, form contrast. 0 matte, 1 shimmer, 2 metallic, 3 glitter, 4 glow.
const float FKEEP[5] = float[5](1.0, 0.75, 0.6, 0.8, 0.3);
const float FMIX[5] = float[5](0.0, 0.3, 0.75, 0.0, 0.0);
const vec4 FREFL[5] = vec4[5](vec4(0.0), vec4(1.0, 0.8, 0.9, 0.0), vec4(1.8, 1.4, 0.3, 0.0), vec4(0.0, 0.0, 0.3, 1.8), vec4(0.5, 0.6, 0.3, 0.0));
const float FCONTRAST[5] = float[5](1.0, 1.5, 3.0, 1.0, 2.0);
// Her products over the look (contour, blush, highlight, eyeshadow), as paint_custom() in products.py; cov: how much
// of each (eyeshadow, contour, blush, highlight; her own makeup: her crease shade, her inner-corner light).
vec3 pigments(vec3 base, vec3 lu, float cov[6]) {
  vec4 F = texture(uShadeF, v), Bd = texture(uShadeB, v);
  float Y = luma(lu);
  float fF = max(0.0, 0.5 - F.y), fB = max(0.0, 0.5 - Bd.y);
  float form = (F.x + Y * fF) / (F.y + fF) / uSkinRef, broad = (Bd.x + Y * fB) / (Bd.y + fB) / uSkinRef;
  // (her own makeup: a lit lid or cheekbone is brighter skin as much as brighter light: products there don't glare)
  // and never brighter than a white surface her camera would still show as white
  float cap = min(${MINE_FORM_MAX}, 1.0 / max(luma(uWhite), 1e-3));
  vec3 E0 = uWhite * (uMine == 1 ? min(form, cap) : form), L = uWhite * clamp(broad, 0.3, 1.5);
  // (her own eyeshadow: a lid darker than her face is mostly her skin's own colour there, not shadow, and a primed lid
  // shows its shade's own colour: her lid lit at least as a lid in soft light is, its creases and folds still shading it)
  vec3 Eeye = uMine == 1 ? uWhite * min(form * max(1.0, ${MINE_LID_FORM.toFixed(3)} / max(broad, 0.05)), cap) : E0;
  float hl = clamp(F.z / max(F.w, 1e-4) - 1.0, 0.0, 0.6);
  float lit = clamp(form / max(broad, 1e-4) - 0.85, 0.0, 0.6) * clamp(broad, 0.3, 1.5);
  float glint = 0.25 + 2.0 * lit + 1.5 * hl;
  float pearl = 0.0, spark = 0.0, sparkLid = 0.0;
  bool grainsOn = false;
  for (int k = 0; k < 6; k++) grainsOn = grainsOn || uPigFin[k] > 0;
  if (grainsOn) {
    vec2 canon = canonAt(); float on = canon.x > 0.5 ? 1.0 : 0.0;
    pearl = on * grains(canon, uEw * ${GLITTER_CELL} * ${PEARL}, ${PEARL}, ${PEARL_DENSITY});
    spark = on * grains(canon, uEw * ${GLITTER_CELL}, 1.0, ${GLITTER_DENSITY});
    // (an eyeshadow's glitter is denser)
    if (uPigFin[0] == 3 || uPigFin[4] == 3) sparkLid = on * grains(canon, uEw * ${GLITTER_CELL}, 1.0, ${SHADOW_GLITTER});
  }
  for (int n = 0; n < 6; n++) {
    // contour, blush, highlight, then eyeshadow: her crease shade, her lid shade over it (the blend between them is
    // the lid shade thinning out over the crease shade), her inner-corner light
    int i = n < 3 ? n + 1 : n == 3 ? 4 : n == 4 ? 0 : 5;
    float X = uPigX[i];
    if (X <= 0.0) continue;
    float alpha = cov[i];
    int fin = uPigFin[i];
    vec3 col = uPig[i], Rinf = col;
    // (packed on, built up: a little deeper than its pan, in its own colour; raised to a power, as it was, a plum came out
    // four times darker than its pan and every shade deeper than a mid-brown black, so a brown smoky eye was a black one)
    if (uPigDeep[i] > 0.0) Rinf = col * (1.0 - ${PIG_DEEPEN.toFixed(2)} * uPigDeep[i] * smoothstep(0.55, 1.0, alpha));
    // her reflectance; where she is brighter than the light estimate allows, the light is brighter
    vec3 Ei = i == 0 || i >= 4 ? Eeye : E0;
    // (her own lid shade's shimmer: her lid's fullest part catches the light)
    float litI = lit;
    if (uMine == 1 && i == 0 && fin > 0 && fin < 4) {
      vec2 px = v * vec2(uSize);
      litI += ${LID_SHEEN.toFixed(3)} * max(spot(px, uLidC[0], uLidDir.xy), spot(px, uLidC[1], uLidDir.zw));
    }
    vec3 r = base / max(Ei, vec3(1e-4));
    float s = max(1.0, max(r.r, max(r.g, r.b)) / 0.9);
    vec3 Rg = clamp(r / s, 0.005, 0.98), E = Ei * s;
    // (her own eyeshadow as an artist lays it: her lid shade packed on her mobile lid and blended out sheer above it;
    // her crease shade always blended, a soft veil that deepens where it builds up)
    float dense = alpha;
    if (uMine == 1 && i == 0) dense = alpha * mix(0.5, 1.0, gLid) * gBelow;
    if (uMine == 1 && i == 4) dense = alpha * ${MINE_CREASE.toFixed(3)} * gBelow;
    // (her contour and blush: the same amount reads the same on any skin, as a richer formula does on deeper skin)
    if (uMine == 1 && (i == 1 || i == 2)) dense *= mix(${MINE_DEEP_RICH}, 1.0, smoothstep(0.04, 0.25, luma(Rg)));
    vec3 res;
    if (uPigOwn[i] == 1) {              // (the look's own eyeshadow: only its finish over it, where it is a light shade)
      res = base;
      alpha *= smoothstep(${OWN_LIGHT[0]}, ${OWN_LIGHT[1]}, luma(base) / max(Y, 1e-4));
    }
    else if (uMine == 1 && (i == 0 || i == 4 || i == 1)) {
      // Her own eyeshadow and contour are powders: blended or sheer, fewer grains lie on her skin, each as its pan shows
      // it, with her skin between them (not a thinner film: a film of a brown filters her skin into rust or yellow, of a
      // pale shade into grey; a contour should shade her, not tint her)
      float rate = i == 1 ? ${MINE_CONTOUR_POWDER.toFixed(3)} : X * FKEEP[fin] * ${MINE_POWDER.toFixed(3)};
      float f = 1.0 - exp(-dense * rate);
      // (her contour's grains are her own skin a few shades deeper: uPig is then a factor on her reflectance)
      vec3 grain = i == 1 ? clamp(Rg * col, 0.003, 0.98) : km(Rg, Rinf, X * FKEEP[fin]);
      res = base + (mix(Rg, grain, f) - Rg) * E;
    } else res = base + (km(Rg, Rinf, dense * X * FKEEP[fin]) - Rg) * E;
    if (uMine == 1 && i == 2) {
      // On deeper skin a blush mostly tints it (a stain seen through), it doesn't veil it in pale powder: the colour's
      // own hue as a filter, mixed in as her skin deepens (her contour is her own skin deeper, so it needs none).
      float deepSkin = 1.0 - smoothstep(0.05, 0.28, luma(Rg));
      vec3 filt = pow(clamp(Rinf / max(max(Rinf.r, Rinf.g), max(Rinf.b, 1e-4)), 0.02, 1.0), vec3(0.55)) * 0.95;
      vec3 stain = base * mix(vec3(1.0), filt, clamp(alpha * 0.6, 0.0, 0.8));
      res = mix(res, stain, deepSkin);
    }
    if (fin > 0) {
      float cmax = max(col.r, max(col.g, col.b));
      vec3 tint = col / max(cmax, 1e-4) * (0.5 + 0.5 * cmax);
      if (uPigOwn[i] == 1) {        // (its mica lies in the eyeshadow already there: their colours meet halfway)
        float cm = max(Rg.r, max(Rg.g, Rg.b));
        tint = sqrt(tint * Rg / max(cm, 1e-4) * (0.5 + 0.5 * cm));
      }
      vec4 k = FREFL[fin];
      float shine = k.x * litI + k.y * hl + k.z * pearl * (glint + 2.0 * (litI - lit));
      float a = clamp(alpha, 0.0, 1.0);
      // (a smoky band packed in under her lower lashes is a smudge of powder, not a lit lid: its shimmer subdued there,
      // or the wet rim's own light lit it as a copper line along her lower lashes)
      if (uMine == 1 && (i == 0 || i == 4)) a *= 1.0 - ${SMOKY_BELOW_MATTE.toFixed(2)} * clamp((gBelow - 1.0) / max(uMineBelow - 1.0, 1e-3), 0.0, 1.0);
      // (a glow's soft veil is light scattered back by the powder: on deeper skin only a little of it, or it reads as ash;
      // the sheen where her face catches the light stays)
      if (fin == 4) {
        vec3 add = tint * L * (0.06 * clamp(luma(Rg) / 0.25, 0.2, 1.0) + shine) * uPigSheen[i] * a;
        // (her highlight is a sheen, not a lamp: at most this much brighter than her skin under it)
        if (uMine == 1) add *= min(1.0, ${MINE_GLOW_MAX.toFixed(3)} * luma(res) / max(luma(add), 1e-5));
        res += add;
      }
      else {
        // (a look's own eyeshadow finish: its gleam follows her lid's form, at most OWN_GLEAM: within a dense lash line the
        // skin between her lashes is lit next to them, and a metal's contrast on it read as pale specks)
        float q = pow(clamp(form / max(broad, 1e-4), 0.3, uPigOwn[i] == 1 ? ${OWN_GLEAM.toFixed(2)} : 2.0), FCONTRAST[fin]);
        vec3 refl = tint * (${REFLECT_BASE} * L * q + L * shine);
        if (uMine == 1) {      // (her lit lid: a metal's gleam, not a glare of flat colour; its light a little paler than its body)
          q = min(q, 1.25);
          refl = mix(tint, vec3(luma(tint)) * 1.1, 0.3) * (${REFLECT_BASE} * L * q + L * shine);
        }
        float m = FMIX[fin] * uPigSheen[i] * smoothstep(0.05, 0.6, alpha) * a / max(clamp(alpha, 0.0, 1.0), 1e-4);
        res = res * (1.0 - m) + refl * m;
        // (her lid's fullest part: the light its pearl scatters back, a luminous sheen on top)
        res += tint * L * (litI - lit) * ${LID_GLOW.toFixed(3)} * uPigSheen[i] * a;
        // (her own eyeshadow's mica: a fine sparkle over her lid in its own colour, brightest where her lid catches the
        // light; pearl's mean taken off, the lid between its grains darkened by half, so the lid's colour holds)
        if (uMine == 1 && (i == 0 || i == 4) && fin < 3) {
          float rr = max(0.28, 0.6 / max(uEw * ${(GLITTER_CELL * PEARL).toFixed(4)}, 1e-3));
          float gm = ${(PEARL_DENSITY * 0.296 * Math.PI).toFixed(4)} * rr * rr;     // (pearl's mean: 0.296 a grain's mean brightness in grains())
          // (on a small face its grains are finer than a pixel: a pixel holds several of them, and they average out)
          float fine = clamp(uEw * ${(GLITTER_CELL * PEARL).toFixed(4)} / 1.3, 0.35, 1.0);
          float s = (fin == 1 ? ${MICA[1].toFixed(2)} : ${MICA[2].toFixed(2)}) * fine * (pearl - gm) * (0.6 + 1.5 * (litI - lit) + 1.2 * lit + hl) * a * uPigSheen[i];
          res = res * (1.0 + (s > 0.0 ? s : 0.5 * s)) + mix(tint, vec3(luma(tint)), 0.3) * L * max(s, 0.0) * 0.2;
        }
      }
      // (her own eyeshadow's glitter topper: its grains in their own colour)
      if (k.w > 0.0) res += L * (k.w * (i == 0 || i == 4 ? sparkLid : spark) * glint * a * uPigSheen[i])
        * (uMine == 1 && uGlitterTop.w > 0.0 && (i == 0 || i == 4) ? uGlitterTop.rgb / max(max(uGlitterTop.r, uGlitterTop.g), max(uGlitterTop.b, 1e-4)) : 0.6 + 0.4 * tint);
    }
    if (i == 3) {
      // A highlight brightens her skin without changing its colour much: where a pale or gold one would (deep, rich
      // skin: a grey, ashen or khaki patch), it is her own skin glowing instead, as the highlighters made for deep skin
      // make it: her warmth turning a little golden, at most 1.6 times her skin where she is lit or her face catches
      // the light (less in her shade). Judged by what a full layer of it would do to her colour here (smooth over her
      // face: not by its coverage, or its edge would be a ring of the pale one).
      vec4 kf = FREFL[4];
      vec3 tf = col / max(max(col.r, max(col.g, col.b)), 1e-4) * (0.5 + 0.5 * max(col.r, max(col.g, col.b)));
      vec3 full = base + (km(Rg, Rinf, X * FKEEP[4]) - Rg) * E
        + tf * L * (0.06 * clamp(luma(Rg) / 0.25, 0.2, 1.0) + kf.x * lit + kf.y * hl) * clamp(uPigSheen[i], 0.3, 1.0);
      float deep = smoothstep(${GLOW_SHIFT[0].toFixed(2)}, ${GLOW_SHIFT[1].toFixed(2)}, hueShift(base, full));
      if (deep > 0.0) {
        float lift = clamp(${GLOW_SHADE.toFixed(2)} + 1.5 * lit + 1.5 * hl, 0.0, 1.0) * clamp(broad, 0.3, 1.0);
        float g = ${MINE_GLOW_MAX.toFixed(3)} * lift * smoothstep(0.0, 0.6, alpha) * clamp(uPigSheen[i], 0.3, 1.0), t = g / ${MINE_GLOW_MAX.toFixed(3)};
        // (her colour where the light catches it a little softer, in its own hue: a lit sheen, not a deeper orange)
        float yb = max(luma(base), 1e-5);
        vec3 hueLit = pow(max(base / yb, vec3(1e-4)), vec3(1.0 - ${GLOW_SOFT.toFixed(2)} * t)) * pow(${GLOW_GOLD}, vec3(t));
        res = mix(res, yb * (1.0 + g) * hueLit / max(luma(hueLit), 1e-5), deep);
      }
    }
    base = res;
  }
  return base;
}
// Her light at this point (for her liner colour).
vec3 lightHere(vec3 lu) {
  vec4 F = texture(uShadeF, v); float fF = max(0.0, 0.5 - F.y);
  return uWhite * (F.x + luma(lu) * fF) / (F.y + fF) / uSkinRef;
}
// Her own makeup's coverage builds up softly where she rubs again and again (1 stays 1): a veil that deepens, never a stamp.
float sat(float x) { return (1.0 - exp(-1.5 * x)) / ${(1 - Math.exp(-1.5)).toFixed(6)}; }
${SHOULDER_GLSL}
// Her eyeshadow's placement (her own makeup) as her tool lays it: as it is (finger), packed on (flat brush: denser,
// with a crisper edge) or blended out (fluffy brush: softened over 0.06 eye widths); uMineK.y picks.
float mineShadow() {
  float c = texture(uCov, v).r;
  if (uMineK.y > 1.5) {
    vec2 d = vec2(uEw * 0.06) / vec2(uSize);
    float s = 2.0 * c;
    for (int k = 0; k < 8; k++) { float a = float(k) * 0.785398; s += texture(uCov, v + d * vec2(cos(a), sin(a))).r; }
    return 0.9 * s / 10.0;
  }
  return uMineK.y > 0.5 ? mix(c, smoothstep(0.08, 0.7, c), 0.6) : c;
}
// Her brow product (her own makeup): a Kubelka-Munk layer that fills in between her hairs and never lightens them,
// following her own brow: where her skin, softened a little (uGrey.y), is darker than her broad skin around (uShadeB),
// her hairs are; uBrowShape: that darkness from (x) to (y) is all of her brow, and (z) of the zone gets some anyway.
vec3 browFill(vec3 base, vec3 lu, float a) {
  vec4 Bd = texture(uShadeB, v); float fB = max(0.0, 0.5 - Bd.y);
  float broad = (Bd.x + luma(lu) * fB) / (Bd.y + fB), hair = clamp(1.0 - pow(texture(uGrey, v).y, 2.2) / max(broad, 1e-4), 0.0, 1.0);
  a *= mix(smoothstep(uBrowShape.x, uBrowShape.y, hair), 1.0, uBrowShape.z);
  vec3 E0 = lightHere(lu), r = base / max(E0, vec3(1e-4));
  float s = max(1.0, max(r.r, max(r.g, r.b)) / 0.9);
  vec3 Rg = clamp(r / s, 0.005, 0.98);
  return min(base, base + (km(Rg, uBrow, a * uBrowX) - Rg) * E0 * s);
}
// Her broad skin's brightness at a point (uShadeB; her own skin there where it has none) and how much of her own brow
// is there (BROW_MASS: her softened skin, uGrey.y, that much darker than it).
float broadAt(vec2 at) {
  vec4 Bd = texture(uShadeB, at); float fB = max(0.0, 0.5 - Bd.y);
  return (Bd.x + luma(pow(texture(uSrc, at).rgb, vec3(2.2))) * fB) / (Bd.y + fB);
}
float browMass(vec2 at, float broad) {
  return smoothstep(${BROW_MASS[0].toFixed(3)}, ${BROW_MASS[1].toFixed(3)}, 1.0 - pow(texture(uGrey, at).y, 2.2) / max(broad, 1e-4));
}
// A look's brows (browDefine in tryon.ts): the gaps between her hairs (her softened brightness up near her skin's around:
// uShadeB) filled towards her hairs' colour in the light there; her hairs (as dark as that colour) stay as they are.
vec3 browDefine(vec3 base, vec3 lu, float a) {
  float broad = broadAt(v);
  vec3 hairC = uBrowDef.rgb * broad;
  float yh = luma(hairC), y = luma(base);
  float gap = clamp((y - yh) / max(broad - yh, 1e-4), 0.0, 1.0);
  return mix(base, hairC, a * uBrowDef.w * gap);
}
void main() {
  vec3 src = texture(uSrc, v).rgb;
  vec2 px = v * vec2(uSize);
  if (px.x < uWork.x || px.y < uWork.y || px.x > uWork.z || px.y > uWork.w) { o = vec4(src, 1.0); return; }   // away from her face
  vec3 lu = pow(src, vec3(2.2));
  vec4 L = uMine == 1 ? vec4(0.5) : texture(uLayer, v);          // her own makeup: no catalog layer
  vec3 q = clamp(L.rgb * 2.0 - 1.0, -0.996, 0.996);
  vec3 lr = 0.6 * log((1.0 + q) / (1.0 - q));                 // = 1.2 atanh(q)
  vec4 M = texture(uMask, v);                                   // eyeballs, mouth, lips (fine), lips (wide)
  float RL = 1.0, RD = 1.0, RLips = 1.0, sw = 1.0;            // how much of the layer, eye detail, lipstick
  vec4 ZA = vec4(0.0), ZB = vec4(0.0);
  if (uZonesOn == 1) {
    if (uStepsOn == 1) sw = clamp((uProgress * 1.3 - sweepT(v * vec2(uSize))) / 0.3, 0.0, 1.0);
    ZA = texture(uZoneA, v); ZB = texture(uZoneB, v);
    float sum = ZA.r + ZA.g + ZA.b + ZA.a + ZB.r, sc = sum > 1.0 ? 1.0 / sum : 1.0;
    RL = max(0.0, 1.0 - sum * sc) * rl(0, sw) + sc * (ZA.r * rl(1, sw) + ZB.r * rl(3, sw) * uOwn.x + ZA.g * rl(6, sw) * uOwn.y
      + ZA.b * rl(7, sw) * uOwn.z + ZA.a * rl(8, sw) * uOwn.w);
    RD = ZB.g * rl(4, sw) + (1.0 - ZB.g) * rl(5, sw);
    RLips = rl(9, sw);
  }
  if (uVisMode > 0) {             // skin-level layer fades before her visible face's edge (skin_fade in teacher.py)
    vec4 E = texture(uVisEdge, (v * vec2(uSize) - uVisBox.xy) / uVisBox.z);
    float edge = 0.5 + 0.5 * smoothstep(0.5, 0.95, uVisMode == 2 ? E.a : E.r);   // to half (EDGE_KEEP in teacher.py)
    float t = smoothstep(0.1, 0.25, max(abs(lr.r), max(abs(lr.g), abs(lr.b))));
    lr *= edge + (1.0 - edge) * t;
  }
  // her lashes and brow hairs, and her upper lash line: the look's lightening and its eyeshadow's finish stay off them
  // (HAIR_LIGHT, LASH_BAND_LIGHT; hair_keep in teacher.py)
  float hairK, lineK;
  {
    vec4 G0 = texture(uGrey, v);
    float dark = clamp(-(dot(src, vec3(0.299, 0.587, 0.114)) - G0.x) / max(G0.y, 20.0 / 255.0), 0.0, 1.0);
    hairK = (1.0 - ${HAIR_LIGHT[2]} * smoothstep(${HAIR_LIGHT[0]}, ${HAIR_LIGHT[1]}, dark)) * (1.0 - ${LASH_BAND_LIGHT.toFixed(2)} * clamp(ZB.g, 0.0, 1.0));
    // (an eyeshadow, its mica, stays off her lash line itself: where she is darker, a little softened, than her broad light)
    vec4 Bd = texture(uShadeB, v);
    float fB = max(0.0, 0.5 - Bd.y), broadY = (Bd.x + luma(lu) * fB) / (Bd.y + fB);
    lineK = smoothstep(${SHADOW_LASH[0]}, ${SHADOW_LASH[1]}, pow(G0.y, 2.2) / max(broadY, 1e-4));
  }
  lr = min(lr, vec3(0.0)) + max(lr, vec3(0.0)) * hairK;
  if (uSkinY > 0.0) {             // concealer under her eyes (conceal_gain in teacher.py)
    vec2 ax = uConAx.xy, dn = vec2(-ax.y, ax.x);
    float zone = 0.0;
    for (int e = 0; e < 2; e++) {
      vec2 d = px - (e == 0 ? uConC.xy : uConC.zw);
      float r = length(vec2(dot(d, ax) / uConAx.z, dot(d, dn) / uConAx.w));
      zone = max(zone, (1.0 - smoothstep(0.7, 1.25, r)) * (e == 0 ? uConK.x : uConK.y));
    }
    float g0 = texture(uGrey, v).g;
    if (uMine == 1) {             // her concealer: where she put it, up to her brightness, in its colour
      float target = uSkinY * uMineK.x;
      float gain = pow(clamp(target / max(pow(g0, 2.2), 1e-4), 1.0, ${CONCEAL_MAX} * uMineK.x), ${CONCEAL});
      lu *= 1.0 + (gain * uConTint - 1.0) * min(max(ZA.r, 0.0) * rv(1, sw), 1.5) * (1.0 - M.r);
    } else if (uConRef.x > 0.0) {   // a look's concealer: up towards her cheek under the eye, her lashes kept, her skin's tone
      float zR = 0.0, zL = 0.0;
      for (int e = 0; e < 2; e++) {
        vec2 d = px - (e == 0 ? uConC.xy : uConC.zw);
        float r = length(vec2(dot(d, ax) / (uConAx.z * ${CONCEAL_ZONE[0]}), dot(d, dn) / (uConAx.w * ${CONCEAL_ZONE[1]})));
        float z = 1.0 - smoothstep(${CONCEAL_ZONE[2]}, ${CONCEAL_ZONE[3]}, r);
        if (e == 0) zR = z * uConK.x; else zL = z * uConK.y;
      }
      vec2 eyeC = (zR >= zL ? uConC.xy : uConC.zw) - dn * uEw * 0.42;
      float ref = zR >= zL ? uConRef.x : uConRef.y;
      float k = max(zR, zL) * uConRef.z * (uZonesOn == 1 ? rv(1, sw) : 1.0) * (1.0 - M.r);
      k *= 1.0 - clamp(-luma(lr) * uK.x * (1.0 - M.r) / ${CONCEAL_UNDER.toFixed(3)}, 0.0, 1.0);   // (under the look's shadow)
      float ys = pow(g0, 2.2), y = luma(lu);
      float gain = pow(clamp(ref * ${CONCEAL_SHADE.toFixed(3)} / max(ys, 1e-4), 1.0, ${CONCEAL_LOOK_MAX}), ${CONCEAL_LOOK});
      float nearLash = 1.0 - smoothstep(${CONCEAL_LASH[0]}, ${CONCEAL_LASH[1]}, dot(px - eyeC, dn) / uEw);
      float hair = clamp((ys - y) / max(0.25 * ys, 1e-4), 0.0, 1.0) * nearLash;
      lu *= 1.0 + (gain - 1.0) * k * (1.0 - ${CONCEAL_HAIR} * hair);
      vec3 c = lu / max(luma(lu), 1e-5);
      float covers = clamp((gain - 1.0) / ${CONCEAL_TONE_FULL.toFixed(3)}, 0.0, 1.0);
      lu *= pow(uConTone / max(c, vec3(1e-4)), vec3(${CONCEAL_TONE} * k * covers * (1.0 - hair)));
    } else {
      float gain = pow(clamp(uSkinY / max(pow(g0, 2.2), 1e-4), 1.0, ${CONCEAL_MAX}), ${CONCEAL});
      lu *= 1.0 + (gain - 1.0) * zone * (uZonesOn == 1 ? rv(1, sw) : 1.0);
    }
  }
  // (a region made stronger than the layer, RL > 1: where it darkens, all of it; where it lightens, LIGHTEN_GAIN of it and
  // its change of hue CHROMA_GAIN of it: a pale shimmer made twice as light turned chalky grey on a deeper lid, and a
  // cream lid's slight cooling, doubled, turned it mint; a blush, a contour, a smoky shadow get their colour in full)
  vec3 lrs = lr;
  if (RL > 1.0) {
    float ly = dot(lr, vec3(0.2126, 0.7152, 0.0722));
    float lighter = step(0.0, ly);
    lrs = ly * mix(RL, 1.0 + (RL - 1.0) * ${LIGHTEN_GAIN}, lighter) + (lr - ly) * mix(RL, 1.0 + (RL - 1.0) * ${CHROMA_GAIN}, lighter);
  } else lrs = lr * RL;
  vec3 lex = lrs * (1.0 - M.r) * (1.0 - M.g) * uK.x;
  if (uWaterK > 0.0) {             // her lower waterline: the look's own change there (with its liner, step by step)
    vec3 wc;
    float wm = waterAt(px, pow(src, vec3(2.2)), wc, 0.0) * uWaterK * (uZonesOn == 1 ? shown(4, sw) : 1.0);
    lex = mix(lex, wc * uK.x, wm);
  }
  {                                // (LAYER_FLOOR: her brightness rolled off, the change of hue kept, each channel held above it)
    const float FL = ${(-Math.log(LAYER_FLOOR)).toFixed(4)};
    float ly = luma(lex);
    lex += (ly < 0.0 ? FL * (exp(ly / FL) - 1.0) : ly) - ly;
    vec3 fa = max(-lex, vec3(0.0));
    lex = mix(lex, -fa / pow(vec3(1.0) + pow(fa / FL, vec3(${FLOOR_KNEE.toFixed(1)})), vec3(${(1 / FLOOR_KNEE).toFixed(4)})), step(lex, vec3(0.0)));
  }
  vec3 base = lu * exp(lex);
  float pigX = 0.0;
  for (int k = 0; k < 6; k++) pigX += uPigX[k];
  if (uZonesOn == 1 && pigX > 0.0) {
    float cov[6];
    if (uMine == 1) {             // her own: nothing on her eyeballs or in her mouth
      // her eyeshadow's placement (packed on or blended out): her lid shade on her lid (uCov.g), her second shade on her
      // crease and outer corner; her inner-corner light (uCov.b)
      // (with two shades her placement is where her second shade goes, kept off the middle of her lid; her lid shade fills
      // her lid whatever it is, laid over the second shade: where it thins out above her lid, the two blend)
      vec4 C = texture(uCov, v);
      // (her lash line stays: the shade is pressed into the roots of her lashes, not painted over them)
      vec2 lash = vec2(0.0, uEw * ${MINE_LASH_LINE.toFixed(4)}) / vec2(uSize);
      float rim = max(max(texture(uMask, v + lash).r, texture(uMask, v - lash).r), max(texture(uMask, v + lash * 0.5).r, texture(uMask, v - lash * 0.5).r));
      float keep = (1.0 - M.r) * (1.0 - M.g), k3 = rv(3, sw) * keep * (1.0 - ${MINE_LASH_KEEP.toFixed(3)} * rim), sh = mineShadow() * (1.0 - uMineLow * smoothstep(0.08, 0.6, C.a));
      gLid = clamp(C.g, 0.0, 1.0);
      float two = uPigX[4] > 0.0 ? 1.0 : 0.0, lid = mix(1.0, gLid, two), light = smoothstep(0.04, 0.7, C.b);
      float c = sat(uMineK.z * mix(sh, max(sh, lid), two)) * k3;
      // (a smoky eye's band under her lower lashes packed on: SMOKY_BELOW, more powder; its shimmer subdued there)
      gBelow = mix(1.0, uMineBelow, smoothstep(0.08, 0.6, C.a) * smoothstep(${SMOKY_BELOW_CORE[0]}, ${SMOKY_BELOW_CORE[1]}, sh) * (1.0 - smoothstep(0.02, 0.25, M.r)));
      cov = float[6](c * lid, sat(max(ZA.g, 0.0)) * rv(6, sw) * keep, sat(max(ZA.b, 0.0)) * rv(7, sw) * keep,
        sat(max(ZA.a, 0.0)) * rv(8, sw) * keep, two * sat(uMineK.z * sh) * k3 * (1.0 - uLidFade * gLid),
        light * k3 / max(uGain[3], 1e-4) * clamp(uGain[3], ${MINE_LIGHT_GAIN[0]}, ${MINE_LIGHT_GAIN[1]}));
    } else {
      cov = float[6](texture(uCov, v).r * rv(3, sw) * uK.x * hairK * lineK, ZA.g * rv(6, sw) * uK.x, ZB.b * rv(7, sw) * uK.x, ZA.a * rv(8, sw) * uK.x, 0.0, 0.0);
    }
    vec3 pre = base;
    base = pigments(base, lu, cov);
    if (uMine == 1) {             // her own lashes and brow hairs stay over the products laid under them
      vec4 G = texture(uGrey, v);
      float dark = clamp(-(dot(src, vec3(0.299, 0.587, 0.114)) - G.x) / max(G.y, 20.0 / 255.0), 0.0, 1.0);
      // (around her eyes, whatever is far darker than her skin is her lashes: in a dense fringe, or on deep skin, they
      // hardly stand out from what is around them, and a pale eyeshadow laid over them turned them grey)
      float rel = luma(pow(src, vec3(2.2))) / max(uSkinMed, 1e-4);
      if (uSkinMed > 0.0) dark = max(dark, clamp(ZB.a, 0.0, 1.0) * (1.0 - smoothstep(${MINE_LASH_DARK[0]}, ${MINE_LASH_DARK[1]}, rel)));
      float laid = smoothstep(0.0, 0.6, (luma(base) - luma(pre)) / max(luma(pre), 0.01));
      base = mix(base, pre, dark * laid * ${MINE_HAIR} * (1.0 - M.r));
    }
  }
  if (uMine == 1 && uFreckle > 0.0) {   // her freckles, dotted on over her skin's products (with her blush)
    float f = clamp(ZB.r * uFreckle, 0.0, 1.0) * shown(7, sw) * (1.0 - M.r) * (1.0 - M.g);
    base *= mix(vec3(1.0), vec3(${FRECKLE_TINT.map((x) => x.toFixed(3)).join(", ")}), f);
  }
  if (uMine == 1 && uBrowX > 0.0) base = browFill(base, lu, max(ZB.b, 0.0) * rv(2, sw) * (1.0 - M.r));
  else if (uBrowDef.w > 0.0 && uZonesOn == 1) {
    float kb = rv(2, sw) * uK.x * (1.0 - M.r), zb = max(ZB.a, 0.0) * browMass(v, broadAt(v));
    base = browDefine(base, lu, zb * kb);
    if (uSkinY > 0.0) {           // carved: a clean line of concealer just under her brow
      vec2 up = vec2(uConAx.y, -uConAx.x) * uEw * ${BROW_CARVE[0]};
      if (dot(up, vec2(-uConAx.y, uConAx.x)) > 0.0) up = -up;
      vec2 va = v + up / vec2(uSize);
      float above = max(texture(uZoneB, va).a, 0.0) * browMass(va, broadAt(va));
      float band = clamp(above - zb * 1.5, 0.0, 1.0);
      vec4 G = texture(uGrey, v);
      float hairs = clamp(-(dot(src, vec3(0.299, 0.587, 0.114)) - G.x) / max(G.y, 20.0 / 255.0), 0.0, 1.0);
      base *= exp(${BROW_CARVE[1]} * band * kb * (1.0 - hairs));
    }
  }
  base = mix(base, lu, clamp(M.a * 4.0, 0.0, 1.0) * uLipTint);  // lipstick replaces the layer's lip tint (none when filled)
  vec4 Q = texture(uLip, v);
  float lipF = M.b;
  if (uLipOn > 0) {
    vec4 A = texture(uLipM, (v * vec2(uSize) - uLipBox.xy) / uLipBox.z);
    lipF = uLipOn == 2 ? clamp(dot(A.rgb, src - 0.5) + A.a, 0.0, 1.0) : A.r;
  }
  float Y = luma(lu);
  float broad = Q.x / max(Q.y, 1e-3), fine = Y / max(broad, 1e-4);
  float lm = Q.z / max(Q.w, 1e-3), local = Y / max(lm, 1e-4);
  vec4 R0 = texture(uGrey, v);
  float ysm = R0.z / max(R0.w, 1e-3);          // her lips' light without their finest lines
  // (her lip line's shadow stays in the lipstick; her skin's light just past it doesn't brighten it)
  float inside = smoothstep(${LIP_INSIDE[0].toFixed(2)}, ${LIP_INSIDE[1].toFixed(2)}, Q.w);
  float f0 = clamp(fine, 0.0, 2.5);
  if (f0 > 1.0) f0 = mix(1.0, f0, inside);
  // her lips' highlights are the light's reflection, not their colour: past LIP_KNEE times their light around, the
  // lipstick's colour stops brightening and the rest is shine, kept as light: less under a matte, under a gloss
  // smoothed (it fills her lips' fine lines) and more
  float fd = f0 > ${LIP_KNEE.toFixed(2)} ? ${LIP_KNEE.toFixed(2)} + (f0 - ${LIP_KNEE.toFixed(2)}) * ${LIP_KNEE_SLOPE.toFixed(2)} : f0;
  float S = pow(fd, uGamma) * pow(clamp(broad / uRef, 0.2, 3.0), ${LIP_VOLUME});
  float raw = (f0 - fd) * broad, even = max(0.0, min(ysm / max(broad, 1e-4), 2.5) - ${LIP_KNEE.toFixed(2)}) * broad * inside;
  float spec = mix(raw, even, uShine) * (uMatte > 0.5 ? ${MATTE_SHINE} : 1.0 + ${LIP_GLOSS_OWN.toFixed(2)} * uShine);
  vec3 white = mix(vec3(1.0), uTarget / max(luma(uTarget), 1e-3), 0.15);
  // its colour, or (a lipstick that hardly changes the lips: look_lips in teacher.py) her own lips with its change
  vec3 cover = mix(base * pow(uLipRatio, vec3(1.0 / max(uAlpha, 0.05))), uTarget * S + spec * uLightC * white, uLipPig);
  if (uGlossDir.z > 0.0 && lipF > 0.0) {      // the gloss by her lips' shape, broken up a little by her lips' own lines
    vec2 px = v * vec2(uSize);
    float g = spot(px, uGlossLo, uGlossDir.xy) + 0.45 * spot(px, uGlossUp, uGlossDir.xy);
    float form = mix(${GLOSS_FLAT.toFixed(2)}, 1.0, smoothstep(0.95, 1.35, ysm / max(broad, 1e-4)));
    cover += uGlossDir.z * g * g * form * uLight * inside * uLightC * white;
  }
  if (uFinish >= 3 && lipF > 0.0) {
    vec3 tint = uTarget / max(max(uTarget.r, uTarget.g), max(uTarget.b, 1e-4));
    vec2 canon = canonAt(); float on = canon.x > 0.5 ? 1.0 : 0.0;
    if (uFinish == 3) {          // metallic: a soft sheen, her highlights, a fine pearl
      float hl = clamp(R0.z / max(R0.w, 1e-3) / max(lm, 1e-4) - 1.0, 0.0, 0.6);
      float sheen = pow(clamp((broad / uRef - 0.95) / 0.5, 0.0, 1.0), 1.5);
      float pearl = on * grains(canon, uEw * ${GLITTER_CELL} * ${PEARL}, ${PEARL}, ${PEARL_DENSITY});
      cover = cover * 0.85 + (0.22 * sheen + 1.1 * hl + 0.35 * pearl * (0.5 + sheen)) * uMetK * (0.35 + 0.65 * tint);
    } else {                     // glitter: grains that catch the light where her lips are lit
      float spark = on * grains(canon, uEw * ${GLITTER_CELL}, 1.0, ${GLITTER_DENSITY});
      float glint = 0.4 + 1.6 * clamp(broad / uRef - 0.75, 0.0, 1.0) + clamp(local - 1.0, 0.0, 0.5);
      cover += spark * glint * 1.8 * uLight * (0.6 + 0.4 * tint);
    }
  }
  float a = uAlpha;
  if (uFinish == 2) { float t = clamp((M.a - 0.5) * 2.2, 0.0, 1.0); cover *= pow(uOmbre, vec3(t - 0.5)); a = 0.55 + 0.35 * t; }
  float f = lipF;
  vec3 c = mix(base, cover, clamp(a * uK.y, 0.0, 0.97) * f * RLips);
  if (uFinish == 1) c = mix(c, cover * 0.62, 4.0 * f * (1.0 - f) * f * 0.45 * min(uK.y, 1.0) * RLips);
  if (uLensK.x > 0.0) c = lenses(c, src, M.r, rv(10, sw));
  vec3 res = pow(clamp(shoulder(c, pow(src, vec3(2.2))), 0.0, 1.0), vec3(1.0 / 2.2));
  vec4 R = texture(uGrey, v);
  float g = dot(src, vec3(0.299, 0.587, 0.114));
  float own = min(0.0, g - R.x) / max(R.y, 20.0 / 255.0);
  float lashK = 1.0;
  if (uOpenOn == 1) {             // lash_scale() in teacher.py: the lash-line band stays, the lashes fade
    float band = texture(uZoneB, v).g;
    lashK = band + (1.0 - band) * (texture(uSide, v).r < 0.5 ? uOpen.x : uOpen.y);
  }
  float dk = min(0.0, -texture(uDetail, v).a * lashK * (1.0 - M.r) * (uMine == 1 && uStrands == 0 ? clamp(ZB.a, 0.0, 1.0) : 1.0) - own * 0.6);
  if (uMine == 1) {               // her liner in its colour, then her lashes over it
    float dl = clamp(ZB.g * rv(4, sw) * uMineK.w, 0.0, 1.0) * (1.0 - M.r);
    // (a dark liner never lightens her own lash line, already darker than it in her light)
    vec3 lined = mix(res, pow(clamp(uLiner * lightHere(lu), 0.0, 1.0), vec3(1.0 / 2.2)), dl);
    res = luma(uLiner) < 0.02 ? min(res, lined) : lined;
    if (uKohl > 0.0) {            // kohl on her lower waterline (Mine.liner.kohl): her liner's colour in her light there
      vec3 wc;
      float km = clamp(waterAt(px, pow(src, vec3(2.2)), wc, 1.0) * uKohl * rv(4, sw), 0.0, 1.0);   // (uKohl: its opacity)
      vec3 kohl = mix(res, pow(clamp(uLiner * lightHere(lu), 0.0, 1.0), vec3(1.0 / 2.2)), km);
      res = luma(uLiner) < 0.02 ? min(res, kohl) : kohl;
    }
    if (uStrands == 1) {          // strand by strand: dark hairs over whatever is on her lid (a darkening of a pale
      // eyeshadow would leave grey lashes), as dark as a lash is in her light, never lighter than she is there
      float la = clamp(uK.z * rv(5, sw) * texture(uDetail, v).a * lashK * (1.0 - M.r), 0.0, ${LASH_OPAQUE.toFixed(2)});
      res = min(res, mix(res, pow(clamp(LASH_COLOUR * lightHere(lu), 0.0, 1.0), vec3(1.0 / 2.2)), la));
    } else res *= clamp(1.0 + uK.z * rv(5, sw) * dk, 0.15, 1.0);
  } else if (uLinerOn == 1 && uZonesOn == 1) {          // her liner colour on the upper lid band, the lashes as they are
    float dl = clamp(-uK.z * ZB.g * rv(4, sw) * dk, 0.0, 0.85), dd = clamp(-uK.z * (1.0 - ZB.g) * rv(5, sw) * dk, 0.0, 0.85);
    res *= 1.0 - dd;
    res = mix(res, pow(clamp(uLiner * lightHere(lu), 0.0, 1.0), vec3(1.0 / 2.2)), clamp(dl * 1.15, 0.0, 1.0));
  } else res *= clamp(1.0 + uK.z * RD * dk, 0.15, 1.0);
  float vis = 1.0;
  if (uVisMode > 0) {             // only where her face can be seen (visible() in occlusion.py)
    vec4 A = texture(uVis, (v * vec2(uSize) - uVisBox.xy) / uVisBox.z);
    vis = uVisMode == 2 ? clamp(dot(A.rgb, src - 0.5) + A.a, 0.0, 1.0) : A.r;
  }
  o = vec4(mix(src, res, vis), 1.0);
}`;

/* --------------------------------------------------------------- renderer */

type Target = { fb: WebGLFramebuffer; tex: WebGLTexture[] };
/** A soft spot: x, y and radius in pixels, amount. */
type Spot = [number, number, number, number];

export class MakeupGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private progs: Record<string, WebGLProgram> = {};
  private buf: WebGLBuffer;
  /** Per-vertex weights of the mesh (the layer's fade towards her face's outline). */
  private wbuf: WebGLBuffer;
  private quad: WebGLBuffer;
  private src: WebGLTexture;
  /**
   * Her photo with only her skin perfected (the studio retouch's skin; same size as the photo painted next), or null:
   * the foundation brings it in by its coverage (RETOUCH_FULL). Set just before render() and cleared after: a live
   * frame has none.
   */
  skin: (TexImageSource & { width: number; height: number }) | null = null;
  private skinTex: WebGLTexture | null = null;
  private layers = new Map<string, { layer: WebGLTexture; eyes: WebGLTexture | null }>();
  private covs = new Map<string, WebGLTexture>();
  private size = [0, 0];
  private float: boolean;
  private targets: Record<string, Target> = {};
  private depth: WebGLRenderbuffer | null = null;
  private smallDepth: WebGLRenderbuffer | null = null;
  private small = [1, 1];
  /** Guided-filter grids (the visible face, her lips; made on first use) and the map each last fitted (the live mirror and the tutorial paint many frames with one map). */
  private grids: Record<string, { n: number; prob: WebGLTexture; t: Record<string, Target>; last: { key: object; w: number; h: number; out: [number, WebGLTexture] } | null }> = {};
  lost = false;

  /** A renderer, or null when the phone has no WebGL2 (the app then uses the tiny networks). */
  static create(): MakeupGL | null {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, depth: false });
      return gl ? new MakeupGL(canvas, gl) : null;
    } catch (error) {
      console.warn("makeup engine unavailable", error);
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.float = Boolean(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); this.lost = true; });
    const make = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      for (const [type, text] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, text); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, "aPos"); gl.bindAttribLocation(p, 0, "aPt"); gl.bindAttribLocation(p, 0, "aXy"); gl.bindAttribLocation(p, 1, "aUv");
      gl.bindAttribLocation(p, 2, "aW");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
      return p;
    };
    this.progs = {
      mesh: make(MESH_VS, COPY_FS), canon: make(MESH_VS, CANON_FS), extend: make(QUAD_VS, EXTEND_FS), foundPrep: make(QUAD_VS, FOUND_PREP_FS), found: make(QUAD_VS, FOUND_FS), flat: make(FLAT_VS, FLAT_FS), prep: make(QUAD_VS, PREP_FS),
      blur: make(QUAD_VS, BLUR_FS), main: make(QUAD_VS, MAIN_FS), visPrep: make(QUAD_VS, VIS_PREP_FS), visFit: make(QUAD_VS, VIS_FIT_FS),
      side: make(MESH_VS, SIDE_FS), zone: make(FLAT_VS, ZONE_FS), dab: make(DAB_VS, DAB_FS), strand: make(DAB_VS, STRAND_FS), stone: make(STONE_VS, STONE_FS), pattern: make(DAB_VS, PATTERN_FS),
    };
    this.buf = gl.createBuffer()!;
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.src = this.texture();
    this.wbuf = gl.createBuffer()!;
  }

  private texture(): WebGLTexture {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /** An off-screen target: `count` textures (half-float or bytes) of w x h. */
  private target(count: number, float: boolean, w: number, h: number): Target {
    const gl = this.gl, fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const tex: WebGLTexture[] = [];
    for (let i = 0; i < count; i++) {
      const t = this.texture();
      if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      tex.push(t);
    }
    return { fb, tex };
  }

  /** Off-screen targets for this picture size (re-made when the size changes). */
  private resize(w: number, h: number) {
    if (this.size[0] === w && this.size[1] === h) return;
    const gl = this.gl;
    for (const t of Object.values(this.targets)) { gl.deleteFramebuffer(t.fb); t.tex.forEach((x) => gl.deleteTexture(x)); }
    if (this.depth) gl.deleteRenderbuffer(this.depth);
    const target = (count: number, float: boolean) => this.target(count, float, w, h);
    this.targets = {
      layer: target(1, false), mask: target(1, false), prep: target(3, this.float), cov: target(1, false), covB: target(1, false),
      shadeF: target(1, this.float), shadeB: target(1, this.float),
      tmp: target(1, this.float), maskB: target(1, false), lipB: target(1, this.float), greyB: target(1, this.float),
      // (the zones in half-float when the phone has it: her steps' soft edges fade out without 8-bit steps)
      canon: target(1, false), zoneA: target(1, this.float), zoneB: target(1, this.float), zoneAB: target(1, this.float), zoneBB: target(1, this.float),
      side: target(1, false), detail: target(1, false), layerX: target(1, false), srcF: target(1, false),
    };
    // the extension at 1/EXTEND_SCALE of the size, with its own depth
    const sw = Math.ceil(w / EXTEND_SCALE), sh = Math.ceil(h / EXTEND_SCALE);
    for (const name of ["extA", "extT", "extB", "extN"]) this.targets[name] = this.target(1, this.float, sw, sh);
    // her foundation at the same size (only with half-float targets: her light in 8 bits is too coarse on darker skin)
    if (this.float) for (const name of ["fndM", "fndR", "fndA", "fndN", "fndC", "fndL", "fndF", "fndB"]) this.targets[name] = this.target(1, true, sw, sh);
    if (this.smallDepth) gl.deleteRenderbuffer(this.smallDepth);
    this.smallDepth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.smallDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, sw, sh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.extA.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.smallDepth);
    this.small = [sw, sh];
    this.depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    for (const name of ["layer", "canon", "cov", "side"]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[name].fb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    for (const t of this.targets.canon.tex) {   // read texel by texel (two 16-bit numbers per texel)
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    this.size = [w, h];
  }

  /** Upload a look's files to the graphics chip (kept for the next frames). */
  private lookTextures(look: LookFiles) {
    let t = this.layers.get(look.id);
    if (t) return t;
    const gl = this.gl;
    const layer = this.texture();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, look.layer);
    let eyes: WebGLTexture | null = null;
    if (look.eyes) {
      eyes = this.texture();
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, look.eyes.w, look.eyes.h, 0, gl.RED, gl.UNSIGNED_BYTE, look.eyes.map);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    }
    t = { layer, eyes };
    this.layers.set(look.id, t);
    if (this.layers.size > 8) {               // keep a few looks on the chip
      const [oldest, old] = this.layers.entries().next().value!;
      gl.deleteTexture(old.layer); if (old.eyes) gl.deleteTexture(old.eyes);
      this.layers.delete(oldest);
    }
    return t;
  }

  /** A look's eyeshadow coverage map on the chip (a few kept). */
  private covTexture(id: string, image: ImageBitmap) {
    let t = this.covs.get(id);
    if (t) return t;
    const gl = this.gl;
    t = this.texture();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.covs.set(id, t);
    if (this.covs.size > 4) {
      const [oldest, old] = this.covs.entries().next().value!;
      gl.deleteTexture(old); this.covs.delete(oldest);
    }
    return t;
  }

  private use(name: string) { const p = this.progs[name]; this.gl.useProgram(p); return p; }
  private uni(p: WebGLProgram, name: string) { return this.gl.getUniformLocation(p, name); }
  private bindTex(p: WebGLProgram, name: string, tex: WebGLTexture, unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uni(p, name), unit);
  }
  private drawQuad(p: WebGLProgram, flip = 1) {
    const gl = this.gl;
    gl.disableVertexAttribArray(2);
    gl.uniform1f(this.uni(p, "uFlip"), flip);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  /** Triangles with per-vertex (x, y, z) and (u, v), and optionally a weight per vertex (else 1). */
  private drawMesh(data: Float32Array, weights?: Float32Array) {
    const gl = this.gl;
    if (weights) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.wbuf);
      gl.bufferData(gl.ARRAY_BUFFER, weights, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    } else { gl.disableVertexAttribArray(2); gl.vertexAttrib1f(2, 1); }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 5);
  }
  /** Lash strands (lashStrands) into the eye detail (the layer's alpha), each over the ones under it. */
  private strands(data: Float32Array, w: number, h: number) {
    if (!data.length) return;
    const gl = this.gl, p = this.use("strand");
    gl.uniform2f(this.uni(p, "uSize"), w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.layer.fb);
    gl.colorMask(false, false, false, true);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFuncSeparate(gl.ZERO, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 5);
    gl.disable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.disableVertexAttribArray(2);
    gl.colorMask(true, true, true, true);
  }

  /** Her eyeshadow's drawn placement (shadowPattern) onto one channel of a target (the larger of it and what is there). */
  private pattern(to: Target, channel: number, data: Float32Array, w: number, h: number) {
    if (!data.length) return;
    const gl = this.gl, p = this.use("pattern");
    gl.uniform2f(this.uni(p, "uSize"), w, h);
    gl.uniform4f(this.uni(p, "uColor"), ...([0, 1, 2, 3].map((c) => (c === channel ? 1 : 0)) as [number, number, number, number]));
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
    gl.colorMask(channel === 0, channel === 1, channel === 2, channel === 3);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 5);
    gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.disableVertexAttribArray(2);
    gl.colorMask(true, true, true, true);
  }

  /** Her rhinestones (stoneSpots) onto the canvas, over everything (white: her light, linear; blur: her photo's, px). */
  private stones(list: Spot[], w: number, h: number, white: number[], blur: number, show: number) {
    if (!list.length || show <= 0) return;
    const gl = this.gl, p = this.use("stone"), S = 1.8, data = new Float32Array(list.length * 30), corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    list.forEach(([x, y, r, a], i) => {
      for (let k = 0; k < 6; k++) data.set([x + corners[k * 2] * r * S, y + corners[k * 2 + 1] * r * S, corners[k * 2] * S, corners[k * 2 + 1] * S, a], i * 30 + k * 5);
    });
    gl.uniform2f(this.uni(p, "uSize"), w, h);
    gl.uniform1f(this.uni(p, "uFlip"), -1);
    gl.uniform3f(this.uni(p, "uWhite"), white[0], white[1], white[2]);
    gl.uniform1f(this.uni(p, "uBlur"), blur);
    gl.uniform1f(this.uni(p, "uShow"), Math.min(1, show));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 5);
    gl.disable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.disableVertexAttribArray(2);
  }

  /** Soft spots (x, y, radius in pixels, amount) added onto one channel of a target. */
  private spots(to: Target, channel: number, list: Spot[], w: number, h: number) {
    const gl = this.gl, data = new Float32Array(list.length * 30), corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    let n = 0;
    for (const [x, y, r, a] of list) {
      for (let k = 0; k < 6; k++) data.set([x + corners[k * 2] * r, y + corners[k * 2 + 1] * r, corners[k * 2], corners[k * 2 + 1], a], n + k * 5);
      n += 30;
    }
    if (!n) return;
    const p = this.use("dab");
    gl.uniform2f(this.uni(p, "uSize"), w, h);
    gl.uniform4f(this.uni(p, "uColor"), ...([0, 1, 2, 3].map((c) => (c === channel ? 1 : 0)) as [number, number, number, number]));
    gl.uniform1i(this.uni(p, "uDither"), 1);             // (8-bit targets need it; on half-float it is below the blur)
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
    gl.colorMask(channel === 0, channel === 1, channel === 2, channel === 3);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.drawArrays(gl.TRIANGLES, 0, n / 5);
    gl.disable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.disableVertexAttribArray(2);
    gl.colorMask(true, true, true, true);
  }

  /** A separable Gaussian blur (a sigma per channel, px); `cap`: each channel at most this much before it is blurred. */
  private blur(from: WebGLTexture, to: Target, sigma: number[], scissor: number[], grid?: string, cap = [1e9, 1e9, 1e9, 1e9]) {
    const g = grid ? this.grids[grid] : null;
    const gl = this.gl, [w, h] = g ? [g.n, g.n] : this.size;
    const tmp = g ? g.t.tmp : this.targets.tmp;
    const s = sigma.map((x) => Math.max(0.5, x));
    // up to 24 taps each side: a wide blur samples every few pixels (still several samples per sigma)
    const reach = Math.ceil(3 * Math.max(...s)), stride = Math.max(1, Math.ceil(reach / 24));
    const p = this.use("blur");
    gl.uniform4f(this.uni(p, "uSigma"), s[0], s[1], s[2], s[3]);
    gl.uniform1i(this.uni(p, "uR"), Math.ceil(reach / stride));
    gl.uniform1f(this.uni(p, "uStride"), stride);
    gl.uniform4f(this.uni(p, "uCap"), cap[0], cap[1], cap[2], cap[3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.fb);
    gl.scissor(scissor[0], scissor[1], scissor[2], scissor[3]);
    this.bindTex(p, "uTex", from, 0);
    gl.uniform2f(this.uni(p, "uStep"), 1 / w, 0);
    this.drawQuad(p);
    gl.uniform4f(this.uni(p, "uCap"), 1e9, 1e9, 1e9, 1e9);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
    this.bindTex(p, "uTex", tmp.tex[0], 0);
    gl.uniform2f(this.uni(p, "uStep"), 0, 1 / h);
    this.drawQuad(p);
  }

  /** A Gaussian blur on the small (1/EXTEND_SCALE) targets, over all of them. */
  private blurSmall(from: WebGLTexture, to: Target, sigma: number) {
    const gl = this.gl, [w, h] = this.small, s = Math.max(0.5, sigma);
    const reach = Math.ceil(3 * s), stride = Math.max(1, Math.ceil(reach / 24));
    const p = this.use("blur");
    gl.uniform4f(this.uni(p, "uSigma"), s, s, s, s);
    gl.uniform4f(this.uni(p, "uCap"), 1e9, 1e9, 1e9, 1e9);
    gl.uniform1i(this.uni(p, "uR"), Math.ceil(reach / stride));
    gl.uniform1f(this.uni(p, "uStride"), stride);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.extT.fb);
    this.bindTex(p, "uTex", from, 0);
    gl.uniform2f(this.uni(p, "uStep"), 1 / w, 0);
    this.drawQuad(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
    this.bindTex(p, "uTex", this.targets.extT.tex[0], 0);
    gl.uniform2f(this.uni(p, "uStep"), 0, 1 / h);
    this.drawQuad(p);
  }

  /**
   * A colour-guided filter (He et al. 2013) on a grid over a square crop of her photo (fit() in occlusion.py): the
   * coarse map p, then the filter's linear models q = a . I + b fitted to her photo there, read at full resolution by
   * the main pass. "vis": her visible face (p from the segmenter's face and body skin, a hand inside her oval is not
   * her face); "lip": her lips (p from lipProb in tryon.ts). Returns the main pass's mode (1: coarse only, on phones
   * without half-float targets; 2: guided) and the texture to read.
   */
  private guided(kind: "vis" | "lip", key: object, n: number, box: [number, number, number], data: Uint8Array, sigma: number, eps: number,
    P: Pt[], ew: number, w: number, h: number): [number, WebGLTexture] {
    let grid = this.grids[kind];
    if (grid?.last && grid.last.key === key && grid.last.w === w && grid.last.h === h) return grid.last.out;
    const gl = this.gl, full = [0, 0, n, n];
    if (!grid) {
      const f = this.float, t = (count: number, float: boolean) => this.target(count, float, n, n);
      grid = this.grids[kind] = { n, prob: this.texture(), last: null, t: {
        oval: t(1, false), ovalB: t(1, false), stat: f ? t(4, true) : t(1, false), tmp: t(1, f), edge: t(1, false),
        ...(f ? { s0: t(1, true), s1: t(1, true), s2: t(1, true), s3: t(1, true), fit: t(1, true), fitB: t(1, true) } : {}),
      } };
    }
    const G = grid.t, [x0, y0, side] = box, k = n / side, vis = kind === "vis";
    gl.bindTexture(gl.TEXTURE_2D, grid.prob);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (vis) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, VIS_SEG, VIS_SEG, 0, gl.RG, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.viewport(0, 0, n, n);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, n, n);
    let p: WebGLProgram;
    if (vis) {      // her face oval on the grid, softened ("inside her face": a hand there covers her face)
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.oval.fb);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      p = this.use("flat");
      gl.uniform2f(this.uni(p, "uSize"), n, n);
      gl.uniform4f(this.uni(p, "uColor"), 1, 1, 1, 1);
      const q = OVAL.map((i) => [(P[i][0] - x0) * k, (P[i][1] - y0) * k]);
      const c = q.reduce((a, b) => [a[0] + b[0] / q.length, a[1] + b[1] / q.length], [0, 0]);
      const fan: number[] = [];
      q.forEach((a, i) => { const b = q[(i + 1) % q.length]; fan.push(c[0], c[1], a[0], a[1], b[0], b[1]); });
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fan), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      gl.drawArrays(gl.TRIANGLES, 0, fan.length / 2);
      const so = ew * k * OVAL_SOFT;
      this.blur(G.oval.tex[0], G.ovalB, [so, so, so, so], full, kind);
    }
    // the coarse map and the guided filter's products
    const coarse = !this.float;
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.stat.fb);
    gl.drawBuffers(coarse ? [gl.COLOR_ATTACHMENT0] : [0, 1, 2, 3].map((i) => gl.COLOR_ATTACHMENT0 + i));
    p = this.use("visPrep");
    this.bindTex(p, "uSrc", this.src, 0);
    this.bindTex(p, "uProb", grid.prob, 1);
    this.bindTex(p, "uOval", G.ovalB.tex[0], 2);
    gl.uniform4f(this.uni(p, "uBox"), x0, y0, side, n);
    gl.uniform2f(this.uni(p, "uPhoto"), w, h);
    gl.uniform1i(this.uni(p, "uCoarse"), coarse ? 1 : 0);
    gl.uniform1i(this.uni(p, "uDirect"), vis ? 0 : 1);
    this.drawQuad(p);
    if (vis) {      // the coarse map softened: where the look's skin-level layer fades out (edge_fade in occlusion.py)
      const se = EDGE_SOFT * ew * k;
      this.blur(G.stat.tex[0], G.edge, [se, se, se, se], full, kind);
    }
    let out: [number, WebGLTexture] = [1, G.stat.tex[0]];
    if (!coarse) {
      const sg = sigma;
      [G.s0, G.s1, G.s2, G.s3].forEach((to, i) => this.blur(G.stat.tex[i], to, [sg, sg, sg, sg], full, kind));
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fit.fb);
      p = this.use("visFit");
      [G.s0, G.s1, G.s2, G.s3].forEach((t, i) => this.bindTex(p, `uS${i}`, t.tex[0], i));
      gl.uniform1f(this.uni(p, "uEps"), eps);
      this.drawQuad(p);
      this.blur(G.fit.tex[0], G.fitB, [sg, sg, sg, sg], full, kind);
      out = [2, G.fitB.tex[0]];
    }
    gl.viewport(0, 0, w, h);
    grid.last = { key, w, h, out };
    return out;
  }

  /**
   * Paint `look` on `source` (w x h, her photo or camera frame) with her landmarks P (pixels).
   * `lip` replaces the look's lipstick (her pick, see lipChoice); `canon` is needed for metallic
   * and glitter; `steps` shows only part of the look (the guided tutorial); `products` are her own
   * products and each step's intensity; `vis` is her visible face (nothing is painted over what covers
   * it). The result is on this.canvas (w x h).
   */
  render(source: TexImageSource, w: number, h: number, P: Pt[], look: LookFiles, face: FaceStats, level: Level, tris: number[],
    lip: LipInfo = look.lip, canon?: Canon, steps?: StepState, products?: Products, vis?: Visibility | null, lips?: LipGrid | null) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.resize(w, h);
    const [kLayer, kLip, kEye] = LEVELS[level];
    const ew = eyeWidth(P);
    const tex = this.lookTextures(look);

    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const skin = this.skin && this.skin.width === w && this.skin.height === h ? this.skin : null;
    if (skin) {
      this.skinTex ??= this.texture();
      gl.bindTexture(gl.TEXTURE_2D, this.skinTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, skin);
    }

    // Work only around the face (plus the widest blur), everything else stays her pixels.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < 468; i++) {
      x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); y0 = Math.min(y0, P[i][1]); y1 = Math.max(y1, P[i][1]);
      z0 = Math.min(z0, P[i][2]); z1 = Math.max(z1, P[i][2]);
    }
    const m = ew * 0.6 + 8;
    const sx = Math.max(0, Math.floor(x0 - m)), sy = Math.max(0, Math.floor(y0 - m));
    const scissor = [sx, sy, Math.min(w, Math.ceil(x1 + m)) - sx, Math.min(h, Math.ceil(y1 + m)) - sy];

    gl.disable(gl.BLEND);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.SCISSOR_TEST);
    for (const [name, clear] of [["layer", [0.5, 0.5, 0.5, 0]], ["mask", [0, 0, 0, 0]], ["maskB", [0, 0, 0, 0]], ["lipB", [0, 1, 0, 1]], ["greyB", [0, 1, 0, 1]], ["canon", [0, 0, 0, 0]], ["cov", [0, 0, 0, 0]], ["shadeF", [0, 1, 0, 1]], ["shadeB", [0, 1, 0, 1]]] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[name].fb);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | (name === "layer" || name === "canon" || name === "cov" ? gl.DEPTH_BUFFER_BIT : 0));
    }
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(scissor[0], scissor[1], scissor[2], scissor[3]);

    // how much of each eye is seen (the far eye of a face in profile: none; its points slide onto her nose)
    const shown = eyeShown(P);
    // 1. catalog layer along the face mesh (rgb), then the eye detail (alpha); nearer triangles in front
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.layer.fb);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    let p = this.use("mesh");
    gl.uniform2f(this.uni(p, "uSize"), w, h);
    gl.uniform2f(this.uni(p, "uZ"), z0, z1);
    gl.uniform1f(this.uni(p, "uBias"), 0);
    const mesh = new Float32Array(tris.length * 5);
    const far = farHalf(look.uv, look.layer.width, look.layer.height);
    tris.forEach((i, k) => { const j = sourceOf(i, far); mesh.set([P[i][0], P[i][1], P[i][2], look.uv[j * 2], look.uv[j * 2 + 1]], k * 5); });
    const mine = products?.mine;
    gl.colorMask(!mine, !mine, !mine, false);      // her own makeup: no catalog layer, only the mesh's depth
    this.bindTex(p, "uTex", tex.layer, 0);
    // the layer fades in from her face's outline, and around an eye that is hardly seen (feather_map in teacher.py)
    let fw = canon ? meshFeather(canon) : null;
    if (fw && canon && Math.min(shown[0], shown[1]) < 0.999) {
      const [gR, gL] = meshEyes(canon), f = fw;
      fw = f.map((x, i) => x * (1 - (1 - shown[0]) * gR[i]) * (1 - (1 - shown[1]) * gL[i]));
    }
    // (with the weights the layer is feathered at its edge by the extension below, else as it is)
    gl.uniform4f(this.uni(p, "uPick"), 1, 0, 0, 0);
    const weights = fw ? Float32Array.from(tris, (i) => fw![i] ?? 1) : undefined;
    this.drawMesh(mesh, weights);
    const lashes = products?.mine?.lashes;
    if (look.eyes && tex.eyes && !lashes) {
      const e = look.eyes;
      // the far eye's triangles are replaced by the mirror image of the near eye's (eye_triangles in teacher.py);
      // drawn far to near, and only where no nearer part of her face (the mesh just drawn) is in front
      const found: Array<[number[], number[]]> = [];
      for (let k = 0; k < e.tris.length; k += 3) {
        const t = [e.tris[k], e.tris[k + 1], e.tris[k + 2]], ids = t.map((x) => e.ids[x]);
        if (far && ids.some((i) => HALF[i] === far)) continue;
        found.push([ids, t]);
        if (far && ids.every((i) => HALF[i] === -far)) found.push([ids.map((i) => MIRROR[i]), t]);
      }
      const depth = ([ids]: [number[], number[]]) => P[ids[0]][2] + P[ids[1]][2] + P[ids[2]][2];
      found.sort((a, b) => depth(b) - depth(a));
      const data = new Float32Array(found.length * 15), seen = new Float32Array(found.length * 3);
      found.forEach(([ids, t], k) => {
        t.forEach((x, n) => data.set([P[ids[n]][0], P[ids[n]][1], P[ids[n]][2], (e.pts[x * 2] + 0.5) / e.w, (e.pts[x * 2 + 1] + 0.5) / e.h], k * 15 + n * 5));
        seen.fill(HALF[ids[0]] + HALF[ids[1]] + HALF[ids[2]] < 0 ? shown[0] : shown[1], k * 3, k * 3 + 3);
      });
      gl.colorMask(false, false, false, true);
      gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
      gl.uniform1f(this.uni(p, "uBias"), EYE_DEPTH_TOL);
      this.bindTex(p, "uTex", tex.eyes, 0);
      gl.uniform4f(this.uni(p, "uPick"), 0, 0, 0, 0);
      this.drawMesh(data, seen);
      gl.depthMask(true); gl.depthFunc(gl.LESS);
      gl.uniform1f(this.uni(p, "uBias"), 0);
    }
    gl.colorMask(true, true, true, true);
    if (lashes) {        // her lashes strand by strand, on her own lash lines
      gl.disable(gl.DEPTH_TEST);
      this.strands(lashStrands(P, lashes.place, Boolean(lashes.lower), shown), w, h);
      gl.enable(gl.DEPTH_TEST);
      p = this.use("mesh");
    }
    // 1'. the look beyond the face mesh (extend_layer in teacher.py), at 1/EXTEND_SCALE of the size
    const extendOn = Boolean(weights) && !mine;
    if (extendOn) {
      const [sw, sh] = this.small;
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, sw, sh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.extA.fb);
      gl.clearColor(0.5, 0.5, 0.5, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.depthFunc(gl.LESS);
      p = this.use("mesh");
      this.bindTex(p, "uTex", tex.layer, 0);
      gl.uniform4f(this.uni(p, "uPick"), 0, 0, 1, 0);
      this.drawMesh(mesh, weights);
      gl.disable(gl.DEPTH_TEST);
      this.blurSmall(this.targets.extA.tex[0], this.targets.extB, (EXTEND * ew * sw) / w);
      this.blurSmall(this.targets.extA.tex[0], this.targets.extN, (EXTEND_IN * ew * sw) / w);
      gl.viewport(0, 0, w, h);
      gl.enable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.layerX.fb);
      p = this.use("extend");
      this.bindTex(p, "uLayer", this.targets.layer.tex[0], 0);
      this.bindTex(p, "uExtA", this.targets.extA.tex[0], 1);
      this.bindTex(p, "uExtB", this.targets.extB.tex[0], 2);
      this.bindTex(p, "uExtN", this.targets.extN.tex[0], 3);
      gl.uniform4f(this.uni(p, "uWork"), scissor[0], scissor[1], scissor[0] + scissor[2], scissor[1] + scissor[3]);
      gl.uniform1f(this.uni(p, "uEw"), ew);
      gl.uniform2f(this.uni(p, "uSize"), w, h);
      this.drawQuad(p);
      gl.enable(gl.DEPTH_TEST);
      p = this.use("mesh");          // the passes below draw with the mesh program
    }
    // 1a. her eyeshadow's placement: a catalog look's coverage map along the mesh (it shares the layer's uv)
    const prod = products;
    const pigs = prod ? [prod.shadow, prod.contour, prod.blush, prod.glow, prod.shadow2, prod.inner] : [];
    if (prod?.shadow?.cov) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.cov.fb);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const { uv, image } = prod.shadow.cov;
      const covFar = farHalf(uv, image.width, image.height);
      const data = new Float32Array(tris.length * 5);
      tris.forEach((i, k) => { const j = sourceOf(i, covFar); data.set([P[i][0], P[i][1], P[i][2], uv[j * 2], uv[j * 2 + 1]], k * 5); });
      this.bindTex(p, "uTex", this.covTexture(prod.shadow.cov.id, prod.shadow.cov.image), 0);
      gl.uniform4f(this.uni(p, "uPick"), 1, 0, 0, 0);
      gl.colorMask(true, false, false, false);          // (green and blue: her own makeup's lid and inner-corner masks)
      this.drawMesh(data);
      gl.colorMask(true, true, true, true);
    }
    // 1b. for metallic and glitter: the bare face's coordinates along the mesh (grains stay on her lips)
    const grains = (lip.finish === "metallic" || lip.finish === "glitter" || pigs.some((x) => x && x.finish > 0)) && canon;
    if (grains) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.canon.fb);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      p = this.use("canon");
      gl.uniform2f(this.uni(p, "uSize"), w, h);
      gl.uniform2f(this.uni(p, "uZ"), z0, z1);
      const data = new Float32Array(tris.length * 5);
      tris.forEach((i, k) => data.set([P[i][0], P[i][1], P[i][2], canon.pts[i * 2], canon.pts[i * 2 + 1]], k * 5));
      this.drawMesh(data);
    }
    // 1c. which half of her face is in front (zones of one half stay off the other; which eye is which)
    const zonesOn = Boolean(steps || prod);
    const keep = lashKeep(P), openOn = Math.min(keep[0], keep[1]) < 0.999;
    const concealOn = face.skin != null && face.skin > 0;
    if (zonesOn || openOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.side.fb);
      gl.clearColor(0.5, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      p = this.use("side");
      gl.uniform2f(this.uni(p, "uSize"), w, h);
      gl.uniform2f(this.uni(p, "uZ"), z0, z1);
      gl.uniform1f(this.uni(p, "uBias"), 0);
      const data = new Float32Array(tris.length * 5);
      tris.forEach((i, k) => data.set([P[i][0], P[i][1], P[i][2], i < 468 ? HALF[i] : 0, 0], k * 5));
      this.drawMesh(data);
    }
    gl.disable(gl.DEPTH_TEST);

    // 2. masks: eyeballs (r), mouth opening (g), lips (b and a)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.mask.fb);
    p = this.use("flat");
    gl.uniform2f(this.uni(p, "uSize"), w, h);
    // (draws with the program in use: "flat", or "zone" for the step zones)
    const poly = (pts: [number, number][], mask: [boolean, boolean, boolean, boolean], color: number[]) => {
      let cx = 0, cy = 0;
      for (const q of pts) { cx += q[0] / pts.length; cy += q[1] / pts.length; }
      const data: number[] = [];
      pts.forEach((q, k) => { const n = pts[(k + 1) % pts.length]; data.push(cx, cy, q[0], q[1], n[0], n[1]); });
      gl.colorMask(...mask);
      gl.uniform4f(this.uni(p, "uColor"), color[0], color[1], color[2], color[3]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(1);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 2);
    };
    poly(ring(P, EYE_R, BALL_SCALE[0], BALL_SCALE[1]), [true, false, false, false], [1, 0, 0, 0]);
    poly(ring(P, EYE_L, BALL_SCALE[0], BALL_SCALE[1]), [true, false, false, false], [1, 0, 0, 0]);
    poly(ring(P, LIPS_OUT), [false, false, true, true], [0, 0, 1, 1]);
    poly(ring(P, LIPS_IN), [false, true, true, true], [0, 1, 0, 0]);
    gl.colorMask(true, true, true, true);

    // 2b. step-by-step and her products: each step's zone (and her blush's placement), each polygon of one half
    // of her face only where that half is in front. A closing eye needs the liner band too (its lashes fade).
    const geo = zonesOn ? stepGeometry(P, steps?.blush ?? prod!.blush?.style ?? "apples") : null;
    const lidGeo = geo ?? (openOn ? stepGeometry(P, "apples") : null);
    if (lidGeo) {
      p = this.use("zone");
      gl.uniform2f(this.uni(p, "uSize"), w, h);
      this.bindTex(p, "uSide", this.targets.side.tex[0], 0);
      const zone = (target: string, channel: number, g: StepGeo) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[target].fb);
        const mask = [0, 1, 2, 3].map((c) => c === channel) as [boolean, boolean, boolean, boolean];
        g.polys.forEach((shape, k) => { const x = g.values?.[k] ?? 1; gl.uniform1f(this.uni(p, "uHalf"), g.sides?.[k] ?? 0); poly(shape, mask, [x, x, x, x]); });
      };
      for (const name of ["zoneA", "zoneB"]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[name].fb);
        gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (mine) {          // her own makeup: her steps' shapes
        const z = mineZones(P, mine);
        z.A.forEach((g, c) => zone("zoneA", c, g));
        z.B.forEach((g, c) => zone("zoneB", c, g));
        const T = this.targets;
        if (mine.shadow) {
          // (drawn from her own eye: as soft as her brush lays it, and never crisper than her photo)
          let C = T.cov;
          if (mine.shadow.drawn) {
            this.pattern(T.cov, 0, shadowPattern(P, mine.shadow.drawn, false, mine.shadow.lower), w, h);
            const edge = SHADOW_PATTERN_EDGE[mine.shadow.drawn] ?? 1;
            const sigma = Math.max(0.8, ew * (SHADOW_PATTERN_SOFT[mine.shadow.pack] ?? 0.075) * edge, 0.9 * (face.blur ?? 0));
            this.blur(T.cov.tex[0], T.covB, [sigma, 0.5, 0.5, 0.5], scissor);
            C = T.covB;
          } else if (mine.shadow.lower || mine.shadow.below) {          // (over her map)
            this.pattern(T.cov, 0, shadowPattern(P, mine.shadow.below ?? "none", false, Boolean(mine.shadow.lower), true), w, h);
          }
          const m = lidSpots(P);
          this.pattern(C, 1, shadowPattern(P, "", true), w, h);          // (her mobile lid: LID_PATTERN)
          if (prod?.inner && mine.shadow.corners !== false) this.spots(C, 2, m.inner, w, h);
          if (prod?.inner && mine.shadow.aegyoSal) this.spots(C, 2, m.aegyo, w, h);
          this.spots(C, 3, m.low, w, h);
        }
        if (mine.freckles) this.spots(T.zoneB, 0, freckleSpots(P), w, h);     // (zoneB's free channel)
        p = this.use("flat");
      } else {
        if (geo) { zone("zoneA", 0, geo.conceal); zone("zoneA", 1, geo.contour); zone("zoneA", 2, geo.blush); zone("zoneA", 3, geo.glow); }
        zone("zoneB", 0, lidGeo.shadow); zone("zoneB", 1, lidGeo.liner);
        if (prod?.blush) zone("zoneB", 2, stepGeometry(P, prod.blush.style).blush);
        if (prod?.browDefine) zone("zoneB", 3, lidGeo.brows);
      }
      gl.colorMask(true, true, true, true);
    }

    // 3. her lip brightness and grey level, then all blurs
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.prep.fb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    p = this.use("prep");
    this.bindTex(p, "uSrc", this.src, 0);
    this.bindTex(p, "uMask", this.targets.mask.tex[0], 1);
    this.drawQuad(p);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    // the look's layer and eye detail through her photo's lens (lens_sigma() in teacher.py), and so the edge where they
    // give way to her eyeball: her liner's own edge there is as soft as her photo's
    const camLens = lensSigma(face.blur ?? 0, ew, canon?.ew), soft = camLens > LENS_MIN;
    this.blur(this.targets.mask.tex[0], this.targets.maskB, [Math.hypot(Math.max(1.5, ew * BALL_SOFT), soft ? camLens : 0), 1.5, Math.max(0.8, ew * 0.012), ew * 0.05], scissor);
    // (the eye detail darkens at most to EYE_FLOOR: past that it is cut off before the lens, as on her face)
    const eyeGain = (k: StepKey) => (prod?.gain?.[k] ?? 1) * (mine ? 1 : prod?.layerGain?.[k] ?? 1);
    const detailCap = (1 - EYE_FLOOR) / Math.max(1e-3, kEye * (geo ? Math.max(eyeGain("liner"), eyeGain("lashes")) : 1));
    if (soft) this.blur((extendOn ? this.targets.layerX : this.targets.layer).tex[0], this.targets.detail, [camLens, camLens, camLens, camLens], scissor, undefined, [1e9, 1e9, 1e9, detailCap]);
    this.blur(this.targets.prep.tex[0], this.targets.lipB, [ew * 0.06, ew * 0.06, ew * 0.02, ew * 0.02], scissor);
    this.blur(this.targets.prep.tex[1], this.targets.greyB, [Math.max(0.8, ew * 0.028), Math.max(1.2, ew * 0.042), ew * 0.012, ew * 0.012], scissor);
    if (mine) {          // her steps' edges as soft as her tools make them, and never crisper than her photo
      const soft = (x: number) => Math.max(0.8, ew * x, 0.9 * (face.blur ?? 0)), T = this.targets;
      const sA = [mine.conceal, mine.contour, mine.blush, mine.glow].map((x) => soft(x?.soft ?? 0.1));
      const sB = [soft(FRECKLE_SOFT), soft(mine.liner?.soft ?? 0.01), soft(mine.brows?.soft ?? 0.02), soft(0.05)];
      this.blur(T.zoneA.tex[0], T.zoneAB, sA, scissor);
      this.blur(T.zoneB.tex[0], T.zoneBB, sB, scissor);
    } else {
      if (geo) this.blur(this.targets.zoneA.tex[0], this.targets.zoneAB, [ew * 0.1, ew * 0.1, ew * 0.12, ew * 0.12], scissor);
      if (lidGeo) this.blur(this.targets.zoneB.tex[0], this.targets.zoneBB, [ew * 0.04, Math.hypot(Math.max(0.8, ew * 0.012), soft ? camLens : 0), prod?.blush ? ew * BLUSH_SOFT : 1, prod?.browDefine ? Math.max(0.8, ew * BROW_ZONE[1], 0.9 * (face.blur ?? 0)) : 1], scissor);
    }
    const pigmentsOn = Boolean(prod && (pigs.some(Boolean) || prod.liner || prod.brows || prod.browDefine));
    if (pigmentsOn) {     // her shading: form and broad light (shading() in products.py), her local highlights
      this.blur(this.targets.prep.tex[2], this.targets.shadeF, [ew * SHADE_SIGMA[0], ew * SHADE_SIGMA[0], ew * 0.012, ew * 0.03], scissor);
      this.blur(this.targets.prep.tex[2], this.targets.shadeB, [ew * SHADE_SIGMA[1], ew * SHADE_SIGMA[1], 1, 1], scissor);
    }

    // 3b. where her face can be seen, and her own lip line
    const [visMode, visTex] = vis ? this.guided("vis", vis, VIS_GRID, vis.box, vis.probs, GUIDE_SIGMA, GUIDE_EPS, P, ew, w, h) : [0, this.src];
    // (a dark photo's lips fitted as if lit: lipGain in tryon.ts)
    const lipEps = LIP_EPS / Math.min(LIP_GAIN_MAX, Math.max(1, LIP_LEVEL / Math.max(lips?.level ?? LIP_LEVEL, 1e-3))) ** 2;
    const [lipMode, lipTex] = lips ? this.guided("lip", lips, LIP_GRID, lips.box, lips.p, LIP_SIGMA * ew * LIP_GRID / lips.box[2], lipEps, P, ew, w, h) : [0, this.src];

    // 3c. her foundation (foundation() in teacher.py): her visible skin and its softened light at 1/EXTEND_SCALE of the
    // size, then her photo with the foundation on, which the main pass paints the look over. In the tutorial it goes on
    // with the base step.
    const foundK = kLayer * (prod?.gain?.base ?? 1) * (steps ? (steps.active?.key === "base" ? steps.active.t : steps.done.base ?? 0) : 1);
    const foundOn = Boolean(this.targets.fndM) && foundK > 0;
    if (foundOn) {
      const T = this.targets, [sw, sh] = this.small, k = sw / w;
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, sw, sh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fndM.fb);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      p = this.use("flat");
      gl.uniform2f(this.uni(p, "uSize"), w, h);
      const shapes = foundShapes(P, vis);
      // r: where her skin is measured; g: where the foundation goes on
      poly(shapes.outline, [true, true, true, true], [1, 1, 1, 1]);
      for (const hole of shapes.holes) poly(hole, [true, true, true, true], [0, 0, 0, 0]);
      gl.colorMask(true, true, true, true);
      this.blurSmall(T.fndM.tex[0], T.fndR, FOUND_SOFT * ew * k);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fndA.fb);
      p = this.use("foundPrep");
      this.bindTex(p, "uSrc", this.src, 0);
      this.bindTex(p, "uR", T.fndR.tex[0], 1);
      this.bindTex(p, "uVis", visTex, 2);
      gl.uniform1i(this.uni(p, "uVisMode"), visMode);
      gl.uniform3f(this.uni(p, "uVisBox"), ...(vis?.box ?? [0, 0, 1]));
      gl.uniform2f(this.uni(p, "uSize"), w, h);
      gl.uniform1f(this.uni(p, "uSkinY"), face.skin ?? 0);
      // her face's broad colour: her skin's average colour, not weighted by its brightness (else her lit, paler parts
      // weigh more and evening her skin out cools all of her face)
      gl.uniform1i(this.uni(p, "uChroma"), 1);
      this.drawQuad(p);
      this.blurSmall(T.fndA.tex[0], T.fndC, FOUND_WIDE * ew * k);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fndA.fb);
      gl.viewport(0, 0, sw, sh);
      p = this.use("foundPrep");
      this.bindTex(p, "uSrc", this.src, 0);
      this.bindTex(p, "uR", T.fndR.tex[0], 1);
      this.bindTex(p, "uVis", visTex, 2);
      gl.uniform1i(this.uni(p, "uChroma"), 0);
      this.drawQuad(p);
      this.blurSmall(T.fndA.tex[0], T.fndN, FOUND_NEAR * ew * k);
      this.blurSmall(T.fndA.tex[0], T.fndL, FOUND_WIDE_L * ew * k);
      const cover = Math.min(COVER_MAX, foundK * (mine ? 1 : prod?.cover ?? 1));
      if (cover > 0) {
        this.blurSmall(T.fndA.tex[0], T.fndF, FOUND_FINE * ew * k);
        this.blurSmall(T.fndA.tex[0], T.fndB, FOUND_MID * ew * k);
      }
      gl.viewport(0, 0, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.srcF.fb);
      p = this.use("found");
      this.bindTex(p, "uSrc", this.src, 0);
      this.bindTex(p, "uR", T.fndR.tex[0], 1);
      this.bindTex(p, "uN", T.fndN.tex[0], 2);
      this.bindTex(p, "uC", T.fndC.tex[0], 3);
      this.bindTex(p, "uL", T.fndL.tex[0], 4);
      this.bindTex(p, "uVis", visTex, 5);
      this.bindTex(p, "uFace", vis ? this.grids.vis.prob : this.src, 6);
      this.bindTex(p, "uF", T.fndF.tex[0], 7);
      this.bindTex(p, "uM", T.fndB.tex[0], 8);
      this.bindTex(p, "uRet", skin ? this.skinTex! : this.src, 9);
      gl.uniform1f(this.uni(p, "uCover"), cover);
      gl.uniform1f(this.uni(p, "uRetK"), skin ? Math.min(1, cover / RETOUCH_FULL) : 0);
      gl.uniform1i(this.uni(p, "uFaceOn"), vis ? 1 : 0);
      gl.uniform1f(this.uni(p, "uSkinY"), face.skin ?? 0);
      gl.uniform1i(this.uni(p, "uVisMode"), visMode);
      gl.uniform3f(this.uni(p, "uVisBox"), ...(vis?.box ?? [0, 0, 1]));
      gl.uniform2f(this.uni(p, "uSize"), w, h);
      gl.uniform4f(this.uni(p, "uWork"), scissor[0], scissor[1], scissor[0] + scissor[2], scissor[1] + scissor[3]);
      gl.uniform1f(this.uni(p, "uK"), foundK);
      // her own makeup's foundation shade, or the look's (its complexion, at the foundation's strength), blended a
      // little down her neck
      const tint = mine ? mine.base?.tint ?? [1, 1, 1] : (look.tint ?? [1, 1, 1]).map((v) => v ** foundK);
      gl.uniform3f(this.uni(p, "uFTint"), tint[0], tint[1], tint[2]);
      const dx = P[152][0] - P[10][0], dy = P[152][1] - P[10][1], dl = Math.hypot(dx, dy) || 1;
      const jaw = Math.abs((P[397][0] - P[172][0]) * -dy / dl + (P[397][1] - P[172][1]) * dx / dl) / 2;
      gl.uniform4f(this.uni(p, "uNeck"), P[152][0], P[152][1], dx / dl, dy / dl);
      gl.uniform2f(this.uni(p, "uNeckW"), tint.some((v) => v !== 1) ? ew : 0, Math.max(jaw, 1e-3));
      // her own foundation's finish, or the look's skin finish (its recipe) at the foundation's strength
      gl.uniform1f(this.uni(p, "uFFinish"), mine ? mine.base?.finish ?? 0 : Math.min(1, Math.max(-1, (prod?.finish ?? 0) * foundK)));
      this.drawQuad(p);
    }

    // 4. everything together, onto the canvas
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    p = this.use("main");
    this.bindTex(p, "uSrc", foundOn ? this.targets.srcF.tex[0] : this.src, 0);
    this.bindTex(p, "uLayer", (soft ? this.targets.detail : extendOn ? this.targets.layerX : this.targets.layer).tex[0], 1);
    this.bindTex(p, "uMask", this.targets.maskB.tex[0], 2);
    this.bindTex(p, "uLip", this.targets.lipB.tex[0], 3);
    this.bindTex(p, "uGrey", this.targets.greyB.tex[0], 4);
    this.bindTex(p, "uCanon", this.targets.canon.tex[0], 5);
    const { colour, light, rgb } = lipTarget(lip, face);
    const mean = (lip.colour[0] + lip.colour[1] + lip.colour[2]) / 3;
    gl.uniform3f(this.uni(p, "uK"), kLayer, kLip, look.eyes ? kEye : 0);
    gl.uniform1f(this.uni(p, "uLipTint"), extendOn ? 0 : 1);
    gl.uniform3f(this.uni(p, "uTarget"), colour[0], colour[1], colour[2]);
    gl.uniform3f(this.uni(p, "uOmbre"), lip.ombre[0], lip.ombre[1], lip.ombre[2]);
    gl.uniform1f(this.uni(p, "uAlpha"), lip.alpha);
    gl.uniform1f(this.uni(p, "uLipPig"), lip.pigment ?? 1);
    gl.uniform3f(this.uni(p, "uLipRatio"), ...((lip.ratio ?? [1, 1, 1]) as [number, number, number]));
    gl.uniform1f(this.uni(p, "uGamma"), lip.gamma);
    gl.uniform1f(this.uni(p, "uShine"), lip.shine);
    gl.uniform3f(this.uni(p, "uLightC"), rgb[0], rgb[1], rgb[2]);   // her light's colour (her lips' own highlights keep it)
    gl.uniform1f(this.uni(p, "uMetK"), (mean + 0.3) * light);
    gl.uniform1f(this.uni(p, "uLight"), light);
    gl.uniform1f(this.uni(p, "uMatte"), lip.finish === "matte" ? 1 : 0);
    {                                  // the gloss by her lips' shape (LIP_GLOSS)
      const along = unit([P[291][0] - P[61][0], P[291][1] - P[61][1]]), mw = Math.hypot(P[291][0] - P[61][0], P[291][1] - P[61][1]);
      const at = (a: number, b: number, t: number) => [P[a][0] + (P[b][0] - P[a][0]) * t, P[a][1] + (P[b][1] - P[a][1]) * t];
      const lo = at(14, 17, 0.42), up = at(0, 13, 0.55);
      const hLo = Math.hypot(P[17][0] - P[14][0], P[17][1] - P[14][1]), hUp = Math.hypot(P[13][0] - P[0][0], P[13][1] - P[0][1]);
      gl.uniform4f(this.uni(p, "uGlossLo"), lo[0], lo[1], 0.2 * mw, 0.2 * hLo);
      gl.uniform4f(this.uni(p, "uGlossUp"), up[0], up[1], 0.14 * mw, 0.22 * hUp);
      gl.uniform4f(this.uni(p, "uGlossDir"), along[0], along[1], LIP_GLOSS[lip.finish] ?? 0, 0);
      // her lids' fullest part: above her upper lid's middle, towards her brow
      const lid = (top: number, a: number, b: number) => {
        const ax = unit([P[b][0] - P[a][0], P[b][1] - P[a][1]]), ewi = Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]);
        const n = [ax[1], -ax[0]], s = n[0] * (P[top][0] - P[152][0]) + n[1] * (P[top][1] - P[152][1]) > 0 ? 1 : -1;
        return { c: [P[top][0] + n[0] * s * 0.2 * ewi, P[top][1] + n[1] * s * 0.2 * ewi, 0.3 * ewi, 0.13 * ewi], ax };
      };
      const r = lid(159, 33, 133), l = lid(386, 362, 263);
      gl.uniform4fv(this.uni(p, "uLidC"), new Float32Array([...r.c, ...l.c]));
      gl.uniform4f(this.uni(p, "uLidDir"), r.ax[0], r.ax[1], l.ax[0], l.ax[1]);
    }
    gl.uniform1f(this.uni(p, "uEw"), ew);
    gl.uniform1f(this.uni(p, "uCanonEw"), canon?.ew ?? 1);
    gl.uniform2i(this.uni(p, "uSize"), w, h);
    gl.uniform1f(this.uni(p, "uRef"), Math.max(1e-4, face.lipRef ?? 0.1));
    const finishes: Record<string, number> = { lined: 1, ombre: 2, metallic: grains ? 3 : 0, glitter: grains ? 4 : 0 };
    gl.uniform1i(this.uni(p, "uFinish"), finishes[lip.finish] ?? 0);
    gl.uniform1i(this.uni(p, "uStepsOn"), geo && steps ? 1 : 0);
    gl.uniform1i(this.uni(p, "uZonesOn"), geo ? 1 : 0);
    this.bindTex(p, "uZoneA", this.targets.zoneAB.tex[0], 6);
    this.bindTex(p, "uZoneB", this.targets.zoneBB.tex[0], 7);
    this.bindTex(p, "uCov", (mine?.shadow?.drawn ? this.targets.covB : this.targets.cov).tex[0], 8);
    this.bindTex(p, "uShadeF", this.targets.shadeF.tex[0], 9);
    this.bindTex(p, "uShadeB", this.targets.shadeB.tex[0], 10);
    this.bindTex(p, "uVis", visTex, 11);
    this.bindTex(p, "uVisEdge", vis ? this.grids.vis.t.edge.tex[0] : this.src, 15);
    this.bindTex(p, "uSide", this.targets.side.tex[0], 12);
    this.bindTex(p, "uLipM", lipTex, 13);
    gl.uniform1i(this.uni(p, "uLipOn"), lipMode);
    gl.uniform3f(this.uni(p, "uLipBox"), ...(lips?.box ?? [0, 0, 1]));
    this.bindTex(p, "uDetail", soft ? this.targets.detail.tex[0] : this.targets.layer.tex[0], 14);
    gl.uniform1i(this.uni(p, "uOpenOn"), openOn ? 1 : 0);
    {                                  // her lower waterline (a look's own; WATER_*), or her own kohl there
      const water = !mine && look.water && P.length >= 478 ? look.water : null;
      const kohl = mine?.liner?.kohl && P.length >= 478 ? mine.liner.kohl : 0;
      gl.uniform1f(this.uni(p, "uWaterK"), water ? 1 : 0);
      gl.uniform1f(this.uni(p, "uKohl"), kohl);
      if (water || kohl) {
        gl.uniform4fv(this.uni(p, "uWaterP"), waterPoints(P));
        gl.uniform3fv(this.uni(p, "uWaterC"), water ? new Float32Array(water.flat()) : new Float32Array(9));
        const sw = Math.max(0.7, ew * WATER_SOFT, soft ? camLens : 0);
        const iris = (c: number) => [1, 2, 3, 4].reduce((s, k) => s + Math.hypot(P[c + k][0] - P[c][0], P[c + k][1] - P[c][1]), 0) / 4;
        gl.uniform4fv(this.uni(p, "uWaterI"), new Float32Array([468, 473].flatMap((c) => [P[c][0], P[c][1], iris(c), sw])));
        const s = face.sclera;
        gl.uniform4f(this.uni(p, "uWaterW"), s ? s[0] : 0, s ? s[1] : 0, s ? s[2] : 0, s ? 1 : 0);
        gl.uniform2f(this.uni(p, "uWaterE"), ...eyeShown(P));
      }
    }
    gl.uniform4f(this.uni(p, "uWork"), scissor[0], scissor[1], scissor[0] + scissor[2], scissor[1] + scissor[3]);
    gl.uniform1f(this.uni(p, "uSkinY"), concealOn ? face.skin! : 0);
    gl.uniform1f(this.uni(p, "uSkinMed"), face.skin ?? 0);
    if (concealOn) {
      const ax = [P[263][0] - P[33][0], P[263][1] - P[33][1]], an = Math.hypot(ax[0], ax[1]) || 1, a = [ax[0] / an, ax[1] / an], dn = [-a[1], a[0]];
      const centre = (ids: number[], out: number) => {
        const m = ids.reduce((s, i) => [s[0] + P[i][0] / ids.length, s[1] + P[i][1] / ids.length], [0, 0]);
        return [m[0] + dn[0] * ew * 0.42 + a[0] * out * ew * 0.05, m[1] + dn[1] * ew * 0.42 + a[1] * out * ew * 0.05];
      };
      gl.uniform4f(this.uni(p, "uConC"), ...(centre(EYE_R, -1).concat(centre(EYE_L, 1)) as [number, number, number, number]));
      gl.uniform4f(this.uni(p, "uConAx"), a[0], a[1], ew * 0.55, ew * 0.24);
      gl.uniform2f(this.uni(p, "uConK"), shown[0], shown[1]);
    }
    // a look's concealer (not her own makeup's, which has its own): her cheek under each eye, its amount, her skin's tone
    const conLook = concealOn && !mine && face.under && face.tone ? CONCEAL_LIGHT[look.id ?? ""] ?? 1 : 0;
    gl.uniform3f(this.uni(p, "uConRef"), conLook ? face.under![0] : 0, conLook ? face.under![1] : 0, conLook * kLayer);
    const tone = face.tone ?? [1, 1, 1];
    gl.uniform3f(this.uni(p, "uConTone"), tone[0], tone[1], tone[2]);
    gl.uniform2f(this.uni(p, "uOpen"), keep[0], keep[1]);
    gl.uniform1i(this.uni(p, "uVisMode"), visMode);
    gl.uniform3f(this.uni(p, "uVisBox"), ...(vis?.box ?? [0, 0, 1]));
    gl.uniform1fv(this.uni(p, "uGain"), new Float32Array(STEP_KEYS.map((k) => prod?.gain?.[k] ?? 1)));
    gl.uniform1fv(this.uni(p, "uLGain"), new Float32Array(STEP_KEYS.map((k) => (mine ? 1 : prod?.layerGain?.[k] ?? 1))));
    gl.uniform4f(this.uni(p, "uOwn"), ...(pigs.slice(0, 4).map((x) => (x && !x.over ? 0 : 1)).concat([1, 1, 1, 1]).slice(0, 4) as [number, number, number, number]));
    const six = [0, 1, 2, 3, 4, 5], pigOf = (i: number) => pigs[i];
    gl.uniform3fv(this.uni(p, "uPig"), new Float32Array(six.flatMap((i) => pigOf(i)?.color ?? [0, 0, 0])));
    gl.uniform1fv(this.uni(p, "uPigX"), new Float32Array(six.map((i) => pigOf(i)?.thick ?? 0)));
    gl.uniform1fv(this.uni(p, "uPigDeep"), new Float32Array(six.map((i) => pigOf(i)?.deep ?? 0)));
    gl.uniform1fv(this.uni(p, "uPigSheen"), new Float32Array(six.map((i) => pigOf(i)?.sheen ?? 0)));
    gl.uniform1iv(this.uni(p, "uPigFin"), new Int32Array(six.map((i) => (grains ? pigOf(i)?.finish ?? 0 : 0))));
    gl.uniform1iv(this.uni(p, "uPigOwn"), new Int32Array(six.map((i) => (pigOf(i)?.own ? 1 : 0))));
    const white = prod?.white ?? [1, 1, 1];
    gl.uniform3f(this.uni(p, "uWhite"), white[0], white[1], white[2]);
    gl.uniform1f(this.uni(p, "uSkinRef"), Math.max(1e-4, face.skin ?? 0.2));
    gl.uniform1i(this.uni(p, "uLinerOn"), prod?.liner && !mine ? 1 : 0);
    const liner = prod?.liner ?? [0, 0, 0];
    gl.uniform3f(this.uni(p, "uLiner"), liner[0], liner[1], liner[2]);
    gl.uniform1i(this.uni(p, "uMine"), mine ? 1 : 0);
    gl.uniform1i(this.uni(p, "uStrands"), mine?.lashes ? 1 : 0);
    gl.uniform1f(this.uni(p, "uFreckle"), mine?.freckles ?? 0);
    gl.uniform4f(this.uni(p, "uMineK"), mine?.conceal?.lift ?? 1, mine?.shadow?.pack ?? 0, prod?.shadow?.cov || mine?.shadow?.drawn ? 1 : 0, mine?.liner?.opacity ?? 1);
    const conTint = mine?.conceal?.tint ?? [1, 1, 1], brow = prod?.brows?.color ?? [0, 0, 0];
    gl.uniform3f(this.uni(p, "uConTint"), conTint[0], conTint[1], conTint[2]);
    gl.uniform3f(this.uni(p, "uBrow"), brow[0], brow[1], brow[2]);
    gl.uniform1f(this.uni(p, "uBrowX"), mine && prod?.brows ? prod.brows.thick : 0);
    const bd = !mine && lidGeo ? prod?.browDefine : undefined;
    gl.uniform4f(this.uni(p, "uBrowDef"), ...((bd ? [...bd.ratio, bd.amount] : [0, 0, 0, 0]) as [number, number, number, number]));
    gl.uniform1f(this.uni(p, "uMineLow"), mine?.shadow?.low ?? 0);
    gl.uniform1f(this.uni(p, "uLidFade"), mine?.shadow?.fade ?? 0.85);
    gl.uniform1f(this.uni(p, "uMineBelow"), mine?.shadow && (mine.shadow.drawn === "smoky" || mine.shadow.below === "smoky") ? SMOKY_BELOW : 1);
    const top = mine?.shadow?.glitterTop;
    gl.uniform4f(this.uni(p, "uGlitterTop"), top?.[0] ?? 0, top?.[1] ?? 0, top?.[2] ?? 0, top ? 1 : 0);
    const lens = prod?.lenses, irises = P.length >= 478 ? [468, 473] : null;
    gl.uniform2f(this.uni(p, "uLensK"), lens && irises ? 1 : 0, lens?.opaque ? 1 : 0);
    if (lens && irises) {
      gl.uniform3fv(this.uni(p, "uLens"), new Float32Array(lens.color.map((x, i) => x * (prod!.white[i] ?? 1))));
      const ew = eyeWidth(P), eyes = [[33, 133, 159, 145], [263, 362, 386, 374]];
      gl.uniform4fv(this.uni(p, "uIris"), new Float32Array(irises.flatMap((c) => {
        const r = [1, 2, 3, 4].reduce((sum, k) => sum + Math.hypot(P[c + k][0] - P[c][0], P[c + k][1] - P[c][1]), 0) / 4;
        // (an iris found where her eye isn't, or of a size an iris can't be, gets no lens: a turned-away eye's guess)
        const e = eyes.reduce((best, ids) => {
          const xs = ids.map((i) => P[i][0]), ys = ids.map((i) => P[i][1]);
          const inside = P[c][0] > Math.min(...xs) && P[c][0] < Math.max(...xs) && P[c][1] > Math.min(...ys) - r * 0.6 && P[c][1] < Math.max(...ys) + r * 0.6;
          return best || inside;
        }, false);
        const ok = e && r > ew * 0.12 && r < ew * 0.4;
        return ok ? [P[c][0] / w, P[c][1] / h, r / w, r / h] : [0, 0, 0, 0];
      })));
    }
    gl.uniform3f(this.uni(p, "uBrowShape"), ...(BROW_SHAPE[mine?.brows?.place ?? "natural"] ?? BROW_SHAPE.natural));
    if (geo && steps) {
      gl.uniform1fv(this.uni(p, "uReveal"), new Float32Array(STEP_KEYS.map((k) => steps.done[k] ?? 0)));
      gl.uniform1fv(this.uni(p, "uFollow"), new Float32Array(STEP_KEYS.map((k) => (steps.follow?.includes(k) ? 1 : 0))));
      const active = steps.active ? STEP_KEYS.indexOf(steps.active.key) : -1;
      gl.uniform1i(this.uni(p, "uActive"), active);
      gl.uniform1f(this.uni(p, "uProgress"), steps.active?.t ?? 0);
      const sweep = geo[steps.active?.key ?? "base"].sweep;
      const ax = sweep.axes.map(([a, b]) => [a[0], a[1], b[0], b[1]]);
      gl.uniform1i(this.uni(p, "uSweepMode"), sweep.mode);
      gl.uniform4fv(this.uni(p, "uAx0"), ax[0]);
      gl.uniform4fv(this.uni(p, "uAx1"), ax[1] ?? ax[0]);
      const mid = [(P[33][0] + P[263][0]) / 2, (P[33][1] + P[263][1]) / 2], dir = [P[263][0] - P[33][0], P[263][1] - P[33][1]];
      gl.uniform4f(this.uni(p, "uMid"), mid[0], mid[1], dir[0], dir[1]);
    }
    this.drawQuad(p, -1);
    if (mine?.stones) {          // 5. her rhinestones, on her skin over everything, as far as her liner step is on
      const show = steps ? (steps.active?.key === "liner" ? steps.active.t : steps.done.liner ?? 0) : 1;
      this.stones(stoneSpots(P), w, h, white, Math.max(1, face.blur ?? 0), show * mine.stones);
    }
  }

  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
