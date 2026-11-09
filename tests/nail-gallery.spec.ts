import { test, expect, type Page } from "playwright/test";

async function ready(page: Page, width: number) {
  await page.setViewportSize({width, height:850});
  await page.addInitScript(() => {
    if (!localStorage.getItem("hananeh-atelier-v1")) {
      localStorage.setItem("hananeh-atelier-v1",
        JSON.stringify({ welcomed: true, theme:"light", bookings: [], favNails: [] }));
    }
  });
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
}

for (const width of [320,390,768]) {
  test(`nail art gallery responsive with usable filters at ${width}px`,async({page})=>{
    await ready(page,width);
    const cards=page.locator(".nail-card");
    await expect(cards).toHaveCount(24);
    const over=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
    await page.getByRole("button",{name:"فیلترها"}).click();
    await page.getByRole("group",{name:"فیلتر نوع طراحی ناخن"}).getByRole("button",{name:"فرنچ"}).click();
    await expect(cards).toHaveCount(24);
    await page.getByRole("group",{name:"فیلتر فرم ناخن"}).getByRole("button",{name:"بادامی"}).click();
    await expect(cards).toHaveCount(14);
    const save=cards.first().getByRole("button",{name:/ذخیره طرح/});
    const box=await save.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });
}

test("nail inspiration favorite remains after reload and saved filter works",async({page})=>{
  await ready(page,390);
  await page.getByRole("button",{name:"ذخیره طرح شیری ابریشمی"}).click();
  await expect(page.getByRole("button",{name:"طرح‌های ناخن ذخیره‌شده"})).toContainText("۱");
  await page.reload();
  await expect(page.getByRole("button",{name:"طرح‌های ناخن ذخیره‌شده"})).toContainText("۱");
  await page.getByRole("button",{name:"طرح‌های ناخن ذخیره‌شده"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(1);
  await expect(page.locator(".nail-card").first()).toContainText("شیری ابریشمی");
});

test("selected nail reference is shown in booking wizard",async({page})=>{
  await ready(page,390);
  await page.getByRole("button",{name:"مشاهده طرح فرنچ کلاسیک"}).click();
  await expect(page.getByRole("dialog",{name:"فرنچ کلاسیک"})).toBeVisible();
  await page.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  await expect(page.getByRole("dialog",{name:"درخواست نوبت"})).toBeVisible();
  await expect(page.getByText("طرح ناخن انتخاب‌شده")).toBeVisible();
  await expect(page.getByText(/فرنچ کلاسیک/).first()).toBeVisible();
  const persisted=await page.evaluate(()=>localStorage.getItem("hananeh-atelier-v1"));
  expect(persisted).not.toBeNull();
});

test("nail gallery is accessible from services and home entry",async({page})=>{
  await ready(page,390);
  await page.getByRole("button",{name:"بازگشت به خدمات"}).click();
  await page.getByRole("group",{name:"دسته‌بندی خدمات"}).getByRole("button",{name:"مانیکور و پدیکور"}).click();
  await page.getByRole("button",{name:"ورود به گالری طراحی ناخن"}).click();
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
  await page.getByRole("button",{name:"حنانه بیوتی، خانه"}).click();
  await page.getByRole("button",{name:"دیدن گالری 298 طرح ناخن"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
});

test("nail search and empty state reset without breaking navigation",async({page})=>{
  await ready(page,390);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("NOT-A-NAIL");
  await expect(page.getByText("طرحی با این فیلترها پیدا نشد.")).toBeVisible();
  await page.getByRole("button",{name:"نمایش همه طرح‌ها"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
});


test("submitted booking persists exact selected nail style ID",async({page})=>{
  await ready(page,390);
  await page.getByRole("button",{name:"مشاهده طرح فرنچ کلاسیک"}).click();
  await page.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  const wizard=page.getByRole("dialog",{name:"درخواست نوبت"});
  await expect(wizard).toBeVisible();
  await wizard.getByRole("button",{name:"ادامه"}).click(); // choose stylist
  await wizard.getByRole("button",{name:"ادامه"}).click(); // choose time
  await wizard.locator(".slot").first().click();
  await wizard.getByRole("button",{name:"ادامه"}).click();
  await wizard.getByRole("textbox",{name:"نام و نام خانوادگی"}).fill("کاربر آزمایشی");
  await wizard.getByRole("textbox",{name:"شماره همراه"}).fill("09123456789");
  await wizard.getByRole("button",{name:"ثبت درخواست"}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const item=JSON.parse(localStorage.getItem("hananeh-atelier-v1") || "{}").bookings?.[0];
    return item?.nailStyleId;
  })).toBe("nail-classic-french");
});

test("failed photo requests preserve accurate vector artwork and detail",async({page})=>{
  await page.route("**/nails/photos/nail-milky-silk.webp",route=>route.abort("failed"));
  await ready(page,390);
  const card=page.locator(".nail-card").filter({hasText:"شیری ابریشمی"});
  await expect(card).toBeVisible();
  await expect(card.locator(".nail-visual__fallback svg")).toBeVisible();
  // Simulate a failed connection: never leave a broken image overlay.
  await expect(card.locator("img.nail-visual__photo")).toHaveCount(0);
  await card.getByRole("button",{name:"مشاهده طرح شیری ابریشمی"}).click();
  await expect(page.getByRole("dialog",{name:"شیری ابریشمی"})).toBeVisible();
});

test("shipped WebP displays in gallery without hiding alt fallback",async({page})=>{
  await ready(page,390);
  const card=page.locator(".nail-card").filter({hasText:"شیری ابریشمی"});
  await expect(card.locator(".nail-visual__photo[data-ready]")).toBeVisible();
  const crop=await card.locator(".nail-visual__photo").evaluate(el=>
    getComputedStyle(el).objectFit);
  expect(crop).toBe("cover");
  await expect(card.locator(".nail-visual__fallback svg")).toHaveCount(1);
});

test("pedicure has six dedicated designs, distinct from manicure", async ({ page }) => {
  await ready(page,320);
  const group=page.getByRole("group",{name:"انتخاب گالری دست یا پا"});
  await group.getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await expect(page.getByRole("heading",{name:"گالری پدیکور"})).toBeVisible();
  await expect(page.locator(".nail-card")).toHaveCount(24);
  await expect(page.locator(".nail-card svg[aria-label*='پدیکور']").first()).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await group.getByRole("button",{name:"مانیکور · ۲۲۰ طرح"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
});

test("pedicure reference is saved in the existing appointment flow", async ({page}) => {
  await ready(page,390);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"}).getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await page.getByRole("button",{name:"مشاهده طرح پدیکور قرمز یاقوتی"}).click();
  const detail=page.getByRole("dialog",{name:"پدیکور قرمز یاقوتی"});
  await expect(detail).toBeVisible();
  await detail.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  const booking=page.getByRole("dialog",{name:"درخواست نوبت"});
  await expect(booking).toBeVisible();
  await expect(booking.getByText("پدیکور قرمز یاقوتی").first()).toBeVisible();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}").cart||[]);
  expect(cart).toContain("gel-pedicure");
});

test("pedicure featured art and appointment buttons stay in pedicure category", async ({ page }) => {
  await ready(page,390);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await page.getByRole("button",{name:"کشف طرح منتخب"}).click();
  await expect(page.getByRole("dialog",{name:"پدیکور فرنچ"})).toBeVisible();
  await page.getByRole("button",{name:"بستن"}).first().click();
  await page.locator(".nail-filters__top").getByRole("button",{name:"درخواست نوبت",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"درخواست نوبت"})).toBeVisible();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}").cart||[]);
  expect(cart).toContain("classic-pedicure");
  expect(cart).not.toContain("luxe-manicure");
});

test("approved image bytes are delivered by the app at original WebP paths",async({page})=>{
  await ready(page,390);
  const photo=page.locator(".nail-card").filter({hasText:"شیری ابریشمی"}).locator(".nail-visual__photo");
  await expect(photo).toBeVisible();
  const response=await page.request.get("/nails/photos/nail-milky-silk.webp");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/image\/webp/);
  const bytes=await response.body();
  expect(bytes.length).toBeGreaterThan(10000);
  expect(bytes.subarray(0,4).toString()).toBe("RIFF");
  expect(bytes.subarray(8,12).toString()).toBe("WEBP");
});
