/*
 * Phase 2 of the roadmap: every catalog look as a recipe of products, the same object as her own makeup («میکاپ من»,
 * my-makeup.ts), painted on her face by the pigment engine (paintMine in src/lib/tryon.ts) instead of the catalog
 * photo's change of colour. A look's FaceLook (makeup-styles.ts) says what an artist put on: its skin, eyeshadow
 * placement and lid colours, liner, lashes, brows, blush and lipstick; here each becomes a step with its product, its
 * tool, its placement and how much of it. Its colours stay the look's own (hex, hex2), each step still named by the
 * nearest shade of the shop's palette; its lipstick is the look's own as measured from its photo (`from`: colour,
 * finish and ombre).
 *
 * Each look's amounts and its blush and eyeshadow colours are then fitted to its catalog photo (look-fit.json, made by
 * scripts/tinybeauty/fit_recipes.cjs --hue: on the catalog model and two synthetic faces, each step as strong and its
 * colour, in full, as the catalog engine paints the photo's change there).
 *
 * Its accents are her own makeup's (freckles with its blush, an aegyo-sal with its eyeshadow, rhinestones and kohl on
 * the waterline with its liner; glitter is its eyeshadow's finish); recipeGaps lists any a recipe can't paint.
 */
import type { StepKey } from "@/lib/tryon";
import fits from "./look-fit.json";
import { LIPSTICKS } from "./lipsticks";
import { styleById, type Accent, type FaceLook, type Liner } from "./makeup-styles";
import type { MyMakeup, MyStep } from "./my-makeup";
import { BLUSHES, LINERS, SHADOWS } from "./products";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** The palette's shade nearest to a colour (by eye: red counts a little more than blue, green most). */
export function nearestShade(list: ReadonlyArray<{ id: string; hex: string }>, hex: string): string {
  const [r, g, b] = rgb(hex);
  let best = list[0].id, dist = Infinity;
  for (const s of list) {
    const [r2, g2, b2] = rgb(s.hex), rm = (r + r2) / 2;
    const d = (2 + rm / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - rm) / 256) * (b - b2) ** 2;
    if (d < dist) { dist = d; best = s.id; }
  }
  return best;
}

/** A gold or copper shade (its shimmer is a foil): an orange to yellow hue, saturated (as metalTone in tryon.ts). */
function metalTone(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d === 0 || d / mx <= 0.5) return false;
  const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return h >= 20 && h <= 55;
}

/** A look's liner as one of the liner step's placements (a graphic liner's floating line and a double wing: a wing for now). */
const LINER_PLACE: Record<Exclude<Liner, "none">, string> = {
  thin: "thin", wing: "wing", fox: "fox", double: "wing", graphic: "wing", puppy: "puppy", smudge: "smudge", siren: "fox",
};
const BLACK_LINER = "#141113";

/** A look's accents the recipe paints (the others are recipeGaps). */
const PAINTED: ReadonlySet<Accent> = new Set(["shimmer", "contour", "lowerLiner", "bottomLashes", "glitter", "freckles", "aegyo", "rhinestones", "kohl", "lowerShadow", "creaseLine"]);

/**
 * A look's recipe: its FaceLook as her own makeup's steps (amount 1: as the artist put it on in its catalog photo).
 * `id` is the look's own id (its lipstick as measured from its photo).
 */
