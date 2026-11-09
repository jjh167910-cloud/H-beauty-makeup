import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "sonner";
import { TABS, useSalon, type Tab } from "@/lib/salon-store";
import { nailStyleFromHash, nailKindFromHash } from "@/data/nail-links";
import { withTransition } from "@/lib/transition";
import { Docks, TabBar, TopBar } from "./chrome";
import { HomeScreen } from "./screens/home";
import { ServicesScreen } from "./screens/services";
import { LooksScreen } from "./screens/looks";
import { MakeupScreen } from "./screens/makeup";
import { NailsScreen } from "./screens/nails";
import { BookingsScreen } from "./screens/bookings";
import { MeScreen } from "./screens/me";
import { DesignScreen } from "./screens/design";
import { IconProvider } from "./icons";
import { Sheets } from "./sheets";
import { Welcome } from "./welcome";
import { SalonProvider, type BookingIntent, type SalonActions, type SheetState } from "./ui";

function tabFromHash(): Tab {
  const key = window.location.hash.replace(/^#\/?/, "").split("?")[0] as Tab;
  return TABS.includes(key) ? key : "home";
}

function useTheme() {
  const theme = useSalon((state) => state.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#20171c" : "#fff8f7");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

/** Connectivity is only an indicator: cached pages and images vary by device. */
function OfflineNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
    };
  }, []);
  return online ? null : (
    <p className="atelier-offline" role="status">
      حالت آفلاین · فقط صفحات و تصاویرِ ذخیره‌شده در این دستگاه در دسترس‌اند.
    </p>
  );
}

/** Failure to write browser storage must never be silently presented as success. */
function StorageNotice() {
  const failed = useSalon((state) => state.storageError);
  return failed ? (
    <p className="atelier-offline" role="alert">
      ذخیره‌سازی این دستگاه با خطا روبه‌رو شد. اطلاعات جدید ممکن است پس از بستن برنامه باقی نمانند؛ فضای ذخیره‌سازی یا تنظیمات مرورگر را بررسی کنید.
    </p>
  ) : null;
}

