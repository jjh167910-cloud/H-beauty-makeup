import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base='http://127.0.0.1:4179';
const browser=await chromium.launch({headless:true});
try{
  for(const viewport of [{width:390,height:844,name:'mobile'},{width:1280,height:800,name:'desktop'}]){
    const context=await browser.newContext({viewport,serviceWorkers:'allow'});
    const page=await context.newPage();
    const exceptions=[];
    const external=[];
    page.on('pageerror',e=>exceptions.push(String(e)));
    page.on('request',r=>{
      if(!r.url().startsWith(base) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url().slice(0,300));
    });
    const response=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});
    assert.equal(response?.status(),200,'staging root should serve HTML');
    await page.waitForFunction(()=>!!document.querySelector('#root') || !!document.querySelector('#app'),{timeout:20000});
    const title=await page.title();
    await page.evaluate(async()=>{
      if(!('serviceWorker' in navigator))throw Error('Service worker unsupported');
      await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('SW install timeout')),60000))]);
    });
    await page.reload({waitUntil:'domcontentloaded',timeout:60000});
    const controlled=await page.evaluate(()=>Boolean(navigator.serviceWorker.controller));
    assert.ok(controlled,'PWA shell not controlled by service worker');
    if (viewport.name==='mobile') {
      const info=await page.evaluate(async()=>{
        const res=await fetch('/offline-pack-v15.json');
        const doc=await res.json();
        return {count:doc.assets?.length,first:doc.assets?.slice(0,3),largest:doc.assets?.filter(a=>(a.size??a.bytes??a.byte_length??0)>20000000).slice(0,6)};
      });
      console.log('OFFLINE_PACK_SAMPLE',JSON.stringify(info));
    }
    if (viewport.name==='mobile') {
      const path='/tryon/ort/ort-wasm-simd-threaded.asyncify.wasm';
      const expected='39f9f0894d478800487ed9f7dbe92618498db320cf55c8e3d89adff8dce658da';
      const initial=await page.evaluate(async ({path,expected})=>{
        const r=await fetch(path,{cache:'no-store'});
        if(!r.ok)throw Error('Model reconstruction failed HTTP '+r.status);
        const bytes=await r.arrayBuffer();
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(digest!==expected)throw Error('Mismatch of reconstructed original model SHA256 '+digest);
        const storage=await caches.open('hb-ai-models-v2');
        await storage.put(path,new Response(bytes,{headers:{'content-type':'application/wasm'}}));
        return {bytes:bytes.byteLength,digest,stored:!!(await storage.match(path))};
      },{path,expected});
      assert.equal(initial.bytes,26781914,'Original on-device neural runtime bytes');
      assert.ok(initial.stored,'Local cache must retain the verified model');
      console.log('MODEL_CACHED',JSON.stringify(initial));
      await context.setOffline(true);
      const offline=await page.evaluate(async ({path,expected})=>{
        const r=await fetch(path);
        if(!r.ok)throw Error('Cached neural runtime unavailable offline HTTP '+r.status);
        const bytes=await r.arrayBuffer();
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(digest!==expected)throw Error('Offline model bytes differ '+digest);
        return {bytes:bytes.byteLength,digest};
      },{path,expected});
      assert.equal(offline.bytes,26781914);
      console.log('MODEL_OFFLINE_PASS',JSON.stringify(offline));
    } else {
      await context.setOffline(true);
    }
    const offlineResponse=await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    assert.ok(offlineResponse?.ok(),'Cached app shell must reload without any network');
    const offlineBody=await page.locator('body').innerText({timeout:15000});
    assert.ok(offlineBody.length>20,'Offline view should contain meaningful application text');
    assert.equal(exceptions.length,0,'Browser JS exceptions on online/offline shell');
    console.log(JSON.stringify({test:'offline_shell',viewport:viewport.name,controlled,offlineHTTP:offlineResponse?.status(),title,offlineTextChars:offlineBody.length,externalRequests:external.length,jsErrors:exceptions}));
    await context.close();
  }
}finally{await browser.close();}
