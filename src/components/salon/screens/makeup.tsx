import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { familyById, lookThumb, normalize, persian } from "@/data/catalog";
import { MAKEUP_ARTIST, MAKEUP_SERVICE_IDS } from "@/data/makeup";
import { hasPhoto, lookPhoto, MAKEUP_CURATED_80 } from "@/data/makeup-photos";
import { MAKEUP_STYLES, STYLE_CATEGORIES, categoryOf, styleById, type MakeupStyle, type StyleCategory } from "@/data/makeup-styles";
import { formatPrice, serviceById, stylistById } from "@/data/salon";
import { useSalon } from "@/lib/salon-store";
import { Icon } from "../icons";
import { Avatar, Button, Chip, EmptyState, IconButton, Media, Ornament, haptic, useSalonActions } from "../ui";

/* Makeup gallery → style list → detail sheet, plus saved looks (design sheet screens 2, 3, 4 and 7). */

type Mode = "face" | "eyes" | "lips";
type View =
  | { kind: "gallery" }
  | { kind: "list"; filter: StyleCategory | "all"; mode: Mode }
  | { kind: "saved" };

const READY = MAKEUP_STYLES.filter((item) => hasPhoto(item.id));
const COUNT = READY.length;

function photoFor(item: MakeupStyle, mode: Mode) {
  return lookPhoto(item.id, mode === "face" ? "sm" : mode);
}

function readView(state: unknown): View {
  const view = (state as { mk?: View } | null)?.mk;
  return view && (view.kind === "list" || view.kind === "saved") ? view : { kind: "gallery" };
}

