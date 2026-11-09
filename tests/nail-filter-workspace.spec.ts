import { test, expect, type Page } from "playwright/test";

async function ready(page: Page, width=390) {
  await page.setViewportSize({width,height:850});
  await page.addInitScript(() => {
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:"light",bookings:[],favNails:[]
    }));
  });
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
}

test("default mobile gallery exposes simple filters without advanced clutter",async({page})=>{
  await ready(page);
  const filter=page.getByRole("button",{name:"فیلترها"});
  await expect(filter).toHaveAttribute("aria-expanded","false");
  await expect(page.locator(".nail-filter-panel")).toHaveCount(0);
  await expect(page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"})).toBeVisible();
  await expect(page.getByRole("group",{name:"نوع پیش‌نمایش ناخن"})).toBeVisible();
  await expect(page.locator(".nail-card")).toHaveCount(24);
  const box=await page.locator(".nail-filter-workspace").boundingBox();
  expect(box?.height).toBeLessThan(320);
});

test("quick filter and removable tag restore the full gallery",async({page})=>{
  await ready(page);
  const quick=page.getByRole("group",{name:"انتخاب سریع سبک ناخن"});
  await quick.getByRole("button",{name:"کروم",exact:true}).click();
  await expect(quick.getByRole("button",{name:"کروم",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator(".nail-applied-filters")).toContainText("کروم");
  await page.getByRole("button",{name:"حذف فیلتر کروم"}).click();
  await expect(page.locator(".nail-applied-filters")).toHaveCount(0);
  await expect(page.locator(".nail-card")).toHaveCount(24);
});

test("advanced filters combine family and color, remove and reset cleanly",async({page})=>{
  await ready(page);
  const toggle=page.getByRole("button",{name:"فیلترها"});
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded","true");
  await page.getByRole("group",{name:"فیلتر مجموعه طراحی ناخن"})
    .getByRole("button",{name:"مخمل مات",exact:true}).click();
  await expect(page.locator(".nail-card")).toHaveCount(12);
  await page.getByRole("group",{name:"فیلتر رنگ ناخن"})
    .getByRole("button",{name:"تیره",exact:true}).click();
  await expect(page.locator(".nail-card")).toHaveCount(3);
  await expect(page.locator(".nail-applied-filters")).toContainText("تیره");
  await page.getByRole("button",{name:"حذف فیلتر تیره"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(12);
  await page.getByRole("button",{name:"بازنشانی همه"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
  await expect(page.locator(".nail-applied-filters")).toHaveCount(0);
});

test("switching manicure to pedicure resets advanced selections",async({page})=>{
  await ready(page);
  await page.getByRole("group",{name:"انتخاب سریع سبک ناخن"})
    .getByRole("button",{name:"مخمل مات"}).click();
  await expect(page.locator(".nail-applied-filters")).toBeVisible();
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await expect(page.locator(".nail-applied-filters")).toHaveCount(0);
  await expect(page.locator(".nail-card")).toHaveCount(24);
  await expect(page.getByRole("button",{name:"فیلترها"})).toHaveAttribute("aria-expanded","false");
});

test("filters are keyboard-visible and no overflow at narrow mobile width",async({page})=>{
  await ready(page,320);
  await page.getByRole("button",{name:"فیلترها"}).click();
  await expect(page.locator(".nail-filter-panel")).toBeVisible();
  const x=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(x).toBeLessThanOrEqual(1);
  const close=page.getByRole("button",{name:/^نمایش \d|^نمایش [۰-۹]+ طرح/});
  await expect(close).toBeVisible();
  const box=await page.getByRole("button",{name:"فیلترها"}).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
