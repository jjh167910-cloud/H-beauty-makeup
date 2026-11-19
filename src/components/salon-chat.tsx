/**
 * Her chat with the salon (the salon's own chat: src/lib/chat.ts), open from every screen («گفت‌وگو با سالن» at the
 * top) and from a booking. Full screen on a phone, like a messaging app: the salon's name and logo, a welcome, quick
 * topics to start from; her name and phone the first time; her messages with their state (sending, sent, seen by the
 * salon; not sent: send again) and the salon's replies under their day, checked every few seconds while it is open;
 * a booking as a card with the look's photo. She can turn on a notification for the salon's replies and delete her chat.
 * Text only: her photo never leaves her phone.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Composer, MessageList, type ShownMessage } from "@/components/chat-parts";
import {
  ChatError, canNotify, deleteChat, hasChat, herNotifications, herNotifying, myDetails, readChat, sendChat, startChat,
} from "@/lib/chat";

const POLL_MS = 5000;
/** Quick topics: a tap starts her message (she finishes it). */
const TOPICS: Array<[string, string]> = [
  ["رزرو نوبت", "سلام، می‌خواستم برای میکاپ نوبت بگیرم. "],
  ["قیمت‌ها", "سلام، قیمت میکاپ را می‌خواستم بدانم. "],
  ["میکاپ عروس", "سلام، برای میکاپ عروس سؤال داشتم. "],
  ["سؤال درباره یک سبک", "سلام، درباره‌ی این سبک سؤال داشتم: "],
];

/** What went wrong, in her words. */
export function chatProblem(error: unknown): string {
  const code = error instanceof ChatError ? error.code : "server";
  return ({
    offline: "اینترنت وصل نیست؛ وصل که شدید دوباره بفرستید.",
    name: "نام خود را بنویسید.",
    phone: "شماره تلفن درست نیست (۷ تا ۱۵ رقم).",
    text: "پیام خالی است.",
    busy: "پیام‌های زیادی فرستاده شد؛ کمی بعد دوباره امتحان کنید.",
    "no-push": "این گوشی اعلان وب ندارد. روی آیفون، اول این صفحه را با «افزودن به صفحه اصلی» نصب کنید.",
    denied: "اجازه‌ی اعلان داده نشد؛ از تنظیمات مرورگر اجازه دهید.",
  } as Record<string, string>)[code] ?? "پیام فرستاده نشد؛ دوباره امتحان کنید.";
}

