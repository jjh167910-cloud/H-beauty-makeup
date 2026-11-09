import { NAIL_EXPANSION } from "./nail-expansion";
/** Reference nail concepts. Editorial vector swatches, not photographs of salon work. */
export type NailFinish = "gloss" | "french" | "chrome" | "ombre" | "glitter" | "art" | "matte" | "cat-eye" | "jelly" | "aura" | "foil" | "3d";
export type NailShape = "almond" | "oval" | "square" | "coffin";
export type NailColor = "nude" | "pink" | "red" | "dark" | "color";
export type NailLength = "short" | "medium" | "long";
export type NailKind = "manicure" | "pedicure";
export type NailMotif = "plain" | "velvet" | "beam" | "jelly" | "aura" | "foil" |
  "botanical" | "geometry" | "stars" | "waves" | "minimal" | "pearls" |
  "leaves" | "gradient" | "prism" | "double-french" | "watercolor" | "marble";

export type NailStyle = {
  id: string;
  /** Old styles remain manicure by default for stored customer favorites. */
  kind?: NailKind;
  /** Decorative motif rendered in the local SVG inspiration sheet. */
  motif?: NailMotif;
  title: string;
  en: string;
  description: string;
  finish: NailFinish;
  shape: NailShape;
  color: NailColor;
  length: NailLength;
  base: string;
  accent: string;
  /** Existing salon service which can be used as a consultation starting point. */
  serviceId: string;
};

export const NAIL_FINISHES: ReadonlyArray<{ key: NailFinish | "all"; title: string }> = [
  { key: "all", title: "همه" },
  { key: "gloss", title: "ساده و براق" },
  { key: "french", title: "فرنچ" },
  { key: "chrome", title: "کروم" },
  { key: "ombre", title: "آمبره" },
  { key: "glitter", title: "اکلیلی" },
  { key: "art", title: "دیزاین" },
  { key: "matte", title: "مات مخملی" },
  { key: "cat-eye", title: "چشم‌گربه‌ای" },
  { key: "jelly", title: "ژلی شفاف" },
  { key: "aura", title: "هاله‌ای" },
  { key: "foil", title: "ورق فلزی" },
  { key: "3d", title: "سه‌بعدی" },
];

export const NAIL_SHAPES: ReadonlyArray<{ key: NailShape | "all"; title: string }> = [
  { key: "all", title: "همه فرم‌ها" },
  { key: "almond", title: "بادامی" },
  { key: "oval", title: "بیضی" },
  { key: "square", title: "مربعی" },
  { key: "coffin", title: "تابوتی" },
];

export const NAIL_LENGTHS: ReadonlyArray<{ key: NailLength | "all"; title: string }> = [
  { key: "all", title: "همه طول‌ها" },
  { key: "short", title: "کوتاه" },
  { key: "medium", title: "متوسط" },
  { key: "long", title: "بلند" },
];

export const NAIL_COLORS: ReadonlyArray<{ key: NailColor | "all"; title: string }> = [
  { key: "all", title: "همه رنگ‌ها" },
  { key: "nude", title: "نود" },
  { key: "pink", title: "صورتی" },
  { key: "red", title: "قرمز" },
  { key: "dark", title: "تیره" },
  { key: "color", title: "رنگی" },
];

