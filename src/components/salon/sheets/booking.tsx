import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { familyById, lookThumb, persian } from "@/data/catalog";
import {
  ANY_STYLIST,
  SERVICES,
  SERVICE_CATEGORIES,
  STYLISTS,
  formatMinutes,
  formatPrice,
  longDate,
  normalizePhone,
  slotsFor,
  stylistName,
  summarize,
  timeLabel,
  upcomingDays,
} from "@/data/salon";
import { hasPhoto, lookPhoto } from "@/data/makeup-photos";
import { styleById } from "@/data/makeup-styles";
import { nailById } from "@/data/nail-styles";
import { useSalon, type BookingRequest } from "@/lib/salon-store";
import { bookingMessage, copyText, shareText, whatsappLink } from "@/lib/share";
import { Icon } from "../icons";
import { Avatar, Button, IconButton, Media, Sheet, haptic, useSalonActions } from "../ui";

const STEPS = ["خدمات", "آرتیست", "زمان", "اطلاعات"];
const PARTS = { morning: "صبح", afternoon: "ظهر", evening: "عصر" } as const;

export function BookingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useSalon((state) => state.cart);
  const draft = useSalon((state) => state.draft);
  const profile = useSalon((state) => state.profile);
  const toggleCart = useSalon((state) => state.toggleCart);
  const setDraft = useSalon((state) => state.setDraft);
  const setProfile = useSalon((state) => state.setProfile);
  const addBooking = useSalon((state) => state.addBooking);
  // A request started from a makeup style opens on the services step, showing the chosen style.
  const [step, setStep] = useState(() => ((draft.makeupId || draft.nailStyleId) ? 0 : cart.length ? (draft.stylist !== ANY_STYLIST ? 2 : 1) : 0));
  const makeup = draft.makeupId ? styleById.get(draft.makeupId) ?? null : null;
  const nail = draft.nailStyleId ? nailById.get(draft.nailStyleId) ?? null : null;
  const [browsing, setBrowsing] = useState(() => !makeup && !nail);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<BookingRequest | null>(null);

  const summary = summarize(cart);
  const days = useMemo(() => upcomingDays(21), []);
  const date = draft.date || days.find((day) => day.open && slotsFor(day.iso, summary.minutes).length)?.iso || "";
  const slots = useMemo(() => (date ? slotsFor(date, summary.minutes) : []), [date, summary.minutes]);
  const validPhone = normalizePhone(phone);
  const look = draft.lookId != null ? familyById.get(draft.lookId) : null;

  useEffect(() => {
    if (draft.time && !slots.some((slot) => slot.time === draft.time)) setDraft({ time: "" });
  }, [draft.time, setDraft, slots]);

  const canNext = [cart.length > 0, true, Boolean(date && draft.time), Boolean(name.trim() && validPhone)][step];

  function next() {
    haptic();
    if (step < 3) {
      if (step === 1 && !draft.date) setDraft({ date });
      setStep(step + 1);
      return;
    }
    setTouched(true);
    if (!canNext || !validPhone) return;
    const booking: BookingRequest = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      services: cart,
      stylist: draft.stylist,
      date,
      time: draft.time,
      name: name.trim(),
      phone: validPhone,
      note: draft.note,
      lookId: draft.lookId,
      makeupId: draft.makeupId,
      nailStyleId: draft.nailStyleId,
      createdAt: Date.now(),
      sent: false,
    };
    setProfile({ name: name.trim(), phone: validPhone });
    addBooking(booking);
    setDone(booking);
  }

  if (done) return <BookingDone open={open} booking={done} onClose={onClose} />;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="درخواست نوبت"
      full
      leading={step > 0 ? <IconButton icon="back" label="مرحله قبل" size="sm" onClick={() => setStep(step - 1)} /> : null}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {cart.length ? (
              <>
                <p className="t-footnote truncate font-medium">{persian(cart.length)} خدمت · {formatMinutes(summary.minutes)}</p>
                <p className="t-caption truncate text-ink-2">{summary.price ? `از ${formatPrice(summary.price)} تومان` : "قیمت پس از مشاوره"}</p>
              </>
            ) : (
              <p className="t-caption text-ink-2">حداقل یک خدمت انتخاب کنید</p>
            )}
          </div>
          <Button variant="gold" size="lg" className="min-w-36" disabled={!canNext && !(step === 3 && !touched)} onClick={next}>
            {step === 3 ? "ثبت درخواست" : "ادامه"}
          </Button>
        </div>
      }
    >
      <header className="studio-booking-intro">
        <span lang="en">HANANEH / YOUR APPOINTMENT</span>
        <h2>{STEPS[step]} <small>{`۰${step + 1} / ۰۴`}</small></h2>
        <p>{[
          "خدمات مورد علاقه را انتخاب کنید؛ می‌توانید چند خدمت را با هم درخواست دهید.",
          "اگر آرتیست خاصی مدنظر دارید انتخاب کنید، وگرنه گزینه بدون ترجیح را نگه دارید.",
          "روز و ساعت دلخواه خود را پیشنهاد دهید؛ ساعت‌ها از تقویم سالن استعلام نشده‌اند.",
          "اطلاعات را تکمیل کنید تا متن درخواست قابل ارسال به سالن آماده شود.",
        ][step]}</p>
        <div className="studio-booking-progress" role="progressbar" aria-label="پیشرفت ثبت درخواست"
          aria-valuemin={0} aria-valuemax={4} aria-valuenow={step + 1}>
          <span style={{ width: `${((step + 1) / 4) * 100}%` }} />
        </div>
      </header>
      <ol className="stepper" aria-label="مراحل درخواست نوبت">
        {STEPS.map((label, index) => (
          <li key={label} data-done={index < step ? "" : undefined} aria-current={index === step ? "step" : undefined}>
            <span>{index < step ? <Icon name="check" size={13} weight="bold" /> : persian(index + 1)}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && nail ? (
        <section className="mk-booking rise mt-7" aria-label="طرح ناخن انتخاب‌شده">
          <div className="flex items-center justify-between gap-3">
            <div><h3>طرح ناخن انتخاب‌شده</h3><p className="t-footnote text-ink-2">{nail.title} · {nail.en}</p></div>
            <IconButton icon="close" label="حذف طرح ناخن" size="sm" variant="tonal" onClick={() => { setDraft({ nailStyleId: null }); setBrowsing(true); }} />
          </div>
          <p className="t-caption mt-2 text-ink-2">نام این طرح همراه با درخواست نوبت به سالن منتقل می‌شود.</p>
          <button type="button" className="mk-booking__add" onClick={() => setBrowsing(true)}><Icon name="plus" size={18}/> افزودن خدمت دیگر</button>
        </section>
      ) : null}
      {step === 0 && makeup ? (
        <section className="mk-booking rise mt-7" aria-labelledby="mk-booking-title">
          <h3 id="mk-booking-title">خدمات انتخاب‌شده</h3>
          <div className="mk-booking__list">
            {summary.items.map((service, index) => (
              <article key={service.id} className="mk-booking__item">
                {index === 0 && hasPhoto(makeup.id)
                  ? <Media src={lookPhoto(makeup.id, "sm")} alt="" className="mk-booking__photo" />
                  : <span className="mk-booking__photo mk-booking__photo--icon"><Icon name={service.category} size={24} weight="duotone" /></span>}
                <span className="mk-booking__copy">
                  <strong>{service.title}</strong>
                  {index === 0 ? <small>سبک: {makeup.title}</small> : null}
                  <span>{formatMinutes(service.minutes)}</span>
                  <b>{service.price ? `از ${formatPrice(service.price)} تومان` : "قیمت پس از مشاوره"}</b>
                </span>
                <IconButton icon="close" size="sm" variant="tonal" label={`حذف ${service.title}`}
                  onClick={() => { haptic(); toggleCart(service.id); if (index === 0) setDraft({ makeupId: null }); }} />
              </article>
            ))}
          </div>
          {!browsing ? (
            <button type="button" className="mk-booking__add" onClick={() => setBrowsing(true)}>
              <Icon name="plus" size={18} weight="regular" />افزودن یک خدمت دیگر
            </button>
          ) : null}
        </section>
      ) : null}

      {step === 0 && browsing ? (
        <div className="studio-booking-choices rise mt-7 grid gap-7">
          {SERVICE_CATEGORIES.map((category) => (
            <section key={category.key}>
              <h3 className="t-caption mb-2.5 flex items-center gap-1.5 text-ink-2"><Icon name={category.key} size={15} />{category.label}</h3>
              <div className="grid gap-2">
                {SERVICES.filter((service) => service.category === category.key).map((service) => {
                  const picked = cart.includes(service.id);
                  return (
                    <button key={service.id} type="button" className="choice" aria-pressed={picked} onClick={() => { haptic(); toggleCart(service.id); }}>
                      <span className="check">{picked ? <Icon name="check" size={13} weight="bold" /> : null}</span>
                      <span className="min-w-0 flex-1">
                        <strong className="t-callout block font-medium">{service.title}</strong>
                        <span className="t-caption text-ink-2">{formatMinutes(service.minutes)} · {service.price ? `از ${formatPrice(service.price)}` : formatPrice(null)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="studio-booking-artists rise mt-7 grid gap-2.5">
          <p className="t-callout mb-1 text-ink-2">با کدام آرتیست راحت‌ترید؟</p>
          <button type="button" className="choice" aria-pressed={draft.stylist === ANY_STYLIST} onClick={() => setDraft({ stylist: ANY_STYLIST })}>
            <span className="grid size-12 place-items-center rounded-full bg-noir text-champagne"><Icon name="services" size={22} weight="duotone" /></span>
            <span className="flex-1"><strong className="t-callout block font-medium">اولین آرتیست در دسترس</strong><span className="t-caption text-ink-2">سریع‌ترین زمان ممکن</span></span>
          </button>
          {[...STYLISTS]
            .sort((a, b) => Number(summary.items.some((item) => b.focus.includes(item.category))) - Number(summary.items.some((item) => a.focus.includes(item.category))))
            .map((stylist) => {
              const match = summary.items.some((item) => stylist.focus.includes(item.category));
              return (
                <button key={stylist.id} type="button" className="choice" aria-pressed={draft.stylist === stylist.id} onClick={() => setDraft({ stylist: stylist.id })}>
                  <Avatar name={stylist.name} tone={stylist.tone} className="size-12 text-xl" />
                  <span className="flex-1">
                    <strong className="t-callout flex items-center gap-2 font-medium">{stylist.name}{match ? <span className="badge">متخصص</span> : null}</strong>
                    <span className="t-caption text-ink-2">{stylist.role}</span>
                  </span>
                </button>
              );
            })}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="studio-booking-dates rise mt-7">
          <p className="t-headline">{date ? longDate(date) : "روز را انتخاب کنید"}</p>
          <p className="t-caption mt-1 text-ink-2">این ساعت‌ها پیشنهادی هستند و از تقویم واقعی سالن استعلام نشده‌اند.</p>
          <div className="rail -mx-gutter mt-3 gap-2" role="group" aria-label="انتخاب روز">
            {days.map((day) => (
              <button key={day.iso} type="button" className="day" disabled={!day.open} aria-pressed={day.iso === date} onClick={() => { haptic(); setDraft({ date: day.iso }); }}>
                <small>{day.weekday}</small>
                <strong>{day.day}</strong>
                <small>{day.open ? day.month : "تعطیل"}</small>
              </button>
            ))}
          </div>
          {slots.length ? (
            (Object.keys(PARTS) as Array<keyof typeof PARTS>).map((part) => {
              const list = slots.filter((slot) => slot.part === part);
              if (!list.length) return null;
              return (
                <section key={part} className="mt-5">
                  <h3 className="t-caption mb-2 text-ink-2">{PARTS[part]}</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {list.map((slot) => (
                      <button key={slot.time} type="button" className="slot" aria-pressed={draft.time === slot.time} onClick={() => { haptic(); setDraft({ date, time: slot.time }); }}>
                        {timeLabel(slot.time)}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <p className="card t-callout mt-6 text-ink-2" data-variant="sunken">در ساعت‌های کاری اعلام‌شده، زمان پیشنهادی متناسب با مدت این خدمات باقی نمانده است؛ روز دیگری انتخاب کنید.</p>
          )}
          <p className="t-caption mt-5 flex items-start gap-2 text-ink-2"><Icon name="info" size={16} className="mt-0.5 shrink-0" />زمان انتخابی پیشنهاد شماست و پس از هماهنگی، سالن آن را تأیید می‌کند.</p>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="studio-booking-details rise mt-7 grid gap-5">
          <div className="card grid gap-1" data-variant="sunken">
            <p className="t-headline">{summary.items.map((item) => item.title).join("، ")}</p>
            <p className="t-footnote text-ink-2">{longDate(date)} · ساعت {timeLabel(draft.time)}</p>
            <p className="t-footnote text-ink-2">{stylistName(draft.stylist)} · {formatMinutes(summary.minutes)}</p>
          </div>
          {makeup ? (
            <div className="flex items-center gap-3">
              {hasPhoto(makeup.id) ? <Media src={lookPhoto(makeup.id, "sm")} className="arch h-14 w-11 shrink-0" /> : null}
              <span className="min-w-0 flex-1"><span className="t-caption block text-ink-2">سبک میکاپ</span><strong className="t-callout block truncate font-medium">{makeup.title}</strong></span>
              <IconButton icon="close" label="حذف سبک میکاپ" size="sm" variant="tonal" onClick={() => setDraft({ makeupId: null })} />
            </div>
          ) : null}
          {nail ? (
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1"><span className="t-caption block text-ink-2">طرح ناخن</span><strong className="t-callout block truncate font-medium">{nail.title}</strong></span>
              <IconButton icon="close" label="حذف طرح ناخن" size="sm" variant="tonal" onClick={() => setDraft({ nailStyleId: null })} />
            </div>
          ) : null}
          {look ? (
            <div className="flex items-center gap-3">
              <Media src={lookThumb(look.repId)} className="arch h-14 w-11 shrink-0" />
              <span className="min-w-0 flex-1"><span className="t-caption block text-ink-2">مدل منتخب</span><strong className="t-callout block truncate font-medium">{look.name}</strong></span>
              <IconButton icon="close" label="حذف مدل منتخب" size="sm" variant="tonal" onClick={() => setDraft({ lookId: null })} />
            </div>
          ) : null}
          <label className="field">
            <span>نام و نام خانوادگی</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="نام شما" aria-invalid={touched && !name.trim()} />
          </label>
          <label className="field">
            <span>شماره همراه</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" dir="ltr" aria-invalid={touched && !validPhone} />
            {touched && phone && !validPhone ? <small className="field__error">شماره همراه معتبر وارد کنید (مثل ۰۹۱۲۳۴۵۶۷۸۹).</small> : null}
          </label>
          <label className="field">
            <span>توضیحات (اختیاری)</span>
            <textarea value={draft.note} onChange={(event) => setDraft({ note: event.target.value })} placeholder="سابقه رنگ، مراسم، یا هر نکته‌ای که آرتیست باید بداند" />
          </label>
        </div>
      ) : null}
    </Sheet>
  );
}

function BookingDone({ open, booking, onClose }: { open: boolean; booking: BookingRequest; onClose: () => void }) {
  const { go } = useSalonActions();
  const { items, minutes } = summarize(booking.services);
  const message = bookingMessage(booking);
  const wa = whatsappLink(message);

  async function send() {
    const result = await shareText(message, "درخواست نوبت");
    if (result === "shared") {
      toast("اشتراک‌گذاری انجام شد؛ پس از ارسال به سالن وضعیت آن را ثبت کنید.");
    } else if (result === "copied") {
      toast("متن کپی شد؛ آن را برای سالن بفرستید.");
    } else if (result === "failed") {
      toast("اشتراک‌گذاری ممکن نشد.");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="درخواست آماده ارسال است"
      footer={
        <div className="grid gap-2">
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="btn" data-variant="gold" data-size="lg">
              <Icon name="whatsapp" size={20} weight="regular" /> ارسال در واتساپ
            </a>
          ) : (
            <Button variant="gold" size="lg" icon="send" onClick={send}>ارسال برای سالن</Button>
          )}
          <Button variant="tonal" onClick={() => go("bookings")}>مشاهده درخواست‌های من</Button>
        </div>
      }
    >
      <div className="text-center">
        <span className="success-mark foil"><Icon name="booked" size={34} weight="duotone" /></span>
        <h2 className="t-title-2 mt-5">درخواست شما <span className="t-calligraphy text-gold-ink">آماده است</span></h2>
        <p className="t-callout mx-auto mt-2 max-w-sm text-ink-2">
          این برنامه هنوز به سیستم نوبت‌دهی سالن متصل نیست. برای قطعی شدن نوبت، درخواست را برای سالن بفرستید تا زمان را تأیید کنند.
        </p>
        <div className="studio-booking-complete card mt-6 grid gap-1 text-start">
          <p className="t-headline">{items.map((item) => item.title).join("، ")}</p>
          <p className="t-footnote text-ink-2">{longDate(booking.date)} · ساعت {timeLabel(booking.time)}</p>
          <p className="t-footnote text-ink-2">{stylistName(booking.stylist)} · {formatMinutes(minutes)}</p>
          <span className="status mt-2" data-tone="garnet">در انتظار ارسال و تأیید سالن</span>
        </div>
        <Button variant="ghost" icon="copy" className="mt-3" onClick={async () => toast((await copyText(message)) === "copied" ? "متن درخواست کپی شد؛ آن را برای سالن بفرستید." : "کپی ممکن نشد.")}>
          کپی متن درخواست
        </Button>
      </div>
    </Sheet>
  );
}
