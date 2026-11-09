# H-Beauty whole-app UI audit — 2026-10-31

## Scope and evidence boundaries
- Source: `jjh167910-cloud/H-beauty`, branch `audit/whole-app-accessibility-20261031`.
- Product: Persian RTL, mobile-first salon PWA (home, services, hairstyle looks, makeup, manicure/pedicure, bookings, profile, visual design guide).
- Method: Elite App Expert Studio (adversarial UX QA, responsive + RTL, accessibility), UIAudit's Impeccable technical **audit** workflow, and Redesign's preserve-and-upgrade workflow.
- Real Chromium against public baseline: 8 routes × widths 320/390/768/1280 = **32 screen states**, plus 16 axe states (8 routes in light/dark).
- Follow-up local production build: same 32-route responsive matrix and 16 axe states; no page JavaScript errors, no visible broken images, and no document horizontal overflow in these observations.
- 200% root-font mobile viewport checks on seven main routes; no document-width overflow. Horizontally scrollable filter/photo rails are deliberate and not counted as document overflow.
- Opening booking, hairstyle and manicure detail sheets: no axe WCAG-tag violations in observed dialog states. Makeup modal coverage was incomplete in manual probing; automated makeup gallery tests cover other journeys.

## Verified issues corrected
| ID | Severity | Observation | Root cause | Correction | Evidence |
| --- | --- | --- | --- | --- | --- |
| A11Y-01 | P2 | Home featured look images repeated the same text already adjacent to the link; axe reported `image-redundant-alt` in 4 nodes. | Redundant image alt in accessible named image-links. | Decorative link images now use empty alt; the parent button retains its descriptive accessible name. | 4->0 duplicated nodes; Playwright new regression |
| A11Y-02 | P2 | Hairstyle gallery jumped from the page's h1 directly to card h3; axe `heading-order`. | Archive section label was a span, not a heading. | Archive label now h2; original h3 card headings retained. | 1->0 heading-order violations; Playwright regression |
| TOUCH-03 | P2 | Shared navigation text links and profile appearance radios had 40px touch height; small icon controls 36px; filter chips below 44px; hairstyle and nail search inputs had approximately 24px and 22px intrinsic height. | Minimum sizes in shared CSS tokens. | At least 44px target heights for affected shared links, radios, chips, small icon buttons and search controls. | Automated computed-geometry assertions at 320px; cross-route screenshots |

## Preserved behaviors
- Existing premium burgundy/porcelain salon identity, Estedad typography, Phosphor icon family, visual hierarchy and dark-mode tokens remain unchanged.
- Existing booking communication is a *prepared request*, not a confirmed reservation. No claim of server-side booking or confirmed availability.
- Hair, makeup, manicure/pedicure photo IDs, user favorites, photo quality locks and service-worker/offline asset mapping remain unchanged.

## Checks executed
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `npm run test:offline` — **102/102** PASS.
- Playwright cross-app accessibility regressions — **5/5** PASS.
- Playwright critical journey suites (editorial, nail gallery, filters and compare) — **58/58** PASS.
- axe-core 4.10.3 on 8 routes × light/dark — baseline 2 rule families: `image-redundant-alt` on home and `heading-order` on looks. Patched source: **0** reported violations in these 16 tested states.
- Responsive page document width at 320, 390, 768, 1280 — **0** positive document overflow in 32 patched-state captures.
- Visible-image network/decoding in all 32 captures — no observed broken images. Not a per-image editorial photographic fidelity audit.

## Residual risks / NOT RUN
- Physical Android and iPhone testing, actual mobile keyboard, TalkBack/VoiceOver and assistive user task testing: NOT RUN.
- Fresh offline-install/recovery at low storage and multi-tab local-storage races: NOT RUN in this audit; pre-existing automated offline tests passed.
- Real salon booking delivery: NOT PROVIDED by the app; requests must be shared, and the salon must confirm appointments. Preserve truthful copy.
- Actual Core Web Vitals on representative low-end physical phones and cold-network transfer budgets: NOT RUN.
- A clean automated axe report is not a claim of complete WCAG 2.2 AA conformance.

## Release decision
**CONDITIONAL GO for the targeted accessibility and touch improvements**, subject to full GitHub Actions review/build/mobile workflow and release verification. Do not infer complete application certification from this scoped evidence.

Rollback: revert the merge commit for this change; no data migration or asset rewrite.
