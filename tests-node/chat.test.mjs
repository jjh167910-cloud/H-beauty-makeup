// The salon's chat server (worker/chat.ts) over node:sqlite, as the Durable Object runs it over Cloudflare's SQLite.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { handle, migrate, phoneOf, clean } from "../worker/chat.ts";

const ORIGIN = "https://salon.example";
function server({ passcode = "rose-garden-1405", ip = "1.2.3.4" } = {}) {
  const db = new DatabaseSync(":memory:");
  const sql = { exec: (q, ...p) => { const rows = db.prepare(q).all(...p); return { toArray: () => rows }; } };   // (runs now, as Cloudflare's does)
  migrate(sql);
  const pushes = [];
  let pushStatus = 201, clock = 1_800_000_000_000;
  const io = {
    ip, now: () => clock, waitUntil: (w) => pending.push(w),
    fetch: async (url, init) => { pushes.push({ url, init }); return new Response(null, { status: pushStatus }); },
  };
  const pending = [];
  const call = async (method, path, { body, token, origin, from } = {}) => {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (origin) headers.origin = origin;
    const res = await handle(new Request(ORIGIN + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), sql,
      { SALON_PASSCODE: passcode }, from ? { ...io, ip: from } : io);
    return { status: res.status, body: await res.json() };
  };
  return { call, pushes, pending, setPush: (s) => (pushStatus = s), tick: (ms) => (clock += ms), db };
}