export function SalonApp() {
  const hydrate = useSalon((state) => state.hydrate);
  const tab = useSalon((state) => state.tab);
  const setTab = useSalon((state) => state.setTab);
  const showWelcome = useSalon((state) => state.hydrated && !state.welcomed);
  const [sheet, setSheet] = useState<SheetState>(null);
  const sheetRef = useRef<SheetState>(null);
  const scrolls = useRef<Partial<Record<Tab, number>>>({});

  useTheme();

  useEffect(() => {
    hydrate();
    setTab(tabFromHash());
  }, [hydrate, setTab]);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  // Sheet entries include a validated reference, so Back closes the dialog
  // and Forward can reopen the exact same design. No extra network required.
  useEffect(() => {
    const onPop = () => {
      const state = window.history.state as { sheet?: boolean; sheetState?: SheetState } | null;
      let target: SheetState = null;
      if (state?.sheet) {
        const linkedId = nailStyleFromHash(window.location.hash);
        if (state.sheetState) target = state.sheetState;
        else if (linkedId) target = { kind: "nail", id: linkedId };
      }
      sheetRef.current = target;
      setSheet(target);
      const next = tabFromHash();
      if (next !== useSalon.getState().tab) {
        const current = useSalon.getState().tab;
        scrolls.current[current] = window.scrollY;
        withTransition(() => setTab(next), TABS.indexOf(next) > TABS.indexOf(current) ? "forward" : "back");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setTab]);

  useLayoutEffect(() => {
    window.scrollTo({ top: scrolls.current[tab] ?? 0, behavior: "instant" });
  }, [tab]);

  const openSheet = useCallback((next: Exclude<SheetState, null>) => {
    if (!sheetRef.current) window.history.pushState({ sheet: true, sheetState: next }, "");
    else if ((window.history.state as { sheet?: boolean } | null)?.sheet)
      window.history.replaceState({ sheet: true, sheetState: next }, "");
    sheetRef.current = next;
    setSheet(next);
  }, []);

  // An external nail deep link needs a local gallery history entry. Without
  // this, closing a directly linked sheet can navigate out of the salon.
  // Keep the shared hash in the forward entry, so Forward restores the style.
  useEffect(() => {
    const id = nailStyleFromHash(window.location.hash);
    if (!id) return;
    const linkedUrl = window.location.href;
    window.history.replaceState(null, "", nailKindFromHash(window.location.hash)==="pedicure" ? "#/nails?kind=pedicure" : "#/nails");
    const next: Exclude<SheetState, null> = { kind: "nail", id };
    window.history.pushState({ sheet: true, sheetState: next }, "", linkedUrl);
    sheetRef.current = next;
    setSheet(next);
  }, []);

  const closeSheet = useCallback(() => {
    if (!sheetRef.current) return;
    sheetRef.current = null;
    setSheet(null);
    if ((window.history.state as { sheet?: boolean } | null)?.sheet) window.history.back();
  }, []);

  const actions = useMemo<SalonActions>(
    () => ({
      go: (next) => {
        const current = useSalon.getState().tab;
        const hash = next === "home" ? "#/" : `#/${next}`;
        if (sheetRef.current) {
          // Replace the sheet's history entry so back doesn't reopen it.
          sheetRef.current = null;
          setSheet(null);
          window.history.replaceState(null, "", hash);
        } else if (current !== next) {
          window.history.pushState(null, "", hash);
        }
        if (current === next) {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        scrolls.current[current] = window.scrollY;
        scrolls.current[next] = 0;
        withTransition(() => setTab(next), TABS.indexOf(next) > TABS.indexOf(current) ? "forward" : "back");
      },
      openSheet,
      closeSheet,
      openDiscover: (id, from) => {
        // Shared-element morph: the tapped image hands its name to the feed's first frame.
        if (from) from.style.viewTransitionName = "look-morph";
        let target: HTMLElement | null = null;
        const transition = withTransition(() => {
          if (from) from.style.viewTransitionName = "";
          openSheet({ kind: "discover", id });
          target = from ? document.querySelector<HTMLElement>(".discover [data-morph]") : null;
          if (target) target.style.viewTransitionName = "look-morph";
        }, "morph");
        const clear = () => (target as HTMLElement | null)?.style.removeProperty("view-transition-name");
        if (transition) transition.finished.finally(clear);
        else clear();
      },
      openBooking: (intent?: BookingIntent) => {
        const store = useSalon.getState();
        store.resetDraft();
        if (intent?.services) store.setCart(intent.services);
        else if (intent?.service && !store.cart.includes(intent.service)) store.setCart([...store.cart, intent.service]);
        if (intent?.stylist || intent?.lookId != null) store.setDraft({ stylist: intent.stylist ?? "any", lookId: intent.lookId ?? null });
        if (intent?.makeupId) store.setDraft({ makeupId: intent.makeupId });
        if (intent?.nailStyleId) store.setDraft({ nailStyleId: intent.nailStyleId });
        if (intent?.note) store.setDraft({ note: intent.note });
        openSheet({ kind: "booking" });
      },
    }),
    [closeSheet, openSheet, setTab],
  );

  return (
    <SalonProvider value={actions}>
     <IconProvider>
      <button type="button" className="atelier-skip" onClick={() => document.getElementById("app-content")?.focus()}>
        پرش به محتوای اصلی
      </button>
      <div className="app">
        <TopBar />
        <OfflineNotice />
        <StorageNotice />
        <main id="app-content" tabIndex={-1} key={tab}>
          {tab === "home" ? <HomeScreen /> : null}
          {tab === "services" ? <ServicesScreen /> : null}
          {tab === "looks" ? <LooksScreen /> : null}
          {tab === "makeup" ? <MakeupScreen /> : null}
          {tab === "nails" ? <NailsScreen /> : null}
          {tab === "bookings" ? <BookingsScreen /> : null}
          {tab === "me" ? <MeScreen /> : null}
          {tab === "design" ? <DesignScreen /> : null}
        </main>
        <Docks />
        <TabBar />
      </div>
      <Sheets sheet={sheet} onClose={closeSheet} />
      {showWelcome ? <Welcome /> : null}
      <Toaster
        dir="rtl"
        position="top-center"
        offset={16}
        toastOptions={{
          style: {
            background: "var(--color-inverse)",
            color: "var(--color-on-inverse)",
            border: "none",
            borderRadius: "var(--radius-pill)",
            boxShadow: "var(--shadow-3)",
            fontFamily: "var(--font-sans)",
            fontSize: "0.8125rem",
          },
        }}
      />
     </IconProvider>
    </SalonProvider>
  );
}
