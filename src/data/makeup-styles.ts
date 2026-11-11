/*
 * The try-on's looks. Each look's catalog photo is /makeup/looks/<id>.webp (see makeup-photos.ts); its FaceLook
 * (skin, lid colours, liner, blush, lips, accents) is read by the engine's Python reference too
 * (scripts/tinybeauty: teacher.py, products.py parse the style(...) lines below).
 */

import signatures from "./look-signatures.json";

export type Skin = "sheer" | "matte" | "dewy" | "glow" | "bronzed";
export type Shadow = "none" | "wash" | "crease" | "cutcrease" | "halo" | "smoky" | "gradient";
export type Liner = "none" | "thin" | "wing" | "fox" | "double" | "graphic" | "puppy" | "smudge" | "siren";
export type Lashes = "natural" | "volume" | "dramatic";
export type Brow = "natural" | "bold" | "lifted" | "thin";
export type Blush = "none" | "apples" | "high" | "draped" | "nose" | "under";
export type LipFinish = "matte" | "satin" | "gloss" | "ombre" | "lined";
export type Accent = "shimmer" | "glitter" | "rhinestones" | "freckles" | "contour" | "lowerLiner" | "bottomLashes" | "aegyo";

export type FaceLook = {
  skin: Skin;
  shadow: Shadow;
  /** [lid / inner colour, crease / outer colour] */
  lid: [string, string];
  liner: Liner;
  linerColor?: string;
  lashes: Lashes;
  brow: Brow;
  blush: Blush;
  blushColor: string;
  lip: LipFinish;
  lipColor: string;
  accents?: Accent[];
};

export type MakeupStyle = {
  id: string;
  title: string;
  look: FaceLook;
};

function style(id: string, title: string, look: FaceLook): MakeupStyle {
  return { id, title, look };
}

