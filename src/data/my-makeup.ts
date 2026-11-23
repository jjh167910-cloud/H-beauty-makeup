/*
 * «میکاپ من»: her own makeup, built step by step on her bare face and independent of the catalog looks. Each step has
 * a colour, a finish, a tool (the brush's shape: how soft and how wide it lays the product down), a placement and an
 * amount. Recipes are saved on her phone and can go with a booking request, as text, so the artist sees what she made.
 * The engine paints it with paintMine (src/lib/tryon.ts).
 */
import type { Finish, MinePicks, StepKey } from "@/lib/tryon";
import { FINISHES, LIPSTICKS } from "./lipsticks";
import { BLUSH, BROWS, LASHES, LINER, SHADOW, type Step, type Tool as Draw } from "./makeup-steps";
import { BLUSHES, BLUSH_STYLES, GLITTERS, HIGHLIGHTERS, LINERS, SHADOWS, SHADOW_FINISHES, SHADOW_STYLES, type Shade } from "./products";

export type MyStep = {
  shade?: string;
  finish?: string;
  tool?: string;
  place?: string;
  /** Liner along her lower lash line too; lashes: her lower lashes too; eyeshadow: smudged under her lower lashes too. */
  lower?: boolean;
  /** Blush: freckles dotted across her nose and cheeks too (a freckle pen). */
  freckles?: boolean;
  /** Liner: rhinestones at her outer eye corners too, up and out as her wing goes. */
  stones?: boolean;
  /** Liner: kohl on her lower waterline too (sormeh), the rim inside her lower lashes, in the liner's colour. */
  kohl?: boolean;
  /** Liner: a graphic line along her crease too (a 60s banana), in the liner's colour. */
  crease?: boolean;
  /** Eyeshadow: her aegyo-sal lit too (her inner-corner light, or a pearl shimmer, just under her lower lashes). */
  aegyo?: boolean;
  /** Eyeshadow (glitter): its glitter's colour (GLITTERS: gold, silver, rose gold; its own shade when not set). */
  glitter?: string;
  /** Eyeshadow: a second shade for her crease and outer corner, and a light for her inner corners. */
  shade2?: string;
  inner?: string;
  /** 0..1.5 (1 = as a makeup artist would put it on). */
  amount: number;
  /**
   * Colours of its own over its shades' swatches (a catalog look's exact colours, see look-recipes.ts; the shade still
   * names it): the step's, its eyeshadow's second shade, its inner-corner light.
   */
  hex?: string;
  hex2?: string;
  innerHex?: string;
  /**
   * A catalog look's own product (look-recipes.ts): its lipstick as measured from its photo (colour, finish and ombre),
   * its eyeshadow where its photo has it.
   */
  from?: string;
};
export type MyMakeup = Partial<Record<StepKey, MyStep>>;

type Opt = { id: string; name: string };
/** A colour of a step: its swatch, or her own skin colour changed by `tint` (foundation, concealer). */
export type MyShade = Opt & { hex?: string; finish?: string; tint?: [number, number, number]; lift?: number; own?: boolean };
/**
 * A tool: its drawing on the guide, how soft (blur, eye widths) and how big (zone scale) it puts the product on, how
 * much it lays down (k: times the amount) and per-tool extras.
 */
export type MyTool = Opt & { draw: Draw; soft: number; size: number; k: number; thick?: number; pack?: number; opacity?: number };
export type MyStepDef = {
  key: StepKey; title: string; en: string; hint: string;
  shades: MyShade[]; finishes?: Opt[]; tools: MyTool[]; places?: Opt[];
  /** Eyeshadow: the second shade's choices (her crease and outer corner) and the inner-corner lights. */
  shades2?: MyShade[]; inners?: MyShade[];
};

const opts = (list: Array<[string, string]>): Opt[] => list.map(([id, name]) => ({ id, name }));
const tool = (id: string, name: string, draw: Draw, soft: number, size: number, k: number, extra: Partial<MyTool> = {}): MyTool =>
  ({ id, name, draw, soft, size, k, ...extra });
const fromShades = (list: Shade[]): MyShade[] => list.map((s) => ({ id: s.id, name: s.name, hex: s.hex, finish: s.finish }));

