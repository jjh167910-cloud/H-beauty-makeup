import { test, expect, type Page } from "playwright/test";

/**
 * Editorial redesign regression checks.
 * Uses intentionally synthetic local data; never opens a real salon service.
 * Run with: npm run test:ui
 */
const STORAGE = "hananeh-atelier-v1";
const fixture = {
  id: "synthetic-booking-for-test",
  services: ["signature-cut"],
  stylist: "any",
  date: "2099-01-12",
  time: "12:00",
  name: "کاربر آزمایشی",
  phone: "09123456789",
  note: "",
  lookId: null,
  createdAt: 1,
  sent: false,
};

async function seed(page: Page, data: Record<string, unknown> = {}) {
  // One initialization script per test avoids undefined ordering between competing scripts.
  await page.addInitScript(({ key, state }) => {
    window.localStorage.setItem(key, JSON.stringify({ welcomed: true, theme: "light", bookings: [], ...state }));
  }, { key: STORAGE, state: data });
}

for (const width of [320, 390, 768, 1280]) {
  test(`home has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await seed(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /زیبایی شما/ })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(overflow.document, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.viewport + 1);
    await page.screenshot({ path: `test-results/home-${width}-light.png`, fullPage: true });
  });
}

test("three mood categories navigate to the catalog with a matching filter", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "دیدن مدل‌های موج‌های نرم" }).click();
  await expect(page).toHaveURL(/#\/looks$/);
  await expect(page.getByRole("button", { name: "موج", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("dark theme and Persian RTL remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await seed(page, { theme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/home-390-dark.png", fullPage: true });
});

test("sharing alone does not mark a locally stored booking as sent", async ({ page }) => {
  await seed(page, { bookings: [fixture] });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => undefined,
    });
  });

  await page.goto("/#/bookings");
  await expect(page.getByText("پیش‌نویس · ارسال نشده")).toBeVisible();
  await page.getByRole("button", { name: "ارسال برای سالن" }).click();
  await expect(page.getByText("پیش‌نویس · ارسال نشده")).toBeVisible();

  await page.getByRole("button", { name: /درخواست را برای سالن فرستاده‌ام/ }).click();
  await expect(page.getByText("ارسال‌شده · در انتظار تأیید")).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), STORAGE);
  expect(stored.bookings[0].sent).toBe(true);
});

test("keyboard skip control targets the main page content", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("button", { name: "پرش به محتوای اصلی" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#app-content")).toBeFocused();
});

test("full-screen look discovery traps keyboard focus and Escape closes it", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: /دیدن مدل .* در لوک‌بوک/ }).click();
  const dialog = page.getByRole("dialog", { name: "کاوش لوک‌ها" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "بستن" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  const stillInside = await page.evaluate(() =>
    Boolean(document.activeElement?.closest('[role="dialog"][aria-label="کاوش لوک‌ها"]')),
  );
  expect(stillInside).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("storage quota failure is disclosed rather than silently treated as saved", async ({ page }) => {
  await seed(page);
  await page.goto("/#/looks");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: /^ذخیره / }).first().click();
  await expect(page.getByRole("alert")).toContainText("ذخیره‌سازی این دستگاه با خطا");
});

test("home reflows at 200 percent text scaling", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await expect(page.getByRole("heading", { name: /زیبایی شما/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/home-390-text-200.png", fullPage: true });
});

for (const tab of ["services", "looks", "bookings", "me"] as const) {
  for (const width of [320, 390]) {
    test(`${tab} page has clear heading and no sideways scrolling at ${width}px`, async ({ page }) => {
      await seed(page);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/#/${tab}`);
      await expect(page.locator("main h1")).toBeVisible();
      const metrics = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1);
      await page.screenshot({ path: `test-results/${tab}-${width}-light.png`, fullPage: true });
    });
  }
}

