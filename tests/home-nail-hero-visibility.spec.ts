import { expect, test, type Page } from "playwright/test";

async function openHome(page:Page, width:number, theme:"light"|"dark"="light"){
  await page.setViewportSize({width,height:850});
  await page.addInitScript(theme => {
    localStorage.setItem("hananeh-atelier-v1",
      JSON.stringify({welcomed:true,theme,bookings:[],favNails:[]}));
  }, theme);
  await page.goto("/#/");
}

async function artGeometry(page:Page){
  return page.locator(".nail-home-banner").evaluate(el=>{
    const art=el.querySelector<HTMLElement>(".nail-home-banner__art")!;
    const banner=el.getBoundingClientRect();
    const box=art.getBoundingClientRect();
    const photo=art.querySelector<HTMLImageElement>(".nail-visual__photo");
    return {
      bannerWidth:banner.width,bannerHeight:banner.height,
      artWidth:box.width,artHeight:box.height,
      insideX:box.left>=banner.left-2 && box.right<=banner.right+2,
      insideY:box.top>=banner.top-2 && box.bottom<=banner.bottom+2,
      photoReady:photo?.complete && photo.naturalWidth>0,
      source:art.dataset.mediaSource,
      position:getComputedStyle(art).position
    };
  });
}

for(const width of [320,390,430,768]){
  for(const theme of ["light","dark"] as const){
    test(`home nail preview is genuinely visible at ${width}px in ${theme} theme`,async({page})=>{
      await openHome(page,width,theme);
      const banner=page.locator(".nail-home-banner");
      await banner.scrollIntoViewIfNeeded();
      await expect(banner.locator(".nail-home-banner__art[data-media-source='ai-photo']")).toBeVisible();
      const g=await artGeometry(page);
      expect(g.position).toBe("absolute");
      expect(g.photoReady).toBe(true);
      expect(g.artHeight).toBeGreaterThan(g.bannerHeight*.8);
      expect(g.artWidth).toBeGreaterThan(g.bannerWidth*.4);
      expect(g.insideX).toBe(true);
      expect(g.insideY).toBe(true);
      await banner.click();
      await expect(page).toHaveURL(/#\/nails/);
    });
  }
}

test("the geometry regression detects deliberately collapsed artwork",async({page})=>{
  await openHome(page,390);
  await page.locator(".nail-home-banner").scrollIntoViewIfNeeded();
  const normal=await artGeometry(page);
  expect(normal.artHeight).toBeGreaterThan(100);
  await page.addStyleTag({content:".nail-home-banner > .nail-home-banner__art { height:0 !important; }"});
  const broken=await artGeometry(page);
  expect(broken.artHeight).toBe(0);
  expect(broken.artHeight>broken.bannerHeight*.8).toBe(false);
});

test("failed preview photo retains nonzero-sized accurate vector fallback",async({page})=>{
  await page.route("**/nails/photos/nail-pearl-chrome.webp",route=>route.abort());
  await openHome(page,390);
  await page.locator(".nail-home-banner").scrollIntoViewIfNeeded();
  await expect(page.locator(".nail-home-banner__art[data-media-source='vector']")).toBeVisible();
  const g=await artGeometry(page);
  expect(g.artHeight).toBeGreaterThan(g.bannerHeight*.8);
  await expect(page.locator(".nail-home-banner__art .nail-visual__fallback svg")).toBeVisible();
});
