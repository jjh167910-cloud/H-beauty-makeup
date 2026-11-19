/**
 * The salon's own chat: a customer sends the salon her booking (the look, its intensity, her lipstick: text only, never
 * her photo) with her name and phone number; the salon answers from its inbox page (/salon) after signing in with its
 * passcode, and hears about new messages as a notification on its phone (Web Push).
 *
 * One Durable Object (`SalonChat`, worker/index.ts) keeps everything in its SQLite database; this file is the whole
 * API over that database, the same in production and in the dev server (scripts/vite-chat-api.ts, node:sqlite).
 *
 * Customer (her chat's token, on her phone only, as `Authorization: Bearer`):
 *   POST /api/chat/start {name, phone, text}  -> {thread, token, messages}
 *   GET  /api/chat?after=<id>                 -> {name, phone, messages}      (the salon's replies read)
 *   POST /api/chat/send {text}                -> {message}
 *   DELETE /api/chat                          -> her chat and its messages are deleted
 * Salon (a session from its passcode, `Authorization: Bearer`):
 *   POST /api/salon/login {passcode}          -> {token}   (SALON_PASSCODE, a Cloudflare secret only the salon knows)
 *   POST /api/salon/logout
 *   GET  /api/salon/threads                   -> {threads: [{id, name, phone, last, lastText, unread}]}
 *   GET  /api/salon/threads/<id>?after=<id>   -> {thread, messages}         (her messages read)
 *   POST /api/salon/threads/<id>/send {text}  -> {message}
 *   DELETE /api/salon/threads/<id>
 *   GET  /api/salon/push                      -> {key}  (the server's own VAPID public key: made here, kept here)
 *   POST /api/salon/push {endpoint}           -> this phone gets a notification for each new message
 *   DELETE /api/salon/push {endpoint}
 *
 * Tokens are 32 random bytes; only their SHA-256 is stored. Notifications carry no content (no payload): the phone
 * shows «پیام تازه» and opens the inbox. Chats idle for RETAIN_DAYS are deleted.
 */

/** The database: Cloudflare's `ctx.storage.sql` (and node:sqlite's, wrapped, in the dev server). */
export interface Sql {
  exec(query: string, ...params: (string | number | null)[]): { toArray(): Record<string, unknown>[] };
}
export interface ChatEnv {
  /** The salon's passcode (a Cloudflare secret). Without it the salon can't sign in. */
  SALON_PASSCODE?: string;
}
/** How the server reaches a push service (fetch), and how it lets work finish after answering. */
export interface ChatIo {
  ip: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  waitUntil?: (work: Promise<unknown>) => void;
  now?: () => number;
}

const LIMITS = { name: 60, phone: 20, text: 1000 };
/** Rate limits: [count, window ms]. */
const RATE = {
  start: [5, 3_600_000], send: [40, 3_600_000], login: [5, 900_000], loginAll: [40, 3_600_000], salonSend: [300, 3_600_000],
} as const;
const SESSION_DAYS = 30, RETAIN_DAYS = 180, PUSH_GAP_MS = 30_000;
const DAY = 86_400_000;

