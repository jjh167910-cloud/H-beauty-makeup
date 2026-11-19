/*
 * Phase 2 of the roadmap: each catalog look's recipe of products (src/data/look-recipes.ts) fitted to its catalog photo.
 * On a few faces (synthetic or the user's own private benchmark: never committed), the old engine paints the look as its
 * photo's change of colour (its layer: ?engine=v1); the recipe (?engine=v2) is then made to match it, a few rounds:
 *   - each step's amount: one damped least-squares step on the colour change it makes, every round (the steps' own
 *     changes, each alone on her face, against what is left of the old engine's change);
 *   - how light or deep the blush's colour and the eyeshadow's two colours are (her lid, her crease and outer corner):
 *     towards the old engine's, by the ratio of weighted mean luminances where each one shows (the eyeshadow off her
 *     upper lash lines and outer corners, where the old engine's liner and lashes are); their hue and chroma stay the
 *     look's own.
 * The result is merged into src/data/look-fit.json (amounts, colours, and the root-mean-square colour change x1000: the
 * look's own, then the recipe's difference each round, and the best round's, which is the one kept).
 *
 * Needs the dev server (npm run dev) and Playwright's Chromium (software WebGL is enough: a few minutes a look).
 *   node scripts/tinybeauty/fit_recipes.cjs --faces a.jpg,b.jpg,c.jpg [--looks all|id,id] [--iters 4] [--url http://127.0.0.1:5173/]
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.join(__dirname, "../../src/data/look-fit.json");
const FACES = (arg("faces", "") || "").split(",").filter(Boolean);
const ITERS = +arg("iters", 4);
const URL_ = arg("url", "http://127.0.0.1:5173/");
if (!FACES.length) { console.error("usage: fit_recipes.cjs --faces a.jpg,b.jpg [--looks all] [--iters 4] [--url ...]"); process.exit(2); }
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.text().startsWith('[fit]')) console.log(m.text()); else if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto(URL_);
  let LOOKS = arg("looks", "all").split(",");
  if (LOOKS[0] === 'all') LOOKS = await page.evaluate(async () => (await import('/src/data/makeup-styles.ts')).MAKEUP_STYLES.map((s) => s.id));
  await page.evaluate(async (looks) => {
    const m = await import('/src/lib/tryon.ts');
    await m.downloadModels([...looks, 'no-makeup', 'monochrome', 'bronzed-goddess'], () => {});
    window.__shots = [];
  }, LOOKS);
  for (const f of FACES) {
    const b64 = fs.readFileSync(f).toString('base64');
    await page.evaluate(async (b64) => {
      const m = await import('/src/lib/tryon.ts');
      const prep = await m.preparePhoto(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      const shot = m.tutorialShot(prep.plain, 720), P = shot.points;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of P.slice(0, 468)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      window.__shots.push({ shot, box: [x0, y0, x1 - x0, y1 - y0] });
    }, b64);
  }
  const result = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  for (const look of LOOKS) {
    const t0 = Date.now();
    result[look] = await page.evaluate(async ({ look, iters }) => {
      const m = await import('/src/lib/tryon.ts');
      const R = await import('/src/data/look-recipes.ts');
      const W = 320, LIN = Float32Array.from({ length: 256 }, (_, i) => (i / 255) ** 2.2);
      const grab = (c, box) => {
        const H = Math.round(W * box[3] / box[2]), t = document.createElement('canvas'); t.width = W; t.height = H;
        const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, box[0], box[1], box[2], box[3], 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H * 3);
        for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { out[j] = LIN[d[i]]; out[j + 1] = LIN[d[i + 1]]; out[j + 2] = LIN[d[i + 2]]; }
        return out;
      };
      const hexLin = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255) ** 2.2);
      const linHex = (c) => '#' + c.map((v) => Math.round(255 * Math.min(1, Math.max(0, v)) ** (1 / 2.2)).toString(16).padStart(2, '0')).join('');
      const recipe = R.lookRecipe(look);
      const picks = m.v2Picks(look, 'natural', null);
      const keys = ['base', 'conceal', 'contour', 'blush', 'glow', 'brows', 'shadow', 'liner'].filter((k) => (picks.gain[k] ?? 0) > 0);
      const gain0 = { ...picks.gain };
      const only = (k) => ({ done: Object.fromEntries(m.STEP_KEYS.map((s) => [s, s === k ? 1 : 0])), blush: picks.blush?.place ?? 'apples' });
      const shots = window.__shots;
      sessionStorage.setItem('hb-engine', 'v1');
      const v1 = [], bare = [];
      for (const s of shots) { v1.push(grab(await m.paintLook(s.shot, look, 'natural'), s.box)); bare.push(grab(s.shot.photo, s.box)); }
      sessionStorage.removeItem('hb-engine');
      const two = picks.shadow?.hex2 ? true : false;
      // where the eyeshadow is fitted: off her upper lash lines and outer corners (the old engine's liner and lashes)
      const masks = shots.map((s) => {
        const [bx, by, bw, bh] = s.box, k = W / bw, H = Math.round(W * bh / bw), P = s.shot.points;
        const ew = Math.hypot(P[263][0] - P[362][0], P[263][1] - P[362][1]) * k;
        const lids = [[133, 173, 157, 158, 159, 160, 161, 246, 33], [362, 398, 384, 385, 386, 387, 388, 466, 263]]
          .map((ids) => ids.map((i) => [(P[i][0] - bx) * k, (P[i][1] - by) * k]));
        const corners = [33, 263].map((i) => [(P[i][0] - bx) * k, (P[i][1] - by) * k]);
        const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
        const out = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let d = 1e9;
          for (const l of lids) for (let i = 0; i < l.length - 1; i++) d = Math.min(d, segD(x, y, l[i], l[i + 1]));
          const c = Math.min(...corners.map((q) => Math.hypot(x - q[0], y - q[1])));
          out[y * W + x] = d > 0.14 * ew && c > 0.3 * ew ? 1 : 0;
        }
        return out;
      });
      const err = [];
      // (the best round is kept: a round's steps can overshoot, its amounts and colours moving each other)
      let best = { e: Infinity, picks: null };
      for (let it = 0; it <= iters; it++) {
        const num = {}, den = {}, cw = {};               // per step: projection sums; colour sums [w*v1, w*full] per channel
        for (const k of keys) { num[k] = 0; den[k] = 0; }
        const col = { blush: [0, 0, 0, 0, 0, 0], lid: [0, 0, 0, 0, 0, 0], crease: [0, 0, 0, 0, 0, 0] };
        let e2 = 0, en = 0, s2 = 0;
        for (let f = 0; f < shots.length; f++) {
          const s = shots[f], B = bare[f], V = v1[f], MK = masks[f];
          const full = grab(await m.paintMine(s.shot, picks), s.box);
          const iso = {};
          for (const k of keys) iso[k] = grab(await m.paintMine(s.shot, picks, only(k)), s.box);
          let lidW = null, creW = null;
          if (two && it < iters) {
            const a = { ...picks, shadow: { ...picks.shadow, hex: picks.shadow.hex2 } }, b = { ...picks, shadow: { ...picks.shadow, hex2: picks.shadow.hex } };
            lidW = grab(await m.paintMine(s.shot, a, only('shadow')), s.box); creW = grab(await m.paintMine(s.shot, b, only('shadow')), s.box);
          }
          for (let p = 0; p < B.length; p += 3) {
            const r = [V[p] - full[p], V[p + 1] - full[p + 1], V[p + 2] - full[p + 2]];
            let any = false, tot = 1e-6;
            const d = {};
            for (const k of keys) {
              const x = [iso[k][p] - B[p], iso[k][p + 1] - B[p + 1], iso[k][p + 2] - B[p + 2]];
              const q = x[0] * x[0] + x[1] * x[1] + x[2] * x[2];
              d[k] = [x, q]; tot += q; if (q > 1e-5) any = true;
              if (k === 'shadow' && !MK[p / 3]) continue;
              num[k] += r[0] * x[0] + r[1] * x[1] + r[2] * x[2]; den[k] += q;
            }
            const vd = [V[p] - B[p], V[p + 1] - B[p + 1], V[p + 2] - B[p + 2]];
            if (any || vd[0] * vd[0] + vd[1] * vd[1] + vd[2] * vd[2] > 1e-5) { e2 += r[0] * r[0] + r[1] * r[1] + r[2] * r[2]; s2 += vd[0] * vd[0] + vd[1] * vd[1] + vd[2] * vd[2]; en++; }
            const add = (acc, w) => { for (let c = 0; c < 3; c++) { acc[c] += w * V[p + c]; acc[c + 3] += w * full[p + c]; } };
            if (d.blush && d.blush[1] > 1e-5) add(col.blush, (d.blush[1] / tot) * Math.sqrt(d.blush[1]));
            if (d.shadow && d.shadow[1] > 1e-5 && MK[p / 3]) {
              const dom = d.shadow[1] / tot, mag = Math.sqrt(d.shadow[1]);
              if (lidW) {
                const dl = Math.hypot(iso.shadow[p] - lidW[p], iso.shadow[p + 1] - lidW[p + 1], iso.shadow[p + 2] - lidW[p + 2]);
                const dc = Math.hypot(iso.shadow[p] - creW[p], iso.shadow[p + 1] - creW[p + 1], iso.shadow[p + 2] - creW[p + 2]);
                add(col.lid, dom * mag * dl / (dl + dc + 1e-6)); add(col.crease, dom * mag * dc / (dl + dc + 1e-6));
              } else add(col.lid, dom * mag);
            }
          }
        }
        err.push(+(Math.sqrt(e2 / Math.max(1, en)) * 1000).toFixed(2));
        if (it === 0) err.unshift(+(Math.sqrt(s2 / Math.max(1, en)) * 1000).toFixed(2));   // (first: the look's own change, for scale)
        console.log(`[fit] ${look} it ${it} rms ${err[err.length - 1]}`);
        if (err[err.length - 1] < best.e) best = { e: err[err.length - 1], picks: JSON.parse(JSON.stringify(picks)) };
        if (it === iters) break;
        // amounts: one damped least-squares step each, the recipe's amount kept within 0.05..1.5
        for (const k of keys) {
          const a0 = recipe[k]?.amount ?? 1, s = Math.min(2, Math.max(0.5, 1 + 0.8 * num[k] / Math.max(den[k], 1e-9)));
          const g = picks.gain[k] * s, lo = gain0[k] * 0.05 / a0, hi = gain0[k] * 1.5 / a0;
          picks.gain[k] = Math.min(hi, Math.max(lo, g));
        }
        // colours: as light or deep as the old engine's where each one shows (the look's own hue and chroma kept: the old
        // engine's glitter, lashes and liner there would turn a lilac or a champagne grey)
        const luma = (a, o) => 0.2126 * a[o] + 0.7152 * a[o + 1] + 0.0722 * a[o + 2];
        const shift = (hex, acc) => {
          if (acc[0] + acc[1] + acc[2] <= 0) return hex;
          const k = Math.min(1.4, Math.max(0.7, luma(acc, 0) / Math.max(luma(acc, 3), 1e-6))) ** 0.8;
          return linHex(hexLin(hex).map((v) => v * k));
        };
        if (picks.blush) picks.blush.hex = shift(picks.blush.hex, col.blush);
        if (picks.shadow) {
          picks.shadow.hex = shift(picks.shadow.hex, col.lid);
          if (two) picks.shadow.hex2 = shift(picks.shadow.hex2, col.crease);
        }
      }
      Object.assign(picks, best.picks);
      const amount = Object.fromEntries(keys.map((k) => [k, +((recipe[k]?.amount ?? 1) * picks.gain[k] / gain0[k]).toFixed(3)]));
      const hex = { ...(picks.blush ? { blush: picks.blush.hex } : {}), ...(picks.shadow ? { shadow: picks.shadow.hex } : {}), ...(two ? { shadow2: picks.shadow.hex2 } : {}) };
      return { amount, hex, rms: [...err, best.e] };
    }, { look, iters: ITERS });
    console.log(look, JSON.stringify(result[look]), `${Math.round((Date.now() - t0) / 1000)} s`);
    fs.writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`);
  }
  await browser.close();
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
