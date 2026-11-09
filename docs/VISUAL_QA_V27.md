# H-Beauty V27 — photography and visual QA

Source: supplied H-beauty ZIP, plus reviewed salon styling and photos. Date: 2026-10-23.

## Completed
- Equal 3:4 portrait frames with no icon overlays.
- A non-destructive horizontal focal shift on 44 wide braid/curly/updo images.
- Reused crop positions in catalog thumbnails, main home photo, discovery, and look details.
- Local Chromium reproduction audit on 9 views × 3 widths × light/dark = **54** captures. No document horizontal overflow or broken images detected in these static reproductions.
- HTML preview dark-theme secondary-button colors corrected to match source theme variables.
- Prior V26 fixes retained: mobile booking CTA first, tablet photo alongside booking, larger Persian copy/touch targets, missing-photo fallback.

## Verification limits
**These are static layout reproductions, not running React-app screenshots.** The environment has no npm registry DNS access or compiled `dist` directory. The GitHub Actions audit branch fails before starting runner steps. Actual React build, interactions, Android physical touch, and end-to-end offline behavior are not certified.

## Next gate
When CI runners work: `npm ci && npm run typecheck && npm run build && npm run test:ui`; visually inspect screenshots and errors before merging. Production deployment via GitHub also needs `CLOUDFLARE_API_TOKEN`.
