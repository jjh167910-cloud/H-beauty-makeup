import { test, expect, type Page } from "playwright/test";

async function ready(page:Page,width=390){
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
  test(`five-finger nail previews retain responsive bounds at ${width}px`,async({page})=>{
    await ready(page,width);
    await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("چشم‌گربه‌ای کبالت");
    const card=page.locator(".nail-card");
    await expect(card).toHaveCount(1);
    const svg=card.locator(".nail-visual__fallback svg");
    await expect(svg).toHaveAttribute("data-nail-finish","cat-eye");
    await expect(svg.locator('[data-nail-finger="true"]')).toHaveCount(5);
    await expect(svg.locator("clipPath")).toHaveCount(5);
    await expect(svg.locator("linearGradient[id$='-skin']")).toHaveCount(1);
    const delta=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(delta).toBeLessThanOrEqual(1);
    await card.getByRole("button",{name:"مشاهده طرح چشم‌گربه‌ای کبالت"}).click();
    const dialog=page.getByRole("dialog",{name:"چشم‌گربه‌ای کبالت"});
    await expect(dialog.locator('[data-nail-finger="true"]')).toHaveCount(5);
  });
}

test("matte nail art avoids hard gloss specularity but retains nail and skin geometry",async({page})=>{
  await ready(page,390);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("مخمل مات یاقوتی");
  const svg=page.locator(".nail-card .nail-visual__fallback svg");
  await expect(svg).toHaveAttribute("data-nail-finish","matte");
  await expect(svg.locator('[data-nail-finger="true"]')).toHaveCount(5);
  await expect(svg.locator("clipPath")).toHaveCount(5);
  await expect(svg.locator("path[stroke='#FFFFFF']")).toHaveCount(0);
});

test("pedicure retains its separate five-toe illustration and booking flow",async({page})=>{
  await ready(page,390);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("پدیکور مرمری یاقوتی");
  const card=page.locator(".nail-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".nail-visual__fallback svg[aria-label*='پدیکور']")).toBeVisible();
  await expect(card.locator('[data-nail-finger]')).toHaveCount(0);
  await card.getByRole("button",{name:"مشاهده طرح پدیکور مرمری یاقوتی"}).click();
  const detail=page.getByRole("dialog",{name:"پدیکور مرمری یاقوتی"});
  await detail.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  await expect(page.getByRole("dialog",{name:"درخواست نوبت"})).toBeVisible();
});
