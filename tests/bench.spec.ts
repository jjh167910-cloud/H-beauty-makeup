import { join } from "node:path";
import { test, expect } from "playwright/test";

/**
 * The artist's bench (/bench): the roadmap's Phase 2 gate. The artist signs in with the salon's passcode, adds a
 * benchmark photo (it stays on her phone: only its hash goes with the scores), sees a look painted by both engines as
 * «الف» and «ب», scores both on every line, and the result counts it; a new round clears the scores.
 */
const PHOTO = join(process.cwd(), "tests/fixtures/lit-cheek.jpg");   // (a synthetic face)
const PASSCODE = "test-salon-passcode";

test("the artist scores a look by both engines, blind, on her own photo; the gate counts it; nothing but scores is sent", async ({ page }) => {
  test.setTimeout(400_000);
  const sent: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/") && r.postData()) sent.push(r.postData()!); });
  await page.goto("/bench");
  await page.getByLabel("رمز سالن").fill(PASSCODE);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.getByRole("tab", { name: "نتیجه" }).click();
  await page.getByRole("button", { name: "دور تازه" }).waitFor();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "دور تازه" }).click();
  await page.getByRole("tab", { name: "امتیاز دادن" }).click();

  await page.locator(".bench input[type=file]").setInputFiles(PHOTO);
  await expect(page.getByRole("button", { name: "عکس ۱" })).toBeEnabled({ timeout: 120_000 });
  const a = page.getByRole("img", { name: /تصویر الف/ }), b = page.getByRole("img", { name: /تصویر ب/ });
  await expect(a).toBeVisible({ timeout: 240_000 });
  await expect(b).toBeVisible();
  // (two different pictures: the old engine's and the new one's)
  expect(await a.getAttribute("src")).not.toEqual(await b.getAttribute("src"));
  const save = page.getByRole("button", { name: /ذخیره و میکاپ بعدی|به هر خط/ });
  await expect(save).toBeDisabled();
  for (const line of ["جای‌گذاری", "رنگ واقعی", "لبه‌ها", "بافت پوست", "چشم‌ها", "به مشتری نشانش می‌دهم"]) {
    await page.getByRole("button", { name: `${line}، تصویر الف: 3` }).click();
    await page.getByRole("button", { name: `${line}، تصویر ب: 5` }).click();
  }
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "از ۴۲ میکاپ" })).toContainText("۱ از ۴۲");
  await expect(page.getByRole("option", { name: /✓/ })).toHaveCount(1);

  // the result: one picture by both engines; each line's means are 3 and 5, one way round or the other
  await page.getByRole("tab", { name: "نتیجه" }).click();
  await expect(page.getByText("۱ تصویر با هر دو موتور")).toBeVisible();
  const row = page.getByRole("row", { name: /چشم‌ها/ });
  await expect(row).toContainText(/۳\.۰۰|۵\.۰۰/);
  await expect(page.getByText("هنوز نه: موتور قدیم می‌ماند.")).toBeVisible();   // (41 looks not scored yet)

  // only scores went to the server: a look, an engine, a 16-digit hash for the photo, never an image
  const cards = sent.filter((s) => s.includes("\"scores\"")).map((s) => JSON.parse(s));
  expect(cards).toHaveLength(2);
  expect(cards.map((c) => c.engine).sort()).toEqual(["v1", "v2"]);
  for (const c of cards) expect(c.photo).toMatch(/^[a-f0-9]{16}$/);
  expect(sent.some((s) => s.includes("data:image") || s.length > 2000)).toBe(false);
});