test("service selection reaches the full appointment-request wizard", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/services");
  const add = page.getByRole("button", { name: /^افزودن .* به انتخاب‌ها$/ }).first();
  await add.click();
  await expect(page.getByRole("button", { name: /تکمیل درخواست/ })).toBeVisible();
  await page.getByRole("button", { name: /تکمیل درخواست/ }).click();
  await expect(page.getByRole("dialog", { name: /درخواست نوبت/ })).toBeVisible();
  // Choosing services in the catalog intentionally starts the wizard at step 2 (stylist).
  await expect(page.getByRole("progressbar", { name: /پیشرفت ثبت درخواست/ })).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByRole("heading", { name: /آرتیست/ })).toBeVisible();
});

test("first-run welcome is usable and dismisses with an optional name", async ({ page }) => {
  await seed(page, { welcomed: false });
  await page.setViewportSize({ width: 320, height: 680 });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "به حنانه بیوتی خوش آمدید" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /استایل دلخواهتان/ })).toBeVisible();
  await dialog.getByRole("textbox", { name: /نام شما/ }).fill("کاربر نمونه");
  await dialog.getByRole("button", { name: /شروع و مشاهده مدل‌ها/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: /زیبایی شما/ })).toBeVisible();
});

test("bottom navigation stays visible and navigates to every core screen", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "پیمایش اصلی" });
  await expect(nav).toBeVisible();
  for (const [label, hash] of [["خدمات", "services"], ["مدل‌ها", "looks"], ["نوبت‌ها", "bookings"], ["خانه", ""]] as const) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(hash ? `#/${hash}$` : `#/$`));
    await expect(nav).toBeVisible();
  }
});

test("responsive navigation does not shrink away while scrolling", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(180);
  const nav = page.getByRole("navigation", { name: "پیمایش اصلی" });
  await expect(nav).toBeVisible();
  const height = await nav.evaluate((node) => node.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(60);
});

test("salon home has beauty photography and a visible appointment request", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /زیبایی شما/ })).toBeVisible();
  const hero = page.getByRole("region", { name: "استایل منتخب سالن" });
  await expect(hero.getByRole("img", { name: /موج/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: /دیدن مدل .* در لوک‌بوک/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "خدمات سالن زیبایی" })).toBeVisible();
  await expect(page.getByRole("button", { name: /میکاپ مجلسی/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: "درخواست نوبت" })).toBeVisible();
  await page.screenshot({ path: "test-results/salon-home-390.png", fullPage: true });
});

test("salon hero booking enters the connected appointment sheet", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.getByRole("region", { name: "استایل منتخب سالن" }).getByRole("button", { name: "درخواست نوبت" }).click();
  await expect(page.getByRole("dialog", { name: /درخواست نوبت/ })).toBeVisible();
});

test("salon brand and photo-led catalog remain legible in dark RTL", async ({ page }) => {
  await seed(page, { theme: "dark" });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "خدمات سالن زیبایی" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/salon-home-320-dark.png", fullPage: true });
});

test("lookbook photos show full square sources with actions below the images", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/looks");
  const cards = page.locator(".studio-look-card");
  await expect(cards.first()).toBeVisible();
  const positions = await cards.evaluateAll((nodes) => nodes.slice(0, 8).map((node) => {
    const img = node.querySelector(".look-card__media");
    const actions = node.querySelector(".salon25-look-card__actions");
    const imageBox = img?.getBoundingClientRect();
    const actionBox = actions?.getBoundingClientRect();
    return {
      width: imageBox?.width ?? 0,
      height: imageBox?.height ?? 0,
      imageBottom: imageBox?.bottom ?? 0,
      actionTop: actionBox?.top ?? 0,
      overlaid: Boolean(node.querySelector(".studio-look-card__frame .icon-btn, .studio-look-card__frame svg, .studio-look-card__serial")),
    };
  }));
  expect(positions.length).toBeGreaterThanOrEqual(4);
  for (const p of positions) {
    expect(Math.abs(p.width / p.height - 1)).toBeLessThan(0.025);
    expect(p.actionTop).toBeGreaterThanOrEqual(p.imageBottom - 1);
    expect(p.overlaid).toBe(false);
  }
  await expect(cards.first().getByRole("button", { name: /^ذخیره / })).toBeVisible();
  await expect(cards.first().getByRole("button", { name: /^افزودن .* به مقایسه$/ })).toBeVisible();
  await page.screenshot({ path: "test-results/lookbook-uniform-v25.png", fullPage: true });
});

