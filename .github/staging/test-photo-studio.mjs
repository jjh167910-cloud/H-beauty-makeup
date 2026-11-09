import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const cases=[{width:390,height:844,name:'mobile'},{width:1280,height:900,name:'desktop'}];
try{
  for(const c of cases){
    const page=await browser.newPage({viewport:{width:c.width,height:c.height},acceptDownloads:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    const response=await page.goto('http://127.0.0.1:4174/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(response?.status(),200);
    assert.match(await page.locator('body').innerText(),/NOT NEURAL V14/);
    await page.getByRole('button',{name:'نمونه شماتیک برای آزمایش رابط'}).click();
    const stage=page.locator('#stage');
    await stage.waitFor({state:'visible'});
    const rect=await page.locator('#brushCanvas').boundingBox();
    assert.ok(rect && rect.width>=100 && rect.height>=100,'Canvas must have real dimensions');
    assert.match(await page.locator('#dimensions').innerText(),/۷۲۰|720/);
    await page.locator('#validate').click();
    assert.match(await page.locator('#notice').innerText(),/باید یک ماسک/);
    const x=rect.x+rect.width*.52;
    const y=rect.y+rect.height*.60;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x+Math.max(8,rect.width*.07),y,{steps:7});
    await page.mouse.up();
    const diagnostic=await page.evaluate(()=>{
      const c=document.querySelector('#brushCanvas');
      const ctx=c.getContext('2d');
      const img=ctx.getImageData(0,0,c.width,c.height).data;
      let visible=0;for(let i=3;i<img.length;i+=4)if(img[i]>0)visible++;
      const r=c.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width*.52,r.y+r.height*.60);
      return {visibleOverlayPixels:visible,canvasWidth:c.width,canvasHeight:c.height,cssWidth:r.width,cssHeight:r.height,hitId:hit?.id,hitTag:hit?.tagName};
    });
    console.log('BRUSH_DIAGNOSTICS',JSON.stringify({viewport:c.name,...diagnostic}));
    await page.locator('#validate').click();
    assert.match(await page.locator('#notice').innerText(),/بررسی موفق/);
    const p=page.waitForEvent('download');
    await page.locator('#export').click();
    const d=await p;
    assert.equal(d.suggestedFilename(),'H-Beauty-Makeup-Preview.png');
    const bytes=readFileSync(await d.path());
    assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a','PNG signature');
    assert.equal(bytes.readUInt32BE(16),720,'source width preserved');
    assert.equal(bytes.readUInt32BE(20),900,'source height preserved');
    assert.deepEqual(errors,[],'No browser errors');
    console.log(JSON.stringify({viewport:c.name,canvas:[Math.round(rect.width),Math.round(rect.height)],png:[720,900],runtimeErrors:errors.length,result:'PASS'}));
    await page.close();
  }
} finally {await browser.close();}