export const MY_STEPS: MyStepDef[] = [
  {
    // (first: an artist puts lenses in before any makeup, so no powder gets in her eyes)
    key: "lenses", title: "لنز رنگی", en: "COLOURED LENSES", hint: "رنگ چشم؛ پوشاننده روی رنگ چشم خودتان را می‌پوشاند، طبیعی فقط رنگش را عوض می‌کند (روی چشم روشن بهتر دیده می‌شود).",
    shades: [
      { id: "honey", name: "عسلی", hex: "#b0823c" },
      { id: "hazel", name: "فندقی", hex: "#8a6a3e" },
      { id: "green", name: "سبز", hex: "#5d8c4e" },
      { id: "grey", name: "طوسی", hex: "#8c949c" },
      { id: "blue", name: "آبی", hex: "#4f7fb3" },
      { id: "ice", name: "آبی یخی", hex: "#a2c2d8" },
      { id: "violet", name: "بنفش", hex: "#7d68a6" },
    ],
    tools: [tool("finger", "نوک انگشت تمیز", "finger", 0, 1, 1)],
    // (opaque first: most coloured lenses are, and on dark eyes a tint barely shows)
    places: opts([["opaque", "پوشاننده"], ["natural", "طبیعی"]]),
  },
  {
    key: "base", title: "کرم‌پودر", en: "FOUNDATION", hint: "پوستتان را یکدست می‌کند؛ رنگ را نسبت به پوست خودتان انتخاب کنید.",
    shades: [
      { id: "match", name: "هم‌رنگ پوست", tint: [1, 1, 1] },
      { id: "light", name: "یک درجه روشن‌تر", tint: [1.07, 1.07, 1.06] },
      { id: "deep", name: "یک درجه تیره‌تر", tint: [0.91, 0.9, 0.88] },
      { id: "warm", name: "گرم و طلایی", tint: [1.035, 1, 0.93] },
      { id: "rosy", name: "صورتی", tint: [1.03, 0.985, 1.005] },
    ],
    finishes: opts([["matte", "مات"], ["natural", "طبیعی"], ["dewy", "شبنمی"]]),
    tools: [
      tool("sponge", "اسفنج مرطوب", "sponge", 0, 1, 1),
      tool("brush", "براش کابوکی", "brush", 0, 1, 1.2),
      tool("finger", "نوک انگشت", "finger", 0, 1, 0.75),
    ],
  },
  {
    key: "conceal", title: "کانسیلر", en: "CONCEALER", hint: "تیرگی زیر چشم را می‌پوشاند و چهره را روشن‌تر نشان می‌دهد.",
    shades: [
      { id: "match", name: "هم‌رنگ پوست", tint: [1, 1, 1], lift: 1 },
      { id: "bright", name: "روشن‌کننده", tint: [1.01, 1, 0.99], lift: 1.12, hex: "#f1dccb" },
      { id: "peach", name: "هلویی (برای تیرگی)", tint: [1.05, 1, 0.93], lift: 1.04, hex: "#f2b89a" },
    ],
    tools: [
      tool("brush", "براش کانسیلر", "brush", 0.06, 0.92, 1),
      tool("sponge", "اسفنج کوچک", "sponge", 0.09, 1, 1),
      tool("finger", "نوک انگشت", "finger", 0.075, 0.95, 0.85),
    ],
    places: [{ id: "under", name: "زیر چشم" }, { id: "center", name: "زیر چشم و وسط صورت" }],
  },
  {
    key: "contour", title: "کانتور", en: "CONTOUR", hint: "سایه‌روشن صورت را عمیق‌تر می‌کند؛ زیر استخوان گونه، کنار پیشانی و فک.",
    // (relative to her own skin, as an artist picks a contour about two shades deeper than her: a shadow on any skin,
    // never a pale brown on deep skin nor a yellow one on fair skin; a bronzer is warmer and only a little deeper)
    shades: [
      { id: "cool", name: "سرد", tint: [0.6, 0.6, 0.63] },
      { id: "neutral", name: "خنثی", tint: [0.62, 0.59, 0.56] },
      { id: "warm", name: "گرم", tint: [0.67, 0.59, 0.5] },
      { id: "deep", name: "تیره", tint: [0.48, 0.45, 0.42] },
      { id: "bronze", name: "برنزر", tint: [0.86, 0.72, 0.52] },
    ],
    tools: [
      tool("angled", "براش زاویه‌دار", "angled", 0.11, 0.95, 1),
      tool("fluffy", "براش پف‌دار", "fluffy", 0.17, 1.12, 0.9),
      tool("sponge", "استیک کرمی و اسفنج", "sponge", 0.13, 1, 1.15),
    ],
    places: [{ id: "cheek", name: "زیر گونه" }, { id: "sculpt", name: "گونه، شقیقه و فک" }, { id: "nose", name: "بینی" }],
  },
  {
    key: "blush", title: "رژگونه", en: "BLUSH", hint: "به صورت رنگ و جان می‌دهد؛ جایش حالت چهره را عوض می‌کند.",
    shades: fromShades(BLUSHES),
    finishes: opts([["matte", "مات"], ["shimmer", "ساتن براق"]]),
    tools: [
      tool("fluffy", "براش گرد پف‌دار", "fluffy", 0.17, 1.25, 1),
      tool("angled", "براش زاویه‌دار", "angled", 0.13, 1.1, 1),
      tool("finger", "رژگونه کرمی با انگشت", "finger", 0.14, 1.05, 1.1),
    ],
    places: BLUSH_STYLES.map(([id, name]) => ({ id, name })),
  },
  {
    key: "glow", title: "هایلایت", en: "HIGHLIGHT", hint: "نور را روی برجستگی‌های صورت می‌نشاند.",
    shades: fromShades(HIGHLIGHTERS),
    finishes: opts([["glow", "درخشان"], ["shimmer", "مرواریدی"], ["glitter", "اکلیلی"]]),
    tools: [
      tool("fan", "براش بادبزنی", "fan", 0.12, 1.12, 0.9),
      tool("brush", "براش کوچک", "brush", 0.07, 0.85, 1),
      tool("finger", "نوک انگشت", "finger", 0.09, 0.9, 1.2),
    ],
    places: [{ id: "cheek", name: "روی گونه" }, { id: "full", name: "گونه، بینی و لب" }, { id: "inner", name: "گوشه چشم و زیر ابرو" }],
  },
  {
    key: "brows", title: "ابرو", en: "BROWS", hint: "لابه‌لای موهای ابرو را پر می‌کند؛ ابتدای ابرو کم‌رنگ‌تر می‌ماند.",
    // (first her own brows' colour, as an artist matches it; its swatch is her skin, much deeper)
    shades: [
      { id: "own", name: "هم‌رنگ ابروی خودتان", own: true, tint: [0.42, 0.36, 0.33] },
      { id: "blonde", name: "بلوند", hex: "#9c7a5b" }, { id: "taupe", name: "تاپ", hex: "#7a6556" },
      { id: "light-brown", name: "قهوه‌ای روشن", hex: "#6a4a38" }, { id: "brown", name: "قهوه‌ای", hex: "#4c3328" },
      { id: "dark-brown", name: "قهوه‌ای تیره", hex: "#33241f" }, { id: "black", name: "مشکی نرم", hex: "#221c1c" },
      { id: "auburn", name: "حنایی", hex: "#6b3a2e" },
    ],
    tools: [
      tool("pencil", "مداد ابرو", "pencil", 0.012, 1, 1, { thick: 0.02 }),
      tool("angled", "پماد و براش زاویه‌دار", "angled", 0.02, 1.05, 1, { thick: 0.03 }),
      tool("gel", "ژل رنگی ابرو", "wand", 0.03, 1, 1, { thick: 0.012 }),
    ],
    places: opts([["natural", "طبیعی"], ["full", "پرپشت"], ["defined", "دقیق و کشیده"]]),
  },
  {
    key: "shadow", title: "سایه چشم", en: "EYESHADOW", hint: "یک رنگ برای پلک، رنگ دوم برای چین پلک و گوشه بیرونی، و نور گوشه چشم؛ مثل کار آرتیست.",
    shades: fromShades(SHADOWS),
    shades2: fromShades(SHADOWS),
    inners: fromShades(HIGHLIGHTERS),
    finishes: SHADOW_FINISHES.map(([id, name]) => ({ id, name })),
    tools: [
      tool("flat", "براش تخت", "brush", 0, 1, 1, { pack: 1 }),
      tool("fluffy", "براش پخش‌کن", "fluffy", 0, 1, 0.9, { pack: 2 }),
      tool("finger", "نوک انگشت", "finger", 0, 1, 1.05, { pack: 0 }),
    ],
    places: SHADOW_STYLES.map(([id, name]) => ({ id, name })),
  },
  {
    key: "liner", title: "خط چشم", en: "EYELINER", hint: "شکل خط را انتخاب کنید؛ خط پایین و سرمه داخل چشم را هم می‌توانید اضافه کنید.",
    shades: fromShades(LINERS),
    tools: [
      tool("pen", "خط چشم ماژیکی", "liner", 0.004, 1, 1, { opacity: 0.96 }),
      tool("gel", "ژل و براش باریک", "angled", 0.007, 1, 1, { opacity: 0.92 }),
      tool("pencil", "مداد چشم", "pencil", 0.016, 1, 1, { opacity: 0.82 }),
    ],
    places: opts([["thin", "نازک"], ["wing", "بال‌دار"], ["fox", "کشیده"], ["puppy", "رو به پایین"], ["smudge", "دودی"]]),
  },
  {
    key: "lashes", title: "ریمل و مژه", en: "LASHES", hint: "مژه‌ها را پرپشت و بلند می‌کند.",
    shades: [],
    tools: [tool("wand", "برس ریمل", "wand", 0, 1, 1)],
    places: opts([["natural", "ریمل طبیعی"], ["volume", "حجیم"], ["dramatic", "مژه مصنوعی"]]),
  },
  {
    key: "lips", title: "رژ لب", en: "LIPS", hint: "رنگ و بافت لب؛ با انگشت، محو و ملایم می‌نشیند.",
    shades: LIPSTICKS.map((l) => ({ id: l.id, name: l.name, hex: l.hex, finish: l.finish })),
    finishes: FINISHES.map(([id, name]) => ({ id, name })),
    tools: [
      tool("lipstick", "رژ لب", "lipstick", 0, 1, 1),
      tool("brush", "براش لب", "brush", 0, 1, 1),
      tool("finger", "نوک انگشت (محو)", "finger", 0, 1, 0.7),
    ],
  },
];