test("lookbook save and compare remain functional after moving controls", async ({ page }) => {
  await seed(page);
  await page.goto("/#/looks");
  const first = page.locator(".studio-look-card").first();
  const save = first.getByRole("button", { name: /^ذخیره / });
  await save.click();
  await expect(first.getByRole("button", { name: /^حذف .* از ذخیره‌ها$/ })).toHaveAttribute("aria-pressed", "true");
  const compare = first.getByRole("button", { name: /^افزودن .* به مقایسه$/ });
  await compare.click();
  await expect(first.getByRole("button", { name: /^حذف .* از مقایسه$/ })).toHaveAttribute("aria-pressed", "true");
});

test("new salon signature logo and vector favicon render", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.locator(".topbar .salon25-brand-mark svg")).toBeVisible();
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/icons/hananeh-signature.svg");
  const response = await page.request.get("/icons/hananeh-signature.svg");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('viewBox="0 0 64 64"');
});

test("featured salon photography contains no icons or caption overlays", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const hero = page.getByRole("region", { name: "استایل منتخب سالن" });
  const image = hero.getByRole("button", { name: /دیدن مدل .* در لوک‌بوک/ });
  await expect(image).toBeVisible();
  await expect(image.locator("svg")).toHaveCount(0);
  await expect(hero.locator(".salon25-hero__caption")).toBeVisible();
  const rect = await image.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  expect(Math.abs(rect.width / rect.height - 1)).toBeLessThan(0.025);
});

test("full-screen discovery keeps its icon controls outside the portrait", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /دیدن مدل .* در لوک‌بوک/ }).click();
  const dialog = page.getByRole("dialog", { name: "کاوش لوک‌ها" });
  await expect(dialog).toBeVisible();
  const imageBox = await dialog.locator(".discover__slide:not([inert]) .discover__frame").boundingBox();
  const railBox = await dialog.locator(".discover__slide:not([inert]) .discover__rail").boundingBox();
  expect(imageBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(railBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height - 1);
  await expect(dialog.locator(".discover__slide:not([inert]) .discover__frame button")).toHaveCount(0);
  await page.screenshot({ path: "test-results/discovery-clean-390-v25.png", fullPage: true });
});

test("look detail controls are outside the full-size image", async ({ page }) => {
  await seed(page);
  await page.goto("/#/looks");
  await page.locator(".studio-look-card > button").first().click();
  const discovery = page.getByRole("dialog", { name: "کاوش لوک‌ها" });
  await expect(discovery).toBeVisible();
  await discovery.getByRole("button", { name: "جزئیات" }).click();
  const detail = page.locator(".studio-look-detail__hero");
  await expect(detail).toBeVisible();
  await expect(page.locator(".salon25-look-detail__tools")).toBeVisible();
  // Measure both boxes in the same frame: the sheet is still sliding into place,
  // so two separate measurements can come from different animation frames.
  const boxes = await page.evaluate(() => {
    const image = document.querySelector(".studio-look-detail__hero")?.getBoundingClientRect();
    const actions = document.querySelector(".salon25-look-detail__actions")?.getBoundingClientRect();
    return image && actions ? { imageBottom: image.bottom, actionsTop: actions.top } : null;
  });
  expect(boxes).not.toBeNull();
  expect(boxes!.actionsTop).toBeGreaterThanOrEqual(boxes!.imageBottom - 1);
});

test("unavailable offline hairstyle photos show a fallback instead of endless shimmer", async ({ page }) => {
  await seed(page);
  await page.route("**/looks/sm/*.webp", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "unavailable" }));
  await page.goto("/#/looks");
  const failed = page.locator(".studio-look-card .media[data-error]");
  await expect(failed.first()).toBeVisible();
  await expect(failed.first().getByText("تصویر در دسترس نیست")).toBeVisible();
  const animated = await failed.first().evaluate((element) => getComputedStyle(element).animationName);
  expect(animated).toBe("none");
});
