/* H-Beauty offline shell: build step injects hashed app assets and cache identity.
 * Hairstyle photos are intentionally cached as viewed, not all preloaded. */
const PREFIX='h-beauty-';
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
      return Promise.all(older.filter(key => key !== retain).map(key => caches.delete(key)));
    })
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin) return;
  // Review metadata changes independently of the Vite app shell.
  // Never serve an old review manifest ahead of a newer server response:
  // a cached pre-Persian version has the same asset IDs but lacks titles.
  const path=new URL(req.url).pathname;
  if(path.startsWith('/review/') && path.endsWith('.json')){
    event.respondWith((async()=>{
      const current=await caches.open(CACHE);
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        if(!fresh.ok)throw new Error('Review metadata HTTP '+fresh.status);
        if(fresh.type==='basic'){
          try{await current.put(req,fresh.clone());}
          catch(error){console.warn('Unable to refresh review metadata cache',error);}
        }
        return fresh;
      }catch(error){
        // Offline review may use saved metadata. The page reconciles legacy
        // manifests with the exact-ID catalog title map before displaying.
        const stored=(await current.match(req)) || (await current.match(path)) ||
          (await caches.match(req)) || (await caches.match(path));
        if(stored)return stored;
        throw error;
      }
    })());
    return;
  }
  if(req.mode==='navigate') {
    event.respondWith((async () => {
      try {
        const response=await fetch(req);
        // Do not replace an installed version's HTML with a newer deployment:
        // its compiled JS/CSS manifest belongs to the cache fingerprint.
        return response;
      } catch (error) {
        if(path==='/review/manicure-intake.html' || path==='/review/editorial-workspace.html'){
          const reviewPage=(await (await caches.open(CACHE)).match(path)) || (await caches.match(path));
          if(reviewPage)return reviewPage;
        }
        const shell=await (await caches.open(CACHE)).match('/index.html');
        if (shell) return shell;
        throw error;
      }
    })());
    return;
  }
  // Numeric hairstyle image paths stay the same after a new matte release.
  // Never return a stale image from the previous SW cache before checking
  // the freshly deployed asset. Previously viewed photos remain usable offline.
  if(/^\/looks\/(?:sm\/)?[1-9]\d*\.webp$/.test(path)) {
    event.respondWith((async()=>{
      const current=await caches.open(CACHE);
      const freshInCurrent=await current.match(req);
      if(freshInCurrent)return freshInCurrent;
      try {
        const response=await fetch(req,{cache:'no-store'});
        if(!response.ok)throw new Error('Hairstyle photo HTTP '+response.status);
        if(response.type==='basic') {
          try{await current.put(req,response.clone());}
          catch(error){console.warn('Unable to store hairstyle photo',error);}
        }
        return response;
      } catch(error) {
        const oldOfflineCopy=await caches.match(req);
        if(oldOfflineCopy)return oldOfflineCopy;
        throw error;
      }
    })());
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
