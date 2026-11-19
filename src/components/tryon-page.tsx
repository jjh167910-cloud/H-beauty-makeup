/**
 * This site (H-beauty-makeup): the salon's makeup try-on. Her photo or the live mirror, every look on the rail,
 * «میکاپ من» (her own makeup), all on her phone; «رزرو» gives the look (its intensity and lipstick) or her recipe as text
 * for the salon: sent in the salon's own chat (src/components/salon-chat.tsx: with her name and phone; the salon answers
 * there), or copied. Her photo is never part of it.
 * `?look=<id>` opens it on that look (ids in src/data/makeup-styles.ts); otherwise on Hollywood glam.
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { hasChat, unreadReplies } from "@/lib/chat";
import { styleById, MAKEUP_STYLES } from "@/data/makeup-styles";
import { recipeLines, type MyMakeup } from "@/data/my-makeup";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

const TryOnView = lazy(() => import("@/components/tryon"));
const SalonChat = lazy(() => import("@/components/salon-chat").then((m) => ({ default: m.SalonChat })));

/** The system's light or dark (the app's colours follow data-theme). */
function useSystemTheme() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = media.matches ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", media.matches ? "#20171c" : "#fff8f7");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
}

type Booking = { title: string; lines: string[] };

export function TryOnPage() {
  useSystemTheme();
  const [style] = useState(() => styleById.get(new URLSearchParams(location.search).get("look") ?? "") ?? styleById.get("hollywood") ?? MAKEUP_STYLES[0]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [copied, setCopied] = useState(false);
  /** Her chat with the salon: open (with this draft), and the salon's replies she hasn't seen. */
  const [chat, setChat] = useState<{ draft?: string } | null>(null);
  const [replies, setReplies] = useState(0);
  useEffect(() => {
    if (chat || !hasChat()) return;
    const check = () => { if (!document.hidden) void unreadReplies().then(setReplies); };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [chat]);

  /** «رزرو»: the look (with how she set it: `details`) or her own makeup's recipe as text for the salon; never her photo. */
  function onBook(id: string, mine?: { name: string; recipe: MyMakeup }, details: string[] = []) {
    setCopied(false);
    setBooking(mine ? { title: mine.name === "میکاپ من" ? "میکاپ من" : `میکاپ من: ${mine.name}`, lines: recipeLines(mine.recipe) }
      : { title: `سبک: ${styleById.get(id)?.title ?? id}`, lines: details });
  }
  const bookingText = (b: Booking) => ["درخواست نوبت میکاپ · حنانه بیوتی", b.title, ...b.lines].join("\n");
  async function copy() {
    if (!booking) return;
    try { await navigator.clipboard.writeText(bookingText(booking)); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <main className="tp">
      <header className="tp__head">
        <div className="tp__top">
          <span className="tp__brand">حنانه بیوتی · H-beauty</span>
          {hasChat() || replies ? (
            <button type="button" className="tp__chat" onClick={() => { setChat({}); setReplies(0); }}
              aria-label={replies ? `گفت‌وگو با سالن، ${replies} پیام تازه` : "گفت‌وگو با سالن"}>
              <Icon name="chat" size={18} /> گفت‌وگو با سالن{replies ? <b>{replies.toLocaleString("fa-IR")}</b> : null}
            </button>
          ) : null}
        </div>
        <h1>امتحان میکاپ روی چهره خودتان</h1>
        <p>سبک‌های سالن را روی عکس یا دوربین خودتان ببینید، یا با «میکاپ من» میکاپ خودتان را بسازید.</p>
      </header>
      <Suspense fallback={<div className="tryon__loading" role="status">در حال آماده‌سازی…</div>}>
        <TryOnView style={style} onBook={onBook} />
      </Suspense>
      {booking ? (
        <div className="tp__book" role="dialog" aria-modal="true" aria-label="درخواست رزرو" onClick={(e) => { if (e.target === e.currentTarget) setBooking(null); }}>
          <div>
            <h2>درخواست رزرو</h2>
            <strong>{booking.title}</strong>
            {booking.lines.length ? <ul>{booking.lines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
            <small>این درخواست را در گفت‌وگوی خود سالن بفرستید تا سالن با شما هماهنگ کند (با نام و شماره‌تان)، یا متنش را کپی کنید؛ عکس شما همراهش نیست.</small>
            <div className="tp__actions">
              <Button variant="secondary" icon="copy" onClick={copy}>{copied ? "کپی شد" : "کپی متن"}</Button>
              <Button variant="secondary" onClick={() => setBooking(null)}>بستن</Button>
              <Button variant="gold" icon="chat" onClick={() => { setChat({ draft: bookingText(booking) }); setBooking(null); }}>ارسال برای سالن</Button>
            </div>
          </div>
        </div>
      ) : null}
      {chat ? (
        <Suspense fallback={null}>
          <SalonChat draft={chat.draft} onClose={() => setChat(null)} />
        </Suspense>
      ) : null}
    </main>
  );
}