export const myStep = new Map(MY_STEPS.map((d) => [d.key, d]));

/** The step with every choice made (hers, else the first of each). */
export function filled(def: MyStepDef, step: MyStep): Required<Pick<MyStep, "shade" | "tool">> & MyStep {
  const shade = def.shades.find((s) => s.id === step.shade) ?? def.shades[0];
  const finish = def.finishes ? step.finish ?? shade?.finish ?? (def.key === "base" ? "natural" : def.finishes[0].id) : undefined;
  return {
    ...step,
    shade: shade?.id ?? "",
    tool: (def.tools.find((t) => t.id === step.tool) ?? def.tools[0]).id,
    finish,
    place: def.places ? (def.places.find((p) => p.id === step.place) ?? def.places[0]).id : undefined,
  };
}

/** A new step: the first of everything, as much as an artist would put on. */
export function newStep(): MyStep {
  return { amount: 1 };
}

/**
 * How much of a product full coverage of its zone is (amount 100%): an artist's contour, blush and highlight are a veil
 * over the zone, not a coat of paint (her zones are drawn whole, unlike a catalog look's own coverage).
 */
const STRENGTH: Partial<Record<StepKey, number>> = { contour: 0.6, blush: 1.5, glow: 0.5, shadow: 1 };

/**
 * Kohl on her waterline, at a liner's opacity: a pencil on the wet rim covers less than on skin (a catalog look's kohl
 * leaves its waterline about a fifth of its light: water_profile in teacher.py, `water` in looks.json).
 */
