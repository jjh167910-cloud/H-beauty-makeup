import { useEffect, useState } from "react";
import { NAIL_STYLES, type NailStyle } from "@/data/nail-styles";
import photoReview from "@/data/nail-photo-review.json";
import { filterReviewedPhotos } from "@/data/filter-reviewed-photos.js";
import photoQuality from "@/data/nail-photo-quality.json";
import { NailPreview } from "./nail-preview";
import { PedicurePreview } from "./pedicure-preview";

/**
 * An optional, quality-reviewed editorial WebP collection; missing assets
 * fall back to local vectors and never break offline navigation.
 */
/**
 * Nail Atelier editorial quality policy.
 * The V3 ZIP has 34 WebP files, but only nine sources have individual/native
 * crops of at least 600px AND a matching visible finish. The others derive
 * from small contact sheets (some as little as 186px) or resemble other looks.
 * Keep those styles on their accurate, sharp SVG design illustrations.
 *
 * This is deliberate: upscaling a tiny reference is not real photographic
 * detail, and mildly recoloring an existing nail pose does not create a new
 * genuine style. None are claimed to be photographs of the salon's work.
 */
const quality: Record<string, { native: number; photo: boolean; reason?: string }> = photoQuality.styles;

const BASE_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string, string>> =
  import.meta.env.VITE_NAIL_EDITORIAL_V2 === "true"
    ? Object.fromEntries(Object.entries(quality)
        .filter(([id, q]) =>
          q.photo && q.native >= 600 &&
          (id !== "nail-marble" || import.meta.env.VITE_NAIL_EDITORIAL_V3 === "true"))
        .map(([id]) => [id, `/nails/photos/${id}.webp`]))
    : {
      "nail-milky-silk": "/nails/photos/nail-milky-silk.webp",
      "nail-classic-french": "/nails/photos/nail-classic-french.webp",
      "nail-ruby-red": "/nails/photos/nail-ruby-red.webp",
      "nail-pearl-chrome": "/nails/photos/nail-pearl-chrome.webp",
    };

// Independent one-photo release; never expands or alters the V4 nine-photo whitelist.
const MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> = {
  ...BASE_MANICURE_EDITORIAL_PHOTOS,
  ...(import.meta.env.VITE_MANICURE_MIDNIGHT_GLITTER === "true"
    ? { "nail-midnight-glitter": "/nails/photos/nail-midnight-glitter.webp" }
    : {})
};

// Added only after all four original WebPs pass the build's SHA-256 release gate.
const FOUR_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  import.meta.env.VITE_MANICURE_FOUR === "true"
    ? Object.fromEntries(["nail-atlas-botanical-ruby","nail-atlas-botanical-espresso","nail-lavender-chrome","nail-silver-chrome"]
        .map(id=>[id,`/nails/photos/${id}.webp`]))
    : {};


/** Distinct, 1600px batch7 photos exposed only by the validated build flag. */
const BATCH7_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  import.meta.env.VITE_MANICURE_BATCH7 === "true"
    ? Object.fromEntries(["nail-micro-french","nail-black-french","nail-cherry-french","nail-pink-ombre","nail-peach-ombre","nail-atlas-geometry-ivory","nail-atlas-foil-ivory"]
        .map(id=>[id,`/nails/photos/${id}.webp`]))
    : {};

/** Eight verified originals. Shown only when the whole batch8 build passed. */
const BATCH8_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  import.meta.env.VITE_MANICURE_BATCH8 === "true"
    ? Object.fromEntries(["nail-atlas-geometry-champagne","nail-atlas-botanical-pearl","nail-gold-french","nail-champagne","nail-rose-glitter","nail-modern-lines","nail-atlas-velvet-ruby","nail-atlas-velvet-champagne"]
        .map(id=>[id,`/nails/photos/${id}.webp`]))
    : {};

/** Verified 50-candidate review Batch A; ten images met quality requirements. */
const BATCH50_A_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  import.meta.env.VITE_MANICURE_BATCH50_A === "true"
    ? Object.fromEntries(["nail-atlas-gradient-merlot","nail-atlas-prism-blush","nail-atlas-prism-champagne","nail-atlas-prism-coral","nail-atlas-prism-midnight","nail-atlas-prism-pearl","nail-atlas-prism-sage","nail-atlas-velvet-blush","nail-atlas-velvet-coral","nail-atlas-velvet-midnight"].map(id=>[id,`/nails/photos/${id}.webp`]))
    : {};

/** Batch50B is published only when all nine originals pass the production lock. */
const BATCH50_B_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  import.meta.env.VITE_MANICURE_BATCH50_B === "true"
    ? Object.fromEntries(["nail-atlas-modern-french-espresso","nail-atlas-foil-cobalt","nail-atlas-modern-french-merlot","nail-atlas-modern-french-sage","nail-atlas-modern-french-lavender","nail-rose-french","nail-atlas-magnetic-midnight","nail-atlas-magnetic-coral","nail-atlas-magnetic-pearl"]
        .map(id=>[id,`/nails/photos/${id}.webp`]))
    : {};


/** Batch50C native editorial images, enabled only by the complete verified release. */
const BATCH50_C_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  import.meta.env.VITE_MANICURE_BATCH50_C === "true"
    ? Object.fromEntries(["nail-atlas-magnetic-espresso","nail-atlas-magnetic-sage","nail-atlas-geometry-blush","nail-atlas-prism-ivory","nail-atlas-gradient-pearl","nail-atlas-gradient-lavender","nail-atlas-gradient-ruby","nail-atlas-gradient-cobalt"].map(id=>[id,`/nails/photos/${id}.webp`]))
    : {};


