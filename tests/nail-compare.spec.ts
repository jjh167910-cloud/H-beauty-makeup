import { test, expect, type Page } from "playwright/test";

async function ready(page:Page,width:number){
  await page.setViewportSize({width,height:850});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:"light",bookings:[],favNails:[]
    }));
  });
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
}

for(const width of [320,390,768]){
  test(`nail comparison is responsive and accessible at ${width}px`,async({page})=>{
    await ready(page,width);
    const open=page.getByRole("button",{name:"مقایسه طرح‌ها"});
    await expect(open).toBeDisabled();
    await page.getByRole("button",{name:"مقایسه طرح شیری ابریشمی"}).click();
    await expect(page.getByRole("status").filter({hasText:"۱ از ۲ طرح انتخاب شده"})).toBeVisible();
    await page.getByRole("button",{name:"مقایسه طرح صورتی باله"}).click();
    await expect(open).toBeEnabled();
    const third=page.getByRole("button",{name:"مقایسه طرح نود کلاسیک"});
    await expect(third).toBeDisabled();
    await open.click();
    const sheet=page.getByRole("dialog",{name:"مقایسه طرح‌های ناخن"});
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".nail-compare__design")).toHaveCount(2);
    await expect(sheet.getByText("شیری ابریشمی")).toBeVisible();
    await expect(sheet.getByText("صورتی باله")).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await sheet.getByRole("button",{name:"بستن"}).click();
    await page.getByRole("button",{name:"حذف صورتی باله از مقایسه"}).click();
    await expect(open).toBeDisabled();
    await expect(third).toBeEnabled();
  });
}

test("comparison books selected style, never the other style",async({page})=>{
  await ready(page,390);
  await page.getByRole("button",{name:"مقایسه طرح شیری ابریشمی"}).click();
  await page.getByRole("button",{name:"مقایسه طرح فرنچ کلاسیک"}).click();
  await page.getByRole("button",{name:"مقایسه طرح‌ها"}).click();
  const sheet=page.getByRole("dialog",{name:"مقایسه طرح‌های ناخن"});
  const french=sheet.getByRole("article",{name:"طرح 2: فرنچ کلاسیک"});
  await french.getByRole("button",{name:"درخواست همین طرح"}).click();
  const booking=page.getByRole("dialog",{name:"درخواست نوبت"});
  await expect(booking).toBeVisible();
  await expect(booking.getByText("فرنچ کلاسیک").first()).toBeVisible();
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}"));
  expect(draft.cart).toContain("nail-art");
});

test("comparing pedicure stays in pedicure and clears when switching to manicure",async({page})=>{
  await ready(page,390);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await page.getByRole("button",{name:"مقایسه طرح پدیکور نود کلاسیک"}).click();
  await page.getByRole("button",{name:"مقایسه طرح پدیکور فرنچ",exact:true}).click();
  await page.getByRole("button",{name:"مقایسه طرح‌ها"}).click();
  const sheet=page.getByRole("dialog",{name:"مقایسه طرح‌های ناخن"});
  await expect(sheet.locator(".nail-compare__design")).toHaveCount(2);
  await sheet.getByRole("button",{name:"بستن"}).click();
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"مانیکور · ۲۲۰ طرح"}).click();
  await expect(page.getByRole("button",{name:"مقایسه طرح‌ها"})).toBeDisabled();
  await expect(page.getByRole("status").filter({hasText:"۰ از ۲ طرح انتخاب شده"})).toBeVisible();
});

test("comparison selection persists across search and filters without altering favorites",async({page})=>{
  await ready(page,390);
  await page.getByRole("button",{name:"مقایسه طرح شیری ابریشمی"}).click();
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("Ruby Rouge");
  await page.getByRole("button",{name:"مقایسه طرح قرمز یاقوتی"}).click();
  await expect(page.getByRole("button",{name:"مقایسه طرح‌ها"})).toBeEnabled();
  await expect(page.getByRole("button",{name:"طرح‌های ناخن ذخیره‌شده"})).toContainText("۰");
  await page.getByRole("button",{name:"پاک کردن"}).click();
  await expect(page.getByRole("button",{name:"مقایسه طرح‌ها"})).toBeDisabled();
});