export const MAKEUP_STYLES: MakeupStyle[] = [
  /* ---------- Everyday ---------- */
  style("no-makeup", "میکاپ بدون میکاپ",
    { skin: "sheer", shadow: "wash", lid: ["#d9b19f", "#c39a87"], liner: "none", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#e3a394", lip: "gloss", lipColor: "#c9877c" }),
  style("clean-girl", "کلین گرل",
    { skin: "dewy", shadow: "none", lid: ["#d9b19f", "#c39a87"], liner: "none", lashes: "natural", brow: "lifted", blush: "high", blushColor: "#e39a8f", lip: "gloss", lipColor: "#c47e78" }),
  style("sun-kissed", "آفتاب‌خورده",
    { skin: "bronzed", shadow: "wash", lid: ["#d39b74", "#b97c58"], liner: "none", lashes: "natural", brow: "natural", blush: "nose", blushColor: "#e3876f", lip: "gloss", lipColor: "#c27a62", accents: ["freckles"] }),
  style("cold-girl", "کولد گرل",
    { skin: "dewy", shadow: "wash", lid: ["#e9b9bf", "#d698a3"], liner: "none", lashes: "natural", brow: "natural", blush: "nose", blushColor: "#ef8e9c", lip: "gloss", lipColor: "#d47483" }),

  /* ---------- Soft glam ---------- */
  style("soft-glam", "گلم نرم",
    { skin: "glow", shadow: "crease", lid: ["#c8a08a", "#8f6655"], liner: "thin", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#d4958a", lip: "satin", lipColor: "#9a5257" }),
  style("latte", "لاته",
    { skin: "bronzed", shadow: "crease", lid: ["#c49a7a", "#7a5440"], liner: "smudge", linerColor: "#5a3a2a", lashes: "volume", brow: "natural", blush: "high", blushColor: "#c98a6f", lip: "lined", lipColor: "#9a6450" }),
  style("strawberry", "توت‌فرنگی",
    { skin: "dewy", shadow: "wash", lid: ["#f1a7b0", "#e08391"], liner: "none", lashes: "natural", brow: "natural", blush: "draped", blushColor: "#ee8a98", lip: "gloss", lipColor: "#e0707f", accents: ["freckles"] }),

  /* ---------- Full glam ---------- */
  style("full-glam", "فول گلم",
    { skin: "matte", shadow: "crease", lid: ["#d8b08a", "#5e3b2c"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#cf8d7b", lip: "lined", lipColor: "#a3685c", accents: ["contour", "shimmer"] }),
  style("hollywood", "گلم هالیوودی",
    { skin: "glow", shadow: "wash", lid: ["#e7cfae", "#c7a27c"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "apples", blushColor: "#dc9488", lip: "matte", lipColor: "#b3242f", accents: ["shimmer"] }),
  style("arabic-glam", "گلم عربی",
    { skin: "matte", shadow: "smoky", lid: ["#c9963f", "#2b1d17"], liner: "siren", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#c98472", lip: "lined", lipColor: "#a86a5b", accents: ["lowerLiner", "contour", "shimmer"] }),
  style("bronzed-goddess", "برنزه طلایی",
    { skin: "bronzed", shadow: "gradient", lid: ["#c99a52", "#7b4a2a"], liner: "thin", lashes: "volume", brow: "bold", blush: "high", blushColor: "#c4795a", lip: "gloss", lipColor: "#b06a52", accents: ["shimmer", "contour"] }),
  style("golden-hour", "طلایی",
    { skin: "glow", shadow: "halo", lid: ["#e2bd6a", "#8a5a33"], liner: "wing", lashes: "volume", brow: "natural", blush: "high", blushColor: "#d99172", lip: "satin", lipColor: "#b56a57", accents: ["shimmer"] }),
  style("bold-glam", "گلم جسور",
    { skin: "matte", shadow: "smoky", lid: ["#7a4a3c", "#2a1814"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#b9776a", lip: "lined", lipColor: "#6d1f2c", accents: ["contour"] }),
  style("cut-crease", "کات‌کریز",
    { skin: "matte", shadow: "cutcrease", lid: ["#efd6bf", "#5a3426"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#cf8d7b", lip: "lined", lipColor: "#a3685c", accents: ["shimmer"] }),

  /* ---------- Smoky & evening ---------- */
  style("classic-smokey", "دودی کلاسیک",
    { skin: "matte", shadow: "smoky", lid: ["#5c5452", "#141010"], liner: "smudge", lashes: "dramatic", brow: "bold", blush: "apples", blushColor: "#cf9488", lip: "satin", lipColor: "#b67e74", accents: ["lowerLiner"] }),
  style("brown-smokey", "دودی قهوه‌ای",
    { skin: "matte", shadow: "smoky", lid: ["#9c6e55", "#3a2219"], liner: "smudge", linerColor: "#3a2219", lashes: "volume", brow: "bold", blush: "high", blushColor: "#cc8b77", lip: "satin", lipColor: "#a86a5e" }),
  style("plum-smokey", "دودی آلویی",
    { skin: "matte", shadow: "smoky", lid: ["#8e5a7a", "#3a1830"], liner: "smudge", linerColor: "#2a1424", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#c98493", lip: "matte", lipColor: "#8a3f5a" }),
  style("emerald-night", "شب زمردی",
    { skin: "glow", shadow: "smoky", lid: ["#3f7a5e", "#14301f"], liner: "wing", lashes: "volume", brow: "bold", blush: "high", blushColor: "#cf8d7b", lip: "satin", lipColor: "#a8645a", accents: ["glitter"] }),
  style("navy-smokey", "دودی سرمه‌ای",
    { skin: "matte", shadow: "smoky", lid: ["#3e4f7a", "#141b33"], liner: "smudge", linerColor: "#141b33", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#cf9488", lip: "satin", lipColor: "#b67e74", accents: ["lowerLiner"] }),
  style("siren-eyes", "سایرن آیز",
    { skin: "matte", shadow: "smoky", lid: ["#8a6252", "#2b1a14"], liner: "siren", lashes: "volume", brow: "lifted", blush: "high", blushColor: "#c98472", lip: "lined", lipColor: "#9c5d55" }),

  /* ---------- Liner ---------- */
  style("cat-eye", "خط چشم گربه‌ای",
    { skin: "matte", shadow: "wash", lid: ["#dcbca8", "#bf9a85"], liner: "wing", lashes: "volume", brow: "natural", blush: "apples", blushColor: "#d99486", lip: "satin", lipColor: "#b8746c" }),
  style("fox-eye", "فاکس آی",
    { skin: "matte", shadow: "crease", lid: ["#c9a08a", "#6e4a3a"], liner: "fox", lashes: "volume", brow: "lifted", blush: "high", blushColor: "#cf8d7b", lip: "lined", lipColor: "#a3685c", accents: ["contour"] }),
  style("graphic-liner", "لاینر گرافیکی",
    { skin: "matte", shadow: "none", lid: ["#e2c6b3", "#c6a08a"], liner: "graphic", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#d99486", lip: "matte", lipColor: "#b8746c" }),
  style("colour-liner", "خط رنگی",
    { skin: "dewy", shadow: "none", lid: ["#e2c6b3", "#c6a08a"], liner: "wing", linerColor: "#2f6fd6", lashes: "volume", brow: "natural", blush: "apples", blushColor: "#e09a95", lip: "gloss", lipColor: "#c97a7f" }),

  /* ---------- Bridal ---------- */
  style("classic-bride", "عروس کلاسیک",
    { skin: "glow", shadow: "crease", lid: ["#ead2bd", "#8b6352"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "apples", blushColor: "#e09a95", lip: "satin", lipColor: "#c27a7b", accents: ["contour", "shimmer"] }),
  style("persian-bride", "عروس ایرانی",
    { skin: "glow", shadow: "smoky", lid: ["#c79a74", "#4a2c20"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#d98f86", lip: "lined", lipColor: "#b06a6a", accents: ["contour", "shimmer", "lowerLiner"] }),
  style("romantic-bride", "عروس رمانتیک",
    { skin: "dewy", shadow: "wash", lid: ["#efbcc0", "#d993a0"], liner: "thin", lashes: "volume", brow: "natural", blush: "draped", blushColor: "#ef9aa6", lip: "gloss", lipColor: "#d9788a", accents: ["shimmer"] }),
  style("boho-bride", "عروس بوهو",
    { skin: "bronzed", shadow: "wash", lid: ["#d3a273", "#a8744c"], liner: "none", lashes: "natural", brow: "natural", blush: "nose", blushColor: "#de8a70", lip: "satin", lipColor: "#b97461", accents: ["freckles", "shimmer"] }),
  style("aqd", "مراسم عقد",
    { skin: "glow", shadow: "wash", lid: ["#efd9c4", "#d5b39a"], liner: "thin", lashes: "volume", brow: "natural", blush: "apples", blushColor: "#e6a39b", lip: "satin", lipColor: "#c9837f", accents: ["shimmer"] }),
  style("henna-night", "شب حنابندان",
    { skin: "glow", shadow: "halo", lid: ["#d7a54a", "#6b2f1f"], liner: "siren", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#d0846e", lip: "matte", lipColor: "#8c1f28", accents: ["glitter"] }),

  /* ---------- Colour & editorial ---------- */
  style("sunset", "غروب",
    { skin: "glow", shadow: "gradient", lid: ["#f4b24b", "#d8435a"], liner: "thin", lashes: "volume", brow: "natural", blush: "high", blushColor: "#ef8f7a", lip: "gloss", lipColor: "#d86a5e" }),
  style("pastel", "پاستلی",
    { skin: "dewy", shadow: "wash", lid: ["#c9b3e8", "#a58ad6"], liner: "none", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#f0a5b4", lip: "gloss", lipColor: "#e08aa0" }),
  style("monochrome", "مونوکروم بری",
    { skin: "matte", shadow: "wash", lid: ["#c0606f", "#8f3a4c"], liner: "thin", lashes: "volume", brow: "natural", blush: "high", blushColor: "#c86476", lip: "matte", lipColor: "#8f3a4c" }),
  style("glitter-party", "گلیتر",
    { skin: "glow", shadow: "wash", lid: ["#e7c9d2", "#c9a0b0"], liner: "wing", lashes: "dramatic", brow: "natural", blush: "apples", blushColor: "#e09aa5", lip: "gloss", lipColor: "#c97a8a", accents: ["glitter", "shimmer"] }),
  style("rhinestone", "نگین‌دار",
    { skin: "dewy", shadow: "wash", lid: ["#dfc0e6", "#b48bc4"], liner: "thin", lashes: "volume", brow: "natural", blush: "high", blushColor: "#e59ab0", lip: "gloss", lipColor: "#c97a96", accents: ["rhinestones", "shimmer"] }),
  style("electric-blue", "آبی ادیتوریال",
    { skin: "matte", shadow: "gradient", lid: ["#4aa3f0", "#1d3fb8"], liner: "graphic", linerColor: "#1d3fb8", lashes: "volume", brow: "natural", blush: "none", blushColor: "#d99486", lip: "matte", lipColor: "#b57a72" }),

  /* ---------- Retro ---------- */
  style("pin-up", "پین‌آپ دهه ۵۰",
    { skin: "matte", shadow: "wash", lid: ["#efd9c8", "#d8b9a2"], liner: "wing", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#e09088", lip: "matte", lipColor: "#b31f2c" }),
  style("mod-60s", "رترو دهه ۶۰",
    { skin: "matte", shadow: "wash", lid: ["#eadbd0", "#d0bcae"], liner: "graphic", lashes: "dramatic", brow: "natural", blush: "apples", blushColor: "#e0a39a", lip: "satin", lipColor: "#d6a39a", accents: ["bottomLashes"] }),
  style("nineties", "دهه ۹۰",
    { skin: "matte", shadow: "wash", lid: ["#b88a72", "#8a5e4a"], liner: "thin", lashes: "natural", brow: "thin", blush: "high", blushColor: "#b97c66", lip: "lined", lipColor: "#8a5446", accents: ["contour"] }),
  style("twenties", "دهه ۲۰",
    { skin: "matte", shadow: "smoky", lid: ["#5a4a50", "#1a1218"], liner: "smudge", lashes: "volume", brow: "thin", blush: "apples", blushColor: "#d48a86", lip: "matte", lipColor: "#5e1424" }),

  /* ---------- K & J beauty ---------- */
  style("k-beauty", "کره‌ای",
    { skin: "dewy", shadow: "wash", lid: ["#f0c2b6", "#e0a497"], liner: "puppy", linerColor: "#6b3f35", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#f2a1a6", lip: "ombre", lipColor: "#d64b63", accents: ["aegyo"] }),
  style("douyin", "دویین",
    { skin: "dewy", shadow: "wash", lid: ["#f2b9c0", "#e08e9d"], liner: "puppy", lashes: "volume", brow: "natural", blush: "under", blushColor: "#f29aa8", lip: "gloss", lipColor: "#d9607a", accents: ["aegyo", "bottomLashes", "glitter"] }),
];

export const styleById = new Map(MAKEUP_STYLES.map((item) => [item.id, item]));

/**
 * The looks in an order that shows the catalog's range (the try-on's look rail): `first`, then each time the look most
 * unlike all those before it, by each look's signature (its catalog photo's change on her lids, past her eyes, cheeks,
 * lips..., from `strength.py sig`). So the rail's first pictures aren't four natural looks in a row; looks much alike
 * come last. Looks without a signature keep their catalog order, at the end.
 */
export function variedLooks(first: MakeupStyle, all: MakeupStyle[] = MAKEUP_STYLES): MakeupStyle[] {
  const sig = signatures as Record<string, number[]>;
  const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0));
  const rest = all.filter((item) => item.id !== first.id && sig[item.id]);
  const near = new Map(rest.map((item) => [item.id, sig[first.id] ? dist(sig[item.id], sig[first.id]) : Infinity]));
  const out = [first];
  while (rest.length) {
    let k = 0;
    for (let i = 1; i < rest.length; i++) if (near.get(rest[i].id)! > near.get(rest[k].id)!) k = i;
    const [pick] = rest.splice(k, 1);
    out.push(pick);
    for (const item of rest) near.set(item.id, Math.min(near.get(item.id)!, dist(sig[item.id], sig[pick.id])));
  }
  return [...out, ...all.filter((item) => item.id !== first.id && !sig[item.id])];
}
