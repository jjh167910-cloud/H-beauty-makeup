import { join } from "node:path";
import { test, expect } from "playwright/test";

/**
 * The salon's own chat: she sends her booking from the try-on with her name and phone (text only, never her photo), the
 * salon signs in to its inbox (/salon) with its passcode (the dev server's SALON_PASSCODE: playwright.config.ts), sees
 * the new chat, calls or answers her, and her chat shows the answer.
 */
const CUSTOMER = join(process.cwd(), "public/makeup/looks/no-makeup.webp");   // the catalog model (no real person)
const PASSCODE = "test-salon-passcode";

test("her booking in the salon's own chat: the salon signs in, answers, and she reads the answer", async ({ page, browser }) => {
  test.setTimeout(400_000);
  const sent: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/") && r.postData()) sent.push(r.postData()!); });
  await page.goto("/");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await page.getByRole("button", { name: "رزرو همین میکاپ" }).click();
  await page.getByRole("dialog", { name: "درخواست رزرو" }).getByRole("button", { name: "ارسال برای سالن" }).click();

  // her details, and her booking as the first message (she can change it)
  const chat = page.getByRole("dialog", { name: "گفت‌وگو با سالن" });
  await expect(chat.getByRole("textbox", { name: "پیام" })).toHaveValue(/سبک: گلم هالیوودی/);
  const send = chat.getByRole("button", { name: "ارسال برای سالن" });
  await expect(send).toBeDisabled();                                          // her name and phone first
  await chat.getByRole("textbox", { name: "نام" }).fill("مریم");
  await chat.getByRole("textbox", { name: "شماره تلفن" }).fill("12");
  await send.click();
  await expect(chat.getByRole("alert")).toContainText("شماره تلفن درست نیست");
  await chat.getByRole("textbox", { name: "شماره تلفن" }).fill("۰۹۱۲ ۳۴۵ ۶۷۸۹");
  await send.click();
  await expect(chat.getByRole("list", { name: "پیام‌ها" }).getByRole("listitem")).toHaveCount(1);
  await expect(chat.getByRole("list", { name: "پیام‌ها" })).toContainText("سبک: گلم هالیوودی");
  expect(sent.every((body) => body.length < 4000 && !body.includes("data:image"))).toBe(true);   // never her photo

  // the salon, on its own phone
  const salonPhone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const salon = await salonPhone.newPage();
  await salon.goto("/salon");
  await salon.getByLabel("رمز سالن").fill("wrong");
  await salon.getByRole("button", { name: "ورود" }).click();
  await expect(salon.getByRole("alert")).toContainText("رمز درست نیست");
  await salon.getByLabel("رمز سالن").fill(PASSCODE);
  await salon.getByRole("button", { name: "ورود" }).click();
  await expect(salon.getByRole("heading", { name: "پیام‌های مشتریان (۱ تازه)" })).toBeVisible();
  await salon.getByRole("list", { name: "گفت‌وگوها" }).getByRole("button", { name: /مریم/ }).click();
  await expect(salon.getByRole("region", { name: "گفت‌وگو با مریم" })).toContainText("شدت: طبیعی");
  await expect(salon.getByRole("link", { name: /۰۹۱۲۳۴۵۶۷۸۹/ })).toHaveAttribute("href", "tel:09123456789");
  await salon.getByRole("textbox", { name: "پاسخ" }).fill("سلام مریم جان، پنجشنبه ساعت ۴ وقت داریم.");
  await salon.getByRole("button", { name: "فرستادن" }).click();
  await expect(salon.getByRole("list", { name: "پیام‌ها" }).getByRole("listitem")).toHaveCount(2);

  // her chat shows the salon's answer by itself
  await expect(chat.getByRole("list", { name: "پیام‌ها" })).toContainText("پنجشنبه ساعت ۴", { timeout: 20_000 });
  await chat.getByRole("textbox", { name: "پیام" }).fill("عالیه، ممنون");
  await chat.getByRole("button", { name: "فرستادن" }).click();
  await expect(salon.getByRole("list", { name: "پیام‌ها" })).toContainText("عالیه، ممنون", { timeout: 20_000 });

  // closed, her chat stays a tap away; the salon signs out
  await chat.getByRole("button", { name: "بستن" }).click();
  await page.getByRole("button", { name: "گفت‌وگو با سالن" }).click();
  await expect(page.getByRole("dialog", { name: "گفت‌وگو با سالن" }).getByRole("listitem")).toHaveCount(3);
  await salon.getByRole("button", { name: "همه‌ی پیام‌ها" }).click();
  await salon.getByRole("button", { name: "خروج" }).click();
  await expect(salon.getByLabel("رمز سالن")).toBeVisible();
  await salonPhone.close();
});
