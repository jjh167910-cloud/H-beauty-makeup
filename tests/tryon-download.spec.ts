import { expect, test } from "playwright/test";

/**
 * The first download on a weak connection: the big files come in 1 MiB pieces, each kept as it arrives, so a stopped
 * download goes on from the pieces already kept; a connection dropped in the middle of a piece, or lost for a while,
 * doesn't stop it. Joined, each file is the file itself (its content hash), and the pieces are let go.
 */
test("a stopped first download goes on from the pieces it kept, a dropped piece is asked for again, and the joined files are exact", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const state = await page.evaluate(async () => {
    const { AI_CACHE, downloadModels } = await import("/src/lib/tryon.ts");
    const { PIECES } = await import("/@id/__x00__virtual:ai-pieces");
    const isPiece = (url: string) => /\.[0-9a-f]{10}\.\d+-of-\d+\.[a-z]+(\.gz)?$/.test(url);
    const plain = (url: string) => url.replace(/\.gz$/, "");   // (a gzipped piece is kept as the piece itself)
    const path = (input: RequestInfo | URL) => new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href).pathname;
    const original = globalThis.fetch;
    const cache = await caches.open(AI_CACHE);
    const run = async (onPiece: (url: string, n: number) => "ok" | "stop" | "drop", signal?: AbortSignal) => {
      const asked: string[] = [];
      globalThis.fetch = async (input, init) => {
        const url = path(input);
        if (!url.startsWith("/tryon/")) return original(input, init);
        asked.push(url);
        const response = await original(input, init);
        if (!isPiece(url)) return response;
        const what = onPiece(url, asked.filter(isPiece).length);
        if (what === "drop") {
          // The connection drops 100 KB into this piece.
          const bytes = new Uint8Array(await response.arrayBuffer()).slice(0, 100_000);
          const body = new ReadableStream({ start(c) { c.enqueue(bytes); c.error(new TypeError("network error")); } });
          return new Response(body, { headers: response.headers });
        }
        return response;
      };
      const progress: number[] = [];
      let error = "";
      try { await downloadModels(["hollywood"], (v) => progress.push(v), [], false, signal); }
      catch (e) { error = e instanceof DOMException ? e.name : String(e); }
      finally { globalThis.fetch = original; }
      return { asked: asked.map(plain), gzipped: asked.filter((url) => isPiece(url) && url.endsWith(".gz")).length, progress, error };
    };

    // 1. Stopped after the 6th piece.
    const stop = new AbortController();
    const first = await run((_, n) => { if (n >= 6) stop.abort(); return "ok"; }, stop.signal);
    const kept = (await cache.keys()).map((r) => new URL(r.url).pathname).filter(isPiece);
    // 2. Again, and the connection drops in the middle of a piece: that piece is asked for again, and it goes on.
    let dropped = "";
    const second = await run((url, n) => (n >= 8 && !dropped ? (dropped = url, "drop") : "ok"));
    const left = (await cache.keys()).map((r) => new URL(r.url).pathname).filter(isPiece);

    // Each joined file is exact: its size and its content hash.
    const files: Record<string, boolean> = {};
    for (const url of ["/tryon/wasm/vision_wasm_internal.wasm", "/tryon/face_landmarker.task", "/tryon/segment.tflite"]) {
      const r = await cache.match(url);
      const data = r ? await r.arrayBuffer() : new ArrayBuffer(0);
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map((b) => b.toString(16).padStart(2, "0")).join("");
      files[url] = data.byteLength === PIECES[url].bytes && hash.startsWith(PIECES[url].hash);
    }
    return {
      first: { error: first.error, pieces: first.asked.filter(isPiece) },
      kept,
      second: { error: second.error, pieces: second.asked.filter(isPiece), progress: second.progress },
      dropped: plain(dropped),
      gzipped: first.gzipped + second.gzipped,
      left,
      files,
      sharpener: [...first.asked, ...second.asked].some((url) => url.includes("enhance-x4")),
    };
  });
  // Stopped: what had arrived is kept, and not asked for again.
  expect(state.first.error).toBe("AbortError");
  expect(state.kept.length).toBeGreaterThanOrEqual(1);
  for (const piece of state.kept) expect(state.second.pieces).not.toContain(piece);
  // Dropped mid-piece: the same download asks for that piece again (only that one, once more) and finishes.
  expect(state.second.error).toBe("");
  expect(state.second.pieces.filter((piece) => piece === state.dropped)).toHaveLength(2);
  expect(new Set(state.second.pieces).size).toBe(state.second.pieces.length - 1);
  // To the end: the files are whole and exact, the pieces let go, the bar from 0 to 1 and never back.
  expect(state.files).toEqual({ "/tryon/wasm/vision_wasm_internal.wasm": true, "/tryon/face_landmarker.task": true, "/tryon/segment.tflite": true });
  expect(state.left).toEqual([]);
  expect(state.second.progress[0]).toBe(0);
  expect(state.second.progress.at(-1)).toBe(1);
  expect(state.second.progress.every((v, i, all) => v >= 0 && v <= 1 && (i === 0 || v >= all[i - 1]))).toBe(true);
  // The models Cloudflare doesn't compress came gzipped and were unpacked on the phone (the files are exact, above).
  expect(state.gzipped).toBeGreaterThan(0);
  // The sharpener is not part of the first download (it comes when a soft photo needs it).
  expect(state.sharpener).toBe(false);
});

