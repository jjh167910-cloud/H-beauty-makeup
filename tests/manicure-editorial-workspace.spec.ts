import {test,expect} from "playwright/test";

test("146 manicure proposals are review-only and mobile RTL",async({page,request})=>{
 const r=await request.get("/review/manicure-146-preliminary-suggestions.json");
 expect(r.ok()).toBeTruthy();
 const v=await r.json();
 expect(v.total).toBe(146);
 expect(v.final_approved).toBe(0);
 expect(v.proposed_counts).toEqual({HOLD:42,REGENERATE:17,VISUAL_CANDIDATE:87});
 await page.setViewportSize({width:390,height:844});
 await page.goto("/review/editorial-workspace.html");
 await expect(page.locator("html")).toHaveAttribute("dir","rtl");
 await expect(page.locator(".tile")).toHaveCount(146);
 await expect(page.locator(".title-fa")).toHaveCount(146);
 await page.locator("#q").fill("باغ زیتونی");
 await expect(page.locator(".tile")).toHaveCount(1);
 await expect(page.locator(".tile .title-fa")).toHaveText("باغ زیتونی");
 await page.locator("#q").fill("");
 await page.locator("#filter").selectOption("regenerate");
 await expect(page.locator(".tile")).toHaveCount(17);
 await page.locator("#filter").selectOption("hold");
 await expect(page.locator(".tile")).toHaveCount(42);
 const size=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
 expect(size[0]).toBeLessThanOrEqual(size[1]+1);
});

test("local review draft cannot publish to the customer catalog",async({page})=>{
 await page.goto("/review/editorial-workspace.html");
 await expect(page.locator(".tile")).toHaveCount(146);
 await page.locator("#q").fill("nail-atlas-geometry-sage");
 await expect(page.locator(".tile")).toHaveCount(1);
 await page.locator(".tile button").click();
 await page.locator("#reviewer").fill("Editorial Reviewer");
 await page.locator("#notes").fill("The image has an unresolved exact nail tip shape mismatch requiring further inspection.");
 await page.locator("#saveReject").click();
 await expect(page.locator("#completed")).toHaveText("1");
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("hbeauty:manicure-146:review-drafts:v1")||"{}"));
 expect(saved["nail-atlas-geometry-sage"].publication_approved).toBe(false);
 expect(saved["nail-atlas-geometry-sage"].decision).toBe("REJECT");
 await page.reload();
 await expect(page.locator("#completed")).toHaveText("1");
});


test("detailed reviewer recovers Persian labels from legacy cached metadata",async({page})=>{
 await page.route("**/review/manifest-146.json*",async route=>{
   const response=await route.fetch();
   const manifest=await response.json();
   for(const item of manifest.files){delete item.title;delete item.en;}
   await route.fulfill({contentType:"application/json",body:JSON.stringify(manifest)});
 });
 await page.goto("/review/editorial-workspace.html");
 await expect(page.locator(".tile")).toHaveCount(146);
 await expect(page.locator(".title-fa")).toHaveCount(146);
 await page.locator("#q").fill("باغ زیتونی");
 await expect(page.locator(".tile")).toHaveCount(1);
 await expect(page.locator(".tile .title-fa")).toHaveText("باغ زیتونی");
});