const KOHL = 0.85;

/** Her aegyo-sal's light when she has no inner-corner light: a pearl shimmer (a champagne one read as a gold stripe). */
const AEGYO_LIGHT = HIGHLIGHTERS.find((h) => h.id === "pearl")!.hex;

/** Her recipe in the engine's terms (null: nothing on yet). */
export function minePicks(recipe: MyMakeup): MinePicks | null {
  const gain: MinePicks["gain"] = {};
  const out: MinePicks = { gain };
  let any = false;
  for (const def of MY_STEPS) {
    const raw = recipe[def.key];
    if (!raw) continue;
    any = true;
    const step = filled(def, raw), t = def.tools.find((x) => x.id === step.tool)!, shade = def.shades.find((s) => s.id === step.shade);
    gain[def.key] = Math.max(0, step.amount) * t.k * (STRENGTH[def.key] ?? 1);
    const zone = { place: step.place ?? "", soft: t.soft, size: t.size };
    const hex = raw.hex ?? shade?.hex ?? "#000000";
    switch (def.key) {
      case "base":
        out.base = { tint: shade?.tint ?? [1, 1, 1], finish: step.finish === "matte" ? -1 : step.finish === "dewy" ? 1 : 0 };
        break;
      case "conceal": out.conceal = { ...zone, lift: shade?.lift ?? 1, tint: shade?.tint ?? [1, 1, 1] }; break;
      case "contour": out.contour = { ...zone, tint: shade?.tint ?? [0.62, 0.59, 0.56] }; break;
      case "blush": out.blush = { ...zone, hex, finish: step.finish ?? "matte", ...(raw.freckles ? { freckles: 1 } : {}) }; break;
      case "glow": out.glow = { ...zone, hex, finish: step.finish ?? "glow" }; break;
      case "brows": out.brows = { ...zone, hex: shade?.own ? "#4c3328" : hex, thick: t.thick ?? 0.4, ...(shade?.own ? { own: true } : {}) }; break;
      case "shadow": {
        const second = def.shades2?.find((x) => x.id === raw.shade2), inner = def.inners?.find((x) => x.id === raw.inner);
        // (a look's own second shade in its own finish; one from the palette in that shade's)
        const hex2 = raw.hex2 ?? second?.hex, light = raw.innerHex ?? inner?.hex;
        out.shadow = { hex, finish: step.finish ?? "matte", place: step.place ?? "wash", pack: t.pack ?? 1,
          ...(hex2 ? { hex2, finish2: raw.hex2 ? step.finish ?? "matte" : second?.finish ?? "matte" } : {}), ...(light ? { inner: light } : {}),
          ...(raw.aegyo ? { aegyo: light ?? AEGYO_LIGHT } : {}), ...(step.lower ? { lower: true } : {}),
          ...(step.finish === "glitter" && GLITTERS.find((g) => g[0] === raw.glitter)?.[2] ? { glitter: GLITTERS.find((g) => g[0] === raw.glitter)![2] } : {}),
          ...(raw.from ? { from: raw.from } : {}) };
        break;
      }
      case "liner":
        out.liner = { hex, place: step.place ?? "wing", lower: Boolean(step.lower), soft: step.place === "smudge" ? Math.max(t.soft, 0.03) : t.soft,
          opacity: t.opacity ?? 0.95, ...(raw.stones ? { stones: 1 } : {}), ...(raw.kohl ? { kohl: KOHL * (t.opacity ?? 0.95) } : {}),
          ...(raw.crease ? { crease: true } : {}) };
        break;
      case "lashes": out.lashes = { place: step.place ?? "natural", ...(step.lower ? { lower: true } : {}) }; break;
      case "lips": out.lips = { hex: raw.hex ?? shade?.hex ?? "#b8766d", finish: (step.finish ?? "satin") as Finish, ...(raw.from ? { from: raw.from } : {}) }; break;
      case "lenses": out.lenses = { hex, opaque: step.place === "opaque" }; break;
    }
  }
  return any ? out : null;
}

