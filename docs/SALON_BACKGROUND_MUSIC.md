# Hananeh Beauty — background music production setup

## Current release state

The full looping audio player is part of the React app. The project owner
confirmed that use of the supplied MP3 is cleared. **The exact recording
still must be supplied to the build environment.** The merged code by itself
does not contain the 2.96 MB music file.

## One-file activation (GitHub-connected deployment)

1. Save the verified audio from the ChatGPT attachment/download as
   `hananeh-salon-ambience.mp3` (do not re-encode it).
2. In the [GitHub repository](https://github.com/jjh167910-cloud/H-beauty),
   navigate to `public/audio/` and choose **Add file → Upload files**.
3. Upload exactly `public/audio/hananeh-salon-ambience.mp3`. Commit the change
   to `main`, or open and merge a PR.
4. Verify the next Cloudflare Workers Build or GitHub Actions deployment.
   The build automatically detects the file, sets `VITE_SALON_MUSIC=true` for
   Vite and the offline service worker, verifies the existing SHA256 lock
   `assets/hananeh-salon-ambience.sha256`, and precaches the MP3.
5. Open the live app at https://h-beauty.mostifa2273.workers.dev/ .
   On a first visit, tap anywhere in the app (mobile browsers block autoplay
   until a user gesture) or tap the speaker button. The recording then loops
   across screens and booking sheets.

SHA256 of the supplied file:
`7176ad9027a31d4e049dff3fb836d390742911fb2a097402c186a836aebccefe`

The build fails intentionally if `VITE_SALON_MUSIC=true` but the MP3 is
missing, if the MP3 is changed, or if its checksum differs from the lock.
The default is **automatic**: music enabled when the file exists, disabled
when it does not. To opt out explicitly, set `VITE_SALON_MUSIC=false` in
your environment (an existing `false` override must be removed to enable
automatic activation).

## User experience

- At most one persistent HTMLAudioElement; `loop` attribute.
- The speaker button visibly represents *actual playback*, rather than a
  requested state blocked by browser autoplay.
- 25% default volume; mute stored on the device and synchronized across tabs.
- Pauses while the page is hidden; may resume when visible.
- The app works offline after successful caching and installation.
- The playback integration and auto-enable release logic are covered by
  Playwright and Node tests.

## Verification checklist

- A fresh release build contains `/audio/hananeh-salon-ambience.mp3` in
  `dist/sw.js` and returns HTTP 200 for the MP3 on the live Workers site.
- Open an incognito browser and tap Play: sound becomes audible.
- Navigate the makeup catalog and booking sheet: no audio restart.
- Toggle sound off and on: correct icon and saved preference on reload.
- Install PWA and test airplane mode *after* music has been cached.
- Test on iPhone Safari and Android Chrome. A synthetic Chromium CI test
  alone cannot establish device-specific autoplay or audio-focus behavior.

If audio is still absent after uploading the file and building successfully,
check whether Cloudflare Workers Builds is publishing the connected `main`
branch and that the live Worker cache matches the latest release. The GitHub
CI success is not, by itself, proof of a Cloudflare production update.
