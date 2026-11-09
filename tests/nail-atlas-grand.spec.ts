import { test, expect, type Page } from "playwright/test";

async function atlas(page:Page,width=390){
  await page.setViewportSize({width,height:850});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:"light",bookings:[],favNails:[]
    }));
  });
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
}

test("grand atlas has 220 manicures and pages results by 24 cards",async({page})=>{
  await atlas(page,320);
  await expect(page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"مانیکور · ۲۲۰ طرح"})).toBeVisible();
  await expect(page.locator(".nail-card")).toHaveCount(24);
  await expect(page.locator(".nail-collection__toolbar").getByText("۲۴ از ۲۲۰ طرح")).toBeVisible();
  await page.getByRole("button",{name:"نمایش طرح‌های بیشتر"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(48);
  const overflow=await page.evaluate(()=>
    document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("combobox",{name:"چیدمان طرح‌ها"}).selectOption("alphabetical");
  await expect(page.locator(".nail-card")).toHaveCount(24);
});

test("grand atlas pedicure collection has 78 styles with lazy paging",async({page})=>{
  await atlas(page,390);
  const group=page.getByRole("group",{name:"انتخاب گالری دست یا پا"});
  await group.getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await expect(page.locator(".nail-collection__toolbar").getByText("۲۴ از ۷۸ طرح")).toBeVisible();
  await expect(page.locator(".nail-card")).toHaveCount(24);
  await page.getByRole("button",{name:"فیلترها"}).click();
  await page.getByRole("group",{name:"فیلتر نوع طراحی ناخن"})
    .getByRole("button",{name:"هاله‌ای"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(6);
  await expect(page.locator(".nail-card svg[aria-label*='پدیکور']").first()).toBeVisible();
});

test("new magnetic nail family has twelve distinct colors and detailed beam artwork",async({page})=>{
  await atlas(page,768);
  await page.getByRole("button",{name:"فیلترها"}).click();
  await page.getByRole("group",{name:"فیلتر نوع طراحی ناخن"})
    .getByRole("button",{name:"چشم‌گربه‌ای"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(12);
  await expect(page.locator(".nail-card").first()).toContainText("چشم‌گربه‌ای");
  await expect(page.locator(".nail-card").first().locator(".nail-visual__fallback svg")).toBeVisible();
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("Cobalt");
  await expect(page.locator(".nail-card")).toHaveCount(1);
  await expect(page.locator(".nail-card")).toContainText("کبالت");
});

test("new botanical design can be saved and included in appointment",async({page})=>{
  await atlas(page,390);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("شاخه‌های ظریف سیج");
  await expect(page.locator(".nail-card")).toHaveCount(1);
  await page.getByRole("button",{name:"ذخیره طرح شاخه‌های ظریف سیج"}).click();
  await expect(page.getByRole("button",{name:"طرح‌های ناخن ذخیره‌شده"})).toContainText("۱");
  await page.getByRole("button",{name:"مشاهده طرح شاخه‌های ظریف سیج"}).click();
  const dialog=page.getByRole("dialog",{name:"شاخه‌های ظریف سیج"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  await expect(page.getByRole("dialog",{name:"درخواست نوبت"})).toBeVisible();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}").cart);
  expect(cart).toContain("nail-art");
});

test("switching category or search resets list size instead of leaving stale paging",async({page})=>{
  await atlas(page,390);
  await page.getByRole("button",{name:"نمایش طرح‌های بیشتر"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(48);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("pedi-atlas");
  await expect(page.getByText("طرحی با این فیلترها پیدا نشد.")).toBeVisible();
  await page.getByRole("button",{name:"نمایش همه طرح‌ها"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
});
