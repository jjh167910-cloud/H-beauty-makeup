import { test, expect, type Page } from "playwright/test";

/** Reference: ivory studio photography, no inset photo-within-a-photo border. */
async function assertSeamlessPhoto(page:Page,selector:string) {
  const frame=page.locator(selector).first();
  await frame.scrollIntoViewIfNeeded();
  const image=frame.locator("img").first();
  await expect.poll(()=>image.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const info=await frame.evaluate(node=>{
    const image=node.querySelector("img")!;
    const parent=node.getBoundingClientRect();
    const child=image.getBoundingClientRect();
    const frameCSS=getComputedStyle(node);
    const imageCSS=getComputedStyle(image);
    return {
      bg:frameCSS.backgroundColor,
      border:Math.max(parseFloat(frameCSS.borderTopWidth),parseFloat(frameCSS.borderRightWidth),
        parseFloat(frameCSS.borderBottomWidth),parseFloat(frameCSS.borderLeftWidth)),
      radius:parseFloat(frameCSS.borderTopLeftRadius),
      fit:imageCSS.objectFit,
      padding:Math.max(parseFloat(imageCSS.paddingTop),parseFloat(imageCSS.paddingRight),
        parseFloat(imageCSS.paddingBottom),parseFloat(imageCSS.paddingLeft)),
      inset:Math.max(Math.abs(child.left-parent.left),Math.abs(child.top-parent.top),
        Math.abs(child.right-parent.right),Math.abs(child.bottom-parent.bottom)),
      ratio:parent.width/parent.height,
      sourceRatio:(image as HTMLImageElement).naturalWidth/(image as HTMLImageElement).naturalHeight
    };
  });
  expect(info.bg,selector).toBe("rgb(245, 243, 239)");
  expect(info.border,selector+" must not show a contrasting outline").toBe(0);
  expect(info.radius,selector+" must be softly rounded").toBeGreaterThanOrEqual(14);
  expect(info.fit,selector+" must not crop the hairstyle").toBe("contain");
  expect(info.padding,selector+" must not add an inner frame").toBe(0);
  expect(info.inset,selector+" photo must meet outer rounded frame").toBeLessThanOrEqual(2);
  expect(info.ratio).toBeCloseTo(1,1);
  expect(info.sourceRatio).toBeCloseTo(1,1);
}

async function openHome(page:Page,width:number,theme:"light"|"dark") {
  await page.setViewportSize({width,height:844});
  await page.addInitScript(t=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:t,bookings:[],favNails:[]
    }));
  },theme);
  await page.goto("/#/");
  await expect(page.locator(".salon24-style-card")).toHaveCount(4);
}

for(const width of [320,390,768]) {
  for(const theme of ["dark","light"] as const) {
    test(`reference-like ivory studio frames at ${width}px, ${theme}`,async({page})=>{
      await openHome(page,width,theme);
      for(const selector of [
        ".salon24-hero__photo",
        ".salon24-style-card > .media",
        ".salon24-featured__card > .media",
      ]) await assertSeamlessPhoto(page,selector);
      await page.goto("/#/looks");
      await assertSeamlessPhoto(page,".studio-look-card .look-card__media");
    });
  }
}

test("saved hairstyle frames, discovery and detail use the same full-bleed matte",async({page})=>{
  await openHome(page,390,"dark");
  await page.locator(".salon24-featured__card").first().click();
  await assertSeamlessPhoto(page,".discover__frame");
  await page.getByRole("button",{name:"جزئیات"}).first().click();
  await assertSeamlessPhoto(page,".look-hero.studio-look-detail__hero");
});
