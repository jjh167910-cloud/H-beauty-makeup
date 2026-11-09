import { test, expect, type Page } from "playwright/test";

async function openManicure(page:Page){
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",
      JSON.stringify({welcomed:true,theme:"light",bookings:[],favNails:[]}));
  });
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
}

test("featured manicure photograph has real dimensions and is not collapsed",async({page})=>{
  await openManicure(page);
  const image=page.locator(".nail-hero__art");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("data-media-source","ai-photo");
  const fallbackVisibility=await image.locator(".nail-visual__fallback")
    .evaluate(el=>getComputedStyle(el).visibility);
  expect(fallbackVisibility).toBe("hidden");
  const size=await image.boundingBox();
  expect(size?.height).toBeGreaterThan(260);
  expect(size?.width).toBeGreaterThan(135);
});

test("search retains original #38 and uses an appropriately sized single result",async({page})=>{
  await openManicure(page);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("مخمل مات نیمه‌شب");
  const card=page.locator(".nail-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("38 / Midnight Velvet Matte");
  await expect(card.locator(".nail-visual[data-media-source='ai-photo']")).toBeVisible();
  const cardBox=await card.boundingBox();
  const photoBox=await card.locator(".nail-visual").boundingBox();
  expect(cardBox?.width).toBeGreaterThan(270);
  expect(photoBox?.height).toBeGreaterThan(280);
  await card.getByRole("button",{name:"مشاهده طرح مخمل مات نیمه‌شب"}).click();
  await expect(page.getByRole("dialog",{name:"مخمل مات نیمه‌شب"})).toBeVisible();
});

test("single manicure search result keeps its full-width layout on desktop",async({page})=>{
  await openManicure(page);
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("مخمل مات نیمه‌شب");
  const box=await page.locator(".nail-card").boundingBox();
  expect(box?.width).toBeGreaterThan(270);
});

test("empty search result gives immediate feedback and a clear action",async({page})=>{
  await openManicure(page);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("no-such-nail-style-493");
  await expect(page.locator(".nail-card")).toHaveCount(0);
  await expect(page.locator(".nail-search-feedback")).toContainText("هیچ طرحی");
  await page.getByRole("button",{name:"پاک کردن جست‌وجو"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
});

test("photo-only gallery recovers after a temporary image request failure",async({page})=>{
  await page.route("**/nails/photos/nail-milky-silk.webp",route=>route.abort("failed"));
  await openManicure(page);
  const card=page.locator(".nail-card").filter({hasText:"شیری ابریشمی"});
  await expect(card.locator(".nail-visual[data-media-source='vector']")).toBeVisible();
  // Ruby Rouge is included even in the four-photo development whitelist.
  const intact=page.locator(".nail-card").filter({hasText:"قرمز یاقوتی"});
  // Source cards are intentionally lazy-loaded; scrolling makes this a real
  // successfully decoded neighbor before testing that reconnect preserves it.
  await intact.scrollIntoViewIfNeeded();
  await expect(intact.locator(".nail-visual[data-media-source='ai-photo']")).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await page.unroute("**/nails/photos/nail-milky-silk.webp");
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(card.locator(".nail-visual[data-media-source='ai-photo']")).toBeVisible();
  await expect(intact.locator(".nail-visual[data-media-source='ai-photo']")).toBeVisible();
});

test("narrow 320px manicure gallery has no horizontal page overflow",async({page})=>{
  await openManicure(page);
  await page.setViewportSize({width:320,height:740});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
