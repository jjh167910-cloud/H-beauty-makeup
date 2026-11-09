import { test, expect } from "playwright/test";

/**
 * Native-detail check for approved AI-generated photographic references.
 *
 * File dimensions can be forged by upscaling a 186px contact sheet crop
 * to 640px. Four-neighbor grayscale Laplacian variance detects the loss of
 * local detail. This is a screening gate, not proof of photographic realism.
 *
 * The V4 nine-photo source pack was calibrated against its actual WebPs:
 * original values ≈80–512; many superseded small contact-sheet crops <40.
 */
const references=[
  "nail-milky-silk","nail-ballet-pink","nail-old-money",
  "nail-ruby-red","nail-merlot","nail-cocoa",
  "nail-classic-french","nail-pearl-chrome","nail-marble",
];

test("nine premium WebPs have genuine fine detail, not enlarged contact-sheet softness",async({page})=>{
  await page.goto("/#/nails");
  const measurements=await page.evaluate(async(names)=>{
    function detailVariance(canvas:HTMLCanvasElement) {
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw new Error("Image context unavailable");
      const {width:w,height:h}=canvas;
      const rgba=ctx.getImageData(0,0,w,h).data;
      const gray=new Float32Array(w*h);
      for(let p=0;p<gray.length;p++){
        const q=p*4;
        gray[p]=.114*rgba[q+2]+.587*rgba[q+1]+.299*rgba[q];
      }
      // Same four-neighbor Laplacian kernel as OpenCV:
      // [0,1,0; 1,-4,1; 0,1,0]. Ignore the image border.
      let count=0,sum=0,sumSquared=0;
      for(let y=1;y<h-1;y++){
        const row=y*w;
        for(let x=1;x<w-1;x++){
          const p=row+x;
          const v=gray[p-1]+gray[p+1]+gray[p-w]+gray[p+w]-4*gray[p];
          sum+=v;sumSquared+=v*v;count++;
        }
      }
      return sumSquared/count-Math.pow(sum/count,2);
    }
    const checked=[];
    for(const name of names){
      const img=new Image();
      img.decoding="async";
      img.src=`/nails/photos/${name}.webp`;
      await img.decode();
      const canvas=document.createElement("canvas");
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw new Error("Canvas unavailable");
      ctx.drawImage(img,0,0);
      checked.push({name,width:canvas.width,height:canvas.height,sharpness:detailVariance(canvas)});
    }
    // Deliberately emulate a previously rejected 186px contact-sheet crop,
    // enlarged to look like a native 640px picture.
    const sample=new Image();
    sample.src="/nails/photos/nail-marble.webp";
    await sample.decode();
    const small=document.createElement("canvas");
    small.width=186;small.height=186;
    const sc=small.getContext("2d");
    if(!sc)throw new Error("Canvas unavailable");
    sc.drawImage(sample,0,0,186,186);
    const fake=document.createElement("canvas");
    fake.width=640;fake.height=640;
    const fc=fake.getContext("2d");
    if(!fc)throw new Error("Canvas unavailable");
    fc.imageSmoothingEnabled=true;
    fc.imageSmoothingQuality="high";
    fc.drawImage(small,0,0,640,640);
    return {checked,forgedSharpness:detailVariance(fake)};
  },references);
  for(const item of measurements.checked){
    expect(item.width,`${item.name} width`).toBeGreaterThanOrEqual(600);
    expect(item.height,`${item.name} height`).toBeGreaterThanOrEqual(600);
    expect(item.sharpness,`${item.name}: enlarged/soft-looking image`).toBeGreaterThan(60);
  }
  expect(measurements.forgedSharpness,"Upscaled 186px crop should be rejected").toBeLessThan(25);
});
