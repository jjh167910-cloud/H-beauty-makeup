import { test, expect } from "playwright/test";

const heroName = "موی بلند موج‌دار شکلاتی با چتری سبک";

test("landing and first-visit portrait show the latest owner-selected HB-001", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => localStorage.setItem("hananeh-atelier-v1",
    JSON.stringify({welcomed:true,theme:"light",bookings:[],favNails:[]})));
  await page.goto("/#/");
  const hero = page.locator(".salon24-hero__photo img");
  await expect(hero).toHaveAttribute("src", "/looks/1.webp");
  await expect(page.locator(".salon25-hero__caption h2")).toHaveText(heroName);
  await expect(hero).toHaveJSProperty("complete", true);
  const fullSize = await hero.evaluate(el => {
    const img = el as HTMLImageElement;
    return { width:img.naturalWidth,height:img.naturalHeight };
  });
  expect(fullSize).toEqual({width:1536,height:1536});
});

test("all landing photo cards load eagerly and match the audited catalog selections",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => localStorage.setItem("hananeh-atelier-v1",
    JSON.stringify({welcomed:true,theme:"light",bookings:[],favNails:[]})));
  await page.goto("/#/");
  const categoryPhotos = page.locator(".salon24-style-card img");
  const featuredPhotos = page.locator(".salon24-featured__card img");
  await expect(categoryPhotos).toHaveCount(4);
  await expect(featuredPhotos).toHaveCount(4);
  for(const [locator,ids] of [[categoryPhotos,[30,26,92,43]], [featuredPhotos,[63,55,213,125]]] as const){
    for(let i=0;i<ids.length;i++){
      const image=locator.nth(i);
      await expect(image).toHaveAttribute("src", "/looks/sm/"+ids[i]+".webp");
      await expect(image).toHaveAttribute("loading","eager");
      await expect.poll(()=>image.evaluate((el)=>{
        const img=el as HTMLImageElement;
        return img.complete&&img.naturalWidth===560&&img.naturalHeight===560;
      })).toBe(true);
    }
  }
  const makeup=page.locator(".mk-entry img");
  await expect(makeup).toHaveAttribute("loading","eager");
  await expect.poll(()=>makeup.evaluate(el=>{
    const img=el as HTMLImageElement;
    return img.complete&&img.naturalWidth>0;
  })).toBe(true);
});
