# H-beauty makeup try-on

«حنانه بیوتی» (Hananeh Beauty) salon's **makeup try-on**, a Persian (RTL) mobile web app: the customer opens a
live mirror on her front camera, takes a selfie or picks a photo, and the salon's 42 catalog looks are painted on
her own face. She can also build her own makeup step by step («میکاپ من»). The try-on runs on her phone: no API
key, offline for previously downloaded looks, and her photo never leaves the phone unless she shares it herself (the
phone's share sheet). «رزرو» sends the look, its intensity and lipstick (or her recipe) to the salon in **the salon's
own chat**, with her name and phone, text only; the salon answers from its inbox at `/salon` (passcode, and a
notification on its phone for each new message). The chat is the one part with a server: a Cloudflare Durable Object
on this Worker ([`docs/SALON_CHAT.md`](docs/SALON_CHAT.md)).

`?look=<id>` opens it on a look (ids in `src/data/makeup-styles.ts`), e.g. `/?look=cat-eye`. `?engine=v2` tries the
roadmap's Phase 2 engine for that tab (every look painted as its recipe of products, lashes strand by strand;
`?engine=v1` switches back): see "Phase 2" in [`docs/AI_TRYON.md`](docs/AI_TRYON.md).

How the try-on works (face model, makeup engine, HD face, studio light, live mirror, «میکاپ من»):
[`docs/AI_TRYON.md`](docs/AI_TRYON.md).

## Where things are

| Path | What |
| --- | --- |
| `src/components/tryon-page.tsx` | The page: header, the try-on, the booking text |
| `src/components/salon-chat.tsx`, `salon-inbox.tsx`, `src/lib/chat.ts` | The salon's own chat: hers (from «رزرو») and the salon's inbox (`/salon`) |
| `worker/` | The Worker: the app's files, and `/api/*` to the salon chat's Durable Object (`chat.ts`: the whole API, SQLite) |
| `src/components/tryon.tsx`, `tryon-mine.tsx`, `tryon-outline.tsx` | The try-on screen, «میکاپ من», her own face outlines |
| `src/lib/` | The engine: face finding, makeup on the graphics chip (`makeup-gl.ts`), HD face, studio light, live mirror |
| `src/data/` | The looks, lipsticks, products and her own makeup's steps; each look as a recipe of those steps (`look-recipes.ts`, fitted by `look-fit.json`) |
| `src/styles/` | Tokens (the salon's rose palette, light and dark), base, shared pieces, the try-on |
| `public/tryon/` | The AI files and the looks' makeup layers (served in 1 MiB pieces, kept on the phone for offline) |
| `public/makeup/looks/` | The catalog photos (AI-generated model); `sm/` are the look rail's thumbnails |
| `scripts/tinybeauty/` | The engine's Python reference and the tools that make `public/tryon/` from the catalog photos |
| `scripts/gpu/` | Experiments with a larger AI as a teacher for the phone model (nothing here goes into the app) |
| `tests/` | Playwright tests of the try-on and the salon chat (synthetic faces in `tests/fixtures/`); `tests-node/`: the offline service worker and the chat server |

## Run / build

Requires Node.js 22+.

```bash
npm ci
npm run dev          # http://localhost:5173
npm run typecheck
npm run build        # dist/, with the offline service worker
npm run test:ui      # Playwright (starts the dev server)
npm run test:offline
```

Cloudflare Workers Builds deploys the Worker `h-beauty-makeup` from `main` (`wrangler.jsonc`: static assets from
`dist/`). Cloudflare refuses files over 25 MiB, so the large AI files are stored in parts and joined on the phone.
`.github/workflows/deploy.yml` runs the same checks on every push; `review.yml` on pull requests.

## First-run downloads and offline behavior

- Nothing downloads until she taps the live mirror, a selfie or a gallery photo: the first download starts with that
  tap (it runs while she picks her photo, which then gets the look). Only the chosen look and the shared AI files
  come: about 14 MB as they travel with WebGL2 (about 18 MB with the tiny-network fallback). The photo sharpener
  (2.4 MB) comes only when a soft photo needs it.
- The big AI files are served in 1 MiB pieces (`scripts/vite-ai-pieces.ts`), gzipped where Cloudflare doesn't
  compress them, each kept on the phone as it arrives: a stopped download goes on from the pieces already there.
  A dropped connection doesn't stop it: a cut piece is asked for again, and while the phone is offline the download
  says so, waits, and goes on by itself when the connection is back. A phone without room says that instead.
- Other looks are downloaded when she picks them and kept for offline use. The look rail shows her face in the
  looks she can see in it, fetching each one's small files (about 150 KB) as it scrolls into view (not with Data
  Saver on).
- The HD face is a separate **optional** download (about 84 MB) on phones with WebGPU, offered after a result;
  it can be stopped and continued the same way.
- Offline, downloaded looks keep working; new looks and HD need the internet for their first download. Browsers
  may evict the cache under storage pressure, so offline use isn't guaranteed forever.

## Notes

- The try-on is an approximation made by AI on the phone; the salon's artist adjusts colours to her skin.
- The catalog photos are AI-generated samples of one model; replace them with the salon's own shoot when available.
- Booking is text only: there is no reservation backend, and nothing is sent anywhere by the app.
