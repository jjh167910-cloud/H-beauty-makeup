/**
 * This site (H-beauty-makeup): the salon's makeup try-on. Her photo or the live mirror, every look on the rail,
 * «میکاپ من» (her own makeup), all on her phone; «رزرو» gives the look (its intensity and lipstick) or her recipe as text
 * for the salon: sent through the phone's share sheet to the chat she picks, or copied. Her photo is never part of it.
 * `?look=<id>` opens it on that look (ids in src/data/makeup-styles.ts); otherwise on Hollywood glam.
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { styleById, MAKEUP_STYLES } from "@/data/makeup-styles";
import { recipeLines, type MyMakeup } from "@/data/my-makeup";
import { Button } from "@/components/ui";

const TryOnView = lazy(() => import("@/components/tryon"));

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

  /** «رزرو»: the look (with how she set it: `details`) or her own makeup's recipe as text for the salon; never her photo. */
  function onBook(id: string, mine?: { name: string; recipe: MyMakeup }, details: string[] = []) {
    setCopied(false);
    setBooking(mine ? { title: mine.name === "میکاپ من" ? "میکاپ من" : `میکاپ من: ${mine.name}`, lines: recipeLines(mine.recipe) }
      : { title: `سبک: ${styleById.get(id)?.title ?? id}`, lines: details });
  }
  const bookingText = (b: Booking) => ["درخواست نوبت میکاپ · حنانه بیوتی", b.title, ...b.lines].join("\n");
  /** The phone's share sheet: she picks the salon's chat (nothing is sent by the app itself). */
  const canSend = typeof navigator.share === "function";
  async function send() {
    if (!booking) return;
    try { await navigator.share({ text: bookingText(booking) }); } catch { /* (she closed the sheet) */ }
  }
  async function copy() {
    if (!booking) return;
    try { await navigator.clipboard.writeText(bookingText(booking)); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <main className="tp">
      <header className="tp__head">
        <span className="tp__brand">حنانه بیوتی · H-beauty</span>
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
            <small>{canSend ? "این متن را برای سالن بفرستید (در پیام‌رسانی که با سالن در ارتباطید) یا کپی کنید؛ عکس شما همراهش نیست؛ اگر خواستید خودتان پیوست کنید."
              : "این متن را کپی کنید و هنگام گرفتن نوبت برای سالن بفرستید؛ عکس شما همراهش نیست."}</small>
            <div className="tp__actions">
              {canSend ? <Button variant="secondary" icon="share" onClick={() => void send()}>ارسال برای سالن</Button> : null}
              <Button variant="secondary" icon="copy" onClick={copy}>{copied ? "کپی شد" : "کپی متن"}</Button>
              <Button variant="gold" onClick={() => setBooking(null)}>بستن</Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
