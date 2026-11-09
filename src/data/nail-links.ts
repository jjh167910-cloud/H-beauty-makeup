import { nailById, type NailKind } from "./nail-styles";

/**
 * Shareable, static-host-compatible links. Every style opens through the
 * existing hash router, so no special server route or network is required.
 */
export function nailStyleFromHash(hash: string): string | null {
  if (!hash.startsWith("#/nails?")) return null;
  const search = hash.slice("#/nails?".length);
  const id = new URLSearchParams(search).get("style");
  if (!id || id.length > 90 || !/^(nail|pedi)-[a-z0-9-]+$/.test(id)) return null;
  return nailById.has(id) ? id : null;
}

/**
 * The gallery also preserves the selected category when a shared pedicure
 * detail is dismissed, including after a reload or browser Back.
 */
export function nailKindFromHash(hash: string): NailKind {
  const id = nailStyleFromHash(hash);
  if (id) return nailById.get(id)?.kind === "pedicure" ? "pedicure" : "manicure";
  if (hash.startsWith("#/nails?")) {
    const query = new URLSearchParams(hash.slice("#/nails?".length));
    if (query.get("kind") === "pedicure") return "pedicure";
  }
  return "manicure";
}

export function nailStyleShareUrl(styleId: string, currentUrl: string): string {
  if (!nailById.has(styleId)) throw new Error("Unknown Nail Atelier reference");
  const target = new URL(currentUrl);
  // No campaign/tracking query parameters in an intentionally shared link.
  target.search = "";
  target.hash = `/nails?style=${encodeURIComponent(styleId)}`;
  return target.toString();
}
