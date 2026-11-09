import { test, expect } from "playwright/test";

const GALLERY="/review/manicure-intake.html";
const ID="nail-atlas-aura-blush";
const STORAGE="hbeauty:manicure-146:review-drafts:v1";

test("quick flag controls appear on all photos and persist across reload",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(GALLERY);
 await expect(page.locator(".tile")).toHaveCount(146);
 await expect(page.locator(".tile .review-actions")).toHaveCount(146);
 await expect(page.locator("#flaggedTop")).toHaveText("0");
 await page.locator(".search").fill(ID);
 await expect(page.locator(".tile")).toHaveCount(1);
 await page.locator(".tile .review-btn.reject").click();
 await expect(page.locator("#flaggedTop")).toHaveText("1");
 await expect(page.locator(".tile .review-btn.reject")).toHaveAttribute("aria-pressed","true");
 const draft=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||"{}"),STORAGE);
 expect(draft[ID].decision).toBe("REJECT");
 expect(draft[ID].publication_approved).toBe(false);
 expect(draft[ID].sha256).toMatch(/^[a-f0-9]{64}$/);
 await page.reload();
 await expect(page.locator("#flaggedTop")).toHaveText("1");
 await page.locator('[data-filter="__flags__"]').click();
 await expect(page.locator(".tile")).toHaveCount(1);
 await page.locator(".tile .review-btn.hold").click();
 await expect(page.locator(".tile .review-btn.hold")).toHaveAttribute("aria-pressed","true");
 await page.locator(".tile .review-btn.hold").click();
 await expect(page.locator("#flaggedTop")).toHaveText("0");
});

test("photo modal supports flagging and opens detailed reviewer for exact ID",async({page})=>{
 await page.goto(GALLERY);
 await expect(page.locator(".tile")).toHaveCount(146);
 await page.locator(".search").fill(ID);
 await page.locator(".tile .inspect").click();
 await expect(page.locator("#modal")).toHaveJSProperty("open",true);
 const url=await page.locator("#modalAdvanced").getAttribute("href");
 expect(url).toContain(encodeURIComponent(ID));
 await page.locator('[data-modal-decision="CANDIDATE"]').click();
 await expect(page.locator("#flaggedTop")).toHaveText("1");
 await expect(page.locator('[data-modal-decision="CANDIDATE"]')).toHaveAttribute("aria-pressed","true");
 await page.goto(url!);
 await expect(page.locator("#modal")).toHaveJSProperty("open",true);
 await expect(page.locator("#modalTitle")).toHaveText(ID);
 await expect(page.locator("#completed")).toHaveText("1");
});

test("download flags has real JSON contents but no customer release authorization",async({page})=>{
 const mutations:string[]=[];
 page.on("request",request=>{if(!["GET","HEAD"].includes(request.method()))mutations.push(request.method())});
 await page.goto(GALLERY);
 await expect(page.locator(".tile")).toHaveCount(146);
 await page.locator(".search").fill(ID);
 await page.locator(".tile .review-btn.yes").click();
 const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#downloadFlags").click()]);
 expect(download.suggestedFilename()).toBe("HBeauty_146_Review_Flags.json");
 const file=await download.path();
 expect(file).toBeTruthy();
 const fs=await import("node:fs");
 const record=JSON.parse(fs.readFileSync(file!,"utf8"));
 expect(record.approval_status).toBe("NOT_FINAL");
 expect(record.decisions).toHaveLength(1);
 expect(record.decisions[0].publication_approved).toBe(false);
 expect(record.decisions[0].sha256).toMatch(/^[a-f0-9]{64}$/);
 expect(mutations).toEqual([]);
});
