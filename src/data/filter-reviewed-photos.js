/** Exclude confirmed visual mismatches from both rendering and photo-only counts.
 * Original bytes remain locked for provenance. Re-enabling requires a new review.
 */
export function filterReviewedPhotos(photos, quarantined) {
  const blocked = new Set(quarantined.map(entry => entry.id));
  return Object.fromEntries(Object.entries(photos).filter(([id]) => !blocked.has(id)));
}