export function recipeOf(look: FaceLook, id?: string): MyMakeup {
  const acc = new Set(look.accents ?? []);
  const out: MyMakeup = {};
  const full = look.skin !== "sheer";                         // (a sheer skin is a tinted moisturiser's veil, no more)

  // the base: a sheer veil; a matte coverage with a brush; dewy, glowing and bronzed with a damp sponge
  out.base = {
    sheer: { shade: "match", finish: "natural", tool: "sponge", amount: 0.55 },
    matte: { shade: "match", finish: "matte", tool: "brush", amount: 1 },
    dewy: { shade: "match", finish: "dewy", tool: "sponge", amount: 0.85 },
    glow: { shade: "match", finish: "dewy", tool: "sponge", amount: 1 },
    bronzed: { shade: "warm", finish: "natural", tool: "sponge", amount: 0.9 },
  }[look.skin] as MyStep;

  // concealer under her eyes: every look has it, a touch of it on a sheer one
  out.conceal = { shade: "match", tool: "brush", place: "under", amount: full ? 0.8 : 0.5 };

  // contour: sculpted when the look says so; a bronzer on a bronzed skin; a soft one under the cheekbones of a full glam
  if (acc.has("contour")) out.contour = { shade: "neutral", tool: "angled", place: "sculpt", amount: 1 };
  else if (look.skin === "bronzed") out.contour = { shade: "bronze", tool: "fluffy", place: "sculpt", amount: 0.8 };
  else if (look.skin === "glow" || look.skin === "matte") out.contour = { shade: "neutral", tool: "fluffy", place: "cheek", amount: 0.45 };

  if (look.blush !== "none") {
    out.blush = { shade: nearestShade(BLUSHES, look.blushColor), hex: look.blushColor, finish: "matte", tool: "fluffy", place: look.blush, amount: 1,
      ...(acc.has("freckles") ? { freckles: true } : {}) };
  }

  // highlight: a glowing skin on her cheekbones, nose and cupid's bow; a bronzed one gold; a dewy one pearl; a
  // shimmer look's on her cheekbones
  const glow: Partial<Record<FaceLook["skin"], MyStep>> = {
    glow: { shade: "champagne", finish: "glow", tool: "fan", place: "full", amount: 1 },
    bronzed: { shade: "gold", finish: "glow", tool: "fan", place: "cheek", amount: 0.9 },
    dewy: { shade: "pearl", finish: "glow", tool: "fan", place: "cheek", amount: 0.7 },
  };
  out.glow = glow[look.skin] ?? (acc.has("shimmer") ? { shade: "champagne", finish: "shimmer", tool: "fan", place: "cheek", amount: 0.7 } : undefined);
  if (!out.glow) delete out.glow;

  // brows in her own brows' colour: natural, fuller, or defined with a longer tail (lifted, thin)
  out.brows = {
    natural: { shade: "own", tool: "pencil", place: "natural", amount: 0.7 },
    bold: { shade: "own", tool: "angled", place: "full", amount: 1 },
    lifted: { shade: "own", tool: "gel", place: "defined", amount: 0.85 },
    thin: { shade: "own", tool: "pencil", place: "defined", amount: 0.8 },
  }[look.brow] as MyStep;

  // eyeshadow: the lid colour on her lid, the deeper one in her crease and outer corner, in the look's placement;
  // packed on with a flat brush, or blended out with a fluffy one for a smoky, halo or gradient eye
  if (look.shadow !== "none") {
    // (a look with rhinestones has glitter on its lids too, as its photo shows)
    const finish = acc.has("glitter") || acc.has("rhinestones") ? "glitter" : acc.has("shimmer") ? (metalTone(look.lid[0]) ? "metallic" : "shimmer") : "matte";
    const blended = ["smoky", "halo", "gradient"].includes(look.shadow);
    out.shadow = {
      shade: nearestShade(SHADOWS, look.lid[0]), hex: look.lid[0], shade2: nearestShade(SHADOWS, look.lid[1]), hex2: look.lid[1],
      finish, tool: blended ? "fluffy" : "flat", place: look.shadow, amount: 1, ...(id ? { from: id } : {}),
      ...(acc.has("aegyo") ? { aegyo: true } : {}), ...(acc.has("lowerShadow") ? { lower: true } : {}),
      // (no inner-corner light: a catalog photo's is a whisper, and at its full amount it read as a white spot)
    };
  }

  if (look.liner !== "none") {
    const hex = look.linerColor ?? BLACK_LINER;
    out.liner = { shade: nearestShade(LINERS, hex), hex, tool: look.liner === "smudge" ? "pencil" : "pen", place: LINER_PLACE[look.liner], amount: 1,
      ...(acc.has("lowerLiner") || look.liner === "double" ? { lower: true } : {}), ...(acc.has("rhinestones") ? { stones: true } : {}),
      ...(acc.has("kohl") ? { kohl: true } : {}), ...(acc.has("creaseLine") ? { crease: true } : {}) };
  } else if (acc.has("lowerLiner") || acc.has("kohl")) {
    out.liner = { shade: "black", tool: "pencil", place: "thin", amount: 0.6,
      ...(acc.has("lowerLiner") ? { lower: true } : {}), ...(acc.has("kohl") ? { kohl: true } : {}) };
  }

  out.lashes = { tool: "wand", place: look.lashes, amount: 1, ...(acc.has("bottomLashes") ? { lower: true } : {}) };

  out.lips = { shade: nearestShade(LIPSTICKS, look.lipColor), hex: look.lipColor,
    finish: look.lip === "matte" || look.lip === "gloss" ? look.lip : "satin", tool: look.lip === "ombre" ? "finger" : look.lip === "lined" ? "brush" : "lipstick",
    amount: 1, ...(id ? { from: id } : {}) };
  return out;
}

/** A look's recipe fitted to its catalog photo: each step's amount, its blush's and eyeshadow's colours. */
export type RecipeFit = {
  amount?: Partial<Record<StepKey, number>>;
  hex?: { blush?: string; shadow?: string; shadow2?: string };
  /** Root-mean-square colour change (linear, x1000): the look's own, then the recipe's difference each round, the kept one last. */
  rms?: number[];
  /** Its colours fitted in full (fit_recipes.cjs --hue), not only how light or deep: used as they are. */
  hue?: boolean;
};
const FITS = fits as Record<string, RecipeFit>;

