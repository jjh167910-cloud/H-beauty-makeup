import { expect, test } from "playwright/test";

/** Download regression: no actual model bytes or external services are needed. */
test("AI files stream to offline storage and a stopped download reuses completed parts", async ({ page }) => {
  await page.goto("/");
  const state = await page.evaluate(async () => {
    const { AI_CACHE, downloadModels } = await import("/src/lib/tryon.ts");
    const original = globalThis.fetch;
    const response = () => new Response(new Blob([new Uint8Array(512)]), {
      headers: { "content-type": "application/octet-stream", "content-length": "512" },
    });
    const controller = new AbortController();
    const firstRequests: string[] = [], retryRequests: string[] = [];
    try {
      globalThis.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        if (!url.startsWith("/tryon/")) return original(input, init);
        firstRequests.push(url);
        if (firstRequests.length === 2) controller.abort();
        return response();
      };
      let cancelled = false;
      try {
        await downloadModels([], () => undefined, [], false, controller.signal);
      } catch (error) {
        cancelled = error instanceof DOMException && error.name === "AbortError";
      }
      const cache = await caches.open(AI_CACHE);
      const firstSaved = firstRequests.length > 0 && !!(await cache.match(firstRequests[0]));
      globalThis.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        if (!url.startsWith("/tryon/")) return original(input, init);
        retryRequests.push(url);
        return response();
      };
      const progress: number[] = [];
      await downloadModels([], (value) => progress.push(value));
      const saved = await cache.keys();
      return {
        cancelled, firstSaved, firstRequests, retryRequests,
        firstWasFetchedAgain: retryRequests.includes(firstRequests[0]),
        progress, saved: saved.length,
      };
    } finally {
      globalThis.fetch = original;
    }
  });
  expect(state.cancelled).toBe(true);
  expect(state.firstSaved).toBe(true);
  expect(state.firstRequests.length).toBeGreaterThanOrEqual(2);
  expect(state.firstWasFetchedAgain).toBe(false);
  expect(state.saved).toBeGreaterThan(3);
  expect(state.progress[0]).toBe(0);
  expect(state.progress.at(-1)).toBe(1);
  expect(state.progress.every((value) => value >= 0 && value <= 1)).toBe(true);
});
