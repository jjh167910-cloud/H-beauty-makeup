import { useEffect, useState, type CSSProperties } from "react";
import { familyById, lookThumb, persian, type Family } from "@/data/catalog";
import { formatMinutes, formatPrice, summarize } from "@/data/salon";
import { useSalon, type Tab } from "@/lib/salon-store";
import { Icon, type IconName } from "./icons";
import { BrandMark, Wordmark } from "./logo";
import { BackgroundMusicControl } from "./background-music";
import { Button, IconButton, haptic, useSalonActions } from "./ui";

const TITLES: Partial<Record<Tab, string>> = {
  services: "منوی خدمات",
  looks: "گالری مدل مو",
  nails: "آتلیه ناخن",
  bookings: "درخواست‌های من",
  me: "حساب من",
  design: "سیستم طراحی",
};

export function TopBar() {
  const tab = useSalon((state) => state.tab);
  const name = useSalon((state) => state.profile.name.trim());
  const { go } = useSalonActions();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const title = TITLES[tab];

  return (
    <header className="topbar" data-scrolled={scrolled ? "" : undefined}>
      <button type="button" className="flex min-h-11 items-center gap-2.5 text-start" onClick={() => go("home")} aria-label="حنانه بیوتی، خانه">
        <BrandMark className="h-10 w-8 text-[1.15rem]" />
        {title ? (
          <span className="grid">
            <strong className="t-headline">{title}</strong>
            <span className="t-caption text-ink-2">حنانه بیوتی</span>
          </span>
        ) : (
          <Wordmark className="text-[1.4rem]" latin={false} />
        )}
      </button>
      <div className="flex items-center gap-1">
        <BackgroundMusicControl />
      <button
        type="button"
        onClick={() => go("me")}
        aria-label="پروفایل"
        aria-current={tab === "me" ? "page" : undefined}
        className="icon-btn"
        data-variant={tab === "me" ? "solid" : undefined}
      >
        {name ? <span className="font-calligraphy text-lg leading-none">{name.slice(0, 1)}</span> : <Icon name="profile" size={20} />}
      </button>
      </div>
    </header>
  );
}

const ITEMS: Array<{ tab: Tab; label: string; icon: IconName }> = [
  { tab: "home", label: "خانه", icon: "home" },
  { tab: "services", label: "خدمات", icon: "services" },
  { tab: "looks", label: "مدل‌ها", icon: "looks" },
  { tab: "bookings", label: "نوبت‌ها", icon: "bookings" },
];

/** True while the user scrolls down past the fold (tab bar minimises). */
function useMinimized() {
  const [min, setMin] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setMin(y > last && y > 160);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return min;
}

export function TabBar() {
  const tab = useSalon((state) => state.tab);
  const pending = useSalon((state) => state.bookings.filter((item) => !item.sent).length);
  const { go, openBooking } = useSalonActions();
  const minimized = useMinimized();
  // Grid column of the active tab; the centre column is the booking button.
  const index = ITEMS.findIndex((item) => item.tab === tab);
  const column = index < 0 ? -1 : index < 2 ? index : index + 1;

  const render = (item: (typeof ITEMS)[number]) => {
    const active = tab === item.tab;
    return (
      <button key={item.tab} type="button" className="tabbar__item" aria-current={active ? "page" : undefined} onClick={() => { haptic(); go(item.tab); }}>
        <span className="relative">
          <Icon name={item.icon} size={23} weight={active ? "fill" : "light"} />
          {item.tab === "bookings" && pending ? <span className="tabbar__dot" aria-label={`${persian(pending)} درخواست ارسال‌نشده`} /> : null}
        </span>
        <span className="tabbar__label">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="tabbar glass" data-minimized={minimized ? "" : undefined} aria-label="پیمایش اصلی" style={{ "--col": column } as CSSProperties}>
      {column >= 0 ? <span className="tabbar__lens" aria-hidden="true" /> : null}
      {ITEMS.slice(0, 2).map(render)}
      <button type="button" className="tabbar__book foil" onClick={() => { haptic(); openBooking(); }} aria-label="درخواست نوبت">
        <Icon name="book" size={21} weight="regular" />
        <span className="salon24-tabbar-book-label">درخواست</span>
      </button>
      {ITEMS.slice(2).map(render)}
    </nav>
  );
}

export function Docks() {
  const tab = useSalon((state) => state.tab);
  const cart = useSalon((state) => state.cart);
  const compare = useSalon((state) => state.compare);
  const clearCompare = useSalon((state) => state.clearCompare);
  const setCart = useSalon((state) => state.setCart);
  const { openSheet } = useSalonActions();

  if (cart.length && (tab === "home" || tab === "services")) {
    const { items, minutes, price, hasUnpriced } = summarize(cart);
    return (
      <div className="dock glass" role="region" aria-label="خدمات انتخاب‌شده">
        <IconButton icon="close" label="پاک کردن انتخاب‌ها" size="sm" variant="tonal" onClick={() => setCart([])} />
        <div className="min-w-0 flex-1">
          <p className="t-footnote font-medium">{persian(items.length)} خدمت · {formatMinutes(minutes)}</p>
          <p className="t-caption truncate text-ink-2">{price ? `از ${formatPrice(price)} تومان` : "قیمت پس از مشاوره"}{hasUnpriced && price ? " + مشاوره" : ""}</p>
        </div>
        <Button variant="gold" size="sm" onClick={() => openSheet({ kind: "booking" })}>تکمیل درخواست</Button>
      </div>
    );
  }

  if (compare.length && (tab === "looks" || tab === "me")) {
    const selected = compare.map((id) => familyById.get(id)).filter((family): family is Family => Boolean(family));
    return (
      <div className="dock glass" role="region" aria-label="مقایسه">
        <div className="flex -space-x-3 rtl:space-x-reverse">
          {selected.map((family) => (
            <img key={family.id} src={lookThumb(family.repId)} alt="" className="size-10 rounded-full object-cover ring-2 ring-surface" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="t-footnote font-medium">مقایسه</p>
          <p className="t-caption text-ink-2">{persian(selected.length)} از ۳ مدل</p>
        </div>
        <Button variant="ghost" size="sm" onClick={clearCompare}>پاک کردن</Button>
        <Button variant="gold" size="sm" onClick={() => openSheet({ kind: "compare" })}>مشاهده</Button>
      </div>
    );
  }

  return null;
}
