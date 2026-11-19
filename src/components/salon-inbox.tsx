/**
 * The salon's inbox (/salon): its chats with customers (src/lib/chat.ts). The salon signs in with its passcode (the
 * SALON_PASSCODE secret it set in Cloudflare); then its chats, newest first, with unread counts and a search by name or
 * phone; a chat with her name, her phone (one tap to call), her messages and bookings (as cards with the look's photo),
 * the salon's replies with «دیده شد» once she has read them, and quick replies (its own, kept on this phone). Checked
 * every few seconds; «اعلان» gives a notification on this phone for each new message (no content: it opens this page).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Composer, MessageList, type ShownMessage } from "@/components/chat-parts";
import {
  BOOKING_HEAD, ChatError, chatTime, salonDelete, salonLogin, salonLogout, salonNotifications, salonNotifying, salonReply,
  salonSignedIn, salonThread, salonThreads, type ChatThread,
} from "@/lib/chat";

const POLL_MS = 6000;
const persian = (s: string) => s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** The salon's quick replies (kept on this phone; it can add its own and remove any). */
const REPLIES_KEY = "hb-salon-replies";
const REPLIES = [
  "سلام، از پیامتان ممنونیم. چه روز و ساعتی برایتان مناسب است؟",
  "این ساعت برایتان رزرو شد. منتظرتان هستیم.",
  "متأسفانه این ساعت پر است؛ ساعت دیگری را پیشنهاد می‌کنید؟",
  "برای هماهنگی دقیق‌تر با شما تماس می‌گیریم.",
];
function loadReplies(): string[] {
  try { const r: unknown = JSON.parse(localStorage.getItem(REPLIES_KEY) ?? "null"); return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : REPLIES; } catch { return REPLIES; }
}
function saveReplies(r: string[]) { try { localStorage.setItem(REPLIES_KEY, JSON.stringify(r)); } catch { /* (no storage) */ } }

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
      <img className="chat__avatar" src="/icons/hananeh-signature.svg" alt="" />
      <h1>پیام‌های مشتریان · حنانه بیوتی</h1>
      <p>برای دیدن و پاسخ دادن به پیام‌ها، رمز سالن را وارد کنید.</p>
      <label><span>رمز سالن</span>
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
  const [find, setFind] = useState("");
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
  const shown = useMemo(() => {
    const q = latin(find.trim()).toLowerCase();
    return !q ? threads : threads?.filter((t) => t.name.toLowerCase().includes(q) || t.phone.includes(q.replace(/\D/g, "") || "\u0000"));
  }, [threads, find]);

  return (
    <>
      <header className="salon__head">
        <div className="salon__brand">
          <img className="chat__avatar" src="/icons/hananeh-signature.svg" alt="" />
          <h1>پیام‌های مشتریان{unread ? ` (${persian(String(unread))} تازه)` : ""}</h1>
        </div>
        <div className="salon__tools">
          <Button variant="secondary" icon={notifying ? "bell" : "bell-off"} onClick={() => void toggleNotify()} disabled={notifyBusy} aria-pressed={notifying}>
            {notifying ? "اعلان روشن" : "روشن کردن اعلان"}
          </Button>
          <a className="btn" data-variant="ghost" href="/bench">سنجش آرتیست</a>
          <Button variant="ghost" icon="sign-out" onClick={() => void salonLogout().then(onOut)}>خروج</Button>
        </div>
      </header>
      <div>
        {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
        {open ? <Thread id={open} onBack={() => setOpen(null)} onGone={() => { setOpen(null); void refresh(); }} onOut={onOut} />
          : threads == null ? <p className="salon__empty" role="status">در حال باز کردن…</p>
          : !threads.length ? <p className="salon__empty">هنوز پیامی نیامده است. پیام مشتری‌ها از «گفت‌وگو با سالن» و دکمه‌ی «رزرو» در صفحه‌ی امتحان میکاپ اینجا می‌آید.</p>
          : (
            <>
              <label className="salon__search">
                <span className="sr-only">جست‌وجو با نام یا شماره</span>
                <Icon name="search" size={18} />
                <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="جست‌وجو با نام یا شماره" />
              </label>
              <ul className="salon__threads" aria-label="گفت‌وگوها">
                {shown?.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="salon__thread" data-unread={t.unread ? "" : undefined} onClick={() => setOpen(t.id)}>
                      <i aria-hidden="true">{[...t.name][0] ?? "؟"}</i>
                      <strong>{t.name}</strong>
                      {t.unread ? <b aria-label={`${t.unread} پیام تازه`}>{persian(String(t.unread))}</b> : <small>{chatTime(t.last)}</small>}
                      <span>{t.lastText.startsWith(BOOKING_HEAD) ? `درخواست نوبت — ${(t.lastText.split("\n")[1] ?? "").replace(/^سبک:\s*/, "")}` : t.lastText}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {shown && !shown.length ? <p className="salon__empty">گفت‌وگویی با این نام یا شماره نیست.</p> : null}
            </>
          )}
      </div>
    </>
  );
}

function Thread({ id, onBack, onGone, onOut }: { id: string; onBack: () => void; onGone: () => void; onOut: () => void }) {
  const [who, setWho] = useState<{ name: string; phone: string } | null>(null);
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [seen, setSeen] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [replies, setReplies] = useState(loadReplies);
  const lastId = messages.filter((m) => !m.pending && !m.failed).at(-1)?.id ?? 0;

  useEffect(() => {
    const load = (after: number) => salonThread(id, after).then((r) => {
      setWho({ name: r.thread.name, phone: r.thread.phone });
      setSeen(r.seen);
      if (r.messages.length) setMessages((was) => [...was.filter((m) => !r.messages.some((x) => x.id === m.id)), ...r.messages].sort((a, b) => a.id - b.id));
    }).catch((error) => {
      if (error instanceof ChatError && error.status === 401) onOut();
      else if (error instanceof ChatError && error.status === 404) onGone();
    });
    void load(lastId);
    const t = setInterval(() => { if (!document.hidden) void load(lastId); }, POLL_MS);
    return () => clearInterval(t);
  }, [id, lastId]);

  async function reply(body = text, key = `k${Date.now()}`) {
    setBusy(true); setProblem(null); setText("");
    setMessages((was) => [...was.filter((m) => m.key !== key), { id: Number.MAX_SAFE_INTEGER, from: "salon", text: body, at: Date.now(), pending: true, key }]);
    try {
      const m = await salonReply(id, body);
      setMessages((was) => [...was.filter((x) => x.key !== key), m].sort((a, b) => a.id - b.id));
    } catch (error) {
      setMessages((was) => was.map((m) => (m.key === key ? { ...m, pending: false, failed: true } : m)));
      setProblem(problemOf(error));
    }
    setBusy(false);
  }

  const keepReplies = (r: string[]) => { setReplies(r); saveReplies(r); };

  return (
    <section className="salon__open" aria-label={who ? `گفت‌وگو با ${who.name}` : "گفت‌وگو"}>
      <div className="salon__who">
        <button type="button" className="chat__icon" aria-label="همه‌ی پیام‌ها" onClick={onBack}><Icon name="back" size={22} /></button>
        <h2>{who?.name ?? ""}</h2>
        {who ? <a href={`tel:${who.phone}`} dir="ltr" aria-label={`تماس با ${persian(who.phone)}`}><Icon name="phone" size={16} /> {persian(who.phone)}</a> : null}
      </div>
      <MessageList messages={messages} mine="salon" seen={seen} onRetry={(m) => void reply(m.text, m.key)} />
      <div className="chat__foot">
        <div className="salon__replies" role="group" aria-label="پاسخ‌های آماده">
          {replies.map((r) => (
            <span key={r} className="chip" data-mine="">
              <button type="button" onClick={() => setText(r)} title={r}>{r}</button>
              <i role="button" tabIndex={0} aria-label={`حذف پاسخ آماده: ${r}`} onClick={() => keepReplies(replies.filter((x) => x !== r))}
                onKeyDown={(e) => { if (e.key === "Enter") keepReplies(replies.filter((x) => x !== r)); }}>×</i>
            </span>
          ))}
          {text.trim() && !replies.includes(text.trim()) ? (
            <button type="button" className="chip" onClick={() => keepReplies([...replies, text.trim()])}><Icon name="plus" size={14} /> ذخیره به‌عنوان پاسخ آماده</button>
          ) : null}
        </div>
        {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
        <Composer value={text} onChange={setText} onSend={() => void reply()} label="پاسخ" placeholder="پاسخ به مشتری…" busy={busy} />
        <p className="chat__fine">
          <button type="button" className="chat__drop" onClick={async () => {
            if (!sure) { setSure(true); return; }
            try { await salonDelete(id); onGone(); } catch (error) { setProblem(problemOf(error)); }
          }}>{sure ? "مطمئنید؟ حذف همیشگی" : "حذف این گفت‌وگو"}</button>
        </p>
      </div>
    </section>
  );
}
