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
    await context.setOffline(true);
    const offlineResponse=await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    assert.ok(offlineResponse?.ok(),'Cached app shell must reload without any network');
    const offlineBody=await page.locator('body').innerText({timeout:15000});
    assert.ok(offlineBody.length>20,'Offline view should contain meaningful application text');
    assert.equal(exceptions.length,0,'Browser JS exceptions on online/offline shell');
    console.log(JSON.stringify({test:'offline_shell',viewport:viewport.name,controlled,offlineHTTP:offlineResponse?.status(),title,offlineTextChars:offlineBody.length,externalRequests:external.length,jsErrors:exceptions}));
    await context.close();
  }
}finally{await browser.close();}
