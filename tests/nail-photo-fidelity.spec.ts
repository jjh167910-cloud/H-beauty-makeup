import { test, expect } from "playwright/test";

/**
 * Real WebP acceptance test, not merely a checksum test.
 * Decode the exact nine full-size approved source images in Chromium, and
 * compare downsampled pixels. Hashes alone cannot detect near-duplicates.
 * 32x32 mean absolute difference threshold intentionally catches the previous
 * midnight-glitter / black-French near-duplicate (~.0034).
 */
const ids=[
  "nail-milky-silk","nail-ballet-pink","nail-old-money",
  "nail-ruby-red","nail-merlot","nail-cocoa",
  "nail-classic-french","nail-pearl-chrome","nail-marble",
];

test("nine approved editorial WebPs decode at 600px+ and have distinct compositions",async({page})=>{
  await page.goto("/#/nails");
  const result=await page.evaluate(async(names)=>{
    const entries=await Promise.all(names.map(async name=>{
      const image=new Image();
      image.decoding="async";
      image.src=`/nails/photos/${name}.webp`;
      await image.decode();
      const canvas=document.createElement("canvas");
      canvas.width=32;canvas.height=32;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw new Error("Cannot create thumbnail audit canvas");
      ctx.drawImage(image,0,0,32,32);
      return {name,width:image.naturalWidth,height:image.naturalHeight,
        rgb:Array.from(ctx.getImageData(0,0,32,32).data).filter((_,i)=>i%4!==3)};
    }));
    let minDiff=1;
    let closest=["",""];
    for(let i=0;i<entries.length;i++){
      for(let j=i+1;j<entries.length;j++){
        const a=entries[i].rgb,b=entries[j].rgb;
        let total=0;
        for(let k=0;k<a.length;k++)total+=Math.abs(a[k]-b[k]);
        const difference=total/(255*a.length);
        if(difference<minDiff){minDiff=difference;closest=[entries[i].name,entries[j].name];}
      }
    }
    return {count:entries.length,sizes:entries.map(x=>({name:x.name,width:x.width,height:x.height})),
      minDiff,closest};
  },ids);
  expect(result.count).toBe(9);
  for(const size of result.sizes){
    expect(size.width,`${size.name} width`).toBeGreaterThanOrEqual(600);
    expect(size.height,`${size.name} height`).toBeGreaterThanOrEqual(600);
  }
  expect(result.minDiff,`Photographs too similar: ${result.closest.join(" / ")}`).toBeGreaterThan(.045);
});
