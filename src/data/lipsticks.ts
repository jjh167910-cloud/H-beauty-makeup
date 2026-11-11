/*
 * Lipstick shades and finishes for the try-on's lipstick picker («رژ لب»): any shade, in any
 * finish, on top of any catalog look. A shade is its swatch colour; the engine turns it into
 * lipstick on her lips, matched to her photo's light (see lipChoice in src/lib/makeup-gl.ts).
 */
import type { Finish } from "@/lib/makeup-gl";

export type Lipstick = { id: string; name: string; hex: string; finish: Finish };

export const LIPSTICKS: Lipstick[] = [
  { id: "nude-beige", name: "نود بژ", hex: "#c99582", finish: "satin" },
  { id: "nude-rose", name: "نود صورتی", hex: "#b8766d", finish: "satin" },
  { id: "caramel", name: "کاراملی", hex: "#a2624a", finish: "satin" },
  { id: "chocolate", name: "شکلاتی", hex: "#6f3b2f", finish: "matte" },
  { id: "baby-pink", name: "صورتی روشن", hex: "#e39aa6", finish: "gloss" },
  { id: "rose", name: "رز", hex: "#c9566f", finish: "satin" },
  { id: "fuchsia", name: "سرخابی", hex: "#c1246a", finish: "matte" },
  { id: "peach", name: "هلویی", hex: "#ec8f72", finish: "gloss" },
  { id: "coral", name: "مرجانی", hex: "#e05a4a", finish: "satin" },
  { id: "classic-red", name: "قرمز کلاسیک", hex: "#b3122e", finish: "matte" },
  { id: "cherry", name: "گیلاسی", hex: "#8f1029", finish: "satin" },
  { id: "brick", name: "آجری", hex: "#9b3424", finish: "matte" },
  { id: "wine", name: "شرابی", hex: "#6e1428", finish: "matte" },
  { id: "plum", name: "آلویی", hex: "#5c2140", finish: "matte" },
  { id: "rose-gold", name: "رزگلد", hex: "#c9a0a0", finish: "metallic" },
  { id: "bronze", name: "برنزی", hex: "#9a5a3c", finish: "metallic" },
  { id: "berry-glitter", name: "تمشکی اکلیلی", hex: "#8e2347", finish: "glitter" },
];

export const FINISHES: Array<[Finish, string]> = [
  ["matte", "مات"], ["satin", "ساتن"], ["gloss", "براق"], ["metallic", "متالیک"], ["glitter", "اکلیلی"],
];

export const lipstickById = new Map(LIPSTICKS.map((item) => [item.id, item]));
