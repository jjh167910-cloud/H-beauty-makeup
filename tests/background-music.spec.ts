import { expect, test } from "playwright/test";
test.skip(process.env.VITE_SALON_MUSIC !== "true", "Music file not installed/licensed for this build");
test("music loops across navigation and remembers mute preference", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hananeh-atelier-v1",
      JSON.stringify({ welcomed: true, theme: "light", bookings: [], favMakeup: [] }));
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true, value: function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play")); return Promise.resolve();
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true, value: function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("pause"));
      },
    });
  });
  await page.goto("/#/");
  const audio = page.locator("audio[src='/audio/hananeh-salon-ambience.mp3']");
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute("loop", "");
  await page.getByRole("button", { name: "حنانه بیوتی، خانه" }).click();
  const toggle = page.getByRole("button", { name: "قطع موسیقی پس‌زمینه" });
  await expect(toggle).toHaveAttribute("data-playing", "");
  await page.getByRole("button", { name: "خدمات", exact: true }).first().click();
  await expect(audio).toHaveCount(1);
  await toggle.click();
  await expect(page.getByRole("button", { name: "پخش موسیقی پس‌زمینه" }))
    .toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem("hananeh-salon-music-enabled-v1"))).toBe("off");
  await page.reload();
  await expect(page.getByRole("button", { name: "پخش موسیقی پس‌زمینه" }))
    .toHaveAttribute("aria-pressed", "false");
});


/**
 * This test uses the generated, rights-free 9-second CI tone and REAL HTMLMediaElement
 * playback. A normal click is required; no mocked play/pause methods are installed.
 */
test("real MP3 starts after user tap and keeps playing across salon navigation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => {
    localStorage.setItem("hananeh-atelier-v1",
      JSON.stringify({ welcomed: true, theme: "light", bookings: [], favMakeup: [] }));
    localStorage.removeItem("hananeh-salon-music-enabled-v1");
  });
  await page.goto("/#/");
  const audio = page.locator("audio[src='/audio/hananeh-salon-ambience.mp3']");
  const play = page.getByRole("button", { name: "پخش موسیقی پس‌زمینه" });
  await expect(play).toBeVisible();
  const tap = await play.boundingBox();
  expect(tap?.height).toBeGreaterThanOrEqual(44);
  expect(tap?.width).toBeGreaterThanOrEqual(44);
  await expect.poll(() => audio.evaluate((element) =>
    (element as HTMLAudioElement).readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await play.click();
  await expect(page.getByRole("button", { name: "قطع موسیقی پس‌زمینه" })).toBeVisible();
  await expect.poll(() => audio.evaluate((element) =>
    (element as HTMLAudioElement).currentTime), { timeout: 15_000 }).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "خدمات", exact: true }).first().click();
  await expect(audio).toHaveCount(1);
  expect(await audio.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(false);
  await page.getByRole("button", { name: "قطع موسیقی پس‌زمینه" }).click();
  await expect(page.getByRole("button", { name: "پخش موسیقی پس‌زمینه" }))
    .toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => audio.evaluate((element) =>
    (element as HTMLAudioElement).paused)).toBe(true);
});