/** How many steps she has on. */
export const stepCount = (recipe: MyMakeup) => MY_STEPS.filter((d) => recipe[d.key]).length;

const percent = (x: number) => `${Math.round(x * 100).toLocaleString("fa-IR")}٪`;

/** Her recipe as text, one line per step, for the artist (in a booking request) and for the list of saved makeups. */
export function recipeLines(recipe: MyMakeup): string[] {
  const lines: string[] = [];
  for (const def of MY_STEPS) {
    const raw = recipe[def.key];
    if (!raw) continue;
    const step = filled(def, raw);
    const parts = [
      def.shades.find((s) => s.id === step.shade)?.name,
      def.shades2?.find((s) => s.id === raw.shade2) ? `چین و گوشه بیرونی ${def.shades2.find((s) => s.id === raw.shade2)!.name}` : undefined,
      def.inners?.find((s) => s.id === raw.inner) ? `نور گوشه چشم ${def.inners.find((s) => s.id === raw.inner)!.name}` : undefined,
      def.finishes?.find((f) => f.id === step.finish)?.name,
      def.places?.find((p) => p.id === step.place)?.name,
      def.key === "liner" && step.lower ? "خط پایین هم" : def.key === "lashes" && step.lower ? "مژه پایین هم"
        : def.key === "shadow" && step.lower ? "سایه زیر چشم هم" : undefined,
      def.key === "blush" && raw.freckles ? "با کک‌مک" : undefined,
      def.key === "shadow" && raw.aegyo ? "زیر چشم براق (اگیو)" : undefined,
      def.key === "shadow" && step.finish === "glitter" && GLITTERS.find((g) => g[0] === raw.glitter)?.[2] ? `اکلیل ${GLITTERS.find((g) => g[0] === raw.glitter)![1]}` : undefined,
      def.key === "liner" && raw.kohl ? "با سرمه داخل چشم" : undefined,
      def.key === "liner" && raw.stones ? "با نگین گوشه چشم" : undefined,
      def.key === "liner" && raw.crease ? "با خط چین پلک" : undefined,
      def.tools.length > 1 ? def.tools.find((t) => t.id === step.tool)?.name : undefined,
      `شدت ${percent(step.amount)}`,
    ].filter(Boolean);
    lines.push(`${def.title}: ${parts.join(" · ")}`);
  }
  return lines;
}

