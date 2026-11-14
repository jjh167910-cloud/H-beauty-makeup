import { expect, test } from "playwright/test";

/**
 * The first download on a weak connection: the big files come in 1 MiB pieces, each kept as it arrives, so a stopped
 * download, or a connection dropped in the middle of a piece, goes on from the pieces already kept. Joined, each file is
 * the file itself (its content hash), and the pieces are let go.
 */
test("a stopped or dropped first download goes on from the pieces it kept, and the joined files are exact", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const state = await page.evaluate(async () => {
    const { AI_CACHE, downloadModels } = await import("/src/lib/tryon.ts");
    const { PIECES } = await import("/@id/__x00__virtual:ai-pieces");
    const isPiece = (url: string) => /\.[0-9a-f]{10}\.\d+-of-\d+\.[a-z]+$/.test(url);
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
      return { asked, progress, error };
    };

    // 1. Stopped after the 6th piece.
    const stop = new AbortController();
    const first = await run((_, n) => { if (n >= 6) stop.abort(); return "ok"; }, stop.signal);
    const kept = (await cache.keys()).map((r) => new URL(r.url).pathname).filter(isPiece);
    // 2. Again: the connection drops in the middle of a piece.
    let dropped = false;
    const second = await run((_, n) => (n >= 3 && !dropped ? (dropped = true, "drop") : "ok"));
    const keptAfterDrop = (await cache.keys()).map((r) => new URL(r.url).pathname).filter(isPiece);
    // 3. Again, to the end.
    const third = await run(() => "ok");
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
      second: { error: second.error, pieces: second.asked.filter(isPiece) },
      keptAfterDrop,
      third: { error: third.error, pieces: third.asked.filter(isPiece), progress: third.progress },
      left,
      files,
      sharpener: [...first.asked, ...second.asked, ...third.asked].some((url) => url.includes("enhance-x4")),
    };
  });
  // Stopped: what had arrived is kept, and not asked for again.
  expect(state.first.error).toBe("AbortError");
  expect(state.kept.length).toBeGreaterThanOrEqual(1);
  for (const piece of state.kept) expect(state.second.pieces).not.toContain(piece);
  // Dropped mid-piece: that piece only starts again; the others it had already kept stay kept.
  expect(state.second.error).not.toBe("");
  expect(state.keptAfterDrop.length).toBeGreaterThan(state.kept.length);
  for (const piece of state.keptAfterDrop) expect(state.third.pieces).not.toContain(piece);
  // To the end: the files are whole and exact, the pieces let go, the bar from 0 to 1 and never back.
  expect(state.third.error).toBe("");
  expect(state.files).toEqual({ "/tryon/wasm/vision_wasm_internal.wasm": true, "/tryon/face_landmarker.task": true, "/tryon/segment.tflite": true });
  expect(state.left).toEqual([]);
  expect(state.third.progress[0]).toBe(0);
  expect(state.third.progress.at(-1)).toBe(1);
  expect(state.third.progress.every((v, i, all) => v >= 0 && v <= 1 && (i === 0 || v >= all[i - 1]))).toBe(true);
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
