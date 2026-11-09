import { test, expect } from "playwright/test";
import { existsSync, readFileSync } from "node:fs";

const sampleIds=[1,9,24,30,43,77,84,125,141,172,205,292];
const matte=[245,243,239];
// SHA-256 of twelve V3-released 560px WebP images (new release locks).
// This test must run after the production build installs the locked packs.
const sampleSHA:Record<number,string>={
  1:"6535c20a4e6119c73777fa1914d96b60ce60fc52712cff8253c5fb6c8d26d609",
  9:"77d4915285ce50fe370ae755d42498ba01fe8ab711591ad7841bce66829e599f",
  24:"9915bfd4e4a6f0d6162bef7e11b1bfb0462d904312192d516fc8d488a7b687ab",
  30:"58d741b96c5abcd3981bfceb640ba91ab4856e76e0c139d566b1dc13266ea477",
  43:"764eb0a5410f14e7982cc84fdbe207fe3bacb00931004afb6bbfc1a0a7440d42",
  77:"3a4d1d4595e18282936cda06bf33565932114884e3b974100c13893d7d6c580c",
  84:"09556d0340f5a7e2d1c676ac588cba53920f1bc22852c6cddfdf5df90e9a4760",
  125:"f22b923204d2bf2404bd77c4e2ae7f8b36520017f026cce69b4673acb02809c0",
  141:"3428108e9385d8169d20a7cc3168dfc175c1b7a9e53675e6d014fe14fb63e5b1",
  172:"0b9a4cd85bf0bf6e6288e8aa1451c513b94c957ef6a6253d6fb43cc25c85ed96",
  205:"13d6197412189f35a9bdcbd57ef57c339f1f1b1929df9bb5912fbccc1f3f450f",
  292:"71bd7136710b1e17aae5320fba61917351fd070851ca8b385aab469ddb4bbaac"
};

// Preserve the original V3 release SHA-256 locks. The owner-selected HB-001
// edition has a separate fixed lock, never a loosened comparison.
const hb001OverlayLock="assets/hb001-overlay.sha256";
const hb001OverlayThumb="19b999364c0717576da9eb7cdcec3e372b8d90df4104847711f04553dd05cf52";
const hb001OverlayFull="f94145d96dc9c4aca28674b704b7ee61b09564015dbd118d502f060b6d3d5818";
const hasHB001Overlay=existsSync(hb001OverlayLock);
if(hasHB001Overlay){
  expect(readFileSync(hb001OverlayLock,"utf8")).toBe(
    `${hb001OverlayFull}  1.webp\n${hb001OverlayThumb}  1-thumb.webp\n`
  );
}
const activeSampleSHA={...sampleSHA,1:hasHB001Overlay?hb001OverlayThumb:sampleSHA[1]};

test("all sample thumbs have a completely consistent ivory background with intact subjects",async({page})=>{
  await page.goto("/#/");
  const result=await page.evaluate(async ids=>{
    const outcomes=[];
    for(const id of ids){
      const img=new Image();
      img.src=`/looks/sm/${id}.webp`;
      await img.decode();
      const canvas=document.createElement("canvas");
      canvas.width=canvas.height=96;
      const ctx=canvas.getContext("2d",{willReadFrequently:true})!;
      ctx.drawImage(img,0,0,96,96);
      const data=ctx.getImageData(0,0,96,96).data;
      const get=(x:number,y:number)=>{
        const at=4*(y*96+x);
        return [data[at],data[at+1],data[at+2]];
      };
      const corners=[get(0,0),get(95,0),get(0,95),get(95,95)];
      const center=get(48,36);
      outcomes.push({id,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,corners,center});
    }
    return outcomes;
  },sampleIds);
  expect(result).toHaveLength(sampleIds.length);
  for(const photo of result){
    expect(photo.naturalWidth).toBe(560);
    expect(photo.naturalHeight).toBe(560);
    for(const rgb of photo.corners)for(let ch=0;ch<3;ch++)
      expect(Math.abs(rgb[ch]-matte[ch]),`Photo ${photo.id} corner color`).toBeLessThanOrEqual(7);
    const centerVariance=photo.center.map((c,i)=>Math.abs(c-matte[i]));
    expect(Math.max(...centerVariance),`Photo ${photo.id} subject should exist`).toBeGreaterThan(15);
  }
});

for(const width of [320,354,390]){
  test(`native-background portrait cards remain correctly framed at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:850});
    await page.addInitScript(()=>{
      localStorage.setItem("hananeh-atelier-v1",
        JSON.stringify({welcomed:true,theme:"dark",bookings:[],favNails:[]}));
    });
    await page.goto("/#/");
    await expect(page.locator(".salon24-style-card")).toHaveCount(4);
    const corners=await page.locator(".salon24-style-card .media").first().evaluate(async frame=>{
      const img=frame.querySelector("img")!;
      await img.decode();
      const style=getComputedStyle(frame);
      const r=frame.getBoundingClientRect();
      return {fit:getComputedStyle(img).objectFit,bg:style.backgroundColor,ratio:r.width/r.height,photoWidth:img.naturalWidth};
    });
    expect(corners.fit).toBe("contain");
    expect(corners.bg).toBe("rgb(245, 243, 239)");
    expect(corners.ratio).toBeCloseTo(1,1);
    expect(corners.photoWidth).toBe(560);
    const overflow=await page.evaluate(()=>
      document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("browser receives the correct edition-locked assets, not stale thumbnails",async({page})=>{
  await page.goto("/#/");
  const results=await page.evaluate(async pairs=>{
    const output=[];
    for(const [id,expected] of pairs){
      const response=await fetch(`/looks/sm/${id}.webp`,{cache:"no-store"});
      if(!response.ok)throw new Error("Missing hairstyle thumb "+id);
      const data=await response.arrayBuffer();
      const digest=await crypto.subtle.digest("SHA-256",data);
      const actual=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
      output.push({id,expected,actual});
    }
    return output;
  },Object.entries(activeSampleSHA));
  for(const entry of results)
    expect(entry.actual,`style ${entry.id} must use the exact SHA-locked active edition export`).toBe(entry.expected);
});
