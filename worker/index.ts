/**
 * The site's Worker: the app's files as they are (Cloudflare's static assets), and /api/* to the salon's chat, one
 * Durable Object with its own SQLite database (worker/chat.ts).
 */
import { DurableObject } from "cloudflare:workers";
import { handle, migrate, type ChatEnv } from "./chat";

interface Env extends ChatEnv {
  ASSETS: { fetch(req: Request): Promise<Response> };
  CHAT: DurableObjectNamespace;
}

export class SalonChat extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrate(ctx.storage.sql));
  }

  async fetch(req: Request): Promise<Response> {
    return handle(req, this.ctx.storage.sql, this.env, {
      ip: req.headers.get("cf-connecting-ip") ?? "",
      fetch: (url, init) => fetch(url, init),
      waitUntil: (work) => this.ctx.waitUntil(work),
    });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname.startsWith("/api/")) return env.CHAT.get(env.CHAT.idFromName("salon")).fetch(req);
    return env.ASSETS.fetch(req);
  },
};
