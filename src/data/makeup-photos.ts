/**
 * Each look's catalog photo: public/makeup/looks/<id>.webp (full size, the engine's source: scripts/tinybeauty) and
 * sm/<id>.webp (the try-on's look rail before her face is ready). AI-generated samples (Grok Imagine edits of one
 * lookbook portrait), framed from face landmarks; replace them with the salon's own shoot when available.
 */
export function lookPhoto(id: string, size: "full" | "sm" = "full") {
  return size === "full" ? `/makeup/looks/${id}.webp` : `/makeup/looks/${size}/${id}.webp`;
}