/* ------------------------------------------------- her recipe, step by step */

const HOW: Partial<Record<StepKey, (s: MyStep) => { how: string; tip?: string }>> = {
  base: (s) => ({
    how: s.tool === "brush" ? "از وسط صورت شروع کنید و با حرکت دایره‌ای کوچک رو به بیرون پخش کنید؛ کنار خط مو و زیر فک را محو کنید."
      : s.tool === "finger" ? "کمی کرم‌پودر را با نوک انگشت گرم کنید و لایه نازکی از وسط صورت رو به بیرون پخش کنید."
      : "با اسفنج مرطوب به‌صورت ضربه‌ای از وسط صورت رو به بیرون کار کنید؛ کنار خط مو و زیر فک را محو کنید تا مرزی دیده نشود.",
    tip: s.finish === "matte" ? "در پایان تی‌زون را با پودر فیکس شفاف مات کنید." : s.finish === "dewy" ? "پودر فیکس فقط روی تی‌زون؛ گونه‌ها کمی براق بمانند." : undefined,
  }),
  conceal: (s) => ({
    how: s.place === "center" ? "زیر چشم‌ها یک مثلث وارونه، و کمی هم وسط پیشانی، تیغه بینی و چانه؛ با ضربه‌های آرام محو کنید تا صورت روشن شود."
      : "زیر چشم یک مثلث وارونه بکشید و با ضربه‌های آرام محو کنید تا تیرگی زیر چشم پوشیده شود.",
    tip: s.shade === "peach" ? "هلویی تیرگی آبی و بنفش زیر چشم را خنثی می‌کند؛ اگر لازم شد یک لایه نازک هم‌رنگ پوست روی آن بزنید." : "با کمی پودر فیکس شفاف ثابتش کنید تا در چین زیر چشم جمع نشود.",
  }),
  contour: (s) => ({
    how: s.place === "nose" ? "دو خط باریک کنار تیغه بینی، از ابتدای ابرو تا نزدیک نوک بینی بکشید و با براش کوچک محو کنید."
      : `زیر استخوان گونه، از نزدیک گوش رو به گوشه لب بکشید و فقط تا راستای وسط چشم بیاورید؛ رو به بالا محو کنید.${s.place === "sculpt" ? " کمی هم کنار پیشانی نزدیک خط مو و زیر خط فک بزنید." : ""}`,
  }),
  blush: (s) => ({ how: BLUSH[(s.place ?? "apples") as keyof typeof BLUSH] ?? BLUSH.apples,
    tip: s.freckles ? "کک‌مک: با ماژیک کک‌مک یا مداد ابروی قهوه‌ای روشن، نقطه‌های ریز و نامنظم روی تیغه بینی و بالای گونه‌ها بزنید و هر کدام را با نوک انگشت آرام بزنید تا نرم شود." : undefined }),
  glow: (s) => ({
    how: s.place === "inner" ? "کمی در گوشه داخلی چشم و زیر قوس ابرو بزنید."
      : s.place === "full" ? "روی بالای استخوان گونه، تیغه بینی و بالای لب (کمان) بزنید."
      : "روی بالای استخوان گونه، جایی که نور می‌افتد، بزنید و نرم محو کنید.",
  }),
  brows: (s) => ({ how: (s.place === "full" ? BROWS.bold : s.place === "defined" ? BROWS.thin : BROWS.natural).how }),
  shadow: (s) => {
    const style = (s.place ?? "wash") as keyof typeof SHADOW;
    return {
      how: s.shade2 ? "رنگ اول را روی پلک متحرک بزنید؛ رنگ دوم را در چین پلک و گوشه بیرونی به شکل V بزنید و مرز دو رنگ را با براش پخش‌کن محو کنید."
        : SHADOW[style].how,
      tip: [s.lower ? `زیر چشم: با براش کوچک یا مداد نرم، ${s.shade2 ? "رنگ دوم" : "همان رنگ"} را از گوشه بیرونی تا نیمه چشم، درست زیر مژه‌های پایین بکشید و با براش تمیز محو کنید.` : "",
        s.inner ? "در پایان کمی نور در گوشه داخلی چشم بزنید تا چشم روشن‌تر دیده شود." : "",
        s.aegyo ? "اگیو: با براش کوچک یا نوک انگشت، سایه براق روشن را در نوار باریکی درست زیر مژه‌های پایین، از نزدیک گوشه داخلی تا دو سوم چشم بزنید؛ وقتی لبخند می‌زنید همین برجستگی است." : ""]
        .filter(Boolean).join(" ") || undefined,
    };
  },
  liner: (s) => {
    const l = LINER[(s.place ?? "wing") as keyof typeof LINER] ?? LINER.wing;
    return { how: `${l.name}: ${l.how}`, tip: [s.lower ? "خط پایین را از گوشه بیرونی تا نیمه چشم، نازک و نزدیک ریشه مژه‌ها بکشید." : "",
      s.kohl ? "سرمه: پلک پایین را با نوک انگشت کمی پایین بکشید، به بالا نگاه کنید و مداد نرم مخصوص داخل چشم (کوهل) را آرام روی لبه داخلی پلک پایین، از گوشه بیرونی تا گوشه داخلی بکشید؛ روی سفیدی چشم نرود." : "",
      s.stones ? "نگین: سه نگین ریز با چسب مژه (یک نقطه چسب پشت هر نگین، چند ثانیه صبر کنید) از گوشه بیرونی چشم رو به بالا، در امتداد خط چشم بچسبانید؛ وسطی کمی درشت‌تر." : "",
      s.crease ? "خط چین پلک: چشم را باز نگه دارید و به روبه‌رو نگاه کنید؛ با ژل و براش باریک، خطی کمانی درست روی چین پلک، از بالای گوشه داخلی تا گوشه بیرونی بکشید و به دنباله خط چشم برسانید." : ""]
      .filter(Boolean).join(" ") || undefined };
  },
  lashes: (s) => ({ how: LASHES[(s.place === "volume" ? "volume" : s.place === "dramatic" ? "dramatic" : "natural") as keyof typeof LASHES].how,
    tip: s.lower ? "مژه‌های پایین را هم با نوک برس ریمل، آرام و از ریشه رو به پایین بزنید." : undefined }),
  lenses: (s) => ({
    how: "دست‌ها را بشویید و خشک کنید؛ لنز را روی نوک انگشت اشاره بگذارید (لبه‌اش رو به بالا، کاسه‌ای شکل). با دست دیگر پلک بالا "
      + "و با انگشت وسط پلک پایین را نگه دارید، به بالا نگاه کنید و لنز را آرام روی سفیدی پایین چشم بگذارید؛ پلک‌ها را رها کنید و چند بار پلک بزنید."
      + (s.place === "opaque" ? " لنز پوشاننده روی رنگ چشم خودتان را کامل می‌پوشاند؛ برای چشم تیره رنگ روشن‌تر نشان می‌دهد." : ""),
    tip: "لنز رنگی را فقط با مشورت چشم‌پزشک و از داروخانه تهیه کنید و قبل از میکاپ بگذارید؛ با لنز نخوابید و آن را با کسی شریک نشوید.",
  }),
  lips: (s) => ({
    how: s.tool === "finger" ? "رنگ را با نوک انگشت روی وسط لب ضربه بزنید و رو به لبه‌ها محو کنید تا ملایم و محو بنشیند."
      : s.tool === "brush" ? "دور لب را با براش دقیق بکشید و داخلش را پر کنید؛ با دستمال بلات کنید و لایه دوم بزنید."
      : "از وسط لب بالا (کمان) شروع کنید و رو به گوشه‌ها پر کنید؛ لب‌ها را آرام روی هم بفشارید.",
  }),
};

