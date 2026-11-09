import { test, expect } from "playwright/test";

const KEY = "hananeh-atelier-v1";

for (const width of [320, 390, 768]) {
  test(`nail atelier services fit and book correctly at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(({ key }) => {
      localStorage.setItem(key, JSON.stringify({ welcomed: true, theme: "light", bookings: [] }));
    }, { key: KEY });

    await page.goto("/#/services");
    await page.getByRole("group", { name: "دسته‌بندی خدمات" })
      .getByRole("button", { name: "مانیکور و پدیکور" }).click();

    const manicure = page.locator(".studio-service-item").filter({ hasText: "مانیکور لوکس" });
    const pedicure = page.locator(".studio-service-item").filter({ hasText: "پدیکور اسپا" });
    await expect(manicure).toBeVisible();
    await expect(pedicure).toBeVisible();
    await expect(page.getByRole("heading", { name: "میکاپ و ابرو" })).toHaveCount(0);

    await pedicure.getByRole("button", { name: "افزودن پدیکور اسپا به انتخاب‌ها" }).click();
    await expect(pedicure.getByRole("button", { name: "حذف پدیکور اسپا از انتخاب‌ها" }))
      .toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "ساخت درخواست نوبت" }).click();
    await expect(page.getByRole("dialog", { name: "درخواست نوبت" })).toBeVisible();
    await expect(page.getByText("پدیکور اسپا").first()).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("existing luxe-manicure booking ID is retained in the new nail category", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ welcomed: true, bookings: [] }));
  }, { key: KEY });
  await page.goto("/#/services");
  await page.getByRole("group", { name: "دسته‌بندی خدمات" })
    .getByRole("button", { name: "مانیکور و پدیکور" }).click();
  const entry = page.locator(".studio-service-item").filter({ hasText: "مانیکور لوکس" });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "افزودن مانیکور لوکس به انتخاب‌ها" }).click();
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("hananeh-atelier-v1") || "{}"));
  expect(cart.cart).toContain("luxe-manicure");
});
