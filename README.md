# H-beauty — Hananeh Beauty salon app

«حنانه بیوتی» (Hananeh Beauty) — a luxury, mobile-first Persian (RTL) salon **app**: an installable PWA with a first-launch concierge welcome, a Liquid Glass tab bar, native-style bottom sheets and light ("porcelain & champagne") / dark ("noir & gold") themes.

Design system: **Estedad** for UI text, **Noto Nastaliq** calligraphy for the wordmark and accents, **Bodoni Moda** for Latin, OKLCH colour tokens, Phosphor icons and arch-framed imagery. Full documentation is in [`DESIGN.md`](DESIGN.md); the living style guide is at `#/design` in the app.

## Modern platform features (all progressive enhancements)

| Feature | Where | Fallback |
| --- | --- | --- |
| View Transitions API | Directional tab slides with fixed chrome; shared-element morph from a tapped look into the Discover feed (`src/lib/transition.ts`) | Instant state change |
| Scroll-driven animations (`animation-timeline: view()`) | Section reveals, hero parallax, depth effect between Discover slides | Static, fully visible content |
| Liquid Glass materials (`backdrop-filter`, layered specular highlights) | Tab bar with sliding lens that minimises on scroll, top bar, docks, floating controls | Solid surfaces under `prefers-reduced-transparency` |
| `@starting-style` | Entry animations for docks and the Discover overlay | Appears without animation |
| CSS scroll snap + container query units | Discover vertical feed, variant carousel in the look sheet, card overlay placement | Normal scrolling |
| Responsive images | 560px thumbnails in `public/looks/sm/` for grids and rails; full 2048px images fade in only in immersive views | — |

Everything honours `prefers-reduced-motion`.

## App structure

| Tab | What it does |
| --- | --- |
| خانه (Home) | Greeting, live open/closed status (Tehran time), next appointment, look of the week, quick actions, popular services, artists, curated looks, visit info |
| خدمات (Services) | Categorised service menu with durations and starting prices; add several services to one booking (floating cart) |
| رزرو (centre button) | 4-step booking sheet: services → artist → day & time (Persian calendar, Fridays closed, slots fit service length) → details |
| لوک‌بوک (Lookbook) | 283-look gallery with search, filters, saved looks, infinite scroll, compare (up to 3); tapping a look opens **Discover**, a full-screen swipe feed with double-tap to save |
| نوبت‌ها (Bookings) | Upcoming/past requests with draft/sent status; send, re-book or delete |
| پروفایل (avatar) | Member card (name/phone prefill), saved looks, compare, style finder, consult, theme, clear local data |

Tabs are hash routes (`#/services`, `#/looks`, …) and the browser/Android back button closes open sheets first.

Salon content (services, prices, artists, address, hours, optional WhatsApp/phone) lives in `src/data/salon.ts`. These are **placeholders to verify with the salon**. Setting `SALON.whatsapp` adds one-tap WhatsApp sending for bookings and consultations.

## Run / build

Requires Node.js 22+.

```bash
npm ci
npm run build
npx wrangler deploy
```

The frontend is a static Vite/React SPA and Cloudflare Workers static assets are served from `dist/` using `wrangler.jsonc`. Every push to `main` runs `.github/workflows/deploy.yml` (typecheck, build, `wrangler deploy`). Deploying from GitHub Actions needs a `CLOUDFLARE_API_TOKEN` repository secret with "Workers Scripts: Edit" permission; without it the workflow builds and uploads `dist/` but skips the deploy with a warning.

## Important functional distinctions

- The salon gallery has 292 bundled hairstyle images and can cache previously opened images offline. A first-time offline visitor will not have the whole catalog cached; full offline access to all hairstyles requires explicit prefetch.
- The "استایل‌یاب" (style finder) is questionnaire-based, not a neural hairstyle-transfer model, and is labelled as such. Upload-your-own-photo AI try-on is **not implemented** in this source archive.
- Booking/consultation UI does not connect to an operational reservation backend. Requests are stored only on the device and shown as "draft" until the user sends them (share sheet / copy / WhatsApp); the app never claims a booking is confirmed.
- Photo images are bundled for this website; rights/provenance should be verified by the operator before commercial publication.