/** Her recipe as the tutorial's steps (in an artist's order): what to use, which tool, how, for each step she has on. */
export function mySteps(recipe: MyMakeup): Step[] {
  return MY_STEPS.filter((def) => recipe[def.key]).map((def) => {
    const raw = recipe[def.key]!, step = filled(def, raw), t = def.tools.find((x) => x.id === step.tool)!;
    const shade = def.shades.find((x) => x.id === step.shade), second = def.shades2?.find((x) => x.id === raw.shade2);
    const product = [shade?.name, second ? `و ${second.name}` : undefined, def.finishes?.find((f) => f.id === step.finish)?.name,
      def.places?.find((p) => p.id === step.place)?.name].filter(Boolean).join(" · ");
    const text = HOW[def.key]?.({ ...raw, ...step }) ?? { how: def.hint };
    return {
      key: def.key, title: def.title, en: def.en, product: `${def.title} ${product}`.trim(),
      colors: [shade?.hex, second?.hex].filter((c): c is string => Boolean(c)), tool: t.name, draw: t.draw,
      how: text.how, tip: text.tip,
    };
  });
}

/* ---------------------------------------------------------------- on her phone */

export type SavedMakeup = { id: string; name: string; at: number; recipe: MyMakeup; thumb?: string };
const SAVED = "hb-my-makeup-v1";
const DRAFT = "hb-my-makeup-draft-v1";

