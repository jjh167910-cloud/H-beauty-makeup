import type { NailStyle, NailFinish, NailShape, NailColor } from "./nail-styles";

/**
 * The Grand Nail Atlas: individually identified COLOR x DESIGN references.
 * Each family has its own distinctly rendered motif; the 12 colorways are
 * intentionally named and curated, never represented as customer photographs.
 * Preserve all preexisting nail IDs. Future releases can add new families
 * without mutating earlier customer favorites or booked style references.
 */
type Shade = {
  id: string; fa: string; en: string; base: string; accent: string; color: NailColor;
};
const SHADES: readonly Shade[] = [
  {id:"ivory",fa:"عاجی",en:"Ivory",base:"#E9D7C6",accent:"#FFF8E9",color:"nude"},
  {id:"blush",fa:"رز لطیف",en:"Blush",base:"#D9A1B0",accent:"#FFE3E7",color:"pink"},
  {id:"champagne",fa:"شامپاینی",en:"Champagne",base:"#C6A682",accent:"#F9E3BD",color:"nude"},
  {id:"ruby",fa:"یاقوتی",en:"Ruby",base:"#A72E40",accent:"#F3A7B2",color:"red"},
  {id:"merlot",fa:"زرشکی",en:"Merlot",base:"#5F3046",accent:"#E6A9BA",color:"dark"},
  {id:"espresso",fa:"اسپرسو",en:"Espresso",base:"#63473C",accent:"#D5AD93",color:"dark"},
  {id:"sage",fa:"سیج",en:"Sage",base:"#879C83",accent:"#DCE8C8",color:"color"},
  {id:"lavender",fa:"یاسی",en:"Lavender",base:"#A395C7",accent:"#E9DDFB",color:"color"},
  {id:"cobalt",fa:"کبالت",en:"Cobalt",base:"#385DA8",accent:"#BED7FF",color:"color"},
  {id:"midnight",fa:"نیمه‌شب",en:"Midnight",base:"#2E344E",accent:"#B7C1E8",color:"dark"},
  {id:"coral",fa:"مرجانی",en:"Coral",base:"#DA887A",accent:"#FBD2B9",color:"pink"},
  {id:"pearl",fa:"مرواریدی",en:"Pearl",base:"#D1CCD0",accent:"#FCF8FA",color:"nude"},
];