export function SalonChat({ draft, onClose }: { draft?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [started, setStarted] = useState(hasChat);
  const [loading, setLoading] = useState(hasChat);
  const [seen, setSeen] = useState(0);
  const [name, setName] = useState(() => myDetails()?.name ?? "");
  const [phone, setPhone] = useState(() => myDetails()?.phone ?? "");
  const [text, setText] = useState(draft ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [notify, setNotify] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const lastId = messages.filter((m) => !m.pending && !m.failed).at(-1)?.id ?? 0;

  // her chat (if she has one), then the salon's replies every POLL_MS while it is open and on screen
  useEffect(() => {
    let alive = true;
    if (hasChat()) {
      readChat().then((r) => { if (!alive) return; if (r) { setMessages(r.messages); setSeen(r.seen); } else setStarted(false); })
        .catch((error) => { if (alive) setProblem(chatProblem(error)); })
        .finally(() => { if (alive) setLoading(false); });
      void herNotifying().then((on) => { if (alive) setNotify(on); });
    }
    const page = document.documentElement, back = page.style.overflow;
    page.style.overflow = "hidden";                               // (the page under the chat stays put)
    sheet.current?.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
    return () => { alive = false; page.style.overflow = back; };
  }, []);
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      readChat(lastId).then((r) => {
        if (!r) return;
        setSeen(r.seen);
        if (r.messages.length) setMessages((was) => [...was.filter((m) => !r.messages.some((x) => x.id === m.id)), ...r.messages].sort(order));
      }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [started, lastId]);
  // (Escape closes it)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);

  async function deliver(body: string, key = `k${Date.now()}`) {
    setProblem(null);
    setMessages((was) => [...was.filter((m) => m.key !== key), { id: Number.MAX_SAFE_INTEGER, from: "customer", text: body, at: Date.now(), pending: true, key }]);
    try {
      if (!started) {
        const first = await startChat(name, phone, body);
        setStarted(true);
        setMessages((was) => [...was.filter((m) => m.key !== key), ...first]);
      } else {
        const m = await sendChat(body);
        setMessages((was) => [...was.filter((x) => x.key !== key), m].sort(order));
      }
    } catch (error) {
      const code = error instanceof ChatError ? error.code : "";
      // (her details or her text refused: back to her to fix; anything else: kept, to send again)
      if (code === "name" || code === "phone" || code === "text") { setMessages((was) => was.filter((m) => m.key !== key)); setText(body); }
      else setMessages((was) => was.map((m) => (m.key === key ? { ...m, pending: false, failed: true } : m)));
      setProblem(chatProblem(error));
    }
  }

  async function submit() {
    if (busy || !text.trim()) return;
    if (!started && (!name.trim() || !phone.trim())) { setProblem("برای پاسخ سالن، نام و شماره تلفن خود را بنویسید."); return; }
    const body = text;
    setText("");
    setBusy(true);
    await deliver(body);
    setBusy(false);
  }

  async function toggleNotify() {
    setProblem(null);
    try { setNotify(await herNotifications(!notify)); } catch (error) { setProblem(chatProblem(error)); }
  }

  async function remove() {
    if (!sure) { setSure(true); return; }
    setBusy(true);
    try { await deleteChat(); setMessages([]); setStarted(false); setSure(false); setNotify(false); setText(draft ?? ""); }
    catch (error) { setProblem(chatProblem(error)); }
    setBusy(false);
  }

  const welcome = (
    <li className="chat__msg chat__welcome" data-from="salon">
      <span className="chat__text-body">سلام، به حنانه بیوتی خوش آمدید. درباره‌ی نوبت، قیمت یا هر سبکی که دوست دارید بپرسید؛ پاسخ ما همین‌جا می‌آید.</span>
    </li>
  );

  return (
    <div className="chat" role="dialog" aria-modal="true" aria-label="گفت‌وگو با سالن" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="chat__sheet" ref={sheet}>
        <header className="chat__bar">
          <button type="button" className="chat__icon" aria-label="بستن" onClick={onClose}><Icon name="back" size={22} /></button>
          <img className="chat__avatar" src="/icons/hananeh-signature.svg" alt="" />
          <div className="chat__who-is">
            <h2>حنانه بیوتی</h2>
            <small>سالن زیبایی · پاسخ همین‌جا می‌آید</small>
          </div>
          {started && canNotify() ? (
            <button type="button" className="chat__icon" aria-pressed={notify} onClick={() => void toggleNotify()}
              aria-label={notify ? "اعلان پاسخ سالن روشن است" : "روشن کردن اعلان پاسخ سالن"}>
              <Icon name={notify ? "bell" : "bell-off"} size={21} weight={notify ? "fill" : "regular"} />
            </button>
          ) : null}
        </header>

        {loading ? <p className="chat__loading" role="status">در حال باز کردن گفت‌وگو…</p>
          : <MessageList messages={messages} mine="customer" seen={seen} intro={welcome} onRetry={(m) => void deliver(m.text, m.key)} />}

        <div className="chat__foot">
          {!started && !messages.length && !text.trim() ? (
            <div className="chat__topics" role="group" aria-label="موضوع پیام">
              {TOPICS.map(([label, start]) => <button key={label} type="button" className="chip" onClick={() => setText(start)}>{label}</button>)}
            </div>
          ) : null}
          {!started ? (
            <div className="chat__details" role="group" aria-label="مشخصات شما برای سالن">
              <label><span>نام</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} /></label>
              <label><span>شماره تلفن</span><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={20} /></label>
            </div>
          ) : null}
          {problem ? <p className="chat__problem" role="alert">{problem}</p> : null}
          <Composer value={text} onChange={setText} onSend={() => void submit()} label="پیام" busy={busy}
            placeholder={started ? "پیام…" : "پیام خود را بنویسید…"} sendLabel={started ? "فرستادن" : "ارسال برای سالن"} />
          <p className="chat__fine">
            {started ? "نام، شماره و پیام‌های شما فقط برای سالن نگه داشته می‌شود؛ عکس شما فرستاده نمی‌شود. "
              : "نام، شماره و پیام شما فقط برای سالن فرستاده می‌شود تا با شما هماهنگ کند؛ عکس شما فرستاده نمی‌شود."}
            {started ? <button type="button" className="chat__drop" onClick={() => void remove()} disabled={busy}>{sure ? "مطمئنید؟ حذف همیشگی" : "حذف این گفت‌وگو"}</button> : null}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Sent messages by id; one still going or not sent after them. */
function order(a: ShownMessage, b: ShownMessage) { return a.id - b.id || a.at - b.at; }
