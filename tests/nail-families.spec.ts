import { test, expect, type Page } from "playwright/test";

async function start(page:Page,width=390){
  await page.setViewportSize({width,height:850});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({welcomed:true,theme:"light",bookings:[],favNails:[]}));
  });
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
  await page.getByRole("button",{name:"فیلترها"}).click();
}

for(const width of [320,390,768]){
  test(`technique family navigation is responsive at ${width}px`,async({page})=>{
    await start(page,width);
    const group=page.getByRole("group",{name:"فیلتر مجموعه طراحی ناخن"});
    await group.getByRole("button",{name:"چشم‌گربه‌ای",exact:true}).click();
    await expect(page.locator(".nail-card")).toHaveCount(12);
    await page.getByRole("group",{name:"فیلتر رنگ ناخن"})
      .getByRole("button",{name:"تیره"}).click();
    await expect(page.locator(".nail-card")).toHaveCount(3);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await group.getByRole("button",{name:"همه مجموعه‌ها"}).click();
    await expect(page.locator(".nail-card")).toHaveCount(24);
  });
}

test("color swatches switch selected design and use its exact booking ID",async({page})=>{
  await start(page,390);
  const group=page.getByRole("group",{name:"فیلتر مجموعه طراحی ناخن"});
  await group.getByRole("button",{name:"مخمل مات",exact:true}).click();
  await expect(page.locator(".nail-card")).toHaveCount(12);
  await page.getByRole("button",{name:"مشاهده طرح مخمل مات عاجی"}).click();
  const first=page.getByRole("dialog",{name:"مخمل مات عاجی"});
  await expect(first.getByRole("group",{name:"انتخاب رنگ‌بندی"}).getByRole("button")).toHaveCount(1);
  await expect(first.getByRole("group",{name:"انتخاب مدل با فرم یا طول متفاوت"}).getByRole("button")).toHaveCount(11);
  await first.getByRole("button",{name:/انتخاب مدل مخمل مات زرشکی با فرم/}).click();
  const second=page.getByRole("dialog",{name:"مخمل مات زرشکی"});
  await expect(second).toBeVisible();
  await second.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  const wizard=page.getByRole("dialog",{name:"درخواست نوبت"});
  await expect(wizard).toBeVisible();
  await expect(wizard.getByText("مخمل مات زرشکی").first()).toBeVisible();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}").cart);
  expect(cart).toContain("gel-manicure");
});

test("pedicure family options are independent and reset manicure-only selection",async({page})=>{
  await start(page,390);
  const group=page.getByRole("group",{name:"فیلتر مجموعه طراحی ناخن"});
  await group.getByRole("button",{name:"عروس مرواریدی",exact:true}).click();
  await expect(page.locator(".nail-card")).toHaveCount(12);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"}).getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await expect(group.getByRole("button",{name:"عروس مرواریدی",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"فیلترها"}).click();
  await group.getByRole("button",{name:"پدیکور مرمری",exact:true}).click();
  await expect(page.locator(".nail-card")).toHaveCount(6);
  await expect(page.locator(".nail-card").first()).toContainText("پدیکور مرمری");
  await group.getByRole("button",{name:"همه مجموعه‌ها"}).click();
  await expect(page.locator(".nail-card")).toHaveCount(24);
});
