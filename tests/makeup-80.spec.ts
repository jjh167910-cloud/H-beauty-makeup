import { test, expect, type Page } from "playwright/test";

/** Run: VITE_MAKEUP_CURATED_80=true npm run test:ui
 * This suite is skipped in the legacy edition.
 */
test.skip(process.env.VITE_MAKEUP_CURATED_80 !== "true", "The 80-portrait edition is explicitly opt-in");

async function seed(page: Page) {
 await page.addInitScript(() => {
  localStorage.setItem("hananeh-atelier-v1",
   JSON.stringify({ welcomed: true, theme: "light", bookings: [], favMakeup: [] }));
 });
}

test("original and new sets form exactly eighty named portraits with no missing media",async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 await seed(page);
 await page.goto("/#/makeup");
 await page.getByRole("button",{name:/همه سبک‌ها/}).first().click();
 const cards=page.locator(".mk-grid .mk-card");
 await expect(cards).toHaveCount(80);
 await expect(page.getByRole("group",{name:"مجموعه تصاویر میکاپ"})).toBeVisible();
 await expect(cards.first()).toContainText("Classic Bride");
 await expect(cards.last()).toContainText("J-Beauty Coral");
 const imgs=await cards.locator("img").evaluateAll(nodes=>nodes.map(n=>(n as HTMLImageElement).getAttribute("src")));
 expect(new Set(imgs).size).toBe(80);
 expect(imgs.every(x=>x?.startsWith("/makeup/curated-"))).toBe(true);
 await expect(cards.first().locator("img")).toHaveJSProperty("naturalWidth",480);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 await page.screenshot({path:"test-results/makeup80-390.png",fullPage:true});
});

test("new collection and original collection both filter to forty styles",async ({page})=>{
 await seed(page);await page.goto("/#/makeup");
 await page.getByRole("button",{name:/همه سبک‌ها/}).first().click();
 const grp=page.getByRole("group",{name:"مجموعه تصاویر میکاپ"});
 await grp.getByRole("button",{name:"۴۰ سبک جدید"}).click();
 await expect(page.locator(".mk-grid .mk-card")).toHaveCount(40);
 await expect(page.locator(".mk-grid")).toContainText("Office Polished");
 await expect(page.locator(".mk-grid")).not.toContainText("Classic Bride");
 await grp.getByRole("button",{name:"مجموعهٔ اول"}).click();
 await expect(page.locator(".mk-grid .mk-card")).toHaveCount(40);
 await expect(page.locator(".mk-grid")).toContainText("Classic Bride");
 await expect(page.locator(".mk-grid")).not.toContainText("Office Polished");
});

test("search, favorites, detail and salon booking use the same stable style ID",async ({page})=>{
 await seed(page);await page.goto("/#/makeup");
 await page.getByRole("button",{name:/همه سبک‌ها/}).first().click();
 const search=page.getByRole("button",{name:"جست‌وجو"});
 await search.click();
 const q=page.getByRole("searchbox",{name:"جست‌وجوی سبک میکاپ"});
 await q.fill("Yalda Night");
 await expect(page.locator(".mk-grid .mk-card")).toHaveCount(1);
 const card=page.locator(".mk-grid .mk-card").first();
 await card.getByRole("button",{name:/ذخیره/}).click();
 await expect(card.getByRole("button",{name:/حذف/})).toBeVisible();
 await card.getByRole("button",{name:/جزئیات سبک/}).click();
 const dialog=page.getByRole("dialog",{name:/جزئیات سبک میکاپ/});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByText("Yalda Night")).toBeVisible();
 await expect(dialog.getByRole("button",{name:"درخواست نوبت"})).toBeVisible();
 await dialog.getByRole("button",{name:/بستن/}).first().click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}"));
 expect(stored.favMakeup).toContain("mk80-70");
});
