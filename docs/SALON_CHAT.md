# The salon's own chat

A customer sends the salon her booking from the try-on («رزرو» → «ارسال برای سالن»): the look, its intensity and her
lipstick, as text she can change, with her name and phone number. The salon reads and answers at **`/salon`**, and gets
a notification on its phone for each new message. Text only: her photo is never sent.

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

## Code

| Path | What |
| --- | --- |
| `worker/chat.ts` | The whole API over the database (the endpoints are listed at its top) |
| `worker/index.ts` | The Worker: the app's files, and `/api/*` to the Durable Object |
| `wrangler.jsonc` | The Durable Object's binding and migration, `run_worker_first` for `/api/*` |
| `src/lib/chat.ts` | The app's side: her chat, the salon's session, notifications |
| `src/components/salon-chat.tsx`, `salon-inbox.tsx` | Her chat (from the booking), the salon's inbox (`/salon`) |
| `public/sw.js` | Never caches `/api/`; shows the notification and opens the inbox |
| `scripts/vite-chat-api.ts` | The same API on the dev server (node:sqlite; passcode from `SALON_PASSCODE`) |
| `tests-node/chat.test.mjs`, `tests/chat.spec.ts` | The server (tokens, limits, the signed notification), and her chat with the salon end to end |