type Family = {
  id: string; fa: string; en: string; detail: string;
  finish: NailFinish; motif: NonNullable<NailStyle["motif"]>;
  shape: NailShape; length: NailStyle["length"];
};
const MANICURE_FAMILIES: readonly Family[] = [
  {id:"velvet",fa:"مخمل مات",en:"Velvet Matte",detail:"پوشش مات مخملی و لبه‌های کاملاً مرتب",finish:"matte",motif:"velvet",shape:"almond",length:"medium"},
  {id:"magnetic",fa:"چشم‌گربه‌ای",en:"Cat-Eye Beam",detail:"پرتو مغناطیسی مورب با عمق رنگ چندلایه",finish:"cat-eye",motif:"beam",shape:"oval",length:"medium"},
  {id:"jelly",fa:"ژلی شفاف",en:"Glass Jelly",detail:"شفافیت شیشه‌ای و ته‌رنگ قابل‌دیدن",finish:"jelly",motif:"jelly",shape:"square",length:"short"},
  {id:"aura",fa:"هاله نور",en:"Aura Glow",detail:"هاله مرکزی نرم و طیف‌ رنگ ملایم",finish:"aura",motif:"aura",shape:"almond",length:"long"},
  {id:"foil",fa:"ورق طلا",en:"Gold Leaf",detail:"جزئیات ورق فلزی نامتقارن",finish:"foil",motif:"foil",shape:"oval",length:"medium"},
  {id:"botanical",fa:"شاخه‌های ظریف",en:"Botanical Ink",detail:"شاخه‌ و برگ دست‌کشیده با ظرافت بالا",finish:"art",motif:"botanical",shape:"almond",length:"medium"},
  {id:"geometry",fa:"ژئومتریک",en:"Architectural Lines",detail:"خطوط دقیق هندسی و فضای منفی",finish:"art",motif:"geometry",shape:"square",length:"medium"},
  {id:"celestial",fa:"کهکشان",en:"Celestial Stars",detail:"ستاره‌های ریز، نقاط نور و آسمان شب",finish:"glitter",motif:"stars",shape:"coffin",length:"long"},
  {id:"sculpture",fa:"موج سه‌بعدی",en:"Sculpted Wave",detail:"نقش برجسته موجی با بازی نور و سایه",finish:"3d",motif:"waves",shape:"almond",length:"long"},
  {id:"minimal",fa:"نقطه مینیمال",en:"Minimal Dot",detail:"یک نقطهٔ ظریف و تعادل فضای خالی",finish:"gloss",motif:"minimal",shape:"oval",length:"short"},
  {id:"bridal",fa:"عروس مرواریدی",en:"Bridal Pearls",detail:"مرواریدهای ریز روی فرنچ ظریف",finish:"french",motif:"pearls",shape:"almond",length:"medium"},
  {id:"seasonal",fa:"برگ پاییزی",en:"Autumn Leaves",detail:"برگ‌های ظریف با لایه‌های شفاف",finish:"art",motif:"leaves",shape:"oval",length:"medium"},
  {id:"gradient",fa:"دودی آمبره",en:"Smoky Ombré",detail:"محو شدن تدریجی و یکدست رنگ",finish:"ombre",motif:"gradient",shape:"coffin",length:"long"},
  {id:"prism",fa:"پریزم کروم",en:"Prism Chrome",detail:"بازتاب چندوجهی صیقلی با درخشش خطی",finish:"chrome",motif:"prism",shape:"almond",length:"medium"},
  {id:"modern-french",fa:"فرنچ دوخط",en:"Double-Line French",detail:"فرنچ دوبل با خطوط موازی فوق‌باریک",finish:"french",motif:"double-french",shape:"square",length:"medium"},
  {id:"watercolor",fa:"آبرنگ ابری",en:"Watercolour Cloud",detail:"لکه‌رنگ‌های آبرنگی با لبه‌های نرم",finish:"art",motif:"watercolor",shape:"oval",length:"long"},
];

const PEDI_SHADES: readonly Shade[] = [
  SHADES[0], SHADES[1], SHADES[3], SHADES[6], SHADES[7], SHADES[9],
];
const PEDICURE_FAMILIES: readonly Family[] = [
  {id:"clean-gloss",fa:"پدیکور براق",en:"Clean Pedicure",detail:"رنگ یکنواخت تمیز و سطح آینه‌ای",finish:"gloss",motif:"plain",shape:"square",length:"short"},
  {id:"skinny-french",fa:"پدیکور فرنچ میکرو",en:"Micro French Pedicure",detail:"لبه فرنچ بسیار نازک",finish:"french",motif:"double-french",shape:"square",length:"short"},
  {id:"metallic",fa:"پدیکور کروم",en:"Chrome Pedicure",detail:"انعکاس فلزی شفاف روی ناخن پا",finish:"chrome",motif:"prism",shape:"square",length:"short"},
  {id:"aura",fa:"پدیکور هاله‌ای",en:"Aura Pedicure",detail:"هاله رنگی مرکزی و انتقال نرم",finish:"aura",motif:"aura",shape:"square",length:"short"},
  {id:"jelly",fa:"پدیکور ژلی",en:"Jelly Pedicure",detail:"پوشش شفاف آبنباتی",finish:"jelly",motif:"jelly",shape:"square",length:"short"},
  {id:"glitter",fa:"پدیکور استارداست",en:"Stardust Pedicure",detail:"درخشش‌های بسیار ریز و متراکم",finish:"glitter",motif:"stars",shape:"square",length:"short"},
  {id:"gold-leaf",fa:"پدیکور ورق طلا",en:"Gold Foil Pedicure",detail:"خرده‌ورق‌های متالیک ظریف",finish:"foil",motif:"foil",shape:"square",length:"short"},
  {id:"botanical",fa:"پدیکور گیاهی",en:"Botanical Pedicure",detail:"طرح‌های برگ مینیاتوری",finish:"art",motif:"botanical",shape:"square",length:"short"},
  {id:"minimal",fa:"پدیکور نقطه‌ای",en:"Minimal Pedicure",detail:"طرح تک‌نقطه و فضای منفی",finish:"gloss",motif:"minimal",shape:"square",length:"short"},
  {id:"cat-eye",fa:"پدیکور چشم‌گربه‌ای",en:"Magnetic Pedicure",detail:"پرتو مغناطیسی لطیف",finish:"cat-eye",motif:"beam",shape:"square",length:"short"},
  {id:"geometric",fa:"پدیکور هندسی",en:"Graphic Pedicure",detail:"خطوط هندسی روی پایه تمیز",finish:"art",motif:"geometry",shape:"square",length:"short"},
  {id:"marble",fa:"پدیکور مرمری",en:"Marble Pedicure",detail:"رگه‌های مرمری لایه‌لایه",finish:"art",motif:"marble",shape:"square",length:"short"},
];

