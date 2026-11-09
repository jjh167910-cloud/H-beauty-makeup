# Hananeh Beauty — Editorial Atelier redesign review

Date: 2026-10-22
Source: H-beauty, main at `5de4fb71a689f2d11e374f2d1633028416405fcd`
Implementation: `design/atelier-editorial-v21`
Review status: **NO-GO for production merge until typecheck, build, device/render matrix and salon content approval are completed.** Suitable for code/design review.

## Original job and constraints

Improve an existing luxury, mobile-first Persian RTL salon PWA using the Elite App Creative Product Studio v20.3.1 skill package. Preserve the 283-family hairstyle catalog, the existing salon brand assets, working look discovery/booking/consultation functions, hash routing, themes and progressive offline behaviour. **User clarified on 2026-10-22 that hairstyle try-on implementation is not required for this review.** It is explicitly out of scope, not a release blocker.

## Baseline inventory and design debt (source inspection)

- Home presented a hero, a four-tile bento with overlapping actions, a second style-finder CTA, curated looks and many later sections. Primary action was diluted by repeated discovery/finder prompts.
- Lookbook action icons measured **34px** by CSS (`2.125rem` at root 16px), below the 44px target recommended for touch.
- Booking cards could mark a request **sent** as soon as a WhatsApp page opened, or when text was only copied. This was an incorrect status transition.
- Installed service worker caches requested assets on demand but does not guarantee first-time offline access to all hairstyle images.
- Services, price lists, salon address, artist details and opening hours are identified as **unverified placeholders** in `src/data/salon.ts`.

## Directions considered

1. **Flat utility dashboard:** strongest speed of use; rejected as uncharacteristic for a visual, editorial salon experience.
2. **Immersive full-screen swipe feed on launch:** dramatic visuals; rejected because it would hide the main appointment/consultation tasks and increase initial asset costs.
3. **Editorial atelier journey (selected):** one flagship portrait, three photographic mood-entry points, then truthful appointment, consultation and questionnaire pathways. Uses the established brand system without refactoring deep data flows.

## What changed

- Rebuilt home editorial header, portrait hero and immediate booking CTA.
- Added three fully functional mood cards; clicking one clears conflicting saved/search filters, selects its real catalog filter and navigates to the lookbook.
- Replaced competing bento actions with a clear request/consultation/finder decision section.
- Consolidated the redundant later finder prompt.
- Added theme-aware editorial CSS and high-contrast media treatment.
- Enlarged lookbook save/compare touch targets to 44×44 CSS px and category chips to 44px minimum height.
- Added an offline notice that accurately limits its promise to content cached on the current device.
- Added a focusable keyboard skip control for the main content without corrupting hash routes.
- Corrected booking-state transitions: clipboard copy or opening WhatsApp no longer automatically means sent; the user can explicitly confirm when they actually send a request.

## Review pass 2: issues independently found and repaired

| ID | Severity | Original defect | Change | Verification |
|---|---|---|---|---|
| HB-R01 | P1 | The request-completed sheet still marked clipboard-copy and WhatsApp-open as sent | Removed automatic sent transition in sheet and booking cards; explicit user confirmation remains | Source diff inspected, browser retest NOT_RUN |
| HB-R02 | P1 | Predicted booking slots were described as available | Explicitly labeled suggested/non-verified salon times | Source diff inspected, browser retest NOT_RUN |
| HB-R03 | P1 | Saving customer details and requests could silently fail (localStorage exceptions swallowed) | `storageError` in Zustand store and visible `role="alert"` warning | Source diff inspected, failure-injection retest NOT_RUN |
| HB-R04 | P2 | Discover dialog did not trap keyboard focus; neighboring slides remained focusable | Focus containment, restoration, inactive-slide inert state | Source diff inspected, Playwright retest NOT_RUN |
| HB-R05 | P2 | Bookings category filter declared `tablist` but used pressed toggle buttons | Reclassified control as a toggle group | Source diff inspected, assistive-tech retest NOT_RUN |

## QA trace matrix

| Requirement | Oracle | Status |
|---|---|---|
| Preserve prior navigation and React screens | Inspect `salon-app.tsx` route branches | PASS (source review) |
| Real mood-card actions | Inspect `home.tsx` callbacks and catalog filters | PASS (source review) |
| Hero booking action retains selected look | Inspect `openBooking({lookId})` | PASS (source review) |
| Touch targets on lookbook | 2.75rem × 2.75rem CSS | PASS (source measurement; not device tested) |
| Booking status cannot advance from clipboard copy | Compare former and current `send()` branches | PASS (source review) |
| WhatsApp launch cannot instantly mark sent | Inspect link click handler | PASS (source review) |
| Offline message does not promise un-cached catalog | Inspect `OfflineNotice` copy | PASS (source review) |
| CSS brace structure | Balanced braces in stylesheet | PASS (static scan) |
| Full React/TypeScript typecheck | `npm ci && npm run typecheck` | NOT_RUN (no checkout/build environment) |
| Production Vite build | `npm run build` | NOT_RUN |
| Render matrix: 320/390/768/1280, light/dark, RTL, 200% text | Browser and screenshots | NOT_RUN |
| Android PWA and offline re-launch | Physical Android, cold/warm cache | NOT_RUN |
| Real end-to-end booking and recovery tests | Browser interaction | NOT_RUN |
| Image license and salon placeholder approval | Human operator documentation | BLOCKED |
| Hairstyle try-on | Explicitly excluded by user | OUT_OF_SCOPE |

## Risks and release policy

- **P1: Unverified salon details and booking slots.** The app is a request workflow, not a real-time reservation or confirmed appointment service. Salon owner must verify prices, location, staff and hours before external release.
- **Out of scope:** Hairstyle try-on implementation is not part of this review and is not a release blocker.
- **P1: Build/browser/device QA pending.** Do not merge based solely on source review.
- **P2: Catalog image rights and cold-offline coverage.** Verify rights and offer an explicit prefetch choice if complete offline use is a requirement.
- **P2: Offline-state durability.** Silent write failures now raise an on-screen warning, but interleaved two-tab writes, eviction/recovery, and independent storage-failure device testing still need verification.

### How to verify before merge

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run build
npm run dev
```

Install the Playwright browser once, then run the new **11-case** review suite (4 viewports + catalog routing + dark RTL + sharing state + skip navigation + Discover focus + storage-quota injection + 200% Persian text):

```bash
npx playwright install chromium
npm run test:ui
```

Browser tests are source-authored but **have not been executed**. They do not prove behavior until a real run succeeds.

Then visually check Home, Lookbook, Services, Bookings and Profile in light/dark at 320/390/768/1280 widths with Persian strings and 200% text. Check keyboard navigation, touch target geometry, initial portrait loading, offline reload and the manual booking-send confirmation. Do not accept visual quality claims before inspecting those screenshots.

## Rollback

The change is isolated to branch `design/atelier-editorial-v21`. Roll back by declining/closing the PR; `main` has not been changed.


## Release decision, 2026-10-22

**NO-GO for merging to `main` / public rollout** until the newly introduced changes pass TypeScript typecheck, Vite build, the Playwright suite and human screenshot review. No try-on work is required. Salon operator details and photo rights are independent launch blockers. Existing claims of 12/12 checks refer **only to source-level assertions** from the first iteration, not runtime certification.
