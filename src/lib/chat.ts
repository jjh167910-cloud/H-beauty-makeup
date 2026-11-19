/**
 * The salon's own chat, client side (the server: worker/chat.ts). Her chat's token and her name and phone are kept on
 * her phone (localStorage) so she sees the salon's replies when she comes back; the salon's session likewise on its
 * phone. Text only: nothing here sends a photo.
 */

import { MAKEUP_STYLES } from "@/data/makeup-styles";

export type ChatMessage = { id: number; from: "customer" | "salon"; text: string; at: number };
export type ChatThread = { id: string; name: string; phone: string; last: number; lastText: string; unread: number };
/** Why a call failed: no connection, a refusal by the server (its error code), or a session/chat no longer valid. */
export class ChatError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}

const MINE = "hb-salon-chat", ME = "hb-salon-me", SALON = "hb-salon-session";
type Mine = { thread: string; token: string; seen: number };

function load<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}
function keep(key: string, value: unknown) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* (no storage) */ }
}

async function api<T>(path: string, { method = "GET", body, token }: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method, cache: "no-store",
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ChatError("offline", 0); }
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new ChatError(data.error ?? "server", res.status);
  return data as T;
}

/* ---------- her side ---------- */

/** Her name and phone as she gave them last (filled in for her next time). */
export const myDetails = () => load<{ name: string; phone: string }>(ME);
/** She has a chat with the salon (on this phone). */
export const hasChat = () => !!load<Mine>(MINE);

/** Her first message: her chat with the salon begins. */
export async function startChat(name: string, phone: string, text: string): Promise<ChatMessage[]> {
  const r = await api<{ thread: string; token: string; messages: ChatMessage[] }>("/api/chat/start", { method: "POST", body: { name, phone, text } });
  keep(MINE, { thread: r.thread, token: r.token, seen: r.messages.at(-1)?.id ?? 0 });
  keep(ME, { name, phone });
  return r.messages;
}

/**
 * Her chat's messages after `after` (the salon's replies are marked read), and `seen`: the last of hers the salon has
 * read. Null when she has none (or it was deleted).
 */
export async function readChat(after = 0): Promise<{ name: string; phone: string; messages: ChatMessage[]; seen: number } | null> {
  const mine = load<Mine>(MINE);
  if (!mine) return null;
  try {
    const r = await api<{ name: string; phone: string; messages: ChatMessage[]; seen: number }>(`/api/chat?after=${after}`, { token: mine.token });
    const last = r.messages.at(-1)?.id;
    if (last && last > mine.seen) keep(MINE, { ...mine, seen: last });
    return r;
  } catch (error) {
    if (error instanceof ChatError && error.status === 401) { keep(MINE, null); return null; }
    throw error;
  }
}

/** How many of the salon's replies she hasn't seen (0 when offline or without a chat). */
export async function unreadReplies(): Promise<number> {
  const mine = load<Mine>(MINE);
  if (!mine) return 0;
  try {
    const r = await api<{ messages: ChatMessage[] }>(`/api/chat?after=${mine.seen}`, { token: mine.token });
    return r.messages.filter((m) => m.from === "salon").length;
  } catch { return 0; }
}

export async function sendChat(text: string): Promise<ChatMessage> {
  const mine = load<Mine>(MINE);
  if (!mine) throw new ChatError("chat", 401);
  const r = await api<{ message: ChatMessage }>("/api/chat/send", { method: "POST", token: mine.token, body: { text } });
  keep(MINE, { ...mine, seen: r.message.id });
  return r.message;
}

/** Her chat deleted, on the salon's side too (her name and phone stay on her phone for next time). */
export async function deleteChat() {
  const mine = load<Mine>(MINE);
  if (mine) await api("/api/chat", { method: "DELETE", token: mine.token }).catch((error) => { if (!(error instanceof ChatError && error.status === 401)) throw error; });
  keep(MINE, null);
}

/* ---------- the salon's side ---------- */

const session = () => load<string>(SALON);
export const salonSignedIn = () => !!session();

function salonApi<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return api<T>(path, { ...options, token: session() ?? undefined }).catch((error) => {
    if (error instanceof ChatError && error.status === 401) keep(SALON, null);
    throw error;
  });
}