export function migrate(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY, token TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, created INTEGER NOT NULL,
    last INTEGER NOT NULL, last_text TEXT NOT NULL, salon_unread INTEGER NOT NULL DEFAULT 0,
    customer_unread INTEGER NOT NULL DEFAULT 0, pushed INTEGER NOT NULL DEFAULT 0)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, thread TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)`);
  sql.exec("CREATE INDEX IF NOT EXISTS messages_thread ON messages (thread, id)");
  sql.exec("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, created INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS hits (key TEXT NOT NULL, at INTEGER NOT NULL)");
  sql.exec("CREATE INDEX IF NOT EXISTS hits_key ON hits (key, at)");
  sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
}

/** Answer one API request. */
export async function handle(req: Request, sql: Sql, env: ChatEnv, io: ChatIo): Promise<Response> {
  const now = io.now?.() ?? Date.now();
  const url = new URL(req.url);
  // (a page on another site can't post here in her name or the salon's)
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== url.origin) return json({ error: "origin" }, 403);
  if (Math.random() < 0.05) tidy(sql, now);
  try {
    const path = url.pathname.replace(/\/+$/, "");
    if (path.startsWith("/api/chat")) return await customer(req, path, url, sql, io, now);
    if (path.startsWith("/api/salon")) return await salon(req, path, url, sql, env, io, now);
    return json({ error: "not-found" }, 404);
  } catch (error) {
    if (error instanceof Bad) return json({ error: error.message }, error.status);
    throw error;
  }
}

class Bad extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

async function customer(req: Request, path: string, url: URL, sql: Sql, io: ChatIo, now: number): Promise<Response> {
  if (path === "/api/chat/start" && req.method === "POST") {
    const body = await read(req);
    const name = clean(body.name, LIMITS.name), phone = phoneOf(body.phone), text = clean(body.text, LIMITS.text, true);
    if (!name) throw new Bad("name");
    if (!phone) throw new Bad("phone");
    if (!text) throw new Bad("text");
    limit(sql, `start:${io.ip}`, RATE.start, now);
    const id = random(12), token = random(32);
    sql.exec("INSERT INTO threads (id, token, name, phone, created, last, last_text, salon_unread) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
      id, await sha(token), name, phone, now, now, text);
    sql.exec("INSERT INTO messages (thread, sender, text, at) VALUES (?, 'customer', ?, ?)", id, text, now);
    notify(sql, url.origin, io, id, now);
    return json({ thread: id, token, messages: messages(sql, id, 0) });
  }
  const thread = await threadOf(req, sql);
  if (path === "/api/chat" && req.method === "GET") {
    sql.exec("UPDATE threads SET customer_unread = 0 WHERE id = ?", thread.id);
    return json({ name: thread.name, phone: thread.phone, messages: messages(sql, thread.id, Number(url.searchParams.get("after")) || 0) });
  }
  if (path === "/api/chat/send" && req.method === "POST") {
    const text = clean((await read(req)).text, LIMITS.text, true);
    if (!text) throw new Bad("text");
    limit(sql, `send:${thread.id}`, RATE.send, now);
    const message = post(sql, thread.id, "customer", text, now);
    notify(sql, url.origin, io, thread.id, now);
    return json({ message });
  }
  if (path === "/api/chat" && req.method === "DELETE") {
    drop(sql, thread.id);
    return json({ ok: true });
  }
  throw new Bad("not-found", 404);
}

async function salon(req: Request, path: string, url: URL, sql: Sql, env: ChatEnv, io: ChatIo, now: number): Promise<Response> {
  if (path === "/api/salon/login" && req.method === "POST") {
    if (!env.SALON_PASSCODE) throw new Bad("passcode-not-set", 503);
    limit(sql, `login:${io.ip}`, RATE.login, now);
    limit(sql, "login:all", RATE.loginAll, now);
    const given = String((await read(req)).passcode ?? "");
    if (!same(await sha(given), await sha(env.SALON_PASSCODE))) throw new Bad("passcode", 401);
    const token = random(32);
    sql.exec("INSERT INTO sessions (token, expires) VALUES (?, ?)", await sha(token), now + SESSION_DAYS * DAY);
    return json({ token });
  }
  const session = await sha(bearer(req));
  const live = sql.exec("SELECT token FROM sessions WHERE token = ? AND expires > ?", session, now).toArray();
  if (!live.length) throw new Bad("session", 401);
  if (path === "/api/salon/logout" && req.method === "POST") {
    sql.exec("DELETE FROM sessions WHERE token = ?", session);
    return json({ ok: true });
  }
  if (path === "/api/salon/threads" && req.method === "GET") {
    const threads = sql.exec("SELECT id, name, phone, last, last_text, salon_unread FROM threads ORDER BY last DESC LIMIT 500").toArray()
      .map((t) => ({ id: t.id, name: t.name, phone: t.phone, last: t.last, lastText: t.last_text, unread: t.salon_unread }));
    return json({ threads });
  }
  if (path === "/api/salon/push" && req.method === "GET") return json({ key: b64url((await vapid(sql)).publicRaw) });
  if (path === "/api/salon/push" && (req.method === "POST" || req.method === "DELETE")) {
    const endpoint = String((await read(req)).endpoint ?? "");
    if (!/^https:\/\/[^\s]{8,2000}$/.test(endpoint)) throw new Bad("endpoint");
    if (req.method === "POST") sql.exec("INSERT OR REPLACE INTO subs (endpoint, created) VALUES (?, ?)", endpoint, now);
    else sql.exec("DELETE FROM subs WHERE endpoint = ?", endpoint);
    return json({ ok: true });
  }
  const m = /^\/api\/salon\/threads\/([A-Za-z0-9_-]{8,40})(\/send)?$/.exec(path);
  if (m) {
    const thread = sql.exec("SELECT id, name, phone, created, last FROM threads WHERE id = ?", m[1]).toArray()[0];
    if (!thread) throw new Bad("thread", 404);
    if (!m[2] && req.method === "GET") {
      sql.exec("UPDATE threads SET salon_unread = 0 WHERE id = ?", m[1]);
      return json({ thread, messages: messages(sql, m[1], Number(url.searchParams.get("after")) || 0) });
    }
    if (m[2] && req.method === "POST") {
      const text = clean((await read(req)).text, LIMITS.text, true);
      if (!text) throw new Bad("text");
      limit(sql, "salon-send", RATE.salonSend, now);
      return json({ message: post(sql, m[1], "salon", text, now) });
    }
    if (!m[2] && req.method === "DELETE") {
      drop(sql, m[1]);
      return json({ ok: true });
    }
  }
  throw new Bad("not-found", 404);
}

/** A message in a chat (its counts and last line updated). */
function post(sql: Sql, thread: string, sender: "customer" | "salon", text: string, now: number) {
  const id = Number(sql.exec("INSERT INTO messages (thread, sender, text, at) VALUES (?, ?, ?, ?) RETURNING id", thread, sender, text, now).toArray()[0].id);
  sql.exec(`UPDATE threads SET last = ?, last_text = ?, ${sender === "customer" ? "salon_unread = salon_unread + 1" : "customer_unread = customer_unread + 1"} WHERE id = ?`,
    now, text, thread);
  return { id, from: sender, text, at: now };
}

function messages(sql: Sql, thread: string, after: number) {
  return sql.exec("SELECT id, sender, text, at FROM messages WHERE thread = ? AND id > ? ORDER BY id LIMIT 500", thread, after).toArray()
    .map((m) => ({ id: m.id, from: m.sender, text: m.text, at: m.at }));
}

function drop(sql: Sql, thread: string) {
  sql.exec("DELETE FROM messages WHERE thread = ?", thread);
  sql.exec("DELETE FROM threads WHERE id = ?", thread);
}

async function threadOf(req: Request, sql: Sql) {
  const t = sql.exec("SELECT id, name, phone FROM threads WHERE token = ?", await sha(bearer(req))).toArray()[0];
  if (!t) throw new Bad("chat", 401);
  return { id: String(t.id), name: String(t.name), phone: String(t.phone) };
}

/** At most `n` of `key` in `ms`, else 429. */
function limit(sql: Sql, key: string, [n, ms]: readonly [number, number], now: number) {
  const count = Number(sql.exec("SELECT COUNT(*) AS c FROM hits WHERE key = ? AND at > ?", key, now - ms).toArray()[0].c);
  if (count >= n) throw new Bad("busy", 429);
  sql.exec("INSERT INTO hits (key, at) VALUES (?, ?)", key, now);
}

/** Old rate-limit marks, expired sessions, chats idle for RETAIN_DAYS. */
function tidy(sql: Sql, now: number) {
  sql.exec("DELETE FROM hits WHERE at < ?", now - DAY);
  sql.exec("DELETE FROM sessions WHERE expires < ?", now);
  const old = sql.exec("SELECT id FROM threads WHERE last < ?", now - RETAIN_DAYS * DAY).toArray();
  for (const t of old) drop(sql, String(t.id));
}

/** Her name or a message: control characters out, spaces folded (new lines kept in a message), at most `max` long. */
export function clean(value: unknown, max: number, lines = false): string {
  if (typeof value !== "string") return "";
  let s = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "");
  s = lines ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return [...s.trim()].slice(0, max).join("").trim();
}

/** A phone number as digits (Persian and Arabic digits too), an optional leading +; null when it can't be one. */
export function phoneOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const latin = value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const plus = latin.trim().startsWith("+") || latin.trim().startsWith("00");
  const digits = latin.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

async function read(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 8000) throw new Bad("too-long", 413);
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : {};
  } catch { throw new Bad("json"); }
}

function bearer(req: Request): string {
  return /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "-";
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function random(bytes: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
async function sha(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}
/** Equal strings, in time that doesn't depend on where they differ. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The server's own VAPID key pair (made the first time, kept in its database; never leaves it but the public half). */
export async function vapid(sql: Sql): Promise<{ publicRaw: Uint8Array; privateKey: CryptoKey }> {
  const kept = sql.exec("SELECT v FROM kv WHERE k = 'vapid'").toArray()[0];
  let jwk: JsonWebKey;
  if (kept) jwk = JSON.parse(String(kept.v));
  else {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    jwk = await crypto.subtle.exportKey("jwk", pair.privateKey) as JsonWebKey;
    sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('vapid', ?)", JSON.stringify(jwk));
  }
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const publicRaw = new Uint8Array(65);
  publicRaw[0] = 4;
  publicRaw.set(unb64url(jwk.x!), 1);
  publicRaw.set(unb64url(jwk.y!), 33);
  return { publicRaw, privateKey };
}

/** The VAPID header for one push service (RFC 8292: a JWT signed ES256 by the server's key). */
export async function vapidHeader(sql: Sql, endpoint: string, subject: string, now: number): Promise<string> {
  const { publicRaw, privateKey } = await vapid(sql);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(body)));
  return `vapid t=${body}.${b64url(sig)}, k=${b64url(publicRaw)}`;
}

/** A notification on each of the salon's phones (no content: «پیام تازه»), at most one per chat every PUSH_GAP_MS. */
function notify(sql: Sql, origin: string, io: ChatIo, thread: string, now: number) {
  const t = sql.exec("SELECT pushed FROM threads WHERE id = ?", thread).toArray()[0];
  if (t && now - Number(t.pushed) < PUSH_GAP_MS) return;
  sql.exec("UPDATE threads SET pushed = ? WHERE id = ?", now, thread);
  const subs = sql.exec("SELECT endpoint FROM subs").toArray().map((s) => String(s.endpoint));
  if (!subs.length) return;
  const subject = origin.startsWith("https://") ? origin : "mailto:salon@example.invalid";
  const work = Promise.all(subs.map(async (endpoint) => {
    try {
      const res = await io.fetch(endpoint, {
        method: "POST",
        headers: { authorization: await vapidHeader(sql, endpoint, subject, now), ttl: "86400", urgency: "high", "content-length": "0" },
      });
      if (res.status === 404 || res.status === 410) sql.exec("DELETE FROM subs WHERE endpoint = ?", endpoint);
    } catch { /* (a push service down: the inbox still shows the message) */ }
  }));
  if (io.waitUntil) io.waitUntil(work);
}
