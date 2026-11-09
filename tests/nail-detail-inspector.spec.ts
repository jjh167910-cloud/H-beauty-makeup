import {test,expect,type Page} from "playwright/test";

async function openNail(page:Page,width:number,query:string,title:string){
  await page.setViewportSize({width,height:820});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:"light",bookings:[],favNails:[]
    }));
  });
  await page.goto("/#/nails");
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill(query);
  await page.getByRole("button",{name:"مشاهده طرح "+title}).click();
  return page.getByRole("dialog",{name:title});
}

for(const width of [320,390,768]){
  test("full-image inspection preserves framing, native WebP and controls at "+width+"px",async({page})=>{
    const detail=await openNail(page,width,"شیری ابریشمی","شیری ابریشمی");
    const preview=detail.locator("#nail-detail-image");
    await expect(preview).toHaveAttribute("data-inspection-level","0");
    await detail.getByRole("button",{name:"نمایش تمام تصویر بدون برش"}).click();
    await expect(preview).toHaveAttribute("data-inspection-level","1");
    await expect(preview).toHaveCSS("overflow-x","auto");
    await expect(preview.locator(".nail-visual__photo")).toHaveCSS("object-fit","contain");
    await expect(preview.locator(".nail-visual__photo")).toHaveAttribute("src","/nails/photos/nail-milky-silk.webp");
    await detail.getByRole("button",{name:"بزرگ‌نمایی ۲ برابر و جابه‌جایی تصویر"}).click();
    await expect(preview).toHaveAttribute("data-inspection-level","2");
    const geometry=await preview.evaluate(el=>({
      frame:el.clientWidth,inner:el.querySelector(".nail-visual")?.getBoundingClientRect().width??0,
      scroll:el.scrollWidth
    }));
    expect(geometry.inner).toBeGreaterThanOrEqual(geometry.frame*1.9);
    expect(geometry.scroll).toBeGreaterThan(geometry.frame);
    await expect(detail.getByRole("button",{name:"درخواست اجرای همین طرح"})).toBeVisible();
    const delta=await page.evaluate(()=>
      document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(delta).toBeLessThanOrEqual(1);
    await detail.getByRole("button",{name:"بازگشت به پیش‌نمایش معمول"}).click();
    await expect(preview).toHaveAttribute("data-inspection-level","0");
  });
}

test("inspector resets when selecting a different colorway with the same nail geometry",async({page})=>{
  const detail=await openNail(page,390,"ژلی شفاف عاجی","ژلی شفاف عاجی");
  await detail.getByRole("button",{name:"نمایش تمام تصویر بدون برش"}).click();
  await expect(detail.locator("#nail-detail-image")).toHaveAttribute("data-inspection-level","1");
  await detail.getByRole("button",{name:"انتخاب رنگ ژلی شفاف یاقوتی"}).click();
  const changed=page.getByRole("dialog",{name:"ژلی شفاف یاقوتی"});
  await expect(changed).toBeVisible();
  await expect(changed.locator("#nail-detail-image")).toHaveAttribute("data-inspection-level","0");
  await expect(changed.getByRole("button",{name:"درخواست اجرای همین طرح"})).toBeVisible();
});

test("inspector retains crisp vector fallback when photographic references are offline",async({page})=>{
  await page.route("**/nails/photos/*.webp",route=>route.abort());
  const detail=await openNail(page,390,"شیری ابریشمی","شیری ابریشمی");
  await detail.getByRole("button",{name:"نمایش تمام تصویر بدون برش"}).click();
  const visual=detail.locator("#nail-detail-image");
  await expect(visual.locator(".nail-visual[data-media-source='vector']")).toBeVisible();
  const fallback=visual.locator(".nail-visual__fallback svg");
  await expect(fallback).toBeVisible();
  const normal=await fallback.boundingBox();
  expect(normal).not.toBeNull();
  await detail.getByRole("button",{name:"بزرگ‌نمایی ۲ برابر و جابه‌جایی تصویر"}).click();
  await expect(fallback).toBeVisible();
  const zoomed=await fallback.boundingBox();
  expect(zoomed).not.toBeNull();
  expect(zoomed!.width).toBeGreaterThanOrEqual(normal!.width*1.9);
  expect(zoomed!.height).toBeGreaterThanOrEqual(normal!.height*1.9);
});
