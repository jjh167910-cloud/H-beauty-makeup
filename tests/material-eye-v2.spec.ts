import { test, expect } from "playwright/test";

test("material-eye pilot respects eyelid geometry, original pixels and occlusion", async ({ page }) => {
  await page.goto("/");
  const metrics = await page.evaluate(async () => {
    const mod = await import("/src/lib/material-eye-v2.ts");
    const W = 640, H = 320;
    const points = Array.from({ length: 478 }, () => [320, 180, 0]);
    const assign = (ids: number[], xs: number[], ys: number[]) => ids.forEach((id, i) => {
      points[id] = [xs[i], ys[i], 0];
    });
    assign([33, 246, 161, 160, 159, 158, 157, 173, 133],
      [130, 146, 160, 177, 195, 215, 232, 245, 260],
      [180, 171, 167, 164, 163, 165, 170, 175, 180]);
    assign([70, 63, 105, 66, 107],
      [137, 168, 195, 225, 253], [118, 112, 106, 110, 121]);
    points[145] = [195, 194, 0];
    assign([263, 466, 388, 387, 386, 385, 384, 398, 362],
      [470, 453, 437, 420, 405, 387, 370, 356, 340],
      [180, 171, 167, 164, 163, 165, 170, 175, 180]);
    assign([300, 293, 334, 296, 336],
      [466, 436, 405, 375, 346], [121, 110, 106, 112, 118]);
    points[374] = [405, 194, 0];

    const makeCanvas = () => {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d")!;
      g.fillStyle = "#513a32";
      g.fillRect(0, 0, W, H);
      return c;
    };
    const original = makeCanvas(), output = makeCanvas(), hidden = makeCanvas(), natural = makeCanvas();
    const visible = new Uint8Array(256 * 256 * 2);
    for (let i = 0; i < visible.length; i += 2) visible[i] = 255;
    const vis = { probs: visible, box: [0, 0, 640] as [number, number, number] };
    const result = mod.applyMaterialEyeV2(output, original, points, "electric-blue", "natural", vis);
    const noChange = mod.applyMaterialEyeV2(natural, original, points, "no-makeup", "natural", vis);
    const noOcclusion = mod.applyMaterialEyeV2(hidden, original, points, "electric-blue", "natural",
      { probs: new Uint8Array(256 * 256 * 2), box: [0, 0, 640] });
    const src = original.getContext("2d")!.getImageData(0, 0, W, H).data;
    const dst = output.getContext("2d")!.getImageData(0, 0, W, H).data;
    const invisible = hidden.getContext("2d")!.getImageData(0, 0, W, H).data;
    const untouched = natural.getContext("2d")!.getImageData(0, 0, W, H).data;
    let changed = 0, outsideChanges = 0, newlyClipped = 0, hiddenChanged = 0, noMakeupChanged = 0;
    const region = (x: number, y: number) =>
      x >= 90 && x <= 510 && y >= 60 && y <= 240;
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = Math.floor(i / W);
      let delta = false;
      for (let c = 0; c < 3; c++) {
        const k = i * 4 + c;
        if (src[k] !== dst[k]) {
          delta = true;
          if (dst[k] === 0 || dst[k] === 255) newlyClipped++;
        }
        if (src[k] !== invisible[k]) hiddenChanged++;
        if (src[k] !== untouched[k]) noMakeupChanged++;
      }
      if (delta) {
        changed++;
        if (!region(x, y)) outsideChanges++;
      }
    }
    return {
      touched: result.touched, eyes: result.eyes, changed, outsideChanges, newlyClipped,
      hiddenChanged, noMakeupChanged, noChange: noChange.skipped, occlusion: noOcclusion.touched,
      pilotOff: mod.materialEyePilotEnabled("electric-blue", new URLSearchParams()),
      pilotOn: mod.materialEyePilotEnabled("electric-blue", new URLSearchParams("?eyePilot=v2")),
      geometry: mod.eyeGeometry(points, "left")?.span,
      shadow: mod.shadowCoverage(mod.eyeGeometry(points, "left")!, 195, 135, "gradient"),
    };
  });
  expect(metrics.pilotOff).toBe(false);
  expect(metrics.pilotOn).toBe(true);
  expect(metrics.eyes).toBe(2);
  expect(metrics.geometry).toBeGreaterThan(100);
  expect(metrics.shadow).toBeGreaterThan(0);
  expect(metrics.changed).toBeGreaterThan(100);
  expect(metrics.outsideChanges).toBe(0);
  expect(metrics.newlyClipped).toBe(0);
  expect(metrics.hiddenChanged).toBe(0);
  expect(metrics.noMakeupChanged).toBe(0);
  expect(metrics.noChange).toBe("no-material-pilot-for-look");
  expect(metrics.occlusion).toBe(0);
});


