import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin='https://h-beauty-makeup.jjh167910.workers.dev';
const browser=await chromium.launch({headless:true});
try {
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1280,height:800}]) {
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},serviceWorkers:'allow'});
    const page=await context.newPage();
    const exceptions=[];
    page.on('pageerror',e=>exceptions.push(String(e)));
    const first=await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:60000});
    assert.equal(first?.status(),200,'Live worker homepage must respond HTTP 200');
    const checked=await page.evaluate(async()=>{
      const r=await fetch('/offline-pack-v15.json');
      if(!r.ok) throw Error('Offline asset manifest missing');
      const manifest=await r.json();
      if(manifest.assets?.length!==935)throw Error('Incomplete offline pack');
      const reg=await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_,rej)=>setTimeout(()=>rej(Error('Service worker readiness timeout')),45000)),
      ]);
      return {manifestCount:manifest.assets.length,serviceWorkerScope:reg.scope,manifestVersion:manifest.version};
    });
    const diagnostic=await page.evaluate(async()=>{
      const cacheNames=await caches.keys();
      const result=[];
      for(const key of cacheNames){
        const c=await caches.open(key);
        const found=await c.match('/index.html');
        result.push({name:key,hasIndex:!!found,indexStatus:found?.status,entries:(await c.keys()).length});
      }
      const reg=await navigator.serviceWorker.getRegistration();
      return {controller:!!navigator.serviceWorker.controller,state:reg?.active?.state,caches:result};
    });
    console.log('LIVE_PRE_RELOAD_DIAGNOSTIC',JSON.stringify({device:device.name,diagnostic}));
    const fetchDiagnostic=await page.evaluate(async()=>{
      const queries=['/','/index.html','/manifest.webmanifest','/offline-pack-v15.json'];
      const result=[];
      for(const path of queries){try{const r=await fetch(path);result.push({path,status:r.status,len:(await r.arrayBuffer()).byteLength,type:r.type});}catch(e){result.push({path,error:String(e)})}}
      return result;
    });
    console.log('LIVE_CONTROLLED_FETCH_DIAGNOSTIC',JSON.stringify(fetchDiagnostic));
    page.on('requestfailed',r=>console.log('LIVE_FAILED_REQUEST',JSON.stringify({url:r.url(),failure:r.failure()})));
    page.on('console',m=>{if(m.type()==='error')console.log('LIVE_CONSOLE_ERROR',m.text().slice(0,400));});
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    const controlled=await page.evaluate(()=>Boolean(navigator.serviceWorker.controller));
    assert.ok(controlled,'Live PWA must be service-worker controlled');
    await context.setOffline(true);
    const offline=await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(offline?.status(),200,'Live PWA must reload offline');
    const body=await page.locator('body').innerText({timeout:20000});
    assert.ok(body.length>120,'Offline body must have application UI');
    assert.deepEqual(exceptions,[],'Unexpected JS exceptions');
    console.log('LIVE_V18_OFFLINE_PASS',JSON.stringify({
      device:device.name,origin,controlled,offlineHttp:offline.status(),bodyChars:body.length,
      scriptErrors:exceptions.length, ...checked
    }));
    await context.close();
  }
}finally {await browser.close();}
