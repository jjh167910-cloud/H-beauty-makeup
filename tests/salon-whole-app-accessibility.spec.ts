import { test, expect, type Page } from "playwright/test";

const routes = ["home","services","looks","makeup","nails","bookings","me","design"] as const;

async function start(page: Page, route: (typeof routes)[number], width = 390) {
  await page.setViewportSize({ width, height: 850 });
  await page.addInitScript(() => {
    localStorage.setItem("hananeh-atelier-v1",
      JSON.stringify({ welcomed:true, theme:"light", bookings:[], favNails:[] }));
  });
  await page.goto(route === "home" ? "/#/" : `/#/${route}`);
  await expect(page.locator("h1")).toHaveCount(1);
}

test("all eight screens have a primary heading and no horizontal page overflow at 320px", async ({page}) => {
  for (const route of routes) {
    await start(page,route,320);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow,route).toBeLessThanOrEqual(1);
  }
});

test("hairstyle archive has a navigable h2 before its h3 cards", async ({page}) => {
  await start(page,"looks");
  await expect(page.getByRole("heading",{name:"آرشیو استایل",level:2})).toBeVisible();
  await expect(page.locator(".studio-look-card h3").first()).toBeVisible();
});

test("home image links do not repeat their adjacent visible names as alternative text", async ({page}) => {
  await start(page,"home");
  const cards=page.locator(".salon24-featured__card");
  await expect(cards).toHaveCount(4);
  const texts=await cards.locator("img").evaluateAll(imgs=>imgs.map(img=>img.getAttribute("alt")));
  expect(texts).toEqual(["","","",""]);
  await expect(cards.first()).toHaveAccessibleName(/مشاهده/);
});

test("primary shared tap targets are at least 44px high on narrow mobile", async ({page}) => {
  await start(page,"home",320);
  const homeLink=page.locator(".salon24-section__head .link").first();
  expect((await homeLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await start(page,"looks",320);
  const chip=page.locator(".chip").first();
  expect((await chip.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  const search=page.locator("#look-search");
  expect((await search.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await start(page,"me",320);
  const options=page.getByRole("radiogroup",{name:"ظاهر برنامه"}).getByRole("radio");
  for (const option of await options.all()) {
    expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await start(page,"nails",320);
  expect((await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test("text scaling keeps screens usable and no horizontal document overflow", async ({page}) => {
  for (const route of ["home","services","looks","makeup","nails","bookings","me"] as const) {
    await start(page,route,390);
    await page.evaluate(()=>document.documentElement.style.fontSize="32px");
    const overflow=await page.evaluate(()=>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow,route).toBeLessThanOrEqual(1);
  }
});