test("rhinestone pilot has distinct face-anchored specular detail, unlike Hollywood", async ({ page }) => {
  await page.goto("/");
  const stats = await page.evaluate(async () => {
    const { applyMaterialEyeV2 } = await import("/src/lib/material-eye-v2.ts");
    const width = 400, height = 280;
    const pts = Array.from({ length: 478 }, () => [200, 140, 0]);
    const set = (id: number, x: number, y: number) => pts[id] = [x, y, 0];
    const top = [33, 246, 161, 160, 159, 158, 157, 173, 133];
    top.forEach((id, i) => set(id, 70 + i * 16, 149 - 13 * Math.sin(i * Math.PI / 8)));
    [70, 63, 105, 66, 107].forEach((id, i) => set(id, 75 + i * 32, 82 + Math.abs(i - 2) * 4));
    set(145, 135, 169);
    // Other eye intentionally unresolved: the pilot must not mirror the first.
    const make = () => {
      const c = document.createElement("canvas");
      c.width = width; c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#513a32"; ctx.fillRect(0, 0, width, height);
      return c;
    };
    const input = make(), gemstone = make(), hollywood = make();
    const probs = new Uint8Array(256 * 256 * 2);
    for (let i = 0; i < probs.length; i += 2) probs[i] = 255;
    const vis = { probs, box: [0, 0, 400] as [number, number, number] };
    const r = applyMaterialEyeV2(gemstone, input, pts, "rhinestone", "natural", vis, 0.5);
    applyMaterialEyeV2(hollywood, input, pts, "hollywood", "natural", vis, 0.5);
    const a = gemstone.getContext("2d")!.getImageData(65, 75, 160, 96).data;
    const b = hollywood.getContext("2d")!.getImageData(65, 75, 160, 96).data;
    let stoneBright = 0, classicBright = 0, newlyClipped = 0;
    for (let i = 0; i < a.length; i += 4) {
      stoneBright = Math.max(stoneBright, a[i], a[i + 1], a[i + 2]);
      classicBright = Math.max(classicBright, b[i], b[i + 1], b[i + 2]);
      for (let channel = 0; channel < 3; channel++)
        if (a[i + channel] === 0 || a[i + channel] === 255) newlyClipped++;
    }
    return { eyes: r.eyes, stoneBright, classicBright, newlyClipped };
  });
  expect(stats.eyes).toBe(1);
  expect(stats.stoneBright).toBeGreaterThan(stats.classicBright + 20);
  expect(stats.newlyClipped).toBe(0);
});


