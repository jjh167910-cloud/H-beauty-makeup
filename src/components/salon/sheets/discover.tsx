import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Icon } from "../icons";
import { toast } from "sonner";
import { diverseOrder, families, labelOf, lookSrc, lookThumb, matchesFamily, persian, type Family } from "@/data/catalog";
import { SALON } from "@/data/salon";
import { photoObjectPosition } from "@/data/photo-focal";
import { useSalon } from "@/lib/salon-store";
import { shareText } from "@/lib/share";
import { Button, IconButton, haptic, useSalonActions } from "../ui";

const HINT_KEY = "hananeh-discover-hint";

function serviceFor(family: Family) {
  return family.category === "updo" || family.category === "braid" ? "event-styling" : family.tags.includes("color") ? "bespoke-balayage" : "signature-cut";
}

/** Full-screen, vertically snapping feed of looks — swipe up for the next, double-tap to save. */
export function Discover({ open, startId, onClose }: { open: boolean; startId: number; onClose: () => void }) {
  const { openSheet, openBooking } = useSalonActions();
  const filter = useSalon((state) => state.filter);
  const query = useSalon((state) => state.query);
  const savedOnly = useSalon((state) => state.savedOnly);
  const favs = useSalon((state) => state.favs);
  const compare = useSalon((state) => state.compare);
  const toggleFav = useSalon((state) => state.toggleFav);
  const toggleCompare = useSalon((state) => state.toggleCompare);
  const scroller = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const lastTap = useRef({ time: 0, x: 0, y: 0 });
  const [hint, setHint] = useState(() => {
    try {
      return !localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });

  // Snapshot the list once so saving a look doesn't reshuffle the feed.
  const list = useMemo(() => {
    const favSet = new Set(useSalon.getState().favs);
    const filtered = diverseOrder(families.filter((family) => matchesFamily(family, query, filter, savedOnly, favSet)));
    return filtered.some((family) => family.id === startId) ? filtered : diverseOrder(families);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [active, setActive] = useState(() => Math.max(0, list.findIndex((family) => family.id === startId)));

  useLayoutEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = active * node.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>('button[aria-label="بستن"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((node) => !node.closest("[inert]") && node.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!dialog.current.contains(active) || (event.shiftKey && active === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      if (priorFocus?.isConnected) priorFocus.focus();
    };
  }, [open, onClose]);

  function onScroll() {
    const node = scroller.current;
    if (!node) return;
    const index = Math.round(node.scrollTop / node.clientHeight);
    if (index !== active) {
      setActive(index);
      if (hint) {
        setHint(false);
        try {
          localStorage.setItem(HINT_KEY, "1");
        } catch {
          /* ignore */
        }
      }
    }
  }

  function onTap(event: PointerEvent<HTMLDivElement>, family: Family) {
    const now = performance.now();
    const { time, x, y } = lastTap.current;
    const near = Math.hypot(event.clientX - x, event.clientY - y) < 40;
    lastTap.current = { time: now, x: event.clientX, y: event.clientY };
    if (now - time > 320 || !near) return;
    lastTap.current.time = 0;
    haptic();
    if (!useSalon.getState().favs.includes(family.id)) {
      toggleFav(family.id);
      toast("مدل به ذخیره‌ها اضافه شد.");
    }
  }

  async function share(family: Family) {
    const result = await shareText(`${family.name} (${family.code}) — لوک‌بوک ${SALON.name}`);
    if (result === "copied") toast("نام و کد مدل کپی شد.");
  }

  const current = list[active];

  return (
    <div ref={dialog} className="discover" data-closed={open ? undefined : ""} role="dialog" aria-modal="true" aria-label="کاوش لوک‌ها">
      <div ref={scroller} className="discover__scroll" onScroll={onScroll}>
        {list.map((family, index) => {
          const near = Math.abs(index - active) <= 2;
          // Only slides around the active one carry content; the rest are empty snap stops.
          if (!near) return <section key={family.id} className="discover__slide" aria-hidden="true" />;
          const saved = favs.includes(family.id);
          const picked = compare.includes(family.id);
          return (
            <section key={family.id} className="discover__slide" inert={index !== active} aria-hidden={index !== active} aria-roledescription="اسلاید" aria-label={`${persian(index + 1)} از ${persian(list.length)}: ${family.name}`}>
              <div className="discover__stage" onPointerUp={(event) => onTap(event, family)}>
                <div className="discover__frame" data-morph={family.id === startId ? "" : undefined}>
                  <img src={lookThumb(family.repId)} alt={family.name} draggable={false} style={{ objectPosition: photoObjectPosition(lookThumb(family.repId), "center") }} />
                  {index === active ? <img className="discover__full" src={lookSrc(family.repId)} alt="" style={{ objectPosition: photoObjectPosition(lookSrc(family.repId), "center") }} aria-hidden="true" draggable={false} onLoad={(event) => event.currentTarget.setAttribute("data-loaded", "")} /> : null}
                </div>
              </div>

              <div className="discover__info">
                <p className="t-caption"><span dir="ltr">{family.code}</span> · {labelOf(family.category)}</p>
                <h2 className="t-title-1 mt-1">{family.name}</h2>
                <div className="mt-4 flex gap-2">
                  <Button variant="gold" icon="book" onClick={() => openBooking({ service: serviceFor(family), lookId: family.id })}>درخواست این استایل</Button>
                  <Button variant="glass" icon="info" onClick={() => openSheet({ kind: "look", id: family.id })}>جزئیات</Button>
                </div>
              </div>

              <div className="discover__rail">
                <IconButton icon="heart" variant="glass-dark" size="lg" pressed={saved} label={saved ? "حذف از ذخیره‌ها" : "ذخیره"} onClick={() => { haptic(); toggleFav(family.id); }} />
                <IconButton icon="compare" variant="glass-dark" size="lg" pressed={picked} label={picked ? "حذف از مقایسه" : "افزودن به مقایسه"} onClick={() => { haptic(); if (toggleCompare(family.id) === "limit") toast("برای مقایسه حداکثر سه مدل انتخاب کنید."); }} />
                <IconButton icon="share" variant="glass-dark" size="lg" label="اشتراک‌گذاری" onClick={() => share(family)} />
              </div>
            </section>
          );
        })}
      </div>

      <div className="discover__top">
        <IconButton icon="close" variant="glass-dark" label="بستن" onClick={onClose} />
        <div className="discover__progress" aria-hidden="true">
          <span style={{ width: `${((active + 1) / list.length) * 100}%` }} />
        </div>
        <span className="glass-dark t-caption t-numeric rounded-full px-3 py-1.5" aria-live="polite">
          {persian(active + 1)} / {persian(list.length)}
        </span>
      </div>

      {hint && current ? (
        <div className="discover__hint" aria-hidden="true">
          <Icon name="up" size={18} />
          <span>برای مدل بعدی بالا بکشید · دو ضربه برای ذخیره</span>
        </div>
      ) : null}

    </div>
  );
}