/**
 * How far a fit may take a look, as an artist would still put it on: at most this much of each step (the old engine
 * also brightens her whole face, which a highlighter or blush can't match where it goes: past this they read as patches;
 * a pale eyeshadow packed past full turns into a chalky film up to her brows on a deep skin),
 */
const FIT_MAX: Partial<Record<StepKey, number>> = { base: 1.3, glow: 1, blush: 1.3, brows: 1.3, shadow: 1 };
/**
 * ...and at least this much of what the look is known for: its liner as its spec draws it, in full (a fit on colour alone
 * dropped a graphic liner the old engine's layer drew a little elsewhere; and a liner is opaque, so a fit's lower amount
 * only greyed it: hollywood's wing at 0.26, then 0.6, was a faint grey line, 2026-11), and a bold colour on its lid (at least BOLD_SHADOW[1]
 * of its eyeshadow when its lid colour's chroma is BOLD_SHADOW[0] or more and it isn't a smoky eye, whose dark crease is
 * what it is: a fit undershoots a vivid colour whose hue the pigments over her skin can't quite reach, and electric blue
 * or a sunset turned into a pale veil).
 */
const FIT_MIN: Partial<Record<StepKey, number>> = { liner: 1 };
const BOLD_SHADOW: [number, number] = [0.5, 1.2];
/** An eyeshadow is pale (FIT_MAX's cap is for it) when its lid colour's linear luminance is more than this. */
const PALE_SHADOW = 0.35;
/** ...and its colours this much deeper or lighter than the look's own, in their hue (unless the fit was in full: `hue`). */
const FIT_LIGHT: [number, number] = [0.5, 1.15];

const lin = (hex: string) => rgb(hex).map((v) => (v / 255) ** 2.2);
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** `designed` made as light or deep as `fitted` is (within FIT_LIGHT), in its own hue. */
function asLight(designed: string, fitted: string): string {
  const d = lin(designed), k = Math.min(FIT_LIGHT[1], Math.max(FIT_LIGHT[0], lum(lin(fitted)) / Math.max(lum(d), 1e-6)));
  return `#${d.map((v) => Math.round(255 * Math.min(1, v * k) ** (1 / 2.2)).toString(16).padStart(2, "0")).join("")}`;
}

function fitted(recipe: MyMakeup, fit: RecipeFit | undefined, look?: FaceLook): MyMakeup {
  if (!fit) return recipe;
  const chroma = (hex: string) => { const c = rgb(hex); return (Math.max(...c) - Math.min(...c)) / 255; };
  const bold = Boolean(look && look.shadow !== "smoky" && chroma(look.lid[0]) >= BOLD_SHADOW[0]);
  const least: Partial<Record<StepKey, number>> = { ...FIT_MIN, ...(bold ? { shadow: BOLD_SHADOW[1] } : {}) };
  // (the cap on an eyeshadow is for a pale one: a vivid or a deep one packed on is what the look is)
  const pale = Boolean(look && lum(lin(look.lid[0])) > PALE_SHADOW);
  const most: Partial<Record<StepKey, number>> = { ...FIT_MAX, ...(pale ? {} : { shadow: undefined }) };
  for (const [k, a] of Object.entries(fit.amount ?? {})) {
    const step = recipe[k as StepKey];
    if (step && typeof a === "number") {
      step.amount = Math.round(Math.min(most[k as StepKey] ?? 1.5, Math.max(least[k as StepKey] ?? 0, a)) * 1000) / 1000;
    }
  }
  const { blush, shadow, shadow2 } = fit.hex ?? {};
  const set = (step: MyStep | undefined, key: "hex" | "hex2", name: "shade" | "shade2", hex: string | undefined, list: typeof SHADOWS) => {
    const was = step?.[key];
    if (!step || !hex || !was) return;
    step[key] = fit.hue ? hex : asLight(was, hex);
    step[name] = nearestShade(list, step[key]!);
  };
  set(recipe.blush, "hex", "shade", blush, BLUSHES);
  set(recipe.shadow, "hex", "shade", shadow, SHADOWS);
  set(recipe.shadow, "hex2", "shade2", shadow2, SHADOWS);
  return recipe;
}

/** A catalog look's recipe by its id, fitted to its catalog photo (null: no such look). */
export function lookRecipe(id: string): MyMakeup | null {
  const style = styleById.get(id);
  return style ? fitted(recipeOf(style.look, id), FITS[id], style.look) : null;
}

/** What a look has that its recipe can't paint (its accents not in PAINTED: none now). */
export function recipeGaps(look: FaceLook): Accent[] {
  return (look.accents ?? []).filter((a) => !PAINTED.has(a));
}
