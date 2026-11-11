/*
 * A tutorial step (what to use, which tool and how) and the how-to texts per brow, eyeshadow, liner,
 * lash and blush style, used by her own makeup's steps and tutorial (my-makeup.ts); the try-on
 * engine reveals the makeup one zone at a time to match (stepGeometry in lib/makeup-gl.ts).
 */
import type { StepKey } from "@/lib/makeup-gl";
import type { Blush, Brow, Lashes, Liner, Shadow } from "./makeup-styles";

/** The drawing of the tool on the guide. */
export type Tool = "sponge" | "brush" | "fluffy" | "angled" | "pencil" | "liner" | "wand" | "fan" | "lipstick" | "gloss" | "finger";

export type Step = {
  key: StepKey;
  title: string;
  en: string;
  product: string;
  /** Product colours for the swatches (empty: her own skin tone, shown by the screen). */
  colors: string[];
  tool: string;
  draw: Tool;
  how: string;
  tip?: string;
  /** Shown only as a guide: the try-on keeps her own brows. */
  guideOnly?: boolean;
};

export const BROWS: Record<Brow, { product: string; how: string }> = {
  natural: { product: "ژل ابروی شفاف یا رنگی", how: "موها را با برس رو به بالا شانه کنید و فقط جاهای خالی را با ضربه‌های کوتاه و مو‌مانند پر کنید." },
  bold: { product: "پماد یا مداد ابرو، یک درجه روشن‌تر از موی ابرو", how: "زیر ابرو را از وسط تا دم با خط نرم مشخص کنید، داخلش را پر کنید و ابتدای ابرو را کم‌رنگ و محو بگذارید." },
  lifted: { product: "صابون یا ژل لیفت ابرو", how: "موها را صاف رو به بالا و کمی رو به بیرون شانه کنید و چند ثانیه نگه دارید تا ثابت شوند." },
  thin: { product: "مداد ابروی نوک‌باریک", how: "فرم باریک ابرو را با خط‌های بسیار کوتاه دنبال کنید و دم ابرو را تیز و کشیده تمام کنید." },
};

export const SHADOW: Record<Exclude<Shadow, "none">, { name: string; how: string }> = {
  wash: { name: "سایه یک‌رنگ", how: "رنگ را با براش تخت روی کل پلک متحرک بزنید و لبه‌ها را با براش پخش‌کن نرم کنید." },
  crease: { name: "سایه با عمق در چین پلک", how: "رنگ روشن روی پلک؛ رنگ تیره را با حرکت رفت‌وبرگشتی (شیشه‌پاک‌کنی) در چین پلک بزنید و گوشه بیرونی را عمیق‌تر کنید." },
  cutcrease: { name: "کات‌کریز", how: "رنگ تیره را در چین پلک محو کنید، چشم را باز نگه دارید و با کانسیلر مرز تیزی بالای پلک متحرک بکشید؛ رنگ روشن را روی آن بزنید." },
  halo: { name: "هالو", how: "گوشه داخلی و بیرونی را تیره کنید و وسط پلک رنگ روشن یا شاین بزنید؛ مرز بین آن‌ها را نرم کنید." },
  smoky: { name: "سایه دودی", how: "رنگ تیره را نزدیک ریشه مژه‌ها بزنید و با حرکت دایره‌ای رو به بالا و بیرون محو کنید تا مرزی دیده نشود؛ زیر چشم هم کمی دودی کنید." },
  gradient: { name: "سایه گرادیانی", how: "رنگ روشن را در گوشه داخلی و رنگ تیره را در گوشه بیرونی بزنید؛ وسط پلک دو رنگ را در هم محو کنید." },
};

export const LINER: Record<Exclude<Liner, "none">, { name: string; how: string; draw: Tool; product?: string }> = {
  thin: { name: "خط پشت پلک نازک", how: "خط نازکی از گوشه داخلی تا بیرونی، تا حد ممکن نزدیک ریشه مژه‌ها بکشید.", draw: "liner" },
  wing: { name: "خط چشم بال‌دار", how: "از گوشه بیرونی یک خط کوتاه رو به دم ابرو بکشید، سرش را به وسط پلک وصل کنید و داخل مثلث را پر کنید.", draw: "liner" },
  fox: { name: "خط کشیده رو به بالا", how: "بال را کشیده و رو به شقیقه ببرید و گوشه داخلی را کمی پایین بکشید تا چشم کشیده‌تر شود.", draw: "liner" },
  double: { name: "خط چشم دوبل", how: "یک خط بال‌دار معمولی بکشید و خط دوم را روی چین پلک، موازی آن، رسم کنید.", draw: "liner" },
  graphic: { name: "خط گرافیکی", how: "روی چین پلک یک خط تیز دنبال کنید و دو سرش را به بال بیرونی وصل کنید.", draw: "liner" },
  puppy: { name: "خط رو به پایین", how: "دم خط را هم‌جهت پلک پایین، کمی رو به پایین، بکشید تا چشم گرد و معصوم شود.", draw: "pencil", product: "مداد چشم قهوه‌ای" },
  smudge: { name: "خط محو و دودی", how: "مداد را نزدیک ریشه مژه‌ها بکشید و پیش از خشک شدن با براش کوچک محو کنید.", draw: "pencil", product: "مداد چشم نرم (کژال)" },
  siren: { name: "خط سایرن", how: "گوشه داخلی را تیز و رو به پایین بکشید و بال بیرونی را کشیده و صاف نگه دارید.", draw: "liner" },
};

export const LASHES: Record<Lashes, { product: string; how: string }> = {
  natural: { product: "ریمل حجم‌دهنده", how: "مژه‌ها را با فرمژه فر کنید؛ برس را از ریشه با حرکت زیگزاگ رو به نوک بکشید." },
  volume: { product: "ریمل حجیم + چند مژه تکی در گوشه بیرونی", how: "پس از فر کردن دو لایه ریمل بزنید و چند مژه تکی را در گوشه بیرونی، نزدیک ریشه، بچسبانید." },
  dramatic: { product: "مژه مصنوعی نواری + ریمل", how: "چسب را روی نوار بزنید، ۳۰ ثانیه صبر کنید تا کمی خشک شود و نوار را از وسط روی ریشه مژه‌ها بچسبانید." },
};

export const BLUSH: Record<Exclude<Blush, "none">, string> = {
  apples: "لبخند بزنید و رنگ را روی برجستگی گونه با حرکت دایره‌ای بزنید.",
  high: "رنگ را بالای استخوان گونه بزنید و رو به شقیقه کشیده و محو کنید.",
  draped: "رنگ را از بالای گونه به شکل C تا شقیقه و کنار چشم بکشید.",
  nose: "روی گونه‌ها بزنید و با ته‌مانده براش یک بار روی تیغه بینی بکشید؛ مثل آفتاب‌خوردگی.",
  under: "رنگ را درست زیر چشم و بالای گونه بزنید و نرم محو کنید؛ چهره کیوت و جوان می‌شود.",
};
