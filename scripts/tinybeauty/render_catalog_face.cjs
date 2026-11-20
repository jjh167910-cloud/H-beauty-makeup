/*
 * The engine's renders of looks on the bare catalog face, for `strength.py renders DIR` and `calibrate.py DIR` (each
 * look's own gains, src/data/look-gains.json). DIR must hold 0_bare.png and points.json (the catalog model without
 * makeup, bare.py, and her points); write them first:
 *
 *   python -c "import sys; sys.path.insert(0, 'scripts/tinybeauty'); import teacher as T, json, cv2; b, p = T._bare(); \
 *     cv2.imwrite('DIR/0_bare.png', cv2.cvtColor(b, cv2.COLOR_RGB2BGR)); json.dump(p.tolist(), open('DIR/points.json', 'w'))"
 *   node scripts/tinybeauty/render_catalog_face.cjs DIR --looks wine-lips,icy [--engine v1] [--url http://127.0.0.1:5173/]
 *
 * Writes DIR/<look>.png (natural intensity, the photo as it is: no sharpening, no studio light). Needs the dev server
 * (npm run dev) and Playwright's Chromium (software WebGL is enough).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const DIR = process.argv[2];
const LOOKS = (arg("looks", "") || "").split(",").filter(Boolean);
const ENGINE = arg("engine", "v1");
const URL_ = arg("url", "http://127.0.0.1:5173/");
if (!DIR || !LOOKS.length || !fs.existsSync(path.join(DIR, "0_bare.png"))) {
  console.error("usage: render_catalog_face.cjs DIR --looks a,b [--engine v1|v2] [--url ...] (DIR/0_bare.png first)"); process.exit(2);
}
(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: "block" })).newPage();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(URL_);
  await page.evaluate((engine) => sessionStorage.setItem("hb-engine", engine), ENGINE);
  const b64 = fs.readFileSync(path.join(DIR, "0_bare.png")).toString("base64");
  for (const look of LOOKS) {
    const t0 = Date.now();
    const url = await page.evaluate(async ({ look, b64 }) => {
      const m = await import("/src/lib/tryon.ts");
      await m.downloadModels([look, "no-makeup"], () => {});
      window.__bare ??= (await m.preparePhoto(await (await fetch(`data:image/png;base64,${b64}`)).blob())).plain;
      return (await m.paintLook(window.__bare, look, "natural")).toDataURL("image/png");
    }, { look, b64 });
    fs.writeFileSync(path.join(DIR, `${look}.png`), Buffer.from(url.split(",")[1], "base64"));
    console.log(look, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await browser.close();
})();
