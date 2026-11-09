import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright";
import {auditNailPixels} from "../scripts/review-nail-photo-pixels.mjs";

test("a large sharp multi-panel WebP cannot enter the approved photo queue",{timeout:120000},async()=>{
  const folder=mkdtempSync(join(tmpdir(),"hbeauty-contact-sheet-"));
  const browser=await chromium.launch({headless:true,...(process.env.CI?{channel:"chrome"}:{})});
  try{
    const page=await browser.newPage();
    const base64=await page.evaluate(()=>{
      const canvas=document.createElement("canvas");
      canvas.width=1200;canvas.height=900;
      const ctx=canvas.getContext("2d");
      if(!ctx)throw Error("No canvas");
      const image=ctx.createImageData(1200,900);
      const data=image.data;
      // Sharp independent-looking panels with pale neutral gutters. Fine
      // per-panel texture keeps this example from being rejected only for
      // lack of detail or low file entropy.
      for(let y=0;y<900;y++)for(let x=0;x<1200;x++){
        const k=(y*1200+x)*4;
        const seam=(x>0&&x%200<4)||(y>0&&y%300<4);
        const panelX=Math.floor(x/200),panelY=Math.floor(y/300);
        const n=((x*73)^(y*151)^(x*y))&63;
        if(seam){
          data[k]=248;data[k+1]=244;data[k+2]=239;
        }else{
          data[k]=60+panelX*18+n;
          data[k+1]=35+panelY*35+n;
          data[k+2]=48+((panelX+panelY)%4)*23+n;
        }
        data[k+3]=255;
      }
      ctx.putImageData(image,0,0);
      return canvas.toDataURL("image/webp",.88).split(",")[1];
    });
    await page.close();
    const bytes=Buffer.from(base64,"base64");
    assert.ok(bytes.length>=25000&&bytes.length<=2000000,
      "Test fixture must reach the pixel gate instead of failing file-size screening");
    writeFileSync(join(folder,"pedi-french.webp"),bytes);
    const report=await auditNailPixels(folder);
    assert.equal(report.status,"REJECTED");
    assert.equal(report.candidateCount,1);
    assert.ok(report.failures.some(f=>f.includes("multi-panel contact sheet detected")),
      "Expected explicit contact-sheet rejection: "+JSON.stringify(report.failures));
  }finally{
    await browser.close();
    rmSync(folder,{recursive:true,force:true});
  }
});