/** Stable family selector keys match generated IDs, not translated names. */
export type NailAtlasFamilyOption = {
  key: string; title: string; english: string; prefix: string;
};
export const NAIL_ATLAS_FAMILIES: Readonly<Record<"manicure"|"pedicure", readonly NailAtlasFamilyOption[]>> = {
  manicure: MANICURE_FAMILIES.map(family=>({
    key:family.id,title:family.fa,english:family.en,
    prefix:`nail-atlas-${family.id}-`,
  })),
  pedicure: PEDICURE_FAMILIES.map(family=>({
    key:family.id,title:family.fa,english:family.en,
    prefix:`pedi-atlas-${family.id}-`,
  })),
};

function makeManicure(family: Family, shade: Shade, familyIndex: number, shadeIndex: number): NailStyle {
  const shapeCycle: NailShape[] = ["almond","oval","square","coffin"];
  const lengthCycle: NailStyle["length"][]=["short","medium","long"];
  const shape=familyIndex % 3 === 0 ? shapeCycle[(shadeIndex+familyIndex)%4] : family.shape;
  return {
    id:`nail-atlas-${family.id}-${shade.id}`,
    title:`${family.fa} ${shade.fa}`,
    en:`${shade.en} ${family.en}`,
    description:`${family.detail} با پالت ${shade.fa}`,
    finish:family.finish, motif:family.motif,
    shape,
    color:shade.color,
    length: familyIndex%2 ? family.length : lengthCycle[(shadeIndex+familyIndex)%3],
    base:shade.base,accent:shade.accent,
    serviceId:family.finish==="gloss" || family.finish==="matte" || family.finish==="jelly" ? "gel-manicure" : "nail-art",
  };
}
function makePedicure(family: Family,shade:Shade): NailStyle{
  return {
    id:`pedi-atlas-${family.id}-${shade.id}`,
    kind:"pedicure",
    title:`${family.fa} ${shade.fa}`,
    en:`${shade.en} ${family.en}`,
    description:`${family.detail} در طیف ${shade.fa}`,
    finish:family.finish,motif:family.motif,
    shape:"square",length:"short",color:shade.color,
    base:shade.base,accent:shade.accent,
    serviceId:family.finish==="gloss" || family.finish==="jelly" ? "classic-pedicure":"gel-pedicure",
  };
}

export const EXPANSION_MANICURE_STYLES: readonly NailStyle[] =
  MANICURE_FAMILIES.flatMap((family,i) => SHADES.map((shade,j)=>makeManicure(family,shade,i,j)));
export const EXPANSION_PEDICURE_STYLES: readonly NailStyle[] =
  PEDICURE_FAMILIES.flatMap(family=>PEDI_SHADES.map(shade=>makePedicure(family,shade)));
export const NAIL_EXPANSION: readonly NailStyle[] = [
  ...EXPANSION_MANICURE_STYLES,...EXPANSION_PEDICURE_STYLES,
];
// Audit numbers: 16 x 12 = 192 manicures, 12 x 6 = 72 pedicures.
// Together with preserved 28 + 6 original styles => 298 unique references.