export async function salonLogin(passcode: string) {
  keep(SALON, (await api<{ token: string }>("/api/salon/login", { method: "POST", body: { passcode } })).token);
}
export async function salonLogout() {
  await salonApi("/api/salon/logout", { method: "POST" }).catch(() => {});
  keep(SALON, null);
}
export const salonThreads = () => salonApi<{ threads: ChatThread[] }>("/api/salon/threads").then((r) => r.threads);
export const salonThread = (id: string, after = 0) =>
  salonApi<{ thread: { id: string; name: string; phone: string; created: number }; messages: ChatMessage[]; seen: number }>(`/api/salon/threads/${id}?after=${after}`);
export const salonReply = (id: string, text: string) =>
  salonApi<{ message: ChatMessage }>(`/api/salon/threads/${id}/send`, { method: "POST", body: { text } }).then((r) => r.message);
export const salonDelete = (id: string) => salonApi(`/api/salon/threads/${id}`, { method: "DELETE" });

/**
 * Notifications, through the browser's own push service, without content. The salon's come through their own service
 * worker (public/salon-sw.js, scope /salon: «پیام تازه», opens the inbox); hers through the app's (public/sw.js:
 * «پاسخ سالن», opens her chat). A phone can be both: each has its own subscription.
 */
const pushable = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function registration(salon: boolean): Promise<ServiceWorkerRegistration> {
  if (!pushable()) throw new ChatError("no-push", 0);
  return salon ? navigator.serviceWorker.register("/salon-sw.js", { scope: "/salon" }) : navigator.serviceWorker.register("/sw.js");
}
async function notifications(on: boolean, salon: boolean, call: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>) {
  const reg = await registration(salon);
  await navigator.serviceWorker.ready;
  const path = salon ? "/api/salon/push" : "/api/chat/push";
  const was = await reg.pushManager.getSubscription();
  if (!on) {
    if (was) { await call(path, { method: "DELETE", body: { endpoint: was.endpoint } }).catch(() => {}); await was.unsubscribe(); }
    return false;
  }
  if ((await Notification.requestPermission()) !== "granted") throw new ChatError("denied", 0);
  const { key } = await call<{ key: string }>(path);
  const raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
  const sub = was ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
  await call(path, { method: "POST", body: { endpoint: sub.endpoint } });
  return true;
}
async function notifying(salon: boolean): Promise<boolean> {
  try {
    if (!pushable() || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration(salon ? "/salon" : "/");
    return !!(reg && (!salon || reg.scope.endsWith("/salon")) && await reg.pushManager.getSubscription());
  } catch { return false; }
}
/** Notifications on the salon's phone for each new message. */
export const salonNotifications = (on: boolean) => notifications(on, true, salonApi);
export const salonNotifying = () => notifying(true);
/** A notification on her phone when the salon answers. */
export const herNotifications = (on: boolean) => {
  const mine = load<Mine>(MINE);
  if (!mine) return Promise.reject(new ChatError("chat", 401));
  return notifications(on, false, <T,>(path: string, options: { method?: string; body?: unknown } = {}) => api<T>(path, { ...options, token: mine.token }));
};
export const herNotifying = () => notifying(false);
/** This phone can show notifications (a browser with Web Push; on an iPhone, the app added to the home screen). */
export const canNotify = pushable;

/**
 * Her booking as a card: the request the try-on writes («درخواست نوبت میکاپ · حنانه بیوتی», «سبک: …», details), with
 * the look's catalog photo (the salon's, never hers); null for any other message.
 */
export const BOOKING_HEAD = "درخواست نوبت میکاپ · حنانه بیوتی";
export function bookingCard(text: string): { title: string; look: string | null; lines: string[] } | null {
  const [head, title, ...lines] = text.split("\n");
  if (head !== BOOKING_HEAD || !title) return null;
  const name = title.replace(/^سبک:\s*/, "");
  return { title, look: MAKEUP_STYLES.find((item) => item.title === name)?.id ?? null, lines: lines.filter(Boolean) };
}

/** A day as the chat heads its messages: «امروز», «دیروز», or the date. */
export function chatDay(at: number): string {
  const d = new Date(at), today = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  return diff === 0 ? "امروز" : diff === 1 ? "دیروز" : d.toLocaleDateString("fa-IR", { weekday: "long", month: "long", day: "numeric" });
}

/** A time as the chat shows it: «۱۴:۰۵», or with the day when it isn't today (no «·» by Persian digits: it reads as a zero). */
export function chatTime(at: number): string {
  const d = new Date(at), now = new Date();
  const time = d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? time : `${d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" })}، ${time}`;
}
