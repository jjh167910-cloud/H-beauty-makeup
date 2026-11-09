import { persian } from "./catalog";

/*
 * Salon content. Prices, team and contact details are editable placeholders —
 * verify them with the salon before publishing.
 */
export const SALON = {
  name: "حنانه بیوتی",
  latin: "HANANEH BEAUTY",
  city: "تهران، الهیه",
  address: "برج پالادیوم، طبقه چهارم",
  mapsQuery: "Palladium Tower Elahieh Tehran",
  /** International format without +, e.g. "989121234567". Empty hides the WhatsApp button. */
  whatsapp: "",
  /** Dialable number, e.g. "+982112345678". Empty hides the call button. */
  phone: "",
  instagram: "",
  /** Opening hours in Tehran time; Friday (5) closed. */
  openDays: [6, 0, 1, 2, 3, 4],
  openHour: 10,
  closeHour: 19,
};

export type ServiceCategory = "cut" | "color" | "care" | "styling" | "bridal" | "beauty" | "nails";

export const SERVICE_CATEGORIES: Array<{ key: ServiceCategory; label: string; en: string }> = [
  { key: "cut", label: "کوتاهی و فرم", en: "CUT & SHAPE" },
  { key: "color", label: "رنگ و لایت", en: "COLOUR" },
  { key: "care", label: "مراقبت و احیا", en: "TREATMENTS" },
  { key: "styling", label: "استایل و براشینگ", en: "STYLING" },
  { key: "bridal", label: "عروس", en: "BRIDAL" },
  { key: "beauty", label: "میکاپ و ابرو", en: "MAKEUP & BROWS" },
  { key: "nails", label: "مانیکور و پدیکور", en: "NAIL ATELIER" },
];

export type Service = {
  id: string;
  category: ServiceCategory;
  title: string;
  en: string;
  detail: string;
  includes: string[];
  minutes: number;
  /** Starting price in toman; null means priced after consultation. */
  price: number | null;
  popular?: boolean;
};

