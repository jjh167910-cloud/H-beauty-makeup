/*
 * Professional makeup style catalog. Each style's photo lives at
 * /makeup/looks/<id>.webp (see makeup-photos.ts). FaceLook drives the palette
 * and breakdown text.
 */

import { CURATED_MAKEUP_40 } from "./makeup-curated-40";
import { CURATED_MAKEUP_43_82 } from "./makeup-curated-43-82";

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

export type StyleCategory = "everyday" | "soft" | "glam" | "smoky" | "liner" | "bridal" | "color" | "retro" | "asian";

export const STYLE_CATEGORIES: Array<{ key: StyleCategory; label: string; en: string; note: string; cover: string; service: string }> = [
  { key: "everyday", label: "میکاپ نچرال", en: "EVERYDAY", note: "آرایش ملایم و طبیعی", cover: "no-makeup", service: "natural-makeup" },
  { key: "soft", label: "گلم نرم", en: "SOFT GLAM", note: "لطیف و درخشان", cover: "soft-glam", service: "event-makeup" },
  { key: "glam", label: "میکاپ مجلسی", en: "FULL GLAM", note: "آرایش رسمی و کامل", cover: "full-glam", service: "event-makeup" },
  { key: "smoky", label: "میکاپ شب", en: "SMOKY & EVENING", note: "خاص و جذاب", cover: "classic-smokey", service: "event-makeup" },
  { key: "bridal", label: "میکاپ عروس", en: "BRIDAL", note: "عروس و عقد", cover: "persian-bride", service: "bridal-signature" },
  { key: "liner", label: "خط چشم", en: "LINER", note: "نگاه کشیده و دقیق", cover: "cat-eye", service: "event-makeup" },
  { key: "color", label: "رنگی و ادیتوریال", en: "COLOUR & EDITORIAL", note: "رنگ‌های جسور", cover: "sunset", service: "event-makeup" },
  { key: "retro", label: "رترو", en: "RETRO", note: "الهام از دهه‌های گذشته", cover: "pin-up", service: "event-makeup" },
  { key: "asian", label: "سبک آسیایی", en: "ASIAN BEAUTY", note: "کره‌ای و دویین", cover: "k-beauty", service: "event-makeup" },
];

export type MakeupStyle = {
  id: string;
  category: StyleCategory;
  title: string;
  en: string;
  detail: string;
  look: FaceLook;
  /** The look worn in the reference model photo. */
  reference?: boolean;
  promptNumber?: number;
};

function style(id: string, category: StyleCategory, title: string, en: string, detail: string, look: FaceLook, reference?: boolean): MakeupStyle {
  return { id, category, title, en, detail, look, reference };
}

