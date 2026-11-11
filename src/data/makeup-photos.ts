/**
 * Styles that have a photo in public/makeup/looks/ (full, sm/, eyes/ and lips/).
 * Photos are AI-generated samples (Grok Imagine edits of lookbook portrait 198)
 * framed from face landmarks; replace them with the salon's own shoot when
 * available. Only listed styles appear in the catalog.
 */
export const MAKEUP_PHOTOS: readonly string[] = [
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

const READY = new Set(MAKEUP_PHOTOS);

export function hasPhoto(id: string) {
  return READY.has(id);
}

export function lookPhoto(id: string, size: "full" | "sm" | "eyes" | "lips" = "full") {
  return size === "full" ? `/makeup/looks/${id}.webp` : `/makeup/looks/${size}/${id}.webp`;
}