export const SERVICES: Service[] = [
  {
    id: "signature-cut",
    category: "cut",
    title: "کوپ و فرم‌دهی اختصاصی",
    en: "SIGNATURE CUT",
    detail: "مشاوره فرم چهره، شست‌وشو و استایل نهایی",
    includes: ["مشاوره فرم چهره و جنس مو", "شست‌وشو و ماساژ سر", "کوتاهی دقیق", "براشینگ نهایی"],
    minutes: 60,
    price: 980_000,
    popular: true,
  },
  {
    id: "fringe-refresh",
    category: "cut",
    title: "اصلاح چتری و فرم",
    en: "FRINGE REFRESH",
    detail: "تمیزکاری فرم و چتری بین دو کوپ",
    includes: ["اصلاح چتری", "تمیزکاری سرشاخه", "حالت‌دهی سریع"],
    minutes: 30,
    price: 380_000,
  },
  {
    id: "bespoke-balayage",
    category: "color",
    title: "بالیاژ و لایت سفارشی",
    en: "BESPOKE BALAYAGE",
    detail: "فرمول‌سازی شخصی، باند بیلدر و تونینگ لوکس",
    includes: ["تست و فرمول‌سازی رنگ", "بالیاژ دست‌آزاد", "باند بیلدر حین رنگ", "تونینگ و براشینگ"],
    minutes: 180,
    price: 3_900_000,
    popular: true,
  },
  {
    id: "root-colour",
    category: "color",
    title: "رنگ ریشه",
    en: "ROOT COLOUR",
    detail: "پوشش یکدست ریشه با رنگ هماهنگ",
    includes: ["رنگ ریشه", "شست‌وشو و ماسک", "سشوار"],
    minutes: 90,
    price: 1_400_000,
  },
  {
    id: "gloss-toner",
    category: "color",
    title: "گلاس و تونر",
    en: "GLOSS & TONE",
    detail: "درخشش آینه‌ای و اصلاح ته‌رنگ",
    includes: ["تونر اختصاصی", "گلاس براق‌کننده", "براشینگ"],
    minutes: 60,
    price: 1_100_000,
  },
  {
    id: "keratin",
    category: "care",
    title: "کراتین و صافی",
    en: "KERATIN SMOOTHING",
    detail: "کاهش وز و صافی ماندگار با فرمول ملایم",
    includes: ["شست‌وشوی عمقی", "اجرای کراتین", "اتوکشی و تثبیت"],
    minutes: 150,
    price: 3_200_000,
    popular: true,
  },
  {
    id: "repair-ritual",
    category: "care",
    title: "ریچوال ترمیم عمقی",
    en: "REPAIR RITUAL",
    detail: "احیای موهای آسیب‌دیده با پروتئین و آبرسان",
    includes: ["آنالیز مو", "ماسک ترمیمی گرم", "ماساژ پوست سر", "براشینگ"],
    minutes: 60,
    price: 850_000,
  },
  {
    id: "blowout",
    category: "styling",
    title: "براشینگ امضادار",
    en: "SIGNATURE BLOWOUT",
    detail: "حجم نرم و درخشش ماندگار",
    includes: ["شست‌وشو", "براشینگ حجم یا صاف", "اسپری محافظ"],
    minutes: 45,
    price: 550_000,
  },
  {
    id: "event-styling",
    category: "styling",
    title: "استایل مراسم",
    en: "EVENT STYLING",
    detail: "استایل ماندگار برای مهمانی، عکاسی و مراسم",
    includes: ["مشاوره با رفرنس", "شینیون یا موج", "تثبیت ماندگار"],
    minutes: 75,
    price: 1_200_000,
    popular: true,
  },
  {
    id: "bridal-signature",
    category: "bridal",
    title: "پکیج امضای عروس",
    en: "BRIDAL SIGNATURE",
    detail: "تست مو، شینیون و همراهی روز مراسم",
    includes: ["جلسه تست کامل", "شینیون روز مراسم", "میکاپ عروس", "همراهی آرتیست"],
    minutes: 240,
    price: null,
  },
  {
    id: "natural-makeup",
    category: "beauty",
    title: "میکاپ نچرال روزانه",
    en: "NATURAL MAKEUP",
    detail: "پوست شفاف و سبک با ابرو و لب طبیعی",
    includes: ["آماده‌سازی پوست", "کرم‌پودر سبک", "ابرو و ریمل", "رژ نچرال"],
    minutes: 45,
    price: 950_000,
  },
  {
    id: "brow-design",
    category: "beauty",
    title: "طراحی و فرم ابرو",
    en: "BROW DESIGN",
    detail: "فرم‌دهی متناسب با چهره و حالت‌دهی",
    includes: ["مشاوره فرم ابرو", "اصلاح و تمیزکاری", "حالت‌دهی با ژل"],
    minutes: 30,
    price: 450_000,
  },
  {
    id: "event-makeup",
    category: "beauty",
    title: "میکاپ مجلسی",
    en: "EVENT MAKEUP",
    detail: "میکاپ سبک یا گلم متناسب با پوست و استایل",
    includes: ["آماده‌سازی پوست", "میکاپ کامل", "مژه موقت"],
    minutes: 75,
    price: 1_600_000,
  },
  // Nail atelier. New prices are intentionally consultation-only until approved.
  {
    id: "classic-manicure",
    category: "nails",
    title: "مانیکور کلاسیک",
    en: "CLASSIC MANICURE",
    detail: "فرم‌دهی و مرتب‌سازی ناخن طبیعی با مراقبت دست",
    includes: ["بررسی وضعیت ناخن", "فرم‌دهی ناخن", "مراقبت کوتیکول", "مرطوب‌سازی دست"],
    minutes: 45,
    price: null,
  },
  {
    id: "gel-manicure",
    category: "nails",
    title: "مانیکور و ژلیش",
    en: "GEL MANICURE",
    detail: "مانیکور مرتب و لاک ژل با رنگ انتخابی",
    includes: ["فرم‌دهی و آماده‌سازی", "لاک ژل", "روغن کوتیکول", "مراقبت پایانی"],
    minutes: 75,
    price: null,
  },
  {
    id: "classic-pedicure",
    category: "nails",
    title: "پدیکور کلاسیک",
    en: "CLASSIC PEDICURE",
    detail: "مراقبت زیبایی پا و مرتب‌سازی ناخن‌های پا",
    includes: ["بررسی ظاهری پا و ناخن", "پاک‌سازی و فرم‌دهی", "مراقبت ملایم پوست", "مرطوب‌سازی"],
    minutes: 60,
    price: null,
  },
  {
    id: "spa-pedicure",
    category: "nails",
    title: "پدیکور اسپا",
    en: "SPA PEDICURE",
    detail: "پدیکور آرامش‌بخش همراه با ماساژ و رطوبت‌رسانی",
    includes: ["شست‌وشوی بهداشتی", "فرم‌دهی ناخن", "لایه‌برداری ملایم", "ماساژ و رطوبت‌رسانی"],
    minutes: 75,
    price: null,
  },
  {
    id: "gel-pedicure",
    category: "nails",
    title: "پدیکور و ژلیش",
    en: "GEL PEDICURE",
    detail: "پدیکور همراه با لاک ژل و رنگ انتخابی",
    includes: ["آماده‌سازی و فرم‌دهی", "مراقبت ملایم پوست پا", "لاک ژل", "مراقبت پایانی"],
    minutes: 75,
    price: null,
  },
  {
    id: "nail-strengthening",
    category: "nails",
    title: "تقویت و کاور ناخن",
    en: "NAIL OVERLAY",
    detail: "کاور زیبایی ناخن طبیعی بر اساس وضعیت آن",
    includes: ["مشاوره ناخن", "آماده‌سازی سطح", "کاور مناسب", "فرم‌دهی و پرداخت"],
    minutes: 75,
    price: null,
  },
  {
    id: "nail-art",
    category: "nails",
    title: "طراحی ناخن",
    en: "NAIL ART",
    detail: "فرنچ، کروم یا طرح دلخواه؛ مدت و هزینه با طرح تغییر می‌کند",
    includes: ["انتخاب طرح و رنگ", "اجرای جزئیات", "فینیش نهایی"],
    minutes: 30,
    price: null,
  },
  {
    id: "gel-removal",
    category: "nails",
    title: "ریموو ژل",
    en: "GEL REMOVAL",
    detail: "برداشتن ژل و مراقبت پایانی بدون کندن پوشش",
    includes: ["بررسی نوع پوشش", "ریموو متناسب", "فرم‌دهی ملایم", "روغن کوتیکول"],
    minutes: 30,
    price: null,
  },
  {
    id: "luxe-manicure",
    category: "nails",
    title: "مانیکور لوکس",
    en: "LUXE MANICURE",
    detail: "فرم‌دهی، کوتیکول و لاک ژل",
    includes: ["فرم‌دهی ناخن", "کوتیکول", "لاک ژل", "ماساژ دست"],
    minutes: 60,
    price: 650_000,
  },
];

