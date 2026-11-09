import { cn } from "@/lib/cn";

/**
 * Hananeh Beauty / signature mark.
 * Three fine hair ribbons surround a single petal, forming a quiet "H" gesture.
 * Custom vector, readable at app-icon and navigation sizes, with no external font dependency.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("salon25-brand-mark inline-grid place-items-center", className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="block size-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="62" height="62" rx="19" fill="#F7E8ED" />
        <path d="M19 44c-4-12-1-24 9-29" stroke="#803B55" strokeWidth="3.6" strokeLinecap="round"/>
        <path d="M29 14c-7 9-8 19-4 28 3 6 11 8 18 3" stroke="#803B55" strokeWidth="3.6" strokeLinecap="round"/>
        <path d="M44 18c-7 7-9 16-8 22" stroke="#803B55" strokeWidth="3.6" strokeLinecap="round"/>
        <path d="M28.5 32c7.5-5 14-4 18.5 1" stroke="#B56E88" strokeWidth="2.7" strokeLinecap="round"/>
        <path d="M40 15c1-4 4-6 8-5-1 4-4 6-8 5Z" fill="#B56E88"/>
      </svg>
    </span>
  );
}

/** Compact Persian-first wordmark with restrained salon identification. */
export function Wordmark({ className, latin = true }: { className?: string; latin?: boolean }) {
  return (
    <span className={cn("wordmark salon25-wordmark", className)}>
      <span className="wordmark__fa">حنانه بیوتی</span>
      {latin ? <span className="wordmark__en" lang="en">HANANEH · BEAUTY SALON</span> : null}
    </span>
  );
}
