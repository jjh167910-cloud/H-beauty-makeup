import { join } from "node:path";
import { test, expect } from "playwright/test";

/**
 * The salon's own chat: open to every customer from the top of the page, and from a booking; she gives her name and
 * phone the first time (text only, never her photo); the salon signs in to its inbox (/salon) with its passcode (the
 * dev server's SALON_PASSCODE: playwright.config.ts), finds her chat, answers with a quick reply; each side sees the
 * other's answer and that its own was read.
 */
const CUSTOMER = join(process.cwd(), "public/makeup/looks/no-makeup.webp");   // the catalog model (no real person)
const PASSCODE = "test-salon-passcode";

test("her booking in the salon's own chat: the salon signs in, finds it, answers; both see the answer and «seen»", async ({ page, browser }) => {
  test.setTimeout(400_000);
  const sent: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/") && r.postData()) sent.push(r.postData()!); });
  await page.goto("/");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await page.getByRole("button", { name: "رزرو همین میکاپ" }).click();
  await page.getByRole("dialog", { name: "درخواست رزرو" }).getByRole("button", { name: "ارسال برای سالن" }).click();

  // the chat: the salon's welcome; her booking ready to send; her name and phone first
  const chat = page.getByRole("dialog", { name: "گفت‌وگو با سالن" });
  await expect(chat.getByRole("heading", { name: "حنانه بیوتی" })).toBeVisible();
  await expect(chat).toContainText("به حنانه بیوتی خوش آمدید");
  await expect(chat.getByRole("textbox", { name: "پیام" })).toHaveValue(/سبک: گلم هالیوودی/);
  const send = chat.getByRole("button", { name: "ارسال برای سالن" });
  await send.click();
  await expect(chat.getByRole("alert")).toContainText("نام و شماره تلفن");
  await chat.getByRole("textbox", { name: "نام" }).fill("مریم");
  await chat.getByRole("textbox", { name: "شماره تلفن" }).fill("12");
  await send.click();
  await expect(chat.getByRole("alert")).toContainText("شماره تلفن درست نیست");
  await expect(chat.getByRole("textbox", { name: "پیام" })).toHaveValue(/سبک: گلم هالیوودی/);   // her text kept
  await chat.getByRole("textbox", { name: "شماره تلفن" }).fill("۰۹۱۲ ۳۴۵ ۶۷۸۹");
  await send.click();
  const list = chat.getByRole("list", { name: "پیام‌ها" });
  await expect(list.locator(".chat__card")).toContainText("گلم هالیوودی");           // her booking as a card,
  await expect(list.locator(".chat__card img")).toHaveAttribute("src", /\/makeup\/looks\/sm\/hollywood\.webp$/);   // the look's photo
  await expect(list.getByLabel("ارسال شد")).toHaveCount(1);
  await expect(chat.getByRole("textbox", { name: "نام" })).toHaveCount(0);              // asked once
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
  await salon.getByRole("searchbox", { name: "جست‌وجو با نام یا شماره" }).fill("۰۹۱۲۳");
  const threads = salon.getByRole("list", { name: "گفت‌وگوها" });
  await expect(threads.getByRole("button")).toHaveCount(1);
  await expect(threads).toContainText("درخواست نوبت — گلم هالیوودی");
  await threads.getByRole("button", { name: /مریم/ }).click();
  const open = salon.getByRole("region", { name: "گفت‌وگو با مریم" });
  await expect(open.locator(".chat__card")).toContainText("شدت: طبیعی");
  await expect(open.getByRole("link", { name: /تماس با ۰۹۱۲۳۴۵۶۷۸۹/ })).toHaveAttribute("href", "tel:09123456789");
  await expect(list.getByLabel("دیده شد")).toHaveCount(1, { timeout: 20_000 });       // she sees the salon read it

  // a quick reply, finished and sent
  await open.getByRole("group", { name: "پاسخ‌های آماده" }).getByRole("button", { name: "سلام، از پیامتان ممنونیم. چه روز و ساعتی برایتان مناسب است؟", exact: true }).click();
  await expect(open.getByRole("textbox", { name: "پاسخ" })).toHaveValue(/چه روز و ساعتی برایتان مناسب است؟/);
  await open.getByRole("button", { name: "فرستادن" }).click();
  await expect(open.getByRole("list", { name: "پیام‌ها" }).getByLabel("ارسال شد")).toHaveCount(1);

  // her chat shows the answer by itself, and the salon sees she read it
  await expect(list).toContainText("چه روز و ساعتی برایتان مناسب است؟", { timeout: 20_000 });
  await expect(open.getByRole("list", { name: "پیام‌ها" }).getByLabel("دیده شد")).toHaveCount(1, { timeout: 20_000 });
  await chat.getByRole("textbox", { name: "پیام" }).fill("پنجشنبه ساعت ۴ عالیه، ممنون");
  await chat.getByRole("button", { name: "فرستادن" }).click();
  await expect(open.getByRole("list", { name: "پیام‌ها" })).toContainText("پنجشنبه ساعت ۴", { timeout: 20_000 });

  // closed, her chat stays a tap away; the salon signs out
  await chat.getByRole("button", { name: "بستن" }).click();
  await page.getByRole("button", { name: "گفت‌وگو با سالن" }).click();
  await expect(page.getByRole("dialog", { name: "گفت‌وگو با سالن" })).toContainText("پنجشنبه ساعت ۴");
  await salon.getByRole("button", { name: "همه‌ی پیام‌ها" }).click();
  await salon.getByRole("button", { name: "خروج" }).click();
  await expect(salon.getByLabel("رمز سالن")).toBeVisible();
  await salonPhone.close();
});

test("any customer can chat with the salon from the top of the page, starting from a quick topic", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "گفت‌وگو با سالن" }).click();
  const chat = page.getByRole("dialog", { name: "گفت‌وگو با سالن" });
  await chat.getByRole("group", { name: "موضوع پیام" }).getByRole("button", { name: "قیمت‌ها" }).click();
  await expect(chat.getByRole("textbox", { name: "پیام" })).toHaveValue(/قیمت میکاپ/);
  // full screen on a phone, every control a finger's size
  const box = (await chat.locator(".chat__sheet").boundingBox())!;
  expect(box.width).toBe(390);
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".chat button, .chat input, .chat textarea")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 43.5 || r.height < 43.5); })
    .map((e) => e.getAttribute("aria-label") ?? e.textContent));
  expect(small).toEqual([]);
  await chat.getByRole("textbox", { name: "نام" }).fill("سارا");
  await chat.getByRole("textbox", { name: "شماره تلفن" }).fill("09351234567");
  await chat.getByRole("textbox", { name: "پیام" }).press("End");
  await chat.getByRole("textbox", { name: "پیام" }).pressSequentially("برای میکاپ مجلسی");
  await chat.getByRole("button", { name: "ارسال برای سالن" }).click();
  await expect(chat.getByRole("list", { name: "پیام‌ها" })).toContainText("قیمت میکاپ را می‌خواستم بدانم. برای میکاپ مجلسی");
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
  await phone.close();
});
