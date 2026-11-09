/* H-Beauty V18 offline PWA shell: cached app first, private photos never transmitted.
 * Explicit SHA256-verified offline pack installs all models and catalog assets. */
const PREFIX='h-beauty-';
const AI_CACHE='hb-ai-models-v2';
const CACHE='h-beauty-v18-94018380893f';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/favicon-32.png','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/icons/hananeh-signature.svg'];
const BUILD_ASSETS=["/assets/bodoni-moda-latin-ext-opsz-italic-QSGu6YSm.woff2","/assets/bodoni-moda-latin-ext-opsz-normal-CoJBavOu.woff2","/assets/bodoni-moda-latin-opsz-italic-BCRrlh7t.woff2","/assets/bodoni-moda-latin-opsz-normal-X2BzlAjV.woff2","/assets/bodoni-moda-math-opsz-italic-CGdm0Lr_.woff2","/assets/bodoni-moda-math-opsz-normal-CbZAXtrh.woff2","/assets/bodoni-moda-symbols-opsz-italic-cRdvdvM-.woff2","/assets/bodoni-moda-symbols-opsz-normal-d21etpfE.woff2","/assets/estedad-arabic-wght-normal-D6DQIq1q.woff2","/assets/estedad-latin-ext-wght-normal-F3E_gUl2.woff2","/assets/estedad-latin-wght-normal-B5vzQVCp.woff2","/assets/estedad-vietnamese-wght-normal-D7SXJ-q_.woff2","/assets/index-Bc_saprY.css","/assets/index-DiBbBQeX.js","/assets/noto-nastaliq-urdu-arabic-wght-normal-DQb3xaK6.woff2","/assets/noto-nastaliq-urdu-latin-ext-wght-normal-C69TAH8j.woff2","/assets/noto-nastaliq-urdu-latin-wght-normal-C0FKGmkb.woff2","/assets/ort.webgpu.min-CEeq6GOC.js","/assets/tryon-BgN_5lH3.js","/assets/tryon-mine-B_1f7N_O.js","/assets/tryon-worker-B6ngc6zW.js","/assets/vision_bundle-D0VCQj0n.js"];
const BIG_MODELS={"/tryon/face-hd/gfpgan-1.4-q8.0.bin":{"bytes":48000000,"sha256":"f2a0ecfb6b8c87e63ed45fa74802ed5588fcab4b3a47f1bba174287f6df079b9","parts":[{"path":"/_hbeauty_model_parts_v18/80f138d4b43058c820a5b22b-000.part","bytes":16777216,"sha256":"f5ddcb3e596b9b90f55fd721a346e7db95acb71ad4e7f35401373b63c2c9f09f"},{"path":"/_hbeauty_model_parts_v18/80f138d4b43058c820a5b22b-001.part","bytes":16777216,"sha256":"76e28f7ba6e37710b45de32ddc6fac036d4ffc31161607323fae762551f30475"},{"path":"/_hbeauty_model_parts_v18/80f138d4b43058c820a5b22b-002.part","bytes":14445568,"sha256":"b5866858dc51f51e40fadc98d6a258f4068ff2013b9b13dd0d9620a61d6ebc9c"}]},"/tryon/face-hd/gfpgan-1.4-q8.1.bin":{"bytes":37577374,"sha256":"96fd074aa10814f557e51fee070924d433f5b08035d87f6438d5f3709cc13092","parts":[{"path":"/_hbeauty_model_parts_v18/e0e8e5723311205b677d1d7a-000.part","bytes":16777216,"sha256":"bbd3853ca4f79077f767b872b8685cac191fbf3de3f8f4362af0986e53506385"},{"path":"/_hbeauty_model_parts_v18/e0e8e5723311205b677d1d7a-001.part","bytes":16777216,"sha256":"a755e3aa716e1b43b032bf6d714b5559e982a9f817e2774686519154c6395add"},{"path":"/_hbeauty_model_parts_v18/e0e8e5723311205b677d1d7a-002.part","bytes":4022942,"sha256":"6839d5e1b2d1c5e23f213c7dece3444eebd6a8a85b0cfb895029315cb4c7ef26"}]},"/tryon/ort/ort-wasm-simd-threaded.asyncify.wasm":{"bytes":26781914,"sha256":"39f9f0894d478800487ed9f7dbe92618498db320cf55c8e3d89adff8dce658da","parts":[{"path":"/_hbeauty_model_parts_v18/44458b874d11da905fd79c2f-000.part","bytes":16777216,"sha256":"9f3196f1ef3506d7cabb9558f2fac779571b225007b744e766d8e63228750d3a"},{"path":"/_hbeauty_model_parts_v18/44458b874d11da905fd79c2f-001.part","bytes":10004698,"sha256":"8fdca824417391c1f641b1b9cd1bcd407191ad75fe03d9bfa7139fdf358faa13"}]}};

