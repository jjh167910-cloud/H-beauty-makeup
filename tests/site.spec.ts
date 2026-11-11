import { join } from "node:path";
import { test, expect } from "playwright/test";

/**
 * This site (H-beauty-makeup) is the salon app's makeup try-on on its own: the dev server on 4174 builds it as
 * published; the other tests use the whole salon app (VITE_SITE=salon, on 4173).
 */
const ROOT = process.cwd();
const CUSTOMER = join(ROOT, "public/makeup/looks/no-makeup.webp");   // the catalog model without makeup (no real person)

test.use({ baseURL: "http://127.0.0.1:4174" });

test("the site is the makeup try-on on its own: her photo, every look, and a booking text without her photo", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "امتحان میکاپ روی چهره خودتان" })).toBeVisible();
  await expect(page.locator(".tabbar__item")).toHaveCount(0);                        // no salon around it
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByRole("group", { name: "امتحان سبک‌های دیگر" }).getByRole("button")).not.toHaveCount(0);
  await page.getByRole("button", { name: "رزرو همین میکاپ" }).click();
  const dialog = page.getByRole("dialog", { name: "درخواست رزرو" });
  await expect(dialog).toContainText("سبک: ");
  await dialog.getByRole("button", { name: "بستن" }).click();
  await expect(dialog).toHaveCount(0);
});