const LEGACY_MAKEUP_STYLES: MakeupStyle[] = [
  /* ---------- Everyday ---------- */
  style("no-makeup", "everyday", "میکاپ بدون میکاپ", "NO-MAKEUP MAKEUP", "پوست یکدست با پوشش بسیار سبک؛ فقط کمی ریمل و بالم رنگی.",
    { skin: "sheer", shadow: "wash", lid: ["#d9b19f", "#c39a87"], liner: "none", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#e3a394", lip: "gloss", lipColor: "#c9877c" }),
  style("clean-girl", "everyday", "کلین گرل", "CLEAN GIRL", "ابروی لیفت‌شده، پوست شبنمی و لب براق؛ مرتب و تازه.",
    { skin: "dewy", shadow: "none", lid: ["#d9b19f", "#c39a87"], liner: "none", lashes: "natural", brow: "lifted", blush: "high", blushColor: "#e39a8f", lip: "gloss", lipColor: "#c47e78" }),
  style("sun-kissed", "everyday", "آفتاب‌خورده", "SUN-KISSED", "پوست برنزه، رژگونه روی بینی و کک‌مک ظریف؛ حس تابستان.",
    { skin: "bronzed", shadow: "wash", lid: ["#d39b74", "#b97c58"], liner: "none", lashes: "natural", brow: "natural", blush: "nose", blushColor: "#e3876f", lip: "gloss", lipColor: "#c27a62", accents: ["freckles"] }),
  style("cold-girl", "everyday", "کولد گرل", "COLD GIRL", "رژگونه صورتی روی گونه و بینی؛ انگار از سرمای بیرون آمده‌اید.",
    { skin: "dewy", shadow: "wash", lid: ["#e9b9bf", "#d698a3"], liner: "none", lashes: "natural", brow: "natural", blush: "nose", blushColor: "#ef8e9c", lip: "gloss", lipColor: "#d47483" }),

  /* ---------- Soft glam ---------- */
  style("soft-glam", "soft", "گلم نرم", "SOFT GLAM", "لوکِ تصویر مرجع: ابروی پر، سایه گرم، خط ریز و رژ موو-رز.",
    { skin: "glow", shadow: "crease", lid: ["#c8a08a", "#8f6655"], liner: "thin", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#d4958a", lip: "satin", lipColor: "#9a5257" }, true),
  style("latte", "soft", "لاته", "LATTE MAKEUP", "سایه‌های قهوه‌ای کرم، خط محو و لب نود قهوه‌ای با خط لب.",
    { skin: "bronzed", shadow: "crease", lid: ["#c49a7a", "#7a5440"], liner: "smudge", linerColor: "#5a3a2a", lashes: "volume", brow: "natural", blush: "high", blushColor: "#c98a6f", lip: "lined", lipColor: "#9a6450" }),
  style("strawberry", "soft", "توت‌فرنگی", "STRAWBERRY", "رژگونه صورتی گسترده، کک‌مک و لب براق توت‌فرنگی.",
    { skin: "dewy", shadow: "wash", lid: ["#f1a7b0", "#e08391"], liner: "none", lashes: "natural", brow: "natural", blush: "draped", blushColor: "#ee8a98", lip: "gloss", lipColor: "#e0707f", accents: ["freckles"] }),

  /* ---------- Full glam ---------- */
  style("full-glam", "glam", "فول گلم", "FULL GLAM", "کانتور کامل، سایه عمیق، خط بال‌دار و مژه پرپشت.",
    { skin: "matte", shadow: "crease", lid: ["#d8b08a", "#5e3b2c"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#cf8d7b", lip: "lined", lipColor: "#a3685c", accents: ["contour", "shimmer"] }),
  style("hollywood", "glam", "گلم هالیوودی", "HOLLYWOOD GLAM", "پلک شامپاینی، خط کلاسیک و رژ قرمز مات.",
    { skin: "glow", shadow: "wash", lid: ["#e7cfae", "#c7a27c"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "apples", blushColor: "#dc9488", lip: "matte", lipColor: "#b3242f", accents: ["shimmer"] }),
  style("arabic-glam", "glam", "گلم عربی", "ARABIC GLAM", "ابروی پر، دودی تیره با مرکز طلایی، خط کشیده و لب نود.",
    { skin: "matte", shadow: "smoky", lid: ["#c9963f", "#2b1d17"], liner: "siren", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#c98472", lip: "lined", lipColor: "#a86a5b", accents: ["lowerLiner", "contour", "shimmer"] }),
  style("bronzed-goddess", "glam", "برنزه طلایی", "BRONZED GODDESS", "پلک برنز متالیک، پوست برنزه و لب نود براق.",
    { skin: "bronzed", shadow: "gradient", lid: ["#c99a52", "#7b4a2a"], liner: "thin", lashes: "volume", brow: "bold", blush: "high", blushColor: "#c4795a", lip: "gloss", lipColor: "#b06a52", accents: ["shimmer", "contour"] }),
  style("golden-hour", "glam", "طلایی", "GOLDEN HOUR", "هالوی طلایی روی پلک با گرمای نور غروب.",
    { skin: "glow", shadow: "halo", lid: ["#e2bd6a", "#8a5a33"], liner: "wing", lashes: "volume", brow: "natural", blush: "high", blushColor: "#d99172", lip: "satin", lipColor: "#b56a57", accents: ["shimmer"] }),
  style("bold-glam", "glam", "گلم جسور", "BOLD GLAM", "دودی قهوه‌ای تیره، مژه پرپشت و لب شرابی با خط.",
    { skin: "matte", shadow: "smoky", lid: ["#7a4a3c", "#2a1814"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#b9776a", lip: "lined", lipColor: "#6d1f2c", accents: ["contour"] }),
  style("cut-crease", "glam", "کات‌کریز", "CUT CREASE", "مرز دقیق روی چین پلک با پلک روشن؛ عمق و وضوح.",
    { skin: "matte", shadow: "cutcrease", lid: ["#efd6bf", "#5a3426"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#cf8d7b", lip: "lined", lipColor: "#a3685c", accents: ["shimmer"] }),

  /* ---------- Smoky & evening ---------- */
  style("classic-smokey", "smoky", "دودی کلاسیک", "CLASSIC SMOKEY", "دودی سیاه و خاکستری با لب نود؛ کلاسیکِ شب.",
    { skin: "matte", shadow: "smoky", lid: ["#5c5452", "#141010"], liner: "smudge", lashes: "dramatic", brow: "bold", blush: "apples", blushColor: "#cf9488", lip: "satin", lipColor: "#b67e74", accents: ["lowerLiner"] }),
  style("brown-smokey", "smoky", "دودی قهوه‌ای", "BROWN SMOKEY", "دودی گرم قهوه‌ای؛ نرم‌تر از مشکی و مناسب پوست‌های گرم.",
    { skin: "matte", shadow: "smoky", lid: ["#9c6e55", "#3a2219"], liner: "smudge", linerColor: "#3a2219", lashes: "volume", brow: "bold", blush: "high", blushColor: "#cc8b77", lip: "satin", lipColor: "#a86a5e" }),
  style("plum-smokey", "smoky", "دودی آلویی", "PLUM SMOKEY", "سایه آلویی دودی با لب بری؛ عمیق و زنانه.",
    { skin: "matte", shadow: "smoky", lid: ["#8e5a7a", "#3a1830"], liner: "smudge", linerColor: "#2a1424", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#c98493", lip: "matte", lipColor: "#8a3f5a" }),
  style("emerald-night", "smoky", "شب زمردی", "EMERALD NIGHT", "دودی سبز زمردی با نقاط طلایی؛ برای لباس‌های تیره.",
    { skin: "glow", shadow: "smoky", lid: ["#3f7a5e", "#14301f"], liner: "wing", lashes: "volume", brow: "bold", blush: "high", blushColor: "#cf8d7b", lip: "satin", lipColor: "#a8645a", accents: ["glitter"] }),
  style("navy-smokey", "smoky", "دودی سرمه‌ای", "NAVY SMOKEY", "سرمه‌ای محو به جای مشکی؛ متفاوت ولی رسمی.",
    { skin: "matte", shadow: "smoky", lid: ["#3e4f7a", "#141b33"], liner: "smudge", linerColor: "#141b33", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#cf9488", lip: "satin", lipColor: "#b67e74", accents: ["lowerLiner"] }),
  style("siren-eyes", "smoky", "سایرن آیز", "SIREN EYES", "خط کشیده با گوشه داخلی تیز و سایه تیره؛ نگاه کشیده و جذاب.",
    { skin: "matte", shadow: "smoky", lid: ["#8a6252", "#2b1a14"], liner: "siren", lashes: "volume", brow: "lifted", blush: "high", blushColor: "#c98472", lip: "lined", lipColor: "#9c5d55" }),

  /* ---------- Liner ---------- */
  style("cat-eye", "liner", "خط چشم گربه‌ای", "CAT EYE", "خط بال‌دار کلاسیک؛ بقیه چهره ملایم می‌ماند.",
    { skin: "matte", shadow: "wash", lid: ["#dcbca8", "#bf9a85"], liner: "wing", lashes: "volume", brow: "natural", blush: "apples", blushColor: "#d99486", lip: "satin", lipColor: "#b8746c" }),
  style("fox-eye", "liner", "فاکس آی", "FOX EYE", "خط و سایه کشیده رو به بالا با ابروی لیفت‌شده.",
    { skin: "matte", shadow: "crease", lid: ["#c9a08a", "#6e4a3a"], liner: "fox", lashes: "volume", brow: "lifted", blush: "high", blushColor: "#cf8d7b", lip: "lined", lipColor: "#a3685c", accents: ["contour"] }),
  style("graphic-liner", "liner", "لاینر گرافیکی", "GRAPHIC LINER", "خط معلق روی چین پلک؛ مینیمال و مدرن.",
    { skin: "matte", shadow: "none", lid: ["#e2c6b3", "#c6a08a"], liner: "graphic", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#d99486", lip: "matte", lipColor: "#b8746c" }),
  style("colour-liner", "liner", "خط رنگی", "COLOUR LINER", "خط بال‌دار آبی روشن روی پوست تمیز.",
    { skin: "dewy", shadow: "none", lid: ["#e2c6b3", "#c6a08a"], liner: "wing", linerColor: "#2f6fd6", lashes: "volume", brow: "natural", blush: "apples", blushColor: "#e09a95", lip: "gloss", lipColor: "#c97a7f" }),

  /* ---------- Bridal ---------- */
  style("classic-bride", "bridal", "عروس کلاسیک", "CLASSIC BRIDE", "ماندگار و عکس‌محور؛ سایه گرم، مژه پرپشت و لب رز.",
    { skin: "glow", shadow: "crease", lid: ["#ead2bd", "#8b6352"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "apples", blushColor: "#e09a95", lip: "satin", lipColor: "#c27a7b", accents: ["contour", "shimmer"] }),
  style("persian-bride", "bridal", "عروس ایرانی", "PERSIAN BRIDE", "دودی قهوه‌ای، خط بال‌دار، ابروی پر و هایلایت درخشان.",
    { skin: "glow", shadow: "smoky", lid: ["#c79a74", "#4a2c20"], liner: "wing", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#d98f86", lip: "lined", lipColor: "#b06a6a", accents: ["contour", "shimmer", "lowerLiner"] }),
  style("romantic-bride", "bridal", "عروس رمانتیک", "ROMANTIC PINK", "صورتی ملایم روی پلک و گونه با لب براق.",
    { skin: "dewy", shadow: "wash", lid: ["#efbcc0", "#d993a0"], liner: "thin", lashes: "volume", brow: "natural", blush: "draped", blushColor: "#ef9aa6", lip: "gloss", lipColor: "#d9788a", accents: ["shimmer"] }),
  style("boho-bride", "bridal", "عروس بوهو", "BOHO BRIDE", "برنزه و طبیعی با کک‌مک؛ برای مراسم در فضای باز.",
    { skin: "bronzed", shadow: "wash", lid: ["#d3a273", "#a8744c"], liner: "none", lashes: "natural", brow: "natural", blush: "nose", blushColor: "#de8a70", lip: "satin", lipColor: "#b97461", accents: ["freckles", "shimmer"] }),
  style("aqd", "bridal", "مراسم عقد", "AQD CEREMONY", "شامپاینی و درخشان؛ ظریف و روشن برای سفره عقد.",
    { skin: "glow", shadow: "wash", lid: ["#efd9c4", "#d5b39a"], liner: "thin", lashes: "volume", brow: "natural", blush: "apples", blushColor: "#e6a39b", lip: "satin", lipColor: "#c9837f", accents: ["shimmer"] }),
  style("henna-night", "bridal", "شب حنابندان", "HENNA NIGHT", "طلایی و تیره با لب قرمز عمیق؛ گرم و جشن‌گونه.",
    { skin: "glow", shadow: "halo", lid: ["#d7a54a", "#6b2f1f"], liner: "siren", lashes: "dramatic", brow: "bold", blush: "high", blushColor: "#d0846e", lip: "matte", lipColor: "#8c1f28", accents: ["glitter"] }),

  /* ---------- Colour & editorial ---------- */
  style("sunset", "color", "غروب", "SUNSET EYES", "گرادیان نارنجی تا صورتی روی پلک.",
    { skin: "glow", shadow: "gradient", lid: ["#f4b24b", "#d8435a"], liner: "thin", lashes: "volume", brow: "natural", blush: "high", blushColor: "#ef8f7a", lip: "gloss", lipColor: "#d86a5e" }),
  style("pastel", "color", "پاستلی", "PASTEL LILAC", "یاسی پاستلی روی پلک با گونه و لب صورتی.",
    { skin: "dewy", shadow: "wash", lid: ["#c9b3e8", "#a58ad6"], liner: "none", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#f0a5b4", lip: "gloss", lipColor: "#e08aa0" }),
  style("monochrome", "color", "مونوکروم بری", "MONOCHROME BERRY", "یک رنگ بری روی پلک، گونه و لب؛ هماهنگ و مدرن.",
    { skin: "matte", shadow: "wash", lid: ["#c0606f", "#8f3a4c"], liner: "thin", lashes: "volume", brow: "natural", blush: "high", blushColor: "#c86476", lip: "matte", lipColor: "#8f3a4c" }),
  style("glitter-party", "color", "گلیتر", "GLITTER PARTY", "پلک پر از گلیتر برای جشن و تولد.",
    { skin: "glow", shadow: "wash", lid: ["#e7c9d2", "#c9a0b0"], liner: "wing", lashes: "dramatic", brow: "natural", blush: "apples", blushColor: "#e09aa5", lip: "gloss", lipColor: "#c97a8a", accents: ["glitter", "shimmer"] }),
  style("rhinestone", "color", "نگین‌دار", "RHINESTONE ACCENTS", "نگین‌های ریز کنار چشم؛ ادیتوریال و چشمگیر.",
    { skin: "dewy", shadow: "wash", lid: ["#dfc0e6", "#b48bc4"], liner: "thin", lashes: "volume", brow: "natural", blush: "high", blushColor: "#e59ab0", lip: "gloss", lipColor: "#c97a96", accents: ["rhinestones", "shimmer"] }),
  style("electric-blue", "color", "آبی ادیتوریال", "ELECTRIC BLUE", "آبی پررنگ گرادیانی با خط گرافیکی؛ برای عکاسی.",
    { skin: "matte", shadow: "gradient", lid: ["#4aa3f0", "#1d3fb8"], liner: "graphic", linerColor: "#1d3fb8", lashes: "volume", brow: "natural", blush: "none", blushColor: "#d99486", lip: "matte", lipColor: "#b57a72" }),

  /* ---------- Retro ---------- */
  style("pin-up", "retro", "پین‌آپ دهه ۵۰", "50s PIN-UP", "خط بال‌دار پهن و رژ قرمز؛ کلاسیک دهه پنجاه.",
    { skin: "matte", shadow: "wash", lid: ["#efd9c8", "#d8b9a2"], liner: "wing", lashes: "volume", brow: "bold", blush: "apples", blushColor: "#e09088", lip: "matte", lipColor: "#b31f2c" }),
  style("mod-60s", "retro", "رترو دهه ۶۰", "60s MOD", "خط روی چین پلک و مژه‌های پایین برجسته.",
    { skin: "matte", shadow: "wash", lid: ["#eadbd0", "#d0bcae"], liner: "graphic", lashes: "dramatic", brow: "natural", blush: "apples", blushColor: "#e0a39a", lip: "satin", lipColor: "#d6a39a", accents: ["bottomLashes"] }),
  style("nineties", "retro", "دهه ۹۰", "90s BROWN LIP", "ابروی باریک، رژ قهوه‌ای با خط تیره و پوست مات.",
    { skin: "matte", shadow: "wash", lid: ["#b88a72", "#8a5e4a"], liner: "thin", lashes: "natural", brow: "thin", blush: "high", blushColor: "#b97c66", lip: "lined", lipColor: "#8a5446", accents: ["contour"] }),
  style("twenties", "retro", "دهه ۲۰", "1920s VAMP", "ابروی باریک، دودی گرد و لب شرابی تیره.",
    { skin: "matte", shadow: "smoky", lid: ["#5a4a50", "#1a1218"], liner: "smudge", lashes: "volume", brow: "thin", blush: "apples", blushColor: "#d48a86", lip: "matte", lipColor: "#5e1424" }),

  /* ---------- K & J beauty ---------- */
  style("k-beauty", "asian", "کره‌ای", "K-BEAUTY", "پوست شیشه‌ای، خط رو به پایین و لب گرادیانی.",
    { skin: "dewy", shadow: "wash", lid: ["#f0c2b6", "#e0a497"], liner: "puppy", linerColor: "#6b3f35", lashes: "natural", brow: "natural", blush: "apples", blushColor: "#f2a1a6", lip: "ombre", lipColor: "#d64b63", accents: ["aegyo"] }),
  style("douyin", "asian", "دویین", "DOUYIN", "رژگونه زیر چشم، شاین زیر پلک و مژه‌های پایین.",
    { skin: "dewy", shadow: "wash", lid: ["#f2b9c0", "#e08e9d"], liner: "puppy", lashes: "volume", brow: "natural", blush: "under", blushColor: "#f29aa8", lip: "gloss", lipColor: "#d9607a", accents: ["aegyo", "bottomLashes", "glitter"] }),
];

/** New portfolio is opt-in; preserve all original IDs for users' saved/booked looks. */
const CURATED_80_STYLES: MakeupStyle[] = [...CURATED_MAKEUP_40, ...CURATED_MAKEUP_43_82].map((item) => {
  const en = item.nameEn.toLowerCase();
  const brief = item.description;
  const smoky = /smokey|smoky|grunge|kohl|دودی|اسموکی|سرمه/.test(en + brief);
  const bridal = item.category === "bridal";
  const liner = /liner|line|wing|cat eye|fox eye|reverse/i.test(item.nameEn);
  const graphic = /graphic|neon|white liner|gold liner/i.test(item.nameEn);
  const coloredEye = /silver|gold|teal|blue|chrome|rose gold|fuchsia|sunflower|graphic|neon|foil/i.test(item.nameEn);
  const skin: Skin = /bronze|برنزه/.test(en + brief) ? "bronzed"
    : /مات/.test(item.finish) ? "matte"
    : /براق|درخشان|شبنم|شیشه|صدفی/.test(item.finish) ? "glow" : "sheer";
  const shadow: Shadow = smoky ? "smoky" : /halo|هاله/.test(en+brief) ? "halo"
    : /cut crease|کات کریس|کات‌کریس/.test(en+brief) ? "cutcrease"
    : /گرادیان|gradient|sunset/.test(en+brief) ? "gradient"
    : /چین پلک|crease/.test(en+brief) ? "crease" : /بدون سایه/.test(brief) ? "none" : "wash";
  const line: Liner = graphic ? "graphic"
    : /siren|سایرن/.test(en+brief) ? "siren"
    : /fox eye|روباهی/.test(en+brief) ? "fox"
    : smoky ? "smudge" : liner || /کشیده|بال‌دار/.test(brief) ? "wing" : "thin";
  const look: FaceLook = {
    skin, shadow, lid: [item.lid, item.pigment], liner: line,
    lashes: /دراماتیک|نمایشی|پرپشت|حجیم/.test(brief) ? "dramatic" : "volume",
    brow: /لیفت/.test(brief) ? "lifted" : /پررنگ|مشخص/.test(brief) ? "bold" : "natural",
    blush: /بینی/.test(brief) ? "nose" : /شقیقه/.test(brief) ? "draped" : "high",
    blushColor: item.blush,
    lip: /مات/.test(brief) && /رژلب|لب/.test(brief) ? "matte"
      : /براق|شیشه/.test(brief) ? "gloss" : /دورلب|مداد لب|خط لب/.test(brief) ? "lined" : "satin",
    lipColor: item.pigment,
    accents: coloredEye ? ["shimmer"] : bridal ? ["contour"] : undefined,
  };
  const category: StyleCategory = bridal ? "bridal"
    : item.category === "natural" ? "everyday"
    : item.category === "soft" ? "soft"
    : item.category === "evening" ? (smoky ? "smoky" : "glam")
    : item.category === "eyes" ? (liner || graphic ? "liner" : "color")
    : "glam";
  return {id:item.id,category,title:item.name,en:item.nameEn,detail:item.description,look,promptNumber:item.promptNumber};
});
export const MAKEUP_STYLES: MakeupStyle[] = import.meta.env.VITE_MAKEUP_CURATED_80 === "true"
  ? CURATED_80_STYLES
  : LEGACY_MAKEUP_STYLES;
export const styleById = new Map([...LEGACY_MAKEUP_STYLES, ...CURATED_80_STYLES].map((item) => [item.id, item]));
export const REFERENCE_STYLE = MAKEUP_STYLES.find((item) => item.reference) ?? MAKEUP_STYLES[0];

export function categoryOf(key: StyleCategory) {
  return STYLE_CATEGORIES.find((item) => item.key === key) ?? STYLE_CATEGORIES[0];
}

export function serviceForStyle(item: MakeupStyle) {
  return categoryOf(item.category).service;
}

/* ---------- Plain-language breakdown ---------- */

const SKIN: Record<Skin, string> = {
  sheer: "پوشش بسیار سبک و طبیعی",
  matte: "پوست مات و یکدست",
  dewy: "پوست شبنمی و آبرسان",
  glow: "پوست درخشان با هایلایت",
  bronzed: "پوست برنزه با کانتور گرم",
};
const SHADOW: Record<Shadow, string> = {
  none: "بدون سایه",
  wash: "سایه یک‌رنگ و ملایم روی پلک",
  crease: "سایه با عمق در چین پلک",
  cutcrease: "کات‌کریز با مرز دقیق",
  halo: "هالو؛ روشن در وسط، تیره در دو طرف",
  smoky: "سایه دودی و محو",
  gradient: "سایه گرادیانی دو رنگ",
};
const LINER: Record<Liner, string> = {
  none: "",
  thin: "خط پشت پلک نازک",
  wing: "خط چشم بال‌دار",
  fox: "خط کشیده رو به بالا",
  double: "خط چشم دوبل",
  graphic: "خط گرافیکی روی چین پلک",
  puppy: "خط رو به پایین",
  smudge: "خط محو و دودی",
  siren: "خط کشیده با گوشه داخلی تیز",
};
const LASHES: Record<Lashes, string> = { natural: "ریمل طبیعی", volume: "مژه حجیم", dramatic: "مژه پرپشت و بلند" };
const BROW: Record<Brow, string> = { natural: "ابروی طبیعی", bold: "ابروی پر", lifted: "ابروی لیفت‌شده", thin: "ابروی باریک" };
const BLUSH: Record<Blush, string> = {
  none: "بدون رژگونه",
  apples: "رژگونه روی برجستگی گونه",
  high: "رژگونه بالا و کشیده",
  draped: "رژگونه کشیده تا شقیقه",
  nose: "رژگونه روی گونه و بینی",
  under: "رژگونه درست زیر چشم",
};
const LIP: Record<LipFinish, string> = { matte: "رژ مات", satin: "رژ ساتن", gloss: "لب براق", ombre: "لب گرادیانی", lined: "رژ با خط لب مشخص" };

export function breakdown(look: FaceLook) {
  return [
    { key: "skin", label: "پوست", en: "SKIN", text: SKIN[look.skin], color: look.skin === "bronzed" ? "#c98d6a" : "#e6bba7" },
    { key: "eyes", label: "چشم", en: "EYES", text: [SHADOW[look.shadow], LINER[look.liner], LASHES[look.lashes]].filter(Boolean).join(" · "), color: look.shadow === "none" ? look.linerColor ?? "#1b1311" : look.lid[1] },
    { key: "brows", label: "ابرو", en: "BROWS", text: BROW[look.brow], color: "#4a3832" },
    { key: "cheeks", label: "گونه", en: "CHEEKS", text: BLUSH[look.blush], color: look.blushColor },
    { key: "lips", label: "لب", en: "LIPS", text: LIP[look.lip], color: look.lipColor },
  ];
}


/* ---------- Tags shown on a style's detail page ---------- */

const SKIN_TAG: Record<Skin, string> = { sheer: "سبک", matte: "مات", dewy: "شبنمی", glow: "درخشان", bronzed: "برنزه" };
const LIP_TAG: Record<LipFinish, string> = { matte: "رژ مات", satin: "رژ ساتن", gloss: "لب براق", ombre: "لب گرادیانی", lined: "خط لب" };
const SHADOW_TAG: Partial<Record<Shadow, string>> = { smoky: "دودی", cutcrease: "کات‌کریز", halo: "هالو", gradient: "رنگی" };
const LINER_TAG: Partial<Record<Liner, string>> = { wing: "خط بال‌دار", fox: "فاکس آی", siren: "سایرن", graphic: "گرافیکی", double: "خط دوبل" };

export function tagsFor(item: MakeupStyle) {
  const { look } = item;
  return [
    categoryOf(item.category).label,
    SKIN_TAG[look.skin],
    SHADOW_TAG[look.shadow],
    LINER_TAG[look.liner],
    LIP_TAG[look.lip],
  ].filter((tag): tag is string => Boolean(tag));
}
