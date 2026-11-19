/**
 * The salon chat's message list, the same in her chat and the salon's inbox: messages under their day («امروز»,
 * «دیروز», a date), each with its time; a booking from the try-on as a card with the look's catalog photo; the side's
 * own messages with their state (sending, sent, seen by the other side, not sent: tap to send again).
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { lookPhoto } from "@/data/makeup-photos";
import { bookingCard, chatDay, chatTime, type ChatMessage } from "@/lib/chat";

/** A message of hers or the salon's: sent (an id), or still going (`pending`) or not sent (`failed`, a local key). */
export type ShownMessage = ChatMessage & { pending?: boolean; failed?: boolean; key?: string };

export function MessageList({ messages, mine, seen, intro, onRetry, label = "پیام‌ها" }: {
  messages: ShownMessage[];
  /** Whose messages are this side's own (on the start side, with their state). */
  mine: "customer" | "salon";
  /** The last of this side's messages the other side has read. */
  seen: number;
  /** Before the messages (her chat's welcome). */
  intro?: ReactNode;
  onRetry?: (m: ShownMessage) => void;
  label?: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [stick, setStick] = useState(true);
  // (new messages scroll into view, unless she scrolled up to read)
  useEffect(() => {
    const el = list.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [messages.length, messages.at(-1)?.id, stick]);
  let day = "";
  return (
    <ol className="chat__list" ref={list} aria-label={label} aria-live="polite"
      onScroll={(e) => { const el = e.currentTarget; setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}>
      {intro}
      {messages.map((m) => {
        const d = chatDay(m.at), head = d !== day;
        day = d;
        const own = m.from === mine, card = bookingCard(m.text);
        const state = !own ? null : m.failed ? "failed" : m.pending ? "sending" : m.id <= seen ? "seen" : "sent";
        return (
          <Fragment key={m.key ?? m.id}>
            {head ? <li className="chat__day" aria-hidden="true"><span>{d}</span></li> : null}
            <li className="chat__msg" data-from={m.from} data-own={own ? "" : undefined} data-state={state ?? undefined}>
              {card ? (
                <div className="chat__card">
                  {card.look ? <img src={lookPhoto(card.look, "sm")} alt="" loading="lazy" /> : null}
                  <div>
                    <small>درخواست نوبت میکاپ</small>
                    <strong>{card.title.replace(/^سبک:\s*/, "")}</strong>
                    {card.lines.map((line) => <span key={line}>{line}</span>)}
                  </div>
                </div>
              ) : <span className="chat__text-body">{m.text}</span>}
              <span className="chat__meta">
                {chatTime(m.at)}
                {state === "sending" ? <span aria-label="در حال ارسال"><Icon name="sending" size={13} /></span>
                  : state === "seen" ? <span aria-label="دیده شد" className="chat__seen"><Icon name="seen" size={14} weight="bold" /></span>
                  : state === "sent" ? <span aria-label="ارسال شد"><Icon name="sent" size={13} weight="bold" /></span> : null}
              </span>
              {state === "failed" ? (
                <button type="button" className="chat__retry" onClick={() => onRetry?.(m)}>
                  <Icon name="retry" size={14} /> ارسال نشد؛ دوباره
                </button>
              ) : null}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** A message box that grows with its text (to six lines); on a computer Enter sends and Shift+Enter starts a line. */
export function Composer({ value, onChange, onSend, placeholder, label, busy, sendLabel = "فرستادن", disabled }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; label: string;
  busy?: boolean; sendLabel?: string; disabled?: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 28 + 20)}px`;
  }, [value]);
  const fine = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;
  return (
    <form className="chat__compose" onSubmit={(e) => { e.preventDefault(); if (!disabled && value.trim()) onSend(); }}>
      <textarea ref={box} value={value} rows={1} maxLength={1000} placeholder={placeholder} aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (fine && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!disabled && value.trim()) onSend(); } }} />
      <button type="submit" className="chat__send" aria-label={sendLabel} disabled={disabled || busy || !value.trim()}>
        <Icon name="send" size={20} weight="fill" />
      </button>
    </form>
  );
}