export function MakeupScreen() {
  const [view, setView] = useState<View>(() => readView(window.history.state));

  // Sub-views get their own history entry so the back button returns to the gallery.
  useEffect(() => {
    const onPop = (event: PopStateEvent) => setView(readView(event.state));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback((next: View) => {
    haptic();
    if (next.kind === "gallery") {
      window.history.back();
      return;
    }
    const state = (window.history.state as { mk?: View } | null)?.mk;
    if (state) window.history.replaceState({ mk: next }, "");
    else window.history.pushState({ mk: next }, "");
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  if (view.kind === "list") return <StyleList view={view} onOpen={open} />;
  if (view.kind === "saved") return <SavedLooks onOpen={open} />;
  return <Gallery onOpen={open} />;
}

/* ---------- Segmented control: Makeup | Hair ---------- */

function Segments({ active, onHair, onMakeup }: { active: "makeup" | "hair"; onHair: () => void; onMakeup?: () => void }) {
  return (
    <div className="mk-segments" role="tablist" aria-label="نوع مدل">
      <button type="button" role="tab" aria-selected={active === "makeup"} onClick={onMakeup}>میکاپ</button>
      <button type="button" role="tab" aria-selected={active === "hair"} onClick={onHair}>مدل مو</button>
    </div>
  );
}

function PageBar({ title, onBack, actions }: { title: string; onBack?: () => void; actions?: React.ReactNode }) {
  return (
    <header className="mk-bar px-gutter">
      {onBack ? <IconButton icon="back" label="بازگشت" variant="tonal" onClick={onBack} /> : <span className="mk-bar__spacer" aria-hidden="true" />}
      <h1>{title}</h1>
      <div className="mk-bar__actions">{actions}</div>
    </header>
  );
}

/* ---------- Screen 2: gallery of categories ---------- */

function Gallery({ onOpen }: { onOpen: (view: View) => void }) {
  const { go, openBooking, openSheet } = useSalonActions();
  const saved = useSalon((state) => state.favMakeup.length);
  const artist = stylistById.get(MAKEUP_ARTIST);
  const cards = useMemo(() => {
    const list: Array<{ key: string; title: string; note: string; src: string; view: View }> = [
      { key: "all", title: "همه سبک‌ها", note: `${persian(COUNT)} سبک حرفه‌ای`, src: lookPhoto(MAKEUP_CURATED_80 ? READY[0].id : "hollywood", "sm"), view: { kind: "list", filter: "all", mode: "face" } },
    ];
    for (const category of STYLE_CATEGORIES) {
      const count = READY.filter((item) => item.category === category.key).length;
      const cover = MAKEUP_CURATED_80 ? READY.find((item) => item.category === category.key)?.id : category.cover;
      if (!count || !cover || !hasPhoto(cover)) continue;
      list.push({ key: category.key, title: category.label, note: category.note, src: lookPhoto(cover, "sm"), view: { kind: "list", filter: category.key, mode: "face" } });
    }
    list.push(
      { key: "eyes", title: "آرایش چشم", note: "مدل‌های متنوع", src: lookPhoto(MAKEUP_CURATED_80 ? (READY.find((item) => item.category === "liner")?.id ?? READY[0].id) : "arabic-glam", "eyes"), view: { kind: "list", filter: "all", mode: "eyes" } },
      { key: "lips", title: "آرایش لب", note: "رنگ‌ها و مدل‌ها", src: lookPhoto(MAKEUP_CURATED_80 ? (READY.find((item) => /lip|لب/i.test(item.en+" "+item.title))?.id ?? READY[0].id) : "hollywood", "lips"), view: { kind: "list", filter: "all", mode: "lips" } },
    );
    return list;
  }, []);

  return (
    <div className="mk-page pt-2" data-curated80={MAKEUP_CURATED_80 || undefined}>
      <PageBar
        title="گالری میکاپ"
        actions={
          <>
            <IconButton icon="search" label="جست‌وجوی سبک‌ها" variant="tonal" onClick={() => onOpen({ kind: "list", filter: "all", mode: "face" })} />
            <span className="relative">
              <IconButton icon="heart" label="مدل‌های ذخیره‌شده" variant="tonal" onClick={() => onOpen({ kind: "saved" })} />
              {saved ? <span className="mk-count" aria-hidden="true">{persian(saved)}</span> : null}
            </span>
          </>
        }
      />
      <div className="px-gutter"><Segments active="makeup" onHair={() => go("looks")} /></div>

      <section className="mk-cats px-gutter" aria-label="دسته‌های میکاپ">
        {cards.map((card) => (
          <button key={card.key} type="button" className="mk-cat" data-mode={card.key === "eyes" || card.key === "lips" ? "detail" : undefined} onClick={() => onOpen(card.view)}>
            <Media src={card.src} alt="" loading="lazy" />
            <strong>{card.title}</strong>
            <span>{card.note}</span>
          </button>
        ))}
      </section>

      <section className="salon24-section salon24-services" aria-labelledby="mk-services-title">
        <div className="salon24-section__head px-gutter">
          <div><span className="salon24-eyebrow">MAKEUP SERVICES</span><h2 id="mk-services-title">خدمات میکاپ</h2></div>
        </div>
        <div className="salon24-service-list px-gutter">
          {MAKEUP_SERVICE_IDS.map((id) => {
            const service = serviceById.get(id);
            if (!service) return null;
            return (
              <button key={id} type="button" className="salon24-service-row" onClick={() => openSheet({ kind: "service", id })}>
                <span className="salon24-service-row__icon"><Icon name={service.category} size={23} weight="duotone" /></span>
                <span className="salon24-service-row__copy"><strong>{service.title}</strong><small>{service.detail}</small></span>
                <span className="salon24-service-row__price">{service.price ? `از ${formatPrice(service.price)}` : "مشاوره"}<small>{service.price ? "تومان" : ""}</small></span>
                <Icon name="chevron" size={16} className="salon24-service-row__chevron" />
              </button>
            );
          })}
        </div>
      </section>

      {artist ? (
        <section className="px-gutter">
          <div className="mk-artist">
            <Avatar name={artist.name} tone={artist.tone} arch className="mk-artist__avatar" />
            <div className="mk-artist__copy">
              <small lang="en">YOUR ARTIST</small>
              <strong>{artist.name}</strong>
              <span>{artist.role}</span>
            </div>
            <Button variant="tonal" size="sm" icon="book" onClick={() => openBooking({ service: "event-makeup", stylist: artist.id })}>نوبت با {artist.name}</Button>
          </div>
        </section>
      ) : null}

      <section className="studio-service-footer px-gutter">
        <Ornament />
        <p>تصاویر سبک‌ها نمونه‌هایی هستند که با هوش مصنوعی از مدل لوک‌بوک سالن ساخته شده‌اند. نتیجه نهایی با رنگ پوست، فرم چهره و نوع مراسم شما تنظیم می‌شود. قیمت‌ها «شروع از» هستند و باید توسط سالن تأیید شوند.</p>
      </section>
    </div>
  );
}

/* ---------- Screen 3: style list ---------- */

function StyleList({ view, onOpen }: { view: Extract<View, { kind: "list" }>; onOpen: (view: View) => void }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [collection,setCollection] = useState<"all"|"original"|"new">("all");
  const input = useRef<HTMLInputElement>(null);
  const { filter, mode } = view;
  const title = mode === "eyes" ? "آرایش چشم" : mode === "lips" ? "آرایش لب" : filter === "all" ? "همه سبک‌ها" : categoryOf(filter).label;
  const categories = STYLE_CATEGORIES.filter((category) => READY.some((item) => item.category === category.key));
  const list = useMemo(() => {
    const q = normalize(query);
    return READY.filter((item) => (filter === "all" || item.category === filter)
      && (!MAKEUP_CURATED_80 || collection === "all" || (collection === "new" ? (item.promptNumber ?? 0) >= 43 : (item.promptNumber ?? 0) < 43))
      && (!q || normalize(`${item.title} ${item.en} ${item.promptNumber ?? ""} ${item.detail} ${categoryOf(item.category).label}`).includes(q)));
  }, [filter, query, collection]);

  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  return (
    <div className="mk-page pt-2" data-curated80={MAKEUP_CURATED_80 || undefined}>
      <PageBar
        title={title}
        onBack={() => onOpen({ kind: "gallery" })}
        actions={<IconButton icon={searching ? "close" : "search"} label={searching ? "بستن جست‌وجو" : "جست‌وجو"} variant="tonal"
          onClick={() => { setSearching(!searching); if (searching) setQuery(""); }} />}
      />
      {searching ? (
        <div className="px-gutter">
          <label className="mk-search">
            <Icon name="search" size={18} />
            <input ref={input} id="mk-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام سبک، رنگ یا مراسم" aria-label="جست‌وجوی سبک میکاپ" />
          </label>
        </div>
      ) : null}

      {MAKEUP_CURATED_80 ? <div className="mk-collection-switch px-gutter" role="group" aria-label="مجموعه تصاویر میکاپ">
        {([["all","همهٔ ۸۰ سبک"],["original","مجموعهٔ اول"],["new","۴۰ سبک جدید"]] as const).map(([key,label])=>
          <button key={key} type="button" aria-pressed={collection===key}
            onClick={()=>setCollection(key)}>{label}</button>)}
      </div> : null}
      <div className="chip-row studio-chip-row" data-sticky="" role="group" aria-label="دسته‌بندی سبک‌ها">
        <Chip active={filter === "all"} onClick={() => onOpen({ kind: "list", filter: "all", mode })}>همه</Chip>
        {categories.map((category) => (
          <Chip key={category.key} active={filter === category.key} onClick={() => onOpen({ kind: "list", filter: category.key, mode })}>{category.label}</Chip>
        ))}
      </div>

      {list.length ? (
        <div className="mk-grid px-gutter" data-mode={mode} data-curated80={MAKEUP_CURATED_80 || undefined}>
          {list.map((item) => <StyleCard key={item.id} item={item} mode={mode} />)}
        </div>
      ) : (
        <EmptyState icon="search" title="سبکی پیدا نشد" text="عبارت دیگری را امتحان کنید یا دسته «همه» را ببینید." />
      )}
    </div>
  );
}

function StyleCard({ item, mode }: { item: MakeupStyle; mode: Mode }) {
  const { openSheet } = useSalonActions();
  const saved = useSalon((state) => state.favMakeup.includes(item.id));
  const toggle = useSalon((state) => state.toggleFavMakeup);
  return (
    <article className="mk-card" data-mode={mode} data-curated80={Boolean(item.promptNumber) || undefined}>
      <button type="button" className="mk-card__open" onClick={() => openSheet({ kind: "makeup", id: item.id })} aria-label={`جزئیات سبک ${item.title}`}>
        <span className="mk-card__visual"><Media src={photoFor(item, mode)} alt="" loading="lazy" /></span>
        <strong>{item.title}</strong>
        {MAKEUP_CURATED_80 && item.promptNumber ? <small className="mk-card__subtitle" lang="en" dir="ltr">LOOK {String(item.promptNumber).padStart(2,"0")} · {item.en}</small> : null}
      </button>
      <IconButton icon="heart" size="sm" variant="glass" love pressed={saved} className="mk-card__fav"
        label={saved ? `حذف ${item.title} از ذخیره‌شده‌ها` : `ذخیره ${item.title}`}
        onClick={() => { haptic(); toggle(item.id); }} />
    </article>
  );
}

/* ---------- Screen 7: saved looks ---------- */

function SavedLooks({ onOpen }: { onOpen: (view: View) => void }) {
  const { openDiscover } = useSalonActions();
  const [tab, setTab] = useState<"makeup" | "hair">("makeup");
  const favMakeup = useSalon((state) => state.favMakeup);
  const favs = useSalon((state) => state.favs);
  const makeup = favMakeup.map((id)=>styleById.get(id))
    .filter((item): item is MakeupStyle => Boolean(item && hasPhoto(item.id)));
  const hair = favs.map((id) => familyById.get(id)).filter((family): family is NonNullable<typeof family> => Boolean(family));

  return (
    <div className="mk-page pt-2" data-curated80={MAKEUP_CURATED_80 || undefined}>
      <PageBar title="مدل‌های ذخیره‌شده" onBack={() => onOpen({ kind: "gallery" })} />
      <div className="px-gutter"><Segments active={tab} onMakeup={() => setTab("makeup")} onHair={() => setTab("hair")} /></div>
      {tab === "makeup" ? (
        makeup.length ? (
          <div className="mk-grid px-gutter" data-mode="face" data-curated80={MAKEUP_CURATED_80 || undefined}>
            {makeup.map((item) => <StyleCard key={item.id} item={item} mode="face" />)}
          </div>
        ) : (
          <EmptyState icon="heart" title="هنوز سبکی ذخیره نکرده‌اید" text="روی قلب هر سبک میکاپ بزنید تا اینجا کنار هم ببینید."
            action={<Button variant="secondary" onClick={() => onOpen({ kind: "list", filter: "all", mode: "face" })}>دیدن سبک‌ها</Button>} />
        )
      ) : hair.length ? (
        <div className="mk-grid px-gutter" data-mode="face">
          {hair.map((family) => (
            <article key={family.id} className="mk-card" data-mode="face">
              <button type="button" className="mk-card__open" onClick={(event) => openDiscover(family.id, event.currentTarget.querySelector("img"))} aria-label={`دیدن ${family.name}`}>
                <span className="mk-card__visual"><Media src={lookThumb(family.repId)} alt="" loading="lazy" /></span>
                <strong>{family.name}</strong>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon="heart" title="هنوز مدل مویی ذخیره نکرده‌اید" text="در گالری مدل مو، روی قلب هر مدل بزنید تا اینجا ذخیره شود." />
      )}
    </div>
  );
}
