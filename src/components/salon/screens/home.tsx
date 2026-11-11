import { useMemo, useState } from "react";
import { byRep, lookSrc, lookThumb, persian } from "@/data/catalog";
import { photoObjectPosition } from "@/data/photo-focal";
import { MAKEUP_STYLES } from "@/data/makeup-styles";
import { MAKEUP_PHOTOS, lookPhoto } from "@/data/makeup-photos";
import { SERVICES, dayOf, formatPrice, greeting, isPast, longDate, monthOf, summarize, timeLabel } from "@/data/salon";
import { useSalon } from "@/lib/salon-store";
import { Icon } from "../icons";
import { Button, Media, TextLink, useSalonActions } from "../ui";

const STYLES = [
  { repId: 30, filter: "waves", label: "موج‌های نرم", caption: "WAVES" },
  { repId: 84, filter: "curly", label: "فرِ پرحجم", caption: "CURLS" },
  { repId: 77, filter: "braid", label: "بافتِ خلاق", caption: "BRAIDS" },
  { repId: 43, filter: "ponytail", label: "دم‌اسبی", caption: "PONYTAIL" },
  { repId: 125, filter: "pixie", label: "موی کوتاه", caption: "SHORT HAIR" },
] as const;

const FEATURED_SERVICES = ["signature-cut", "bespoke-balayage", "event-styling", "event-makeup", "luxe-manicure"];

