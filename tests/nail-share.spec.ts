import { test, expect, type Page } from "playwright/test";

async function setup(page:Page,width=390){
  await page.setViewportSize({width,height:850});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:"light",bookings:[],favNails:[]
    }));
  });
}

test("direct shared link opens exact manicure without losing the nail route",async({page})=>{
  await setup(page,390);
  await page.goto("/#/nails?style=nail-atlas-velvet-merlot");
  await expect(page).toHaveURL(/#\/nails\?style=nail-atlas-velvet-merlot$/);
  const sheet=page.getByRole("dialog",{name:"مخمل مات زرشکی"});
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  const booking=page.getByRole("dialog",{name:"درخواست نوبت"});
  await expect(booking).toBeVisible();
  await expect(booking.getByText("مخمل مات زرشکی").first()).toBeVisible();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}").cart);
  expect(cart).toContain("gel-manicure");
});

test("direct shared pedicure link works on 320px and remains mobile safe",async({page})=>{
  await setup(page,320);
  await page.goto("/#/nails?style=pedi-atlas-marble-ruby");
  await expect(page.getByRole("dialog",{name:"پدیکور مرمری یاقوتی"})).toBeVisible();
  await expect(page).toHaveURL(/#\/nails\?style=pedi-atlas-marble-ruby$/);
  const delta=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(delta).toBeLessThanOrEqual(1);
});

test("invalid, unknown, and overly long links remain safely in the gallery",async({page})=>{
  await setup(page,390);
  for(const id of ["not-real","nail-atlas-unknown-coral","nail-"+ "x".repeat(150)]){
    await page.goto("/#/nails?style="+encodeURIComponent(id));
    await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
    await expect(page.getByRole("dialog",{name:/./})).toHaveCount(0);
  }
});

test("copy link is exact, clean and restores the same style after reload",async({page})=>{
  await setup(page,390);
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"clipboard",{
      configurable:true,value:{writeText:async(value:string)=>{
        (window as Window & {__nailCopied?:string}).__nailCopied=value;
      }}
    });
  });
  await page.goto("/#/nails");
  await page.getByRole("button",{name:"مشاهده طرح فرنچ کلاسیک"}).click();
  await page.getByRole("dialog",{name:"فرنچ کلاسیک"})
    .getByRole("button",{name:"کپی لینک طرح فرنچ کلاسیک"}).click();
  await expect(page.getByRole("status").filter({hasText:"لینک طرح کپی شد."})).toBeVisible();
  const copied=await page.evaluate(()=>(window as Window & {__nailCopied?:string}).__nailCopied||"");
  expect(copied).toContain("/#/nails?style=nail-classic-french");
  expect(copied).not.toContain("utm_");
  await page.goto(copied);
  await expect(page.getByRole("dialog",{name:"فرنچ کلاسیک"})).toBeVisible();
});

test("clipboard denial shows selectable fallback instead of false success",async({page})=>{
  await setup(page,390);
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"clipboard",{
      configurable:true,value:{writeText:async()=>{throw new Error("denied");}}
    });
  });
  await page.goto("/#/nails?style=nail-ruby-red");
  const sheet=page.getByRole("dialog",{name:"قرمز یاقوتی"});
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button",{name:"کپی لینک طرح قرمز یاقوتی"}).click();
  const fallback=sheet.getByRole("textbox",{name:"لینک قابل کپی طرح"});
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveValue(/#\/nails\?style=nail-ruby-red/);
  await expect(sheet.getByText("لینک طرح کپی شد.")).toHaveCount(0);
});
