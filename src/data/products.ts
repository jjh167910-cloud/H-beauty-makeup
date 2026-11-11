/*
 * The shop's shades for her own makeup («میکاپ من», my-makeup.ts): eyeshadow, liner, blush,
 * highlighter and contour shades, with finishes and placements. The phone engine paints them as
 * pigment over her skin (makeup-gl.ts); the lipsticks are in lipsticks.ts.
 */

export type ShadowFinish = "matte" | "shimmer" | "metallic" | "glitter";
export type ShadowStyle = "wash" | "crease" | "cutcrease" | "halo" | "smoky" | "gradient";
export type BlushStyle = "apples" | "high" | "draped" | "nose" | "under";
export type Shade = { id: string; name: string; hex: string; finish?: ShadowFinish };

export const SHADOWS: Shade[] = [
  { id: "champagne", name: "شامپاینی", hex: "#e9d3b4", finish: "shimmer" },
  { id: "gold", name: "طلایی", hex: "#d4a64a", finish: "metallic" },
  { id: "rose-gold", name: "رزگلد", hex: "#d9a08b", finish: "metallic" },
  { id: "peach", name: "هلویی", hex: "#eea98c", finish: "matte" },
  { id: "copper", name: "مسی", hex: "#b8673f", finish: "metallic" },
  { id: "bronze", name: "برنز", hex: "#9a6a3c", finish: "shimmer" },
  { id: "taupe", name: "تاپ", hex: "#8c7468", finish: "matte" },
  { id: "chocolate", name: "قهوه‌ای شکلاتی", hex: "#5a3a2c", finish: "matte" },
  { id: "mauve", name: "موو", hex: "#a87888", finish: "matte" },
  { id: "plum", name: "آلویی", hex: "#6e3a5a", finish: "matte" },
  { id: "burgundy", name: "شرابی", hex: "#6a1f2e", finish: "matte" },
  { id: "lilac", name: "یاسی", hex: "#b9a0d8", finish: "shimmer" },
  { id: "navy", name: "سرمه‌ای", hex: "#24305e", finish: "matte" },
  { id: "blue", name: "آبی", hex: "#2f6fd6", finish: "matte" },
  { id: "emerald", name: "زمردی", hex: "#1f6b4f", finish: "shimmer" },
  { id: "olive", name: "زیتونی", hex: "#6b6b3a", finish: "metallic" },
  { id: "charcoal", name: "دودی", hex: "#2b2a2c", finish: "matte" },
];

export const SHADOW_FINISHES: Array<[ShadowFinish, string]> = [["matte", "مات"], ["shimmer", "شاین"], ["metallic", "متالیک"], ["glitter", "اکلیلی"]];

/** Eyeshadow placements, each as a makeup artist applied it in one of the catalog photos. */
export const SHADOW_STYLES: Array<[ShadowStyle, string]> = [
  ["wash", "یکدست"], ["crease", "چین پلک"], ["smoky", "دودی"], ["halo", "هالو"], ["cutcrease", "کات‌کریز"], ["gradient", "گرادیانی"],
];

export const LINERS: Shade[] = [
  { id: "black", name: "مشکی", hex: "#141113" },
  { id: "brown", name: "قهوه‌ای", hex: "#4a2c20" },
  { id: "navy", name: "سرمه‌ای", hex: "#1d2a5a" },
  { id: "blue", name: "آبی", hex: "#1f5fd0" },
  { id: "emerald", name: "زمردی", hex: "#0f5a3e" },
  { id: "plum", name: "بنفش", hex: "#4b2a6b" },
  { id: "burgundy", name: "شرابی", hex: "#5a1424" },
  { id: "gold", name: "طلایی", hex: "#b8913f" },
];

export const BLUSHES: Shade[] = [
  { id: "peach", name: "هلویی", hex: "#f2a07f" },
  { id: "coral", name: "مرجانی", hex: "#ef7d6b" },
  { id: "pink", name: "صورتی", hex: "#ee8fa8" },
  { id: "rose", name: "رز", hex: "#d97a8a" },
  { id: "mauve", name: "موو", hex: "#c0788a" },
  { id: "berry", name: "بری", hex: "#b2486a" },
  { id: "terracotta", name: "آجری", hex: "#c0674a" },
  { id: "nude", name: "نود", hex: "#c98d78" },
];

export const BLUSH_STYLES: Array<[BlushStyle, string]> = [
  ["apples", "روی گونه"], ["high", "بالا و کشیده"], ["draped", "تا شقیقه"], ["nose", "گونه و بینی"], ["under", "زیر چشم"],
];

export const HIGHLIGHTERS: Shade[] = [
  { id: "pearl", name: "مرواریدی", hex: "#f4ece6" },
  { id: "champagne", name: "شامپاینی", hex: "#f3dcb8" },
  { id: "gold", name: "طلایی", hex: "#e8c27a" },
  { id: "rose-gold", name: "رزگلد", hex: "#eab7a0" },
  { id: "bronze", name: "برنز", hex: "#c88f5e" },
];

