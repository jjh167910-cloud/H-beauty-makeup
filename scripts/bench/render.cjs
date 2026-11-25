/*
 * The quality benchmark's renders: every look on every benchmark photo, by each engine, as the app paints them (the
 * photo as taken, natural intensity, no studio light: what the makeup engine itself does). Resumable: a render already
 * on disk is skipped, so a run cut off by the time limit goes on where it stopped.
 *
 *   node scripts/bench/render.cjs RUN_DIR [--url http://127.0.0.1:4180/] [--minutes 110] [--only orig]
 *   node scripts/bench/render.cjs RUN_DIR --layer-dir /private/eye-cap-layers   # v1-only, candidate variant
 *
 * The candidate override is a Playwright request route applied BEFORE loading
 * any AI files. No WebP in public/tryon/layers, no looks.json, no production
 * cache version and no app source is modified by the private experiment.
 *
 * RUN_DIR/manifest.json (make_set.py): { photos: [{ id, file }], looks: [...], engines: ["v1", "v2"] }. Writes
 * RUN_DIR/renders/<engine>/<look>/<photo id>.png (cropped to her face with a margin: seen/<photo id>.json's crop, x y w h),
 * RUN_DIR/seen/<photo id>.png and .json (the photo as the app took it, its landmarks and the crop) and RUN_DIR/render-times.jsonl. Needs the dev server (npm run dev) and Playwright's Chromium.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { prepareLayerOverride, resolveLayerRequest } = require("./layer_override.cjs");
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const RUN = process.argv[2];
const URL_ = arg("url", "http://127.0.0.1:4180/");
const MINUTES = Number(arg("minutes", "110"));
const ONLY = arg("only", "");
const LAYER_DIR = arg("layer-dir", "");
if (!RUN || !fs.existsSync(path.join(RUN, "manifest.json"))) { console.error("usage: render.cjs RUN_DIR (manifest.json first)"); process.exit(2); }
const M = JSON.parse(fs.readFileSync(path.join(RUN, "manifest.json"), "utf8"));
if (LAYER_DIR && (M.engines.length !== 1 || M.engines[0] !== "v1")) {
  console.error("--layer-dir supports only the v1 GPU catalog engine; use --engines v1 for all three benchmark runs");
  process.exit(2);
}
const layerFiles = LAYER_DIR ? prepareLayerOverride(LAYER_DIR, M.looks) : null;
const routedLayers = new Set();
const started = Date.now();
const late = () => (Date.now() - started) / 60000 > MINUTES;
const out = (...p) => path.join(RUN, ...p);
const save = (file, dataUrl) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64")); };

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: "block" })).newPage();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  if (layerFiles) {
    await page.route("**/tryon/layers/*.webp*", async route => {
      const hit = resolveLayerRequest(route.request().url(), layerFiles);
      if (!hit) return route.continue();
      routedLayers.add(hit.id);
      await route.fulfill({ path: hit.file, contentType: "image/webp" });
    });
  }
  await page.goto(URL_);
  await page.evaluate(async (looks) => {
    const m = await import("/src/lib/tryon.ts");
    await m.downloadModels([...looks, "no-makeup"], () => {});
    window.__m = m;
  }, M.looks);
  if (layerFiles) {
    const missing = M.looks.filter(id => !routedLayers.has(id));
    if (missing.length) {
      await browser.close();
      throw new Error("Candidate atlas route never activated for looks: " + missing.join(", ")
        + " (cache or engine mismatch; refusing baseline-contaminated benchmark)");
    }
    console.log("private benchmark candidate atlases active:", routedLayers.size, "looks; production assets unchanged");
  }
  const times = fs.openSync(out("render-times.jsonl"), "a");
  let done = 0, skipped = 0;
  for (const photo of M.photos) {
    if (ONLY && !photo.id.endsWith(`__${ONLY}`)) continue;
    const todo = M.engines.flatMap((e) => M.looks.map((l) => [e, l])).filter(([e, l]) => !fs.existsSync(out("renders", e, l, `${photo.id}.png`)));
    if (!todo.length) { skipped++; continue; }
    if (late()) { console.log(`${MINUTES} minutes: stopping (resume with the same command)`); break; }
    const b64 = fs.readFileSync(path.join(RUN, photo.file)).toString("base64");
    const t0 = Date.now();
    const seen = await page.evaluate(async (b64) => {
      const m = window.__m;
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      window.__prep = await m.preparePhoto(blob);
      const s = window.__prep.plain, W = s.photo.width, H = s.photo.height;
      // the face with a margin: renders are stored cropped to it (the engine paints nothing outside her face)
      const xs = s.points.map((q) => q[0]), ys = s.points.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), fw = x1 - x0, fh = y1 - y0;
      const crop = [Math.max(0, Math.floor(x0 - 0.3 * fw)), Math.max(0, Math.floor(y0 - 0.25 * fh)), 0, 0];
      crop[2] = Math.min(W, Math.ceil(x1 + 0.3 * fw)) - crop[0]; crop[3] = Math.min(H, Math.ceil(y1 + 0.2 * fh)) - crop[1];
      window.__crop = crop;
      return { url: s.photo.toDataURL("image/png"), points: s.points, w: W, h: H, blur: window.__prep.blur, crop };
    }, b64).catch((e) => ({ error: String(e) }));
    if (seen.error) { console.log(photo.id, "no face:", seen.error); fs.writeSync(times, JSON.stringify({ photo: photo.id, error: seen.error }) + "\n"); continue; }
    save(out("seen", `${photo.id}.png`), seen.url);
    fs.writeFileSync(out("seen", `${photo.id}.json`), JSON.stringify({ points: seen.points, w: seen.w, h: seen.h, blur: seen.blur, crop: seen.crop }));
    const prepMs = Date.now() - t0;
    for (const [engine, look] of todo) {
      const t = Date.now();
      const url = await page.evaluate(async ({ engine, look }) => {
        sessionStorage.setItem("hb-engine", engine);
        const c = await window.__m.paintLook(window.__prep.plain, look, "natural");
        const [x, y, w, h] = window.__crop, k = document.createElement("canvas");
        k.width = w; k.height = h; k.getContext("2d").drawImage(c, x, y, w, h, 0, 0, w, h);
        return k.toDataURL("image/png");
      }, { engine, look }).catch((e) => ({ error: String(e) }));
      if (url.error) { console.log(photo.id, engine, look, "failed:", url.error); fs.writeSync(times, JSON.stringify({ photo: photo.id, engine, look, error: url.error }) + "\n"); continue; }
      save(out("renders", engine, look, `${photo.id}.png`), url);
      fs.writeSync(times, JSON.stringify({ photo: photo.id, engine, look, ms: Date.now() - t, prepMs }) + "\n");
      done++;
    }
    console.log(photo.id, `${todo.length} renders`, `${((Date.now() - t0) / 1000).toFixed(0)}s`, `(${((Date.now() - started) / 60000).toFixed(1)} min)`);
  }
  console.log(`done: ${done} renders, ${skipped} photos already complete, ${((Date.now() - started) / 60000).toFixed(1)} min`);
  await browser.close();
})();
