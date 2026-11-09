import { useState } from "react";
import { persian } from "@/data/catalog";
import { ICON_NAMES, Icon } from "../icons";
import { BrandMark, Wordmark } from "../logo";
import { Button, Chip, IconButton, Ornament, PageHead, SectionHead } from "../ui";

/** Living style guide (#/design): renders the tokens and components straight from the stylesheet. */

const COLORS: Array<{ token: string; role: string }> = [
  { token: "canvas", role: "پس‌زمینه" },
  { token: "surface", role: "سطح" },
  { token: "sunken", role: "فرورفته" },
  { token: "ink", role: "متن" },
  { token: "ink-2", role: "متن دوم" },
  { token: "ink-3", role: "متن سوم" },
  { token: "gold", role: "طلایی" },
  { token: "gold-ink", role: "متن طلایی" },
  { token: "champagne", role: "شامپاینی" },
  { token: "rose", role: "رز" },
  { token: "sage", role: "سبز" },
  { token: "garnet", role: "گارنت" },
  { token: "inverse", role: "معکوس" },
  { token: "noir", role: "نوآر" },
];

const TYPE: Array<{ cls: string; label: string; sample: string }> = [
  { cls: "t-display", label: "Display · 200", sample: "زیبایی، به امضای شما" },
  { cls: "t-title-1", label: "Title 1 · 250", sample: "ریچوال‌های امضادار" },
  { cls: "t-title-2", label: "Title 2 · 300", sample: "آرتیست‌های آتلیه" },
  { cls: "t-title-3", label: "Title 3 · 450", sample: "کوپ و فرم‌دهی اختصاصی" },
  { cls: "t-headline", label: "Headline · 520", sample: "بالیاژ و لایت سفارشی" },
  { cls: "t-body", label: "Body · 380", sample: "گفت‌وگوی بی‌عجله درباره فرم چهره و جنس مو." },
  { cls: "t-callout", label: "Callout · 400", sample: "قیمت نهایی پس از بررسی مو اعلام می‌شود." },
  { cls: "t-footnote", label: "Footnote · 400", sample: "۹۸۰ هزار تومان · ۱ ساعت" },
  { cls: "t-caption", label: "Caption · 450", sample: "در انتظار تأیید سالن" },
  { cls: "t-eyebrow", label: "Eyebrow · 550", sample: "منوی آتلیه" },
];

const RADII = ["xs", "sm", "md", "lg", "xl", "2xl"];
const SHADOWS = ["1", "2", "3", "4"];