export const serviceById = new Map(SERVICES.map((service) => [service.id, service]));

export type Stylist = {
  id: string;
  name: string;
  role: string;
  focus: ServiceCategory[];
  tone: string;
};

export const ANY_STYLIST = "any";

export const STYLISTS: Stylist[] = [
  { id: "hananeh", name: "حنانه", role: "مدیر هنری · مستر استایلیست", focus: ["cut", "styling", "bridal"], tone: "from-[#c9a46c] to-[#7a5a33]" },
  { id: "sara", name: "سارا", role: "کالریست ارشد", focus: ["color", "care"], tone: "from-[#d9a99a] to-[#8f5a4c]" },
  { id: "negar", name: "نگار", role: "متخصص مراقبت و کراتین", focus: ["care", "styling"], tone: "from-[#a9bfae] to-[#4f6a5b]" },
  { id: "mahsa", name: "مهسا", role: "آرتیست میکاپ و ناخن", focus: ["beauty", "bridal", "nails"], tone: "from-[#c7b4d6] to-[#6d5781]" },
];

export const stylistById = new Map(STYLISTS.map((stylist) => [stylist.id, stylist]));

export function stylistName(id: string) {
  return stylistById.get(id)?.name ?? "اولین آرتیست در دسترس";
}

/* ---------- formatting ---------- */

