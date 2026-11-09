import { useRef, useState } from "react";
import { persian } from "@/data/catalog";
import { MAKEUP_ARTIST } from "@/data/makeup";
import { lookPhoto, MAKEUP_CURATED_80 } from "@/data/makeup-photos";
import { breakdown, serviceForStyle, tagsFor, type MakeupStyle } from "@/data/makeup-styles";
import { formatMinutes, formatPrice, serviceById } from "@/data/salon";
import { useSalon } from "@/lib/salon-store";
import { Icon } from "../icons";
import { Button, IconButton, Media, Sheet, haptic, useSalonActions } from "../ui";

/* Makeup style detail (design sheet screen 4). */

const SLIDES = [
  { size: "full", label: "چهره" },
  { size: "eyes", label: "چشم" },
  { size: "lips", label: "لب" },
] as const;

export function MakeupSheet({ open, style, onClose }: { open: boolean; style: MakeupStyle; onClose: () => void }) {
  const { openBooking } = useSalonActions();
  const saved = useSalon((state) => state.favMakeup.includes(style.id));
  const toggleFav = useSalon((state) => state.toggleFavMakeup);
  const track = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const main = serviceForStyle(style);
  const related = [main, ...["brow-design", "luxe-manicure"].filter((id) => id !== main)]
    .map((id) => serviceById.get(id))
    .filter((service): service is NonNullable<typeof service> => Boolean(service));
  const [picked, setPicked] = useState<string[]>([main]);

  function show(index: number) {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: -index * el.clientWidth * (getComputedStyle(el).direction === "rtl" ? 1 : -1), behavior: "smooth" });
  }

  function onScroll() {
    const el = track.current;
    if (el) setSlide(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="جزئیات سبک میکاپ"
      full
      footer={
        <Button variant="gold" size="lg" block icon="book" disabled={!picked.length}
          onClick={() => openBooking({ services: picked, stylist: MAKEUP_ARTIST, makeupId: style.id })}>
          درخواست نوبت
        </Button>
      }
    >
      <div className="mk-detail" data-curated80={MAKEUP_CURATED_80 && Boolean(style.promptNumber) || undefined}>
        <div className="mk-detail__stage">
          <div className="mk-detail__track" ref={track} onScroll={onScroll} aria-label={`تصاویر سبک ${style.title}`}>
            {SLIDES.map((item, index) => (
              <figure key={item.size} className="mk-detail__slide" data-size={item.size} aria-label={`${item.label} · ${persian(index + 1)} از ${persian(SLIDES.length)}`}>
                <Media src={lookPhoto(style.id, style.promptNumber ? "full" : item.size)} alt={style.promptNumber && index ? `نمای برش‌خوردهٔ ${item.label} از پرتره ${style.title}` : `${item.label} در سبک ${style.title}`} loading={index ? "lazy" : undefined} />
              </figure>
            ))}
          </div>
          {!(MAKEUP_CURATED_80 && style.promptNumber) ? <IconButton icon="heart" variant="glass" love pressed={saved} className="mk-detail__fav"
            label={saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره این سبک"} onClick={() => { haptic(); toggleFav(style.id); }} /> : null}
          <span className="mk-detail__count" aria-hidden="true">{persian(slide + 1)}/{persian(SLIDES.length)}</span>
          <span className="mk-detail__tag">نمونه هوش مصنوعی</span>
        </div>

        {MAKEUP_CURATED_80 && style.promptNumber ? <div className="mk-curated-save">
          <Button variant="tonal" icon="heart" size="sm"
            onClick={() => { haptic(); toggleFav(style.id); }}>{saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره این سبک"}</Button>
          <span>تصاویر، طرح الهام‌بخش هستند و نمونه‌کار اجرایی سالن نیستند.</span>
        </div> : null}
        <div className="mk-detail__intro">
          <small lang="en">{style.en}</small>
          <h2>{style.title}</h2>
          <p>{style.detail}</p>
          {MAKEUP_CURATED_80 && style.promptNumber ? <p className="mk-detail__source-note">تصویر هوش مصنوعیِ منتخب، برای الهام میکاپ است؛ نمای چشم و لب از همان عکس اصلی برش خورده است، نه نمونه اجرای واقعی سالن.</p> : null}
          <ul className="mk-tags" aria-label="ویژگی‌ها">
            {tagsFor(style).map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
        </div>

        <div className="mk-thumbs" role="group" aria-label="انتخاب تصویر">
          {SLIDES.map((item, index) => (
            <button key={item.size} type="button" aria-pressed={slide === index} aria-label={`نمای ${item.label}`} onClick={() => show(index)}>
              <Media src={lookPhoto(style.id, style.promptNumber ? "sm" : item.size === "full" ? "sm" : item.size)} alt="" loading="lazy" />
            </button>
          ))}
        </div>

        <section className="mk-related" aria-labelledby="mk-related-title">
          <h3 id="mk-related-title">خدمات مرتبط</h3>
          {related.map((service) => {
            const on = picked.includes(service.id);
            return (
              <button key={service.id} type="button" className="mk-related__row" role="checkbox" aria-checked={on}
                onClick={() => { haptic(); setPicked(on ? picked.filter((id) => id !== service.id) : [...picked, service.id]); }}>
                <span className="mk-related__check">{on ? <Icon name="check" size={14} weight="bold" /> : null}</span>
                <span className="mk-related__copy"><strong>{service.title}</strong><small>{formatMinutes(service.minutes)}</small></span>
                <b>{service.price ? `${formatPrice(service.price)} تومان` : "پس از مشاوره"}</b>
              </button>
            );
          })}
        </section>

        <section className="mk-steps" aria-labelledby="mk-steps-title">
          <h3 id="mk-steps-title">جزئیات اجرا</h3>
          <ul>
            {breakdown(style.look).map((row) => (
              <li key={row.key}>
                <span className="mk-swatch" style={{ background: row.color }} aria-hidden="true" />
                <span><strong>{row.label}</strong><small>{row.text}</small></span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mk-sheet__fine">تصویر، نمونه‌ای است که با هوش مصنوعی از مدل لوک‌بوک سالن ساخته شده است. آرتیست رنگ‌ها را با پوست، فرم چهره و مراسم شما تنظیم می‌کند.</p>
      </div>
    </Sheet>
  );
}