export function HomeScreen() {
  const { go, openSheet, openBooking, openDiscover } = useSalonActions();
  const name = useSalon((state) => state.profile.name.trim());
  const bookings = useSalon((state) => state.bookings);
  const clearAll = useSalon((state) => state.clearAll);
  const setFilter = useSalon((state) => state.setFilter);
  const hero = byRep(30);
  const [heroFailed, setHeroFailed] = useState(false);
  const next = useMemo(
    () => bookings.filter((item) => !isPast(item.date, item.time))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0],
    [bookings],
  );

  return (
    <div className="salon24-home">
      <header className="salon24-welcome px-gutter">
        <div className="salon24-welcome__micro">
          <span>{greeting()}{name ? `، ${name.split(" ")[0]}` : ""} <span aria-hidden="true">✦</span></span>
          <span lang="en">HANANEH BEAUTY SALON</span>
        </div>
        <h1>زیبایی شما، <span>داستان ماست.</span></h1>
        <p>در سالن زیبایی حنانه، مدل‌های مو و خدمات زیبایی را کشف کنید و برای استایل دلخواهتان درخواست نوبت بدهید.</p>
      </header>

      {hero ? (
        <section className="salon24-hero px-gutter" aria-label="استایل منتخب سالن">
          <div className="salon26-hero__intro">
            <span lang="en">YOUR BEAUTY, YOUR WAY</span>
            <h2>استایل دلخواهتان را پیدا کنید.</h2>
            <p>مدل‌ها را ببینید، ایده‌هایتان را ذخیره کنید و درخواست نوبت را با انتخاب استایل آغاز کنید.</p>
          </div>
          <div className="salon24-hero__actions">
            <Button variant="gold" icon="book" onClick={() => openBooking({ service: "event-styling", lookId: hero.id })}>درخواست نوبت</Button>
            <Button variant="secondary" icon="looks" onClick={() => { clearAll(); go("looks"); }}>گالری مدل مو</Button>
          </div>
          <div className="salon24-hero__stage">
            <button type="button" className="salon24-hero__photo" data-image-error={heroFailed || undefined}
              onClick={(event) => openDiscover(hero.id, event.currentTarget.querySelector("img"))}
              aria-label={`دیدن مدل ${hero.name} در لوک‌بوک`}>
              <img src={lookSrc(hero.repId)} alt={hero.name} fetchPriority="high" style={{ objectPosition: photoObjectPosition(lookSrc(hero.repId), "30%") }} onError={() => setHeroFailed(true)} />
              {heroFailed ? <span className="salon26-hero__missing" aria-hidden="true">تصویر این مدل اکنون در دسترس نیست.</span> : null}
            </button>
            <div className="salon25-hero__caption">
              <div><span>استایل منتخب سالن</span><h2>{hero.name}</h2></div>
              <span lang="en">HANANEH BEAUTY</span>
            </div>
          </div>

          <p className="salon24-hero__fine">زمان انتخابی پیشنهادی است؛ سالن پس از دریافت درخواست آن را تأیید می‌کند.</p>
        </section>
      ) : null}

      {next ? (
        <section className="px-gutter">
          <button type="button" className="modern-next salon24-next" onClick={() => go("bookings")}>
            <span className="modern-next__date"><strong>{dayOf(next.date)}</strong><small>{monthOf(next.date)}</small></span>
            <span className="modern-next__copy">
              <small>{next.sent ? "ارسال‌شده · در انتظار تأیید" : "پیش‌نویس درخواست · ارسال نشده"}</small>
              <strong>{summarize(next.services).items.map((item) => item.title).join("، ") || "مشاوره"}</strong>
              <span>{longDate(next.date)} · {timeLabel(next.time)}</span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        </section>
      ) : null}

      <section className="salon24-section" aria-labelledby="salon24-style-title">
        <div className="salon24-section__head px-gutter">
          <div><span className="salon24-eyebrow">STYLE INSPIRATION</span><h2 id="salon24-style-title">زیبایی از انتخاب شما شروع می‌شود</h2></div>
          <TextLink onClick={() => { clearAll(); go("looks"); }}>همه مدل‌ها</TextLink>
        </div>
        <div className="salon24-styles rail">
          {STYLES.map((style) => (
            <button key={style.filter} type="button" className="salon24-style-card"
              aria-label={`دیدن مدل‌های ${style.label}`}
              onClick={() => { clearAll(); setFilter(style.filter); go("looks"); }}>
              <Media src={lookThumb(style.repId)} alt="" loading="lazy" />
              <strong>{style.label}</strong>
              <span lang="en">{style.caption}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="salon24-section salon24-services" aria-labelledby="salon24-services-title">
        <div className="salon24-section__head px-gutter">
          <div><span className="salon24-eyebrow">BEAUTY SERVICES</span><h2 id="salon24-services-title">خدمات سالن زیبایی</h2></div>
          <TextLink onClick={() => go("services")}>تمام خدمات</TextLink>
        </div>
        <p className="salon24-section__intro px-gutter">از کوتاهی و رنگ مو تا میکاپ و مراقبت؛ هر خدمت را با جزئیات ببینید.</p>
        <div className="salon24-service-list px-gutter">
          {FEATURED_SERVICES.map((id) => {
            const service = SERVICES.find((item) => item.id === id);
            if (!service) return null;
            return (
              <button key={id} type="button" className="salon24-service-row"
                onClick={() => openSheet({ kind: "service", id })}>
                <span className="salon24-service-row__icon"><Icon name={service.category} size={23} weight="duotone" /></span>
                <span className="salon24-service-row__copy"><strong>{service.title}</strong><small>{service.detail}</small></span>
                <span className="salon24-service-row__price">{service.price ? `از ${formatPrice(service.price)}` : "مشاوره"}<small>{service.price ? "تومان" : ""}</small></span>
                <Icon name="chevron" size={16} className="salon24-service-row__chevron" />
              </button>
            );
          })}
        </div>
        <p className="salon24-section__footnote px-gutter">قیمت‌های نمایش‌داده‌شده «شروع از» هستند و باید توسط سالن تأیید شوند.</p>
      </section>

      <section className="salon24-section" aria-labelledby="mk-home-title">
        <div className="salon24-section__head px-gutter">
          <div><span className="salon24-eyebrow">MAKEUP ATELIER</span><h2 id="mk-home-title">میکاپ برای هر مراسم</h2></div>
          <TextLink onClick={() => go("makeup")}>بخش میکاپ</TextLink>
        </div>
        <div className="px-gutter">
          <button type="button" className="mk-entry" onClick={() => go("makeup")} aria-label="ورود به بخش میکاپ">
            <Media src={lookPhoto("soft-glam", "sm")} alt="" loading="lazy" />
            <span className="mk-entry__copy">
              <span className="mk-entry__dots" aria-hidden="true">{["soft-glam", "hollywood", "plum-smokey", "romantic-bride", "sunset"].map((id) => {
                const item = MAKEUP_STYLES.find((entry) => entry.id === id);
                return item ? <i key={id} style={{ background: item.look.lipColor }} /> : null;
              })}</span>
              <strong>{MAKEUP_PHOTOS.length ? `${persian(MAKEUP_PHOTOS.length)} سبک حرفه‌ای میکاپ` : "سبک‌های حرفه‌ای میکاپ"}</strong>
              <span>از نچرال روزانه تا گلم شب، عروس و سبک‌های رترو؛ همه روی یک مدل.</span>
              <span className="mk-entry__cta">مشاهده سبک‌ها<Icon name="chevron" size={14} /></span>
            </span>
          </button>
        </div>
      </section>

      <section className="salon24-concierge px-gutter" aria-labelledby="salon24-concierge-title">
        <div className="salon24-concierge__inner">
          <div className="salon24-concierge__header">
            <span className="salon24-concierge__icon"><Icon name="consult" size={25} weight="duotone" /></span>
            <span lang="en">A LITTLE BEAUTY ADVICE</span>
          </div>
          <h2 id="salon24-concierge-title">هنوز مدل موردعلاقه‌تان را پیدا نکردید؟</h2>
          <p>چند مدل را ذخیره کنید یا از راهنمای انتخاب استایل کمک بگیرید. بعد می‌توانید انتخاب‌هایتان را برای مشاوره آماده کنید.</p>
          <div className="salon24-concierge__actions">
            <Button variant="secondary" icon="finder" onClick={() => openSheet({ kind: "finder" })}>راهنمای استایل</Button>
            <Button variant="ghost" icon="consult" onClick={() => openSheet({ kind: "consult" })}>مشاوره</Button>
          </div>
        </div>
      </section>

      <section className="salon24-section" aria-labelledby="salon24-look-title">
        <div className="salon24-section__head px-gutter">
          <div><span className="salon24-eyebrow">THE LOOKBOOK</span><h2 id="salon24-look-title">مدل‌های محبوب برای الهام</h2></div>
          <TextLink onClick={() => { clearAll(); go("looks"); }}>گالری کامل</TextLink>
        </div>
        <div className="salon24-featured rail">
          {[27, 43, 84, 125].map((repId) => {
            const look = byRep(repId);
            if (!look) return null;
            return (
              <button key={repId} type="button" className="salon24-featured__card"
                aria-label={`مشاهده ${look.name}`}
                onClick={(event) => openDiscover(look.id, event.currentTarget.querySelector("img"))}>
                <Media src={lookThumb(repId)} alt={look.name} loading="lazy" />
                <span>{look.name}</span>
              </button>
            );
          })}
        </div>
      </section>
      <footer className="salon24-footer px-gutter">
        <span>حنانه بیوتی</span>
        <small>زیبایی، با سلیقه شما</small>
      </footer>
    </div>
  );
}
