/** Dedicated research preview Worker. Never connect this app to production CHAT/DO. */
interface PreviewEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const LABEL = '<div data-hbeauty-review="true" style="position:fixed;z-index:2147483647;right:12px;bottom:12px;padding:9px 13px;border-radius:12px;background:#241b35;color:#fff;border:1px solid #d3b9ff;box-shadow:0 4px 20px #0005;font:700 12px/1.4 system-ui, sans-serif;pointer-events:none">RESEARCH PREVIEW · NOT PRODUCTION</div>';

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Research preview: salon services are intentionally disabled" }),
        { status: 404, headers: { "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405, headers: { "allow": "GET, HEAD" } });

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    headers.set("x-hbeauty-stage", "research-preview");
    if (headers.get("content-type")?.includes("text/html") && request.method === "GET") {
      const html = await response.text();
      // Explicit identity cue on every SPA route. Never confuse review with salon.
      if (!html.includes("</body>"))
        return new Response("Preview HTML build is malformed", { status: 500, headers: { "cache-control": "no-store" } });
      headers.delete("content-length");
      headers.delete("content-encoding");
      headers.set("cache-control", "no-store");
      return new Response(html.replace("</body>", LABEL + "</body>"),
        { status: response.status, headers });
    }
    return new Response(response.body, { status: response.status, headers });
  }
};