/** Native 1600px, quality-reviewed Batch50D; enabled only after SHA-locked build. */
const BATCH50_D_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  import.meta.env.VITE_MANICURE_BATCH50_D === "true"
    ? Object.fromEntries(["nail-berry-ombre","nail-atlas-velvet-ivory"]
        .map(id=>[id,`/nails/photos/${id}.webp`]))
    : {};

/** Newly approved manuscript-based batches; the production build injects only
 * ID values whose individual original bytes and all-offline packaging pass. */
const FUTURE_MANICURE_EDITORIAL_PHOTOS: Readonly<Record<string,string>> =
  Object.fromEntries(
    String(import.meta.env.VITE_MANICURE_DYNAMIC_IDS || "")
      .split(",").filter(id=>/^nail-[a-z0-9-]+$/.test(id))
      .map(id=>[id,`/nails/photos/${id}.webp`])
  );

/**
 * Temporary owner-selected publication of 146 intact source originals.
 * The build guarantees SHA-256, 1600px, exact ID mapping and the owner grant.
 * This is not an assertion that these photographs passed the separate full
 * professional editorial/anatomy QA gate. Preserve the immutable review ledger.
 */
const OWNER_SELECTED_TEMPORARY_MANICURE_PHOTOS: Readonly<Record<string,string>> =
  Object.fromEntries(
    String(import.meta.env.VITE_MANICURE_OWNER_VISIBLE_IDS || "")
      .split(",").filter(id=>/^nail-[a-z0-9-]+$/.test(id))
      .map(id=>[id,`/review/photos/${id}.webp`])
  );

/** Only the complete, SHA-locked 78-image release may enable these URLs.
 * Missing/mismatched files keep the vector artwork in place.
 */
const PEDICURE_EDITORIAL_PHOTOS: Record<string,string> =
  import.meta.env.VITE_PEDICURE_78 === "true"
    ? Object.fromEntries(NAIL_STYLES
        .filter(style => style.kind === "pedicure")
        .map(style => [style.id, `/nails/photos/${style.id}.webp`]))
    : {};

export const NAIL_EDITORIAL_PHOTOS: Readonly<Record<string,string>> = filterReviewedPhotos({
  ...MANICURE_EDITORIAL_PHOTOS,
  ...FOUR_MANICURE_EDITORIAL_PHOTOS,
  ...BATCH7_MANICURE_EDITORIAL_PHOTOS,
  ...BATCH50_A_MANICURE_EDITORIAL_PHOTOS,
  ...BATCH50_B_MANICURE_EDITORIAL_PHOTOS,
  ...BATCH50_C_MANICURE_EDITORIAL_PHOTOS,
  ...BATCH50_D_MANICURE_EDITORIAL_PHOTOS,
  ...BATCH8_MANICURE_EDITORIAL_PHOTOS,
  ...FUTURE_MANICURE_EDITORIAL_PHOTOS,
  ...PEDICURE_EDITORIAL_PHOTOS
}, photoReview.quarantined);

/** The owner temporarily approved six previously quarantined sources for
 * customer display. The editorial/photo-only QA whitelist is unchanged;
 * original rejection reasons remain in nail-photo-review.json.
 */
const OWNER_TEMPORARY_REVIEWED_MANICURE_PHOTOS: Readonly<Record<string,string>> =
  Object.fromEntries(
    photoReview.owner_temporary_display_override.ids
      .filter(id => /^nail-[a-z0-9-]+$/.test(id) &&
        photoReview.quarantined.some(record => record.id === id))
      .map(id => [id, `/nails/photos/${id}.webp`])
  );

// Owner-authorized customer-facing photos remain distinct from editorial QA.
export const NAIL_CUSTOMER_PHOTOS: Readonly<Record<string,string>> = {
  ...NAIL_EDITORIAL_PHOTOS,
  ...OWNER_SELECTED_TEMPORARY_MANICURE_PHOTOS,
  ...OWNER_TEMPORARY_REVIEWED_MANICURE_PHOTOS
};


export function NailVisual({
  style,
  className = "",
  priority = false,
  onPhotoUnavailable,
}: {
  style: NailStyle;
  className?: string;
  priority?: boolean;
  /** The gallery can remove broken assets from its photo-only results. */
  onPhotoUnavailable?: (styleId: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setFailed(false); setReady(false); }, [style.id]);
  // A transient offline/network failure must be retried after reconnection.
  useEffect(() => {
    // Preserve images already decoded: resetting their ready flag would make
    // them invisible until an onLoad event that may never fire again.
    if (!failed) return;
    const retry = () => { setFailed(false); setReady(false); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed]);
  const source = NAIL_CUSTOMER_PHOTOS[style.id];
  const photo = Boolean(source && !failed);

  return (
    <span className={`nail-visual ${className}`} data-media-source={photo && ready ? "ai-photo" : "vector"} role="img" aria-label={photo && ready ? `عکس الهام‌بخش ساخته‌شده با هوش مصنوعی، طرح ${style.title}؛ اجرای واقعی سالن نیست` : `تصویرسازی برداری طرح ${style.title}؛ اجرای واقعی سالن نیست`}>
      <span className="nail-visual__fallback" aria-hidden="true">
        {style.kind === "pedicure" ? <PedicurePreview style={style} /> : <NailPreview style={style} />}
      </span>
      {photo ? (
        <img
          className="nail-visual__photo"
          data-ready={ready || undefined}
          src={source}
          alt=""
          aria-hidden="true"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          width={600}
          height={600}
          onLoad={() => setReady(true)}
          onError={() => {
            setFailed(true);
            onPhotoUnavailable?.(style.id);
          }}
        />
      ) : null}
    </span>
  );
}
