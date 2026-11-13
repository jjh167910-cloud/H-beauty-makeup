import { join } from "node:path";
import { test, expect, type Page } from "playwright/test";

/**
 * On-device makeup try-on: one-time download, then the face model and the makeup engine (on the
 * graphics chip, or the TinyBeauty-style tiny networks where WebGL2 is missing) run in the
 * browser. No request leaves the device.
 */
const ROOT = process.cwd();
const CUSTOMER = join(ROOT, "public/makeup/looks/no-makeup.webp");   // the catalog model without makeup (no real person)
const NOT_A_FACE = join(ROOT, "public/icons/icon-512.png");
/** Synthetic faces (no real people; see tests/fixtures/README.md) with something in front of the face. */
const FIXTURE = (name: string) => `/@fs${join(ROOT, "tests/fixtures", name)}`;
/** The looks the tests open (the page's `?look=` link, ids from src/data/makeup-styles.ts). */
const LOOK: Record<string, string> = { "گلم هالیوودی": "hollywood", "گلم نرم": "soft-glam", "خط چشم گربه‌ای": "cat-eye", "فول گلم": "full-glam" };

async function openTryOn(page: Page, title: string, megabytes = "۲۸") {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?look=${LOOK[title]}`);
  await expect(page.getByRole("heading", { name: `«${title}» روی چهره خودتان` })).toBeVisible();
  await expect(page.getByText(`حدود ${megabytes} مگابایت`)).toBeVisible();
  await page.getByRole("button", { name: "آماده‌سازی هوش مصنوعی" }).click();
  await expect(page.getByRole("button", { name: "انتخاب از گالری" })).toBeVisible({ timeout: 120_000 });
}

test("try-on downloads the AI once and paints the look on the customer's photo on the device", async ({ page }) => {
  test.setTimeout(300_000);
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || (url.hostname !== "127.0.0.1" && url.protocol.startsWith("http"))) external.push(request.url());
  });
  const requested: string[] = [];
  page.on("request", (request) => requested.push(new URL(request.url()).pathname));
  await openTryOn(page, "گلم هالیوودی");
  expect(requested.some(path => path.includes("/face-hd/"))).toBe(false);
  expect(requested.some(path => path.includes("/ort-wasm-simd-threaded.asyncify"))).toBe(false);
  expect(requested.some(path => path.includes("/layers/cat-eye"))).toBe(false);
  await expect(page.getByRole("button", { name: "گرفتن سلفی" })).toBeVisible();

  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await expect(page.locator(".tryon__stage")).toHaveAttribute("data-engine", "gpu");
  await expect(page.getByRole("slider", { name: "مقایسه قبل و بعد" })).toBeAttached();
  const levels = page.getByRole("group", { name: "شدت میکاپ" });
  await expect(levels.getByRole("button", { name: "طبیعی" })).toHaveAttribute("aria-pressed", "true");

  // The result keeps the customer's framing and actually changes her face.
  const natural = await changedShare(page);
  expect(natural.same).toBe(true);
  expect(natural.changed).toBeGreaterThan(0.002);
  expect(natural.changed).toBeLessThan(0.5);
  // Away from her face (hair, background, the picture's edges) nothing changes.
  expect(natural.outside).toBeLessThan(0.002);

  // Intensity repaints: bold changes more of her face than natural, soft less.
  await levels.getByRole("button", { name: "پررنگ" }).click();
  await expect(page.locator(".tryon__img--after")).toHaveAttribute("data-level", "bold", { timeout: 60_000 });
  const bold = await changedShare(page);
  await levels.getByRole("button", { name: "ملایم" }).click();
  await expect(page.locator(".tryon__img--after")).toHaveAttribute("data-level", "soft", { timeout: 60_000 });
  const soft = await changedShare(page);
  expect(bold.outside).toBeLessThan(0.002);
  expect(bold.changed).toBeGreaterThan(natural.changed);
  expect(soft.changed).toBeLessThan(natural.changed);
  expect(external).toEqual([]);
});

test("the try-on screen shows her own face in each look, the photo before while held, and each part's intensity", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "گلم هالیوودی");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  const after = page.locator(".tryon__img--after");
  await expect(after).toBeVisible({ timeout: 240_000 });
  const look = await after.getAttribute("src");

  // The look rail remains available without triggering dozens of automatic model downloads.
  // Unselected looks show their catalog photos until explicitly requested.
  const rail = page.getByRole("group", { name: "امتحان سبک‌های دیگر" });
  await expect(rail.locator("button").first()).toBeVisible();
  await expect.poll(() => rail.locator(".tryon__her img").count(), { timeout: 30_000 }).toBeLessThanOrEqual(1);

  // Hold to see her photo without the makeup; let go to see it again.
  const peek = page.getByRole("button", { name: "نگه دارید: عکس بدون میکاپ" });
  const box = (await peek.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await expect(after).toHaveCSS("clip-path", /inset\(0px 100%/);
  await page.mouse.up();
  await expect(peek).toHaveAttribute("aria-pressed", "false");
  await expect(after).not.toHaveCSS("clip-path", /inset\(0px 100%/);

  // Each part's intensity: lips off leaves her own lips (less of her face changed); back to the look as it was.
  const natural = await changedShare(page);
  await page.getByRole("button", { name: "تنظیم هر بخش صورت" }).click();
  const zones = page.getByRole("group", { name: "شدت هر بخش صورت" });
  await zones.getByRole("slider", { name: "لب" }).focus();
  await page.keyboard.press("Home");
  await expect(after).toHaveAttribute("data-zones", "100.100.0", { timeout: 60_000 });
  const noLips = await changedShare(page);
  expect(noLips.changed).toBeLessThan(natural.changed);
  expect(noLips.outside).toBeLessThan(0.002);
  await zones.getByRole("button", { name: "مثل خود سبک" }).click();
  await expect(after).toHaveAttribute("data-zones", "100.100.100", { timeout: 60_000 });
  await expect(after).toHaveAttribute("src", look!);                    // (made once, shown again)
});

/** Share of photo pixels the makeup changed (and whether the result keeps the photo's size). */
async function changedShare(page: Page) {
  return page.evaluate(async () => {
    const load = async (sel: string) => {
      const img = document.querySelector<HTMLImageElement>(sel)!;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
    };
    const a = await load(".tryon__img:not(.tryon__img--after)");
    const b = await load(".tryon__img--after");
    let changed = 0, border = 0, borderChanged = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const diff = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 18;
      if (diff) changed++;
      const x = (i / 4) % a.w, y = Math.floor(i / 4 / a.w);
      if (x < a.w * 0.12 || x > a.w * 0.88 || y < a.h * 0.08 || y > a.h * 0.92) { border++; if (diff) borderChanged++; }
    }
    return { same: a.w === b.w && a.h === b.h, changed: changed / (a.w * a.h), outside: borderChanged / Math.max(1, border) };
  });
}

test("a soft photo is sharpened on the device before the makeup, and that can be switched off", async ({ page }) => {
  test.setTimeout(400_000);
  // The test browser draws on the CPU (no graphics chip): allow it the time a phone wouldn't need.
  await page.addInitScript(() => { (globalThis as { hbSharpBudgetMs?: number }).hbSharpBudgetMs = 600_000; });
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || (url.hostname !== "127.0.0.1" && url.protocol.startsWith("http"))) external.push(request.url());
  });
  await openTryOn(page, "گلم هالیوودی");
  // A soft, small photo, like a selfie sent through a messenger.
  const soft = await page.evaluate(async () => {
    const img = new Image(); img.src = "/makeup/looks/no-makeup.webp"; await img.decode();
    const c = document.createElement("canvas"); c.width = 360; c.height = 480;
    const g = c.getContext("2d")!; g.filter = "blur(3px)"; g.drawImage(img, 0, 0, 360, 480);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  });
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles({ name: "soft.jpg", mimeType: "image/jpeg", buffer: Buffer.from(soft, "base64") });
  await expect(page.getByText("در حال بهتر کردن وضوح عکس…")).toBeVisible({ timeout: 60_000 });
  const stage = page.locator(".tryon__stage");
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 360_000 });
  await expect(stage).toHaveAttribute("data-sharp", "");
  expect(Number(await stage.getAttribute("data-blur"))).toBeGreaterThan(1.3);
  const sharp = await crispness(page);
  expect(sharp.width).toBeGreaterThan(360);
  expect((await changedShare(page)).changed).toBeGreaterThan(0.002);

  const clarity = page.getByRole("group", { name: "کیفیت عکس" }).getByRole("button", { name: "وضوح بیشتر" });
  await expect(clarity).toHaveAttribute("aria-pressed", "true");
  await clarity.click();
  await expect(clarity).toHaveAttribute("aria-pressed", "false");
  await expect(stage).not.toHaveAttribute("data-sharp");
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 60_000 });
  const plain = await crispness(page);
  expect(plain.width).toBe(360);
  // At the same size, the sharpened photo has clearly crisper edges than the one she gave.
  expect(sharp.edges).toBeGreaterThan(plain.edges * 1.5);
  expect(external).toEqual([]);
});

test("a phone too slow to sharpen in time paints the photo as it is", async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => { (globalThis as { hbSharpBudgetMs?: number }).hbSharpBudgetMs = 1; });
  await openTryOn(page, "گلم هالیوودی");
  const soft = await page.evaluate(async () => {
    const img = new Image(); img.src = "/makeup/looks/no-makeup.webp"; await img.decode();
    const c = document.createElement("canvas"); c.width = 360; c.height = 480;
    const g = c.getContext("2d")!; g.filter = "blur(3px)"; g.drawImage(img, 0, 0, 360, 480);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  });
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles({ name: "soft.jpg", mimeType: "image/jpeg", buffer: Buffer.from(soft, "base64") });
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await expect(page.locator(".tryon__stage")).not.toHaveAttribute("data-sharp");
  await expect(page.getByRole("button", { name: "وضوح بیشتر" })).toHaveCount(0);
  expect((await changedShare(page)).changed).toBeGreaterThan(0.002);
});

test("studio light: her photo lit like a studio portrait, her skin's brightness, tone and texture kept on every skin, and a switch", async ({ page }) => {
  test.setTimeout(600_000);
  await openTryOn(page, "گلم هالیوودی");
  const r = await page.evaluate(async (photos) => {
    const m = await import("/src/lib/tryon.ts");
    const { eyeWidth } = await import("/src/lib/makeup-gl.ts");
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    type Sq = { L: number; C: number; fine: number };
    const out: Record<string, { size: boolean; dFace: number; dCheeks: number; cheeks: { before: Sq; after: Sq }; eyes: { before: Sq; after: Sq } }> = {};
    for (const [name, url] of Object.entries(photos)) {
      const prep = await m.preparePhoto(await (await fetch(url)).blob());
      const lit = prep.studio?.plain;
      if (!lit) throw new Error("no studio light");
      const P = prep.plain.points, ew = eyeWidth(P);
      // CIELAB lightness and chroma, and fine texture (lightness minus its 3x3 mean), in squares around these points
      const squares = (c: HTMLCanvasElement, ids: number[], half: number): Sq => {
        const g = c.getContext("2d")!, h = Math.round(half * ew), n = 2 * h;
        let L = 0, C = 0, fine = 0, count = 0;
        for (const i of ids) {
          const d = g.getImageData(Math.round(P[i][0]) - h, Math.round(P[i][1]) - h, n, n).data, Ls = new Float64Array(n * n);
          for (let k = 0; k < n * n; k++) {
            const r = lin(d[k * 4] / 255), gg = lin(d[k * 4 + 1] / 255), b = lin(d[k * 4 + 2] / 255);
            const x = f((0.4124 * r + 0.3576 * gg + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * gg + 0.0722 * b), z = f((0.0193 * r + 0.1192 * gg + 0.9505 * b) / 1.08883);
            Ls[k] = 116 * y - 16; L += Ls[k]; C += Math.hypot(500 * (x - y), 200 * (y - z)); count++;
          }
          let s = 0, s2 = 0, q = 0;
          for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
            let mean = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mean += Ls[(y + dy) * n + x + dx] / 9;
            const v = Ls[y * n + x] - mean; s += v; s2 += v * v; q++;
          }
          fine += Math.sqrt(Math.max(0, s2 / q - (s / q) ** 2)) / ids.length;
        }
        return { L: L / count, C: C / count, fine };
      };
      const both = (ids: number[], half: number) => ({ before: squares(prep.plain.photo, ids, half), after: squares(lit.photo, ids, half) });
      const cheeks = both([50, 280], 0.3), face = both([50, 280, 151, 199, 6], 0.25), eyes = both([159, 386], 0.45);
      out[name] = {
        size: lit.photo.width === prep.plain.photo.width && lit.photo.height === prep.plain.photo.height && lit.points === prep.plain.points,
        dFace: face.after.L - face.before.L, dCheeks: cheeks.after.L - cheeks.before.L, cheeks, eyes,
      };
    }
    return out;
  }, { light: "/makeup/looks/no-makeup.webp", deep: FIXTURE("deep-skin.jpg") });
  for (const face of Object.values(r)) {
    expect(face.size).toBe(true);                                                     // the same photo, her face where it was
    expect(Math.abs(face.dFace)).toBeLessThan(2.5);                                   // her skin's brightness kept: no skin is lightened
    expect(Math.abs(face.dCheeks)).toBeLessThan(2.5);
    expect(face.cheeks.after.C).toBeGreaterThan(face.cheeks.before.C - 1.5);          // her colour never duller,
    expect(face.cheeks.after.C).toBeLessThan(Math.max(face.cheeks.before.C, 30) + 3); // richer only up to a healthy chroma
    expect(face.cheeks.after.fine).toBeGreaterThan(face.cheeks.before.fine * 0.75);   // her skin's fine texture kept (not plastic)
    expect(face.eyes.after.fine).toBeGreaterThan(face.eyes.before.fine * 1.3);        // her eyes and lashes crisper
  }
  expect(r.deep.cheeks.after.C).toBeGreaterThan(r.deep.cheeks.before.C + 1.2);        // flat colour made richer

  // On her photo by default, before and after alike; «نور و پوست استودیویی» switches it off and on again.
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  const stage = page.locator(".tryon__stage");
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await expect(stage).toHaveAttribute("data-studio", "");
  expect((await changedShare(page)).outside).toBeLessThan(0.002);               // (the makeup alone differs between before and after)
  const lit = await page.locator(".tryon__img--after").getAttribute("src");
  const chip = page.getByRole("group", { name: "کیفیت عکس" }).getByRole("button", { name: "نور و پوست استودیویی" });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(stage).not.toHaveAttribute("data-studio");
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".tryon__img--after")).not.toHaveAttribute("src", lit!);
  await chip.click();
  await expect(stage).toHaveAttribute("data-studio", "");
  await expect(page.locator(".tryon__img--after")).toHaveAttribute("src", lit!);  // (made once, shown again)
});

test("studio light heals blemishes on her skin (a spot, a mark) and keeps a mole, a crease, her nose and folds as they are", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "گلم هالیوودی");
  const r = await page.evaluate(async () => {
    const m = await import("/src/lib/tryon.ts");
    const { eyeWidth } = await import("/src/lib/makeup-gl.ts");
    const img = new Image(); img.src = "/makeup/looks/no-makeup.webp"; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const blob = () => new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/png"));
    const P = (await m.preparePhoto(await blob())).plain.points, ew = eyeWidth(P);
    // reddish-brown blemishes on her cheeks, forehead and chin, and one small dark mole
    const marks = [[50, 0.1, 0.05], [280, -0.1, 0], [205, 0.05, 0.1], [425, -0.05, 0.05], [151, 0.2, -0.1], [151, -0.25, 0], [199, 0.15, 0], [347, 0, 0.12]]
      .map(([i, dx, dy]) => ({ x: P[i][0] + dx * ew, y: P[i][1] + dy * ew, r: 0.045 * ew, a: 0.18, rgb: [0.55, 1, 0.95], mole: false }));
    marks.push({ x: P[330][0] + 0.1 * ew, y: P[330][1] - 0.05 * ew, r: 0.03 * ew, a: 0.6, rgb: [0.8, 0.95, 1], mole: true });
    // a round shadow under her nose (her shape, as round as a blemish)
    const shade = { x: P[2][0], y: P[2][1] + 0.08 * ew, r: 0.045 * ew, a: 0.18, rgb: [0.8, 0.95, 1], mole: false };
    const d = g.getImageData(0, 0, c.width, c.height);
    for (const k of [...marks, shade]) for (let y = Math.floor(k.y - 4 * k.r); y < k.y + 4 * k.r; y++) for (let x = Math.floor(k.x - 4 * k.r); x < k.x + 4 * k.r; x++) {
      const w = k.a * Math.exp(-((x - k.x) ** 2 + (y - k.y) ** 2) / (2 * k.r * k.r)), i = (y * c.width + x) * 4;
      for (let ch = 0; ch < 3; ch++) d.data[i + ch] = Math.round(d.data[i + ch] * (1 - w * k.rgb[ch]));
    }
    // creases: thin curved lines (an arc a quarter eye width across, as the wing of a nose or a fold) on her cheeks and chin
    const creases = [[36, -0.05, 0.05, 0], [266, 0.05, 0.05, Math.PI], [199, -0.3, -0.05, Math.PI / 2]].map(([i, dx, dy, ang]) => {
      const cx = P[i][0] + dx * ew, cy = P[i][1] + dy * ew, R = 0.25 * ew, s = 0.025 * ew;
      const ox = cx + R * Math.cos(ang), oy = cy + R * Math.sin(ang), th0 = ang + Math.PI;
      for (let y = Math.floor(oy - R - 4 * s); y < oy + R + 4 * s; y++) for (let x = Math.floor(ox - R - 4 * s); x < ox + R + 4 * s; x++) {
        const rr = Math.hypot(x + 0.5 - ox, y + 0.5 - oy), dth = Math.atan2(Math.sin(Math.atan2(y + 0.5 - oy, x + 0.5 - ox) - th0), Math.cos(Math.atan2(y + 0.5 - oy, x + 0.5 - ox) - th0));
        const w = 0.3 * Math.exp(-((rr - R) ** 2) / (2 * s * s)) * Math.min(1, Math.max(0, 1 - Math.max(0, Math.abs(dth) - 0.6) / 0.25)), j = (y * c.width + x) * 4;
        for (const [ch, k] of [[0, 0.8], [1, 1], [2, 1]]) d.data[j + ch] = Math.round(d.data[j + ch] * (1 - w * k));
      }
      return { x: cx, y: cy, r: 1.2 * s };
    });
    g.putImageData(d, 0, 0);
    const prep = await m.preparePhoto(await blob());
    const read = (cv: HTMLCanvasElement) => cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    const before = read(prep.plain.photo), after = read(prep.studio!.plain.photo);
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const Y = (px: Uint8ClampedArray, i: number) => 0.2126 * lin(px[i] / 255) + 0.7152 * lin(px[i + 1] / 255) + 0.0722 * lin(px[i + 2] / 255);
    // how much darker a mark is than the skin around it (log light): before, after
    const depth = (px: Uint8ClampedArray, k: { x: number; y: number; r: number }, inner = 0.7, ring = [2.5, 3.5]) => {
      let a = 0, na = 0, b = 0, nb = 0;
      for (let y = Math.floor(k.y - 5 * k.r); y < k.y + 5 * k.r; y++) for (let x = Math.floor(k.x - 5 * k.r); x < k.x + 5 * k.r; x++) {
        const dd = Math.hypot(x - k.x, y - k.y), i = (y * c.width + x) * 4;
        if (dd < inner * k.r) { a += Y(px, i); na++; } else if (dd > ring[0] * k.r && dd < ring[1] * k.r) { b += Y(px, i); nb++; }
      }
      return Math.log(b / nb / (a / na));
    };
    const spots = marks.filter((k) => !k.mole).map((k) => [depth(before, k), depth(after, k)]);
    const mole = marks.filter((k) => k.mole).map((k) => [depth(before, k), depth(after, k)])[0];
    // her nose's side and her nostril's crease (folds, not blemishes): their shading before and after
    const fold = [129, 358].map((i) => { const k = { x: P[i][0], y: P[i][1], r: 0.04 * ew }; return [depth(before, k), depth(after, k)]; });
    const crease = creases.map((k) => [depth(before, k, 1, [3, 4]), depth(after, k, 1, [3, 4])]);
    return { spots, mole, fold, crease, shade: [depth(before, shade), depth(after, shade)] };
  });
  const healed = r.spots.filter(([b, a]) => a < b * 0.5).length;
  expect(healed).toBeGreaterThanOrEqual(6);                                  // most blemishes at least halved
  expect(r.spots.reduce((s, [b, a]) => s + a, 0)).toBeLessThan(r.spots.reduce((s, [b]) => s + b, 0) * 0.45);
  expect(r.mole[1]).toBeGreaterThan(r.mole[0] * 0.85);                      // a mole stays: part of her
  for (const [b, a] of r.fold) expect(Math.abs(a - b)).toBeLessThan(0.08);   // her nose's shape stays
  for (const [b, a] of r.crease) expect(a, JSON.stringify(r.crease)).toBeGreaterThan(b * 0.9);   // a crease is long, not a blemish
  expect(r.shade[1], JSON.stringify(r.shade)).toBeGreaterThan(r.shade[0] * 0.9);                // the shadow under her nose stays
});

test("HD face: a soft face is redrawn in HD on the phone, her face's shape and colours kept, only on her face, and it can be switched off", async ({ page }) => {
  test.setTimeout(1_200_000);
  // (the test browser has no WebGPU: the same network on its processor; the photo isn't sharpened first)
  await page.addInitScript(() => Object.assign(globalThis, { hbFaceHd: "wasm", hbHdBudgetMs: 900_000, hbSharpBudgetMs: 1 }));
  page.on("console", (m) => { if (/HD face/.test(m.text())) console.log(m.text()); });
  await openTryOn(page, "گلم هالیوودی");
  // HD restoration is intentionally NOT part of the basic first-visit package.
  await page.evaluate(async () => {
    const { downloadHdModels } = await import("/src/lib/tryon.ts");
    await downloadHdModels(() => undefined);
  });
  const soft = await page.evaluate(async () => {
    const img = new Image(); img.src = "/makeup/looks/no-makeup.webp"; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!; g.filter = "blur(3px)"; g.drawImage(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.9);
  });
  const r = await page.evaluate(async (url) => {
    const m = await import("/src/lib/tryon.ts");
    const { eyeWidth } = await import("/src/lib/makeup-gl.ts");
    const prep = await m.preparePhoto(await (await fetch(url)).blob());
    const hd = prep.sharp;
    if (!hd || !prep.hdMs) return { hdMs: prep.hdMs ?? 0, skipped: prep.hdSkipped ?? "none" };
    const P = prep.plain.points, ew = eyeWidth(P), W = hd.photo.width, H = hd.photo.height;
    const px = (c: HTMLCanvasElement, blur = 0) => {
      const t = document.createElement("canvas"); t.width = W; t.height = H;
      const g = t.getContext("2d")!; if (blur) g.filter = `blur(${blur}px)`; g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, W, H).data;
    };
    // fine detail around her eyes (gradient energy), before and after
    const edges = (d: Uint8ClampedArray) => {
      const x0 = Math.round(Math.min(P[33][0], P[263][0]) - 0.3 * ew), x1 = Math.round(Math.max(P[33][0], P[263][0]) + 0.3 * ew);
      const y0 = Math.round(P[159][1] - 0.6 * ew), y1 = Math.round(P[145][1] + 0.4 * ew);
      const at = (x: number, y: number) => { const i = (y * W + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += (at(x + 1, y) - at(x, y)) ** 2 + (at(x, y + 1) - at(x, y)) ** 2; n++; }
      return sum / n;
    };
    // her face's shape, tones and colours (blurred: coarser than the network's detail): how far they moved, on her face
    const a = px(prep.plain.photo, Math.round(0.15 * ew)), b = px(hd.photo, Math.round(0.15 * ew));
    let diff = 0, n = 0, outside = 0, m2 = 0;
    const cx = (P[234][0] + P[454][0]) / 2, cy = (P[10][1] + P[152][1]) / 2, rx = Math.abs(P[454][0] - P[234][0]) / 2, ry = Math.abs(P[152][1] - P[10][1]) / 2;
    const plain = px(prep.plain.photo), sharp = px(hd.photo);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4, e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e < 0.6) { diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; }
      if (e > 2.5) { outside += Math.abs(plain[i] - sharp[i]) + Math.abs(plain[i + 1] - sharp[i + 1]) + Math.abs(plain[i + 2] - sharp[i + 2]); m2 += 3; }
    }
    return { hdMs: prep.hdMs, before: edges(px(prep.plain.photo)), after: edges(px(hd.photo)), coarse: diff / n, outside: outside / m2,
      same: W === prep.plain.photo.width && H === prep.plain.photo.height };
  }, soft);
  expect(r.hdMs, JSON.stringify(r)).toBeGreaterThan(0);
  expect(r.same).toBe(true);
  expect(r.after!).toBeGreaterThan(r.before! * 1.5);    // her eyes, lashes and brows far crisper
  expect(r.coarse!).toBeLessThan(3);                     // her face's shape, tones and colours hers (mean |Δ| of 255, blurred)
  expect(r.outside!).toBeLessThan(0.5);                  // nothing away from her face

  // In the app: the same photo, «وضوح بیشتر» switches it off and on.
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles({ name: "soft.jpg", mimeType: "image/jpeg", buffer: Buffer.from(soft.split(",")[1], "base64") });
  await expect(page.getByText("در حال ساختن چهره HD با هوش مصنوعی…")).toBeVisible({ timeout: 120_000 });
  const stage = page.locator(".tryon__stage");
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 900_000 });
  expect(Number(await stage.getAttribute("data-hd-ms"))).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute("data-sharp", "");
  await expect(page.getByText("چهره شما روی گوشی HD شد")).toBeVisible();
  const chip = page.getByRole("group", { name: "کیفیت عکس" }).getByRole("button", { name: "وضوح بیشتر" });
  await chip.click();
  await expect(stage).not.toHaveAttribute("data-sharp");
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 120_000 });
});

test("her own lipstick: any shade and finish on top of a look, and back to the look's own", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "گلم نرم");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  const after = page.locator(".tryon__img--after");
  await expect(after).toBeVisible({ timeout: 240_000 });
  const own = await after.getAttribute("src");
  const lookLips = await lipStats(page);
  const shades = page.getByRole("group", { name: "رنگ رژ لب" });
  await expect(shades.getByRole("button", { name: "همین سبک" })).toHaveAttribute("aria-pressed", "true");

  // A classic red: her lips turn clearly redder; the finish chips show the shade's own (matte).
  await shades.getByRole("button", { name: "قرمز کلاسیک" }).click();
  await expect(after).not.toHaveAttribute("src", own!, { timeout: 60_000 });
  await expect(after).toBeVisible({ timeout: 60_000 });
  const red = await lipStats(page);
  expect(red.red).toBeGreaterThan(lookLips.red + 25);
  const finishes = page.getByRole("group", { name: "بافت رژ لب" });
  await expect(finishes.getByRole("button", { name: "مات" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("قرمز کلاسیک · مات")).toBeVisible();

  // Glitter: grains that catch the light, much more fine detail on her lips.
  const redSrc = await after.getAttribute("src");
  await finishes.getByRole("button", { name: "اکلیلی" }).click();
  await expect(after).not.toHaveAttribute("src", redSrc!, { timeout: 60_000 });
  await expect(after).toBeVisible({ timeout: 60_000 });
  const glitter = await lipStats(page);
  expect(glitter.detail).toBeGreaterThan(red.detail * 1.5);

  // Back to the look's own lipstick: the first result again.
  await shades.getByRole("button", { name: "همین سبک" }).click();
  await expect(after).toHaveAttribute("src", own!, { timeout: 60_000 });
});

/** Her lower lip on the result (the bare catalog photo, 900 x 1200): how red, and how much fine detail. */
async function lipStats(page: Page) {
  return page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>(".tryon__img--after")!;
    await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const k = c.width / 900, x0 = Math.round(300 * k), y0 = Math.round(740 * k), w = Math.round(80 * k), h = Math.round(24 * k);
    const d = g.getImageData(x0, y0, w, h).data;
    let red = 0, detail = 0;
    const Y = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      red += d[i] - d[i + 1];
      if (x + 1 < w && y + 1 < h) detail += (Y(i + 4) - Y(i)) ** 2 + (Y(i + w * 4) - Y(i)) ** 2;
    }
    return { red: red / (w * h), detail: detail / ((w - 1) * (h - 1)) };
  });
}

/** Width of the "before" photo, and its edge energy around the face once drawn at 360 x 480. */
async function crispness(page: Page) {
  return page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>(".tryon__img:not(.tryon__img--after)")!;
    await img.decode();
    const c = document.createElement("canvas"); c.width = 360; c.height = 480;
    const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, 360, 480);
    const { data } = g.getImageData(90, 150, 180, 220);
    const at = (x: number, y: number) => { const i = (y * 180 + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
    let sum = 0;
    for (let y = 0; y < 219; y++) for (let x = 0; x < 179; x++) sum += (at(x + 1, y) - at(x, y)) ** 2 + (at(x, y + 1) - at(x, y)) ** 2;
    return { width: img.naturalWidth, edges: sum / (179 * 219) };
  });
}

test("phones without WebGL2 get the tiny-network engine and still paint on the device", async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return kind === "webgl2" ? null : (original as (...args: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
    } as typeof original;
  });
  await openTryOn(page, "گلم هالیوودی", "۴۰");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await expect(page.locator(".tryon__stage")).toHaveAttribute("data-engine", "tiny");
  const result = await changedShare(page);
  expect(result.changed).toBeGreaterThan(0.002);
});

test("live mirror paints the look on the camera picture and a capture becomes a photo try-on", async ({ page }) => {
  test.setTimeout(300_000);
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(request.url());
  });
  await fakeCamera(page);
  await openTryOn(page, "گلم هالیوودی");
  await page.getByRole("button", { name: "آینه زنده" }).click();
  const live = page.locator(".tryon__live");
  await expect(live).toHaveAttribute("data-engine", "gpu");
  await expect(live).toHaveAttribute("data-face", "", { timeout: 60_000 });
  await expect.poll(async () => Number(await live.getAttribute("data-net-ms")), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await live.getAttribute("data-fps")), { timeout: 30_000 }).toBeGreaterThan(0);
  // The mirror shows the makeup: her lips on screen are redder than in the camera picture.
  await expect.poll(() => liveLipRedness(page), { timeout: 30_000 }).toBeGreaterThan(20);
  // Switching looks and intensity keeps the camera running.
  await page.getByRole("button", { name: /غروب/ }).first().click();
  await expect(page.getByText("زنده · غروب")).toBeVisible();
  await page.getByRole("group", { name: "شدت میکاپ" }).getByRole("button", { name: "پررنگ" }).click();
  await expect(page.getByRole("button", { name: "پررنگ" })).toHaveAttribute("aria-pressed", "true");
  const red = page.getByRole("group", { name: "رنگ رژ لب" }).getByRole("button", { name: "قرمز کلاسیک" });
  await red.click();
  await expect(red).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => liveLipRedness(page), { timeout: 30_000 }).toBeGreaterThan(20);
  // Studio light is on in the mirror too, and can be switched off and on with the camera running.
  const light = page.getByRole("group", { name: "کیفیت عکس" }).getByRole("button", { name: "نور و پوست استودیویی" });
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await light.click();
  await expect(light).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => liveLipRedness(page), { timeout: 30_000 }).toBeGreaterThan(20);
  await light.click();
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "گرفتن عکس" }).click();
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".tryon__img--after")).toHaveAttribute("alt", /غروب/);
  expect(external).toEqual([]);
});

test("her own makeup with coloured lenses, before and after side by side, and in the live mirror: her recipe on the camera picture, and back to making it", async ({ page }) => {
  test.setTimeout(600_000);
  await fakeCamera(page);
  await openTryOn(page, "گلم هالیوودی");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  await page.getByRole("tab", { name: "میکاپ من" }).click();
  await page.getByRole("list", { name: "قدم‌های میکاپ من" }).getByRole("button", { name: "رژ لب" }).click();
  await page.getByRole("group", { name: "رنگ رژ لب" }).getByRole("button", { name: "قرمز کلاسیک" }).click();
  await expect(page.locator(".mine .steps__view")).toHaveAttribute("data-steps", "1");
  // coloured lenses: her irises only, above her lips
  const lipsOn = await mineDiff(page);
  await page.getByRole("list", { name: "قدم‌های میکاپ من" }).getByRole("button", { name: "لنز رنگی" }).click();
  await page.getByRole("group", { name: "رنگ لنز رنگی" }).getByRole("button", { name: "سبز" }).click();
  const lens = await mineDiff(page, lipsOn);
  expect(lens.share).toBeGreaterThan(0.0003);
  expect(lens.share).toBeLessThan(0.02);
  expect(lens.y1).toBeLessThan(0.6);
  // before and after side by side: right of the divider, her bare face
  await page.getByRole("button", { name: "مقایسه قبل و بعد کنار هم" }).click();
  await page.getByRole("slider", { name: "مقایسه قبل و بعد" }).fill("50");
  const halves = await mineDiff(page, lens);
  expect(halves.x0).toBeGreaterThan(0.4);
  await page.getByRole("button", { name: "مقایسه قبل و بعد کنار هم" }).click();
  expect((await mineDiff(page, lens)).share).toBeLessThan(0.001);
  await expect(page.locator(".mine .steps__view")).toHaveAttribute("data-steps", "2");
  await page.getByRole("button", { name: "آینه زنده با میکاپ من" }).click();
  const live = page.locator(".tryon__live");
  await expect(live).toHaveAttribute("data-mine", "");
  await expect(live).toHaveAttribute("data-face", "", { timeout: 60_000 });
  await expect(page.getByText("زنده · میکاپ من")).toBeVisible();
  // her lipstick on the camera picture; the look's own controls are not hers, so they are not shown
  await expect.poll(() => liveLipRedness(page), { timeout: 90_000 }).toBeGreaterThan(20);
  await expect(page.getByRole("group", { name: "شدت میکاپ" })).toHaveCount(0);
  await page.getByRole("button", { name: "بازگشت به میکاپ من" }).click();
  await expect(page.getByRole("tab", { name: "میکاپ من" })).toHaveAttribute("aria-selected", "true", { timeout: 240_000 });
  await expect(page.locator(".mine .steps__view")).toHaveAttribute("data-steps", "2");
});

/** A stand-in front camera: a face photo drawn into a canvas stream. */
async function fakeCamera(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image();
      img.src = "/makeup/looks/no-makeup.webp";
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 480; c.height = 640;
      const g = c.getContext("2d")!;
      const draw = () => { g.drawImage(img, -120, -40, 720, 960); requestAnimationFrame(draw); };
      draw();
      return c.captureStream(30);
    };
  });
}

/**
 * How much redder (R - G) the centre of the mouth is on the live mirror than in the stand-in
 * camera picture (the face photo drawn at -120, -40, 720 x 960 into 480 x 640).
 */
async function liveLipRedness(page: Page) {
  return page.evaluate(async () => {
    const view = document.querySelector<HTMLCanvasElement>(".tryon__live")!;
    const img = new Image(); img.src = "/makeup/looks/no-makeup.webp"; await img.decode();
    const cam = document.createElement("canvas"); cam.width = view.width; cam.height = view.height;
    const g = cam.getContext("2d")!;
    const k = view.width / 480;
    g.drawImage(img, -120 * k, -40 * k, 720 * k, 960 * k);
    // lower lip of the bare catalog face: about (336, 755) in the 900 x 1200 photo
    const x = Math.round((-120 + 336 * 0.8) * k), y = Math.round((-40 + 755 * 0.8) * k), r = Math.round(7 * k);
    const red = (c: CanvasRenderingContext2D) => {
      const d = c.getImageData(x - r, y - r, 2 * r, 2 * r).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] - d[i + 1];
      return s / (d.length / 4);
    };
    const shown = document.createElement("canvas"); shown.width = view.width; shown.height = view.height;
    const sg = shown.getContext("2d")!; sg.drawImage(view, 0, 0);
    return red(sg) - red(g);
  });
}

/**
 * The live mirror's landmarks steadied (steady.ts): on tracker shimmer like MediaPipe's, a still face shimmers far less;
 * her head turning, rolling or coming closer isn't trailed (its rigid motion is taken as it is); a blink still follows.
 */
test("live mirror: her landmarks are steadied, a still face doesn't shimmer and a moving one isn't trailed", async ({ page }) => {
  await page.goto("/");
  const r = await page.evaluate(async () => {
    const { Steady } = await import("/src/lib/steady.ts");
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const N = 478, ew = 60, fps = 30;
    const base = Array.from({ length: N }, (_, i) => [200 + (i % 30) * 6, 200 + Math.floor(i / 30) * 6, 0]);
    const run = (truth: (f: number) => number[][], idx?: number[]) => {
      const s = new Steady();
      let err = 0, raw = 0, n = 0, worst = 0;
      for (let f = 0; f < 120; f++) {
        const tr = truth(f), noisy = tr.map((p) => [p[0] + gauss() * 0.8, p[1] + gauss() * 0.8, 0] as [number, number, number]);
        const out = s.apply(noisy, ew, (f * 1000) / fps);
        if (f < 10) continue;
        for (const i of idx ?? tr.map((_, k) => k)) {
          const e = Math.hypot(out[i][0] - tr[i][0], out[i][1] - tr[i][1]);
          err += e * e; raw += (noisy[i][0] - tr[i][0]) ** 2 + (noisy[i][1] - tr[i][1]) ** 2; n++; worst = Math.max(worst, e);
        }
      }
      return { rms: Math.sqrt(err / n), raw: Math.sqrt(raw / n), worst };
    };
    const lid = [...Array(40).keys()];
    return {
      still: run(() => base),
      turn: run((f) => base.map((p) => [p[0] + (4 * ew * f) / fps, p[1], 0])),
      roll: run((f) => { const a = (Math.PI / 3) * (f / fps), c = Math.cos(a), s = Math.sin(a); return base.map((p) => [290 + c * (p[0] - 290) - s * (p[1] - 245), 245 + s * (p[0] - 290) + c * (p[1] - 245), 0]); }),
      blink: run((f) => { const k = f % 40, d = k < 3 ? k / 3 : k < 5 ? 1 : k < 8 ? 1 - (k - 5) / 3 : 0; return base.map((p, i) => (i < 40 ? [p[0], p[1] + 10 * d, 0] : p)); }, lid),
    };
  });
  expect(r.still.rms).toBeLessThan(r.still.raw / 2.5);      // a still face: far less shimmer
  expect(r.turn.rms).toBeLessThan(r.turn.raw / 2.5);        // turning fast (4 eye widths a second): no trail
  expect(r.roll.rms).toBeLessThan(r.roll.raw / 2.5);
  expect(r.blink.rms).toBeLessThan(r.blink.raw);            // a blink: her lids follow (better than the tracker alone)
  expect(r.blink.worst).toBeLessThan(5);
});

test("try-on explains when no face is found", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "گلم نرم");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(NOT_A_FACE);
  await expect(page.getByRole("alert")).toContainText("چهره‌ای پیدا نشد", { timeout: 60_000 });
});

/**
 * The tutorial engine (her own makeup's tutorial plays through it): with no steps done the photo is
 * untouched, with all done it is exactly the normal try-on, and each step on its own changes only its
 * part of the face.
 */
test("tutorial steps add up to the try-on, and each step stays in its zone", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "گلم هالیوودی");
  const r = await page.evaluate(async () => {
    const m = await import("/src/lib/tryon.ts");
    const blob = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
    const shot = m.tutorialShot((await m.preparePhoto(blob)).plain);
    const look = "hollywood";
    const px = (c: HTMLCanvasElement) => {
      const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
      const g = t.getContext("2d")!; g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    const keys = m.STEP_KEYS;
    const state = (on: (k: string) => number, active?: { key: (typeof keys)[number]; t: number }) => ({
      done: Object.fromEntries(keys.map((k) => [k, on(k)])) as Record<(typeof keys)[number], number>, active, blush: "apples",
    });
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let max = 0, sum = 0;
      for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(a[i + c] - b[i + c]); max = Math.max(max, d); sum += d; }
      return { max, mean: sum / (a.length * 0.75) };
    };
    const photo = px(shot.photo);
    shot.vis = await m.visibility(shot.photo, shot.points);
    shot.lips = m.lipProb(shot.photo, shot.points);
    const normal = px(await m.paintGpu(shot.photo, shot.points, look, "natural", shot.face, null, undefined, undefined, shot.vis, shot.lips));
    const none = px(await m.paintSteps(shot, look, "natural", null, state(() => 0)));
    const all = px(await m.paintSteps(shot, look, "natural", null, state(() => 1)));
    // One step on its own: the share of the pixels it changes that lie in its zone's box (grown by half an eye).
    const geo = m.stepGeometry(shot.points, "apples");
    const P = shot.points;
    const ew = (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;
    const inZone: Record<string, number> = {};
    for (const key of ["shadow", "liner", "blush", "lips"] as const) {
      const one = px(await m.paintSteps(shot, look, "natural", null, state((k) => (k === key ? 1 : 0))));
      const pts = (geo[key].outline ?? geo[key].polys).flat();
      const x0 = Math.min(...pts.map((p) => p[0])) - ew / 2, x1 = Math.max(...pts.map((p) => p[0])) + ew / 2;
      const y0 = Math.min(...pts.map((p) => p[1])) - ew / 2, y1 = Math.max(...pts.map((p) => p[1])) + ew / 2;
      let changed = 0, inside = 0;
      for (let i = 0; i < one.length; i += 4) {
        if (Math.abs(one[i] - photo[i]) + Math.abs(one[i + 1] - photo[i + 1]) + Math.abs(one[i + 2] - photo[i + 2]) <= 9) continue;
        changed++;
        const x = (i / 4) % shot.photo.width, y = Math.floor(i / 4 / shot.photo.width);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) inside++;
      }
      inZone[key] = changed > 50 ? inside / changed : -changed;
    }
    // Lips half way through: some of the lipstick, not all of it.
    const allButLips = px(await m.paintSteps(shot, look, "natural", null, state((k) => (k === "lips" ? 0 : 1))));
    const half = px(await m.paintSteps(shot, look, "natural", null, state((k) => (k === "lips" ? 0 : 1), { key: "lips", t: 0.5 })));
    const lipsTotal = diff(allButLips, all).mean, lipsHalf = diff(allButLips, half).mean;
    return { width: shot.photo.width, none: diff(none, photo), all: diff(all, normal), inZone, lipsShare: lipsHalf / lipsTotal };
  });
  expect(r.width).toBeLessThanOrEqual(1100);
  expect(r.none.max).toBeLessThanOrEqual(2);
  expect(r.all.max).toBeLessThanOrEqual(2);
  for (const share of Object.values(r.inZone)) expect(share).toBeGreaterThan(0.9);
  expect(r.lipsShare).toBeGreaterThan(0.15);
  expect(r.lipsShare).toBeLessThan(0.85);
});

/**
 * Products over a look, engine side: with nothing swapped the picture is the look's own; a swapped
 * eyeshadow colours her lids and nothing below them; intensity 0 takes a step off; her liner colour.
 */
test("products over a look, engine side: a swapped eyeshadow lands on the lids only, and a step's intensity scales it", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "گلم هالیوودی");
  const r = await page.evaluate(async () => {
    const m = await import("/src/lib/tryon.ts");
    const blob = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
    const shot = m.tutorialShot((await m.preparePhoto(blob)).plain);
    const look = "hollywood";
    const px = (c: HTMLCanvasElement) => {
      const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
      const g = t.getContext("2d")!; g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    shot.vis = await m.visibility(shot.photo, shot.points);
    const paint = async (picks: unknown) => px(await m.paintGpu(shot.photo, shot.points, look, "natural", shot.face, null, undefined, picks as never, shot.vis));
    const P = shot.points, W = shot.photo.width;
    const ew = (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;
    // her lid (above the upper lid's middle, below the brow) and her cheek / lips (well below the eyes)
    const box = (cx: number, cy: number, w: number, h: number) => ({ x0: Math.round(cx - w / 2), y0: Math.round(cy - h / 2), x1: Math.round(cx + w / 2), y1: Math.round(cy + h / 2) });
    const lid = box(P[386][0], P[386][1] - ew * 0.2, ew * 0.4, ew * 0.12);
    const low = box(P[0][0], (P[1][1] + P[152][1]) / 2, ew * 2.5, (P[152][1] - P[1][1]) * 0.9);
    const stat = (d: Uint8ClampedArray, b: { x0: number; y0: number; x1: number; y1: number }) => {
      let blue = 0, n = 0;
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const i = (y * W + x) * 4; blue += d[i + 2] - d[i]; n++; }
      return blue / n;
    };
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray, bx?: { x0: number; y0: number; x1: number; y1: number }) => {
      let max = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (bx) { const x = (i / 4) % W, y = Math.floor(i / 4 / W); if (x < bx.x0 || x >= bx.x1 || y < bx.y0 || y >= bx.y1) continue; }
        for (let c = 0; c < 3; c++) max = Math.max(max, Math.abs(a[i + c] - b[i + c]));
      }
      return max;
    };
    const own = await paint(null);
    const zonesOnly = await paint({ gain: { blush: 1.0001 } });
    const navy = await paint({ shadow: { hex: "#24305e", finish: "matte", lookStyle: "wash" } });
    const noLips = await paint({ gain: { lips: 0 } });
    const stepsNoLips = px(await m.paintSteps(shot, look, "natural", null, {
      done: Object.fromEntries(m.STEP_KEYS.map((k) => [k, k === "lips" ? 0 : 1])) as never, blush: "apples",
    }));
    const liner = await paint({ liner: { hex: "#1f5fd0" } });
    const band = box(P[386][0], P[386][1], ew * 0.5, ew * 0.08);
    return {
      zonesOnly: diff(own, zonesOnly), navyLid: stat(navy, lid) - stat(own, lid), navyLow: diff(own, navy, low),
      noLips: diff(noLips, stepsNoLips), linerBand: stat(liner, band) - stat(own, band),
    };
  });
  expect(r.zonesOnly).toBeLessThanOrEqual(2);     // the zones path itself changes nothing
  expect(r.navyLid).toBeGreaterThan(15);          // navy on the lid
  expect(r.navyLow).toBeLessThanOrEqual(2);       // and nowhere below the eyes
  expect(r.noLips).toBeLessThanOrEqual(2);        // lips at 0 = the tutorial before the lips step
  expect(r.linerBand).toBeGreaterThan(4);         // a blue liner
});

/**
 * Her own makeup reads as itself on light and very deep skin, at 100 %: an artist's eyeshadow and a blush show clearly;
 * a contour shades her (darker, hardly a tint: it is her own skin a few shades deeper, never yellow or ashy); a
 * highlight is a sheen at most 1.6 times as bright as her skin under it, not a lamp, and never a grey veil.
 */
test("her own makeup reads on every skin tone: eyeshadow and blush show at 100 %, a contour shades without a tint, a highlight is a sheen", async ({ page }) => {
  test.setTimeout(600_000);
  await openTryOn(page, "گلم هالیوودی");
  const r = await page.evaluate(async (photos) => {
    const m = await import("/src/lib/tryon.ts");
    const d = await import("/src/data/my-makeup.ts");
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lab = (d8: Uint8ClampedArray, i: number) => {
      const r = lin(d8[i] / 255), g = lin(d8[i + 1] / 255), b = lin(d8[i + 2] / 255);
      const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)), y];
    };
    const px = (c: HTMLCanvasElement) => {
      const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
      const g = t.getContext("2d")!; g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    const out: Record<string, Record<string, { p95: number; dL: number; da: number; db: number; bright: number }>> = {};
    for (const [name, url] of Object.entries(photos)) {
      const shot = m.tutorialShot((await m.preparePhoto(await (await fetch(url)).blob())).plain);
      const bare = px(shot.photo);
      const stat = (img: Uint8ClampedArray) => {
        const rows: number[][] = [], ratio: number[] = [];
        for (let i = 0; i < img.length; i += 4) {
          const a = lab(bare, i), b = lab(img, i), dE = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          if (dE <= 1) continue;
          rows.push([dE, b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
          if (a[3] > 0.02) ratio.push(b[3] / a[3]);         // (how much brighter, where her skin isn't near black)
        }
        rows.sort((x, y) => x[0] - y[0]);
        ratio.sort((x, y) => x - y);
        const bright = ratio[Math.floor(ratio.length * 0.99)] ?? 1;
        const top = rows.slice(Math.floor(rows.length * 0.9)), mean = (k: number) => top.reduce((s, x) => s + x[k], 0) / Math.max(1, top.length);
        return { p95: rows[Math.floor(rows.length * 0.95)]?.[0] ?? 0, dL: mean(1), da: mean(2), db: mean(3), bright };
      };
      const one = async (recipe: unknown) => stat(px(await m.paintMine(shot, d.minePicks(recipe as never)!)));
      out[name] = {
        shadow: await one({ shadow: { amount: 1, shade: "peach", shade2: "bronze", place: "wash", tool: "fluffy" } }),
        blush: await one({ blush: { amount: 1, shade: "rose", place: "apples", tool: "fluffy" } }),
        contour: await one({ contour: { amount: 1, shade: "neutral", place: "cheek", tool: "angled" } }),
        glow: await one({ glow: { amount: 1, shade: "champagne", finish: "glow", place: "cheek", tool: "fan" } }),
      };
    }
    return out;
  }, { light: "/makeup/looks/no-makeup.webp", deep: FIXTURE("deep-skin.jpg") });
  for (const face of Object.values(r)) {
    expect(face.shadow.p95).toBeGreaterThan(8);                 // an artist's eyeshadow shows
    expect(face.blush.p95).toBeGreaterThan(6);                  // a blush shows,
    expect(face.blush.da).toBeGreaterThan(3);                   // as a flush
    expect(face.contour.dL).toBeLessThan(-3.5);                 // a contour shades her,
    expect(Math.abs(face.contour.da)).toBeLessThan(3);          // hardly tints her
    expect(Math.abs(face.contour.db)).toBeLessThan(3);
    expect(face.glow.p95).toBeGreaterThan(4);                   // a highlight shows,
    expect(face.glow.bright).toBeLessThan(2);                   // as a sheen, not a lamp (cap 1.6 in her photo's gamma),
    expect(face.glow.da).toBeGreaterThan(-4);                   // never grey
    expect(face.glow.db).toBeGreaterThan(-5);
  }
});

/**
 * Both eyes get the same makeup: the catalog model's head is turned, so her far eye is seen at an angle;
 * it is painted with the mirror image of the near eye. A flipped photo then gives the flipped result.
 */
test("both eyes get the look (and her own eyeshadow) equally: a mirrored photo gives the mirrored result", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "خط چشم گربه‌ای");
  const r = await page.evaluate(async () => {
    const m = await import("/src/lib/tryon.ts");
    const blob = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
    const img = await createImageBitmap(blob);
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
    const flipped = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
    const a = (await m.preparePhoto(blob)).plain, b = (await m.preparePhoto(flipped)).plain;
    const px = (cv: HTMLCanvasElement, flip = false) => {
      const t = document.createElement("canvas"); t.width = cv.width; t.height = cv.height;
      const tg = t.getContext("2d")!; if (flip) { tg.translate(t.width, 0); tg.scale(-1, 1); }
      tg.drawImage(cv, 0, 0); return tg.getImageData(0, 0, t.width, t.height).data;
    };
    const out: Record<string, number[]> = {};
    // the look's own makeup, and her own eyeshadow placed as the artists did it (navy, smoky)
    const navy = { shadow: { hex: "#24305e", finish: "matte", style: "smoky", lookStyle: "wash" } };
    for (const [name, look, picks] of [["cat-eye", "cat-eye", undefined], ["fox-eye", "fox-eye", undefined], ["navy smoky", "cat-eye", navy]] as const) {
      const ra = px(await m.paintGpu(a.photo, a.points, look, "natural", a.face, null, undefined, picks as never));
      const rb = px(await m.paintGpu(b.photo, b.points, look, "natural", b.face, null, undefined, picks as never), true);
      const bare = px(a.photo);
      const P = a.points, W = a.photo.width;
      const ew = (Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]) + Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1])) / 2;
      out[name] = [[33, 133], [263, 362]].map(([i, j]) => {
        const cx = (P[i][0] + P[j][0]) / 2, cy = (P[i][1] + P[j][1]) / 2;
        let mismatch = 0, makeup = 0;
        for (let y = Math.round(cy - ew * 0.6); y < cy + ew * 0.4; y++) for (let x = Math.round(cx - ew); x < cx + ew; x++) {
          const k = (y * W + x) * 4;
          for (let ch = 0; ch < 3; ch++) { mismatch += Math.abs(ra[k + ch] - rb[k + ch]); makeup += Math.abs(ra[k + ch] - bare[k + ch]); }
        }
        return mismatch / Math.max(makeup, 1);
      });
    }
    return out;
  });
  // (with only the near eye's makeup on both eyes this is landmark noise; the far eye's own was ~0.9-1.3)
  for (const ratios of Object.values(r)) for (const x of ratios) expect(x).toBeLessThan(0.7);
});

/**
 * Makeup only where her face can be seen: nothing is painted over hair falling across her eye,
 * sunglasses, or a hand in front of her mouth (the segmenter marks her face skin, a guided filter
 * moves its edges onto the photo's own).
 */
test("nothing is painted over hair, sunglasses or a hand in front of her face", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "فول گلم");
  const r = await page.evaluate(async (urls) => {
    const m = await import("/src/lib/tryon.ts");
    const out: Record<string, { vis: boolean; covered: number; coveredMax: number; face: number; lens?: number }> = {};
    for (const [name, url] of Object.entries(urls)) {
      const shot = (await m.preparePhoto(await (await fetch(url)).blob())).plain;
      const result = await m.paintLook(shot, "full-glam", "natural");
      const vis = shot.vis;
      shot.vis = null;                                  // the same look painted everywhere, for comparison
      const all = await m.paintLook(shot, "full-glam", "natural");
      const W = shot.photo.width, H = shot.photo.height;
      const px = (c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, W, H).data;
      const a = px(result), b = px(all), o = px(shot.photo);
      // where the made-up face and the made-up-everywhere one differ (what the map kept off), the
      // result must be her own photo; elsewhere the look is there
      let covered = 0, coveredMax = 0, face = 0;
      for (let i = 0; i < a.length; i += 4) {
        const painted = Math.abs(b[i] - o[i]) + Math.abs(b[i + 1] - o[i + 1]) + Math.abs(b[i + 2] - o[i + 2]);
        const kept = Math.abs(a[i] - o[i]) + Math.abs(a[i + 1] - o[i + 1]) + Math.abs(a[i + 2] - o[i + 2]);
        if (painted > 30 && kept < 4) covered++;
        if (painted > 30 && kept >= 0.8 * painted) face++;
        if (painted > 30 && kept < painted * 0.2) coveredMax = Math.max(coveredMax, kept);
      }
      const P = shot.points;
      let lens: number | undefined;
      if (name === "sunglasses") {                   // the dark lens over each eye stays as it is
        lens = 0;
        for (const c of [468, 473]) for (let y = -6; y <= 6; y++) for (let x = -10; x <= 10; x++) {
          const i = ((Math.round(P[c][1]) + y) * W + Math.round(P[c][0]) + x) * 4;
          lens = Math.max(lens, Math.abs(a[i] - o[i]), Math.abs(a[i + 1] - o[i + 1]), Math.abs(a[i + 2] - o[i + 2]));
        }
      }
      out[name] = { vis: Boolean(vis), covered, coveredMax, face, lens };
    }
    return out;
  }, { hair: FIXTURE("hair-over-eye.jpg"), sunglasses: FIXTURE("sunglasses.jpg"), hand: FIXTURE("hand-over-mouth.jpg") });
  for (const [name, x] of Object.entries(r)) {
    expect(x.vis, name).toBe(true);
    expect(x.covered, name).toBeGreaterThan(300);    // makeup kept off what covers her face
    expect(x.face, name).toBeGreaterThan(1500);      // and on her face as before
  }
  expect(r.sunglasses.lens).toBeLessThanOrEqual(3);
});

/** The after image's pixels (to compare results). */
async function afterPixels(page: Page) {
  return page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>(".tryon__img--after")!;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    return { src: img.src, w: c.width, h: c.height, data: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
  });
}

test("her own outlines: the app suggests checking a face in profile, a moved lip point moves the lipstick, and back to automatic", async ({ page }) => {
  test.setTimeout(400_000);
  await openTryOn(page, "گلم هالیوودی");
  // The outlines move smoothly: a moved handle moves its point exactly, the other parts stay.
  const field = await page.evaluate(async () => {
    const o = await import("/src/lib/outline.ts");
    const P = Array.from({ length: 478 }, (_, i) => [100 + (i % 23) * 13, 100 + Math.floor(i / 23) * 17, 0] as [number, number, number]);
    const ids = { corner: 61, eye: 33, brow: 105, chin: 152, upperLip: 0 };
    const moved = o.withOffsets(P, { lips: [[0.02, 0.01]] }, 1000);
    const d = (i: number) => Math.hypot(moved[i][0] - P[i][0], moved[i][1] - P[i][1]);
    return { corner: [moved[61][0] - P[61][0], moved[61][1] - P[61][1]], eye: d(ids.eye), brow: d(ids.brow), chin: d(ids.chin), none: o.withOffsets(P, {}, 1000).every((p, i) => p[0] === P[i][0] && p[1] === P[i][1]) };
  });
  expect(field.corner[0]).toBeCloseTo(20, 1);
  expect(field.corner[1]).toBeCloseTo(10, 1);
  expect(field.eye + field.brow + field.chin).toBe(0);
  expect(field.none).toBe(true);

  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(join(ROOT, "tests/fixtures/profile.jpg"));
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  // A face in profile: the far eye's points can't be found well, so the app suggests checking them.
  await expect(page.locator(".tryon__doubt")).toContainText("نیم‌رخ");
  const first = await afterPixels(page);
  await page.locator(".tryon__doubt").getByRole("button", { name: "تنظیم" }).click();
  await expect(page.getByRole("tab", { name: "چشم‌ها" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "لب‌ها" }).click();
  // Drag the first lip handle (a corner of her mouth) outwards.
  const dot = page.locator(".contour__dot").first();
  const b = (await dot.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 30, b.y + b.height / 2 + 6, { steps: 6 });
  await expect(page.locator(".contour__loupe")).toBeVisible();
  await page.mouse.up();
  await page.getByRole("button", { name: "اعمال" }).click();
  await expect(page.locator(".tryon__outline")).toContainText("خودتان تنظیم کرده‌اید", { timeout: 240_000 });
  await expect.poll(async () => (await afterPixels(page)).src !== first.src, { timeout: 120_000 }).toBe(true);
  const edited = await afterPixels(page);
  // Only around her mouth did the result change.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (let i = 0; i < first.data.length; i += 4) {
    if (Math.abs(first.data[i] - edited.data[i]) + Math.abs(first.data[i + 1] - edited.data[i + 1]) + Math.abs(first.data[i + 2] - edited.data[i + 2]) < 30) continue;
    const x = (i / 4) % first.w, y = Math.floor(i / 4 / first.w);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); n++;
  }
  const face = await page.evaluate(async (url) => {
    const m = await import("/src/lib/tryon.ts");
    const P = (await m.preparePhoto(await (await fetch(url)).blob())).plain.points;
    return { eye: Math.max(P[145][1], P[374][1]), chin: P[152][1], mouth: [P[61][0], P[0][1], P[17][1]] };
  }, FIXTURE("profile.jpg"));
  expect(n).toBeGreaterThan(80);
  expect(y0).toBeGreaterThan(face.eye);             // below her eyes
  expect(y1).toBeLessThan(face.chin);               // above her chin
  expect(y0).toBeLessThan(face.mouth[2]);           // around her mouth
  expect(y1).toBeGreaterThan(face.mouth[1]);
  // Back to the face model's outlines: the same result as at first.
  await page.locator(".tryon__outline").getByRole("button", { name: "خودکار" }).click();
  await expect(page.locator(".tryon__outline")).toContainText("جای دقیقش", { timeout: 240_000 });
  await expect.poll(async () => (await afterPixels(page)).src !== edited.src, { timeout: 120_000 }).toBe(true);
  const back = await afterPixels(page);
  let diff = 0;
  for (let i = 0; i < first.data.length; i++) diff += Math.abs(first.data[i] - back.data[i]);
  expect(diff / first.data.length).toBeLessThan(0.5);
});

test("a small face in a full-length photo is found, and photos the app is unsure of are flagged", async ({ page }) => {
  test.setTimeout(300_000);
  await openTryOn(page, "گلم هالیوودی");
  const r = await page.evaluate(async (urls) => {
    const m = await import("/src/lib/tryon.ts");
    const o = await import("/src/lib/outline.ts");
    const out: Record<string, { eye: number; doubt: string | null }> = {};
    for (const [name, url] of Object.entries(urls)) {
      const shot = (await m.preparePhoto(await (await fetch(url)).blob())).plain;
      const P = shot.points;
      out[name] = { eye: Math.hypot(P[33][0] - P[133][0], P[33][1] - P[133][1]), doubt: o.outlineDoubt(P, m.lipProb(shot.photo, P))?.reason ?? null };
    }
    return out;
  }, { small: FIXTURE("small-face.jpg"), profile: FIXTURE("profile.jpg"), hair: FIXTURE("hair-over-eye.jpg"), sunglasses: FIXTURE("sunglasses.jpg") });
  expect(r.small.eye).toBeGreaterThan(8);           // found, with eyes of a plausible size
  expect(r.small.eye).toBeLessThan(40);
  expect(r.profile.doubt).toBe("profile");
  expect(r.hair.doubt).toBeNull();                  // clear photos are left alone
  expect(r.sunglasses.doubt).toBeNull();
});

/** Her own makeup's picture, settled: how it differs from `ref` (pixels changed by more than 6 levels: share, centre, box). */
/** A settled picture of her own makeup, kept in the page (`id`), and how it differs from an earlier one. */
type MineShot = { id: number; share: number; cx: number; cy: number; x0: number; y0: number; x1: number; y1: number; red: number; light: number };
async function mineDiff(page: Page, ref?: MineShot): Promise<MineShot> {
  // settled: not drawing, and the same picture a moment later
  const sum = () => page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".mine .steps__view")!;
    if (c.hasAttribute("data-busy")) return -1;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) % 1_000_000_007;
    return h;
  });
  let last = -2;
  await expect.poll(async () => { const h = await sum(); const same = h >= 0 && h === last; last = h; return same; },
    { intervals: [400], timeout: 90_000 }).toBe(true);
  // (the pictures stay in the page: sending whole canvases to the test runner and back runs it out of memory)
  return page.evaluate((prev) => {
    const c = document.querySelector<HTMLCanvasElement>(".mine .steps__view")!;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    const shots = ((window as unknown as { __mine?: Uint8ClampedArray[] }).__mine ??= []);
    const id = shots.push(d) - 1;
    if (prev === null) return { id, share: 0, cx: 0, cy: 0, x0: 0, y0: 0, x1: 0, y1: 0, red: 0, light: 0 };
    const p = shots[prev];
    let n = 0, sx = 0, sy = 0, x0 = 1, y0 = 1, x1 = 0, y1 = 0, red = 0, light = 0;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - p[i], dg = d[i + 1] - p[i + 1], db = d[i + 2] - p[i + 2];
      if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) <= 6) continue;
      const x = ((i / 4) % c.width) / c.width, y = Math.floor(i / 4 / c.width) / c.height;
      n++; sx += x; sy += y; red += dr - dg; light += (dr + dg + db) / 3;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { id, share: n / (c.width * c.height), cx: n ? sx / n : 0, cy: n ? sy / n : 0, x0, y0, x1, y1, red: n ? red / n : 0, light: n ? light / n : 0 };
  }, ref?.id ?? null);
}

test("her own makeup: built step by step on her bare face, each product where it goes, every change undone and redone, zoomed in to look closely, an artist's two-shade eyeshadow, played back as her own tutorial, saved and sent with a booking", async ({ page }) => {
  test.setTimeout(1_800_000);
  await openTryOn(page, "گلم هالیوودی");
  await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(CUSTOMER);
  await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
  // Two views: the look before / after, and her own makeup (the look's step-by-step tab is gone).
  await expect(page.getByRole("tablist", { name: "نمایش" }).getByRole("tab")).toHaveText([/قبل و بعد/, /میکاپ من/]);
  await page.getByRole("tab", { name: "میکاپ من" }).click();
  const view = page.locator(".mine .steps__view");
  // It starts from her bare photo, independent of the look she was trying.
  await expect(view).toHaveAttribute("data-steps", "0");
  const bare = await mineDiff(page);
  const rail = page.getByRole("list", { name: "قدم‌های میکاپ من" });
  expect(await rail.getByRole("button").allTextContents()).toEqual(["لنز رنگی", "کرم‌پودر", "کانسیلر", "کانتور", "رژگونه", "هایلایت", "ابرو", "سایه چشم", "خط چشم", "ریمل و مژه", "رژ لب"]);

  // Lipstick: on her lips only, redder.
  await rail.getByRole("button", { name: "رژ لب" }).click();
  await page.getByRole("group", { name: "رنگ رژ لب" }).getByRole("button", { name: "قرمز کلاسیک" }).click();
  await expect(view).toHaveAttribute("data-steps", "1");
  const lips = await mineDiff(page, bare);
  expect(lips.share).toBeGreaterThan(0.002);
  expect(lips.red).toBeGreaterThan(8);
  expect(lips.cy).toBeGreaterThan(0.6);

  // Blush on her cheeks: between her eyes and her lips, on both sides; its amount at 0 takes it off.
  await rail.getByRole("button", { name: "رژگونه" }).click();
  await page.getByRole("group", { name: "رنگ رژگونه" }).getByRole("button", { name: "بری" }).click();
  const blush = await mineDiff(page, lips);
  expect(blush.share).toBeGreaterThan(0.005);
  expect(blush.red).toBeGreaterThan(2);
  expect(blush.cy).toBeGreaterThan(0.4);
  expect(blush.cy).toBeLessThan(lips.cy);
  expect(blush.x1 - blush.x0).toBeGreaterThan(0.3);
  await page.getByRole("slider", { name: "شدت رژگونه" }).fill("0");
  expect((await mineDiff(page, lips)).share).toBeLessThan(0.002);
  await page.getByRole("slider", { name: "شدت رژگونه" }).fill("100");

  // Liner: a thin line at her upper lash lines, above her lips and blush.
  const withBlush = await mineDiff(page);
  await rail.getByRole("button", { name: "خط چشم" }).click();
  await page.getByRole("group", { name: "رنگ خط چشم" }).getByRole("button", { name: "مشکی" }).click();
  const liner = await mineDiff(page, withBlush);
  expect(liner.share).toBeGreaterThan(0.001);
  expect(liner.share).toBeLessThan(0.03);
  expect(liner.cy).toBeLessThan(blush.cy);

  // No painting with her finger: the products go where their placements put them.
  const withLiner = await mineDiff(page);
  await rail.getByRole("button", { name: "رژگونه" }).click();
  await expect(page.getByRole("button", { name: "کشیدن با انگشت" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "پاک‌کن", exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "جای رژگونه" })).not.toContainText("فقط جایی که می‌کشم");

  // Every change is one step back and forward: the blush taken off, back, off again, and back.
  const history = page.locator(".mine__history");
  await page.getByRole("button", { name: "حذف این قدم" }).click();
  const noBlush = await mineDiff(page, withLiner);
  expect(noBlush.share).toBeGreaterThan(0.005);
  await history.getByRole("button", { name: "برگرداندن" }).click();
  expect((await mineDiff(page, withLiner)).share).toBeLessThan(0.002);
  await history.getByRole("button", { name: "انجام دوباره" }).click();
  expect((await mineDiff(page, noBlush)).share).toBeLessThan(0.002);
  await history.getByRole("button", { name: "برگرداندن" }).click();
  expect((await mineDiff(page, withLiner)).share).toBeLessThan(0.002);

  // Zoomed in to look closely (the wheel here; two fingers on her phone), one finger moves the photo, and back.
  const vb = (await view.boundingBox())!;
  await page.mouse.move(vb.x + vb.width * 0.5, vb.y + vb.height * 0.4);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200);
  await expect(view).toHaveAttribute("style", /scale\(/);
  const zoomedAt = await view.getAttribute("style");
  await page.mouse.down();
  await page.mouse.move(vb.x + vb.width * 0.3, vb.y + vb.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await expect(view).toHaveAttribute("style", /scale\(/);
  expect(await view.getAttribute("style")).not.toBe(zoomedAt);
  await expect(page.locator(".mine .tryon__tag--before")).toBeHidden();     // (moving it isn't holding it)
  await history.getByRole("button", { name: "اندازه اصلی عکس" }).click();
  await expect(view).not.toHaveAttribute("style", /scale\(/);

  // Eyeshadow as an artist lays it: her lid shade on her lids, a darker second shade in her crease and outer
  // corners, and a light in her inner corners (between her eyes, lighter).
  await rail.getByRole("button", { name: "سایه چشم" }).click();
  await page.getByRole("group", { name: "رنگ سایه چشم" }).getByRole("button", { name: "شامپاینی" }).click();
  const lid = await mineDiff(page, withLiner);
  expect(lid.share).toBeGreaterThan(0.002);
  expect(lid.cy).toBeLessThan(blush.cy);
  await page.getByRole("group", { name: "رنگ چین پلک و گوشه بیرونی" }).getByRole("button", { name: "قهوه‌ای شکلاتی" }).click();
  const second = await mineDiff(page, lid);
  expect(second.share).toBeGreaterThan(0.001);
  expect(Math.abs(second.cy - lid.cy)).toBeLessThan(0.05);
  expect(second.light).toBeLessThan(0);
  await page.getByRole("group", { name: "نور گوشه چشم" }).getByRole("button", { name: "مرواریدی" }).click();
  const inner = await mineDiff(page, second);
  expect(inner.share).toBeGreaterThan(0.0002);
  expect(inner.light).toBeGreaterThan(0);
  expect(Math.abs(inner.cx - lid.cx)).toBeLessThan(0.05);
  expect(inner.x1 - inner.x0).toBeLessThan((lid.x1 - lid.x0) * 0.8);

  // Played back as her own step-by-step tutorial: her steps in order, paused, one forward, back to making it.
  const stage = page.locator(".mine__stage");
  await page.getByRole("button", { name: "آموزش قدم‌به‌قدم میکاپ من" }).click();
  await expect(stage).toHaveAttribute("data-tour", "blush");
  await page.getByRole("button", { name: "توقف پخش" }).click();
  await expect(page.locator(".mine .steps__label")).toContainText("قدم ۱ از ۴");
  await expect(stage).not.toHaveAttribute("data-moving", "", { timeout: 180_000 });
  await page.waitForTimeout(3500);
  await expect(stage).toHaveAttribute("data-tour", "blush");          // (paused: it waits for her)
  await page.getByRole("button", { name: "قدم بعدی" }).click();
  await expect(stage).toHaveAttribute("data-tour", "shadow");
  await expect(page.locator(".mine__card h3")).toHaveText("سایه چشم");
  await page.getByRole("button", { name: "بازگشت به ساختن میکاپ" }).click();
  await expect(stage).not.toHaveAttribute("data-tour");
  await expect(rail).toBeVisible();

  // Hold the photo: her bare face.
  await view.hover();
  await page.mouse.down();
  await expect(page.locator(".mine .tryon__tag--before")).toBeVisible();
  expect((await mineDiff(page, bare)).share).toBeLessThan(0.001);
  await page.mouse.up();

  // Saved on her phone, under her name for it.
  await page.getByRole("button", { name: "ذخیره میکاپ" }).click();
  await page.getByLabel("نام این میکاپ").fill("مهمانی جمعه");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.locator(".mine__saved-list")).toContainText("مهمانی جمعه");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hb-my-makeup-v1") ?? "[]"));
  expect(saved[0].name).toBe("مهمانی جمعه");
  expect(Object.keys(saved[0].recipe).sort()).toEqual(["blush", "liner", "lips", "shadow"]);

  // Booked with it: the request carries her recipe as text for the artist (no photo).
  await page.getByRole("button", { name: "رزرو با این میکاپ" }).click();
  const booking = page.getByRole("dialog", { name: "درخواست رزرو" });
  await expect(booking).toContainText("میکاپ من: مهمانی جمعه");
  await expect(booking).toContainText("رژ لب: قرمز کلاسیک");
  await expect(booking).toContainText("رژگونه: بری");
  await expect(booking).toContainText("نور گوشه چشم مرواریدی");
  await expect(booking.locator("img, canvas")).toHaveCount(0);
  expect(await booking.innerHTML()).not.toContain("data:image");
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("one finger moves an outline point (near it or anywhere), never the photo; two fingers zoom; arrows nudge", async ({ page }) => {
    test.setTimeout(300_000);
    await openTryOn(page, "گلم هالیوودی");
    await page.locator(".tryon input[type=file]:not([capture])").setInputFiles(join(ROOT, "tests/fixtures/profile.jpg"));
    await expect(page.locator(".tryon__img--after")).toBeVisible({ timeout: 240_000 });
    await page.locator(".tryon__doubt").getByRole("button", { name: "تنظیم" }).tap();
    await page.getByRole("tab", { name: "لب‌ها" }).tap();
    const settled = async () => {   // the editor scrolls itself into view: wait until it stands still
      let last = -1;
      await expect.poll(async () => { const y = (await page.locator(".contour__view").boundingBox())!.y; const still = Math.abs(y - last) < 0.5 && y >= 0; last = y; return still; }, { intervals: [150] }).toBe(true);
    };
    await settled();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, pts: Array<[number, number]>) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const drag = async (pts: (i: number) => Array<[number, number]>) => {
      await touch("touchStart", pts(0));
      for (let i = 1; i <= 6; i++) await touch("touchMove", pts(i));
      await touch("touchEnd", []);
    };
    const state = async () => ({
      view: (await page.locator(".contour__view").getAttribute("viewBox"))!.split(" ").map(Number),
      dots: await page.locator(".contour__dot").evaluateAll((els) => els.map((e) => [Number(e.getAttribute("cx")), Number(e.getAttribute("cy")), e.hasAttribute("data-picked")] as const)),
    });
    const box = (await page.locator(".contour__view").boundingBox())!;
    const unit = (v: number[]) => v[2] / Math.min(box.width, box.height);
    const s0 = await state();
    // a finger a little off the first point, dragged left: that point moves with it, the photo stays
    const b = (await page.locator(".contour__dot").first().boundingBox())!;
    const [x, y] = [b.x + b.width / 2 + 6, b.y + b.height / 2 + 5];
    await drag((i) => [[x - 5 * i, y]]);
    const s1 = await state();
    expect(s1.view).toEqual(s0.view);
    expect(s1.dots[0][2]).toBe(true);
    expect(s1.dots[0][0] - s0.dots[0][0]).toBeCloseTo(-30 * unit(s0.view), 0);
    // a finger anywhere else moves the point she took, as far as the finger moves
    await drag((i) => [[box.x + box.width / 2 + 4 * i, box.y + 30]]);
    const s2 = await state();
    expect(s2.view).toEqual(s0.view);
    expect(s2.dots[0][0] - s1.dots[0][0]).toBeCloseTo(24 * unit(s0.view), 0);
    // two fingers apart zoom in; no point moves
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await drag((i) => [[cx - 30 - 10 * i, cy], [cx + 30 + 10 * i, cy]]);
    const s3 = await state();
    expect(s3.view[2]).toBeLessThan(s2.view[2] * 0.5);
    expect(s3.dots).toEqual(s2.dots);
    // the arrows nudge the point she took
    await page.getByRole("button", { name: "راست" }).tap();
    const s4 = await state();
    expect(s4.dots[0][0]).toBeGreaterThan(s3.dots[0][0]);
    expect(s4.dots[0][1]).toBe(s3.dots[0][1]);

    // any point moves, not only the first: two points along the face edge, one after the other
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("tab", { name: "دور صورت" }).tap();
    let lastView = "";       // (the face edge's own view, standing still)
    await expect.poll(async () => { const v = (await page.locator(".contour__view").getAttribute("viewBox"))!; const still = v === lastView; lastView = v; return still; }, { intervals: [150] }).toBe(true);
    const moveDot = async (i: number, dx: number, dy: number) => {
      const d = (await page.locator(".contour__dot").nth(i).boundingBox())!;
      const [px, py] = [d.x + d.width / 2 + 4, d.y + d.height / 2 + 3];
      await drag((j) => [[px + (dx * j) / 6, py + (dy * j) / 6]]);
    };
    const f0 = await state();
    await moveDot(5, -24, 0);
    const f1 = await state();
    await moveDot(8, 0, 18);
    const f2 = await state();
    const u = unit(f0.view);
    expect(f1.dots[5][0] - f0.dots[5][0]).toBeCloseTo(-24 * u, 0);
    expect(f2.dots[8][1] - f1.dots[8][1]).toBeCloseTo(18 * u, 0);
    expect(f2.dots[5].slice(0, 2)).toEqual(f1.dots[5].slice(0, 2));
    // applied, then opened again: her moves are there and another point moves
    await page.getByRole("button", { name: "اعمال" }).tap();
    await expect(page.locator(".tryon__outline")).toContainText("خودتان تنظیم کرده‌اید", { timeout: 240_000 });
    await page.locator(".tryon__outline").getByRole("button", { name: "ویرایش" }).tap();
    await page.getByRole("tab", { name: "دور صورت" }).tap();
    await settled();
    const g0 = await state();
    expect(g0.dots[5].slice(0, 2)).toEqual(f2.dots[5].slice(0, 2));
    await moveDot(2, 15, 15);
    const g1 = await state();
    expect(g1.dots[2][0]).toBeGreaterThan(g0.dots[2][0] + 1);
    expect(errors).toEqual([]);
  });
});
