/**
 * Her chat with the salon (the salon's own chat: src/lib/chat.ts). The first time she gives her name and phone and sends
 * her booking (the look, its intensity, her lipstick: text she can change); then her messages and the salon's replies,
 * checked every few seconds while it is open. Text only: her photo never leaves her phone.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { ChatError, chatTime, deleteChat, myDetails, readChat, sendChat, startChat, type ChatMessage } from "@/lib/chat";

const POLL_MS = 5000;
const persian = (s: string) => s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

/** What went wrong, in her words. */
export function chatProblem(error: unknown): string {
  const code = error instanceof ChatError ? error.code : "server";
  return ({
    offline: "برای پیام به سالن اینترنت لازم است؛ وصل که شدید دوباره بفرستید.",
    name: "نام خود را بنویسید.",
    phone: "شماره تلفن درست نیست (۷ تا ۱۵ رقم).",
    text: "پیام خالی است.",
    busy: "پیام‌های زیادی فرستاده شد؛ کمی بعد دوباره امتحان کنید.",
  } as Record<string, string>)[code] ?? "پیام فرستاده نشد؛ دوباره امتحان کنید.";
}

export function SalonChat({ draft, onClose }: { draft?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);   // null: no chat yet (her details first)
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(() => myDetails()?.name ?? "");
  const [phone, setPhone] = useState(() => myDetails()?.phone ?? "");
  const [text, setText] = useState(draft ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const lastId = messages?.at(-1)?.id ?? 0;

  // her chat (if she has one), then the salon's replies every POLL_MS while the chat is open and on screen
  useEffect(() => {
    let alive = true;
    readChat().then((r) => { if (alive) setMessages(r ? r.messages : null); })
      .catch((error) => { if (alive) { setProblem(chatProblem(error)); setMessages(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!messages) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      readChat(lastId).then((r) => {
        if (r?.messages.length) setMessages((was) => [...(was ?? []), ...r.messages.filter((m) => !was?.some((x) => x.id === m.id))]);
      }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [messages, lastId]);
  useEffect(() => { list.current?.lastElementChild?.scrollIntoView({ block: "end" }); }, [messages?.length]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (!messages) setMessages(await startChat(name, phone, text));
      else { const m = await sendChat(text); setMessages((was) => [...(was ?? []), m]); }
      setText("");
    } catch (error) { setProblem(chatProblem(error)); }
    setBusy(false);
  }

  async function remove() {
    if (!sure) { setSure(true); return; }
    setBusy(true);
    try { await deleteChat(); setMessages(null); setSure(false); setText(draft ?? ""); } catch (error) { setProblem(chatProblem(error)); }
    setBusy(false);
  }

  return (
    <div className="chat" role="dialog" aria-modal="true" aria-label="گفت‌وگو با سالن" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="chat__sheet">
        <header className="chat__head">
          <div><h2>گفت‌وگو با حنانه بیوتی</h2><small>پاسخ سالن همین‌جا می‌آید</small></div>
          <Button variant="ghost" icon="close" aria-label="بستن" onClick={onClose} />
        </header>
        {loading ? <p className="chat__note" role="status">در حال باز کردن گفت‌وگو…</p> : messages ? (
          <ol className="chat__list" ref={list} aria-label="پیام‌ها" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id} className="chat__msg" data-from={m.from}>
                <span>{m.text}</span>
                <small>{m.from === "salon" ? "سالن، " : ""}{chatTime(m.at)}</small>
              </li>
            ))}
          </ol>
        ) : (
          <div className="chat__who">
            <label><span>نام</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} /></label>
            <label><span>شماره تلفن</span><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={20} /></label>
          </div>
        )}
        {!loading ? (
          <form className="chat__compose" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <label className="chat__text">
              <span className="sr-only">پیام</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={messages ? 2 : 5} maxLength={1000}
                placeholder={messages ? "پیام به سالن…" : "پیام به سالن"} />
            </label>
            {problem ? <p className="chat__problem" role="alert">{problem}</p> : null}
            <Button type="submit" variant="gold" icon="send" disabled={busy || !text.trim() || (!messages && (!name.trim() || !phone.trim()))}>
              {busy ? "در حال فرستادن…" : messages ? "فرستادن" : "ارسال برای سالن"}
            </Button>
          </form>
        ) : null}
        <p className="chat__note">
          {messages
            ? <>نام و شماره شما ({persian(myDetails()?.phone ?? phone)}) و پیام‌ها برای سالن نگه داشته می‌شود؛ عکس شما فرستاده نمی‌شود.{" "}
              <button type="button" className="chat__drop" onClick={() => void remove()} disabled={busy}>{sure ? "مطمئنید؟ حذف همیشگی" : "حذف این گفت‌وگو"}</button></>
            : "نام، شماره و پیام شما فقط برای سالن فرستاده و نگه داشته می‌شود تا با شما هماهنگ کند؛ عکس شما فرستاده نمی‌شود."}
        </p>
      </div>
    </div>
  );
}
