import { test, expect, type Page } from "playwright/test";

async function openGallery(page:Page,width=390){
  await page.setViewportSize({width,height:850});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",
      JSON.stringify({welcomed:true,theme:"light",bookings:[],favNails:[]}));
  });
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
}

async function manicure(page:Page, term:string){
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill(term);
  const visual=page.locator(".nail-card .nail-visual__fallback svg");
  await expect(visual).toHaveCount(1);
  return visual;
}

test("velvet matte, chrome and jelly use three materially distinct shader recipes",async({page})=>{
  await openGallery(page,390);
  const matte=await manicure(page,"مخمل مات یاقوتی");
  const matteStops=await matte.locator('linearGradient[data-nail-material="matte"] stop').evaluateAll(
    list=>list.map(el=>[el.getAttribute("offset"),el.getAttribute("stop-color"),el.getAttribute("stop-opacity")]));
  expect(matteStops).toHaveLength(4);
  await expect(matte.locator("path[stroke='#FFFFFF']")).toHaveCount(0);
  const chrome=await manicure(page,"پریزم کروم یاقوتی");
  const chromeStops=await chrome.locator('linearGradient[data-nail-material="chrome"] stop').evaluateAll(
    list=>list.map(el=>[el.getAttribute("offset"),el.getAttribute("stop-color"),el.getAttribute("stop-opacity")]));
  expect(chromeStops).toHaveLength(9);
  expect(chromeStops).not.toEqual(matteStops);
  const jelly=await manicure(page,"ژلی شفاف یاقوتی");
  const jellyStops=await jelly.locator('linearGradient[data-nail-material="jelly"] stop').evaluateAll(
    list=>list.map(el=>Number(el.getAttribute("stop-opacity") ?? "1")));
  expect(jellyStops.length).toBe(4);
  expect(jellyStops.every(value=>value<.8)).toBe(true);
});

test("changing only shade preserves shape and length for all uniform-geometry designs",async({page})=>{
  await openGallery(page,390);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("چشم‌گربه‌ای عاجی");
  await page.getByRole("button",{name:"مشاهده طرح چشم‌گربه‌ای عاجی"}).click();
  const initial=page.getByRole("dialog",{name:"چشم‌گربه‌ای عاجی"});
  const tags=await initial.locator(".nail-detail__tags").innerText();
  await expect(initial.getByRole("group",{name:"انتخاب رنگ‌بندی"}).getByRole("button")).toHaveCount(12);
  await expect(initial.getByRole("group",{name:"انتخاب مدل با فرم یا طول متفاوت"})).toHaveCount(0);
  await initial.getByRole("button",{name:"انتخاب رنگ چشم‌گربه‌ای کبالت"}).click();
  const selected=page.getByRole("dialog",{name:"چشم‌گربه‌ای کبالت"});
  await expect(selected).toBeVisible();
  expect(await selected.locator(".nail-detail__tags").innerText()).toBe(tags);
  await selected.getByRole("button",{name:"درخواست اجرای همین طرح"}).click();
  const booking=page.getByRole("dialog",{name:"درخواست نوبت"});
  await expect(booking.getByText("چشم‌گربه‌ای کبالت").first()).toBeVisible();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("hananeh-atelier-v1")||"{}").cart);
  expect(cart).toContain("nail-art");
});

test("legacy variable geometry styles keep original IDs but disclose geometry changes",async({page})=>{
  await openGallery(page,320);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("مخمل مات عاجی");
  await page.getByRole("button",{name:"مشاهده طرح مخمل مات عاجی"}).click();
  const initial=page.getByRole("dialog",{name:"مخمل مات عاجی"});
  await expect(initial.getByRole("group",{name:"انتخاب رنگ‌بندی"}).getByRole("button")).toHaveCount(1);
  const others=initial.getByRole("group",{name:"انتخاب مدل با فرم یا طول متفاوت"});
  await expect(others.getByRole("button")).toHaveCount(11);
  const before=await initial.locator(".nail-detail__tags").innerText();
  await others.getByRole("button",{name:/انتخاب مدل مخمل مات زرشکی با فرم/}).click();
  const next=page.getByRole("dialog",{name:"مخمل مات زرشکی"});
  await expect(next).toBeVisible();
  expect(await next.locator(".nail-detail__tags").innerText()).not.toEqual(before);
  const width=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(width).toBeLessThanOrEqual(1);
});

test("pedicure chrome and jelly share the new finish shader without changing toe anatomy",async({page})=>{
  await openGallery(page,390);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("پدیکور کروم یاقوتی");
  const chrome=page.locator(".nail-card svg[aria-label*='پدیکور']");
  await expect(chrome.locator('linearGradient[data-nail-material="chrome"] stop')).toHaveCount(9);
  await expect(chrome.locator("g > ellipse")).toHaveCount(5);
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill("پدیکور ژلی یاقوتی");
  const jelly=page.locator(".nail-card svg[aria-label*='پدیکور']");
  await expect(jelly.locator('linearGradient[data-nail-material="jelly"] stop')).toHaveCount(4);
  await expect(jelly.locator("g > ellipse")).toHaveCount(5);
});
