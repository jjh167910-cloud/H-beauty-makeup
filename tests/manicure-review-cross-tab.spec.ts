import {test,expect} from "playwright/test";

const STORE="hbeauty:manicure-146:review-drafts:v1";
const A="nail-atlas-aura-blush";
const B="nail-atlas-geometry-sage";

test("workspace and gallery preserve each other's draft flags across tabs",async({context,page})=>{
 await page.goto("/review/editorial-workspace.html");
 await expect(page.locator(".tile")).toHaveCount(146);
 const gallery=await context.newPage();
 await gallery.goto("/review/manicure-intake.html");
 await expect(gallery.locator(".tile")).toHaveCount(146);

 // Gallery writes after workspace loaded its original empty storage snapshot.
 await gallery.locator(".search").fill(A);
 await gallery.locator(".tile .review-btn.reject").click();
 await expect(gallery.locator("#flaggedTop")).toHaveText("1");

 // Workspace must merge latest storage before writing a different photo.
 await page.locator("#q").fill(B);
 await page.locator(".tile button").click();
 await page.locator("#reviewer").fill("Editorial Reviewer");
 await page.locator("#notes").fill("The exact catalog shape requires further review at full native resolution.");
 await page.locator("#saveHold").click();
 await expect(page.locator("#completed")).toHaveText("2");
 let saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||"{}"),STORE);
 expect(Object.keys(saved).sort()).toEqual([A,B].sort());
 expect(saved[A].decision).toBe("REJECT");
 expect(saved[B].decision).toBe("HOLD");
 expect(saved[A].publication_approved).toBe(false);
 expect(saved[B].publication_approved).toBe(false);

 // Gallery must likewise preserve the workspace draft when editing its own flag.
 await gallery.locator(".tile .review-btn.hold").click();
 saved=await gallery.evaluate(key=>JSON.parse(localStorage.getItem(key)||"{}"),STORE);
 expect(Object.keys(saved).sort()).toEqual([A,B].sort());
 expect(saved[A].decision).toBe("HOLD");
 expect(saved[B].decision).toBe("HOLD");

 // Clearing only B from the workspace must not erase gallery's A decision.
 await page.locator(".tile button").click();
 await page.locator("#clear").click();
 saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||"{}"),STORE);
 expect(Object.keys(saved)).toEqual([A]);
 expect(saved[A].decision).toBe("HOLD");
 await expect(gallery.locator("#flaggedTop")).toHaveText("1");
 await gallery.close();
});
