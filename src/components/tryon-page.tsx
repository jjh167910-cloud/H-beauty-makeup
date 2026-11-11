/**
 * This site (H-beauty-makeup): the salon app's makeup try-on on its own. The same screen as in the app
 * (sheets/tryon.tsx): her photo or the live mirror, every look on the rail, «میکاپ من», all on her phone.
 * The rest of the salon app stays in the code (VITE_SITE=salon: npm run dev:salon, and the tests).
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { styleById, MAKEUP_STYLES } from "@/data/makeup-styles";
import { recipeLines, type MyMakeup } from "@/data/my-makeup";
import { Button } from "@/components/salon/ui";

const TryOnView = lazy(() => import("@/components/salon/sheets/tryon"));

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
  const style = styleById.get("hollywood") ?? MAKEUP_STYLES[0];
  const [booking, setBooking] = useState<Booking | null>(null);
  const [copied, setCopied] = useState(false);

  /** «رزرو»: the look (or her own makeup's recipe) as text for the salon; her photo is never part of it. */
  function onBook(id: string, mine?: { name: string; recipe: MyMakeup }) {
    setCopied(false);
    setBooking(mine ? { title: mine.name === "میکاپ من" ? "میکاپ من" : `میکاپ من: ${mine.name}`, lines: recipeLines(mine.recipe) }
      : { title: `سبک: ${styleById.get(id)?.title ?? id}`, lines: [] });
  }
  async function copy() {
    if (!booking) return;
    try { await navigator.clipboard.writeText([booking.title, ...booking.lines].join("\n")); setCopied(true); } catch { setCopied(false); }
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
            <small>این متن را کپی کنید و هنگام گرفتن نوبت برای سالن بفرستید؛ عکس شما همراهش نیست.</small>
            <div className="tp__actions">
              <Button variant="secondary" icon="copy" onClick={copy}>{copied ? "کپی شد" : "کپی متن"}</Button>
              <Button variant="gold" onClick={() => setBooking(null)}>بستن</Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