/** Split-model transport only. The original bytes are reconstructed in this
 * same-origin worker, SHA256-checked, then cached by the V15 offline installer.
 * With the completed offline pack, a model request never fetches a chunk. */
async function sha256Hex(buffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
function reconstructModel(entry, path) {
  if (!entry || !Array.isArray(entry.parts) || !entry.parts.length) return Promise.resolve(new Response('Invalid model parts', {status: 500}));
  const type=path.endsWith('.wasm')?'application/wasm':'application/octet-stream';
  let count=0;
  const stream = new ReadableStream({
    start(controller) {
      (async()=>{
        for (const part of entry.parts) {
          const response=await fetch(new URL(part.path, self.location.origin).toString(), {cache:'no-store', credentials:'same-origin'});
          if (!response.ok || response.type==='opaque') throw Error('Missing same-origin model part: ' + part.path);
          const buffer=await response.arrayBuffer();
          if (buffer.byteLength !== part.bytes || await sha256Hex(buffer) !== part.sha256)
            throw Error('Corrupt model part: ' + part.path);
          count+=buffer.byteLength;
          controller.enqueue(new Uint8Array(buffer));
        }
        if (count !== entry.bytes) throw Error('Incomplete model: ' + path);
        controller.close();
      })().catch(reason => controller.error(reason));
    }
  });
  return Promise.resolve(new Response(stream, {status:200, headers:{'content-type':type,'content-length':String(entry.bytes),'x-content-type-options':'nosniff'}}));
}

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
  const url=new URL(req.url);
  // Fail-closed: block every cross-origin request, API request and POST, including
  // hosted image-generation endpoints. Offline AI is run only in the browser.
  if(url.origin!==self.location.origin || req.method!=='GET' || url.pathname.startsWith('/api/')) {
    event.respondWith(Promise.resolve(new Response('H-Beauty: offline-only, no cloud requests', { status: 403 })));
    return;
  }
  if(req.mode==='navigate') {
    event.respondWith((async () => {
      // Never revalidate the app's HTML while opening a fully installed offline
      // build. Otherwise a new live deployment may mismatch the cached JS/CSS.
      const shell=await (await caches.open(CACHE)).match('/index.html');
      if (shell) return shell;
      return fetch(req);
    })());
    return;
  }
  // On-device AI try-on files live in their own long-lived cache (filled by the
  // app's one-time download) so releases don't re-download ~50 MB.
  if(url.pathname.startsWith('/tryon/')) {
    event.respondWith((async () => {
      const cached=await (await caches.open(AI_CACHE)).match(req, {ignoreSearch:true});
      if (cached) return cached;
      const big=BIG_MODELS[url.pathname];
      if (big) return reconstructModel(big,url.pathname);
      return fetch(req);
    })());
    return;
  }
  event.respondWith((async () => {
    // Always prefer the active release; older assets are fallbacks only.
    const current=await caches.open(CACHE);
    const cached=(await current.match(req)) || (await caches.match(req, {ignoreSearch:true}));
    if (cached) return cached;
    const response=await fetch(req);
    if (response.ok && response.type==='basic') {
      try { await (await caches.open(CACHE)).put(req,response.clone()); }
      catch (error) { console.warn('Could not cache salon asset',error); }
    }
    return response;
  })());
});