export const NAIL_STYLES: readonly NailStyle[] = [
  { id:"nail-milky-silk",title:"شیری ابریشمی",en:"Milky Silk",description:"شیری نیمه‌شفاف و براق برای استایل مینیمال",finish:"gloss",shape:"almond",color:"nude",length:"short",base:"#F4E5DC",accent:"#FFF9F2",serviceId:"gel-manicure" },
  { id:"nail-ballet-pink",title:"صورتی باله",en:"Ballet Pink",description:"صورتی ملایم و کلاسیک برای هر روز",finish:"gloss",shape:"oval",color:"pink",length:"short",base:"#DFAEAB",accent:"#F8D9D3",serviceId:"gel-manicure" },
  { id:"nail-old-money",title:"نود کلاسیک",en:"Quiet Luxury Nude",description:"رنگ خنثی و فرم بادامی شیک",finish:"gloss",shape:"almond",color:"nude",length:"medium",base:"#C49A85",accent:"#F6DFCE",serviceId:"gel-manicure" },
  { id:"nail-ruby-red",title:"قرمز یاقوتی",en:"Ruby Rouge",description:"قرمز غنی با پوشش براق و یکدست",finish:"gloss",shape:"oval",color:"red",length:"medium",base:"#9F2637",accent:"#F3A5A5",serviceId:"gel-manicure" },
  { id:"nail-merlot",title:"زرشکی مخملی",en:"Merlot",description:"زرشکی عمیق برای استایل مجلسی",finish:"gloss",shape:"almond",color:"dark",length:"medium",base:"#552036",accent:"#C07D98",serviceId:"gel-manicure" },
  { id:"nail-cocoa",title:"کاکائویی",en:"Cocoa Glaze",description:"قهوه‌ای گرم با براقیت لطیف",finish:"gloss",shape:"square",color:"dark",length:"short",base:"#745242",accent:"#C9A88C",serviceId:"gel-manicure" },
  { id:"nail-micro-french",title:"فرنچ میکرو",en:"Micro French",description:"خط فرنچ بسیار باریک روی بیس صورتی طبیعی",finish:"french",shape:"square",color:"nude",length:"short",base:"#E7B9B4",accent:"#FFFDF7",serviceId:"nail-art" },
  { id:"nail-classic-french",title:"فرنچ کلاسیک",en:"Classic French",description:"فرنچ سفید روی زمینه نچرال",finish:"french",shape:"almond",color:"nude",length:"medium",base:"#DDB0A0",accent:"#FFFDF4",serviceId:"nail-art" },
  { id:"nail-cherry-french",title:"فرنچ گیلاسی",en:"Cherry Tip",description:"لبه‌های قرمز ظریف روی بیس شفاف",finish:"french",shape:"almond",color:"red",length:"medium",base:"#E9C5BB",accent:"#A92441",serviceId:"nail-art" },
  { id:"nail-black-french",title:"فرنچ مشکی",en:"Midnight French",description:"خط مشکی ظریف با فرم مربعی",finish:"french",shape:"square",color:"dark",length:"medium",base:"#D7B7AA",accent:"#29212C",serviceId:"nail-art" },
  { id:"nail-gold-french",title:"فرنچ طلایی",en:"Gilded French",description:"لبه طلایی صیقلی روی زمینه شیری",finish:"french",shape:"oval",color:"nude",length:"medium",base:"#F0DCD2",accent:"#B89148",serviceId:"nail-art" },
  { id:"nail-rose-french",title:"فرنچ صورتی",en:"Rose Tip",description:"لبه رز ملایم و پایه شیشه‌ای",finish:"french",shape:"coffin",color:"pink",length:"long",base:"#F0D4CD",accent:"#C8779B",serviceId:"nail-art" },
  { id:"nail-pearl-chrome",title:"کروم مرواریدی",en:"Pearl Chrome",description:"درخشش صدفی با جلوه مرواریدی",finish:"chrome",shape:"almond",color:"nude",length:"medium",base:"#DDD4D8",accent:"#FFF5EF",serviceId:"nail-art" },
  { id:"nail-rose-chrome",title:"کروم رز",en:"Rose Chrome",description:"درخشش متالیک صورتی ملایم",finish:"chrome",shape:"coffin",color:"pink",length:"long",base:"#BB849B",accent:"#F6C4D5",serviceId:"nail-art" },
  { id:"nail-lavender-chrome",title:"کروم یاسی",en:"Lavender Chrome",description:"بازتاب یاسی سرد و یکدست",finish:"chrome",shape:"almond",color:"color",length:"medium",base:"#9986B6",accent:"#EEE0FF",serviceId:"nail-art" },
  { id:"nail-silver-chrome",title:"کروم نقره‌ای",en:"Silver Mirror",description:"سطح نقره‌ای آینه‌ای با انعکاس لطیف",finish:"chrome",shape:"square",color:"color",length:"medium",base:"#929AA6",accent:"#F8FCFF",serviceId:"nail-art" },
  { id:"nail-pink-ombre",title:"آمبره صورتی",en:"Pink Veil Ombré",description:"تغییر رنگ نرم از صورتی به سفید",finish:"ombre",shape:"almond",color:"pink",length:"long",base:"#D39B9D",accent:"#FFF7EE",serviceId:"nail-art" },
  { id:"nail-peach-ombre",title:"آمبره هلویی",en:"Peach Cloud",description:"هلویی گرم با انتهای شیری",finish:"ombre",shape:"coffin",color:"nude",length:"long",base:"#DFAF9D",accent:"#FFF1E9",serviceId:"nail-art" },
  { id:"nail-berry-ombre",title:"آمبره بری",en:"Berry Fade",description:"ترکیب زرشکی و رز با مرز محو",finish:"ombre",shape:"almond",color:"red",length:"long",base:"#742D52",accent:"#DEA2BE",serviceId:"nail-art" },
  { id:"nail-champagne",title:"اکلیل شامپاینی",en:"Champagne Dust",description:"ریزاکلیل طلایی روی رنگ شیری",finish:"glitter",shape:"oval",color:"nude",length:"medium",base:"#E7CAB0",accent:"#B88A53",serviceId:"nail-art" },
  { id:"nail-rose-glitter",title:"اکلیل رز",en:"Rose Stardust",description:"درخشش رزگلد با پوشش ظریف",finish:"glitter",shape:"almond",color:"pink",length:"medium",base:"#CF8BA0",accent:"#FFE0E3",serviceId:"nail-art" },
  { id:"nail-midnight-glitter",title:"اکلیل شب",en:"Midnight Sparkle",description:"زمینه سورمه‌ای تیره و درخشش نقره‌ای",finish:"glitter",shape:"coffin",color:"dark",length:"long",base:"#242D4A",accent:"#CAD8ED",serviceId:"nail-art" },
  { id:"nail-botanical",title:"گل‌های مینیمال",en:"Botanical Line",description:"نقش گیاهی بسیار ظریف روی پایه کرمی",finish:"art",shape:"oval",color:"nude",length:"medium",base:"#ECDACB",accent:"#879379",serviceId:"nail-art" },
  { id:"nail-modern-lines",title:"خطوط مدرن",en:"Modern Lines",description:"خطوط گرافیکی روی زمینه صورتی",finish:"art",shape:"square",color:"pink",length:"short",base:"#E4B9BA",accent:"#8F536B",serviceId:"nail-art" },
  { id:"nail-marble",title:"مرمر ابری",en:"Soft Marble",description:"طرح مرمری لطیف با خطوط طلایی",finish:"art",shape:"almond",color:"nude",length:"long",base:"#E8DED3",accent:"#AA8B71",serviceId:"nail-art" },
  { id:"nail-sage-garden",title:"باغ زیتونی",en:"Sage Garden",description:"سبز سیج روشن با جزئیات سفید",finish:"art",shape:"oval",color:"color",length:"medium",base:"#97AA9C",accent:"#F5EEE8",serviceId:"nail-art" },
  { id:"nail-lilac-bloom",title:"شکوفه یاسی",en:"Lilac Bloom",description:"یاسی پاستلی با جزئیات ریز",finish:"art",shape:"almond",color:"color",length:"medium",base:"#B9A5CD",accent:"#F6E5F6",serviceId:"nail-art" },
  { id:"nail-cobalt-lines",title:"آبی کبالت",en:"Cobalt Accent",description:"آبی عمیق با خطوط دقیق مینیمال",finish:"art",shape:"coffin",color:"color",length:"long",base:"#325590",accent:"#CFDFF9",serviceId:"nail-art" },
  { id:"pedi-classic-nude",kind:"pedicure",title:"پدیکور نود کلاسیک",en:"Classic Nude Pedicure",description:"فرم طبیعی با پوشش صورتی نود ملایم",finish:"gloss",shape:"square",color:"nude",length:"short",base:"#E1B3A4",accent:"#FAE0D6",serviceId:"classic-pedicure" },
  { id:"pedi-french",kind:"pedicure",title:"پدیکور فرنچ",en:"French Pedicure",description:"فرنچ ظریف سفید روی ناخن‌های مرتب پا",finish:"french",shape:"square",color:"nude",length:"short",base:"#DFB0AC",accent:"#FFFDF4",serviceId:"gel-pedicure" },
  { id:"pedi-ruby",kind:"pedicure",title:"پدیکور قرمز یاقوتی",en:"Ruby Pedicure",description:"رنگ قرمز براق و کلاسیک برای ناخن‌های پا",finish:"gloss",shape:"square",color:"red",length:"short",base:"#A32B36",accent:"#EA8A94",serviceId:"gel-pedicure" },
  { id:"pedi-blush",kind:"pedicure",title:"پدیکور صورتی ملایم",en:"Soft Blush Pedicure",description:"صورتی طبیعی با جلوه تمیز و براق",finish:"gloss",shape:"square",color:"pink",length:"short",base:"#D8A0A0",accent:"#F7D7CF",serviceId:"classic-pedicure" },
  { id:"pedi-lavender",kind:"pedicure",title:"پدیکور یاسی",en:"Lavender Pedicure",description:"رنگ یاسی پاستلی و سبک تابستانی",finish:"gloss",shape:"square",color:"color",length:"short",base:"#AF98D6",accent:"#EFE4FF",serviceId:"gel-pedicure" },
  { id:"pedi-sparkle",kind:"pedicure",title:"پدیکور اکلیلی",en:"Sparkle Pedicure",description:"ریزاکلیل رزگلد برای درخشش ظریف",finish:"glitter",shape:"square",color:"pink",length:"short",base:"#CC9D9C",accent:"#F5DCCB",serviceId:"gel-pedicure" },
  ...NAIL_EXPANSION,
] as const;

export const NAIL_COUNTS = {
  manicure: NAIL_STYLES.filter(style => (style.kind ?? "manicure") === "manicure").length,
  pedicure: NAIL_STYLES.filter(style => style.kind === "pedicure").length,
  total: NAIL_STYLES.length,
} as const;

export const nailById = new Map(NAIL_STYLES.map((style) => [style.id, style]));
