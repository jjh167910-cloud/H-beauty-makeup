import { CURATED_MAKEUP_40 } from "./makeup-curated-40";
import { CURATED_MAKEUP_43_82 } from "./makeup-curated-43-82";

/**
 * Styles that have a photo in public/makeup/looks/ (full, sm/, eyes/ and lips/).
 * Photos are AI-generated samples (Grok Imagine edits of lookbook portrait 198)
 * framed from face landmarks; replace them with the salon's own shoot when
 * available. Only listed styles appear in the catalog.
 */
const LEGACY_MAKEUP_PHOTOS: readonly string[] = [
  "no-makeup",
  "clean-girl",
  "sun-kissed",
  "cold-girl",
  "soft-glam",
  "latte",
  "strawberry",
  "full-glam",
  "hollywood",
  "arabic-glam",
  "bronzed-goddess",
  "golden-hour",
  "bold-glam",
  "cut-crease",
  "classic-smokey",
  "brown-smokey",
  "plum-smokey",
  "emerald-night",
  "navy-smokey",
  "siren-eyes",
  "cat-eye",
  "fox-eye",
  "graphic-liner",
  "colour-liner",
  "classic-bride",
  "persian-bride",
  "romantic-bride",
  "boho-bride",
  "aqd",
  "henna-night",
  "sunset",
  "pastel",
  "monochrome",
  "glitter-party",
  "rhinestone",
  "electric-blue",
  "pin-up",
  "mod-60s",
  "nineties",
  "twenties",
  "k-beauty",
  "douyin",
];

/** Real user-uploaded photo collections; retained as a separate opt-in edition. */
export const MAKEUP_CURATED_80 = import.meta.env.VITE_MAKEUP_CURATED_80 === "true";
const CURATED_PHOTOS = [...CURATED_MAKEUP_40, ...CURATED_MAKEUP_43_82].map((item) => item.id);
export const MAKEUP_PHOTOS: readonly string[] = MAKEUP_CURATED_80 ? CURATED_PHOTOS : LEGACY_MAKEUP_PHOTOS;
// Include legacy photo IDs in lookups so existing favorites and booking history survive.
const READY = new Set([...LEGACY_MAKEUP_PHOTOS, ...CURATED_PHOTOS]);


export function hasPhoto(id: string) {
  return READY.has(id);
}

export function lookPhoto(id: string, size: "full" | "sm" | "eyes" | "lips" = "full") {
  if (/^mk40-\d{2}$/.test(id) || /^mk80-(?:4[3-9]|[5-7]\d|8[0-2])$/.test(id)) {
    const set=id.startsWith("mk40-")?"curated-40":"curated-80";
    const stem="/makeup/"+set+"/"+(size==="full"?"":"sm/")+id+".webp";
    return stem;
  }
  return size === "full" ? `/makeup/looks/${id}.webp` : `/makeup/looks/${size}/${id}.webp`;
}
