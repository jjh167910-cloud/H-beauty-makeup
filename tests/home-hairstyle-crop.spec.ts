import { test, expect, type Page } from "playwright/test";

async function home(page:Page,width:number,theme:"light"|"dark"="dark"){
  await page.setViewportSize({width,height:844});
  await page.addInitScript(theme=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme,bookings:[],favNails:[]
    }));
  },theme);
  await page.goto("/#/");
  await expect(page.locator(".salon24-style-card")).toHaveCount(4);
}

for(const width of [320,354,390,430,768]){
  for(const theme of ["light","dark"] as const){
    test(`home hairstyle photo composition retains all square pixels at ${width}px, ${theme}`,async({page})=>{
      await home(page,width,theme);
      const stage=page.locator(".salon24-hero__photo");
      await expect(stage).toBeVisible();
      await expect(stage.locator("img")).toHaveJSProperty("complete",true);
      const hero=await stage.evaluate(el=>{
        const im=el.querySelector("img")!;
        const r=el.getBoundingClientRect();
        const img=im.getBoundingClientRect();
        return {
          ratio:r.width/r.height,
          sourceRatio:im.naturalWidth/im.naturalHeight,
          fit:getComputedStyle(im).objectFit,
          bounds:img.width>0&&img.height>0,
          natW:im.naturalWidth
        };
      });
      expect(hero.natW).toBeGreaterThanOrEqual(560);
      expect(hero.sourceRatio).toBeCloseTo(1,2);
      expect(hero.ratio).toBeGreaterThan(.98);
      expect(hero.ratio).toBeLessThan(1.02);
      expect(hero.fit).toBe("contain");
      expect(hero.bounds).toBe(true);

      for(const card of await page.locator(".salon24-style-card").all()){
        const photo=card.locator(".media");
        await photo.scrollIntoViewIfNeeded();
        await expect(photo.locator("img")).toHaveJSProperty("complete",true);
        const rect=await photo.evaluate(el=>{
          const im=el.querySelector("img")!;
          const r=el.getBoundingClientRect();
          return {
            ratio:r.width/r.height,
            imgRatio:im.naturalWidth/im.naturalHeight,
            fit:getComputedStyle(im).objectFit,
            loaded:im.naturalWidth>0
          };
        });
        expect(rect.ratio).toBeGreaterThan(.98);
        expect(rect.ratio).toBeLessThan(1.02);
        expect(rect.imgRatio).toBeCloseTo(1,2);
        expect(rect.fit).toBe("contain");
        expect(rect.loaded).toBe(true);
      }
      expect(await page.evaluate(()=>
        document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      if(width<600){
        await expect(page.locator(".salon25-hero__caption > span[lang='en']")).toBeHidden();
        await expect(page.locator(".salon25-hero__caption h2")).toBeVisible();
      }
    });
  }
}

test("homepage hairstyle titles remain outside the photographs and links still navigate",async({page})=>{
  await home(page,354);
  const first=page.locator(".salon24-style-card").first();
  const mediaBox=await first.locator(".media").boundingBox();
  const titleBox=await first.locator("strong").boundingBox();
  expect(titleBox!.y).toBeGreaterThanOrEqual(mediaBox!.y+mediaBox!.height);
  await first.click();
  await expect(page).toHaveURL(/#\/looks/);
});

test("regression detects deliberate reintroduction of portrait crop",async({page})=>{
  await home(page,354);
  await page.addStyleTag({content:".salon24-styles .salon24-style-card > .media {aspect-ratio:3/4 !important;}"});
  const ratio=await page.locator(".salon24-style-card .media").first().evaluate(el=>{
    const r=el.getBoundingClientRect();return r.width/r.height;
  });
  expect(ratio).toBeLessThan(.8);
});

for(const width of [354,390,768]){
  test(`lookbook grid and homepage featured cards show uncropped square photos at ${width}px`,async({page})=>{
    await home(page,width);
    const featured=page.locator(".salon24-featured__card .media").first();
    await featured.scrollIntoViewIfNeeded();
    await expect(featured.locator("img")).toHaveJSProperty("complete",true);
    const square=async (selector:string)=>{
      return page.locator(selector).first().evaluate(el=>{
        const im=el.querySelector("img")!;
        const r=el.getBoundingClientRect();
        return {ratio:r.width/r.height,source:im.naturalWidth/im.naturalHeight,fit:getComputedStyle(im).objectFit,loaded:im.naturalWidth>0};
      });
    };
    let a=await square(".salon24-featured__card .media");
    expect(a.loaded).toBe(true);
    expect(a.ratio).toBeCloseTo(1,1);
    expect(a.source).toBeCloseTo(1,1);
    expect(a.fit).toBe("contain");
    await page.goto("/#/looks");
    const catalog=page.locator(".studio-look-card .look-card__media").first();
    await catalog.scrollIntoViewIfNeeded();
    await expect(catalog.locator("img")).toHaveJSProperty("complete",true);
    a=await square(".studio-look-card .look-card__media");
    expect(a.loaded).toBe(true);
    expect(a.ratio).toBeCloseTo(1,1);
    expect(a.source).toBeCloseTo(1,1);
    expect(a.fit).toBe("contain");
  });
}
