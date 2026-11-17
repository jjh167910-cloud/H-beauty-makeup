import { test, expect } from "playwright/test";

test("WebGL2 eye GPU timers never block on an unavailable result", async ({ page }) => {
  await page.goto("/");
  const checks = await page.evaluate(async () => {
    const { NativeEyeGpuTimer } = await import("/src/lib/native-eye-gpu-timer.ts");
    let completed = false, disjoint = false, lost = false, creates = 0;
    let readyReads = 0, resultReads = 0, deletes = 0, beginCalls = 0, endCalls = 0;
    const gl = {
      QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
      getExtension: (name: string) => name === "EXT_disjoint_timer_query_webgl2"
        ? { TIME_ELAPSED_EXT: 7, GPU_DISJOINT_EXT: 8 } : null,
      createQuery: () => ({ id: ++creates }),
      deleteQuery: () => { deletes++; },
      beginQuery: (target: number, query: object) => {
        if (target !== 7 || !query) throw Error("Wrong query API");
        beginCalls++;
      },
      endQuery: (target: number) => {
        if (target !== 7) throw Error("Wrong target");
        endCalls++;
      },
      isContextLost: () => lost,
      getParameter: (param: number) => {
        if (param !== 8) throw Error("Wrong disjoint API");
        return disjoint;
      },
      getQueryParameter: (_query: object, param: number) => {
        if (param === 2) { readyReads++; return completed; }
        if (param === 3) {
          resultReads++;
          if (!completed) throw Error("Blocked before GPU completion");
          return 3_750_000; // nanoseconds
        }
        throw Error("Unknown query");
      },
    } as unknown as WebGL2RenderingContext;
    const timer = new NativeEyeGpuTimer(gl);
    const supported = timer.supported;
    const began = timer.begin("native-fast");
    timer.end("native"); // Simulate a failed blit and shader fallback
    const early = timer.poll();
    const noEarlyResult = resultReads === 0 && timer.pendingCount === 1;
    completed = true;
    const done = timer.poll();
    // A second query is invalidated by GPU frequency change/context reset.
    completed = false;
    const beganSecond = timer.begin("native-fast");
    timer.end();
    disjoint = true;
    const invalid = timer.poll();
    const ignoredDisjoint = invalid === null && timer.pendingCount === 0;
    disjoint = false;
    const beganThird = timer.begin("native");
    timer.end();
    lost = true;
    const lostResult = timer.poll();
    const lostSafe = lostResult === null && !timer.supported && timer.pendingCount === 0;
    timer.dispose();
    return { supported, began, noEarlyResult, early, done,
      beganSecond, ignoredDisjoint, beganThird, lostSafe,
      beginCalls, endCalls, creates, deletes, readyReads, resultReads };
  });
  expect(checks.supported).toBe(true);
  expect(checks.began).toBe(true);
  expect(checks.noEarlyResult).toBe(true);
  expect(checks.early).toBeNull();
  expect(checks.done?.gpuMs).toBe(3.75);
  expect(checks.done?.mode).toBe("native");
  expect(checks.done?.sequence).toBe(1);
  expect(checks.beganSecond).toBe(true);
  expect(checks.ignoredDisjoint).toBe(true);
  expect(checks.beganThird).toBe(true);
  expect(checks.lostSafe).toBe(true);
  expect(checks.beginCalls).toBe(3);
  expect(checks.endCalls).toBe(3);
  expect(checks.creates).toBe(checks.deletes);
  expect(checks.resultReads).toBe(1);
});

