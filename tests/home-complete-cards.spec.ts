import { test, expect, type Page } from "playwright/test";

async function open(page:Page,width:number){
  await page.setViewportSize({width,height:844});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:"dark",bookings:[],favNails:[]
    }));
  });
  await page.goto("/#/");
  await expect(page.locator(".salon24-style-card")).toHaveCount(4);
  await expect(page.locator(".salon24-featured__card")).toHaveCount(4);
}

for(const width of [320,354,390,430,768,1280]){
  test(`full homepage photo cards never peek or clip at ${width}px`,async({page})=>{
    await open(page,width);
    const items=page.locator(".salon24-style-card,.salon24-featured__card");
    const cards=await items.evaluateAll(nodes=>nodes.map(el=>{
      const b=el.getBoundingClientRect();
      const img=el.querySelector("img") as HTMLImageElement;
      const f=img?.parentElement?.getBoundingClientRect();
      const i=img?.getBoundingClientRect();
      return {
        left:b.left,right:b.right,width:b.width,
        frameWidth:f?.width||0,frameHeight:f?.height||0,
        imageLeft:i?.left||0,imageRight:i?.right||0,
        frameLeft:f?.left||0,frameRight:f?.right||0,
        fit:img?getComputedStyle(img).objectFit:"",
        matte:img?.parentElement?getComputedStyle(img.parentElement).backgroundColor:"",
        frameBorder:img?.parentElement?getComputedStyle(img.parentElement).borderTopWidth:"",
        imgWidth:img?.naturalWidth||0,imgHeight:img?.naturalHeight||0,
      };
    }));
    expect(cards).toHaveLength(8);
    for(const [i,c] of cards.entries()){
      expect(c.left, String(i)).toBeGreaterThanOrEqual(-1);
      expect(c.right, String(i)).toBeLessThanOrEqual(width+1);
      expect(c.width).toBeGreaterThan(95);
      expect(c.frameWidth/c.frameHeight).toBeCloseTo(1,1);
      expect(c.fit).toBe("contain");
      // Reference studio cards have no secondary picture-within-picture border:
      // the entire verified WebP must meet its ivory rounded frame.
      expect(Math.abs(c.imageLeft-c.frameLeft)).toBeLessThanOrEqual(2);
      expect(Math.abs(c.frameRight-c.imageRight)).toBeLessThanOrEqual(2);
      expect(c.matte).toBe("rgb(245, 243, 239)");
      expect(c.frameBorder).toBe("0px");
      // Offscreen cards may be lazy-loaded: test their geometry here;
      // decoded pixel integrity is covered by the dedicated image suite.
      if(c.imgWidth>0)expect(c.imgWidth/c.imgHeight).toBeCloseTo(1,1);
    }
    const pageWidth=await page.evaluate(()=>
      document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(pageWidth).toBeLessThanOrEqual(1);
  });
}

test("mobile gallery cards show the complete square photo edge-to-edge on the ivory matte",async({page})=>{
  await open(page,354);
  await page.goto("/#/looks");
  const card=page.locator(".studio-look-card .look-card__media").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator("img")).toHaveJSProperty("complete",true);
  const measure=await card.evaluate(el=>{
    const a=el.getBoundingClientRect();
    const im=el.querySelector("img") as HTMLImageElement;
    const b=im.getBoundingClientRect();
    return {w:a.width,h:a.height,imageW:b.width,imageH:b.height,xpad:b.left-a.left,ypad:b.top-a.top,
      fit:getComputedStyle(im).objectFit,naturalW:im.naturalWidth,
      matte:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth};
  });
  expect(measure.w/measure.h).toBeCloseTo(1,1);
  expect(Math.abs(measure.xpad)).toBeLessThanOrEqual(2);
  expect(Math.abs(measure.ypad)).toBeLessThanOrEqual(2);
  expect(measure.imageW).toBeCloseTo(measure.w,0);
  expect(measure.imageH).toBeCloseTo(measure.h,0);
  expect(measure.matte).toBe("rgb(245, 243, 239)");
  expect(measure.border).toBe("0px");
  expect(measure.fit).toBe("contain");
  expect(measure.naturalW).toBeGreaterThan(0);
});

test("homepage cards navigate without relying on offscreen partial slides",async({page})=>{
  await open(page,354);
  await page.locator(".salon24-style-card").last().click();
  await expect(page).toHaveURL(/#\/looks/);
});

test("hairstyle detail sheet shows the original square photograph without cover crop",async({page})=>{
  await open(page,354);
  await page.locator(".salon24-featured__card").first().click();
  await expect(page.locator(".discover__frame").first()).toBeVisible();
  await page.getByRole("button",{name:"جزئیات"}).first().click();
  const hero=page.locator(".look-hero.studio-look-detail__hero");
  await expect(hero).toBeVisible();
  const shape=await hero.evaluate(el=>{
    const r=el.getBoundingClientRect();
    const img=el.querySelector("img") as HTMLImageElement;
    return {ratio:r.width/r.height,fit:getComputedStyle(img).objectFit,
      pad:getComputedStyle(img).paddingTop,matte:getComputedStyle(el).backgroundColor};
  });
  expect(shape.ratio).toBeCloseTo(1,1);
  expect(shape.fit).toBe("contain");
  expect(parseFloat(shape.pad)).toBe(0);
  expect(shape.matte).toBe("rgb(245, 243, 239)");
});

test("full-screen discovery shows uncut photo in a square canvas",async({page})=>{
  await open(page,354);
  const featured=page.locator(".salon24-featured__card").first();
  await featured.scrollIntoViewIfNeeded();
  await featured.click();
  const frame=page.locator(".discover__frame").first();
  await expect(frame).toBeVisible();
  const shape=await frame.evaluate(el=>{
    const r=el.getBoundingClientRect(),img=el.querySelector("img") as HTMLImageElement;
    return {ratio:r.width/r.height,fit:getComputedStyle(img).objectFit};
  });
  expect(shape.ratio).toBeCloseTo(1,1);
  expect(shape.fit).toBe("contain");
});
