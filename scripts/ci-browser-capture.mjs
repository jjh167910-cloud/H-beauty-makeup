import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:4173";
mkdirSync("quality-reports/browser-preview", {recursive: true});
const browser = await chromium.launch({headless:true});
const results=[];
try {
 for (const c of [
  {name:"mobile-home",width:390,height:844,path:"/#/"},
  {name:"mobile-makeup",width:390,height:844,path:"/#/makeup"},
  {name:"desktop-makeup",width:1280,height:900,path:"/#/makeup"}
 ]) {
  const page=await browser.newPage({viewport:{width:c.width,height:c.height},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  const response=await page.goto(base+c.path,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForTimeout(1800);
  const text=await page.locator("body").innerText().catch(()=>"");
  const screenshot="quality-reports/browser-preview/"+c.name+".png";
  await page.screenshot({path:screenshot,fullPage:true,animations:"disabled"});
  const images=await page.locator("img").count();
  const broken=await page.locator("img").evaluateAll(els=>els.filter(e=>e.complete && e.naturalWidth===0).length);
  const entry={screen:c.name,status:response?.status(),bodyLength:text.length,imgCount:images,brokenImgs:broken,errors:errors.slice(0,10),screenshot};
  results.push(entry);
  console.log(JSON.stringify(entry));
  if (!response || response.status()>=400 || text.length<40 || errors.length>0) process.exitCode=1;
  await page.close();
 }
} finally {
 await browser.close();
 writeFileSync("quality-reports/browser-preview/results.json",JSON.stringify(results,null,2)+"\n");
}