test("GPU timer handles unsupported devices, query backlog and bad timestamp values", async ({ page }) => {
  await page.goto("/");
  const checks = await page.evaluate(async () => {
    const { NativeEyeGpuTimer } = await import("/src/lib/native-eye-gpu-timer.ts");
    let outstanding = 0, resultReads = 0, deleted = 0, result = 0;
    const gl = {
      QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
      getExtension: () => ({ TIME_ELAPSED_EXT: 7, GPU_DISJOINT_EXT: 8 }),
      createQuery: () => ({ token: ++outstanding }),
      deleteQuery: () => { deleted++; },
      beginQuery: () => {},
      endQuery: () => {},
      isContextLost: () => false,
      getParameter: () => false,
      getQueryParameter: (_query: object, p: number) => {
        if (p === 2) return result !== 0;
        resultReads++;
        return result;
      },
    } as unknown as WebGL2RenderingContext;
    const timer = new NativeEyeGpuTimer(gl);
    for (let i = 0; i < NativeEyeGpuTimer.MAX_PENDING; i++) {
      if (!timer.begin("native")) throw Error("Failed to fill backlog");
      timer.end();
    }
    const capped = !timer.begin("native-fast") && timer.pendingCount === 3 && outstanding === 3;
    result = -10;
    const invalid = timer.poll();
    const ignoredInvalid = invalid === null && timer.pendingCount === 0;
    timer.dispose();
    const unsupportedGL = {
      getExtension: () => null, isContextLost: () => false,
    } as unknown as WebGL2RenderingContext;
    const unsupported = new NativeEyeGpuTimer(unsupportedGL);
    return { capped, ignoredInvalid, deleted, resultReads,
      unsupported: !unsupported.supported && !unsupported.begin("native") &&
        unsupported.poll() === null };
  });
  expect(checks.capped).toBe(true);
  expect(checks.ignoredInvalid).toBe(true);
  expect(checks.deleted).toBe(3);
  expect(checks.resultReads).toBe(3);
  expect(checks.unsupported).toBe(true);
});


test("native vs native-fast GPU p50/p95 profiles are bounded and mode-specific", async ({ page }) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { NativeEyeGpuTimer } = await import("/src/lib/native-eye-gpu-timer.ts");
    let currentNs = 0, created = 0, deleted = 0;
    const gl = {
      QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
      getExtension: () => ({ TIME_ELAPSED_EXT: 7, GPU_DISJOINT_EXT: 8 }),
      createQuery: () => ({ id: ++created }),
      deleteQuery: () => { deleted++; },
      beginQuery: () => {}, endQuery: () => {},
      isContextLost: () => false,
      getParameter: () => false,
      getQueryParameter: (_q: object, code: number) =>
        code === 2 ? true : currentNs,
    } as unknown as WebGL2RenderingContext;
    const timer = new NativeEyeGpuTimer(gl);
    const push = (mode: "native"|"native-fast", durationMs: number) => {
      if(!timer.begin(mode)) throw Error("Unable to start GPU timer");
      currentNs = durationMs * 1e6;
      timer.end();
      timer.poll();
    };
    for (let i = 1; i <= 10; i++) push("native", i);
    for (let i = 1; i <= 10; i++) push("native-fast", i * 0.5);
    const first = timer.summarize();
    for (let i = 0; i < NativeEyeGpuTimer.MAX_HISTORY + 5; i++)
      push("native-fast", 1);
    const after = timer.summarize();
    const latest = timer.latest;
    const bounded = after.reduce((n, s) => n + s.samples, 0);
    timer.dispose();
    return { first, after, latest, bounded, created, deleted,
      emptyOnDispose: timer.summarize() };
  });
  expect(actual.first).toEqual([
    { mode: "native", samples: 10, p50Ms: 5, p95Ms: 10, minMs: 1, maxMs: 10 },
    { mode: "native-fast", samples: 10, p50Ms: 2.5, p95Ms: 5, minMs: 0.5, maxMs: 5 },
  ]);
  expect(actual.bounded).toBeLessThanOrEqual(64);
  expect(actual.latest?.mode).toBe("native-fast");
  expect(actual.latest?.gpuMs).toBe(1);
  expect(actual.created).toBe(actual.deleted);
  expect(actual.emptyOnDispose).toEqual([]);
});
