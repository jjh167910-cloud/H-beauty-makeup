import { test, expect, type Page } from "playwright/test";

async function initialize(page:Page,width=390){
  await page.setViewportSize({width,height:850});
  await page.addInitScript(()=>{
    if (!localStorage.getItem("hananeh-atelier-v1")) {
      localStorage.setItem("hananeh-atelier-v1",
        JSON.stringify({welcomed:true,theme:"light",bookings:[],favNails:[]}));
    }
  });
}

test("pedicure share link closes to pedicure, reloads in correct category, and Forward reopens",async({page})=>{
  await initialize(page,320);
  await page.goto("/#/nails?style=pedi-atlas-marble-ruby");
  const sheet=page.getByRole("dialog",{name:"پدیکور مرمری یاقوتی"});
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button",{name:"بستن"}).click();
  await expect(page).toHaveURL(/#\/nails\?kind=pedicure$/);
  await expect(page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator(".nail-card").first()).toContainText("پدیکور");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goForward();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"})).toHaveAttribute("aria-pressed","true");
});

test("manicure shared link closes to its own gallery without leaving the app",async({page})=>{
  await initialize(page,390);
  await page.goto("/#/nails?style=nail-atlas-velvet-merlot");
  await expect(page.getByRole("dialog",{name:"مخمل مات زرشکی"})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/nails$/);
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
  await expect(page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"مانیکور · ۲۲۰ طرح"})).toHaveAttribute("aria-pressed","true");
  await page.goForward();
  await expect(page.getByRole("dialog",{name:"مخمل مات زرشکی"})).toBeVisible();
});

test("ordinary gallery dialog restores the same style with Forward",async({page})=>{
  await initialize(page,390);
  await page.goto("/#/nails");
  await page.getByRole("button",{name:"مشاهده طرح فرنچ کلاسیک"}).click();
  await expect(page.getByRole("dialog",{name:"فرنچ کلاسیک"})).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog",{name:"فرنچ کلاسیک"})).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("dialog",{name:"فرنچ کلاسیک"})).toBeVisible();
});

test("switching colorway stores the updated selected style in history",async({page})=>{
  await initialize(page,390);
  await page.goto("/#/nails");
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("مخمل مات عاجی");
  await page.getByRole("button",{name:"مشاهده طرح مخمل مات عاجی"}).click();
  const old=page.getByRole("dialog",{name:"مخمل مات عاجی"});
  await old.getByRole("button",{name:/انتخاب مدل مخمل مات زرشکی با فرم/}).click();
  await expect(page.getByRole("dialog",{name:"مخمل مات زرشکی"})).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog",{name:"مخمل مات زرشکی"})).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("dialog",{name:"مخمل مات زرشکی"})).toBeVisible();
});

test("invalid shared style does not manufacture a sheet history entry",async({page})=>{
  await initialize(page,390);
  await page.goto("/#/nails?style=pedi-does-not-exist");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
  await expect(page.getByRole("dialog",{name:/./})).toHaveCount(0);
  await expect(page).toHaveURL(/#\/nails\?style=pedi-does-not-exist$/);
});
