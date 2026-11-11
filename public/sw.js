/* H-Beauty offline shell: build step injects hashed app assets and cache identity.
 * Hairstyle photos are intentionally cached as viewed, not all preloaded. */
const PREFIX='h-beauty-';
const AI_CACHE='hb-ai-models-v2';
const CACHE='h-beauty-v5-unbuilt';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/favicon-32.png','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/icons/hananeh-signature.svg'];
const BUILD_ASSETS=[]; /* __H_BEAUTY_PRECACHE__ */

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll([...new Set([...CORE,...BUILD_ASSETS])]))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => {
      // Keep the immediately previous release for tabs still using older chunks.
      // CacheStorage.keys() lists caches in creation order; don't sort hash names.
      const older = keys.filter(key => key.startsWith(PREFIX) && key !== CACHE);
      const retain = older.at(-1);
      // Files of earlier on-device AI engines are never used again.
      const oldAi = keys.filter(key => key.startsWith('hb-ai-models-') && key !== AI_CACHE);
      return Promise.all([...older.filter(key => key !== retain), ...oldAi].map(key => caches.delete(key)));
    })
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin) return;
  if(req.mode==='navigate') {
    event.respondWith((async () => {
      try {
        const response=await fetch(req);
        // Do not replace an installed version's HTML with a newer deployment:
        // its compiled JS/CSS manifest belongs to the cache fingerprint.
        return response;
      } catch (error) {
        const shell=await (await caches.open(CACHE)).match('/index.html');
        if (shell) return shell;
        throw error;
      }
    })());
    return;
  }
  // On-device AI try-on files live in their own long-lived cache (filled by the
  // app's one-time download) so releases don't re-download ~50 MB.
  if(new URL(req.url).pathname.startsWith('/tryon/')) {
    event.respondWith((async () => (await (await caches.open(AI_CACHE)).match(req)) || fetch(req))());
    return;
  }
  event.respondWith((async () => {
    // Always prefer the active release; older assets are fallbacks only.
    const current=await caches.open(CACHE);
    const cached=(await current.match(req)) || (await caches.match(req));
    if (cached) return cached;
    const response=await fetch(req);
    if (response.ok && response.type==='basic') {
      try { await (await caches.open(CACHE)).put(req,response.clone()); }
      catch (error) { console.warn('Could not cache salon asset',error); }
    }
    return response;
  })());
});