test("face-space safety: collapsed brows and sclera must not receive material-eye strokes", async ({ page }) => {
  await page.goto("/");
  const audit = await page.evaluate(async () => {
    const engine = await import("/src/lib/material-eye-v2.ts");
    const pts = Array.from({ length: 478 }, () => [250, 160, 0]);
    const set = (id: number, x: number, y: number) => { pts[id] = [x, y, 0]; };
    [33, 246, 161, 160, 159, 158, 157, 173, 133].forEach((id, i) =>
      set(id, 80 + i * 20, 155 - 10 * Math.sin(Math.PI * i / 8)));
    [70, 63, 105, 66, 107].forEach((id, i) => set(id, 85 + 40 * i, 92));
    set(145, 160, 178);
    const good = engine.eyeGeometry(pts, "left");
    const sclera = good ? engine.strokeRegion(good, 160, 172) : -1;
    const eyeLid = good ? engine.strokeRegion(good, 160, 143) : -1;
    // Corrupt the landmarks so the brow is effectively the eyelid.
    [70, 63, 105, 66, 107].forEach((id, i) =>
      set(id, 85 + 40 * i, 150));
    const collapsed = engine.eyeGeometry(pts, "left");
    return { valid: !!good, sclera, eyeLid, rejectedCollapsedBrow: collapsed === null };
  });
  expect(audit.valid).toBe(true);
  expect(audit.sclera).toBe(0);
  expect(audit.eyeLid).toBe(1);
  expect(audit.rejectedCollapsedBrow).toBe(true);
});


test("optional GPU material-eye path matches CPU pilot and never touches the background", async ({ page }) => {
  await page.goto("/?eyeCompute=gpu");
  const metrics = await page.evaluate(async () => {
    const { applyMaterialEyeV2 } = await import("/src/lib/material-eye-v2.ts");
    const w = 360, h = 260;
    const pts = Array.from({ length: 478 }, () => [160, 145, 0]);
    [33, 246, 161, 160, 159, 158, 157, 173, 133].forEach((id, i) => {
      pts[id] = [100 + 16 * i, 152 - 12 * Math.sin(Math.PI * i / 8), 0];
    });
    [70, 63, 105, 66, 107].forEach((id, i) => { pts[id] = [102 + 32 * i, 92, 0]; });
    pts[145] = [164, 170, 0];
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#594138"; ctx.fillRect(0, 0, w, h);
      return c;
    };
    const src = canvas(), gpu = canvas(), cpu = canvas();
    const prob = new Uint8Array(256 * 256 * 2);
    for (let i = 0; i < prob.length; i += 2) prob[i] = 255;
    const vis = { probs: prob, box: [0, 0, 360] as [number, number, number] };
    const gpuResult = applyMaterialEyeV2(gpu, src, pts, "electric-blue", "natural", vis, 0.8);
    history.replaceState({}, "", "/");
    const cpuResult = applyMaterialEyeV2(cpu, src, pts, "electric-blue", "natural", vis, 0.8);
    const a = gpu.getContext("2d")!.getImageData(0, 0, w, h).data;
    const b = cpu.getContext("2d")!.getImageData(0, 0, w, h).data;
    const original = src.getContext("2d")!.getImageData(0, 0, w, h).data;
    let changed = 0, totalDifference = 0, maxDifference = 0, compared = 0, outsideChanged = 0;
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = Math.floor(i / w);
      for (let channel = 0; channel < 3; channel++) {
        const offset = 4 * i + channel, diff = Math.abs(a[offset] - b[offset]);
        totalDifference += diff; compared++; maxDifference = Math.max(diff, maxDifference);
        if (a[offset] !== original[offset]) {
          changed++;
          if (x < 40 || x > 320 || y < 30 || y > 230) outsideChanged++;
        }
      }
    }
    return {
      eyes: gpuResult.eyes, cpuEyes: cpuResult.eyes, changed,
      meanDifference: totalDifference / compared, maxDifference, outsideChanged,
    };
  });
  expect(metrics.eyes).toBe(1);
  expect(metrics.cpuEyes).toBe(1);
  expect(metrics.changed).toBeGreaterThan(50);
  expect(metrics.outsideChanged).toBe(0);
  expect(metrics.meanDifference).toBeLessThan(2);
  expect(metrics.maxDifference).toBeLessThan(18);
});