export function formatPrice(toman: number | null) {
  if (toman == null) return "پس از مشاوره";
  if (toman >= 1_000_000) {
    const value = Math.round((toman / 1_000_000) * 10) / 10;
    return `${persian(value)} میلیون`;
  }
  return `${persian(Math.round(toman / 1000))} هزار`;
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${persian(rest)} دقیقه`;
  if (!rest) return `${persian(hours)} ساعت`;
  return `${persian(hours)} ساعت و ${persian(rest)} دقیقه`;
}

export function summarize(ids: string[]) {
  const items = ids.map((id) => serviceById.get(id)).filter((item): item is Service => Boolean(item));
  const minutes = items.reduce((sum, item) => sum + item.minutes, 0);
  const priced = items.filter((item) => item.price != null);
  const price = priced.reduce((sum, item) => sum + (item.price ?? 0), 0);
  return { items, minutes, price, hasUnpriced: priced.length < items.length };
}

/* ---------- dates (Persian calendar, Tehran time) ---------- */

const TZ = "Asia/Tehran";
const weekdayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "short", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Current wall-clock parts in Tehran. */
export function tehranNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    hour: Number(parts.hour),
  };
}

function isoToUtc(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

export function weekdayOf(iso: string) {
  return isoToUtc(iso).getUTCDay();
}

export function isOpenDay(iso: string) {
  return SALON.openDays.includes(weekdayOf(iso));
}

export function upcomingDays(count = 21) {
  const start = isoToUtc(tehranNow().iso);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000);
    const iso = date.toISOString().slice(0, 10);
    return {
      iso,
      weekday: index === 0 ? "امروز" : index === 1 ? "فردا" : weekdayFmt.format(date),
      day: dayFmt.format(date),
      month: monthFmt.format(date),
      open: isOpenDay(iso),
    };
  });
}

export function longDate(iso: string) {
  return longFmt.format(isoToUtc(iso));
}

export function monthOf(iso: string) {
  return monthFmt.format(isoToUtc(iso));
}

export function dayOf(iso: string) {
  return dayFmt.format(isoToUtc(iso));
}

export function shortWeekday(iso: string) {
  return weekdayFmt.format(isoToUtc(iso));
}

export function timeLabel(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${persian(hour)}:${minute ? persian(minute) : "۰۰"}`;
}

/** Start times that let the whole appointment finish before closing. */
export function slotsFor(iso: string, minutes: number) {
  if (!isOpenDay(iso)) return [];
  const now = tehranNow();
  const length = Math.max(30, minutes);
  const slots: Array<{ time: string; part: "morning" | "afternoon" | "evening" }> = [];
  for (let start = SALON.openHour * 60; start + length <= SALON.closeHour * 60; start += 30) {
    if (iso === now.iso && start < now.minutes + 60) continue;
    const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    slots.push({ time, part: start < 12 * 60 ? "morning" : start < 16 * 60 ? "afternoon" : "evening" });
  }
  return slots;
}

export function isPast(iso: string, time: string) {
  const now = tehranNow();
  if (iso !== now.iso) return iso < now.iso;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute < now.minutes;
}

export function openStatus() {
  const now = tehranNow();
  const openToday = isOpenDay(now.iso);
  if (openToday && now.minutes >= SALON.openHour * 60 && now.minutes < SALON.closeHour * 60) {
    return { open: true, label: `باز است · تا ساعت ${persian(SALON.closeHour)}` };
  }
  if (openToday && now.minutes < SALON.openHour * 60) {
    return { open: false, label: `بسته · امروز از ساعت ${persian(SALON.openHour)}` };
  }
  return { open: false, label: `بسته · ${isOpenDay(upcomingDays(2)[1].iso) ? "فردا" : "شنبه"} از ساعت ${persian(SALON.openHour)}` };
}

export function greeting() {
  const { hour } = tehranNow();
  if (hour < 5) return "شب بخیر";
  if (hour < 12) return "صبح بخیر";
  if (hour < 17) return "روز بخیر";
  return "عصر بخیر";
}

/* ---------- phone ---------- */

export function latinDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function normalizePhone(value: string) {
  const digits = latinDigits(value).replace(/[\s\-()]/g, "");
  const match = digits.match(/^(?:\+98|0098|0)?(9\d{9})$/);
  return match ? `0${match[1]}` : null;
}
