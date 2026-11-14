# H-beauty makeup try-on

«حنانه بیوتی» (Hananeh Beauty) salon's **makeup try-on**, a Persian (RTL) mobile web app: the customer opens a
live mirror on her front camera, takes a selfie or picks a photo, and the salon's 42 catalog looks are painted on
her own face. She can also build her own makeup step by step («میکاپ من»). Everything runs on her phone: no
server, no API key, offline for previously downloaded looks, and her photo never leaves the phone. «رزرو» gives the
look (or her recipe) as text to send to the salon.

`?look=<id>` opens it on a look (ids in `src/data/makeup-styles.ts`), e.g. `/?look=cat-eye`.

How the try-on works (face model, makeup engine, HD face, studio light, live mirror, «میکاپ من»):
[`docs/AI_TRYON.md`](docs/AI_TRYON.md).

## Where things are

| Path | What |
| --- | --- |
| `src/components/tryon-page.tsx` | The page: header, the try-on, the booking text |
| `src/components/tryon.tsx`, `tryon-mine.tsx`, `tryon-outline.tsx` | The try-on screen, «میکاپ من», her own face outlines |
| `src/lib/` | The engine: face finding, makeup on the graphics chip (`makeup-gl.ts`), HD face, studio light, live mirror |
| `src/data/` | The looks, lipsticks, products and her own makeup's steps |
| `src/styles/` | Tokens (the salon's rose palette, light and dark), base, shared pieces, the try-on |
| `public/tryon/` | The AI files and the looks' makeup layers (downloaded once, kept for offline) |
| `public/makeup/looks/` | The catalog photos (AI-generated model); `sm/` are the look rail's thumbnails |
| `scripts/tinybeauty/` | The engine's Python reference and the tools that make `public/tryon/` from the catalog photos |
| `scripts/gpu/` | Experiments with a larger AI as a teacher for the phone model (nothing here goes into the app) |
| `tests/` | Playwright tests of the try-on (synthetic faces in `tests/fixtures/`); `tests-node/`: the offline service worker |

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

- The service worker precaches the HTML entrypoint, essential JavaScript/CSS/fonts **and the initially rendered try-on screen**. Deeper optional editing and HD code loads only when its feature is opened and is cached for offline reuse. Visiting a deeper optional feature online once is required to make its code available offline; downloaded AI models alone cannot guarantee offline operation for an unvisited feature.
- The app's offline shell is installed separately from its AI files. When someone starts try-on, only the selected look plus the face landmark, segmentation and enhancement files are required (~28 MiB with WebGL2; ~40 MiB with the tiny-network fallback).
- The other 41 looks are downloaded individually as selected, then retained in Cache Storage for later offline use. Merely displaying the catalog rail does not predownload them.
- High-resolution face restoration is a separate ~108 MiB **optional** download on supported devices after a photo is rendered. The HD download can be stopped and restarted; fully cached files are reused, but the currently interrupted file starts again. Ordinary try-on never requires HD.
- Large model responses stream directly into the browser's offline cache rather than being assembled into a second, large in-memory Blob. On retry, the progress bar counts only missing files, not already-downloaded assets.
- If the device is offline, downloaded styles continue working. New styles and HD require connectivity for their first download. Browsers may evict caches under device storage pressure, so offline availability is not unconditional.

## Notes

- The try-on is an approximation made by AI on the phone; the salon's artist adjusts colours to her skin.
- The catalog photos are AI-generated samples of one model; replace them with the salon's own shoot when available.
- Booking is text only: there is no reservation backend, and nothing is sent anywhere by the app.
