/**
 * The salon's chat API on the dev server: the same code as the Worker's Durable Object (worker/chat.ts), over an
 * in-memory node:sqlite database that lives as long as the dev server. Its passcode is SALON_PASSCODE from the
 * environment (the browser tests set one); its notifications go nowhere (logged).
 */
import type { Plugin } from "vite";
import { DatabaseSync } from "node:sqlite";
import { handle, migrate, type Sql } from "../worker/chat";

export default function chatApi(): Plugin {
  return {
    name: "salon-chat-api",
    apply: "serve",
    configureServer(server) {
      const db = new DatabaseSync(":memory:");
      // (each statement runs at once, as Cloudflare's does; its rows are read after)
      const sql: Sql = { exec: (query, ...params) => { const rows = db.prepare(query).all(...params) as Record<string, unknown>[]; return { toArray: () => rows }; } };
      migrate(sql);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const host = req.headers.host ?? "127.0.0.1";
        const request = new Request(`http://${host}${req.url}`, {
          method: req.method,
          headers: Object.entries(req.headers).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v.join(", ") : v] as [string, string]])),
          body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
        });
        const response = await handle(request, sql, { SALON_PASSCODE: process.env.SALON_PASSCODE }, {
          ip: req.socket.remoteAddress ?? "",
          fetch: async (url) => { server.config.logger.info(`salon chat: notification to ${new URL(url).host}`); return new Response(null, { status: 201 }); },
        });
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}
