/**
 * The salon's inbox (/salon): its chats with customers (src/lib/chat.ts). The salon signs in with its passcode (the
 * SALON_PASSCODE secret it set in Cloudflare); then the chats, newest first with their unread counts, each with her name,
 * her phone (one tap to call) and a reply box; the list and an open chat are checked every few seconds. «اعلان‌ها» turns
 * on a notification on this phone for each new message (no content in it: it opens this page).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  ChatError, chatTime, salonDelete, salonLogin, salonLogout, salonNotifications, salonNotifying, salonReply, salonSignedIn,
  salonThread, salonThreads, type ChatMessage, type ChatThread,
} from "@/lib/chat";

const POLL_MS = 6000;
const persian = (s: string) => s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

function problemOf(error: unknown): string {
  const code = error instanceof ChatError ? error.code : "server";
  return ({
    offline: "اینترنت وصل نیست؛ وصل که شد دوباره امتحان کنید.",
    passcode: "رمز درست نیست.",
    busy: "تلاش‌های زیادی شد؛ ۱۵ دقیقه دیگر دوباره امتحان کنید.",
    "passcode-not-set": "رمز سالن هنوز در Cloudflare تنظیم نشده است (SALON_PASSCODE).",
    session: "دوباره وارد شوید.",
    "no-push": "این گوشی اعلان وب ندارد. روی آیفون، اول این صفحه را با «افزودن به صفحه اصلی» نصب کنید و از همان‌جا باز کنید.",
    denied: "اجازه‌ی اعلان داده نشد؛ از تنظیمات مرورگر اجازه دهید.",
  } as Record<string, string>)[code] ?? "کار انجام نشد؛ دوباره امتحان کنید.";
}

export default function SalonInbox() {
  const [signedIn, setSignedIn] = useState(salonSignedIn);
  // (installed from here, the app opens the inbox: its own manifest)
  useEffect(() => {
    document.title = "پیام‌های سالن · حنانه بیوتی";
    document.querySelector('link[rel="manifest"]')?.setAttribute("href", "/salon.webmanifest");
  }, []);
  return <main className="salon">{signedIn ? <Inbox onOut={() => setSignedIn(false)} /> : <Login onIn={() => setSignedIn(true)} />}</main>;
}

function Login({ onIn }: { onIn: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form className="salon__login" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setProblem(null);
      try { await salonLogin(passcode); onIn(); } catch (error) { setProblem(problemOf(error)); }
      setBusy(false);
    }}>
      <h1>پیام‌های مشتریان · حنانه بیوتی</h1>
      <p>برای دیدن و پاسخ دادن به پیام‌ها، رمز سالن را وارد کنید.</p>
      <label className="chat__text"><span>رمز سالن</span>
        <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" dir="ltr" />
      </label>
      {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
      <Button type="submit" variant="gold" disabled={busy || !passcode}>{busy ? "در حال ورود…" : "ورود"}</Button>
    </form>
  );
}

function Inbox({ onOut }: { onOut: () => void }) {
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);

  const refresh = () => salonThreads().then((t) => { setThreads(t); setProblem(null); }).catch((error) => {
    if (error instanceof ChatError && error.status === 401) onOut(); else setProblem(problemOf(error));
  });
  useEffect(() => {
    void refresh();
    void salonNotifying().then(setNotifying);
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [open]);

  async function toggleNotify() {
    setNotifyBusy(true); setProblem(null);
    try { setNotifying(await salonNotifications(!notifying)); } catch (error) { setProblem(problemOf(error)); }
    setNotifyBusy(false);
  }

  const unread = threads?.reduce((s, t) => s + t.unread, 0) ?? 0;
  useEffect(() => { document.title = `${unread ? `(${persian(String(unread))}) ` : ""}پیام‌های سالن · حنانه بیوتی`; }, [unread]);

  return (
    <>
      <header className="salon__head">
        <h1>پیام‌های مشتریان{unread ? ` (${persian(String(unread))} تازه)` : ""}</h1>
        <div className="salon__tools">
          <Button variant="secondary" icon={notifying ? "bell" : "bell-off"} onClick={() => void toggleNotify()} disabled={notifyBusy} aria-pressed={notifying}>
            {notifying ? "اعلان روشن" : "روشن کردن اعلان"}
          </Button>
          <Button variant="ghost" icon="sign-out" onClick={() => void salonLogout().then(onOut)}>خروج</Button>
        </div>
      </header>
      <div>
        {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
        {open ? <Thread id={open} onBack={() => setOpen(null)} onGone={() => { setOpen(null); void refresh(); }} onOut={onOut} />
          : threads == null ? <p className="salon__empty" role="status">در حال باز کردن…</p>
          : !threads.length ? <p className="salon__empty">هنوز پیامی نیامده است. پیام مشتری‌ها از دکمه‌ی «رزرو» در صفحه‌ی امتحان میکاپ اینجا می‌آید.</p>
          : (
            <ul className="salon__threads" aria-label="گفت‌وگوها">
              {threads.map((t) => (
                <li key={t.id}>
                  <button type="button" className="salon__thread" data-unread={t.unread ? "" : undefined} onClick={() => setOpen(t.id)}>
                    <strong>{t.name}</strong>
                    {t.unread ? <b aria-label={`${t.unread} پیام تازه`}>{persian(String(t.unread))}</b> : <small>{chatTime(t.last)}</small>}
                    <span>{t.lastText}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </>
  );
}

function Thread({ id, onBack, onGone, onOut }: { id: string; onBack: () => void; onGone: () => void; onOut: () => void }) {
  const [who, setWho] = useState<{ name: string; phone: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const lastId = messages.at(-1)?.id ?? 0;

  useEffect(() => {
    const load = (after: number) => salonThread(id, after).then((r) => {
      setWho({ name: r.thread.name, phone: r.thread.phone });
      if (r.messages.length) setMessages((was) => [...was, ...r.messages.filter((m) => !was.some((x) => x.id === m.id))]);
    }).catch((error) => {
      if (error instanceof ChatError && error.status === 401) onOut();
      else if (error instanceof ChatError && error.status === 404) onGone();
    });
    void load(lastId);
    const t = setInterval(() => { if (!document.hidden) void load(lastId); }, POLL_MS);
    return () => clearInterval(t);
  }, [id, lastId]);
  useEffect(() => { list.current?.lastElementChild?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function reply() {
    setBusy(true); setProblem(null);
    try { const m = await salonReply(id, text); setMessages((was) => [...was, m]); setText(""); } catch (error) { setProblem(problemOf(error)); }
    setBusy(false);
  }

  return (
    <section className="salon__open" aria-label={who ? `گفت‌وگو با ${who.name}` : "گفت‌وگو"}>
      <div className="salon__who">
        <Button variant="ghost" icon="back" onClick={onBack}>همه‌ی پیام‌ها</Button>
        {who ? <h2>{who.name}</h2> : null}
        {who ? <a href={`tel:${who.phone}`} dir="ltr"><Icon name="phone" size={16} /> {persian(who.phone)}</a> : null}
      </div>
      <ol className="chat__list" ref={list} aria-label="پیام‌ها" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className="chat__msg" data-from={m.from}>
            <span>{m.text}</span>
            <small>{m.from === "salon" ? "سالن، " : ""}{chatTime(m.at)}</small>
          </li>
        ))}
      </ol>
      <form className="chat__compose" onSubmit={(e) => { e.preventDefault(); void reply(); }}>
        <label className="chat__text"><span className="sr-only">پاسخ</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="پاسخ به مشتری…" />
        </label>
        {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
        <div className="salon__tools">
          <Button type="submit" variant="gold" icon="send" disabled={busy || !text.trim()}>{busy ? "در حال فرستادن…" : "فرستادن"}</Button>
          <Button variant="ghost" icon="trash" onClick={async () => {
            if (!sure) { setSure(true); return; }
            try { await salonDelete(id); onGone(); } catch (error) { setProblem(problemOf(error)); }
          }}>{sure ? "مطمئنید؟ حذف همیشگی" : "حذف گفت‌وگو"}</Button>
        </div>
      </form>
    </section>
  );
}