test("a customer's booking reaches the salon, the salon answers, and she reads the answer", async () => {
  const s = server();
  const start = await s.call("POST", "/api/chat/start", { body: { name: "  مریم‮  ", phone: "۰۹۱۲ ۳۴۵ ۶۷۸۹", text: "سبک: گلم هالیوودی\nشدت: پررنگ" } });
  assert.equal(start.status, 200);
  assert.match(start.body.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(start.body.messages[0].text, "سبک: گلم هالیوودی\nشدت: پررنگ");

  assert.equal((await s.call("POST", "/api/salon/login", { body: { passcode: "wrong" } })).status, 401);
  const login = await s.call("POST", "/api/salon/login", { body: { passcode: "rose-garden-1405" } });
  assert.equal(login.status, 200);
  const salon = login.body.token;

  const list = await s.call("GET", "/api/salon/threads", { token: salon });
  assert.deepEqual(list.body.threads.map((t) => [t.name, t.phone, t.unread]), [["مریم", "09123456789", 1]]);
  const id = list.body.threads[0].id;
  const open = await s.call("GET", `/api/salon/threads/${id}`, { token: salon });
  assert.equal(open.body.messages.length, 1);
  assert.equal((await s.call("GET", "/api/salon/threads", { token: salon })).body.threads[0].unread, 0);

  const reply = await s.call("POST", `/api/salon/threads/${id}/send`, { token: salon, body: { text: "سلام، پنجشنبه ساعت ۴ وقت داریم." } });
  assert.equal(reply.body.message.from, "salon");
  const mine = await s.call("GET", `/api/chat?after=${start.body.messages[0].id}`, { token: start.body.token });
  assert.deepEqual(mine.body.messages.map((m) => [m.from, m.text]), [["salon", "سلام، پنجشنبه ساعت ۴ وقت داریم."]]);
  assert.equal((await s.call("POST", "/api/chat/send", { token: start.body.token, body: { text: "عالیه، ممنون" } })).status, 200);

  // she deletes her chat: gone for the salon too
  assert.equal((await s.call("DELETE", "/api/chat", { token: start.body.token })).status, 200);
  assert.deepEqual((await s.call("GET", "/api/salon/threads", { token: salon })).body.threads, []);
  assert.equal((await s.call("GET", "/api/chat", { token: start.body.token })).status, 401);
});

test("nobody reads a chat without its token or the salon's session; other sites can't post", async () => {
  const s = server();
  const a = (await s.call("POST", "/api/chat/start", { body: { name: "A", phone: "+44 7700 900123", text: "hi" } })).body;
  const b = (await s.call("POST", "/api/chat/start", { body: { name: "B", phone: "09121111111", text: "hello" } })).body;
  assert.equal((await s.call("GET", "/api/chat", { token: a.token })).body.messages[0].text, "hi");
  assert.equal((await s.call("GET", "/api/chat", { token: b.token })).body.messages[0].text, "hello");
  assert.equal((await s.call("GET", "/api/chat")).status, 401);
  assert.equal((await s.call("GET", "/api/salon/threads", { token: a.token })).status, 401);   // her token isn't a session
  assert.equal((await s.call("GET", `/api/salon/threads/${a.thread}`)).status, 401);
  assert.equal((await s.call("POST", "/api/chat/start", { origin: "https://evil.example", body: { name: "x", phone: "09121111111", text: "x" } })).status, 403);
  // the salon signs out: its session no longer works
  const salon = (await s.call("POST", "/api/salon/login", { body: { passcode: "rose-garden-1405" } })).body.token;
  assert.equal((await s.call("POST", "/api/salon/logout", { token: salon })).status, 200);
  assert.equal((await s.call("GET", "/api/salon/threads", { token: salon })).status, 401);
  // tokens are kept hashed
  const kept = s.db.prepare("SELECT token FROM threads").all().map((r) => r.token);
  assert.ok(!kept.includes(a.token) && !kept.includes(b.token));
});

test("bad input, guessing and floods are refused", async () => {
  const s = server();
  assert.equal((await s.call("POST", "/api/chat/start", { body: { name: "", phone: "09121111111", text: "x" } })).body.error, "name");
  assert.equal((await s.call("POST", "/api/chat/start", { body: { name: "x", phone: "12", text: "x" } })).body.error, "phone");
  assert.equal((await s.call("POST", "/api/chat/start", { body: { name: "x", phone: "09121111111", text: "  " } })).body.error, "text");
  for (let i = 0; i < 5; i++) assert.equal((await s.call("POST", "/api/chat/start", { body: { name: "x", phone: "09121111111", text: "x" } })).status, 200);
  assert.equal((await s.call("POST", "/api/chat/start", { body: { name: "x", phone: "09121111111", text: "x" } })).status, 429);
  assert.equal((await s.call("POST", "/api/chat/start", { from: "5.6.7.8", body: { name: "x", phone: "09121111111", text: "x" } })).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await s.call("POST", "/api/salon/login", { body: { passcode: `guess${i}` } })).status, 401);
  assert.equal((await s.call("POST", "/api/salon/login", { body: { passcode: "rose-garden-1405" } })).status, 429);   // locked for a while
  s.tick(16 * 60_000);
  assert.equal((await s.call("POST", "/api/salon/login", { body: { passcode: "rose-garden-1405" } })).status, 200);
  // without a passcode set in Cloudflare nobody can sign in
  assert.equal((await server({ passcode: "" }).call("POST", "/api/salon/login", { body: { passcode: "" } })).status, 503);
  // long messages are cut, controls and direction marks taken out
  assert.equal(clean("a\u0000b‮c  d", 10), "abc d");
  assert.equal([...clean("x".repeat(3000), 1000, true)].length, 1000);
  assert.equal(phoneOf("+98 912 123 4567"), "+989121234567");
  assert.equal(phoneOf("٠٩١٢١٢٣٤٥٦٧"), "09121234567");
  assert.equal(phoneOf("call me"), null);
});