const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);

/** A recipe read back from storage: only known steps and options, numbers in range (what an older version kept, such as
 * her finger-painted strokes or the "only where I paint" placement, is left out: the step keeps its first placement). */
export function cleanRecipe(value: unknown): MyMakeup {
  const out: MyMakeup = {};
  if (!value || typeof value !== "object") return out;
  for (const def of MY_STEPS) {
    const s = (value as Record<string, unknown>)[def.key] as Record<string, unknown> | undefined;
    if (!s || typeof s !== "object") continue;
    const pick = (id: unknown, list: Opt[] | undefined) => (typeof id === "string" && list?.some((o) => o.id === id) ? id : undefined);
    const step: MyStep = { amount: num(s.amount, 0, 1.5, 1) };
    const shade = pick(s.shade, def.shades), finish = pick(s.finish, def.finishes), t = pick(s.tool, def.tools), place = pick(s.place, def.places);
    if (shade) step.shade = shade;
    if (finish) step.finish = finish;
    if (t) step.tool = t;
    if (place) step.place = place;
    if (s.lower === true) step.lower = true;
    if (def.key === "blush" && s.freckles === true) step.freckles = true;
    if (def.key === "shadow" && s.aegyo === true) step.aegyo = true;
    if (def.key === "shadow" && typeof s.glitter === "string" && GLITTERS.some((g) => g[0] === s.glitter)) step.glitter = s.glitter;
    if (def.key === "liner" && s.stones === true) step.stones = true;
    if (def.key === "liner" && s.kohl === true) step.kohl = true;
    if (def.key === "liner" && s.crease === true) step.crease = true;
    const shade2 = pick(s.shade2, def.shades2), inner = pick(s.inner, def.inners);
    if (shade2) step.shade2 = shade2;
    if (inner) step.inner = inner;
    // (a look's own colours, and its own lipstick by its id)
    for (const k of ["hex", "hex2", "innerHex"] as const) if (typeof s[k] === "string" && /^#[0-9a-f]{6}$/i.test(s[k] as string)) step[k] = s[k] as string;
    if ((def.key === "lips" || def.key === "shadow") && typeof s.from === "string" && /^[a-z0-9-]{1,40}$/.test(s.from)) step.from = s.from;
    out[def.key] = step;
  }
  return out;
}

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function savedMakeups(): SavedMakeup[] {
  const list = read<unknown[]>(SAVED, []);
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const s = x as Partial<SavedMakeup>;
    if (!s || typeof s.id !== "string" || typeof s.name !== "string") return [];
    return [{ id: s.id, name: s.name.slice(0, 40), at: num(s.at, 0, 1e14, 0), recipe: cleanRecipe(s.recipe),
      ...(typeof s.thumb === "string" && s.thumb.startsWith("data:image/") ? { thumb: s.thumb } : {}) }];
  });
}

/** Save (or replace, by id) a makeup; false when her phone's storage refused it. */
export function saveMakeup(item: SavedMakeup): boolean {
  return write(SAVED, [item, ...savedMakeups().filter((s) => s.id !== item.id)].slice(0, 30));
}

export function removeMakeup(id: string): boolean {
  return write(SAVED, savedMakeups().filter((s) => s.id !== id));
}

/** The makeup she's working on, kept between visits. */
export const loadDraft = (): MyMakeup => cleanRecipe(read<unknown>(DRAFT, {}));
export const saveDraft = (recipe: MyMakeup) => write(DRAFT, recipe);

/* ------------------------------------------------------------- as a link */

/**
 * Her recipe as a link: the try-on opened on it in «میکاپ من», on whoever opens it's own face (a catalog look's link is
 * `?look=<id>`; a look's recipe opens the same way, as her own makeup). Only the recipe, never her photo.
 */
export function recipeLink(recipe: MyMakeup, origin = location.origin): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cleanRecipe(recipe)));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `${origin}/?mine=${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** The recipe a link's `?mine=` holds (null: none, or not a recipe). */
export function recipeFromLink(search: string): MyMakeup | null {
  const code = new URLSearchParams(search).get("mine");
  if (!code || code.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const recipe = cleanRecipe(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
    return stepCount(recipe) ? recipe : null;
  } catch {
    return null;
  }
}