export function DesignScreen() {
  const [chip, setChip] = useState(0);
  return (
    <div className="grid grid-cols-1 gap-[var(--spacing-section)] pt-2 pb-8">
      <PageHead eyebrow="سیستم طراحی · نسخه ۱" title="زبان بصری" accent="حنانه بیوتی" lead="توکن‌ها، تایپوگرافی، آیکن‌ها و اجزای رابط که همه صفحه‌ها از آن ساخته شده‌اند." />

      <section className="px-gutter">
        <SectionHead eyebrow="۰۱" title="نشان و لوگوتایپ" />
        <div className="card grid justify-items-center gap-4 py-8">
          <BrandMark className="h-20 w-16 text-[2.4rem]" />
          <Wordmark className="text-[2.6rem]" />
        </div>
        <div className="card mt-3 grid justify-items-center gap-4 py-8" data-variant="inverse">
          <BrandMark className="h-20 w-16 text-[2.4rem] text-champagne" />
          <Wordmark className="text-[2.6rem] [&_.wordmark__en]:text-white/55" />
        </div>
      </section>

      <section className="px-gutter">
        <SectionHead eyebrow="۰۲" title="رنگ (OKLCH)" />
        <div className="grid grid-cols-4 gap-3">
          {COLORS.map((color) => (
            <div key={color.token} className="swatch">
              <span style={{ background: `var(--color-${color.token})` }} />
              <strong className="font-medium" dir="ltr">{color.token}</strong>
              <span className="text-ink-2">{color.role}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-gutter">
        <SectionHead eyebrow="۰۳" title="تایپوگرافی" />
        <div className="card grid gap-3">
          <p className="t-caption text-ink-2">فارسی: <strong>استعداد (Estedad)</strong> متغیر · خوشنویسی: <strong>نستعلیق نوتو</strong> · لاتین: <strong lang="en">Bodoni Moda</strong></p>
          <div className="divider" />
          {TYPE.map((item) => (
            <div key={item.cls} className="grid gap-0.5">
              <span className="t-caption text-ink-3" dir="ltr">{item.cls} — {item.label}</span>
              <span className={item.cls}>{item.sample}</span>
            </div>
          ))}
          <div className="grid gap-0.5">
            <span className="t-caption text-ink-3" dir="ltr">t-calligraphy — Nastaliq</span>
            <span className="t-calligraphy text-3xl text-gold-ink">به امضای شما</span>
          </div>
          <div className="grid gap-0.5">
            <span className="t-caption text-ink-3" dir="ltr">t-latin — Bodoni Moda</span>
            <span className="t-latin text-sm">Hananeh Beauty Atelier</span>
          </div>
        </div>
      </section>

      <section className="px-gutter">
        <SectionHead eyebrow="۰۴" title={`آیکن‌ها · ${persian(ICON_NAMES.length)}`} />
        <div className="card grid grid-cols-6 gap-y-5">
          {ICON_NAMES.map((name) => (
            <span key={name} className="grid justify-items-center gap-1 text-center">
              <Icon name={name} size={24} />
              <span className="text-[0.55rem] text-ink-3" dir="ltr">{name}</span>
            </span>
          ))}
        </div>
        <div className="mt-3 flex justify-around">
          {(["thin", "light", "regular", "duotone", "fill"] as const).map((weight) => (
            <span key={weight} className="grid justify-items-center gap-1">
              <Icon name="heart" size={28} weight={weight} className="text-gold-ink" />
              <span className="t-caption text-ink-3" dir="ltr">{weight}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="px-gutter">
        <SectionHead eyebrow="۰۵" title="دکمه‌ها" />
        <div className="grid gap-3">
          <Button variant="gold" orb>درخواست این استایل</Button>
          <div className="flex flex-wrap gap-2">
            <Button icon="book">اصلی</Button>
            <Button variant="secondary">ثانویه</Button>
            <Button variant="tonal">ملایم</Button>
            <Button variant="ghost">متنی</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">کوچک</Button>
            <Button size="lg">بزرگ</Button>
            <Button disabled>غیرفعال</Button>
          </div>
          <div className="flex gap-2">
            <IconButton icon="heart" label="نمونه" />
            <IconButton icon="heart" label="نمونه" pressed love />
            <IconButton icon="compare" label="نمونه" variant="tonal" />
            <IconButton icon="share" label="نمونه" variant="solid" />
          </div>
        </div>
      </section>

      <section>
        <SectionHead eyebrow="۰۶" title="چیپ، نشان و وضعیت" />
        <div className="chip-row">
          {["همه", "موج", "فر", "شینیون"].map((label, index) => (
            <Chip key={label} active={chip === index} onClick={() => setChip(index)}>{label}</Chip>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 px-gutter">
          <span className="badge">محبوب</span>
          <span className="badge" data-tone="rose">ذخیره‌شده</span>
          <span className="badge" data-tone="neutral">۱ ساعت</span>
          <span className="badge" data-tone="outline">متخصص</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 px-gutter">
          <span className="status" data-tone="sage">باز است</span>
          <span className="status" data-tone="gold">در انتظار تأیید</span>
          <span className="status" data-tone="garnet">ارسال نشده</span>
        </div>
      </section>

      <section className="px-gutter">
        <SectionHead eyebrow="۰۷" title="سطوح، شعاع و سایه" />
        <div className="grid grid-cols-3 gap-3">
          {RADII.map((radius) => (
            <span key={radius} className="grid h-16 place-items-center bg-surface text-[0.65rem] text-ink-2 shadow-2" style={{ borderRadius: `var(--radius-${radius})` }} dir="ltr">radius-{radius}</span>
          ))}
          {SHADOWS.map((shadow) => (
            <span key={shadow} className="grid h-16 place-items-center rounded-lg bg-surface text-[0.65rem] text-ink-2" style={{ boxShadow: `var(--shadow-${shadow})` }} dir="ltr">shadow-{shadow}</span>
          ))}
          <span className="glass grid h-16 place-items-center rounded-lg text-[0.65rem]">glass</span>
          <span className="foil grid h-16 place-items-center rounded-lg text-[0.65rem]">foil</span>
        </div>
        <Ornament className="mt-8" />
      </section>
    </div>
  );
}
