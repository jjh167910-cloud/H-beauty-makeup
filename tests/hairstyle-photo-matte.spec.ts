import { expect, test, type Page } from "playwright/test";

const PHOTO_MATTE = [245, 243, 239];

async function openHome(page: Page, width: number, theme: "light"|"dark") {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(value => {
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true, theme:value, bookings:[], favNails:[]
    }));
  }, theme);
  await page.goto("/#/");
  await expect(page.locator(".salon24-style-card")).toHaveCount(4);
}

async function frameMatchesNativeBackground(page: Page, selector: string) {
  const frame=page.locator(selector).first();
  await frame.scrollIntoViewIfNeeded();
  const image=frame.locator("img").first();
  await expect(image).toHaveJSProperty("complete",true);
  await expect.poll(()=>image.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const data=await frame.evaluate(el=>{
    const img=el.querySelector("img") as HTMLImageElement;
    const raw=getComputedStyle(el).backgroundColor;
    const color=(raw.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const canvas=document.createElement("canvas");
    canvas.width=canvas.height=128;
    const context=canvas.getContext("2d",{willReadFrequently:true})!;
    context.drawImage(img,0,0,128,128);
    const rgba=context.getImageData(0,0,128,128).data;
    const channels=[[],[],[]] as number[][];
    for(let y=0;y<128;y++){
      for(let x=0;x<128;x++){
        if(x>2&&x<125&&y>2&&y<125)continue;
        const i=4*(y*128+x);
        for(let k=0;k<3;k++)channels[k].push(rgba[i+k]);
      }
    }
    const borderMedian=channels.map(values=>{
      values.sort((a,b)=>a-b);
      return values[Math.floor(values.length/2)];
    });
    const box=el.getBoundingClientRect();
    return {
      color, borderMedian,
      originalRatio:img.naturalWidth/img.naturalHeight,
      frameRatio:box.width/box.height,
      imgFit:getComputedStyle(img).objectFit,
    };
  });
  expect(data.color).toEqual(PHOTO_MATTE);
  expect(data.originalRatio).toBeCloseTo(1,2);
  expect(data.frameRatio).toBeCloseTo(1,2);
  expect(data.imgFit).toBe("contain");
  for(let i=0;i<3;i++){
    expect(Math.abs(data.borderMedian[i]-data.color[i])).toBeLessThanOrEqual(4);
  }
}

for(const width of [320,354,390,768]){
  for(const theme of ["light","dark"] as const) {
    test(`hairstyle photograph matte is pixel-matched at ${width}px, ${theme}`,async({page})=>{
      await openHome(page,width,theme);
      for(const selector of [
        ".salon24-hero__photo",
        ".salon24-style-card .media",
        ".salon24-featured__card .media",
      ]) await frameMatchesNativeBackground(page,selector);
      await page.goto("/#/looks");
      await frameMatchesNativeBackground(page,".studio-look-card .look-card__media");
    });
  }
}

test("full-screen and detail photograph mattes remain identical",async({page})=>{
  await openHome(page,354,"dark");
  await page.locator(".salon24-featured__card").first().click();
  await frameMatchesNativeBackground(page,".discover__frame");
  await page.getByRole("button",{name:"جزئیات"}).first().click();
  await frameMatchesNativeBackground(page,".look-hero.studio-look-detail__hero");
});
