import { join } from "node:path";
import { test, expect } from "playwright/test";

/** The page around the try-on: its heading, a look from the link, and a booking text without her photo. */
const ROOT = process.cwd();
const CUSTOMER = join(ROOT, "public/makeup/looks/no-makeup.webp");   // the catalog model without makeup (no real person)

test("the page is the makeup try-on: her photo, every look, and a booking text without her photo", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "امتحان میکاپ روی چهره خودتان" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "«گلم هالیوودی» روی چهره خودتان" })).toBeVisible();
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByRole("group", { name: "امتحان سبک‌های دیگر" }).getByRole("button")).not.toHaveCount(0);
  await page.getByRole("button", { name: "رزرو همین میکاپ" }).click();
  const dialog = page.getByRole("dialog", { name: "درخواست رزرو" });
  await expect(dialog).toContainText("سبک: گلم هالیوودی");
  await expect(dialog.locator("img, canvas")).toHaveCount(0);
  await dialog.getByRole("button", { name: "بستن" }).click();
  await expect(dialog).toHaveCount(0);
});

test("a link opens the try-on on its look, and an unknown look falls back to the first one", async ({ page }) => {
  await page.goto("/?look=cat-eye");
  await expect(page.getByRole("heading", { name: "«خط چشم گربه‌ای» روی چهره خودتان" })).toBeVisible();
  await page.goto("/?look=no-such-look");
  await expect(page.getByRole("heading", { name: "«گلم هالیوودی» روی چهره خودتان" })).toBeVisible();
});