test("the HD face a phone kept in its earlier large parts is joined on the phone, not downloaded again", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => Object.assign(globalThis, { hbFaceHd: "wasm" }));   // (the test browser has no WebGPU)
  await page.goto("/");
  const state = await page.evaluate(async () => {
    const { AI_CACHE, hdModelsReady } = await import("/src/lib/tryon.ts");
    const { PIECES } = await import("/@id/__x00__virtual:ai-pieces");
    const cache = await caches.open(AI_CACHE);
    // The earlier parts, as a phone kept them (their bytes, from the server's pieces).
    const pieces = async (url: string) => {
      const p = PIECES[url], dot = url.lastIndexOf(".");
      const blobs = await Promise.all(Array.from({ length: p.count }, (_, i) =>
        fetch(`${url.slice(0, dot)}.${p.hash}.${i}-of-${p.count}${url.slice(dot)}`).then((r) => r.blob())));
      return new Blob(blobs);
    };
    const model = await pieces("/tryon/face-hd/gfpgan-1.4-q8.bin"), wasm = await pieces("/tryon/ort/ort-wasm-simd-threaded.asyncify.wasm");
    const split = (blob: Blob, n: number) => Array.from({ length: n }, (_, i) => blob.slice(Math.floor(blob.size * i / n), Math.floor(blob.size * (i + 1) / n)));
    await Promise.all(split(model, 4).map((part, i) => cache.put(`/tryon/face-hd/gfpgan-1.4-q8.${i}-of-4.bin`, new Response(part))));
    await Promise.all(split(wasm, 2).map((part, i) => cache.put(`/tryon/ort/ort-wasm-simd-threaded.asyncify.${i}-of-2.bin`, new Response(part))));
    await cache.put("/tryon/ort/ort-wasm-simd-threaded.asyncify.mjs", await fetch("/tryon/ort/ort-wasm-simd-threaded.asyncify.mjs"));
    const asked: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => { asked.push(String(input)); return original(input, init); };
    let ready = false;
    try { ready = await hdModelsReady(); } finally { globalThis.fetch = original; }
    const joined = await cache.match("/tryon/face-hd/gfpgan-1.4-q8.bin");
    return {
      ready, asked,
      size: joined ? (await joined.blob()).size : 0, expected: PIECES["/tryon/face-hd/gfpgan-1.4-q8.bin"].bytes,
      oldParts: (await cache.keys()).filter((r) => /-of-[24]\.bin$/.test(r.url)).length,
    };
  });
  expect(state.ready).toBe(true);
  expect(state.asked).toEqual([]);
  expect(state.size).toBe(state.expected);
  expect(state.oldParts).toBe(0);
});

test("when the phone loses its connection the first download waits, says so, and goes on by itself", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const finished = new Map<string, number>();
  page.on("requestfinished", (r) => { const path = new URL(r.url()).pathname.replace(/\.gz$/, ""); if (/-of-\d+\./.test(path)) finished.set(path, (finished.get(path) ?? 0) + 1); });
  await page.goto("/");
  await page.getByRole("button", { name: "آماده‌سازی هوش مصنوعی" }).click();
  await expect.poll(() => finished.size, { timeout: 60_000 }).toBeGreaterThanOrEqual(6);
  await context.setOffline(true);
  await expect(page.getByText("اینترنت قطع است؛ با وصل شدن، دانلود از همان‌جا ادامه پیدا می‌کند.")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  await expect(page.getByRole("alert")).toHaveCount(0);   // (waiting, not an error)
  await context.setOffline(false);
  await expect(page.locator(".tryon__intro .tryon__get")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByRole("button", { name: "انتخاب از گالری" })).toBeVisible();
  // Nothing that had arrived before the connection went was fetched again.
  expect([...finished.values()].every((n) => n === 1)).toBe(true);
});