test("a new message is a notification on the salon's phone: no content, signed with the server's own key", async () => {
  const s = server();
  const salon = (await s.call("POST", "/api/salon/login", { body: { passcode: "rose-garden-1405" } })).body.token;
  const key = (await s.call("GET", "/api/salon/push", { token: salon })).body.key;
  assert.equal((await s.call("GET", "/api/salon/push", { token: salon })).body.key, key);   // made once, kept
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
  assert.equal((await s.call("POST", "/api/salon/push", { token: salon, body: { endpoint } })).status, 200);
  assert.equal((await s.call("POST", "/api/salon/push", { token: salon, body: { endpoint: "http://127.0.0.1/x" } })).status, 400);

  const chat = (await s.call("POST", "/api/chat/start", { body: { name: "x", phone: "09121111111", text: "سلام" } })).body;
  await Promise.all(s.pending);
  assert.equal(s.pushes.length, 1);
  const { url, init } = s.pushes[0];
  assert.equal(url, endpoint);
  assert.equal(init.body, undefined);                                   // no content leaves the server
  const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(init.headers.authorization);
  assert.equal(k, key);
  const [h, p, sig] = t.split(".");
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, ORIGIN);
  const pub = await crypto.subtle.importKey("raw", Buffer.from(key, "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${h}.${p}`)));

  // a second message within 30 s: no second notification; later: one, and a gone phone is forgotten
  await s.call("POST", "/api/chat/send", { token: chat.token, body: { text: "؟" } });
  assert.equal(s.pushes.length, 1);
  s.tick(31_000); s.setPush(410);
  await s.call("POST", "/api/chat/send", { token: chat.token, body: { text: "؟؟" } });
  await Promise.all(s.pending);
  assert.equal(s.pushes.length, 2);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS c FROM subs").get().c, 0);
});

test("each side sees what the other has read, and she gets a notification when the salon answers", async () => {
  const s = server();
  const her = (await s.call("POST", "/api/chat/start", { body: { name: "x", phone: "09121111111", text: "سلام" } })).body;
  const salon = (await s.call("POST", "/api/salon/login", { body: { passcode: "rose-garden-1405" } })).body.token;
  assert.equal((await s.call("GET", "/api/chat", { token: her.token })).body.seen, 0);                 // not read yet
  await s.call("GET", `/api/salon/threads/${her.thread}`, { token: salon });
  assert.equal((await s.call("GET", "/api/chat", { token: her.token })).body.seen, her.messages[0].id);   // read by the salon

  // her phone asks for a notification of the salon's answer
  assert.ok((await s.call("GET", "/api/chat/push", { token: her.token })).body.key);
  const endpoint = "https://web.push.apple.com/QAbc123";
  assert.equal((await s.call("POST", "/api/chat/push", { token: her.token, body: { endpoint } })).status, 200);
  const reply = await s.call("POST", `/api/salon/threads/${her.thread}/send`, { token: salon, body: { text: "سلام، بفرمایید" } });
  await Promise.all(s.pending);
  assert.deepEqual(s.pushes.map((p) => p.url), [endpoint]);
  assert.equal(s.pushes[0].init.body, undefined);
  assert.ok((await s.call("GET", `/api/salon/threads/${her.thread}`, { token: salon })).body.seen < reply.body.message.id);  // not read by her yet
  await s.call("GET", "/api/chat", { token: her.token });
  assert.equal((await s.call("GET", `/api/salon/threads/${her.thread}`, { token: salon })).body.seen, reply.body.message.id);
  // her chat deleted: her phone is no longer notified
  await s.call("DELETE", "/api/chat", { token: her.token });
  assert.equal(s.db.prepare("SELECT COUNT(*) AS c FROM csubs").get().c, 0);
});

test("the database of the first release is upgraded in place", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, token TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, created INTEGER NOT NULL, last INTEGER NOT NULL, last_text TEXT NOT NULL, salon_unread INTEGER NOT NULL DEFAULT 0, customer_unread INTEGER NOT NULL DEFAULT 0, pushed INTEGER NOT NULL DEFAULT 0)");
  db.exec("INSERT INTO threads VALUES ('t1234567890', 'h', 'n', '0912', 1, 1, 'x', 1, 0, 0)");
  const sql = { exec: (q, ...p) => { const rows = db.prepare(q).all(...p); return { toArray: () => rows }; } };
  migrate(sql);
  migrate(sql);                                                       // (again: nothing to do)
  assert.deepEqual({ ...db.prepare("SELECT salon_seen, customer_seen, cpushed FROM threads").get() }, { salon_seen: 0, customer_seen: 0, cpushed: 0 });
});
