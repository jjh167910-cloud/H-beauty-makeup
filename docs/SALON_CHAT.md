# The salon's own chat

Any customer can write to the salon from the top of every screen («گفت‌وگو با سالن», with the count of replies she
hasn't seen), or send her booking from the try-on («رزرو» → «ارسال برای سالن»: the look, its intensity and her
lipstick, as text she can change). The first time she gives her name and phone number. The salon reads and answers at
**`/salon`**, and gets a notification on its phone for each new message. Text only: her photo is never sent.

**Her chat** is full screen on a phone, like a messaging app: the salon's name and logo, a welcome, quick topics to
start from (booking, prices, bridal, a question about a look); messages under their day, a booking as a card with the
look's catalog photo; her messages sending, sent (one tick), seen by the salon (two), or not sent (send again). The bell
turns on a notification on her phone when the salon answers. She can delete her chat. Escape closes it.

**The salon's inbox**: its chats newest first with unread counts, a search by name or phone; a chat with her phone one
tap to call, her bookings as cards, the salon's replies with «دیده شد» once she has read them, and quick replies (four
to start with; the salon adds its own and removes any, kept on that phone).

## Setting it up (once)

1. **The salon's passcode.** In Cloudflare: *Workers & Pages → h-beauty-makeup → Settings → Variables and Secrets →
   Add*, type **Secret**, name `SALON_PASSCODE`, and a passcode only the salon knows (long: a few words). Until it is
   set, the inbox says so and nobody can sign in. Changing it later doesn't sign out phones already signed in (their
   sessions last 30 days; «خروج» ends one).
2. **The inbox on the salon's phone.** Open `https://h-beauty-makeup.jjh167910.workers.dev/salon`, sign in with the
   passcode, and add it to the home screen (on an iPhone this is needed for notifications: Share → Add to Home Screen,
   then open it from there). Installed from `/salon` it opens on the inbox.
3. **Notifications.** In the inbox, «روشن کردن اعلان» and allow notifications. Each phone that should hear about new
   messages does this once.

## What is kept, and where

- Everything is in one Durable Object (`SalonChat`, its own SQLite database) on the salon's Cloudflare account: each
  chat's name, phone, messages and times. Nothing goes to any other server; a notification carries no content (the
  phone shows «پیام تازه» and opens the inbox), through the phone's own push service.
- Her chat's key is kept on her phone; only its SHA-256 is on the server (the same for the salon's sessions). She can
  delete her chat («حذف این گفت‌وگو»), and the salon can delete any chat; both are gone from the server at once. A chat
  idle for 180 days is deleted.
- Limits: 5 new chats an hour from one address, 40 messages an hour in a chat, 5 wrong passcodes in 15 minutes from one
  address (40 an hour in all); names 60 characters, messages 1000, phone numbers 7 to 15 digits (Persian digits too).
  Posts from other sites are refused.
- The notification keys (VAPID) are made by the server the first time and kept in its database: nobody handles them.
- Each side sees what the other has read: the server keeps, per chat, the last message each side has opened.
- The database upgrades itself in place (new columns are added when the Durable Object starts).
- The artist's bench (`/bench`, signed in as the salon) keeps her scores in the same database: per look, engine and
  photo, six numbers from 1 to 5 and a short note. A photo is only the first 16 hex digits of its SHA-256: the photo
  itself stays on her phone. «دور تازه» deletes them all (at most 5000 are kept).

## Code

| Path | What |
| --- | --- |
| `worker/chat.ts` | The whole API over the database (the endpoints are listed at its top) |
| `worker/index.ts` | The Worker: the app's files, and `/api/*` to the Durable Object |
| `wrangler.jsonc` | The Durable Object's binding and migration, `run_worker_first` for `/api/*` |
| `src/lib/chat.ts` | The app's side: her chat, the salon's session, notifications |
| `src/components/salon-chat.tsx`, `salon-inbox.tsx` | Her chat (from the booking), the salon's inbox (`/salon`) |
| `src/components/chat-parts.tsx` | The message list (days, booking cards, message states) and the message box, for both sides |
| `public/sw.js` | Never caches `/api/`; her notification («پاسخ سالن») opens her chat (`/?chat=1`) |
| `public/salon-sw.js` | The salon's notifications only (scope `/salon`, its own subscription): «پیام تازه» opens the inbox |
| `scripts/vite-chat-api.ts` | The same API on the dev server (node:sqlite; passcode from `SALON_PASSCODE`) |
| `tests-node/chat.test.mjs`, `tests/chat.spec.ts` | The server (tokens, limits, the signed notification), and her chat with the salon end to end |
