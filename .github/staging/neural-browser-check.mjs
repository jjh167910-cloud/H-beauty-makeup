import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const url='https://h-beauty-neural-makeup-studio-p8au6h.v2.appdeploy.ai/';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[];
  const requests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('requestfailed',r=>requests.push({url:new URL(r.url()).pathname,reason:r.failure()?.errorText}));
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(response?.status(),200);
  await page.locator('input[type=file]').nth(0).setInputFiles('/tmp/hbeauty-neural-fixtures/source.png');
  await page.locator('input[type=file]').nth(1).setInputFiles('/tmp/hbeauty-neural-fixtures/reference.png');
  await page.locator('input[type=checkbox]').check();
  const btn=page.getByRole('button',{name:/تولید خودکار میکاپ با مدل عصبی/});
  assert.equal(await btn.isEnabled(),true,'Consent plus both photos should enable neural generation');
  console.log('GENERATION_SUBMITTED');
  await btn.click();
  try{
    await page.locator('img.after').waitFor({state:'visible',timeout:160000});
    const imageSrc=await page.locator('img.after').getAttribute('src');
    assert.match(imageSrc,/^blob:/);
    console.log(JSON.stringify({result:'NEURAL_IMAGE_RECEIVED',browserErrors:errors,failedRequests:requests}));
  }catch(err){
    const notice=await page.locator('.feedback').allInnerTexts();
    console.log(JSON.stringify({result:'NO_NEURAL_IMAGE',notice,browserErrors:errors,failedRequests:requests}));
    throw err;
  }
  await page.close();
}finally{await browser.close();}
